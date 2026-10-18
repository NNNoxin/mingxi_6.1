/**
 * 机制样例 · Skill 膨胀负闭环 + 破局环（渐进生长）
 *
 * 单点：能力包越加越多，为什么反而更不稳？
 * 节奏：短疑似回流 → 多视角深挖 → 负环闭合可见 → 错误归因死胡同 → 外侧破局环
 */
import type { DemoEdge, DemoNode, DemoStep } from "./think-replay-types.ts";

const N = {
  intent: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "intent", x, y, badge: "单点",
  }),
  spine: (id: string, label: string, x: number, y: number, sub?: string, done?: boolean): DemoNode => ({
    id, label, sub, kind: "spine", x, y, badge: "机制", done,
  }),
  branch: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "branch", x, y, badge: "视角",
  }),
  note: (id: string, label: string, x: number, y: number, noteId: string, sub?: string): DemoNode => ({
    id, label, sub, kind: "note", x, y, badge: "笔记", noteId, done: true,
  }),
  action: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "action", x, y, badge: "破局", done: true,
  }),
  gate: (id: string, label: string, x: number, y: number, sub?: string): DemoNode => ({
    id, label, sub, kind: "gate", x, y, badge: "澄清",
  }),
};

function E(
  id: string,
  from: string,
  to: string,
  label?: string,
  tone?: DemoEdge["tone"],
): DemoEdge {
  return { id, from, to, label, tone };
}

export const SCRIPT_SKILL_LOOP: DemoStep[] = [
  {
    id: "lp0",
    title: "单点困惑",
    holdMs: 700,
    phase: "clarify",
    canvasHint: "单点机制题：越加 Skill 越不稳？",
    chat: [
      {
        id: "lpu0",
        role: "user",
        text: "我按笔记把 Skill 越装越多，覆盖面是宽了，但路由更飘、返工更多。这是不是「能力不够」？还是我掉进某种自我强化的坑里了？",
      },
    ],
  },
  {
    id: "lp1",
    title: "确认拆机制",
    holdMs: 850,
    phase: "clarify",
    canvasHint: "先短后环 · 多视角拆同一机制",
    chat: [
      {
        id: "lpt1",
        role: "thinking",
        text: "单点已清：Skill 膨胀与稳定性的关系。应用负闭环叙事，避免再铺「Skill 是什么」概念课。先给两点一线的疑似回流，再按产品/路由/提示词/观测四视角补全，最后画破局环。",
      },
      {
        id: "lpa1",
        role: "assistant",
        text: "更像**机制问题**，不是「再学一个 Skill 格式」能消掉的。我建议拆成闭环看：你是不是在用「加包」回答「不稳」。先确认切入：",
        options: [
          {
            id: "lp-mech",
            level: "方式",
            label: "拆机制闭环",
            desc: "不稳↔加包 是否自我强化",
          },
          {
            id: "lp-view",
            level: "节奏",
            label: "多视角逐步补全",
            desc: "产品 / 路由 / 提示词 / 观测",
          },
          {
            id: "lp-short",
            level: "节奏",
            label: "短图起步",
            desc: "先两点一线，追问再成环",
          },
        ],
        autoPick: ["lp-mech", "lp-view", "lp-short"],
      },
    ],
    graph: {
      nodes: [N.gate("lpg", "越加越不稳？", 420, 200, "机制题 · 待拆")],
      edges: [],
    },
    highlightIds: ["lpg"],
  },
  {
    id: "lp2",
    title: "首答·疑似回流",
    holdMs: 1000,
    phase: "draft",
    canvasHint: "故意很短：不稳 → 加包（回流还虚线感）",
    chat: [
      {
        id: "lpu1",
        role: "user",
        text: "拆机制；短图就好，我跟着追问。",
      },
      {
        id: "lpa2",
        role: "assistant",
        text: "先只放两块（右侧极短）：\n\n**系统不稳** ←?→ **继续加 Skill**\n\n仓库里「可安装能力包」本身没错 {{cite:note-skill-format}}，但若每次不稳的处方都是加包，你可能在喂一个负环。  \n此刻回流箭头还只是假说——你想先从哪个视角验证？",
      },
    ],
    graph: {
      nodes: [
        N.intent("lpi", "越加越不稳？", 400, 40, "单点机制"),
        N.spine("lpA", "系统不稳", 220, 220, "飘 / 返工 / 体感差", true),
        N.spine("lpB", "继续加 Skill", 580, 220, "覆盖更多场景", true),
      ],
      edges: [
        E("le0", "lpi", "lpA"),
        E("le1", "lpi", "lpB"),
        E("le2", "lpA", "lpB", "处方？", "warn"),
        E("le3", "lpB", "lpA", "回流？", "loop"),
      ],
    },
    highlightIds: ["lpA", "lpB"],
  },
  {
    id: "lp3",
    title: "追问·产品视角",
    holdMs: 800,
    phase: "extend",
    chat: [
      {
        id: "lpu2",
        role: "user",
        text: "产品视角：场景变多，不加 Skill 怎么覆盖？不加不就是能力缺口吗？",
      },
    ],
  },
  {
    id: "lp4",
    title: "生长·产品视角节点",
    holdMs: 1000,
    phase: "extend",
    canvasHint: "补上「场景压力」——负环的燃料入口",
    chat: [
      {
        id: "lpa3",
        role: "assistant",
        text: "产品视角成立的一半：场景变多会产生**真实压力**。  \n但不成立的一半：压力的出口不一定是「新包」。也可以是合并、拒绝场景、或把差异收进同一 Skill 的参数。{{cite:note-skill-format}}\n\n右侧挂上「场景压力」视角——它给加包提供正当性，也是环的燃料。",
      },
    ],
    graph: {
      nodes: [
        N.intent("lpi", "越加越不稳？", 400, 30, "单点机制"),
        N.spine("lpA", "系统不稳", 200, 200, "飘 / 返工", true),
        N.spine("lpB", "继续加 Skill", 600, 200, "覆盖场景", true),
        N.branch("lpP", "产品视角：场景压力", 400, 360, "燃料入口"),
        N.note("lpn1", "Skill 综述", 400, 500, "note-skill-format", "正例·能力包"),
      ],
      edges: [
        E("le0", "lpi", "lpA"),
        E("le1", "lpi", "lpB"),
        E("le2", "lpA", "lpB", "处方", "warn"),
        E("le3", "lpB", "lpA", "回流？", "loop"),
        E("le4", "lpP", "lpB", "推动加包"),
        E("le5", "lpA", "lpP", "暴露缺口"),
        E("le6", "lpP", "lpn1"),
      ],
    },
    highlightIds: ["lpP", "lpn1"],
  },
  {
    id: "lp5",
    title: "追问·路由视角",
    holdMs: 800,
    phase: "extend",
    chat: [
      {
        id: "lpu3",
        role: "user",
        text: "路由日志里同任务会走到不同 Skill。这是模型笨，还是包之间边界有问题？",
      },
    ],
  },
  {
    id: "lp6",
    title: "生长·负环闭合",
    holdMs: 1200,
    phase: "extend",
    canvasHint: "负闭环已闭合：不稳→加包→边界糊→漂移→更不稳",
    chat: [
      {
        id: "lpt2",
        role: "thinking",
        text: "路由漂移是环上的关键齿轮。用路由笔记把「边界重叠」钉死，让回流从假说变成可见闭环。",
      },
      {
        id: "lpa4",
        role: "assistant",
        text: "路由视角通常更致命：同任务多 Skill 抢答，根因多是**边界未写清 / 职责重叠**，不是「再聪明一点」。{{cite:note-skill-route}}\n\n把齿轮补全后，负环可以画死：\n\n**不稳 → 加包 → 边界更糊 → 路由漂移 → 更不稳**\n\n右侧回流边已标成「负闭环」。你若下一步想「加长提示词压住」，我们先别急——那是常见的归错层。",
      },
    ],
    graph: {
      nodes: [
        N.intent("lpi", "越加越不稳？", 420, 20, "机制已显影"),
        N.spine("lpA", "① 系统不稳", 420, 130, "体感/返工", true),
        N.spine("lpB", "② 继续加 Skill", 200, 280, "覆盖冲动", true),
        N.spine("lpC", "③ 边界更糊", 420, 430, "职责重叠", true),
        N.spine("lpD", "④ 路由漂移", 640, 280, "同任务多路径", true),
        N.branch("lpP", "产品：场景压力", 80, 130, "燃料"),
        N.branch("lpR", "路由视角", 780, 130, "验证齿轮"),
        N.note("lpn1", "Skill 综述", 80, 280, "note-skill-format"),
        N.note("lpn2", "路由分析", 780, 280, "note-skill-route", "避坑"),
      ],
      edges: [
        E("le0", "lpi", "lpA"),
        E("le1", "lpA", "lpB", "处方：加包", "warn"),
        E("le2", "lpB", "lpC", "包↑"),
        E("le3", "lpC", "lpD", "抢答"),
        E("le4", "lpD", "lpA", "负闭环", "loop"),
        E("le5", "lpP", "lpB", "推动"),
        E("le6", "lpA", "lpP", "暴露"),
        E("le7", "lpR", "lpD", "实证"),
        E("le8", "lpD", "lpR"),
        E("le9", "lpB", "lpn1"),
        E("le10", "lpD", "lpn2"),
      ],
    },
    highlightIds: ["lpC", "lpD", "lpn2"],
  },
  {
    id: "lp7",
    title: "追问·提示词死胡同",
    holdMs: 750,
    phase: "extend",
    chat: [
      {
        id: "lpu4",
        role: "user",
        text: "那我把 system 写得更凶、把路由规则塞进提示词，能不能先顶住？",
      },
    ],
  },
  {
    id: "lp8",
    title: "生长·错误归因支路",
    holdMs: 1100,
    phase: "extend",
    canvasHint: "死胡同：用提示词层去修 Skill 层问题",
    chat: [
      {
        id: "lpa5",
        role: "assistant",
        text: "短顶可能有，机制上常是**归错层**：路由漂移是 Skill 边界问题；把规则塞回提示词，还会叠泄露与不可维护。{{cite:note-prompt-leak}} {{cite:note-prompt-core}}\n\n右侧伸出一条警告支路（不到环上）——它消耗精力，却不切断负闭环。真要动运行约束，看的是 Harness/观测，不是更长说明书。{{cite:note-harness}}",
      },
    ],
    graph: {
      nodes: [
        N.intent("lpi", "越加越不稳？", 420, 20, "机制已显影"),
        N.spine("lpA", "① 系统不稳", 420, 120, "", true),
        N.spine("lpB", "② 继续加 Skill", 180, 260, "", true),
        N.spine("lpC", "③ 边界更糊", 420, 400, "", true),
        N.spine("lpD", "④ 路由漂移", 660, 260, "", true),
        N.branch("lpW", "错归因：加长提示词", 860, 120, "死胡同"),
        N.branch("lpP", "产品：场景压力", 60, 120, "燃料"),
        N.note("lpn2", "路由分析", 800, 320, "note-skill-route"),
        N.note("lpn3", "提示泄露", 1000, 80, "note-prompt-leak", "反例"),
        N.note("lpn4", "Harness 摘记", 1000, 200, "note-harness", "正确层"),
      ],
      edges: [
        E("le1", "lpA", "lpB", "加包", "warn"),
        E("le2", "lpB", "lpC"),
        E("le3", "lpC", "lpD"),
        E("le4", "lpD", "lpA", "负闭环", "loop"),
        E("le5", "lpP", "lpB"),
        E("le6", "lpA", "lpP"),
        E("le7", "lpD", "lpW", "常见逃逸", "warn"),
        E("le8", "lpW", "lpn3", "风险"),
        E("le9", "lpW", "lpn4", "本应去这"),
        E("le10", "lpD", "lpn2"),
        E("le0", "lpi", "lpA"),
      ],
    },
    highlightIds: ["lpW", "lpn3", "lpn4"],
  },
  {
    id: "lp9",
    title: "追问·如何破局",
    holdMs: 800,
    phase: "extend",
    chat: [
      {
        id: "lpu5",
        role: "user",
        text: "负环我认了。破局环怎么画？我要能停下来，而不是道德上「少加点」。",
      },
    ],
  },
  {
    id: "lp10",
    title: "生长·外侧破局环",
    holdMs: 1300,
    phase: "final",
    canvasHint: "双环对照：内侧负闭环 · 外侧破局环",
    chat: [
      {
        id: "lpa6",
        role: "assistant",
        text: "破局不是「少加点」的口号，是另一组**可运转**的反馈：\n\n**写清边界 → 可观测（路由/失败）→ 合并或拒绝场景 → 稳定 → 才有资格加新能力**\n\n- 边界：回到 Skill 作为制品的纪律 {{cite:note-skill-format}}  \n- 漂移信号：用路由笔记里的可观测指标当环上传感器 {{cite:note-skill-route}}  \n- 执行现场：门禁与回退归 Harness {{cite:note-harness}}\n\n右侧：**内侧红/珊瑚回流 = 负闭环**；**外侧绿破局环**与之对照。同一批笔记按「在哪个环上」重挂，比再开一个「Skill 教程」主题更有用。",
      },
    ],
    graph: {
      nodes: [
        N.intent("lpi", "机制：膨胀 vs 破局", 100, 40, "双环对照"),
        // 负环（内侧偏右上）
        N.spine("lpA", "不稳", 520, 100, "负环①", true),
        N.spine("lpB", "加 Skill", 700, 220, "负环②", true),
        N.spine("lpC", "边界糊", 520, 340, "负环③", true),
        N.spine("lpD", "路由漂移", 340, 220, "负环④", true),
        // 破局环（外侧偏下）
        N.action("lpX1", "写清边界", 280, 480, "破局①"),
        N.action("lpX2", "可观测", 480, 560, "破局②"),
        N.action("lpX3", "合并/拒场景", 680, 480, "破局③"),
        N.action("lpX4", "稳定后再加", 480, 400, "破局④"),
        N.branch("lpW", "死胡同：加长提示词", 860, 80, "归错层"),
        N.note("lpn1", "Skill 综述", 160, 480, "note-skill-format"),
        N.note("lpn2", "路由分析", 200, 200, "note-skill-route"),
        N.note("lpn4", "Harness", 820, 560, "note-harness"),
        N.note("lpn3", "提示泄露", 1000, 60, "note-prompt-leak"),
      ],
      edges: [
        // 负闭环
        E("ln1", "lpA", "lpB", "加包", "warn"),
        E("ln2", "lpB", "lpC", "膨胀"),
        E("ln3", "lpC", "lpD", "重叠"),
        E("ln4", "lpD", "lpA", "负闭环", "loop"),
        // 破局环
        E("lb1", "lpX1", "lpX2", "破局", "break"),
        E("lb2", "lpX2", "lpX3", "破局", "break"),
        E("lb3", "lpX3", "lpX4", "破局", "break"),
        E("lb4", "lpX4", "lpX1", "破局环", "break"),
        // 桥：从负环进入破局
        E("lb5", "lpD", "lpX1", "改走这里", "break"),
        E("lb6", "lpC", "lpX1", "先写边界", "break"),
        // 死胡同
        E("lw1", "lpA", "lpW", "逃逸", "warn"),
        E("lw2", "lpW", "lpn3"),
        // 笔记
        E("ln5", "lpX1", "lpn1"),
        E("ln6", "lpD", "lpn2"),
        E("ln7", "lpX2", "lpn4"),
        E("ln0", "lpi", "lpA"),
      ],
    },
    highlightIds: ["lpX1", "lpX2", "lpX3", "lpX4", "lpA", "lpD"],
  },
];

export const SKILL_LOOP_META = {
  id: "ws-skill-loop",
  title: "Skill膨胀闭环",
  subtitle: "负环 + 破局环",
  branch: "机制：越加越不稳如何成环？",
  canvasTitle: "Skill 膨胀 · 双环对照",
  when: "主推",
};
