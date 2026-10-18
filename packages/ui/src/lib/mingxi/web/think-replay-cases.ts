/**
 * 基于银标库高频主题的细粒度演示剧本（均含时间/逻辑演进）
 * - RAG 检索范式演进
 * - 提示词 → Skill 能力封装演进
 * - 本地推理：堆卡迷信 → 带宽思维
 * - 间隔重复：理论 → 证据 → 提取澄清 → 落地
 */
import type { DemoEdge, DemoNode, DemoStep } from "./think-replay-types.ts";

const N = {
  intent: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "intent", x, y, badge: "问题",
  }),
  spine: (id: string, label: string, x: number, y: number, sub?: string, done?: boolean): DemoNode => ({
    id, label, sub, kind: "spine", x, y, badge: "阶段", done,
  }),
  branch: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "branch", x, y, badge: "观点",
  }),
  note: (id: string, label: string, x: number, y: number, noteId: string, sub?: string): DemoNode => ({
    id, label, sub, kind: "note", x, y, badge: "笔记", noteId, done: true,
  }),
  action: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "action", x, y, badge: "收束", done: true,
  }),
  gate: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "gate", x, y, badge: "澄清",
  }),
};
function E(id: string, from: string, to: string, label?: string): DemoEdge {
  return { id, from, to, label };
}

/** ① RAG：稀疏→稠密→混合→重排→失败归因 */
export const SCRIPT_RAG: DemoStep[] = [
  {
    id: "r0",
    title: "细问",
    holdMs: 550,
    phase: "clarify",
    chat: [{
      id: "ru0",
      role: "user",
      text: "库里 RAG 笔记不少。我想弄清：检索范式大概是怎么一步步演到今天这套「混合+重排」默认组合的？",
    }],
  },
  {
    id: "r1",
    title: "确认轴",
    holdMs: 650,
    phase: "clarify",
    chat: [{
      id: "ra1",
      role: "assistant",
      text: "库里命中 SOTA 谱系、BM25 洞察、失败模式三条主线。我按**技术演进顺序**梳，可以吗？",
      options: [
        { id: "rag-time", level: "组织轴", label: "技术演进", desc: "稀疏→稠密→混合→重排→归因" },
        { id: "rag-med", level: "场景", label: "偏医疗落地", desc: "每步点一下诊断场景含义" },
      ],
      autoPick: ["rag-time", "rag-med"],
    }],
    graph: { nodes: [N.gate("rg", "RAG 默认组合从哪来？", 400, 200, "演进轴待确认")], edges: [] },
    highlightIds: ["rg"],
  },
  {
    id: "r2",
    title: "演进主脊",
    holdMs: 1100,
    phase: "final",
    canvasHint: "RAG 检索范式时间线 · 叶节点=仓库片段",
    chat: [{
      id: "ra2",
      role: "assistant",
      text: "按仓库片段，默认组合不是一夜冒出来的：\n\n**① 稀疏底盘**——BM25 仍是大规模默认，硬匹配字段上稠密易漂。{{cite:note-bm25}}\n\n**② 稠密补语义**——向量补上同义与改写，但单独用会在专名上翻车。\n\n**③ 混合几乎成为必选**——稀疏腿+稠密腿。{{cite:note-rag-sota}}\n\n**④ 重排/融合**——往往比盲目换更大嵌入更划算；医疗场景尤甚。{{cite:note-rag-sota}}\n\n**⑤ 失败归因**——先分「找错」还是「想错」，再谈新架构，否则容易伪需求。{{cite:note-rag-fail}}\n\n右侧是演进主脊；悬停引用或笔记卡可预览。",
    }],
    graph: {
      nodes: [
        N.intent("ri", "默认 RAG 组合从哪来？", 360, 30, "稀疏→…→归因"),
        N.spine("rs1", "① 稀疏 BM25", 360, 140, "硬匹配底盘", true),
        N.spine("rs2", "② 稠密向量", 360, 250, "补语义/改写", true),
        N.spine("rs3", "③ 混合检索", 360, 360, "两腿并行", true),
        N.spine("rs4", "④ 重排融合", 360, 470, "性价比常高于换嵌入", true),
        N.spine("rs5", "⑤ 失败分层", 360, 580, "找错 vs 想错", true),
        N.action("ra", "医疗默认：混合+重排", 360, 700, "稀疏不可省"),
        N.branch("rb1", "专名场景不可省", 600, 130, "AI 总结"),
        N.branch("rb2", "单用易漂", 600, 240, "AI 总结"),
        N.branch("rb3", "近端默认形态", 600, 350, "AI 总结"),
        N.branch("rb4", "优先于更大嵌入", 600, 460, "AI 总结"),
        N.branch("rb5", "防伪需求架构", 600, 570, "AI 总结"),
        N.note("rn1", "BM25 洞察", 800, 110, "note-bm25", "片段×1"),
        N.note("rn2", "RAG SOTA 谱系", 800, 330, "note-rag-sota", "片段×2"),
        N.note("rn3", "失败模式笔记", 800, 550, "note-rag-fail", "片段×2"),
      ],
      edges: [
        E("re0", "ri", "rs1"), E("re1", "rs1", "rs2", "演进"), E("re2", "rs2", "rs3"),
        E("re3", "rs3", "rs4"), E("re4", "rs4", "rs5"), E("re5", "rs5", "ra", "收束"),
        E("reb1", "rs1", "rb1"), E("reb2", "rs2", "rb2"), E("reb3", "rs3", "rb3"),
        E("reb4", "rs4", "rb4"), E("reb5", "rs5", "rb5"),
        E("ren1", "rb1", "rn1"), E("ren2", "rb3", "rn2"), E("ren3", "rb4", "rn2"),
        E("ren4", "rb5", "rn3"),
      ],
    },
    highlightIds: ["rs1", "rs3", "rs5", "ra"],
  },
];

export const RAG_META = {
  id: "ws-rag",
  title: "RAG 检索演进",
  subtitle: "稀疏→混合→重排→归因",
  branch: "问题：默认混合检索从哪演来？",
  canvasTitle: "RAG 检索范式时间线",
  when: "昨天",
};

/** ② 提示词 → Skill → 路由/发行 */
export const SCRIPT_SKILL: DemoStep[] = [
  {
    id: "k0",
    title: "细问",
    holdMs: 550,
    phase: "clarify",
    chat: [{
      id: "ku0",
      role: "user",
      text: "我想理清：从提示词工程到 Agent Skill，能力到底是怎么一步步被「封装外置」的？中间踩过什么坑？",
    }],
  },
  {
    id: "k1",
    title: "澄清",
    holdMs: 600,
    phase: "clarify",
    chat: [{
      id: "ka1",
      role: "assistant",
      text: "库里提示词、泄露、Skill 综述、路由避坑、Google skills 都能串上。按**封装形态演进**来梳？",
      options: [
        { id: "sk-evo", level: "组织轴", label: "封装演进", desc: "prompt → 外置 → Skill → 路由 → 发行" },
        { id: "sk-pit", level: "路径", label: "避坑穿插", desc: "每站挂一则反例" },
      ],
      autoPick: ["sk-evo", "sk-pit"],
    }],
    graph: { nodes: [N.gate("kg", "能力如何被外置？", 400, 200)], edges: [] },
    highlightIds: ["kg"],
  },
  {
    id: "k2",
    title: "演进链",
    holdMs: 1100,
    phase: "final",
    canvasHint: "提示词→Skill 封装演进",
    chat: [{
      id: "ka2",
      role: "assistant",
      text: "**① 提示词期**——结构化指令是稳定性上限，但能力绑在超长 system 里。{{cite:note-prompt-core}}\n\n**② 压力：泄露与越权**——策略/密钥活在 prompt 里，泄露即事故，逼着外置。{{cite:note-prompt-leak}}\n\n**③ Skill 格式**——元数据+结构化说明，变成可安装能力包。{{cite:note-skill-format}}\n\n**④ 路由危机**——包一多，边界不清就漂移。{{cite:note-skill-route}}\n\n**⑤ 发行物**——Google skills 一类把工程知识做成可版本管理的安装包。{{cite:note-google-skills}}\n\n主脊是「越来越像软件制品」；右挂观点与笔记卡。",
    }],
    graph: {
      nodes: [
        N.intent("ki", "能力如何外置？", 360, 30, "Prompt→Skill"),
        N.spine("ks1", "① 结构化提示词", 360, 140, "稳定性上限", true),
        N.spine("ks2", "② 泄露压力", 360, 250, "策略不该活在上下文", true),
        N.spine("ks3", "③ Skill 能力包", 360, 360, "可安装/可共享", true),
        N.spine("ks4", "④ 路由与边界", 360, 470, "包多了的新瓶颈", true),
        N.spine("ks5", "⑤ 可版本发行", 360, 580, "工程知识制品化", true),
        N.action("ka", "下一步：写清边界+观测", 360, 700, "少加包，先分责"),
        N.branch("kb1", "绑在 system 难共享", 600, 130, "AI 总结"),
        N.branch("kb2", "合规驱动外置", 600, 240, "避坑"),
        N.branch("kb3", "轻量于重框架", 600, 350, "AI 总结"),
        N.branch("kb4", "漂移←职责重叠", 600, 460, "避坑"),
        N.branch("kb5", "口头传统→发行物", 600, 570, "AI 总结"),
        N.note("kn1", "提示词命脉", 800, 110, "note-prompt-core"),
        N.note("kn2", "提示泄露", 800, 220, "note-prompt-leak"),
        N.note("kn3", "Skill 综述", 800, 340, "note-skill-format"),
        N.note("kn4", "路由分析", 800, 450, "note-skill-route"),
        N.note("kn5", "Google skills", 800, 560, "note-google-skills"),
      ],
      edges: [
        E("ke0", "ki", "ks1"), E("ke1", "ks1", "ks2", "压力"), E("ke2", "ks2", "ks3"),
        E("ke3", "ks3", "ks4", "代价"), E("ke4", "ks4", "ks5"), E("ke5", "ks5", "ka"),
        E("keb1", "ks1", "kb1"), E("keb2", "ks2", "kb2"), E("keb3", "ks3", "kb3"),
        E("keb4", "ks4", "kb4"), E("keb5", "ks5", "kb5"),
        E("ken1", "kb1", "kn1"), E("ken2", "kb2", "kn2"), E("ken3", "kb3", "kn3"),
        E("ken4", "kb4", "kn4"), E("ken5", "kb5", "kn5"),
      ],
    },
    highlightIds: ["ks1", "ks3", "ks5", "ka"],
  },
];

export const SKILL_META = {
  id: "ws-skill-evo",
  title: "提示词→Skill",
  subtitle: "能力封装演进",
  branch: "问题：能力如何一步步外置？",
  canvasTitle: "Prompt → Skill 演进链",
  when: "2 天前",
};

/** ③ GPU：堆卡 → 带宽 → 单卡 → Token 运营 */
export const SCRIPT_GPU: DemoStep[] = [
  {
    id: "g0",
    title: "细问",
    holdMs: 550,
    phase: "clarify",
    chat: [{
      id: "gu0",
      role: "user",
      text: "本地推理想堆多卡，但笔记里好像说单卡 A800 更划算？把「为什么」按决策顺序梳一下。",
    }],
  },
  {
    id: "g1",
    title: "决策链",
    holdMs: 1000,
    phase: "final",
    canvasHint: "推理部署决策顺序：带宽优先",
    chat: [{
      id: "ga1",
      role: "assistant",
      text: "仓库里的工程经验其实是一条**纠错链**：\n\n**① 常见直觉**——不够快就加卡。资源地图提醒先看选型/量化/并行，别跳步。{{cite:note-gpu-map}}\n\n**② 关键转折**——显存带宽往往比算力更重要；单卡 A800 优于双卡 PCIe 互联。{{cite:note-gpu-bandwidth}}\n\n**③ 多卡正当条件**——模型放不进单卡，或有 NVLink 一类高效互联。{{cite:note-gpu-bandwidth}}\n\n**④ 软件层**——前缀缓存/批处理等词元运营，否则硬件红利被请求形态吃掉。{{cite:note-token-opt}}\n\n所以顺序是：先问带宽与能否单卡 → 再问该不该多卡 → 再问词元运营。",
    }],
    graph: {
      nodes: [
        N.intent("gi", "该不该堆多卡？", 360, 40, "本地推理"),
        N.spine("gs1", "① 直觉：加卡", 360, 160, "常跳过量化与观测", true),
        N.spine("gs2", "② 带宽>算力", 360, 290, "关键实测转折", true),
        N.spine("gs3", "③ 多卡条件", 360, 420, "放不下或高效互联", true),
        N.spine("gs4", "④ 词元运营", 360, 550, "缓存/批处理", true),
        N.action("ga", "默认：单卡吃满再谈扩展", 360, 680, "PCIe 双卡慎入"),
        N.branch("gb1", "地图：先选型量化", 620, 150, "AI 总结"),
        N.branch("gb2", "A800 > PCIe×2", 620, 280, "实测"),
        N.branch("gb3", "否则通信吃掉加速", 620, 410, "避坑"),
        N.branch("gb4", "硬件红利需软件接住", 620, 540, "AI 总结"),
        N.note("gn1", "工程资源地图", 820, 130, "note-gpu-map"),
        N.note("gn2", "带宽实测", 820, 270, "note-gpu-bandwidth", "文+图"),
        N.note("gn3", "Token 白皮书", 820, 530, "note-token-opt"),
      ],
      edges: [
        E("ge0", "gi", "gs1"), E("ge1", "gs1", "gs2", "纠错"), E("ge2", "gs2", "gs3"),
        E("ge3", "gs3", "gs4"), E("ge4", "gs4", "ga"),
        E("geb1", "gs1", "gb1"), E("geb2", "gs2", "gb2"), E("geb3", "gs3", "gb3"),
        E("geb4", "gs4", "gb4"),
        E("gen1", "gb1", "gn1"), E("gen2", "gb2", "gn2"), E("gen3", "gb3", "gn2"),
        E("gen4", "gb4", "gn3"),
      ],
    },
    highlightIds: ["gs2", "gs3", "ga", "gn2"],
  },
];

export const GPU_META = {
  id: "ws-gpu",
  title: "推理部署决策",
  subtitle: "堆卡→带宽→单卡",
  branch: "问题：本地推理该不该堆多卡？",
  canvasTitle: "GPU 推理决策链",
  when: "本周",
};

/** ④ 间隔重复：原理→争议→提取澄清→本周动作 */
export const SCRIPT_SR: DemoStep[] = [
  {
    id: "s0",
    title: "细问",
    holdMs: 550,
    phase: "clarify",
    chat: [{
      id: "su0",
      role: "user",
      text: "间隔重复相关笔记有好几条，有的讲原理有的在吵证据。我想要一条「先信什么、再做什么」的顺序。",
    }],
  },
  {
    id: "s1",
    title: "学习链",
    holdMs: 1000,
    phase: "final",
    canvasHint: "间隔重复：理论→校准→澄清→行动",
    chat: [{
      id: "sa1",
      role: "assistant",
      text: "按库里 peda 向笔记，建议顺序是：\n\n**① 原理**——在遗忘临界复习，关键是「何时再见」。{{cite:note-sr-outline}}\n\n**② 证据校准**——有效，但样本量与外推常被质疑；别把实验室效应直接当自己的题库质量。{{cite:note-sr-debate}}\n\n**③ 概念分清**——提取练习是动作，间隔重复是日程；混用会只刷题或只再认。{{cite:note-sr-extract}}\n\n**④ 本周动作**——先为错题做提取卡，再丢进间隔日程。{{cite:note-sr-extract}}\n\n这是「认知→校准→定义→执行」链，不是平行清单。",
    }],
    graph: {
      nodes: [
        N.intent("si", "间隔重复怎么落地？", 360, 40, "先信什么再做什么"),
        N.spine("ss1", "① 原理：遗忘临界", 360, 160, "何时再见", true),
        N.spine("ss2", "② 证据校准", 360, 290, "样本量/外推", true),
        N.spine("ss3", "③ 提取 ≠ 间隔", 360, 420, "动作 vs 日程", true),
        N.spine("ss4", "④ 本周制卡+排程", 360, 550, "先提取卡", true),
        N.action("sa", "本周：错题→提取卡→SRS", 360, 680, "可执行"),
        N.branch("sb1", "少次数巩固长期", 620, 150, "AI 总结"),
        N.branch("sb2", "警惕场景外推", 620, 280, "对标"),
        N.branch("sb3", "混用是常见失败", 620, 410, "澄清"),
        N.branch("sb4", "顺序不能反", 620, 540, "AI 总结"),
        N.note("sn1", "科普大纲", 820, 130, "note-sr-outline"),
        N.note("sn2", "证据争议", 820, 270, "note-sr-debate"),
        N.note("sn3", "提取澄清", 820, 450, "note-sr-extract", "片段×2"),
      ],
      edges: [
        E("se0", "si", "ss1"), E("se1", "ss1", "ss2", "校准"), E("se2", "ss2", "ss3"),
        E("se3", "ss3", "ss4", "执行"), E("se4", "ss4", "sa"),
        E("seb1", "ss1", "sb1"), E("seb2", "ss2", "sb2"), E("seb3", "ss3", "sb3"),
        E("seb4", "ss4", "sb4"),
        E("sen1", "sb1", "sn1"), E("sen2", "sb2", "sn2"), E("sen3", "sb3", "sn3"),
        E("sen4", "sb4", "sn3"),
      ],
    },
    highlightIds: ["ss1", "ss3", "sa"],
  },
];

export const SR_META = {
  id: "ws-sr",
  title: "间隔重复落地",
  subtitle: "原理→校准→行动",
  branch: "问题：间隔重复先信什么再做什么？",
  canvasTitle: "间隔重复学习链",
  when: "3 天前",
};
