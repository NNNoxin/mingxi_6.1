"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryNote } from "./WebWorkbench";
import { NoteMediaView } from "./NoteMediaView";

export type MapNode = {
  id: string;
  label: string;
  kind: "intent" | "spine" | "branch" | "note" | "action" | "concept";
  noteId?: string;
  purposeLabel?: string;
  done?: boolean;
  parentId?: string;
  /** library=仓库笔记 · web=联网网页 */
  sourceKind?: "library" | "web";
};

export type MapEdge = { from: string; to: string; label?: string };

type Pos = { x: number; y: number };

const POLARITY_LABEL: Record<string, string> = {
  positive_exemplar: "正例",
  negative_caution: "避雷",
  mixed: "正负混合",
  neutral_observe: "中立观察",
};

function enrich(
  raw: MapNode[],
  edges: MapEdge[],
  citations: LibraryNote[],
): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes = raw.map((n) => (n.kind === "concept" ? { ...n, kind: "branch" as const } : n));
  const intent = nodes.find((n) => n.kind === "intent");
  const spine = nodes.filter((n) => n.kind === "spine");
  const branches = nodes.filter((n) => n.kind === "branch");
  let notes = nodes.filter((n) => n.kind === "note" && n.noteId);
  const action = nodes.find((n) => n.kind === "action");
  const outEdges = [...edges];

  if (!branches.length) {
    const seen = new Set<string>();
    citations.forEach((c, i) => {
      const key = c.domainPath[1] || c.purposeLabel || `分支${i + 1}`;
      if (seen.has(key)) return;
      seen.add(key);
      const id = `auto-b-${seen.size}`;
      branches.push({
        id,
        label: key,
        kind: "branch",
        parentId: spine[i % Math.max(spine.length, 1)]?.id || intent?.id,
      });
      outEdges.push({ from: branches[branches.length - 1].parentId || intent!.id, to: id });
    });
  }

  if (notes.length < 4) {
    notes = citations.slice(0, 12).map((c, i) => {
      const isWeb = c.sourceKind === "web" || c.tags?.includes("source:web");
      const webBranch = branches.find((b) => b.sourceKind === "web" || b.id === "branch_web");
      return {
        id: `auto-n-${i}`,
        label: c.title.slice(0, 14),
        kind: "note" as const,
        noteId: c.id,
        purposeLabel: isWeb ? "网络" : c.purposeLabel,
        parentId: isWeb
          ? webBranch?.id || branches[i % Math.max(branches.length, 1)]?.id
          : branches[i % Math.max(branches.length, 1)]?.id,
        done: true,
        sourceKind: (isWeb ? "web" : "library") as "web" | "library",
      };
    });
    notes.forEach((n) => {
      if (n.parentId) outEdges.push({ from: n.parentId, to: n.id });
    });
  }

  const ordered = [intent, ...spine, ...branches, ...notes, action].filter(Boolean) as MapNode[];
  return { nodes: ordered, edges: outEdges };
}

function initialPositions(nodes: MapNode[]): Record<string, Pos> {
  const pos: Record<string, Pos> = {};
  const intent = nodes.find((n) => n.kind === "intent");
  const spine = nodes.filter((n) => n.kind === "spine");
  const branches = nodes.filter((n) => n.kind === "branch");
  const notes = nodes.filter((n) => n.kind === "note");
  const action = nodes.find((n) => n.kind === "action");

  const cx = 420;
  let y = 80;
  if (intent) {
    pos[intent.id] = { x: cx, y };
    y += 110;
  }
  spine.forEach((n, i) => {
    pos[n.id] = { x: cx + (i % 2 === 0 ? -12 : 12), y };
    y += 100;
  });
  if (action) pos[action.id] = { x: cx, y: y + 20 };

  branches.forEach((b, i) => {
    const parent = b.parentId ? pos[b.parentId] : undefined;
    const side = i % 2 === 0 ? -1 : 1;
    const py = parent?.y ?? 220 + i * 40;
    const px = parent?.x ?? cx;
    pos[b.id] = { x: px + side * (210 + (i % 3) * 30), y: py + ((i % 3) - 1) * 36 };
  });

  const byParent = new Map<string, MapNode[]>();
  notes.forEach((n) => {
    const p = n.parentId || "_";
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(n);
  });
  byParent.forEach((list, pid) => {
    const bp = pos[pid] || { x: cx + 260, y: 260 };
    const outward = bp.x >= cx ? 1 : -1;
    list.forEach((n, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      pos[n.id] = {
        x: bp.x + outward * (90 + col * 36 + row * 8),
        y: bp.y + (col - 1) * 28 + row * 34,
      };
    });
  });

  return pos;
}

function curvePath(a: Pos, b: Pos): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  // 柔和三次贝塞尔：垂直主链用竖向控制点，横向分支用侧向控制点
  const vertical = Math.abs(dy) > Math.abs(dx) * 0.85;
  if (vertical) {
    const c = Math.min(90, dist * 0.35);
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + c}, ${b.x} ${b.y - c}, ${b.x} ${b.y}`;
  }
  const c = Math.min(120, dist * 0.4);
  const sx = Math.sign(dx) || 1;
  return `M ${a.x} ${a.y} C ${a.x + sx * c} ${a.y}, ${b.x - sx * c} ${b.y}, ${b.x} ${b.y}`;
}

export function LogicMindMap({
  nodes: rawNodes,
  edges: rawEdges,
  citations,
  onOpenNote,
  lockedIds = [],
  onToggleLock,
  onScopeRegen,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  citations: LibraryNote[];
  onOpenNote: (note: LibraryNote) => void;
  lockedIds?: string[];
  onToggleLock?: (nodeId: string) => void;
  onScopeRegen?: (nodeId: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { nodes, edges } = useMemo(
    () => enrich(rawNodes, rawEdges, citations),
    [rawNodes, rawEdges, citations],
  );

  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [scale, setScale] = useState(1);
  const [hover, setHover] = useState<{ note: LibraryNote; x: number; y: number } | null>(null);
  const [drawerNote, setDrawerNote] = useState<LibraryNote | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoCollapse, setAutoCollapse] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("mwb-note-auto-collapse") !== "0";
    } catch {
      return true;
    }
  });
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const dragNode = useRef<{ id: string; ox: number; oy: number; px: number; py: number } | null>(
    null,
  );
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const layoutKey = useMemo(() => nodes.map((n) => n.id).join("|"), [nodes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPositions(initialPositions(nodes));
      setPan({ x: 40, y: 20 });
      setScale(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  function toggleAutoCollapse() {
    setAutoCollapse((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("mwb-note-auto-collapse", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function onCoverPointerEnter() {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function onCoverPointerLeave() {
    if (!autoCollapse || !drawerNote) return;
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setDrawerNote(null);
      leaveTimer.current = null;
    }, 160);
  }

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const noteById = useMemo(() => {
    const m = new Map<string, LibraryNote>();
    citations.forEach((c) => m.set(c.id, c));
    nodes.forEach((n) => {
      if (n.noteId) {
        const hit = citations.find((c) => c.id === n.noteId);
        if (hit) m.set(n.id, hit);
      }
    });
    return m;
  }, [citations, nodes]);

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    const p = positions[id];
    if (!p) return;
    dragNode.current = {
      id,
      ox: e.clientX,
      oy: e.clientY,
      px: p.x,
      py: p.y,
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSelectedId(id);
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).closest?.("[data-map-node]")) return;
    panDrag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragNode.current) {
      const d = dragNode.current;
      const dx = (e.clientX - d.ox) / scale;
      const dy = (e.clientY - d.oy) / scale;
      setPositions((prev) => ({
        ...prev,
        [d.id]: { x: d.px + dx, y: d.py + dy },
      }));
      return;
    }
    if (panDrag.current) {
      const d = panDrag.current;
      setPan({
        x: d.panX + (e.clientX - d.x),
        y: d.panY + (e.clientY - d.y),
      });
    }
  }

  function onPointerUp() {
    dragNode.current = null;
    panDrag.current = null;
  }

  function scheduleHover(note: LibraryNote, clientX: number, clientY: number) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      const rawX = clientX - (rect?.left || 0) + 12;
      const rawY = clientY - (rect?.top || 0) + 12;
      setHover({
        note,
        x: Math.min(rawX, (rect?.width || 420) - 280),
        y: Math.min(rawY, (rect?.height || 400) - 120),
      });
    }, 360);
  }

  const kindLabel = (k: MapNode["kind"]) =>
    k === "intent" ? "意图" : k === "spine" ? "主链" : k === "branch" ? "分支" : k === "action" ? "成件" : "笔记";

  return (
    <div
      ref={wrapRef}
      className={`mwb-canvas-board ${drawerNote ? "has-cover" : ""}`}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={(e) => {
        if (!e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        setScale((s) => Math.min(1.6, Math.max(0.55, s + (e.deltaY > 0 ? -0.06 : 0.06))));
      }}
    >
      <div className="mwb-canvas-tools">
        <button type="button" onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}>
          +
        </button>
        <button type="button" onClick={() => setScale((s) => Math.max(0.55, s - 0.1))}>
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setPositions(initialPositions(nodes));
            setPan({ x: 40, y: 20 });
            setScale(1);
          }}
        >
          复位
        </button>
        <em>拖节点 · 双击锁定 · 右键局部重生成 · ⌘/Ctrl+滚轮缩放</em>
        <span className="mwb-source-legend" aria-label="来源图例">
          <i className="is-lib" /> 仓库笔记
          <i className="is-web" /> 网络来源
          {lockedIds.length ? <em className="mwb-lock-count">锁 {lockedIds.length}</em> : null}
        </span>
      </div>

      <div
        className="mwb-canvas-world"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        <svg className="mwb-canvas-edges" width={1200} height={900}>
          <defs>
            <marker id="mwb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(60,55,50,0.35)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = positions[e.from];
            const b = positions[e.to];
            if (!a || !b) return null;
            return (
              <path
                key={`${e.from}-${e.to}-${i}`}
                d={curvePath(a, b)}
                className="mwb-curve"
                markerEnd="url(#mwb-arrow)"
              />
            );
          })}
        </svg>

        {nodes.map((n) => {
          const p = positions[n.id];
          if (!p) return null;
          const note = n.noteId ? noteById.get(n.id) || citations.find((c) => c.id === n.noteId) : undefined;
          const isNote = n.kind === "note";
          const sourceKind =
            n.sourceKind ||
            (note?.sourceKind === "web" || note?.tags?.includes("source:web") ? "web" : n.kind === "note" || n.noteId ? "library" : undefined);
          const sourceClass =
            sourceKind === "web" ? "source-web" : sourceKind === "library" ? "source-library" : "";
          const locked = lockedIds.includes(n.id);
          return (
            <div
              key={n.id}
              data-map-node={n.id}
              data-source={sourceKind || ""}
              className={`mwb-map-node kind-${n.kind} ${selectedId === n.id ? "is-on" : ""} ${isNote ? "is-chip" : ""} ${sourceClass}${locked ? " is-locked" : ""}`}
              style={{ left: p.x, top: p.y }}
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
              onMouseEnter={(e) => {
                if (note) scheduleHover(note, e.clientX, e.clientY);
              }}
              onMouseLeave={() => {
                if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                hoverTimer.current = window.setTimeout(() => setHover(null), 100);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (n.id !== "intent" && n.id !== "out") onToggleLock?.(n.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (n.id === "intent") return;
                const rect = wrapRef.current?.getBoundingClientRect();
                setCtxMenu({
                  id: n.id,
                  x: e.clientX - (rect?.left || 0),
                  y: e.clientY - (rect?.top || 0),
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
                setCtxMenu(null);
                if (note) {
                  setHover(null);
                  setDrawerNote(note);
                }
              }}
            >
              {!isNote ? (
                <span className="mwb-map-k">
                  {locked ? "锁·" : ""}
                  {sourceKind === "web" ? "网络" : kindLabel(n.kind)}
                </span>
              ) : null}
              {isNote ? <i className="mwb-chip-bars" /> : <strong>{n.label}</strong>}
              {locked ? <b className="mwb-lock-badge" title="已锁定">锁</b> : null}
              {n.purposeLabel && !isNote ? <em>{n.purposeLabel}</em> : null}
              {isNote && n.purposeLabel ? <em className="chip-p">{n.purposeLabel}</em> : null}
              {isNote && sourceKind === "web" ? <em className="chip-web">网</em> : null}
            </div>
          );
        })}
      </div>

      {ctxMenu ? (
        <div
          className="mwb-node-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onToggleLock?.(ctxMenu.id);
              setCtxMenu(null);
            }}
          >
            {lockedIds.includes(ctxMenu.id) ? "解锁节点" : "锁定节点"}
          </button>
          <button
            type="button"
            onClick={() => {
              onScopeRegen?.(ctxMenu.id);
              setCtxMenu(null);
            }}
          >
            只重生成此分支
          </button>
          <button type="button" onClick={() => setCtxMenu(null)}>
            取消
          </button>
        </div>
      ) : null}

      {hover ? (
        <div
          className="mwb-note-pop"
          style={{
            left: hover.x,
            top: hover.y,
          }}
          onMouseEnter={() => {
            if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            setDrawerNote(hover.note);
            setHover(null);
          }}
        >
          {hover.note.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hover.note.imageUrl} alt="" />
          ) : (
            <div className="mwb-note-pop-ph">{hover.note.modality}</div>
          )}
          <div>
            <strong>{hover.note.title}</strong>
            <span>
              {hover.note.purposeLabel} · {POLARITY_LABEL[hover.note.polarity] || hover.note.polarity}
            </span>
            <p>{hover.note.summary}</p>
          </div>
        </div>
      ) : null}

      <aside
        className={`mwb-note-cover ${drawerNote ? "is-open" : ""}`}
        aria-hidden={!drawerNote}
        onMouseEnter={onCoverPointerEnter}
        onMouseLeave={onCoverPointerLeave}
      >
        {drawerNote ? (
          <div className="mwb-note-cover-inner">
            <header>
              <div>
                <em>{drawerNote.domainPath.join(" / ") || "笔记"}</em>
                <span>
                  {drawerNote.purposeLabel} · {POLARITY_LABEL[drawerNote.polarity] || drawerNote.polarity}
                </span>
              </div>
              <div className="mwb-note-cover-tools">
                <label
                  className={`mwb-auto-collapse${autoCollapse ? " is-on" : ""}`}
                  title="开启后：鼠标移出笔记区，面板自动向右收起回到画布"
                >
                  <input
                    type="checkbox"
                    checked={autoCollapse}
                    onChange={toggleAutoCollapse}
                  />
                  <i aria-hidden />
                  <span>移出收起</span>
                </label>
                <button type="button" onClick={() => setDrawerNote(null)}>
                  返回画布
                </button>
              </div>
            </header>
            <h2>{drawerNote.title}</h2>
            <div className="mwb-doc-callout">
              <strong>AI 主旨</strong>
              <p>{drawerNote.theme || drawerNote.summary}</p>
            </div>
            <NoteMediaView note={drawerNote} />
            <div className="mwb-note-cover-actions">
              <button type="button" className="mwb-drawer-open-full" onClick={() => onOpenNote(drawerNote)}>
                在领域旭日中查看
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
