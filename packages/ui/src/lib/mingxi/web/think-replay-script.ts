/**
 * 梳理逻辑 · 高保真前端回忆脚本（纯模拟，不接后端）
 *
 * 主样例：Agent 短期记忆细粒度时间线（think-replay-stm.ts）
 * 其它样例：粗粒度对照 / 学术 / 对标 / 证据
 */
import { SCRIPT_AGENT_STM, STM_SESSION_META } from "./think-replay-stm.ts";
import {
  GPU_META,
  RAG_META,
  SCRIPT_GPU,
  SCRIPT_RAG,
  SCRIPT_SKILL,
  SCRIPT_SR,
  SKILL_META,
  SR_META,
} from "./think-replay-cases.ts";
import {
  CONTRAST_DEEP_META,
  SCRIPT_CONTRAST_DEEP,
} from "./think-replay-contrast-deep.ts";
import {
  SCRIPT_SKILL_LOOP,
  SKILL_LOOP_META,
} from "./think-replay-skill-loop.ts";
import {
  NOTEGRAPH_META,
  SCRIPT_NOTEGRAPH_COEDIT,
} from "./think-replay-notegraph.ts";
export type {
  ClarifyOption,
  DemoChatItem,
  DemoEdge,
  DemoNode,
  DemoNodeKind,
  DemoSessionPreset,
  DemoStep,
} from "./think-replay-types.ts";
import type {
  DemoChatItem,
  DemoEdge,
  DemoNode,
  DemoSessionPreset,
  DemoStep,
} from "./think-replay-types.ts";

export const EMPTY_GRAPH = { nodes: [] as DemoNode[], edges: [] as DemoEdge[] };

const N = {
  intent: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "intent", x, y, badge: "意图",
  }),
  spine: (id: string, label: string, x: number, y: number, sub?: string, done?: boolean): DemoNode => ({
    id, label, sub, kind: "spine", x, y, badge: "主链", done,
  }),
  branch: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "branch", x, y, badge: "支线",
  }),
  note: (id: string, label: string, x: number, y: number, sub?: string, badge = "笔记"): DemoNode => ({
    id, label, sub, kind: "note", x, y, badge, done: true,
  }),
  action: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "action", x, y, badge: "终点", done: true,
  }),
  gate: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "gate", x, y, badge: "澄清",
  }),
};

function E(id: string, from: string, to: string, label?: string): DemoEdge {
  return { id, from, to, label };
}

export const REPLAY_META = {
  title: SKILL_LOOP_META.canvasTitle,
  branch: SKILL_LOOP_META.branch,
  subtitle: "机制闭环 · 负环 + 破局环 · 追问生长",
};

export {
  SCRIPT_AGENT_STM,
  STM_SESSION_META,
  SCRIPT_CONTRAST_DEEP,
  CONTRAST_DEEP_META,
  SCRIPT_SKILL_LOOP,
  SKILL_LOOP_META,
};
export const THINK_REPLAY_SCRIPT = SCRIPT_SKILL_LOOP;

/** 旧粗粒度脚本（对照用） */
export const SCRIPT_EXEC_LEGACY: DemoStep[] = [
  {
    id: "s0-open",
    title: "提出意图",
    holdMs: 600,
    phase: "clarify",
    canvasHint: "等待你的梳理方向…",
    chat: [
      {
        id: "c0",
        role: "user",
        text: "库里 Agent 评测和 Skill 落地的笔记有点乱，帮我理清思绪，梳成一条能跟着学的逻辑。",
      },
    ],
    graph: EMPTY_GRAPH,
  },
  {
    id: "s1-clarify",
    title: "反向澄清",
    holdMs: 900,
    phase: "clarify",
    canvasHint: "方向未锁定 · 先澄清再画链",
    chat: [
      {
        id: "c1t",
        role: "thinking",
        text: "意图偏宽：可能是学习路径、避雷清单，或评测方法论。先分层澄清，避免替你定方向。",
      },
      {
        id: "c1",
        role: "assistant",
        text: "可以。在动手画链之前，我想先确认三层选择——你点选即可，也可以组合。我会严格按你的选择梳，而不是替你拍板。",
        options: [
          {
            id: "goal-exec",
            level: "目标层",
            label: "可执行落地",
            desc: "终点是清单/步骤，学完能动手",
          },
          {
            id: "goal-write",
            level: "目标层",
            label: "论文表述",
            desc: "终点是可引用的论证句式",
          },
          {
            id: "path-caution",
            level: "路径层",
            label: "避雷前置",
            desc: "先排反例与风险，再对照正例",
          },
          {
            id: "path-contrast",
            level: "路径层",
            label: "正反对标",
            desc: "Skill / Prompt / Harness 并列拆解",
          },
          {
            id: "grain-theme",
            level: "粒度层",
            label: "主题主链 + 笔记挂载",
            desc: "主链 5–7 步，叶节点挂具体笔记",
          },
          {
            id: "grain-evidence",
            level: "粒度层",
            label: "证据强度优先",
            desc: "硬实验 > 经验帖，标可信度",
          },
        ],
        autoPick: ["goal-exec", "path-caution", "grain-theme"],
      },
    ],
    graph: {
      nodes: [
        N.gate("g1", "待澄清的意图", 420, 200, "目标 · 路径 · 粒度"),
      ],
      edges: [],
    },
    highlightIds: ["g1"],
  },
  {
    id: "s2-picked",
    title: "确认方向",
    holdMs: 700,
    phase: "draft",
    canvasHint: "方向已锁定 · 准备起草主链",
    chat: [
      {
        id: "c2",
        role: "user",
        text: "选：可执行落地 + 避雷前置 + 主题主链挂笔记。",
      },
      {
        id: "c2a",
        role: "assistant",
        text: "收到。主轴定为「行动优先的学习链」，风险与反例前置，叶节点挂库内笔记。正在起草初版逻辑图——你可随时说「加支线 / 改顺序 / 拉证据」。",
      },
    ],
    graph: {
      nodes: [
        N.intent("i1", "行动优先学习链", 420, 60, "Agent 评测 × Skill 落地"),
      ],
      edges: [],
    },
    highlightIds: ["i1"],
  },
  {
    id: "s3-draft-spine",
    title: "初版主链",
    holdMs: 1100,
    phase: "draft",
    canvasHint: "初版主链已生成 · 可拖拽节点",
    chat: [
      {
        id: "c3t",
        role: "thinking",
        text: "召回库内避雷/正例笔记 → 按避雷前置排成 5 步主脊 → 挂载代表性笔记节点。",
      },
      {
        id: "c3",
        role: "assistant",
        text: "初版主链已落在右侧画布（5 步脊骨）。悬停可看摘要，节点可自由拖动。若方向不对，直接说想改哪一段。",
      },
    ],
    graph: {
      nodes: [
        N.intent("i1", "行动优先学习链", 420, 40, "Agent 评测 × Skill 落地"),
        N.spine("s1", "① 明确评测对象", 420, 150, "Agent / Skill / Harness 边界", true),
        N.spine("s2", "② 先读避雷清单", 420, 260, "反例与失败模式前置", true),
        N.spine("s3", "③ 对照正例骨架", 420, 370, "可复用的成功结构", true),
        N.spine("s4", "④ 最小可跑实验", 420, 480, "一条评测脚本 / 一个 Skill", true),
        N.spine("s5", "⑤ 回写个人清单", 420, 590, "沉淀为本周可执行项", true),
        N.note("n1", "Skill 路由避坑", 200, 250, "负例 · 工程经验", "避雷"),
        N.note("n2", "Agent 评测 dirty work", 640, 250, "负例 · 评测实践", "避雷"),
        N.note("n3", "Harness 工程正例", 200, 380, "正例 · 可安装能力包", "正例"),
        N.note("n4", "评测指标设计札记", 640, 380, "正例 · 指标分层", "正例"),
      ],
      edges: [
        E("e1", "i1", "s1"),
        E("e2", "s1", "s2", "避雷前置"),
        E("e3", "s2", "s3"),
        E("e4", "s3", "s4", "动手"),
        E("e5", "s4", "s5"),
        E("e6", "s2", "n1"),
        E("e7", "s2", "n2"),
        E("e8", "s3", "n3"),
        E("e9", "s3", "n4"),
      ],
    },
    highlightIds: ["s1", "s2", "s3", "s4", "s5", "n1", "n2", "n3", "n4"],
  },
  {
    id: "s4-extend-ask",
    title: "用户延伸",
    holdMs: 800,
    phase: "extend",
    canvasHint: "等待延伸指令…",
    chat: [
      {
        id: "c4",
        role: "user",
        text: "主链可以，但我想再拉一条「反例机制」支线：为什么这些避雷会反复出现？别只罗列现象。",
      },
    ],
  },
  {
    id: "s5-extend-branch",
    title: "支线展开",
    holdMs: 1000,
    phase: "extend",
    canvasHint: "已延伸 · 反例机制支线",
    chat: [
      {
        id: "c5t",
        role: "thinking",
        text: "在「先读避雷」节点右侧展开机制支线：表象 → 根因 → 可观测信号，并挂两条机制型笔记。",
      },
      {
        id: "c5",
        role: "assistant",
        text: "已在 ② 右侧展开「反例机制」支线，并接到主链。你拖开节点看看空间——画布可无限平移缩放。",
      },
    ],
    graph: {
      nodes: [
        N.intent("i1", "行动优先学习链", 420, 40, "Agent 评测 × Skill 落地"),
        N.spine("s1", "① 明确评测对象", 420, 150, "Agent / Skill / Harness 边界", true),
        N.spine("s2", "② 先读避雷清单", 420, 260, "反例与失败模式前置", true),
        N.spine("s3", "③ 对照正例骨架", 420, 370, "可复用的成功结构", true),
        N.spine("s4", "④ 最小可跑实验", 420, 480, "一条评测脚本 / 一个 Skill", true),
        N.spine("s5", "⑤ 回写个人清单", 420, 590, "沉淀为本周可执行项", true),
        N.note("n1", "Skill 路由避坑", 180, 220, "负例 · 工程经验", "避雷"),
        N.note("n2", "Agent 评测 dirty work", 180, 300, "负例 · 评测实践", "避雷"),
        N.note("n3", "Harness 工程正例", 180, 400, "正例 · 可安装能力包", "正例"),
        N.note("n4", "评测指标设计札记", 180, 480, "正例 · 指标分层", "正例"),
        N.branch("b1", "反例机制支线", 700, 200, "表象 → 根因 → 信号"),
        N.spine("b1a", "表象：路由漂移", 860, 140, "同任务多次走偏", true),
        N.spine("b1b", "根因：边界未写清", 860, 230, "Skill 职责重叠", true),
        N.spine("b1c", "信号：可观测指标", 860, 320, "失败率 / 回退次数", true),
        N.note("n5", "Skill 路由问题分析", 1040, 230, "机制深挖", "机制"),
      ],
      edges: [
        E("e1", "i1", "s1"),
        E("e2", "s1", "s2", "避雷前置"),
        E("e3", "s2", "s3"),
        E("e4", "s3", "s4", "动手"),
        E("e5", "s4", "s5"),
        E("e6", "s2", "n1"),
        E("e7", "s2", "n2"),
        E("e8", "s3", "n3"),
        E("e9", "s3", "n4"),
        E("e10", "s2", "b1", "延伸"),
        E("e11", "b1", "b1a"),
        E("e12", "b1a", "b1b"),
        E("e13", "b1b", "b1c"),
        E("e14", "b1b", "n5"),
      ],
    },
    highlightIds: ["b1", "b1a", "b1b", "b1c", "n5"],
  },
  {
    id: "s6-evidence-ask",
    title: "再要证据链",
    holdMs: 750,
    phase: "extend",
    chat: [
      {
        id: "c6",
        role: "user",
        text: "④ 前面再插一条「证据强度」：先排有实验数据的，再排经验帖，别把 anecdotal 和硬证据混在一起。",
      },
    ],
  },
  {
    id: "s7-evidence",
    title: "证据链插入",
    holdMs: 1100,
    phase: "extend",
    canvasHint: "主链已重排 · 证据层插入 ③→④",
    chat: [
      {
        id: "c7",
        role: "assistant",
        text: "已在正例与动手之间插入「证据强度排序」，并把两条硬证据笔记挂上去。主链顺序现为：对象 → 避雷 → 正例 → 证据 → 实验 → 清单。",
      },
    ],
    graph: {
      nodes: [
        N.intent("i1", "行动优先学习链", 420, 30, "Agent 评测 × Skill 落地"),
        N.spine("s1", "① 明确评测对象", 420, 130, "Agent / Skill / Harness 边界", true),
        N.spine("s2", "② 先读避雷清单", 420, 230, "反例与失败模式前置", true),
        N.spine("s3", "③ 对照正例骨架", 420, 330, "可复用的成功结构", true),
        N.spine("s6", "④ 证据强度排序", 420, 430, "硬实验 > 经验帖", true),
        N.spine("s4", "⑤ 最小可跑实验", 420, 530, "一条评测脚本 / 一个 Skill", true),
        N.spine("s5", "⑥ 回写个人清单", 420, 630, "沉淀为本周可执行项", true),
        N.note("n1", "Skill 路由避坑", 160, 200, "负例 · 工程经验", "避雷"),
        N.note("n2", "Agent 评测 dirty work", 160, 280, "负例 · 评测实践", "避雷"),
        N.note("n3", "Harness 工程正例", 160, 360, "正例 · 可安装能力包", "正例"),
        N.note("n4", "评测指标设计札记", 160, 440, "正例 · 指标分层", "正例"),
        N.branch("b1", "反例机制支线", 700, 180, "表象 → 根因 → 信号"),
        N.spine("b1a", "表象：路由漂移", 880, 120, "同任务多次走偏", true),
        N.spine("b1b", "根因：边界未写清", 880, 210, "Skill 职责重叠", true),
        N.spine("b1c", "信号：可观测指标", 880, 300, "失败率 / 回退次数", true),
        N.note("n5", "Skill 路由问题分析", 1060, 210, "机制深挖", "机制"),
        N.branch("b2", "证据层", 700, 430, "可信度分层"),
        N.note("n6", "纯文本 RAG SOTA", 880, 400, "实验数据 · 高可信", "硬证据"),
        N.note("n7", "评测焦虑经验帖", 880, 490, "经验 · 中可信", "经验"),
      ],
      edges: [
        E("e1", "i1", "s1"),
        E("e2", "s1", "s2", "避雷前置"),
        E("e3", "s2", "s3"),
        E("e3b", "s3", "s6", "证据"),
        E("e4", "s6", "s4", "动手"),
        E("e5", "s4", "s5"),
        E("e6", "s2", "n1"),
        E("e7", "s2", "n2"),
        E("e8", "s3", "n3"),
        E("e9", "s3", "n4"),
        E("e10", "s2", "b1", "延伸"),
        E("e11", "b1", "b1a"),
        E("e12", "b1a", "b1b"),
        E("e13", "b1b", "b1c"),
        E("e14", "b1b", "n5"),
        E("e15", "s6", "b2"),
        E("e16", "b2", "n6", "高"),
        E("e17", "b2", "n7", "中"),
      ],
    },
    highlightIds: ["s6", "b2", "n6", "n7"],
  },
  {
    id: "s8-final-ask",
    title: "落到清单",
    holdMs: 700,
    phase: "final",
    chat: [
      {
        id: "c8",
        role: "user",
        text: "终点做成「本周可执行 checklist」节点就收束，别再发散了。",
      },
    ],
  },
  {
    id: "s9-final",
    title: "收束完成",
    holdMs: 1000,
    phase: "final",
    canvasHint: "逻辑链已按你的方向收束 · 可继续拖拽微调",
    chat: [
      {
        id: "c9",
        role: "assistant",
        text: "已收束。终点节点挂了三条本周动作：写清 Skill 边界、跑一条最小评测、把避雷写进个人清单。整条链以你的发言为主轴——之后若要改角度，再说一声即可重排。",
      },
    ],
    graph: {
      nodes: [
        N.intent("i1", "行动优先学习链", 420, 30, "Agent 评测 × Skill 落地"),
        N.spine("s1", "① 明确评测对象", 420, 130, "Agent / Skill / Harness 边界", true),
        N.spine("s2", "② 先读避雷清单", 420, 230, "反例与失败模式前置", true),
        N.spine("s3", "③ 对照正例骨架", 420, 330, "可复用的成功结构", true),
        N.spine("s6", "④ 证据强度排序", 420, 430, "硬实验 > 经验帖", true),
        N.spine("s4", "⑤ 最小可跑实验", 420, 530, "一条评测脚本 / 一个 Skill", true),
        N.spine("s5", "⑥ 回写个人清单", 420, 630, "沉淀为本周可执行项", true),
        N.action("a1", "本周 Checklist", 420, 750, "边界 · 最小评测 · 避雷入库"),
        N.note("n1", "Skill 路由避坑", 160, 200, "负例 · 工程经验", "避雷"),
        N.note("n2", "Agent 评测 dirty work", 160, 280, "负例 · 评测实践", "避雷"),
        N.note("n3", "Harness 工程正例", 160, 360, "正例 · 可安装能力包", "正例"),
        N.note("n4", "评测指标设计札记", 160, 440, "正例 · 指标分层", "正例"),
        N.branch("b1", "反例机制支线", 700, 180, "表象 → 根因 → 信号"),
        N.spine("b1a", "表象：路由漂移", 880, 120, "同任务多次走偏", true),
        N.spine("b1b", "根因：边界未写清", 880, 210, "Skill 职责重叠", true),
        N.spine("b1c", "信号：可观测指标", 880, 300, "失败率 / 回退次数", true),
        N.note("n5", "Skill 路由问题分析", 1060, 210, "机制深挖", "机制"),
        N.branch("b2", "证据层", 700, 430, "可信度分层"),
        N.note("n6", "纯文本 RAG SOTA", 880, 400, "实验数据 · 高可信", "硬证据"),
        N.note("n7", "评测焦虑经验帖", 880, 490, "经验 · 中可信", "经验"),
        N.note("a1n1", "写清 Skill 边界", 280, 850, "动作 1", "Todo"),
        N.note("a1n2", "跑最小评测脚本", 420, 850, "动作 2", "Todo"),
        N.note("a1n3", "避雷写入清单", 560, 850, "动作 3", "Todo"),
      ],
      edges: [
        E("e1", "i1", "s1"),
        E("e2", "s1", "s2", "避雷前置"),
        E("e3", "s2", "s3"),
        E("e3b", "s3", "s6", "证据"),
        E("e4", "s6", "s4", "动手"),
        E("e5", "s4", "s5"),
        E("e5b", "s5", "a1", "收束"),
        E("e6", "s2", "n1"),
        E("e7", "s2", "n2"),
        E("e8", "s3", "n3"),
        E("e9", "s3", "n4"),
        E("e10", "s2", "b1", "延伸"),
        E("e11", "b1", "b1a"),
        E("e12", "b1a", "b1b"),
        E("e13", "b1b", "b1c"),
        E("e14", "b1b", "n5"),
        E("e15", "s6", "b2"),
        E("e16", "b2", "n6", "高"),
        E("e17", "b2", "n7", "中"),
        E("e18", "a1", "a1n1"),
        E("e19", "a1", "a1n2"),
        E("e20", "a1", "a1n3"),
      ],
    },
    highlightIds: ["a1", "a1n1", "a1n2", "a1n3"],
  },
];

export const SCRIPT_ACADEMIC: DemoStep[] = [
  {
    id: "a0",
    title: "提出意图",
    holdMs: 500,
    phase: "clarify",
    chat: [
      {
        id: "ac0",
        role: "user",
        text: "我想学怎么把工程经验写成能放进论文 Related Work 的表述。",
      },
    ],
  },
  {
    id: "a1",
    title: "澄清",
    holdMs: 700,
    phase: "clarify",
    canvasHint: "学术路径待确认",
    chat: [
      {
        id: "ac1",
        role: "assistant",
        text: "学术表述可以有三条入口。你更想先练哪一层？",
        options: [
          {
            id: "aw-problem",
            level: "目标层",
            label: "问题驱动陈述",
            desc: "先写清 gap 与贡献句",
          },
          {
            id: "aw-related",
            level: "路径层",
            label: "Related Work 对位",
            desc: "按脉络对照既有工作",
          },
          {
            id: "aw-lexicon",
            level: "粒度层",
            label: "可复用措辞清单",
            desc: "句式模板 + 限制度词",
          },
        ],
        autoPick: ["aw-problem", "aw-related", "aw-lexicon"],
      },
    ],
    graph: {
      nodes: [N.gate("ag", "学术表述意图", 420, 200, "问题 · 对位 · 措辞")],
      edges: [],
    },
    highlightIds: ["ag"],
  },
  {
    id: "a2",
    title: "确认",
    holdMs: 600,
    phase: "draft",
    chat: [
      {
        id: "ac2",
        role: "user",
        text: "三条都要：问题陈述 → Related Work → 措辞清单。",
      },
    ],
  },
  {
    id: "a3",
    title: "学术主链",
    holdMs: 900,
    phase: "final",
    canvasHint: "学术论证链 · 与行动清单画布不同",
    chat: [
      {
        id: "ac3",
        role: "assistant",
        text: "已按论文写法梳成论证链。右侧是「问题→对位→方法句式→局限→措辞」——和可执行落地那条画布完全不同。",
      },
    ],
    graph: {
      nodes: [
        N.intent("ai", "论文表述学习链", 420, 40, "工程经验 → 可引用论述"),
        N.spine("as1", "① 问题与 gap", 420, 150, "一句说清缺口", true),
        N.spine("as2", "② Related Work 对位", 420, 270, "脉络而非堆砌", true),
        N.spine("as3", "③ 方法表述句式", 420, 390, "We propose… 约束", true),
        N.spine("as4", "④ 证据与局限", 420, 510, "claim 边界", true),
        N.spine("as5", "⑤ 措辞清单", 420, 630, "可复用模板", true),
        N.action("aa", "本周写作练习", 420, 750, "改写一段 Related Work"),
        N.note("an1", "Agent Skills 综述", 180, 270, "综述体例", "范本"),
        N.note("an2", "RAG SOTA 总结", 660, 270, "对比句式", "范本"),
        N.note("an3", "局限常用表述", 660, 510, "hedging", "措辞"),
      ],
      edges: [
        E("ae1", "ai", "as1"),
        E("ae2", "as1", "as2"),
        E("ae3", "as2", "as3"),
        E("ae4", "as3", "as4"),
        E("ae5", "as4", "as5"),
        E("ae6", "as5", "aa", "练习"),
        E("ae7", "as2", "an1"),
        E("ae8", "as2", "an2"),
        E("ae9", "as4", "an3"),
      ],
    },
    highlightIds: ["as1", "as2", "as3", "as4", "as5", "aa"],
  },
];

/** 正反对标会话 */
export const SCRIPT_CONTRAST: DemoStep[] = [
  {
    id: "k0",
    title: "提出意图",
    holdMs: 500,
    phase: "clarify",
    chat: [
      {
        id: "kc0",
        role: "user",
        text: "帮我把 Skill、提示词工程、Agentic Harness 三者的差异梳清楚，别混成一锅。",
      },
    ],
  },
  {
    id: "k1",
    title: "澄清",
    holdMs: 650,
    phase: "clarify",
    chat: [
      {
        id: "kc1",
        role: "assistant",
        text: "对标拆解可以按「适用场景 / 边界 / 可借鉴点」三列展开，还是只要一张差异总表？",
        options: [
          {
            id: "ct-tri",
            level: "结构层",
            label: "三列并置",
            desc: "Skill · Prompt · Harness 分叉",
          },
          {
            id: "ct-scene",
            level: "路径层",
            label: "场景优先",
            desc: "先问何时用谁",
          },
        ],
        autoPick: ["ct-tri", "ct-scene"],
      },
    ],
    graph: {
      nodes: [N.gate("kg", "对标意图", 420, 200, "三列并置")],
      edges: [],
    },
    highlightIds: ["kg"],
  },
  {
    id: "k2",
    title: "对标图",
    holdMs: 950,
    phase: "final",
    canvasHint: "三叉对标画布 · 与主链纵向结构不同",
    chat: [
      {
        id: "kc2",
        role: "user",
        text: "三列并置，场景优先。",
      },
      {
        id: "kc3",
        role: "assistant",
        text: "已生成三叉对标图：中心是决策问题，左右分出三条能力路径，末端挂场景与边界。这条画布是横向分叉，不是纵向学习主脊。",
      },
    ],
    graph: {
      nodes: [
        N.intent("ki", "何时用谁？", 420, 80, "Skill × Prompt × Harness"),
        N.branch("kb1", "Agent Skill", 160, 240, "可安装能力包"),
        N.branch("kb2", "提示词工程", 420, 240, "上下文内编排"),
        N.branch("kb3", "Agentic Harness", 680, 240, "运行时约束与工具"),
        N.spine("ks1", "适用：重复工作流", 160, 380, "可版本化", true),
        N.spine("ks2", "适用：一次性探索", 420, 380, "低成本试错", true),
        N.spine("ks3", "适用：生产稳态", 680, 380, "可观测/可回滚", true),
        N.note("kn1", "Skill 综述", 80, 500, "正例", "正例"),
        N.note("kn2", "提示泄露风险", 420, 500, "避雷", "避雷"),
        N.note("kn3", "Harness 工程笔记", 760, 500, "正例", "正例"),
        N.action("ka", "选型检查表", 420, 640, "场景 → 选路径 → 写边界"),
      ],
      edges: [
        E("ke1", "ki", "kb1"),
        E("ke2", "ki", "kb2"),
        E("ke3", "ki", "kb3"),
        E("ke4", "kb1", "ks1"),
        E("ke5", "kb2", "ks2"),
        E("ke6", "kb3", "ks3"),
        E("ke7", "ks1", "kn1"),
        E("ke8", "ks2", "kn2"),
        E("ke9", "ks3", "kn3"),
        E("ke10", "ks1", "ka"),
        E("ke11", "ks2", "ka"),
        E("ke12", "ks3", "ka"),
      ],
    },
    highlightIds: ["kb1", "kb2", "kb3", "ka"],
  },
];

/** 证据强度会话 */
export const SCRIPT_EVIDENCE: DemoStep[] = [
  {
    id: "v0",
    title: "提出意图",
    holdMs: 480,
    phase: "clarify",
    chat: [
      {
        id: "vc0",
        role: "user",
        text: "RAG 和评测相关笔记可信度差很多，按证据强度帮我排一条链。",
      },
    ],
  },
  {
    id: "v1",
    title: "证据链",
    holdMs: 900,
    phase: "final",
    canvasHint: "证据金字塔画布",
    chat: [
      {
        id: "vc1",
        role: "assistant",
        text: "按「硬实验 → 复现报告 → 经验帖 → 传闻」四层排成金字塔。顶部是你可直接采信的结论，底部需标注来源偏见。",
      },
    ],
    graph: {
      nodes: [
        N.intent("vi", "证据强度排序", 420, 40, "RAG / 评测笔记"),
        N.spine("vs1", "L1 硬实验", 420, 160, "可复现数据", true),
        N.spine("vs2", "L2 复现报告", 420, 280, "二手但可核", true),
        N.spine("vs3", "L3 工程经验", 420, 400, "情境依赖", true),
        N.spine("vs4", "L4 观点/传闻", 420, 520, "仅作启发", true),
        N.note("vn1", "纯文本 RAG SOTA", 200, 160, "benchmark", "硬证据"),
        N.note("vn2", "BM25 对照笔记", 640, 160, "消融", "硬证据"),
        N.note("vn3", "dirty work 评测", 200, 400, "踩坑实录", "经验"),
        N.note("vn4", "评测焦虑帖", 640, 520, "情绪向", "传闻"),
        N.action("va", "引用纪律", 420, 640, "对外只引 L1–L2"),
      ],
      edges: [
        E("ve1", "vi", "vs1"),
        E("ve2", "vs1", "vs2"),
        E("ve3", "vs2", "vs3"),
        E("ve4", "vs3", "vs4"),
        E("ve5", "vs1", "vn1"),
        E("ve6", "vs1", "vn2"),
        E("ve7", "vs3", "vn3"),
        E("ve8", "vs4", "vn4"),
        E("ve9", "vs2", "va", "纪律"),
      ],
    },
    highlightIds: ["vs1", "vs2", "vs3", "vs4", "va"],
  },
];

function finalFromScript(script: DemoStep[]): {
  chat: DemoChatItem[];
  graph: { nodes: DemoNode[]; edges: DemoEdge[] };
  phase?: DemoStep["phase"];
  canvasHint?: string;
} {
  const chat: DemoChatItem[] = [];
  let graph = { nodes: [] as DemoNode[], edges: [] as DemoEdge[] };
  let phase: DemoStep["phase"] | undefined;
  let canvasHint: string | undefined;
  for (const s of script) {
    chat.push(...s.chat);
    if (s.graph) graph = s.graph;
    if (s.phase) phase = s.phase;
    if (s.canvasHint) canvasHint = s.canvasHint;
  }
  return { chat, graph, phase, canvasHint };
}

export const DEMO_SESSION_PRESETS: DemoSessionPreset[] = [
  {
    id: SKILL_LOOP_META.id,
    title: SKILL_LOOP_META.title,
    subtitle: SKILL_LOOP_META.subtitle,
    branch: SKILL_LOOP_META.branch,
    canvasTitle: SKILL_LOOP_META.canvasTitle,
    when: SKILL_LOOP_META.when,
    script: SCRIPT_SKILL_LOOP,
    seedRemembered: false,
  },
  {
    id: CONTRAST_DEEP_META.id,
    title: CONTRAST_DEEP_META.title,
    subtitle: CONTRAST_DEEP_META.subtitle,
    branch: CONTRAST_DEEP_META.branch,
    canvasTitle: CONTRAST_DEEP_META.canvasTitle,
    when: "次推",
    script: SCRIPT_CONTRAST_DEEP,
    seedRemembered: true,
  },
  {
    id: NOTEGRAPH_META.id,
    title: NOTEGRAPH_META.title,
    subtitle: NOTEGRAPH_META.subtitle,
    branch: NOTEGRAPH_META.branch,
    canvasTitle: NOTEGRAPH_META.canvasTitle,
    when: NOTEGRAPH_META.when,
    script: SCRIPT_NOTEGRAPH_COEDIT,
    seedRemembered: true,
  },
  {
    id: STM_SESSION_META.id,
    title: STM_SESSION_META.title,
    subtitle: STM_SESSION_META.subtitle,
    branch: STM_SESSION_META.branch,
    canvasTitle: STM_SESSION_META.canvasTitle,
    when: STM_SESSION_META.when,
    script: SCRIPT_AGENT_STM,
    seedRemembered: true,
  },
  {
    id: RAG_META.id,
    title: RAG_META.title,
    subtitle: RAG_META.subtitle,
    branch: RAG_META.branch,
    canvasTitle: RAG_META.canvasTitle,
    when: RAG_META.when,
    script: SCRIPT_RAG,
    seedRemembered: true,
  },
  {
    id: SKILL_META.id,
    title: SKILL_META.title,
    subtitle: SKILL_META.subtitle,
    branch: SKILL_META.branch,
    canvasTitle: SKILL_META.canvasTitle,
    when: SKILL_META.when,
    script: SCRIPT_SKILL,
    seedRemembered: true,
  },
  {
    id: GPU_META.id,
    title: GPU_META.title,
    subtitle: GPU_META.subtitle,
    branch: GPU_META.branch,
    canvasTitle: GPU_META.canvasTitle,
    when: GPU_META.when,
    script: SCRIPT_GPU,
    seedRemembered: true,
  },
  {
    id: SR_META.id,
    title: SR_META.title,
    subtitle: SR_META.subtitle,
    branch: SR_META.branch,
    canvasTitle: SR_META.canvasTitle,
    when: SR_META.when,
    script: SCRIPT_SR,
    seedRemembered: true,
  },
];

export function buildSeededSessionState(preset: DemoSessionPreset): {
  chat: DemoChatItem[];
  nodes: DemoNode[];
  edges: DemoEdge[];
  phase?: DemoStep["phase"];
  canvasHint: string;
  stepIndex: number;
} {
  if (!preset.seedRemembered) {
    return {
      chat: [],
      nodes: [],
      edges: [],
      phase: undefined,
      canvasHint: "点击「回忆」自动播放完整梳链",
      stepIndex: -1,
    };
  }
  const fin = finalFromScript(preset.script);
  return {
    chat: fin.chat,
    nodes: fin.graph.nodes,
    edges: fin.graph.edges,
    phase: fin.phase,
    canvasHint: fin.canvasHint || "历史会话 · 画布已记忆",
    stepIndex: preset.script.length - 1,
  };
}
