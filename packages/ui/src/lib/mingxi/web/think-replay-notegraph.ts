/**
 * 明晰 Demo 5.0 · NoteGraph 人机共编案例
 *
 * 仅复用 NoteGraph 的产品能力叙事：图是可编辑投影、人工编辑优先、
 * 下一轮会吸收人的移动/改名/补线。视觉和交互壳完全沿用明晰。
 */
import type { DemoEdge, DemoNode, DemoStep } from "./think-replay-types.ts";

function edge(
  id: string,
  from: string,
  to: string,
  label?: string,
  tone?: DemoEdge["tone"],
): DemoEdge {
  return { id, from, to, label, tone };
}

const BASE_NODES: DemoNode[] = [
  {
    id: "ng-intent",
    label: "Agent Systems 人机共编",
    sub: "14 篇研究笔记 · 因果闭环",
    kind: "intent",
    badge: "意图",
    x: 410,
    y: 48,
  },
  {
    id: "ng-observe",
    label: "① 观察",
    sub: "检索笔记与环境证据",
    kind: "spine",
    badge: "主链",
    done: true,
    x: 410,
    y: 170,
  },
  {
    id: "ng-plan",
    label: "② 计划",
    sub: "形成可编辑的组织骨架",
    kind: "spine",
    badge: "主链",
    done: true,
    x: 650,
    y: 300,
  },
  {
    id: "ng-act",
    label: "③ 执行",
    sub: "生成节点、关系与布局",
    kind: "spine",
    badge: "主链",
    done: true,
    x: 410,
    y: 440,
  },
  {
    id: "ng-reflect",
    label: "④ 人工反馈",
    sub: "拖动、改名、补线后继续",
    kind: "spine",
    badge: "主链",
    done: true,
    x: 170,
    y: 300,
  },
  {
    id: "ng-note-observe",
    label: "轨迹检索与时间重排",
    sub: "证据 · 观察阶段",
    kind: "note",
    badge: "本库笔记",
    noteId: "note-retrieval-stm",
    sourceKind: "library",
    done: true,
    x: 640,
    y: 145,
  },
  {
    id: "ng-note-plan",
    label: "递归摘要与事实槽",
    sub: "证据 · 计划阶段",
    kind: "note",
    badge: "本库笔记",
    noteId: "note-summary-memory",
    sourceKind: "library",
    done: true,
    x: 860,
    y: 290,
  },
  {
    id: "ng-note-act",
    label: "Agentic Harness 正例",
    sub: "证据 · 执行阶段",
    kind: "note",
    badge: "本库笔记",
    noteId: "note-harness",
    sourceKind: "library",
    done: true,
    x: 625,
    y: 520,
  },
  {
    id: "ng-note-reflect",
    label: "分层记忆与回写边界",
    sub: "证据 · 反思阶段",
    kind: "note",
    badge: "本库笔记",
    noteId: "note-memgpt",
    sourceKind: "library",
    done: true,
    x: -15,
    y: 285,
  },
];

const BASE_EDGES: DemoEdge[] = [
  edge("ng-e0", "ng-intent", "ng-observe"),
  edge("ng-e1", "ng-observe", "ng-plan", "形成骨架"),
  edge("ng-e2", "ng-plan", "ng-act", "执行补丁"),
  edge("ng-e3", "ng-act", "ng-reflect", "人来修图"),
  edge("ng-e4", "ng-reflect", "ng-observe", "下一轮吸收", "loop"),
  edge("ng-e5", "ng-observe", "ng-note-observe"),
  edge("ng-e6", "ng-plan", "ng-note-plan"),
  edge("ng-e7", "ng-act", "ng-note-act"),
  edge("ng-e8", "ng-reflect", "ng-note-reflect"),
];

const COEDIT_NODES: DemoNode[] = [
  ...BASE_NODES,
  {
    id: "ng-mcp",
    label: "MCP · 上下文与工具",
    sub: "人工改名 · 位置已锁定",
    kind: "branch",
    badge: "人工锁定",
    x: 180,
    y: 560,
  },
  {
    id: "ng-a2a",
    label: "A2A · 跨 Agent 任务",
    sub: "人工新增 · 位置已锁定",
    kind: "branch",
    badge: "人工锁定",
    x: 410,
    y: 680,
  },
  {
    id: "ng-boundary",
    label: "协议协作边界",
    sub: "上下文访问 ≠ 任务协作",
    kind: "gate",
    badge: "待验证",
    x: 650,
    y: 680,
  },
  {
    id: "ng-action",
    label: "可复用的人机共编逻辑线",
    sub: "保留人工编辑 · 可继续延伸",
    kind: "action",
    badge: "产出",
    done: true,
    x: 410,
    y: 820,
  },
];

const COEDIT_EDGES: DemoEdge[] = [
  ...BASE_EDGES,
  edge("ng-e9", "ng-reflect", "ng-mcp", "人工补线", "break"),
  edge("ng-e10", "ng-mcp", "ng-a2a", "对比边界", "warn"),
  edge("ng-e11", "ng-a2a", "ng-boundary", "形成问题"),
  edge("ng-e12", "ng-boundary", "ng-action", "保留待验证"),
  edge("ng-e13", "ng-act", "ng-action", "导出"),
];

export const NOTEGRAPH_META = {
  id: "session-notegraph-coedit",
  title: "人机共编闭环",
  subtitle: "NoteGraph 案例 · 14 篇 Agent Systems 笔记",
  branch: "因果闭环 · 人改图后 AI 继续",
  canvasTitle: "Agent Systems · 人机共编逻辑线",
  when: "5.0 案例",
};

export const SCRIPT_NOTEGRAPH_COEDIT: DemoStep[] = [
  {
    id: "ng-s0-intent",
    title: "提出整理意图",
    holdMs: 520,
    phase: "clarify",
    canvasHint: "先选组织逻辑，再生成可编辑投影",
    chat: [
      {
        id: "ng-c0",
        role: "user",
        text: "这 14 篇 Agent Systems 笔记很散。帮我梳成一条能继续修改的逻辑线，不要把图当成原笔记的替代品。",
      },
    ],
    graph: { nodes: [], edges: [] },
  },
  {
    id: "ng-s1-clarify",
    title: "选择图谱逻辑",
    holdMs: 760,
    phase: "clarify",
    canvasHint: "四种投影可选 · 默认因果闭环",
    chat: [
      {
        id: "ng-c1t",
        role: "thinking",
        text: "同一批笔记可按主题、时间、对比或因果组织。先锁定投影方式，同时明确人工编辑优先。",
      },
      {
        id: "ng-c1",
        role: "assistant",
        text: "可以。图谱只是一种可编辑投影，原始笔记仍是事实来源。请选择组织方式；我会保留你之后的拖动、改名与人工连线。",
        options: [
          { id: "ng-topic", level: "组织方式", label: "主题聚类", desc: "按概念簇组织" },
          { id: "ng-time", level: "组织方式", label: "时间演进", desc: "按研究历程展开" },
          { id: "ng-compare", level: "组织方式", label: "对比分析", desc: "并列边界与差异" },
          { id: "ng-loop", level: "组织方式", label: "因果闭环", desc: "观察 → 计划 → 执行 → 反思" },
          { id: "ng-human", level: "编辑原则", label: "人工编辑优先", desc: "下一轮不可覆盖人的决定" },
          { id: "ng-evidence", level: "证据原则", label: "笔记回链", desc: "每段逻辑挂回原笔记" },
        ],
        autoPick: ["ng-loop", "ng-human", "ng-evidence"],
      },
    ],
    graph: {
      nodes: [
        {
          id: "ng-gate",
          label: "选择整理逻辑",
          sub: "主题 · 时间 · 对比 · 闭环",
          kind: "gate",
          badge: "澄清",
          x: 420,
          y: 230,
        },
      ],
      edges: [],
    },
    highlightIds: ["ng-gate"],
  },
  {
    id: "ng-s2-draft",
    title: "生成因果闭环",
    holdMs: 960,
    phase: "draft",
    canvasHint: "闭环已生成 · 节点可拖动，笔记可回链",
    chat: [
      {
        id: "ng-c2",
        role: "user",
        text: "选因果闭环，并保留人工编辑。",
      },
      {
        id: "ng-c2a",
        role: "assistant",
        text: "已按「观察 → 计划 → 执行 → 人工反馈 → 再观察」生成主闭环，并把代表性本库笔记挂到每一段。珊瑚色回流表示反馈进入下一轮。",
      },
    ],
    graph: { nodes: BASE_NODES, edges: BASE_EDGES },
    highlightIds: ["ng-observe", "ng-plan", "ng-act", "ng-reflect"],
  },
  {
    id: "ng-s3-human-edit",
    title: "人工修正图谱",
    holdMs: 820,
    phase: "extend",
    canvasHint: "检测到 3 项人工编辑 · 等待下一轮吸收",
    chat: [
      {
        id: "ng-c3",
        role: "user",
        text: "我刚做了三处修改：把“反思”改成“人工反馈”，把 MCP 和 A2A 钉在同一层，再补一条对比连线。下一轮别把它们挪回去。",
      },
      {
        id: "ng-c3a",
        role: "assistant",
        text: "已感知 3 项工作区编辑：1 项改名、1 组锁定位置、1 条人工关系。它们会成为下一轮约束，而不是被重新生成覆盖。",
      },
    ],
    graph: { nodes: COEDIT_NODES, edges: COEDIT_EDGES },
    highlightIds: ["ng-reflect", "ng-mcp", "ng-a2a"],
  },
  {
    id: "ng-s4-absorb",
    title: "吸收编辑继续延伸",
    holdMs: 900,
    phase: "final",
    canvasHint: "人工编辑已吸收 · 可继续拖动、对话或收束成报告",
    chat: [
      {
        id: "ng-c4",
        role: "user",
        text: "很好。从这条人工连线继续，告诉我 MCP 和 A2A 真正的协作边界。",
      },
      {
        id: "ng-c4t",
        role: "thinking",
        text: "保留两个人工锁定节点与手工边；只在其后新增“协议协作边界”待验证节点，不改写已有布局。",
      },
      {
        id: "ng-c4a",
        role: "assistant",
        text: "已从人工连线继续延伸：MCP 解决模型如何访问上下文与工具，A2A 解决独立 Agent 如何交换任务与交付物。这个差异目前标为待验证，不会伪装成本库已有结论。你可以继续修图，或点击「收束成报告」。",
      },
    ],
    graph: { nodes: COEDIT_NODES, edges: COEDIT_EDGES },
    highlightIds: ["ng-boundary", "ng-action"],
  },
];
