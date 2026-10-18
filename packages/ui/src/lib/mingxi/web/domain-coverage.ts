/**
 * 库页领域侧栏：骨干覆盖热力 + Icicle 聚合
 */
import backbone from "../../../data/mingxi/eval/vocab/domain-backbone.json" with { type: "json" };
import { canonicalizeDomainPath } from "../intent/canonicalize-domain.ts";

export type DomainNoteLike = {
  id: string;
  domainPath: string[];
};

export type BackboneL2Cell = {
  l1: string;
  l2: string;
  path: string[];
  count: number;
};

export type BackboneL1Group = {
  l1: string;
  path: string[];
  count: number;
  cells: BackboneL2Cell[];
};

export type BackboneCoverage = {
  groups: BackboneL1Group[];
  noteCount: number;
  filledL2: number;
  totalL2: number;
  /** 相对当前用途笔记总数的最大叶子计数，便于热力归一 */
  maxCount: number;
};

export type IcicleNode = {
  id: string;
  name: string;
  path: string[];
  count: number;
  children: IcicleNode[];
};

const roots = (
  backbone as { roots: Array<{ name: string; children: string[] }> }
).roots;

export function pathKey(path: string[]): string {
  return path.filter(Boolean).join("/");
}

export function noteMatchesDomainPrefix(
  note: DomainNoteLike,
  prefix: string[] | null | undefined,
): boolean {
  if (!prefix?.length) return true;
  const path = canonicalizeDomainPath(note.domainPath || []);
  return prefix.every((seg, i) => path[i] === seg);
}

/** 各前缀路径上的笔记计数（含祖先累加） */
export function countByDomainPrefix(notes: DomainNoteLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const note of notes) {
    const path = canonicalizeDomainPath(note.domainPath || []).filter(Boolean);
    if (!path.length) continue;
    for (let i = 1; i <= path.length; i++) {
      const key = pathKey(path.slice(0, i));
      m.set(key, (m.get(key) || 0) + 1);
    }
  }
  return m;
}

export function backboneCoverage(notes: DomainNoteLike[]): BackboneCoverage {
  const counts = countByDomainPrefix(notes);
  let filledL2 = 0;
  let totalL2 = 0;
  let maxCount = 0;

  const groups: BackboneL1Group[] = roots.map((r) => {
    const l1Count = counts.get(r.name) || 0;
    const cells: BackboneL2Cell[] = r.children.map((l2) => {
      totalL2 += 1;
      const count = counts.get(pathKey([r.name, l2])) || 0;
      if (count > 0) filledL2 += 1;
      if (count > maxCount) maxCount = count;
      return { l1: r.name, l2, path: [r.name, l2], count };
    });
    return {
      l1: r.name,
      path: [r.name],
      count: l1Count,
      cells,
    };
  });

  return {
    groups,
    noteCount: notes.length,
    filledL2,
    totalL2,
    maxCount: Math.max(maxCount, 1),
  };
}

/** 热力强度 0–1（log 压缩，避免头部桶压扁其余） */
export function heatIntensity(count: number, maxCount: number): number {
  if (count <= 0) return 0;
  const t = Math.log1p(count) / Math.log1p(Math.max(maxCount, 1));
  return Math.min(1, Math.max(0.12, t));
}

export function buildIcicleTree(
  notes: DomainNoteLike[],
  opts: { maxDepth?: number } = {},
): IcicleNode {
  const maxDepth = opts.maxDepth ?? 4;
  const root: IcicleNode = {
    id: "root",
    name: "知识领域",
    path: [],
    count: 0,
    children: [],
  };

  function ensure(parent: IcicleNode, name: string, path: string[]): IcicleNode {
    let child = parent.children.find((c) => c.name === name);
    if (!child) {
      child = { id: pathKey(path) || name, name, path, count: 0, children: [] };
      parent.children.push(child);
    }
    return child;
  }

  for (const note of notes) {
    let path = canonicalizeDomainPath(note.domainPath || []).filter(Boolean);
    if (!path.length) path = ["未分类"];
    path = path.slice(0, maxDepth);
    let cur = root;
    root.count += 1;
    path.forEach((seg, i) => {
      cur = ensure(cur, seg, path.slice(0, i + 1));
      cur.count += 1;
    });
  }

  function pruneEmpty(n: IcicleNode) {
    n.children = n.children.filter((c) => c.count > 0);
    n.children.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
    n.children.forEach(pruneEmpty);
  }
  pruneEmpty(root);
  return root;
}

export type IcicleLayoutRect = {
  id: string;
  name: string;
  path: string[];
  count: number;
  depth: number;
  /** 0–1 纵向区间 */
  y0: number;
  y1: number;
  /** 0–1 横向（按深度缩进条带） */
  x0: number;
  x1: number;
};

/**
 * 竖向 Icicle：整列按 L1 占比切分高度；每层向右缩进一列。
 * 只布局有笔记的节点。
 */
export function layoutIcicle(
  tree: IcicleNode,
  opts: { maxDepth?: number; depthCols?: number } = {},
): IcicleLayoutRect[] {
  const maxDepth = opts.maxDepth ?? 3;
  const depthCols = opts.depthCols ?? Math.min(maxDepth, 3);
  const out: IcicleLayoutRect[] = [];
  const total = Math.max(tree.count, 1);

  function walk(node: IcicleNode, depth: number, y0: number, y1: number) {
    if (depth < 1 || depth > maxDepth) return;
    if (node.count <= 0) return;
    const col = Math.min(depth, depthCols) - 1;
    const x0 = col / depthCols;
    const x1 = (col + 1) / depthCols;
    out.push({
      id: node.id,
      name: node.name,
      path: node.path,
      count: node.count,
      depth,
      y0,
      y1,
      x0,
      x1,
    });
    if (depth >= maxDepth || !node.children.length) return;
    let cursor = y0;
    const span = y1 - y0;
    for (const child of node.children) {
      const h = (child.count / Math.max(node.count, 1)) * span;
      walk(child, depth + 1, cursor, cursor + h);
      cursor += h;
    }
  }

  let cursor = 0;
  for (const child of tree.children) {
    const h = child.count / total;
    walk(child, 1, cursor, cursor + h);
    cursor += h;
  }

  return out;
}
