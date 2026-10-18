import type { DemoEdge, DemoNode } from "./think-replay-types";

export const REPORT_NODE_ID = "summary-report";

export function appendSummaryReportNode(
  nodes: DemoNode[],
  edges: DemoEdge[],
): { nodes: DemoNode[]; edges: DemoEdge[]; reportNode: DemoNode | null } {
  const existing = nodes.find((node) => node.reportAction);
  if (existing) return { nodes, edges, reportNode: existing };
  if (!nodes.length) return { nodes, edges, reportNode: null };

  const outgoingIds = new Set(edges.map((edge) => edge.from));
  const terminalNodes = nodes.filter((node) => !outgoingIds.has(node.id));
  const actions = nodes.filter((node) => node.kind === "action");
  const anchor = actions.at(-1) || terminalNodes.at(-1) || nodes.at(-1)!;
  const maxX = Math.max(...nodes.map((node) => node.x));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const placeRight = maxX < 1430;
  const reportNode: DemoNode = {
    id: REPORT_NODE_ID,
    label: "生成完整报告",
    sub: "点击打开 · 逻辑图、图表与关键结论",
    kind: "action",
    x: placeRight ? maxX + 232 : anchor.x,
    y: placeRight ? anchor.y : maxY + 112,
    badge: "总结报告",
    done: true,
    reportAction: true,
  };
  const reportEdge: DemoEdge = {
    id: `edge-${anchor.id}-${REPORT_NODE_ID}`,
    from: anchor.id,
    to: REPORT_NODE_ID,
    label: "收束",
    tone: "break",
  };

  return {
    nodes: [...nodes, reportNode],
    edges: [...edges, reportEdge],
    reportNode,
  };
}
