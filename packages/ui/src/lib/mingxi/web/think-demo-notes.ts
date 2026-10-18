/**
 * 梳逻辑 Demo · 模拟笔记仓库
 * 每条 bodyHtml 按「完整笔记页」写：主旨 / 分节 / 要点 / 黄标片段
 */

export type DemoNoteFragment = {
  id: string;
  kind: "text" | "image";
  excerpt: string;
  relevance: string;
};

export type DemoNoteCard = {
  id: string;
  title: string;
  sourceTitle: string;
  domainPath: string[];
  purposeLabel: string;
  polarity: string;
  summary: string;
  thumbLabel: string;
  thumbTone: "rose" | "sage" | "ink" | "blue" | "sand";
  yearHint: string;
  bodyHtml: string;
  figureHtml?: string;
  fragments: DemoNoteFragment[];
};

export const DEMO_NOTE_CARDS: DemoNoteCard[] = [
  {
    id: "note-buffer-window",
    title: "对话缓冲与滑动窗口：最早的「短期记忆」工程做法",
    sourceTitle: "从0到1搭建Agent-原理分析笔记",
    domainPath: ["工程与技术科学", "人工智能", "Agent", "对话管理"],
    purposeLabel: "反例避坑",
    polarity: "neutral_observe",
    summary: "早期 Agent 多用最近 K 轮原文塞进 context，超长则截断——实现最便宜，也最早暴露「重要约束滑出窗口」的问题。",
    thumbLabel: "滑动窗口",
    thumbTone: "sand",
    yearHint: "2023 前后",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>滑动窗口是几乎所有早期 Agent 的默认短期记忆：用最近 K 轮原文换「还能继续聊」，用截断换 token 预算。</div>
      <h2>背景</h2>
      <p>多数教程把「记忆」写成黑盒。实际上第一代产品几乎都是同一招，并不神秘。</p>
      <p><mark data-frag="f-buf-1">把最近 K 轮 user/assistant 原文原样拼进 prompt，超出 token 预算就从最早轮次截断——这就是滑动窗口短期记忆。</mark></p>
      <h2>优点与代价</h2>
      <ul>
        <li>实现成本接近零，任何聊天 API 都能做</li>
        <li>行为可解释：人眼能看见「还记得哪些轮」</li>
        <li>代价：重要约束一旦滑出窗口就永久丢失；费用随轮次近似线性上涨</li>
      </ul>
      <h2>工程经验值</h2>
      <p><mark data-frag="f-buf-2">经验值：客服类 Agent 常用 K=8～16；编码 Agent 常把「当前文件+最近报错」固定钉在窗口头部，再滑动态轮次。</mark></p>
      <blockquote>钉住硬约束（人设、安全、当前任务卡）再滑其余轮次，比盲目加大 K 更有效。</blockquote>
      <h2>何时该升级</h2>
      <p>当「用户上周说过的约束」反复丢失、或多步工具状态对不上时，再考虑摘要槽、scratchpad 或分层记忆——而不是先把 K 加到 64。</p>
    `,
    fragments: [
      {
        id: "f-buf-1",
        kind: "text",
        excerpt: "最近 K 轮原文拼进 prompt，超出则截断——滑动窗口短期记忆",
        relevance: "定义了最早、最常见的短期记忆形态",
      },
      {
        id: "f-buf-2",
        kind: "text",
        excerpt: "客服 K=8～16；编码 Agent 钉住当前文件+报错再滑动态轮次",
        relevance: "给出可执行的窗口参数经验",
      },
    ],
  },
  {
    id: "note-summary-memory",
    title: "递归摘要进上下文：用压缩换「更长的短期」",
    sourceTitle: "Agentic Harness Engineering 摘记",
    domainPath: ["工程与技术科学", "人工智能", "Agent", "上下文工程"],
    purposeLabel: "对标拆解",
    polarity: "positive_exemplar",
    summary: "窗口不够时，把旧轮次压成摘要再写回 memory 槽——比纯截断更能留住决策与约束，但会引入摘要幻觉。",
    thumbLabel: "递归摘要",
    thumbTone: "sage",
    yearHint: "2023–2024",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>递归摘要是滑动窗口之后的主流补丁：用压缩换有效短期长度，关键是分槽与更新频率。</div>
      <h2>机制</h2>
      <p>Harness 笔记里有一节专门写 context compaction：</p>
      <p><mark data-frag="f-sum-1">当滑动窗口即将溢出，先对「即将被挤出」的轮次做一次摘要，把摘要写回 memory 槽位，再继续对话——形成递归摘要短期记忆。</mark></p>
      <h2>相对截断的收益</h2>
      <ul>
        <li>更能保留决策、承诺与硬约束</li>
        <li>token 增长更接近对数而非线性</li>
      </ul>
      <p>代价是摘要幻觉、细节丢失，以及「摘要何时失效」难测。</p>
      <h2>可操作结构</h2>
      <p><mark data-frag="f-sum-2">实践上常拆成两段摘要：facts（用户偏好/硬约束）与 narrative（情节进展）；facts 用更高权重、更低频更新。</mark></p>
      <blockquote>facts 写错一次会长期污染；宁可少写、人工可改，也不要自动把猜测写进 facts。</blockquote>
    `,
    fragments: [
      {
        id: "f-sum-1",
        kind: "text",
        excerpt: "溢出前摘要旧轮次写回 memory 槽位——递归摘要短期记忆",
        relevance: "时间线上紧接滑动窗口之后的主流方案",
      },
      {
        id: "f-sum-2",
        kind: "text",
        excerpt: "facts 与 narrative 分槽；facts 更高权重、更低频更新",
        relevance: "可操作的摘要结构设计",
      },
    ],
  },
  {
    id: "note-scratchpad",
    title: "Scratchpad / 工作记忆：把「正在算的东西」外置",
    sourceTitle: "Skill路由问题分析",
    domainPath: ["工程与技术科学", "人工智能", "Agent", "工具编排"],
    purposeLabel: "反例避坑",
    polarity: "negative_caution",
    summary: "路由失败常因中间状态只活在隐式上下文里；scratchpad 把它显式化，但也必须有过期策略。",
    thumbLabel: "工作草稿",
    thumbTone: "rose",
    yearHint: "2024",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>Scratchpad 是短期记忆的第三种形态：外置、可读写的工作区，专门扛规划与中间 JSON。</div>
      <h2>问题从哪来</h2>
      <p>这篇主线是 Skill 路由，但有一段直接点到短期记忆形态：多步工具调用时，「算到哪一步」若只活在模型隐式状态里，下一轮很容易漂移。</p>
      <p><mark data-frag="f-scr-1">把规划步骤、候选 Skill、中间 JSON 写进可读写的 scratchpad（工作记忆），而不是指望模型在多轮对话里「自己记得算到哪」。</mark></p>
      <h2>结构示意</h2>
      <figure data-frag="f-scr-img" class="tld-fig">
        <div class="tld-fig-frame">Scratchpad · 当前目标 / 已试 Skill / 待验证假设</div>
        <figcaption>示意：工作记忆外置后，路由与反思读写同一块板</figcaption>
      </figure>
      <h2>避雷</h2>
      <p><mark data-frag="f-scr-2">注意：scratchpad 若无过期策略，会变成第二种「无限膨胀的短期记忆」。</mark></p>
      <ul>
        <li>任务结束清空或归档</li>
        <li>只保留「当前目标 + 最近 N 次尝试」</li>
        <li>与对话窗口分开计量 token</li>
      </ul>
    `,
    fragments: [
      {
        id: "f-scr-1",
        kind: "text",
        excerpt: "规划步骤与中间 JSON 写入可读写 scratchpad（工作记忆）",
        relevance: "短期记忆的第三种形态：外置工作区",
      },
      {
        id: "f-scr-img",
        kind: "image",
        excerpt: "Scratchpad 示意框：目标 / 已试 Skill / 假设",
        relevance: "可视化工作记忆结构",
      },
      {
        id: "f-scr-2",
        kind: "text",
        excerpt: "scratchpad 无过期策略会再次膨胀",
        relevance: "避雷：工作记忆也要有淘汰",
      },
    ],
  },
  {
    id: "note-retrieval-stm",
    title: "检索式短期记忆：最近轨迹的向量召回",
    sourceTitle: "纯文本RAG-SOTA总结（旁支笔记）",
    domainPath: ["工程与技术科学", "人工智能", "检索增强生成", "记忆检索"],
    purposeLabel: "学习理论",
    polarity: "mixed",
    summary: "把 RAG 手法迁到会话轨迹：近端 chunk 向量召回作软短期记忆；必须加时间衰减，否则会时间错位。",
    thumbLabel: "轨迹召回",
    thumbTone: "blue",
    yearHint: "2024–2025",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>检索式短期记忆不保证时间连续，但能跨窗口找回相关约束；工程关键是「相似度 + 时间」联合排序。</div>
      <h2>做法</h2>
      <p>主文讲文档 RAG，但有一节把同一套检索用在会话轨迹上：</p>
      <p><mark data-frag="f-ret-1">把近端对话 chunk 进向量库，每轮按当前 query 召回 top-k 历史片段拼进 context——这是「检索式短期记忆」，不保证时间连续，但能跨窗口找回关键约束。</mark></p>
      <h2>与长期知识库的差别</h2>
      <ul>
        <li>语料是本会话 / 近会话，时效更强</li>
        <li>索引更频繁重建（甚至每轮增量）</li>
        <li>召回目标是「约束与承诺」，不是百科知识</li>
      </ul>
      <h2>常见坑</h2>
      <p><mark data-frag="f-ret-2">坑：只用相似度会召回语义近但时间错位的片段；需要时间衰减或「最近优先」重排。</mark></p>
      <blockquote>评测时同时看：约束找回率、时间错位率、以及拼进 context 后是否反而干扰当前任务。</blockquote>
    `,
    fragments: [
      {
        id: "f-ret-1",
        kind: "text",
        excerpt: "近端对话向量召回 top-k 拼进 context——检索式短期记忆",
        relevance: "把 RAG 手法迁到会话轨迹",
      },
      {
        id: "f-ret-2",
        kind: "text",
        excerpt: "需时间衰减或最近优先重排，避免时间错位",
        relevance: "检索式 STM 的关键工程约束",
      },
    ],
  },
  {
    id: "note-memgpt",
    title: "分层记忆与 OS 隐喻：短期页 vs 长期盘",
    sourceTitle: "Agent Skills 技术总结综述",
    domainPath: ["工程与技术科学", "人工智能", "Agent", "记忆架构"],
    purposeLabel: "对标拆解",
    polarity: "positive_exemplar",
    summary: "MemGPT 一类工作把 context 当 RAM、库当磁盘；短期变成「当前页 + 工作集」，需要显式 page-in/out。",
    thumbLabel: "分层记忆",
    thumbTone: "ink",
    yearHint: "2024–2025",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>分层记忆重新定义短期：不是「窗口里有什么」，而是「当前页与工作集能否被正确换入」。</div>
      <h2>隐喻</h2>
      <p>Skills 综述在「运行时状态」一节写到：</p>
      <p><mark data-frag="f-mem-1">把 context 窗口当作 RAM（短期），把向量库/文档库当作磁盘（长期）；模型通过显式 page-in / page-out 工具搬移记忆——短期记忆变成「当前页 + 工作集」。</mark></p>
      <h2>相对单一窗口</h2>
      <p>更接近操作系统，也要求工具协议与策略模型更成熟：谁决定换出、换错了如何回滚。</p>
      <h2>落地最小集</h2>
      <p><mark data-frag="f-mem-2">落地最小集：core（永不换出的人设/硬约束）+ recall（可检索）+ archival（冷数据）。短期问题主要发生在 core 与当前工作集的边界。</mark></p>
      <ul>
        <li>core：人设、安全、当前任务卡</li>
        <li>recall：近会话与中期事实</li>
        <li>archival：冷文档与历史归档</li>
      </ul>
    `,
    fragments: [
      {
        id: "f-mem-1",
        kind: "text",
        excerpt: "context≈RAM，库≈磁盘；page-in/out 搬移——短期=当前页+工作集",
        relevance: "当代分层记忆对「短期」的重新定义",
      },
      {
        id: "f-mem-2",
        kind: "text",
        excerpt: "core / recall / archival 最小分层；短期矛盾在 core 与工作集边界",
        relevance: "可落地的分层清单",
      },
    ],
  },
  {
    id: "note-kv-attention",
    title: "KV Cache 与注意力侧的「有效短期」",
    sourceTitle: "面向Token词元运营的推理优化白皮书·摘录",
    domainPath: ["工程与技术科学", "人工智能", "推理优化", "上下文效率"],
    purposeLabel: "资料收藏",
    polarity: "neutral_observe",
    summary: "推理侧压缩 KV 会让名义窗口与有效注意力不一致——评测短期记忆必须同时看拼装与推理栈。",
    thumbLabel: "KV / 注意力",
    thumbTone: "blue",
    yearHint: "2025",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>名义 context 长度 ≠ 模型有效记忆长度；Attention sink 与流式 KV 淘汰会造成「隐形失忆」。</div>
      <h2>产品侧常忽略的一层</h2>
      <p>白皮书主线是推理成本，但有一段提醒产品侧：</p>
      <p><mark data-frag="f-kv-1">Attention sink、流式 KV 淘汰、动态 KV 压缩会让「名义上还在窗口里」的 token 实际注意力权重趋近于零——短期记忆在系统层与模型层可能不一致。</mark></p>
      <h2>示意</h2>
      <figure data-frag="f-kv-img" class="tld-fig">
        <div class="tld-fig-frame">Pyramid / Streaming KV · 远端 token 被压缩或丢弃</div>
        <figcaption>示意：工程窗口长度 ≠ 模型有效记忆长度</figcaption>
      </figure>
      <h2>评测含义</h2>
      <p>评测短期记忆方案时，不能只看 prompt 拼装策略，还要看推理栈是否静默丢掉了关键前缀。钉在窗口头部的硬约束，在某些压缩策略下仍可能「名义在、注意力无」。</p>
    `,
    fragments: [
      {
        id: "f-kv-1",
        kind: "text",
        excerpt: "KV 淘汰/压缩导致名义窗口与有效注意力不一致",
        relevance: "短期记忆的「隐形损耗」层",
      },
      {
        id: "f-kv-img",
        kind: "image",
        excerpt: "Pyramid/Streaming KV 示意",
        relevance: "图示有效短期记忆被压缩",
      },
    ],
  },

  {
    id: "note-bm25",
    title: "BM25 仍是企业级默认：稳健、便宜、可解释",
    sourceTitle: "小红书·RAG BM25 洞察",
    domainPath: ["工程与技术科学", "人工智能", "信息检索"],
    purposeLabel: "对标拆解",
    polarity: "positive_exemplar",
    summary: "大规模场景里稀疏检索仍是底盘：不是被向量取代，而是被组合进混合检索。",
    thumbLabel: "BM25",
    thumbTone: "sand",
    yearHint: "经典→2024",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>BM25 是混合检索的稀疏腿：硬匹配字段上仍比纯稠密更稳，成本更低、可解释性更好。</div>
      <h2>为什么还没「过时」</h2>
      <p>企业级检索里有一句常被忽略的话：</p>
      <p><mark data-frag="f-bm-1">BM25 作为稳健、低成本的检索方法，仍是大规模场景下的默认选择；药名/病名/缩写这类必须硬匹配的字段，纯稠密向量更容易漂。</mark></p>
      <h2>在谱系中的位置</h2>
      <ul>
        <li>单独用：简单 FAQ、关键词强的库</li>
        <li>混合用：稀疏腿 + 稠密腿，几乎成为 2024 后默认</li>
        <li>后续：重排与融合往往比盲目换更大嵌入更划算</li>
      </ul>
      <blockquote>评测时请单独报稀疏命中率，避免「上了向量就进步」的错觉。</blockquote>
    `,
    fragments: [
      {
        id: "f-bm-1",
        kind: "text",
        excerpt: "BM25 仍是大规模默认；硬匹配字段上稠密易漂",
        relevance: "检索范式时间线的起点/底盘",
      },
    ],
  },
  {
    id: "note-rag-sota",
    title: "纯文本 RAG 谱系：稀疏→稠密→混合→重排→生成控制",
    sourceTitle: "纯文本RAG-SOTA总结",
    domainPath: ["工程与技术科学", "人工智能", "检索增强生成"],
    purposeLabel: "学习理论",
    polarity: "positive_exemplar",
    summary: "按模块拆前沿架构：混合几乎必选；医疗等场景重排优先于盲目换更大嵌入。",
    thumbLabel: "RAG谱系",
    thumbTone: "sage",
    yearHint: "2024–2026",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>RAG 演进主轴是稀疏→稠密→混合→重排→生成控制；落地优先级往往是「先混合与重排，再谈更大模型」。</div>
      <h2>主线</h2>
      <p>笔记把前沿拆成清晰阶段：</p>
      <p><mark data-frag="f-rag-1">检索范式从稀疏（BM25/SPLADE）走到稠密，再几乎必然落到混合；其后是重排/融合，再后是生成端纠错与可追溯。</mark></p>
      <h2>场景适配</h2>
      <p><mark data-frag="f-rag-2">对医疗诊断：指南/论文/FAQ + 云端 LLM 时，稀疏腿不可省，重排优先于盲目换更大嵌入模型。</mark></p>
      <h3>建议顺序</h3>
      <ol>
        <li>先保证稀疏底盘与字段硬匹配</li>
        <li>加稠密补语义与改写</li>
        <li>上重排/融合看收益曲线</li>
        <li>最后才动生成端约束与引用格式</li>
      </ol>
    `,
    fragments: [
      {
        id: "f-rag-1",
        kind: "text",
        excerpt: "稀疏→稠密→混合→重排→生成控制",
        relevance: "RAG 方案演进主轴",
      },
      {
        id: "f-rag-2",
        kind: "text",
        excerpt: "医疗场景稀疏腿不可省，重排优先于换更大嵌入",
        relevance: "落地优先级",
      },
    ],
  },
  {
    id: "note-rag-fail",
    title: "检索与推理失败模式：先分清是「找错」还是「想错」",
    sourceTitle: "research ideas·跳出框架",
    domainPath: ["工程与技术科学", "人工智能", "检索增强生成"],
    purposeLabel: "反例避坑",
    polarity: "negative_caution",
    summary: "RAG 翻车要先分层归因；混为一谈会做出伪需求的「新架构」。",
    thumbLabel: "失败归因",
    thumbTone: "rose",
    yearHint: "2025–2026",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>可靠性常常来自失败分层与评测设计，而不是再叠一个黑盒模块。</div>
      <h2>先拆两类失败</h2>
      <p>创新方向探索前，笔记强调：</p>
      <p><mark data-frag="f-fail-1">RAG 翻车要先拆：检索没命中 vs 命中后推理胡编；混为一谈会做出伪需求的「新架构」。</mark></p>
      <h2>常见伪需求</h2>
      <ul>
        <li>检索本就没命中，却去换更大生成模型</li>
        <li>命中正确却胡编，却去重训嵌入</li>
        <li>没有失败分层评测，却上多跳 Agent「看起来更炫」</li>
      </ul>
      <p><mark data-frag="f-fail-2">可解释与可靠性提升，往往来自失败分层与评测设计，而不是再叠一个黑盒模块。</mark></p>
      <blockquote>先做一张「找错 / 想错」混淆矩阵，再决定下一笔工程预算花在哪。</blockquote>
    `,
    fragments: [
      {
        id: "f-fail-1",
        kind: "text",
        excerpt: "先分检索失败 vs 推理失败，避免伪需求架构",
        relevance: "演进末期的评测/诊断层",
      },
      {
        id: "f-fail-2",
        kind: "text",
        excerpt: "可靠性常来自失败分层与评测，而非再叠黑盒",
        relevance: "收束建议",
      },
    ],
  },

  {
    id: "note-prompt-core",
    title: "提示词工程是 Agent 落地命脉：结构化指令与可复用模板",
    sourceTitle: "提示词工程高阶写法",
    domainPath: ["工程与技术科学", "人工智能", "提示词工程"],
    purposeLabel: "学习理论",
    polarity: "positive_exemplar",
    summary: "结构化指令决定稳定性上限；但能力若只绑在超长 system prompt 上，就难版本化、难共享。",
    thumbLabel: "提示词",
    thumbTone: "ink",
    yearHint: "2023–2024",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>提示词期解决的是「这一次对话怎么稳住」；它不是可安装制品，也管不住运行时工具乱调。</div>
      <h2>核心命题</h2>
      <p><mark data-frag="f-pr-1">提示词工程被写成 Agent 落地的核心命脉：结构化指令、角色/约束/输出格式，决定稳定性上限。</mark></p>
      <h2>典型结构</h2>
      <ul>
        <li>角色与边界（做什么 / 不做什么）</li>
        <li>输入槽位与输出 schema</li>
        <li>少样本与反例</li>
        <li>安全与拒答策略</li>
      </ul>
      <h2>阶段局限</h2>
      <p>这一阶段能力仍绑在「一段超长 system prompt」上：难版本化、难在仓库间共享、一泄露就整包暴露。下一步压力来自外置为 Skill / 配置。</p>
    `,
    fragments: [
      {
        id: "f-pr-1",
        kind: "text",
        excerpt: "结构化指令决定稳定性；能力绑在超长 system prompt",
        relevance: "能力封装演进第 1 站",
      },
    ],
  },
  {
    id: "note-prompt-leak",
    title: "提示泄露与越权：把密钥和策略塞进 prompt 的代价",
    sourceTitle: "大语言模型应用中的提示泄露攻击",
    domainPath: ["工程与技术科学", "人工智能", "安全"],
    purposeLabel: "反例避坑",
    polarity: "negative_caution",
    summary: "业务规则与密钥逻辑若活在提示词里，泄露即合规事故——这是能力外置的真实压力，不是趣味 jailbreak。",
    thumbLabel: "提示泄露",
    thumbTone: "rose",
    yearHint: "2024",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>提示泄露把「写在上下文里的策略」变成攻击面；可变策略应外置到工具、配置或 Skill 文件。</div>
      <h2>风险升级</h2>
      <p><mark data-frag="f-leak-1">当业务规则、安全策略甚至密钥逻辑活在提示词里，提示泄露不再是好玩的 jailbreak，而是权限与合规事故。</mark></p>
      <h2>典型失败</h2>
      <ul>
        <li>用户套话抽出 system 中的内部策略</li>
        <li>间接注入让模型执行隐藏工具策略</li>
        <li>把 API key / 内部 URL 写进 few-shot 示例</li>
      </ul>
      <h2>外置方向</h2>
      <p>这逼着团队把「可变策略」往外挪——工具侧鉴权、配置中心、Skill 文件与 Harness 门禁。提示词只保留当下语境，不承载长期秘密。</p>
    `,
    fragments: [
      {
        id: "f-leak-1",
        kind: "text",
        excerpt: "策略/密钥活在 prompt 里 → 泄露即合规事故",
        relevance: "从纯提示词走向外置能力的压力",
      },
    ],
  },
  {
    id: "note-skill-format",
    title: "Skill：可复用、可共享的轻量 Agent 能力包",
    sourceTitle: "Agent skills 技术总结综述",
    domainPath: ["工程与技术科学", "人工智能", "Agent"],
    purposeLabel: "学习理论",
    polarity: "positive_exemplar",
    summary: "用元数据与结构化说明把「怎么做」抽成可安装、可版本的能力包——比纯提示词更像软件制品。",
    thumbLabel: "Skill",
    thumbTone: "sage",
    yearHint: "2025–2026",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>Skill 描述能力；它解决复用与版本，不自动解决路由与运行时门禁。</div>
      <h2>定义</h2>
      <p><mark data-frag="f-sk-1">Skill 是可复用、可共享的轻量级 Agent 能力扩展格式：规范元数据 + 结构化说明，把「怎么做」从对话提示里抽成能力包。</mark></p>
      <h2>相对两侧的位置</h2>
      <p><mark data-frag="f-sk-2">相对纯提示词，Skill 可版本管理、可在仓库间安装；相对重框架，它仍保持文档+约定的轻量。</mark></p>
      <h3>好 Skill 的最小字段</h3>
      <ul>
        <li>名称、适用场景、不适用边界</li>
        <li>输入/输出约定</li>
        <li>步骤或检查清单</li>
        <li>失败时如何回退</li>
      </ul>
      <blockquote>若只能复制粘贴进 system，它仍是提示词；有元数据、目录约定、可被路由选中，才跨进 Skill。</blockquote>
    `,
    fragments: [
      {
        id: "f-sk-1",
        kind: "text",
        excerpt: "Skill=元数据+结构化说明的可安装能力包",
        relevance: "演进中段：能力外置标准化",
      },
      {
        id: "f-sk-2",
        kind: "text",
        excerpt: "可版本管理/可安装，仍比重框架轻",
        relevance: "与提示词、重框架的位置",
      },
    ],
  },
  {
    id: "note-skill-route",
    title: "Skill 路由翻车：边界不清时「可安装」反而更乱",
    sourceTitle: "Skill路由问题分析",
    domainPath: ["工程与技术科学", "人工智能", "Agent"],
    purposeLabel: "反例避坑",
    polarity: "negative_caution",
    summary: "能力包变多后，失败常表现为路由漂移；根因是边界与职责，不是「再聪明一点」。",
    thumbLabel: "路由避坑",
    thumbTone: "rose",
    yearHint: "2026",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>Skill 膨胀负环的传感器往往在路由层：重叠边界 → 漂移 → 继续加包。</div>
      <h2>现象</h2>
      <p><mark data-frag="f-rt-1">Skill 增多后，失败常表现为路由漂移：同任务多次走偏，根因往往是边界未写清、职责重叠。</mark></p>
      <h2>不是靠更长 prompt 能救的</h2>
      <ul>
        <li>同任务多 Skill 抢答</li>
        <li>「通用助手」类包吞噬专用包</li>
        <li>缺少可观测：不知道这次选了谁、为何选</li>
      </ul>
      <h2>下一站</h2>
      <p>需要的是更清楚的选择与回退（Harness/观测），以及合并或拒绝场景——不是继续加包。</p>
    `,
    fragments: [
      {
        id: "f-rt-1",
        kind: "text",
        excerpt: "路由漂移 ← 边界不清/职责重叠",
        relevance: "Skill 之后的下一站压力",
      },
    ],
  },
  {
    id: "note-google-skills",
    title: "Google Agent Skills：工程知识变成可安装能力包",
    sourceTitle: "Google skills 仓库笔记",
    domainPath: ["工程与技术科学", "人工智能", "Agent"],
    purposeLabel: "资料收藏",
    polarity: "positive_exemplar",
    summary: "官方开源仓库把工程知识封装为可版本管理的发行物——提示词时代的口头传统变成制品。",
    thumbLabel: "可安装包",
    thumbTone: "blue",
    yearHint: "2026",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>当工程知识变成可安装包，演进近端形态就从「会写 prompt」切到「会维护制品与边界」。</div>
      <h2>关键动作</h2>
      <p><mark data-frag="f-gs-1">Google 开源 Agent Skills 仓库的关键动作，是把工程知识封装为可安装、可版本管理的能力包——提示词时代的「口头传统」变成发行物。</mark></p>
      <h2>对个人助手的含义</h2>
      <ul>
        <li>同一套做法可跨项目安装，而不是复制聊天记录</li>
        <li>版本号让回滚成为可能</li>
        <li>同时也引入路由与边界治理问题（见路由避坑笔记）</li>
      </ul>
    `,
    fragments: [
      {
        id: "f-gs-1",
        kind: "text",
        excerpt: "工程知识→可安装可版本管理的能力包",
        relevance: "演进近端形态",
      },
    ],
  },

  {
    id: "note-gpu-map",
    title: "大模型工程资源地图：本地部署与量化避坑",
    sourceTitle: "GPU推理部署·工程经验",
    domainPath: ["工程与技术科学", "人工智能", "模型部署"],
    purposeLabel: "资料收藏",
    polarity: "neutral_observe",
    summary: "「能跑起来」应拆成选型、量化、并行、观测；一上来堆卡往往跳过带宽与量化。",
    thumbLabel: "部署地图",
    thumbTone: "sand",
    yearHint: "2025",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>部署决策是一条纠错链：先问放不进单卡、带宽够不够，再问该不该多卡。</div>
      <h2>地图四块</h2>
      <p><mark data-frag="f-gpu-1">工程经验地图把「能跑起来」拆成：选型、量化、并行策略、观测；很多人一上来就堆卡，跳过带宽与量化。</mark></p>
      <ol>
        <li><strong>选型</strong>：模型体量、精度、上下文长度</li>
        <li><strong>量化</strong>：质量与吞吐的折中点</li>
        <li><strong>并行</strong>：单卡优先；多卡看互联</li>
        <li><strong>观测</strong>：延迟、显存、带宽利用率</li>
      </ol>
      <blockquote>没有观测的「再加一张卡」，多半是在掩盖未知瓶颈。</blockquote>
    `,
    fragments: [
      {
        id: "f-gpu-1",
        kind: "text",
        excerpt: "先选型/量化/并行/观测，别一上来堆卡",
        relevance: "部署决策时间线序章",
      },
    ],
  },
  {
    id: "note-gpu-bandwidth",
    title: "显存带宽比算力更重要：单卡 A800 > 双卡 PCIe 互联",
    sourceTitle: "GPU推理部署运行结果",
    domainPath: ["工程与技术科学", "人工智能", "推理优化"],
    purposeLabel: "反例避坑",
    polarity: "negative_caution",
    summary: "实测推翻「多卡一定更快」：LLM 推理里显存带宽常常压过算力；PCIe 互联可能更慢。",
    thumbLabel: "带宽瓶颈",
    thumbTone: "rose",
    yearHint: "2026-03",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>堆卡迷信的反例：单卡高带宽往往优于双卡差互联；多卡要有正当条件。</div>
      <h2>关键结论</h2>
      <p><mark data-frag="f-bw-1">在 LLM 推理部署中，显存带宽往往比算力更重要；单卡 A800 优于双卡 PCIe 互联方案。</mark></p>
      <h2>多卡何时正当</h2>
      <p><mark data-frag="f-bw-2">多卡只在模型过大放不进单卡，或有高效互联（NVLink 等）时才值得上。</mark></p>
      <figure data-frag="f-bw-img" class="tld-fig">
        <div class="tld-fig-frame">单卡带宽饱和 vs PCIe 多卡通信开销</div>
        <figcaption>示意：堆卡可能更慢</figcaption>
      </figure>
      <h2>决策顺序</h2>
      <ol>
        <li>能否量化后进单卡？</li>
        <li>单卡带宽是否已是瓶颈？</li>
        <li>多卡互联是否高效？</li>
        <li>再谈软件层词元运营</li>
      </ol>
    `,
    fragments: [
      {
        id: "f-bw-1",
        kind: "text",
        excerpt: "带宽>算力；单卡 A800 优于双卡 PCIe",
        relevance: "关键转折：从堆卡迷信到带宽思维",
      },
      {
        id: "f-bw-2",
        kind: "text",
        excerpt: "多卡仅当放不下或有高效互联",
        relevance: "多卡的正当条件",
      },
      {
        id: "f-bw-img",
        kind: "image",
        excerpt: "单卡带宽 vs PCIe 开销示意",
        relevance: "可视化瓶颈",
      },
    ],
  },
  {
    id: "note-token-opt",
    title: "Token 词元运营：推理优化不只是硬件",
    sourceTitle: "面向Token词元运营的大模型推理优化白皮书",
    domainPath: ["工程与技术科学", "人工智能", "推理优化"],
    purposeLabel: "学习理论",
    polarity: "mixed",
    summary: "前缀缓存、批处理与淘汰策略决定单位成本；差的请求形态会吃掉硬件红利。",
    thumbLabel: "Token运营",
    thumbTone: "blue",
    yearHint: "2026",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>硬件选型之后，词元运营才是持续降本的杠杆：缓存、批处理、淘汰与请求形态。</div>
      <h2>软件层杠杆</h2>
      <p><mark data-frag="f-tk-1">硬件选型之后，词元运营（前缀缓存、批处理、淘汰策略）决定单位成本；否则带宽优化的红利会被差的请求形态吃掉。</mark></p>
      <h3>常见动作</h3>
      <ul>
        <li>系统前缀与工具 schema 尽量稳定，提高前缀缓存命中</li>
        <li>可合并的请求做连续批处理</li>
        <li>明确 KV/上下文淘汰策略，避免名义长窗口虚胖</li>
      </ul>
      <blockquote>先问「请求长什么样」，再问「要不要再买卡」。</blockquote>
    `,
    fragments: [
      {
        id: "f-tk-1",
        kind: "text",
        excerpt: "前缀缓存/批处理/淘汰决定单位成本",
        relevance: "带宽思维之后的软件层",
      },
    ],
  },

  {
    id: "note-sr-outline",
    title: "间隔重复原理：遗忘曲线与复习日程",
    sourceTitle: "间隔重复科普大纲",
    domainPath: ["人文与社会科学", "教育学", "学习科学"],
    purposeLabel: "学习理论",
    polarity: "positive_exemplar",
    summary: "间隔重复把复习安排在遗忘临界附近；核心不是多背，而是何时再见到。",
    thumbLabel: "遗忘曲线",
    thumbTone: "sage",
    yearHint: "经典",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>间隔重复是日程算法：在即将遗忘时再提取一次，用较少次数换长期巩固。</div>
      <h2>原理</h2>
      <p><mark data-frag="f-sr-1">间隔重复把复习安排在遗忘临界附近，用较少次数巩固长期记忆；核心不是「多背」，而是「何时再见到」。</mark></p>
      <h2>落地含义</h2>
      <ul>
        <li>卡片要能被「提取」而不是再认勾选</li>
        <li>间隔由算法或简易日程驱动，而不是心情</li>
        <li>与「今天刷完一百题」的冲刺学法目标不同</li>
      </ul>
    `,
    fragments: [
      {
        id: "f-sr-1",
        kind: "text",
        excerpt: "在遗忘临界复习；关键是何时再见",
        relevance: "理论起点",
      },
    ],
  },
  {
    id: "note-sr-debate",
    title: "间隔重复有效，但样本量与外推常被质疑",
    sourceTitle: "docx 间隔重复笔记",
    domainPath: ["人文与社会科学", "教育学", "学习科学"],
    purposeLabel: "对标拆解",
    polarity: "mixed",
    summary: "支持有效性，同时保留证据强度警惕：实验室效应 ≠ 你的题库质量。",
    thumbLabel: "证据争议",
    thumbTone: "sand",
    yearHint: "讨论中",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>采用间隔重复前先做证据校准：有效，但外推到自己场景时要看样本与材料质量。</div>
      <h2>主张与保留</h2>
      <p><mark data-frag="f-sr-d1">间隔重复的有效性被支持，但存在样本量与场景外推的质疑——工程学习里更要区分实验室效应与自己的题库质量。</mark></p>
      <h2>实践校准问题</h2>
      <ul>
        <li>卡片是提取式还是复制讲义？</li>
        <li>反馈是否诚实（会不会「好像记得」就点简单）？</li>
        <li>学科材料是否适合原子化？</li>
      </ul>
    `,
    fragments: [
      {
        id: "f-sr-d1",
        kind: "text",
        excerpt: "有效但需警惕样本量与外推",
        relevance: "理论→实践前的证据校准",
      },
    ],
  },
  {
    id: "note-sr-extract",
    title: "提取练习 ≠ 间隔重复：先分清再排日程",
    sourceTitle: "语音ASR·学习方法澄清",
    domainPath: ["人文与社会科学", "教育学", "学习方法"],
    purposeLabel: "学习理论",
    polarity: "positive_exemplar",
    summary: "提取是动作，间隔是日程；混用会导致只刷题不排程，或只排程却在再认。",
    thumbLabel: "提取vs间隔",
    thumbTone: "blue",
    yearHint: "实践",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>先做提取式卡片，再丢进间隔日程——顺序反了会空转。</div>
      <h2>概念分清</h2>
      <p><mark data-frag="f-sr-e1">提取练习是「主动回忆」的动作；间隔重复是「何时安排下一次提取」的日程算法。混用会导致只刷题不排程，或只排程却在再认。</mark></p>
      <h2>本周可执行</h2>
      <p><mark data-frag="f-sr-e2">本周可执行：先为错题做提取式卡片，再丢进间隔日程。</mark></p>
      <ol>
        <li>从错题抽出「问题面」（不看答案能否答出）</li>
        <li>答案面写最小充分提示</li>
        <li>导入 Anki / 自建日程，按间隔再见</li>
      </ol>
    `,
    fragments: [
      {
        id: "f-sr-e1",
        kind: "text",
        excerpt: "提取=动作；间隔=日程。勿混用",
        relevance: "实践分岔的关键澄清",
      },
      {
        id: "f-sr-e2",
        kind: "text",
        excerpt: "先制提取卡，再进间隔日程",
        relevance: "可执行顺序",
      },
    ],
  },
  {
    id: "note-harness",
    title: "Agentic Harness：运行时约束、工具与可观测，而不是又一段提示词",
    sourceTitle: "Agentic Harness Engineering 摘记",
    domainPath: ["工程与技术科学", "人工智能", "Agent"],
    purposeLabel: "对标拆解",
    polarity: "positive_exemplar",
    summary: "Harness 管循环、工具门禁、追踪与回退——执行现场；与 Skill 文档、Prompt 语境不在同一层。",
    thumbLabel: "Harness",
    thumbTone: "ink",
    yearHint: "2025–2026",
    bodyHtml: `
      <div class="tld-callout"><strong>AI 主旨</strong>出了问题先问发生在哪一层：Prompt / Skill / Harness。把 Harness 写成又一份说明书，管不住工具乱调。</div>
      <h2>定义</h2>
      <p>和 Skill/提示词容易混的一点：</p>
      <p><mark data-frag="f-hn-1">Harness 回答的是「Agent 怎么跑」：步进循环、工具门禁、追踪、失败回退；不是再写一份更长的任务说明书。</mark></p>
      <h2>三层对照</h2>
      <p><mark data-frag="f-hn-2">Skill 描述能力；Prompt 注入当下语境；Harness 约束执行现场。三者叠用时，出了问题要先问发生在哪一层。</mark></p>
      <ul>
        <li><strong>Prompt</strong>：这次对话的口吻、格式、临时约束</li>
        <li><strong>Skill</strong>：可安装的「怎么做」</li>
        <li><strong>Harness</strong>：循环、权限、观测、回退</li>
      </ul>
      <blockquote>步骤失控 / 工具乱调 → 优先查 Harness，而不是继续堆说明书。</blockquote>
    `,
    fragments: [
      {
        id: "f-hn-1",
        kind: "text",
        excerpt: "Harness=循环/门禁/追踪/回退，不是更长说明书",
        relevance: "三方对比中的第三极",
      },
      {
        id: "f-hn-2",
        kind: "text",
        excerpt: "Skill 描述能力；Prompt 注入语境；Harness 约束现场",
        relevance: "分层定义，供选型箭头使用",
      },
    ],
  },
];

export const DEMO_NOTES_BY_ID = Object.fromEntries(
  DEMO_NOTE_CARDS.map((n) => [n.id, n]),
) as Record<string, DemoNoteCard>;
