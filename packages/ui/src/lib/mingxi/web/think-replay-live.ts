import type { DemoEdge, DemoNode } from "./think-replay-types";

type Pos = { x: number; y: number };

const NODE_WIDTH: Record<DemoNode["kind"], number> = {
  intent: 200,
  spine: 188,
  branch: 176,
  note: 156,
  action: 200,
  gate: 188,
};
const NODE_HEIGHT = 64;

/**
 * 给回忆脚本和实机 Agent 共用的分层排版。
 * 每次逻辑图发生变化都重新按层分栏，并做一次碰撞消解，避免沿用
 * 脚本坐标或服务端坐标造成节点重叠。
 */
export function layoutDemoGraph(
  rawNodes: DemoNode[],
  rawEdges: DemoEdge[],
): { nodes: DemoNode[]; edges: DemoEdge[] } {
  const nodes = [...new Map(rawNodes.map((node) => [node.id, node])).values()];
  const ids = new Set(nodes.map((node) => node.id));
  const edges = rawEdges.filter(
    (edge) => ids.has(edge.from) && ids.has(edge.to),
  );
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  nodes.forEach((node) => incoming.set(node.id, 0));
  edges.forEach((edge) => {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
  });

  const roots = nodes.filter(
    (node) => node.kind === "intent" || (incoming.get(node.id) || 0) === 0,
  );
  const level = new Map<string, number>();
  const queue = (roots.length ? roots : nodes.slice(0, 1)).map((node) => node.id);
  queue.forEach((id) => level.set(id, 0));
  let cursor = 0;
  while (cursor < queue.length) {
    const from = queue[cursor++];
    const next = Math.min(7, (level.get(from) || 0) + 1);
    for (const to of outgoing.get(from) || []) {
      if (!level.has(to) || next > (level.get(to) || 0)) level.set(to, next);
      if (!queue.includes(to)) queue.push(to);
    }
  }
  nodes.forEach((node) => {
    if (!level.has(node.id)) level.set(node.id, 0);
  });

  // 用接近方形的网格承载分层结果：先按逻辑深度排序，再将深度
  // 尽量均匀地分配到 2～5 列，避免长链被摊成一条横向“蛇”。
  const position = new Map<string, Pos>();
  const maxLevel = Math.max(0, ...nodes.map((node) => level.get(node.id) || 0));
  const columnCount =
    nodes.length <= 1
      ? 1
      : Math.min(5, Math.max(2, Math.ceil(Math.sqrt(nodes.length * 0.65))));
  const rowTarget = Math.ceil(nodes.length / columnCount);
  const buckets: DemoNode[][] = Array.from({ length: columnCount }, () => []);
  const ordered = [...nodes].sort((a, b) => {
    const levelDiff = (level.get(a.id) || 0) - (level.get(b.id) || 0);
    return levelDiff || a.id.localeCompare(b.id);
  });
  ordered.forEach((node) => {
    const preferred = maxLevel
      ? Math.round(((level.get(node.id) || 0) / maxLevel) * (columnCount - 1))
      : 0;
    const candidates = buckets
      .map((bucket, index) => ({ bucket, index }))
      .filter(({ bucket, index }) => bucket.length < rowTarget || index === columnCount - 1)
      .sort((a, b) => {
        const distance = Math.abs(a.index - preferred) - Math.abs(b.index - preferred);
        return distance || a.bucket.length - b.bucket.length;
      });
    const target = candidates[0] || { bucket: buckets[columnCount - 1], index: columnCount - 1 };
    target.bucket.push(node);
    position.set(node.id, {
      x: 80 + target.index * 252,
      y: 74 + (target.bucket.length - 1) * 104,
    });
  });

  // 保护不同层级因宽度不同而产生的边界碰撞。
  const laidOut = nodes.map((node) => ({
    ...node,
    ...(position.get(node.id) || { x: 80, y: 74 }),
  }));
  for (let pass = 0; pass < 3; pass += 1) {
    const ordered = [...laidOut].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < ordered.length; i += 1) {
      const current = ordered[i];
      for (let j = 0; j < i; j += 1) {
        const previous = ordered[j];
        const overlapX =
          current.x < previous.x + NODE_WIDTH[previous.kind] + 24 &&
          current.x + NODE_WIDTH[current.kind] + 24 > previous.x;
        const overlapY =
          current.y < previous.y + NODE_HEIGHT + 24 &&
          current.y + NODE_HEIGHT + 24 > previous.y;
        if (overlapX && overlapY) {
          current.y = previous.y + NODE_HEIGHT + 36;
        }
      }
    }
  }

  return { nodes: laidOut, edges };
}

export type ThinkApiCitation = {
  id: string;
  title?: string;
  summary?: string;
  purposeLabel?: string;
  sourceUri?: string;
  sourceKind?: "library" | "web";
  tags?: string[];
};

export type ThinkApiNode = {
  id: string;
  label: string;
  kind: "intent" | "spine" | "branch" | "note" | "action" | "concept";
  noteId?: string;
  purposeLabel?: string;
  done?: boolean;
  sourceKind?: "library" | "web";
};

export type ThinkApiEdge = {
  from: string;
  to: string;
  label?: string;
};

export type ThinkApiResponse = {
  ok?: boolean;
  error?: string;
  clarifyingQuestion?: string;
  answer?: string;
  citations?: ThinkApiCitation[];
  logicLine?: { nodes?: ThinkApiNode[]; edges?: ThinkApiEdge[] };
  sessionId?: string;
  webSearchUsed?: boolean;
};

const NODE_KIND_BADGE: Record<DemoNode["kind"], string> = {
  intent: "意图",
  spine: "主链",
  branch: "分支",
  note: "本库笔记",
  action: "行动",
  gate: "检查点",
};

function hostnameOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function compactLabel(value: string, max = 18): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 将 Agent 返回的无坐标逻辑图铺成可拖拽的 Converse 画布。 */
export function layoutThinkGraph(
  rawNodes: ThinkApiNode[],
  rawEdges: ThinkApiEdge[],
  citations: ThinkApiCitation[],
): { nodes: DemoNode[]; edges: DemoEdge[] } {
  const citationById = new Map(citations.map((citation) => [citation.id, citation]));
  const uniqueNodes = [...new Map(rawNodes.map((node) => [node.id, node])).values()];
  const nodeIds = new Set(uniqueNodes.map((node) => node.id));
  const seenEdges = new Set<string>();
  const uniqueEdges = rawEdges.filter((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return false;
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.label || ""}`;
    if (seenEdges.has(key)) return false;
    seenEdges.add(key);
    return true;
  });
  const nodes: DemoNode[] = uniqueNodes.map((node) => {
    const citation = node.noteId ? citationById.get(node.noteId) : undefined;
    const isWeb =
      node.sourceKind === "web" ||
      citation?.sourceKind === "web" ||
      citation?.tags?.includes("source:web");
    const sourceKind = isWeb
      ? "web"
      : node.noteId || node.sourceKind === "library"
        ? "library"
        : undefined;
    const kind: DemoNode["kind"] = node.kind === "concept" ? "branch" : node.kind;
    const sourceUrl =
      isWeb && citation?.sourceUri?.startsWith("http") ? citation.sourceUri : undefined;
    const summary = citation?.summary?.trim();

    return {
      id: node.id,
      label: compactLabel(citation?.title || node.label),
      sub: isWeb
        ? hostnameOf(sourceUrl) || summary?.slice(0, 54) || "公开网页"
        : node.purposeLabel || citation?.purposeLabel || summary?.slice(0, 54),
      kind,
      x: 0,
      y: 0,
      badge: isWeb ? "网页结果" : NODE_KIND_BADGE[kind],
      done: node.done,
      noteId: node.noteId,
      sourceKind,
      sourceUrl,
      sourceTitle: citation?.title || node.label,
      sourceSummary: summary,
      sourceTags: citation?.tags,
    };
  });

  return layoutDemoGraph(nodes, uniqueEdges.map((edge, index) => ({
      id: `live-edge-${index}-${edge.from}-${edge.to}`,
      from: edge.from,
      to: edge.to,
      label: edge.label,
    })));
}
