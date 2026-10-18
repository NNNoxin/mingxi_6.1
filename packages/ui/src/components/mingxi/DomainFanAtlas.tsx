"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { canonicalizeDomainPath } from "../../lib/mingxi/intent/canonicalize-domain";

export type FanNote = {
  id: string;
  title: string;
  domainPath: string[];
  purposeLabel?: string;
  polarity?: string;
  summary?: string;
};

export type DomainTreeNode = {
  id: string;
  name: string;
  path: string[];
  count: number;
  children: DomainTreeNode[];
  notes: FanNote[];
};

type Laid = {
  id: string;
  node: DomainTreeNode;
  x: number;
  y: number;
  angle: number;
  depth: number;
  parentId?: string;
  isNote?: boolean;
  note?: FanNote;
  labelX: number;
  labelY: number;
  labelText: string;
  labelAnchor: "start" | "middle" | "end";
  labelHidden?: boolean;
  fontSize: number;
};

const W = 1120;
const H = 900;
const CX = W / 2;
const CY = H / 2;
const R_STEP = 72;
const FAN = Math.PI * 2;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const MAX_LABEL_RADIAL_PUSH = 64;
const MAX_LABEL_ANGLE_PUSH = 0.3;

type FanStageSize = { width: number; height: number };
type FanViewBox = { x: number; y: number; width: number; height: number };

function makeResponsiveViewBox({ width, height }: FanStageSize): FanViewBox {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const stageAspect = safeWidth / safeHeight;
  const baseAspect = W / H;

  if (stageAspect >= baseAspect) {
    const viewWidth = H * stageAspect;
    return { x: CX - viewWidth / 2, y: CY - H / 2, width: viewWidth, height: H };
  }

  const viewHeight = W / stageAspect;
  return { x: CX - W / 2, y: CY - viewHeight / 2, width: W, height: viewHeight };
}

export type FanDensity = "compact" | "cozy" | "airy";

const DENSITY_FACTOR: Record<FanDensity, number> = {
  compact: 0.82,
  cozy: 1,
  airy: 1.12,
};

/** 展示层与银标同一套 C1 骨干收敛 */
function normalizePath(path: string[]): string[] {
  return canonicalizeDomainPath(path);
}

export function buildDomainTree(notes: FanNote[]): DomainTreeNode {
  const root: DomainTreeNode = {
    id: "root",
    name: "知识领域",
    path: [],
    count: 0,
    children: [],
    notes: [],
  };

  function ensure(parent: DomainTreeNode, name: string, path: string[]): DomainTreeNode {
    let child = parent.children.find((c) => c.name === name);
    if (!child) {
      child = { id: path.join("/") || name, name, path, count: 0, children: [], notes: [] };
      parent.children.push(child);
    }
    return child;
  }

  for (const note of notes) {
    const path = normalizePath(note.domainPath || []).filter(Boolean);
    if (!path.length) path.push("未分类");
    let cur = root;
    root.count += 1;
    path.forEach((seg, i) => {
      cur = ensure(cur, seg, path.slice(0, i + 1));
      cur.count += 1;
    });
    cur.notes.push(note);
  }

  function sortTree(n: DomainTreeNode) {
    n.children.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
    n.children.forEach(sortTree);
  }
  sortTree(root);
  return root;
}

/** 收集节点下全部笔记（含子孙） */
function collectNotes(n: DomainTreeNode): FanNote[] {
  const seen = new Set<string>();
  const out: FanNote[] = [];
  function walk(node: DomainTreeNode) {
    for (const note of node.notes) {
      if (seen.has(note.id)) continue;
      seen.add(note.id);
      out.push(note);
    }
    node.children.forEach(walk);
  }
  walk(n);
  return out;
}

/** 展示树保留每一级真实领域；标签可以避让隐藏，领域节点不能被折叠。 */
function forDisplay(node: DomainTreeNode): DomainTreeNode {
  return {
    ...node,
    children: node.children.map(forDisplay),
    notes: [...node.notes],
  };
}

function findByPath(root: DomainTreeNode, path: string[]): DomainTreeNode {
  let cur = root;
  for (const seg of path) {
    const next = cur.children.find((c) => c.name === seg);
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

function polar(cx: number, cy: number, r: number, a: number) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function shortLabel(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function estimateLabelBox(text: string, fontSize: number, anchor: "start" | "middle" | "end", x: number, y: number) {
  const w = Math.max(
    12,
    Array.from(text).reduce((sum, char) => {
      const isWide = /[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/.test(char);
      return sum + fontSize * (isWide ? 1 : char === " " ? 0.34 : 0.58);
    }, 0),
  );
  const h = fontSize * 1.25;
  const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { left, top: y - h / 2, right: left + w, bottom: y + h / 2, w, h };
}

function fitScaleForLayout(items: Laid[], viewBox: FanViewBox) {
  let extentX = 24;
  let extentY = 24;

  for (const item of items) {
    const nodePad = item.depth === 0 ? 24 : item.isNote ? 12 : 16;
    extentX = Math.max(extentX, Math.abs(item.x - CX) + nodePad);
    extentY = Math.max(extentY, Math.abs(item.y - CY) + nodePad);
    if (item.labelHidden) continue;
    const box = estimateLabelBox(
      item.labelText,
      item.fontSize,
      item.labelAnchor,
      item.labelX,
      item.labelY,
    );
    extentX = Math.max(extentX, Math.abs(box.left - CX), Math.abs(box.right - CX));
    extentY = Math.max(extentY, Math.abs(box.top - CY), Math.abs(box.bottom - CY));
  }

  const availableHalfWidth = Math.max(40, viewBox.width / 2 - 44);
  const availableHalfHeight = Math.max(40, viewBox.height / 2 - 44);
  return Math.min(
    1.35,
    Math.max(
      MIN_SCALE,
      Math.min(availableHalfWidth / extentX, availableHalfHeight / extentY),
    ),
  );
}

function boxesOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  pad = 3,
) {
  return !(a.right + pad < b.left || b.right + pad < a.left || a.bottom + pad < b.top || b.bottom + pad < a.top);
}

/** 文字避让：沿径向/切向微调标签，仍重叠则标记隐藏（悬停再显） */
function resolveLabelCollisions(items: Laid[]): Laid[] {
  const next = items.map((l) => ({ ...l }));
  const radialBoost = new Map<string, number>();
  const angBoost = new Map<string, number>();

  for (let iter = 0; iter < 28; iter++) {
    let moved = false;
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const A = next[i];
        const B = next[j];
        if (A.labelHidden || B.labelHidden) continue;
        const boxA = estimateLabelBox(A.labelText, A.fontSize, A.labelAnchor, A.labelX, A.labelY);
        const boxB = estimateLabelBox(B.labelText, B.fontSize, B.labelAnchor, B.labelX, B.labelY);
        if (!boxesOverlap(boxA, boxB)) continue;
        moved = true;
        const pushA = A.isNote || A.depth >= B.depth ? 1 : 0.45;
        const pushB = B.isNote || B.depth >= A.depth ? 1 : 0.45;
        radialBoost.set(
          A.id,
          Math.min(MAX_LABEL_RADIAL_PUSH, (radialBoost.get(A.id) || 0) + 4 * pushA),
        );
        radialBoost.set(
          B.id,
          Math.min(MAX_LABEL_RADIAL_PUSH, (radialBoost.get(B.id) || 0) + 4 * pushB),
        );
        const side = Math.sin(A.angle - B.angle) >= 0 ? 1 : -1;
        angBoost.set(
          A.id,
          Math.max(
            -MAX_LABEL_ANGLE_PUSH,
            Math.min(MAX_LABEL_ANGLE_PUSH, (angBoost.get(A.id) || 0) + 0.03 * pushA * side),
          ),
        );
        angBoost.set(
          B.id,
          Math.max(
            -MAX_LABEL_ANGLE_PUSH,
            Math.min(MAX_LABEL_ANGLE_PUSH, (angBoost.get(B.id) || 0) - 0.03 * pushB * side),
          ),
        );
      }
    }
    for (const l of next) {
      const labelBase = (l.isNote ? 14 : 13) + (radialBoost.get(l.id) || 0);
      const ang = l.angle + (angBoost.get(l.id) || 0);
      if (l.depth === 0) {
        l.labelX = l.x;
        l.labelY = l.y - 22 - (radialBoost.get(l.id) || 0) * 0.3;
        l.labelAnchor = "middle";
      } else {
        l.labelX = l.x + Math.cos(ang) * labelBase;
        l.labelY = l.y + Math.sin(ang) * labelBase;
        l.labelAnchor =
          Math.cos(ang) >= 0.08 ? "start" : Math.cos(ang) <= -0.08 ? "end" : "middle";
      }
    }
    if (!moved) break;
  }

  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const A = next[i];
      const B = next[j];
      if (A.labelHidden || B.labelHidden) continue;
      const boxA = estimateLabelBox(A.labelText, A.fontSize, A.labelAnchor, A.labelX, A.labelY);
      const boxB = estimateLabelBox(B.labelText, B.fontSize, B.labelAnchor, B.labelX, B.labelY);
      if (!boxesOverlap(boxA, boxB, 1)) continue;
      if (A.isNote && !B.isNote) A.labelHidden = true;
      else if (B.isNote && !A.isNote) B.labelHidden = true;
      else if (A.isNote && B.isNote) {
        if (A.depth >= B.depth) A.labelHidden = true;
        else B.labelHidden = true;
      } else if (A.depth > B.depth) A.labelHidden = true;
      else B.labelHidden = true;
    }
  }
  return next;
}

function layoutFocused(
  focus: DomainTreeNode,
  rotation: number,
  maxRelDepth: number,
  cx: number,
  cy: number,
  rStep: number,
  opts: { showNotes: boolean },
): Laid[] {
  const out: Laid[] = [];
  const placedNoteIds = new Set<string>();
  const aMid = -Math.PI / 2 + rotation;
  const a0 = aMid - FAN / 2;
  const a1 = aMid + FAN / 2;

  function makeLabelFields(
    name: string,
    isNote: boolean,
    depth: number,
    x: number,
    y: number,
    angle: number,
    nCount: number,
  ) {
    const fontSize = isNote ? 10 : depth === 0 ? 14 : depth === 1 ? 12 : 11;
    const maxLen = isNote ? 12 : depth <= 1 ? 10 : 9;
    const labelText =
      depth === 0
        ? name
        : isNote
          ? shortLabel(name, maxLen)
          : nCount > 0
            ? `${shortLabel(name, maxLen)} ·${nCount}`
            : shortLabel(name, maxLen);
    const labelR = isNote ? 14 : 13;
    const labelX = depth === 0 ? x : x + Math.cos(angle) * labelR;
    const labelY = depth === 0 ? y - 22 : y + Math.sin(angle) * labelR;
    const labelAnchor: "start" | "middle" | "end" =
      depth === 0
        ? "middle"
        : Math.cos(angle) >= 0.08
          ? "start"
          : Math.cos(angle) <= -0.08
            ? "end"
            : "middle";
    return { labelText, labelX, labelY, labelAnchor, fontSize };
  }

  function placeNotes(
    notes: FanNote[],
    start: number,
    end: number,
    depth: number,
    parentId: string,
    parentPath: string[],
  ) {
    if (!opts.showNotes || !notes.length) return;
    const unique = notes.filter((n) => {
      if (placedNoteIds.has(n.id)) return false;
      placedNoteIds.add(n.id);
      return true;
    });
    if (!unique.length) return;

    const span = Math.max(end - start, 0.08);
    const minSep = 0.1;
    const perRing = Math.max(1, Math.floor(span / minSep));
    unique.forEach((note, i) => {
      const ring = Math.floor(i / perRing);
      const slot = i % perRing;
      const ringSize = Math.min(perRing, unique.length - ring * perRing);
      const t = ringSize === 1 ? 0.5 : (slot + 0.5) / ringSize;
      const am = start + span * Math.min(0.98, Math.max(0.02, t));
      const nr = 36 + (depth + 1) * rStep + ring * (rStep * 0.42);
      const np = polar(cx, cy, nr, am);
      const label = makeLabelFields(note.title, true, depth + 1, np.x, np.y, am, 0);
      out.push({
        id: `note:${note.id}`,
        node: {
          id: `note:${note.id}`,
          name: note.title,
          path: [...parentPath, note.title],
          count: 1,
          children: [],
          notes: [note],
        },
        x: np.x,
        y: np.y,
        angle: am,
        depth: depth + 1,
        parentId,
        isNote: true,
        note,
        ...label,
      });
    });
  }

  function walk(
    node: DomainTreeNode,
    start: number,
    end: number,
    depth: number,
    parentId?: string,
  ) {
    const mid = (start + end) / 2;
    const r = depth === 0 ? 0 : 36 + depth * rStep;
    const p = polar(cx, cy, r, mid);
    const id = `dom:${node.path.join("/") || node.id}`;
    if (out.some((l) => l.id === id)) return;

    const nCount = collectNotes(node).length;
    const label = makeLabelFields(node.name, false, depth, p.x, p.y, mid, nCount);
    out.push({ id, node, x: p.x, y: p.y, angle: mid, depth, parentId, ...label });

    const kids = node.children;
    const atCap = depth >= maxRelDepth;

    if (atCap || !kids.length) {
      placeNotes(collectNotes(node), start, end, depth, id, node.path);
      return;
    }

    const childNoteIds = new Set<string>();
    for (const c of kids) {
      for (const n of collectNotes(c)) childNoteIds.add(n.id);
    }
    const ownOnly = node.notes.filter((n) => !childNoteIds.has(n.id));

    const units: Array<{ kind: "dom" | "notes"; child?: DomainTreeNode; notes?: FanNote[]; weight: number }> =
      [
        ...kids.map((c) => ({
          kind: "dom" as const,
          child: c,
          // 大分支仍更宽，但小领域不会被工程类笔记挤成不可点击的细缝。
          weight: 0.8 + Math.sqrt(Math.max(c.count, collectNotes(c).length, 1)),
        })),
      ];
    if (ownOnly.length && depth + 1 <= maxRelDepth) {
      units.push({
        kind: "notes",
        notes: ownOnly,
        weight: 0.8 + Math.sqrt(Math.max(ownOnly.length, 1)),
      });
    }

    const total = units.reduce((s, u) => s + u.weight, 0);
    let cursor = start;
    for (const u of units) {
      const spanW = ((end - start) * u.weight) / total;
      if (u.kind === "dom" && u.child) {
        walk(u.child, cursor, cursor + spanW, depth + 1, id);
      } else if (u.notes) {
        placeNotes(u.notes, cursor, cursor + spanW, depth, id, node.path);
      }
      cursor += spanW;
    }
  }

  walk(focus, a0, a1, 0);
  return resolveLabelCollisions(out);
}

export function DomainFanAtlas({
  notes,
  selectedNoteId,
  onSelectNote,
  onSelectDomain,
  onClearNote,
}: {
  notes: FanNote[];
  selectedNoteId?: string;
  onSelectNote: (note: FanNote) => void;
  onSelectDomain?: (path: string[], domainNotes: FanNote[]) => void;
  onClearNote?: () => void;
}) {
  const rawTree = useMemo(() => buildDomainTree(notes), [notes]);
  const tree = useMemo(() => forDisplay(rawTree), [rawTree]);

  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [expandAll, setExpandAll] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [stageSize, setStageSize] = useState<FanStageSize>({ width: W, height: H });
  const [density, setDensity] = useState<FanDensity>("cozy");
  const [showNotes, setShowNotes] = useState(true);
  const [gestureMode, setGestureMode] = useState<"rotate" | "pan">("rotate");
  const [hoverId, setHoverId] = useState<string>();
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragPan = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const dragRot = useRef<{
    ang0: number;
    rot0: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    dist: number;
    scale: number;
    angle: number;
    rotation: number;
  } | null>(null);
  const panRef = useRef(pan);
  const scaleRef = useRef(scale);

  useEffect(() => {
    panRef.current = pan;
    scaleRef.current = scale;
  }, [pan, scale]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const syncSize = (width: number, height: number) => {
      if (width < 1 || height < 1) return;
      setStageSize((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      );
    };
    const rect = stage.getBoundingClientRect();
    syncSize(rect.width, rect.height);
    const observer = new ResizeObserver(([entry]) => {
      syncSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const focusRaw = useMemo(() => findByPath(tree, focusPath), [tree, focusPath]);
  // 根后四层真实领域 + 最外圈明确笔记叶；任何层级都不再被展示层折叠。
  const maxRelDepth = 5;
  const focus = expandAll ? tree : focusRaw;
  const dens = DENSITY_FACTOR[density];
  const rStep = R_STEP * dens;
  const viewBox = useMemo(() => makeResponsiveViewBox(stageSize), [stageSize]);

  const laid = useMemo(
    () => layoutFocused(focus, rotation, maxRelDepth, CX, CY, rStep, { showNotes }),
    [focus, rotation, maxRelDepth, rStep, showNotes],
  );
  const byId = useMemo(() => new Map(laid.map((l) => [l.id, l])), [laid]);
  const activeNodeId = selectedNoteId ? `note:${selectedNoteId}` : hoverId;
  const activePathIds = useMemo(() => {
    const ids = new Set<string>();
    let current = activeNodeId ? byId.get(activeNodeId) : undefined;
    while (current) {
      ids.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return ids;
  }, [activeNodeId, byId]);

  /** 舞台坐标 → 相对扇心的角度 */
  function pointerAngle(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (svg && ctm) {
      try {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const local = point.matrixTransform(ctm.inverse());
        return Math.atan2(local.y - CY, local.x - CX);
      } catch {
        // 极少数浏览器在元素换栏瞬间拿不到可逆 CTM，继续使用下面的安全回退。
      }
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const centerX = rect.left + rect.width / 2 + panRef.current.x;
    const centerY = rect.top + rect.height / 2 + panRef.current.y;
    return Math.atan2(clientY - centerY, clientX - centerX);
  }

  function applyZoom(nextScale: number) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    scaleRef.current = clamped;
    setScale(clamped);
  }

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      applyZoom(scaleRef.current * factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function drillTo(node: DomainTreeNode) {
    if (!node.path.length) {
      openOverview();
      return;
    }
    const notesHere = collectNotes(node);
    setExpandAll(false);
    setFocusPath(node.path);
    onSelectDomain?.(node.path, notesHere);
  }

  function goUp() {
    if (!focusPath.length) return;
    const nextPath = focusPath.slice(0, -1);
    if (!nextPath.length) {
      setExpandAll(true);
      setFocusPath([]);
      onSelectDomain?.([], notes);
      return;
    }
    setFocusPath(nextPath);
    const nextNode = findByPath(tree, nextPath);
    onSelectDomain?.(nextPath, collectNotes(nextNode));
  }

  function fitView() {
    setPan({ x: 0, y: 0 });
    applyZoom(fitScaleForLayout(laid, viewBox));
  }

  function openOverview() {
    setExpandAll(true);
    setFocusPath([]);
    setPan({ x: 0, y: 0 });
    applyZoom(1);
    setRotation(0);
    onSelectDomain?.([], notes);
  }

  function activateLaid(l: Laid) {
    if (l.isNote && l.note) {
      onSelectNote(l.note);
      return;
    }
    drillTo(l.node);
  }

  return (
    <div className="mwb-fan">
      <div className="mwb-fan-toolbar" data-tour="atlas-toolbar">
        <div className="mwb-fan-crumb">
          <button
            type="button"
            className="mwb-fan-root"
            onClick={openOverview}
          >
            全域总览
          </button>
          {!expandAll &&
            focusPath.map((seg, i) => (
              <button
                key={`${seg}-${i}`}
                type="button"
                onClick={() => {
                  const nextPath = focusPath.slice(0, i + 1);
                  const nextNode = findByPath(tree, nextPath);
                  setFocusPath(nextPath);
                  onSelectDomain?.(nextPath, collectNotes(nextNode));
                }}
              >
                / {seg}
              </button>
            ))}
          <span className="mwb-fan-mode">
            · {expandAll ? "完整 5 层" : `聚焦第 ${focusPath.length} 层`} · {laid.length} 个节点
          </span>
        </div>
        <div className="mwb-fan-actions">
          <div className="mwb-fan-mode-switch" aria-label="画布拖动模式" data-tour="atlas-mode">
            <button
              type="button"
              className={gestureMode === "rotate" ? "is-on" : ""}
              aria-pressed={gestureMode === "rotate"}
              onClick={() => setGestureMode("rotate")}
            >
              旋转
            </button>
            <button
              type="button"
              className={gestureMode === "pan" ? "is-on" : ""}
              aria-pressed={gestureMode === "pan"}
              onClick={() => setGestureMode("pan")}
            >
              平移
            </button>
          </div>
          <div className="mwb-fan-zoom" data-tour="atlas-zoom">
            <button type="button" title="向左旋转" onClick={() => setRotation((r) => r - Math.PI / 18)}>
              ↺
            </button>
            <button type="button" title="缩小" onClick={() => applyZoom(scaleRef.current * 0.9)}>
              −
            </button>
            <em>{Math.round(scale * 100)}%</em>
            <button
              type="button"
              title="放大"
              data-tour="atlas-zoom-in"
              onClick={() => applyZoom(scaleRef.current * 1.1)}
            >
              +
            </button>
            <button
              type="button"
              title="向右旋转"
              data-tour="atlas-rotate-right"
              onClick={() => setRotation((r) => r + Math.PI / 18)}
            >
              ↻
            </button>
            <button
              type="button"
              className="is-wide"
              title="适应当前图"
              data-tour="atlas-fit"
              onClick={fitView}
            >
              适应
            </button>
          </div>
          <select
            className="mwb-fan-select"
            data-tour="atlas-density"
            value={density}
            title="疏密"
            onChange={(e) => setDensity(e.target.value as FanDensity)}
          >
            <option value="compact">紧凑</option>
            <option value="cozy">适中</option>
            <option value="airy">疏朗</option>
          </select>
          <button
            type="button"
            className={`mwb-fan-expand ${showNotes ? "is-on" : ""}`}
            data-tour="atlas-notes"
            title="显示/隐藏笔记节点"
            onClick={() => setShowNotes((v) => !v)}
          >
            {showNotes ? "笔记开" : "笔记关"}
          </button>
          <button type="button" className={`mwb-fan-expand ${expandAll ? "is-on" : ""}`} onClick={openOverview}>
            总览 / 复位
          </button>
        </div>
      </div>

      {!expandAll && focusPath.length ? (
        <button type="button" className="mwb-fan-up" onClick={goUp}>
          ← 返回上一层
        </button>
      ) : null}

      <div
        ref={stageRef}
        className={`mwb-fan-stage is-${gestureMode}`}
        data-tour="atlas-canvas"
        tabIndex={0}
        aria-label="领域旭日全屏画布。中心锁定，滚轮缩放，切换旋转或平移模式后拖动空白区域。"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setRotation((r) => r - Math.PI / 24);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setRotation((r) => r + Math.PI / 24);
          } else if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            applyZoom(scaleRef.current * 1.1);
          } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            applyZoom(scaleRef.current * 0.9);
          } else if (e.key === "0") {
            e.preventDefault();
            openOverview();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (selectedNoteId) onClearNote?.();
            else goUp();
          }
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest?.("[data-fan-node]")) return;
          const shouldRotate =
            e.shiftKey || e.altKey || e.button === 1 || gestureMode === "rotate";
          if (shouldRotate) {
            dragRot.current = {
              ang0: pointerAngle(e.clientX, e.clientY),
              rot0: rotation,
              moved: false,
            };
          } else {
            dragPan.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
          }
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragRot.current) {
            const ang = pointerAngle(e.clientX, e.clientY);
            const dAng = ang - dragRot.current.ang0;
            if (Math.abs(dAng) > 0.02) dragRot.current.moved = true;
            setRotation(dragRot.current.rot0 + dAng);
            return;
          }
          if (dragPan.current) {
            const d = dragPan.current;
            setPan({
              x: d.panX + (e.clientX - d.x),
              y: d.panY + (e.clientY - d.y),
            });
          }
        }}
        onPointerUp={() => {
          dragPan.current = null;
          dragRot.current = null;
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const [a, b] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
            pinchRef.current = {
              dist,
              scale: scaleRef.current,
              angle,
              rotation,
            };
            dragPan.current = null;
            dragRot.current = null;
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchRef.current) {
            e.preventDefault();
            const [a, b] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const next = pinchRef.current.scale * (dist / Math.max(pinchRef.current.dist, 1));
            const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
            const delta = Math.atan2(
              Math.sin(angle - pinchRef.current.angle),
              Math.cos(angle - pinchRef.current.angle),
            );
            setRotation(pinchRef.current.rotation + delta);
            applyZoom(next);
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length < 2) pinchRef.current = null;
        }}
      >
        <div
          className="mwb-fan-world"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          <svg
            ref={svgRef}
            key={`${focusPath.join("/")}:${expandAll ? "all" : "focus"}`}
            className="mwb-fan-svg is-entering"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label="知识领域完整五层旭日目录"
          >
          <g aria-hidden="true" style={{ pointerEvents: "none" }}>
            {Array.from({ length: 5 }, (_, index) => {
              const ring = index + 1;
              const radius = 36 + ring * rStep;
              return (
                <g key={`ring-${ring}`}>
                  <circle
                    cx={CX}
                    cy={CY}
                    r={radius}
                    fill="none"
                    stroke="#b9aa9c"
                    strokeOpacity={ring === 5 ? 0.34 : 0.22}
                    strokeDasharray={ring === 5 ? undefined : "3 7"}
                    strokeWidth={ring === 5 ? 1.2 : 0.8}
                  />
                  <text
                    x={CX + 7}
                    y={CY - radius + 12}
                    fill="#96887b"
                    fontSize={9}
                    letterSpacing="0.08em"
                  >
                    {ring === 5
                      ? "具体笔记"
                      : ring === 4
                        ? "L4 / 笔记"
                        : `L${ring}`}
                  </text>
                </g>
              );
            })}
          </g>

          {laid.map((l) => {
            if (!l.parentId) return null;
            const parent = byId.get(l.parentId);
            if (!parent) return null;
            const isActiveEdge = activePathIds.has(l.id) && activePathIds.has(parent.id);
            const hasActivePath = activePathIds.size > 0;
            return (
              <line
                key={`e-${l.id}`}
                x1={parent.x}
                y1={parent.y}
                x2={l.x}
                y2={l.y}
                stroke={isActiveEdge ? "#b9634c" : "#b7aa9d"}
                strokeOpacity={hasActivePath ? (isActiveEdge ? 0.95 : 0.16) : 0.52}
                strokeWidth={isActiveEdge ? 2.6 : l.isNote ? 1 : 1.35}
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {laid.map((l) => {
            const selected =
              (l.isNote && l.note?.id === selectedNoteId) || hoverId === l.id;
            const r = l.depth === 0 ? 18 : l.isNote ? 6.5 : Math.max(6.5, 10 - l.depth * 0.55);
            const showLabel = !l.labelHidden || hoverId === l.id || selected;
            const inActivePath = activePathIds.has(l.id);
            const hasActivePath = activePathIds.size > 0;
            const domainFill =
              l.depth === 0
                ? "#1c1a17"
                : ["#c98974", "#dcae9d", "#e8cfc4", "#b9c8b7", "#d9d2c5"][
                    Math.min(l.depth - 1, 4)
                  ];

            return (
              <g
                key={l.id}
                className="mwb-fan-node"
                data-fan-node={l.id}
                role="button"
                tabIndex={0}
                aria-label={
                  l.isNote && l.note
                    ? `具体笔记，第 ${l.depth} 层：${l.note.title}`
                    : `${l.depth === 0 ? "总领域" : `第 ${l.depth} 层领域`}：${l.node.name}，${collectNotes(l.node).length} 篇笔记`
                }
                style={{
                  cursor: "pointer",
                  opacity: hasActivePath && !inActivePath ? 0.28 : 1,
                }}
                onMouseEnter={() => setHoverId(l.id)}
                onMouseLeave={() => setHoverId(undefined)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  activateLaid(l);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    activateLaid(l);
                  }
                }}
              >
                <circle cx={l.x} cy={l.y} r={Math.max(r + 10, 16)} fill="transparent" />
                <circle
                  cx={l.x}
                  cy={l.y}
                  r={selected ? r + 2 : r}
                  fill={l.isNote ? (selected ? "#e5f0e9" : "#fffdf9") : domainFill}
                  stroke={selected || inActivePath ? (l.isNote ? "#2f7d57" : "#9e5644") : "#8e8175"}
                  strokeWidth={selected ? 2.4 : inActivePath ? 1.8 : 0.9}
                />
                {showLabel ? (
                  <text
                    x={l.labelX}
                    y={l.labelY}
                    textAnchor={l.labelAnchor}
                    dominantBaseline="middle"
                    fill={selected ? "#7e3f31" : l.isNote ? "#514b44" : "#2a2723"}
                    fontSize={l.fontSize}
                    fontWeight={l.depth <= 1 && !l.isNote ? 700 : 500}
                    style={{ pointerEvents: "none" }}
                  >
                    {l.labelText}
                  </text>
                ) : null}
                {l.depth === 0 ? (
                  <text
                    x={l.x}
                    y={l.y + 4}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.78)"
                    fontSize={10}
                    style={{ pointerEvents: "none" }}
                  >
                    {expandAll ? `${notes.length} 篇` : `${l.node.children.length} 类`}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        </div>
      </div>

      <div className="mwb-fan-hint">
        中心锁定 · 拖曳旋转 · 滚轮缩放 · 领域只负责下钻，点击终端白色笔记节点进入左右分屏
      </div>
    </div>
  );
}
