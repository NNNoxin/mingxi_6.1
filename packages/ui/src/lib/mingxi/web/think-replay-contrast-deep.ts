/**
 * 深度样例 · 对比辨析（渐进生长）
 *
 * 主题：提示词 / Skill / Harness 看起来都在「让 Agent 更稳」，如何拆开？
 * 画布策略：首答很短（三并列）→ 追问后出现差异边 → 再问出现分层与选型箭头
 *           → 再问挂上失败模式对照 → 最后收束决策清单
 */
import type { DemoEdge, DemoNode, DemoStep } from "./think-replay-types.ts";

const N = {
  intent: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "intent", x, y, badge: "问题",
  }),
  spine: (id: string, label: string, x: number, y: number, sub?: string, done?: boolean): DemoNode => ({
    id, label, sub, kind: "spine", x, y, badge: "辨析", done,
  }),
  branch: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "branch", x, y, badge: "差异",
  }),
  note: (id: string, label: string, x: number, y: number, noteId: string, sub?: string): DemoNode => ({
    id, label, sub, kind: "note", x, y, badge: "笔记", noteId, done: true,
  }),
  action: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "action", x, y, badge: "决策", done: true,
  }),
  gate: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "gate", x, y, badge: "澄清",
  }),
};

function E(id: string, from: string, to: string, label?: string): DemoEdge {
  return { id, from, to, label };
}

export const SCRIPT_CONTRAST_DEEP: DemoStep[] = [
  {
    id: "cd0",
    title: "相似困惑",
    holdMs: 700,
    phase: "clarify",
    canvasHint: "用户感到「同一领域、多篇相似」…",
    chat: [
      {
        id: "cdu0",
        role: "user",
        text: "我库里存了一堆提示词工程、Agent Skill、还有 Harness 的笔记，读起来都像在说「让 Agent 别翻车」。它们到底是一回事被换了马甲，还是本来就该分开看？",
      },
    ],
  },
  {
    id: "cd1",
    title: "确认辨析方式",
    holdMs: 850,
    phase: "clarify",
    canvasHint: "对比辨析 · 先短后长，随你追问生长",
    chat: [
      {
        id: "cdt1",
        role: "thinking",
        text: "典型「同域近义堆积」：提示词/Skill/Harness 共享「稳定性」话语，但作用层不同。策略：先给极短三分法，不一次铺满；等用户追问再拉差异边、选型箭头与失败对照。",
      },
      {
        id: "cda1",
        role: "assistant",
        text: "这很常见：同一领域里卡片标题都像「增强 Agent」，正文却不在同一层。我建议用**对比辨析**——先只摆三块「各管什么」，故意保持短链；你追问哪条缝，我再把图画长、分叉。你更想先比哪一刀？",
        options: [
          {
            id: "cd-layer",
            level: "切入",
            label: "先比「在哪一层」",
            desc: "语境注入 / 能力说明 / 运行时约束",
          },
          {
            id: "cd-fail",
            level: "切入",
            label: "先比「翻车长什么样」",
            desc: "从失败模式反推三者边界",
          },
          {
            id: "cd-short",
            level: "节奏",
            label: "短答起步，追问再展开",
            desc: "避免一上来长链淹没差异",
          },
        ],
        autoPick: ["cd-layer", "cd-short"],
      },
    ],
    graph: {
      nodes: [N.gate("cdg", "三者是不是一回事？", 420, 210, "同域近义 · 待拆")],
      edges: [],
    },
    highlightIds: ["cdg"],
  },
  {
    id: "cd2",
    title: "首答·极短三并列",
    holdMs: 1000,
    phase: "draft",
    canvasHint: "首版故意很短：只有三分法，暂无深分支",
    chat: [
      {
        id: "cdu1",
        role: "user",
        text: "先比在哪一层；短答就好，我再往下追。",
      },
      {
        id: "cda2",
        role: "assistant",
        text: "好。先给你一个**故意不长**的骨架（右侧同步）：\n\n三者都服务「更稳的 Agent」，但：\n- **提示词**：把当下语境/约束注入上下文 {{cite:note-prompt-core}}\n- **Skill**：把「怎么做」写成可安装的能力说明 {{cite:note-skill-format}}\n- **Harness**：管循环、工具门禁、追踪与回退——执行现场 {{cite:note-harness}}\n\n此刻画布只有「问题 → 三块」，还没有差异箭头。你想先撕开哪两条之间的缝？",
      },
    ],
    graph: {
      nodes: [
        N.intent("cdi", "三者是不是一回事？", 400, 40, "同域近义堆积"),
        N.spine("cdp", "提示词", 160, 220, "注入当下语境", true),
        N.spine("cds", "Skill", 400, 220, "可安装能力说明", true),
        N.spine("cdh", "Harness", 640, 220, "运行时约束", true),
      ],
      edges: [
        E("cde1", "cdi", "cdp", "？"),
        E("cde2", "cdi", "cds", "？"),
        E("cde3", "cdi", "cdh", "？"),
      ],
    },
    highlightIds: ["cdp", "cds", "cdh"],
  },
  {
    id: "cd3",
    title: "追问①·撕开 Prompt↔Skill",
    holdMs: 900,
    phase: "extend",
    chat: [
      {
        id: "cdu2",
        role: "user",
        text: "那提示词和 Skill 差在哪？我有些「高阶提示词模板」读起来已经很像 Skill 了。",
      },
    ],
  },
  {
    id: "cd4",
    title: "生长·差异边出现",
    holdMs: 1100,
    phase: "extend",
    canvasHint: "链变长了：出现「可版本 / 难共享」对照分支",
    chat: [
      {
        id: "cdt2",
        role: "thinking",
        text: "用户抓住真缝：模板化提示词 ≈ 雏形 Skill。要用仓库反例（泄露）与正例（可安装）把「活在上下文」vs「活成制品」拉开。",
      },
      {
        id: "cda3",
        role: "assistant",
        text: "缝在这：\n\n**像**的地方——都可以是结构化说明书。  \n**不像**的地方——提示词默认活在**一次会话的上下文**里；Skill 默认是**可安装、可版本、可在仓库间搬**的制品。{{cite:note-skill-format}}\n\n所以「高阶模板」若仍只能复制粘贴进 system，它还是提示词；一旦有元数据、目录约定、可被路由选中，才跨进 Skill。  \n另：策略若继续塞在提示词里，会撞上泄露面。{{cite:note-prompt-leak}}\n\n右侧已拉出对照分支，并挂上两张笔记卡。",
      },
    ],
    graph: {
      nodes: [
        N.intent("cdi", "三者是不是一回事？", 400, 30, "同域近义堆积"),
        N.spine("cdp", "提示词", 140, 180, "注入当下语境", true),
        N.spine("cds", "Skill", 400, 180, "可安装能力说明", true),
        N.spine("cdh", "Harness", 660, 180, "运行时约束", true),
        N.branch("cdb1", "活在上下文", 80, 320, "一次会话"),
        N.branch("cdb2", "活成制品", 280, 320, "可版本/可安装"),
        N.branch("cdb3", "相似：都像说明书", 220, 80, "容易混的表面"),
        N.note("cdn1", "提示词命脉", 40, 440, "note-prompt-core"),
        N.note("cdn2", "提示泄露", 160, 440, "note-prompt-leak", "反例"),
        N.note("cdn3", "Skill 综述", 320, 440, "note-skill-format"),
      ],
      edges: [
        E("cde1", "cdi", "cdp"),
        E("cde2", "cdi", "cds"),
        E("cde3", "cdi", "cdh"),
        E("cde4", "cdp", "cdb3", "表面像"),
        E("cde5", "cds", "cdb3", "表面像"),
        E("cde6", "cdp", "cdb1", "实质"),
        E("cde7", "cds", "cdb2", "实质"),
        E("cde8", "cdb1", "cdn1"),
        E("cde9", "cdb1", "cdn2", "风险"),
        E("cde10", "cdb2", "cdn3"),
        E("cde11", "cdb1", "cdb2", "对照"),
      ],
    },
    highlightIds: ["cdb1", "cdb2", "cdb3", "cdn2", "cdn3"],
  },
  {
    id: "cd5",
    title: "追问②·Harness 插哪",
    holdMs: 850,
    phase: "extend",
    chat: [
      {
        id: "cdu3",
        role: "user",
        text: "那 Harness 呢？是不是「更强的 Skill」？我有篇笔记标题也像能力增强。",
      },
    ],
  },
  {
    id: "cd6",
    title: "生长·分层箭头",
    holdMs: 1150,
    phase: "extend",
    canvasHint: "出现纵向分层：语境 → 能力 → 运行时（有向）",
    chat: [
      {
        id: "cda4",
        role: "assistant",
        text: "不是更强的 Skill。仓库里的分法更干净：\n\n- Skill **描述能力**  \n- Prompt **注入语境**  \n- Harness **约束执行现场**（循环、门禁、追踪、回退）{{cite:note-harness}}\n\n若把 Harness 写成又一份说明书，你会继续在「文档层」打转，却管不住工具乱调与不可观测。  \n右侧我改成**自上而下有向分层**（不再只是三并列），Harness 落在最下的运行时。",
      },
    ],
    graph: {
      nodes: [
        N.intent("cdi", "三者是不是一回事？", 420, 20, "已否定「同一马甲」"),
        N.spine("cdL1", "层1 · 语境注入", 420, 130, "提示词", true),
        N.spine("cdL2", "层2 · 能力说明", 420, 260, "Skill", true),
        N.spine("cdL3", "层3 · 运行时", 420, 390, "Harness", true),
        N.branch("cdb1", "活在上下文", 160, 130, "会话态"),
        N.branch("cdb2", "活成制品", 160, 260, "可安装"),
        N.branch("cdb4", "不是说明书", 680, 390, "循环/门禁/追踪"),
        N.note("cdn1", "提示词命脉", 40, 120, "note-prompt-core"),
        N.note("cdn3", "Skill 综述", 40, 250, "note-skill-format"),
        N.note("cdn4", "Harness 摘记", 700, 500, "note-harness", "片段×2"),
        N.note("cdn5", "Google skills", 200, 500, "note-google-skills", "发行形态"),
      ],
      edges: [
        E("cde0", "cdi", "cdL1", "辨析"),
        E("cde1", "cdL1", "cdL2", "外置↓"),
        E("cde2", "cdL2", "cdL3", "落地↓"),
        E("cde3", "cdL1", "cdb1"),
        E("cde4", "cdL2", "cdb2"),
        E("cde5", "cdL3", "cdb4"),
        E("cde6", "cdb1", "cdn1"),
        E("cde7", "cdb2", "cdn3"),
        E("cde8", "cdb2", "cdn5", "近端"),
        E("cde9", "cdb4", "cdn4"),
      ],
    },
    highlightIds: ["cdL1", "cdL2", "cdL3", "cdb4", "cdn4"],
  },
  {
    id: "cd7",
    title: "追问③·选型怎么走",
    holdMs: 800,
    phase: "extend",
    chat: [
      {
        id: "cdu4",
        role: "user",
        text: "别再概念了。给我一个「遇到具体场景该往哪走」的箭头决策，我好对照笔记。",
      },
    ],
  },
  {
    id: "cd8",
    title: "生长·选型有向图",
    holdMs: 1200,
    phase: "extend",
    canvasHint: "新增决策菱形流向：场景 → 走提示词/Skill/Harness",
    chat: [
      {
        id: "cda5",
        role: "assistant",
        text: "可以。决策箭头（右侧已画）：\n\n1. **只是这次对话要稳住口吻/格式？** → 先走提示词 {{cite:note-prompt-core}}  \n2. **同一套做法要跨项目复用、要版本？** → 升成 Skill {{cite:note-skill-format}} {{cite:note-google-skills}}  \n3. **工具乱调、步骤跑飞、要回放？** → 上 Harness，而不是再写长 prompt {{cite:note-harness}}\n\n注意：这是**分流**，不是升级路径逼你每层都上满。许多个人助手停在 1+少量 2 就够。",
      },
    ],
    graph: {
      nodes: [
        N.intent("cdi", "三者是不是一回事？", 200, 30, "已拆开"),
        N.action("cdd0", "场景怎么走？", 520, 40, "选型入口"),
        N.spine("cdd1", "只要本次对话稳住？", 520, 150, "口吻/格式/约束", true),
        N.spine("cdd2", "要跨项目复用？", 520, 280, "版本/安装", true),
        N.spine("cdd3", "工具与步骤失控？", 520, 410, "门禁/追踪/回退", true),
        N.spine("cdp", "→ 提示词", 280, 150, "语境注入", true),
        N.spine("cds", "→ Skill", 280, 280, "能力制品", true),
        N.spine("cdh", "→ Harness", 280, 410, "运行时", true),
        N.branch("cdb5", "可叠用，非强制三件套", 760, 280, "分流≠升级强迫"),
        N.note("cdn1", "提示词命脉", 100, 140, "note-prompt-core"),
        N.note("cdn3", "Skill 综述", 100, 270, "note-skill-format"),
        N.note("cdn4", "Harness 摘记", 100, 400, "note-harness"),
      ],
      edges: [
        E("cde0", "cdi", "cdd0", "进入选型"),
        E("cde1", "cdd0", "cdd1"),
        E("cde2", "cdd1", "cdd2", "否/不够"),
        E("cde3", "cdd2", "cdd3", "否/不够"),
        E("cde4", "cdd1", "cdp", "是"),
        E("cde5", "cdd2", "cds", "是"),
        E("cde6", "cdd3", "cdh", "是"),
        E("cde7", "cdp", "cdn1"),
        E("cde8", "cds", "cdn3"),
        E("cde9", "cdh", "cdn4"),
        E("cde10", "cdd2", "cdb5", "提醒"),
      ],
    },
    highlightIds: ["cdd0", "cdd1", "cdd2", "cdd3", "cdp", "cds", "cdh"],
  },
  {
    id: "cd9",
    title: "追问④·失败对照",
    holdMs: 800,
    phase: "extend",
    chat: [
      {
        id: "cdu5",
        role: "user",
        text: "再延伸一步：提示泄露、Skill 路由漂移，分别说明我之前把问题归错层了吗？",
      },
    ],
  },
  {
    id: "cd10",
    title: "生长·失败映射分支",
    holdMs: 1150,
    phase: "final",
    canvasHint: "失败模式映射回分层 · 辨析收束",
    chat: [
      {
        id: "cda6",
        role: "assistant",
        text: "对，而且这是对比辨析最有用的一步——**用翻车反证层级**：\n\n- **提示泄露** → 你把不该活在上下文的策略/秘密放在了提示词层 {{cite:note-prompt-leak}}  \n- **Skill 路由漂移** → 能力包边界不清，是 Skill 层问题，不是「再写一段更凶的 system」能救 {{cite:note-skill-route}}  \n- **步骤失控/工具乱调** → 优先查 Harness，而不是继续堆说明书 {{cite:note-harness}}\n\n收束：库里那些「好像都在讲增强 Agent」的笔记，可以按**层**重新挂载；相似的是目标话语，不同的是作用点。右侧已把失败对照挂到选型箭头旁。",
      },
    ],
    graph: {
      nodes: [
        N.intent("cdi", "三者不是一回事", 120, 30, "同域近义已拆"),
        N.action("cdd0", "场景怎么走？", 480, 30, "选型入口"),
        N.spine("cdd1", "只要本次对话稳住？", 480, 130, "", true),
        N.spine("cdd2", "要跨项目复用？", 480, 250, "", true),
        N.spine("cdd3", "工具与步骤失控？", 480, 370, "", true),
        N.spine("cdp", "→ 提示词", 260, 130, "", true),
        N.spine("cds", "→ Skill", 260, 250, "", true),
        N.spine("cdh", "→ Harness", 260, 370, "", true),
        N.branch("cdf1", "失败：提示泄露", 700, 110, "归错层信号"),
        N.branch("cdf2", "失败：路由漂移", 700, 250, "归错层信号"),
        N.branch("cdf3", "失败：步骤失控", 700, 370, "归错层信号"),
        N.action("cdc", "按层重挂笔记", 480, 520, "相似话语≠同一层"),
        N.note("cdn2", "提示泄露", 860, 90, "note-prompt-leak", "反例"),
        N.note("cdn6", "路由分析", 860, 230, "note-skill-route", "反例"),
        N.note("cdn4", "Harness 摘记", 860, 360, "note-harness"),
        N.note("cdn1", "提示词命脉", 100, 120, "note-prompt-core"),
        N.note("cdn3", "Skill 综述", 100, 240, "note-skill-format"),
      ],
      edges: [
        E("cde0", "cdi", "cdd0"),
        E("cde1", "cdd0", "cdd1"),
        E("cde2", "cdd1", "cdd2", "否"),
        E("cde3", "cdd2", "cdd3", "否"),
        E("cde4", "cdd1", "cdp", "是"),
        E("cde5", "cdd2", "cds", "是"),
        E("cde6", "cdd3", "cdh", "是"),
        E("cde7", "cdp", "cdn1"),
        E("cde8", "cds", "cdn3"),
        E("cde9", "cdp", "cdf1", "若翻车"),
        E("cde10", "cds", "cdf2", "若翻车"),
        E("cde11", "cdh", "cdf3", "若翻车"),
        E("cde12", "cdf1", "cdn2"),
        E("cde13", "cdf2", "cdn6"),
        E("cde14", "cdf3", "cdn4"),
        E("cde15", "cdd3", "cdc", "收束"),
        E("cde16", "cdf2", "cdc", "重挂"),
      ],
    },
    highlightIds: ["cdf1", "cdf2", "cdf3", "cdc", "cdn2", "cdn6"],
  },
];

export const CONTRAST_DEEP_META = {
  id: "ws-contrast-deep",
  title: "对比辨析·深",
  subtitle: "Prompt / Skill / Harness",
  branch: "辨析：同域近义如何拆开？",
  canvasTitle: "对比辨析 · 渐进生长",
  when: "主推",
};
