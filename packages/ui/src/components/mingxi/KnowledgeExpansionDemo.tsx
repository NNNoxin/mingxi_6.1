"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./knowledge-expansion-demo.css";

type Coverage = "covered" | "partial" | "missing";
type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";
type SearchScope = "all" | "academic" | "docs" | "chinese";
type Granularity = "theme" | "concept" | "atomic";
type KnowledgeDepth = 1 | 2 | 3 | 4 | 5 | 6;

type LocalEvidence = {
  title: string;
  excerpt: string;
  source: string;
};

type KnowledgePoint = {
  id: string;
  depth: KnowledgeDepth;
  labels: Record<Granularity, string>;
  summary: string;
  coverage: Coverage;
};

type KnowledgeBranch = {
  id: string;
  title: string;
  librarySource: string;
  points: KnowledgePoint[];
};

type SeedNote = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  domain: string;
  meta: string;
  branches: KnowledgeBranch[];
};

type ConceptNode = KnowledgePoint & {
  label: string;
  branchId: string;
  branchTitle: string;
  relation: string;
  evidence: LocalEvidence[];
  searchTerms: string[];
};

type SearchResult = {
  id: string;
  domain: string;
  path: string;
  title: string;
  snippet: string;
  date: string;
  type: Exclude<SearchScope, "all">;
  tags: string[];
  topics: string[];
  readTime: string;
  keyPoints: string[];
};

type ResultSource = {
  id: string;
  domain: string;
  path: string;
  date: string;
  type: Exclude<SearchScope, "all">;
  sourceTag: string;
};

const GRANULARITY_OPTIONS: Array<{ id: Granularity; label: string; hint: string }> = [
  { id: "theme", label: "主题级", hint: "看大方向" },
  { id: "concept", label: "概念级", hint: "看理论与机制" },
  { id: "atomic", label: "原子级", hint: "看最小命题" },
];

const KNOWLEDGE_COMPLETION_REPO_URL = "https://github.com/noxinsun-source/knowledge-completion";

function kp(
  id: string,
  depth: KnowledgeDepth,
  labels: [string, string, string],
  summary: string,
  coverage: Coverage,
): KnowledgePoint {
  return {
    id,
    depth,
    labels: { theme: labels[0], concept: labels[1], atomic: labels[2] },
    summary,
    coverage,
  };
}

const SEED_NOTES: SeedNote[] = [
  {
    id: "urban-freedom",
    kind: "城市社会学",
    title: "城市为什么让人既自由又孤独？",
    summary: "从都市匿名性、公共空间与数字平台出发，理解自由、疏离和归属如何同时发生。",
    domain: "社会学 / 城市研究 / 媒介研究",
    meta: "2026.07.28 · 9 分钟阅读",
    branches: [
      {
        id: "stranger-relations",
        title: "陌生人关系",
        librarySource: "《公共生活中的陌生人》阅读札记",
        points: [
          kp("urban-anonymity", 1, ["城市个体", "都市匿名性", "身份可暂时隐去"], "城市让人摆脱熟人社会的持续监督，也更容易成为无人认识的陌生人。", "covered"),
          kp("role-distance", 2, ["身份自由", "角色距离", "单一角色不等于全部自我"], "人在工作、家庭与街道中切换身份，不必让单一角色定义全部自我。", "covered"),
          kp("civil-inattention", 3, ["公共礼仪", "礼貌性忽视", "确认目光后主动撤回"], "陌生人短暂确认彼此存在，又主动收回注意，以维持公共场合的安全距离。", "partial"),
          kp("weak-tie-recurrence", 4, ["弱关系", "弱联系复现", "熟悉的陌生人反复出现"], "反复遇见但不深交的人，构成城市中低强度却稳定的社会网络。", "partial"),
          kp("ambient-belonging", 5, ["城市归属", "环境式归属", "熟面孔密度形成安全感"], "归属不一定来自亲密关系，也可能来自熟悉面孔和日常节奏。", "missing"),
          kp("care-commons", 6, ["社区照护", "照护公地", "低强度互助被制度化"], "社区如何把低强度熟悉感转化为托育、陪伴、互助和风险响应。", "missing"),
        ],
      },
      {
        id: "public-space",
        title: "公共空间",
        librarySource: "第三空间与社会基础设施",
        points: [
          kp("encounter-density", 1, ["公共生活", "相遇密度", "非计划接触频率"], "人口、交通与功能混合使城市持续制造非计划相遇。", "covered"),
          kp("third-place", 2, ["交往场所", "第三空间", "低消费门槛的停留点"], "家庭和工作以外，可低门槛停留并重复相遇的咖啡馆、公园和社区设施。", "partial"),
          kp("repeated-copresence", 3, ["日常共处", "重复共处", "无交谈也能积累熟悉感"], "即使没有直接交谈，长期共同出现也会降低陌生感并形成场所认同。", "partial"),
          kp("loneliness-infrastructure", 4, ["社会基础设施", "孤独基础设施", "座椅与照明决定可停留性"], "座椅、步行性、照明和营业时间都会影响人能否与他人共同停留。", "missing"),
          kp("fifteen-minute-access", 5, ["近邻城市", "十五分钟可达性", "日常资源的步行半径"], "日常照护、文化与交往资源是否能在短距离内公平获得。", "missing"),
          kp("right-to-city", 6, ["空间正义", "城市权利", "居民拥有空间共决权"], "居民不仅使用城市，也应参与决定公共空间与资源如何被生产和分配。", "missing"),
        ],
      },
      {
        id: "platform-city",
        title: "平台化城市",
        librarySource: "数字媒介如何改变附近",
        points: [
          kp("sensory-overload", 1, ["都市感官", "感官过载", "刺激超过注意力阈值"], "高密度声音、图像、速度与陌生人刺激迫使个体持续筛选注意。", "covered"),
          kp("blase-attitude", 2, ["心理防御", "冷漠态度", "淡漠用于保护注意力"], "对刺激表现淡漠，可能是都市人保护注意力而非缺乏情感。", "covered"),
          kp("attention-shielding", 3, ["注意力管理", "注意力屏蔽", "耳机成为公共空间边界"], "耳机、手机和路线习惯成为管理公共环境刺激的日常技术。", "missing"),
          kp("algorithmic-visibility", 4, ["数字附近", "算法可见性", "排序阈值决定什么被看见"], "平台替人筛选地点、活动和附近的人，同时决定什么不会被看见。", "missing"),
          kp("platform-sorting", 5, ["空间分流", "平台化分流", "推荐价格把人群分开"], "推荐、评分和价格机制把不同人群引向不同的城市空间。", "missing"),
          kp("digital-public-governance", 6, ["公共治理", "数字公共空间治理", "推荐规则承担公共责任"], "当城市交往由商业平台组织时，推荐规则是否也应承担公共责任。", "missing"),
        ],
      },
    ],
  },
  {
    id: "museum-memory",
    kind: "历史与博物馆",
    title: "博物馆如何决定我们记住什么？",
    summary: "从展陈选择、物的来源链和公众参与出发，理解公共记忆如何被组织。",
    domain: "历史学 / 博物馆学 / 记忆研究",
    meta: "2026.07.19 · 11 分钟阅读",
    branches: [
      {
        id: "narrative-power",
        title: "叙事权",
        librarySource: "策展叙事中的权力",
        points: [
          kp("selection-omission", 1, ["历史选择", "选择与遗漏", "展出与入库共同构成叙事"], "展出的对象与被留在库房中的对象共同构成历史叙事。", "covered"),
          kp("canon-formation", 2, ["文化经典", "经典形成", "重复展陈制造代表性"], "重复展陈和教育使用使部分对象成为代表性经典。", "covered"),
          kp("curatorial-voice", 3, ["解释权", "策展人声音", "标签语态决定发言位置"], "标题、标签和叙事顺序决定观众从谁的视角理解历史。", "partial"),
          kp("authorized-heritage", 4, ["遗产制度", "授权遗产话语", "机构垄断遗产命名权"], "专业机构获得命名何为遗产、何者值得保护的权力。", "missing"),
          kp("plural-memory", 5, ["多元记忆", "复数记忆", "冲突叙事被同时保留"], "同一事件允许不同群体保留彼此冲突的讲述。", "missing"),
          kp("memory-governance", 6, ["记忆政治", "公共记忆治理", "争议解释权持续可修订"], "争议历史由谁解释、修订和持续监督。", "missing"),
        ],
      },
      {
        id: "object-life",
        title: "物的生命史",
        librarySource: "文物来源与所有权研究",
        points: [
          kp("classification", 1, ["收藏秩序", "分类体系", "年代地域分类并非天然"], "年代、地域和材质分类并非天然，而是知识制度的选择。", "covered"),
          kp("provenance", 2, ["所有权流转", "来源链", "逐段记录保管时间线"], "记录物件从制造、交易、赠予到入藏的所有权流转。", "partial"),
          kp("object-biography", 3, ["物的历史", "物的生命史", "用途与身份随时间改变"], "物件在不同时间被赋予用途、价值和身份。", "partial"),
          kp("colonial-collecting", 4, ["帝国收藏", "殖民采集", "征用与购买的权力差"], "考察、购买、征用与掠夺之间存在被档案掩盖的权力差异。", "partial"),
          kp("repatriation", 5, ["归还争议", "文物返还", "法律所有权与精神归属冲突"], "所有权、保管能力和精神归属形成不同的返还主张。", "missing"),
          kp("reparative-museology", 6, ["机构修复", "修复性博物馆学", "返还后重建资源与关系"], "返还之外，机构如何修订关系、资源和叙事权。", "missing"),
        ],
      },
      {
        id: "public-participation",
        title: "公众参与",
        librarySource: "参与式档案与社区共策展",
        points: [
          kp("display-narrative", 1, ["展览故事", "展陈叙事", "动线并置把物件组织成故事"], "空间动线、并置关系和说明文字把物件组织成故事。", "covered"),
          kp("mnemonic-institution", 2, ["记忆机构", "记忆机构", "重复展示稳定过去想象"], "博物馆通过收藏和重复展示稳定社会对过去的想象。", "partial"),
          kp("archival-silence", 3, ["缺席的历史", "档案沉默", "没有记录不等于没有发生"], "缺少记录也可能意味着某些人没有留下档案的权力。", "missing"),
          kp("community-curation", 4, ["共同策展", "社区共策展", "被展示者参与选物与命名"], "让被展示群体参与选物、命名和解释。", "partial"),
          kp("digital-restitution", 5, ["数字开放", "数字返还", "开放图像与元数据恢复访问"], "开放图像与元数据是否能部分恢复来源社区的访问和解释权。", "missing"),
          kp("participatory-archive", 6, ["档案共治", "参与式档案治理", "社区决定材料开放与撤回"], "社区如何长期决定材料的开放、补充、更正与撤回。", "missing"),
        ],
      },
    ],
  },
  {
    id: "map-neutrality",
    kind: "人文地理",
    title: "一张地图为什么从不中立？",
    summary: "地图不是世界的透明复制；投影、分类、边界与算法共同决定什么被看见。",
    domain: "人文地理 / 制图史 / 数字治理",
    meta: "2026.07.11 · 10 分钟阅读",
    branches: [
      {
        id: "visual-language",
        title: "视觉表达",
        librarySource: "批判制图学入门",
        points: [
          kp("projection", 1, ["空间表达", "地图投影", "面积角度距离不可同时保真"], "球面转为平面必然在面积、角度和距离之间作出取舍。", "covered"),
          kp("mercator-inflation", 2, ["投影偏差", "墨卡托面积膨胀", "高纬地区被系统放大"], "高纬度地区在墨卡托地图上被系统性放大。", "covered"),
          kp("generalization", 3, ["信息取舍", "制图综合", "比例尺缩小迫使删除信息"], "比例尺缩小时，制图者必须删除、合并和夸张信息。", "partial"),
          kp("visual-hierarchy", 4, ["视觉权重", "视觉层级", "字号颜色决定注意顺序"], "字号、颜色和线宽决定哪些地点先被注意。", "partial"),
          kp("uncertainty-visualization", 5, ["误差表达", "不确定性可视化", "缺失估计必须显式标注"], "地图如何诚实表达数据缺失、估计误差和边界争议。", "missing"),
          kp("map-audit", 6, ["地图问责", "地图审计", "逐项检查来源权重与遗漏"], "系统检查数据来源、视觉权重和被遗漏群体。", "missing"),
        ],
      },
      {
        id: "state-space",
        title: "空间权力",
        librarySource: "国家如何看见社会",
        points: [
          kp("boundary-making", 1, ["政治空间", "边界制造", "连续空间被画成法律线"], "把连续空间画成明确边界，本身就是一种政治行为。", "covered"),
          kp("cadastral-survey", 2, ["土地治理", "地籍测量", "编号让土地可征税交易"], "土地被划分、编号和登记后才更容易征税与交易。", "partial"),
          kp("legibility", 3, ["治理可见性", "国家可读性", "地方生活被压成行政类别"], "复杂地方生活被压缩为行政体系可以记录和管理的类别。", "partial"),
          kp("state-capacity", 4, ["治理能力", "空间化国家能力", "地图扩大治理穿透力"], "人口、土地和基础设施地图支持资源配置，也扩大治理穿透力。", "missing"),
          kp("spatial-stigma", 5, ["地方标签", "空间污名", "风险区标签反向塑造身份"], "风险区、贫困区等标签会反过来影响投资、保险和居民身份。", "missing"),
          kp("counter-mapping", 6, ["空间抵抗", "反制图", "社区重画被忽略的资源"], "社区用自己的地图挑战官方边界、资源叙事和空间污名。", "missing"),
        ],
      },
      {
        id: "digital-map",
        title: "数字地图",
        librarySource: "位置数据与算法地理",
        points: [
          kp("scale-choice", 1, ["观察尺度", "比例尺选择", "尺度改变因果关系"], "不同观察尺度会让同一现象呈现完全不同的因果关系。", "covered"),
          kp("geocoding", 2, ["地址数字化", "地址地理编码", "文本地址被匹配为空间坐标"], "把自然语言地址匹配为空间坐标，过程中会产生误配和遗漏。", "partial"),
          kp("address-standardization", 3, ["地址秩序", "地址标准化", "非标准住址更容易被漏掉"], "乡村地点和临时居所更容易无法进入数字地图。", "partial"),
          kp("algorithmic-geography", 4, ["算法空间", "算法地理", "推荐重组对附近的理解"], "搜索和推荐系统根据位置数据重组人对附近世界的理解。", "missing"),
          kp("location-privacy", 5, ["轨迹风险", "位置隐私", "停留点可推断敏感身份"], "轨迹数据可推断居住、健康、宗教和社会关系。", "missing"),
          kp("geospatial-governance", 6, ["数据共治", "地理数据治理", "位置数据可查询和撤回"], "谁能收集位置、保存多久，以及个人如何查询和撤回。", "missing"),
        ],
      },
    ],
  },
  {
    id: "agent-memory",
    kind: "AI 工程",
    title: "Agent 短期记忆的五种工程形态",
    summary: "从上下文压缩、轨迹召回到长期治理，梳理记忆如何被保存、调用和撤回。",
    domain: "人工智能 / Agent / 记忆架构",
    meta: "2026.08.06 · 8 分钟阅读",
    branches: [
      {
        id: "context-lifecycle",
        title: "上下文生命周期",
        librarySource: "Agentic Harness 工程札记",
        points: [
          kp("context-window", 1, ["短期上下文", "滑动窗口", "最近 K 轮优先保留"], "最近 K 轮原文进入上下文，超出预算时从最早轮次截断。", "covered"),
          kp("recursive-summary", 2, ["上下文压缩", "递归摘要", "溢出前压缩旧轮次"], "把即将被挤出的历史压成摘要，再写回长期存在的 memory 槽。", "covered"),
          kp("summary-drift", 3, ["压缩风险", "摘要漂移", "多轮压缩累积事实偏差"], "摘要被反复摘要后，细节与不确定性可能逐轮丢失。", "partial"),
          kp("write-trigger", 4, ["记忆写入", "写入触发", "重要性阈值触发沉淀"], "什么信息值得从短期上下文沉淀成跨会话长期记忆。", "missing"),
          kp("memory-consolidation", 5, ["长期沉淀", "记忆巩固", "相似经验合并为稳定模式"], "重复经验如何合并、去重并形成稳定的长期概括。", "missing"),
          kp("memory-revision", 6, ["记忆修订", "可逆记忆更新", "新事实保留旧版本溯源"], "新旧记忆冲突时如何安全替换并保留历史。", "missing"),
        ],
      },
      {
        id: "retrieval-use",
        title: "召回与使用",
        librarySource: "检索式记忆评测",
        points: [
          kp("trajectory-retrieval", 1, ["经验召回", "轨迹检索", "当前问题召回历史片段"], "按当前问题召回历史片段，并加入时间衰减减少时间错位。", "covered"),
          kp("memory-ranking", 2, ["召回排序", "记忆重排", "相关性时效重要性联合排序"], "召回后的候选要同时衡量语义相关、时间新鲜度和重要性。", "partial"),
          kp("context-injection", 3, ["记忆使用", "上下文注入", "证据与指令分槽进入提示"], "召回内容需要以可溯源结构进入上下文，避免冒充系统指令。", "partial"),
          kp("retrieval-conflict", 4, ["证据冲突", "召回冲突", "矛盾记忆同时呈现来源"], "多条记忆互相矛盾时，模型需要看到时间与来源。", "missing"),
          kp("usefulness-eval", 5, ["使用评测", "记忆有效性评测", "命中不等于真正用对"], "评测不仅要看是否召回，还要看是否改善最终任务。", "missing"),
          kp("adaptive-recall", 6, ["自适应记忆", "自适应召回策略", "任务风险决定召回深度"], "不同风险和复杂度的任务应使用不同召回深度。", "missing"),
        ],
      },
      {
        id: "memory-governance",
        title: "治理与边界",
        librarySource: "长期记忆的隐私边界",
        points: [
          kp("memory-scope", 1, ["记忆范围", "作用域隔离", "线程用户组织分层隔离"], "不同线程、用户和组织的记忆必须拥有明确作用域。", "covered"),
          kp("retention-policy", 2, ["数据保留", "保留策略", "敏感程度决定保存期限"], "记忆保留期限应与敏感程度和用户预期相匹配。", "partial"),
          kp("user-consent", 3, ["用户控制", "记忆同意", "跨会话写入需要明确告知"], "跨会话写入前需要告知，并允许用户查看和撤回。", "partial"),
          kp("privacy-filter", 4, ["隐私防线", "敏感信息过滤", "写入前识别高风险字段"], "身份、健康和位置等敏感字段需要更严格的写入门槛。", "missing"),
          kp("audit-log", 5, ["记忆审计", "可追溯变更日志", "每次读取更新留下证据"], "记忆的创建、读取、合并和撤回都应留下审计记录。", "missing"),
          kp("right-to-forget", 6, ["撤回权利", "可验证遗忘", "删除后证明不再被召回"], "系统需要证明被撤回的记忆不会继续影响回答。", "missing"),
        ],
      },
    ],
  },
];

const RESULT_SOURCES: ResultSource[] = [
  { id: "baidu", domain: "baike.baidu.com", path: "item / concept", date: "词条资料", type: "chinese", sourceTag: "百科" },
  { id: "cssn", domain: "cssn.cn", path: "skgz / academic", date: "2026-06-18", type: "chinese", sourceTag: "中国社会科学网" },
  { id: "thepaper", domain: "thepaper.cn", path: "newsDetail / culture", date: "2026-05-09", type: "chinese", sourceTag: "中文深度报道" },
  { id: "zhihu", domain: "zhihu.com", path: "question / research-notes", date: "2026-04-22", type: "chinese", sourceTag: "讨论与书单" },
  { id: "wanfang", domain: "wanfangdata.com.cn", path: "periodical / search", date: "2025-12-16", type: "academic", sourceTag: "中文论文" },
  { id: "jstor", domain: "jstor.org", path: "stable / research", date: "2024-11-03", type: "academic", sourceTag: "JSTOR 论文" },
  { id: "sage", domain: "journals.sagepub.com", path: "doi / full", date: "2025-08-27", type: "academic", sourceTag: "SAGE Journals" },
  { id: "cambridge", domain: "cambridge.org", path: "core / journal", date: "2023-10-11", type: "academic", sourceTag: "Cambridge Core" },
  { id: "openalex", domain: "openalex.org", path: "works / related", date: "开放索引", type: "academic", sourceTag: "学术索引" },
  { id: "britannica", domain: "britannica.com", path: "topic / overview", date: "参考资料", type: "docs", sourceTag: "权威参考" },
  { id: "unesco", domain: "unesco.org", path: "documents / knowledge", date: "机构资料", type: "docs", sourceTag: "机构报告" },
  { id: "archive", domain: "archive.org", path: "details / source-reader", date: "开放资料", type: "docs", sourceTag: "原始资料" },
];

function nodesFor(note: SeedNote, granularity: Granularity): ConceptNode[] {
  return note.branches.flatMap((branch) =>
    branch.points.map((point) => ({
      ...point,
      label: point.labels[granularity],
      branchId: branch.id,
      branchTitle: branch.title,
      relation:
        point.depth === 1
          ? `由起点笔记直接引出 · ${branch.title}`
          : `沿「${branch.title}」继续深入到第 ${point.depth} 跳`,
      evidence:
        point.coverage === "missing"
          ? []
          : [
              {
                title: point.coverage === "covered" ? `${note.title} · ${branch.title}` : branch.librarySource,
                excerpt: point.summary,
                source:
                  point.coverage === "covered"
                    ? `当前起点笔记 · 第 ${point.depth} 跳线索`
                    : `本库关联笔记 · ${branch.librarySource}`,
              },
            ],
      searchTerms: [note.kind, branch.title, ...Object.values(point.labels)],
    })),
  );
}

function buildSearchResults(note: SeedNote, node: ConceptNode, query: string): SearchResult[] {
  const titlePatterns = [
    `${node.label}：基本概念、形成机制与核心争论`,
    `从「${note.title}」继续理解 ${node.label}`,
    `${node.label} 的知识谱系：经典研究与新问题`,
    `如何研究 ${node.label}：概念边界、案例与反例`,
    `${node.branchTitle} 视角下的 ${node.label}`,
    `${node.label} 的测量、证据与现实应用`,
    `重新审视 ${node.label}：一项跨学科综述`,
    `${node.label} 研究中的五个关键分歧`,
    `与 ${node.label} 相关的代表性文献和引用网络`,
    `${node.label}：权威参考资料与术语说明`,
    `${node.label} 的公共影响与治理边界`,
    `${node.label} 原始材料、档案与延伸阅读`,
  ];

  return RESULT_SOURCES.map((source, index) => ({
    id: `${note.id}:${node.id}:${source.id}`,
    domain: source.domain,
    path: source.path,
    title: titlePatterns[index],
    snippet: `围绕“${query || node.label}”梳理定义、形成机制与关键案例，并把它放回「${note.title}」的第 ${node.depth} 跳关系中理解。资料同时标注主要争议与可继续追查的来源。`,
    date: source.date,
    type: source.type,
    tags: [source.sourceTag, note.kind, `第 ${node.depth} 跳`],
    topics: node.searchTerms,
    readTime: `${6 + index} 分钟`,
    keyPoints: [
      `明确“${node.label}”与上游概念的关系`,
      `补充「${node.branchTitle}」分支中尚未覆盖的证据`,
      `保留来源与争议，避免把搜索结果直接当成确定事实`,
    ],
  }));
}

function nodeKey(noteId: string, nodeId: string) {
  return `${noteId}:${nodeId}`;
}

function coverageLabel(coverage: Coverage) {
  if (coverage === "covered") return "本篇已提到";
  if (coverage === "partial") return "本库其他笔记";
  return "知识库未覆盖";
}

export function KnowledgeExpansionDemo() {
  const [noteId, setNoteId] = useState(SEED_NOTES[0].id);
  const [noteQuery, setNoteQuery] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("concept");
  const [visibleDepth, setVisibleDepth] = useState<KnowledgeDepth>(3);
  const [extendingDepth, setExtendingDepth] = useState<KnowledgeDepth | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [readingResultId, setReadingResultId] = useState<string | null>(null);
  const [savedEvidence, setSavedEvidence] = useState<Record<string, SearchResult>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const timers = useRef<number[]>([]);
  const searchRequest = useRef(0);
  const hopViewportRef = useRef<HTMLDivElement>(null);
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const projectCloseRef = useRef<HTMLButtonElement>(null);

  const note = SEED_NOTES.find((item) => item.id === noteId) ?? SEED_NOTES[0];
  const graphNodes = nodesFor(note, granularity);
  const visibleNodes = graphNodes.filter((item) => item.depth <= visibleDepth);
  const selectedNode = graphNodes.find((item) => item.id === selectedNodeId) ?? null;
  const selectedKey = selectedNode ? nodeKey(note.id, selectedNode.id) : "";
  const savedSource = selectedKey ? savedEvidence[selectedKey] : undefined;
  const effectiveCoverage: Coverage | null = selectedNode
    ? savedSource
      ? "covered"
      : selectedNode.coverage
    : null;

  const filteredNotes = useMemo(() => {
    const query = noteQuery.trim().toLowerCase();
    if (!query) return SEED_NOTES;
    return SEED_NOTES.filter((item) => `${item.title} ${item.summary} ${item.domain}`.toLowerCase().includes(query));
  }, [noteQuery]);

  const searchResults = selectedNode ? buildSearchResults(note, selectedNode, submittedQuery || searchQuery) : [];
  const rankedResults = searchResults.filter((item) => searchScope === "all" || item.type === searchScope);
  const readingResult = searchResults.find((item) => item.id === readingResultId) ?? null;
  const coveredCount = visibleNodes.filter((item) => item.coverage !== "missing" || savedEvidence[nodeKey(note.id, item.id)]).length;
  const missingCount = visibleNodes.length - coveredCount;
  const selectedPath = selectedNode
    ? graphNodes
        .filter((item) => item.branchId === selectedNode.branchId && item.depth <= selectedNode.depth)
        .sort((a, b) => a.depth - b.depth)
    : [];
  const selectedPathIds = selectedNode ? new Set(selectedPath.map((item) => item.id)) : null;

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    if (!showProjectInfo) return;

    const previousOverflow = document.body.style.overflow;
    const projectTrigger = projectTriggerRef.current;
    document.body.style.overflow = "hidden";
    projectCloseRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowProjectInfo(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      projectTrigger?.focus();
    };
  }, [showProjectInfo]);

  function closeProjectInfo() {
    setShowProjectInfo(false);
  }

  function schedule(delay: number, fn: () => void) {
    const timer = window.setTimeout(fn, delay);
    timers.current.push(timer);
  }

  function queryForNode(node: ConceptNode, nextGranularity = granularity) {
    const branch = note.branches.find((item) => item.id === node.branchId);
    const path = branch?.points
      .filter((item) => item.depth <= node.depth)
      .map((item) => item.labels[nextGranularity])
      .join(" → ");
    return `${node.label} ${note.kind}${path ? ` ${path}` : ""}`;
  }

  function scrollToNewestHop() {
    window.requestAnimationFrame(() => {
      const viewport = hopViewportRef.current;
      viewport?.scrollTo({ left: viewport.scrollWidth, behavior: "smooth" });
    });
  }

  function extendOneHop() {
    if (extendingDepth || visibleDepth >= 6) return;
    const nextDepth = (visibleDepth + 1) as KnowledgeDepth;
    setExtendingDepth(nextDepth);
    scrollToNewestHop();
    schedule(720, () => {
      setVisibleDepth(nextDepth);
      setExtendingDepth(null);
      scrollToNewestHop();
    });
  }

  function collapseOneHop() {
    if (extendingDepth || visibleDepth <= 3) return;
    const nextDepth = (visibleDepth - 1) as KnowledgeDepth;
    if (selectedNode && selectedNode.depth > nextDepth) {
      setSelectedNodeId(null);
      setReadingResultId(null);
      setSearchStatus("idle");
      searchRequest.current += 1;
    }
    setVisibleDepth(nextDepth);
  }

  function changeGranularity(next: Granularity) {
    if (next === granularity) return;
    setGranularity(next);
    setSavedFlash(null);
    if (!selectedNode) return;
    const nextNode = nodesFor(note, next).find((item) => item.id === selectedNode.id);
    if (!nextNode) {
      setSelectedNodeId(null);
      setSearchStatus("idle");
      return;
    }
    if ((savedEvidence[selectedKey] ? "covered" : nextNode.coverage) === "missing") {
      const nextQuery = queryForNode(nextNode, next);
      setSearchQuery(nextQuery);
      setSubmittedQuery(nextQuery);
      setReadingResultId(null);
    }
  }

  function chooseNote(nextId: string) {
    const next = SEED_NOTES.find((item) => item.id === nextId);
    if (!next) return;
    setNoteId(next.id);
    setVisibleDepth(3);
    setExtendingDepth(null);
    setSelectedNodeId(null);
    setSearchQuery("");
    setSubmittedQuery("");
    setSearchScope("all");
    setReadingResultId(null);
    setSearchStatus("idle");
    setSavedFlash(null);
    searchRequest.current += 1;
    hopViewportRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }

  function runSearch(query = searchQuery) {
    if (!query.trim()) return;
    const request = searchRequest.current + 1;
    searchRequest.current = request;
    setSearchQuery(query);
    setSearchStatus("loading");
    setReadingResultId(null);
    setSearchMessage("正在并行检索公开网页、论文与权威资料…");
    schedule(680, () => {
      if (searchRequest.current !== request) return;
      setSubmittedQuery(query);
      setSearchStatus("ready");
      setSearchMessage("");
    });
  }

  function chooseNode(node: ConceptNode) {
    setSelectedNodeId(node.id);
    setReadingResultId(null);
    setSavedFlash(null);
    const key = nodeKey(note.id, node.id);
    const coverage: Coverage = savedEvidence[key] ? "covered" : node.coverage;
    if (coverage === "missing") {
      const query = queryForNode(node);
      setSearchScope("all");
      runSearch(query);
    } else {
      searchRequest.current += 1;
      setSearchStatus("idle");
      setSearchMessage("");
    }
  }

  function saveResult(result: SearchResult) {
    if (!selectedNode) return;
    const key = nodeKey(note.id, selectedNode.id);
    setSavedEvidence((current) => ({ ...current, [key]: result }));
    setSavedFlash(`已把“${result.title}”保存为明晰笔记`);
    setReadingResultId(null);
    setSearchStatus("idle");
    searchRequest.current += 1;
  }

  function resetDemo() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    searchRequest.current += 1;
    setNoteId(SEED_NOTES[0].id);
    setNoteQuery("");
    setGranularity("concept");
    setVisibleDepth(3);
    setExtendingDepth(null);
    setSelectedNodeId(null);
    setSearchStatus("idle");
    setSearchScope("all");
    setSearchQuery("");
    setSubmittedQuery("");
    setReadingResultId(null);
    setSavedEvidence({});
    setSavedFlash(null);
    setSearchMessage("");
    hopViewportRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }

  return (
    <section className="kcx" aria-label="从笔记扩散并补全相邻知识" data-tour="completion-area">
      <header className="kcx-head" data-tour="completion-header">
        <div>
          <span className="kcx-kicker">扩展 · Knowledge completion</span>
          <h1>从一篇笔记，找到知识库还没覆盖的相邻知识</h1>
          <p>有笔记的知识点直接查看证据；没有笔记的灰色知识点，点击后在右侧联网搜索。</p>
        </div>
        <div className="kcx-head-right">
          <button
            ref={projectTriggerRef}
            type="button"
            className="kcx-project-trigger"
            aria-haspopup="dialog"
            aria-expanded={showProjectInfo}
            aria-controls="knowledge-completion-project-dialog"
            onClick={() => setShowProjectInfo(true)}
          >
            <span><i aria-hidden>✓</i>真实能力已独立打包</span>
            <strong>Agent · Plugin · Skill</strong>
            <em>查看项目说明 ↗</em>
          </button>
          <div className="kcx-steps" aria-label="使用步骤">
            <span><b>1</b>选起点笔记</span>
            <i>→</i>
            <span><b>2</b>调粒度 · 延伸 3–6 跳</span>
            <i>→</i>
            <span><b>3</b>点灰色知识点补全</span>
          </div>
          <button type="button" className="kcx-reset" onClick={resetDemo}>重置演示</button>
        </div>
      </header>

      {showProjectInfo ? (
        <div className="kcx-project-backdrop" onMouseDown={closeProjectInfo}>
          <section
            id="knowledge-completion-project-dialog"
            className="kcx-project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-completion-project-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={projectCloseRef}
              type="button"
              className="kcx-project-close"
              aria-label="关闭知识补全项目说明"
              onClick={closeProjectInfo}
            >
              ×
            </button>
            <span className="kcx-project-kicker"><i aria-hidden />独立开源项目 · 可安装使用</span>
            <h2 id="knowledge-completion-project-title">知识补全，已经是一套真实可运行的全栈能力</h2>
            <p>
              你现在看到的是综合产品 Demo 的第四个功能页，用来预览知识补全的产品交互；它不会把这页的演示数据写进独立系统。
            </p>
            <p>
              核心能力已单独封装为 <strong>Knowledge Completion</strong>：输入 Markdown、TXT 或正文后，Agent 会生成唯一
              <code> runId </code>，后端持久化多粒度知识图谱，再打开对应的可交互产品页面。
            </p>
            <div className="kcx-project-chain" aria-label="真实运行链路">
              <span>笔记</span><i>→</i><span>Agent 分析</span><i>→</i><span>持久化图谱</span><i>→</i><span>交互页面</span>
            </div>
            <div className="kcx-project-tags" aria-label="项目交付形态">
              <span>Codex Plugin</span>
              <span>Claude Code / Cursor Skill</span>
              <span>Run API</span>
              <span>React 面板</span>
            </div>
            <div className="kcx-project-note">
              <strong>真实联通，可独立部署</strong>
              <span>本地安装即可跑通完整链路；面向公网时需按使用环境配置登录、权限隔离与限流。</span>
            </div>
            <div className="kcx-project-actions">
              <a href={KNOWLEDGE_COMPLETION_REPO_URL} target="_blank" rel="noreferrer">
                查看 GitHub 与安装说明 <span aria-hidden>↗</span>
              </a>
              <button type="button" onClick={closeProjectInfo}>继续体验本页</button>
            </div>
            <small className="kcx-project-url">github.com/noxinsun-source/knowledge-completion</small>
          </section>
        </div>
      ) : null}

      <div className="kcx-layout">
        <aside className="kcx-library" data-tour="completion-goal">
          <div className="kcx-side-title">
            <div><span>Step 1</span><strong>选择起点笔记</strong></div>
            <em>{SEED_NOTES.length} 篇</em>
          </div>
          <label className="kcx-note-search">
            <span aria-hidden>⌕</span>
            <input value={noteQuery} onChange={(event) => setNoteQuery(event.target.value)} placeholder="搜索我的笔记…" />
          </label>
          <div className="kcx-note-list">
            {filteredNotes.map((item) => (
              <button key={item.id} type="button" className={item.id === note.id ? "is-on" : ""} onClick={() => chooseNote(item.id)}>
                <span className="kcx-note-kind">{item.kind}</span>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
                <small>{item.domain}</small>
              </button>
            ))}
          </div>
          <div className="kcx-origin-card">
            <span>当前起点</span>
            <strong>{note.title}</strong>
            <small>{note.meta}</small>
          </div>
        </aside>

        <main className="kcx-map-panel">
          <div className="kcx-map-toolbar">
            <div className="kcx-map-title">
              <span>Step 2 · Multi-hop knowledge</span>
              <strong>{note.title}</strong>
              <small>跳数决定走多远，粒度决定看多细；起点笔记始终固定。</small>
            </div>
            <div className="kcx-granularity" role="group" aria-label="知识粒度">
              <span>知识粒度</span>
              <div>
                {GRANULARITY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={granularity === option.id ? "is-on" : ""}
                    onClick={() => changeGranularity(option.id)}
                    title={option.hint}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="kcx-depth-actions">
              <div className="kcx-map-stats" data-tour="completion-metrics">
                <span><b>{visibleDepth}</b> / 6 跳</span>
                <span><i className="covered" />覆盖 <b>{coveredCount}</b></span>
                <span><i className="missing" />缺口 <b>{missingCount}</b></span>
              </div>
              <div>
                {visibleDepth > 3 ? <button type="button" className="secondary" onClick={collapseOneHop} disabled={Boolean(extendingDepth)}>收回一跳</button> : null}
                <button type="button" className="primary" data-tour="completion-play" onClick={extendOneHop} disabled={Boolean(extendingDepth) || visibleDepth >= 6}>
                  {extendingDepth
                    ? `正在生成第 ${extendingDepth} 跳…`
                    : visibleDepth >= 6
                      ? "已延伸至第 6 跳"
                      : `继续延伸到第 ${visibleDepth + 1} 跳`}
                </button>
              </div>
            </div>
          </div>

          <div className="kcx-map-stage" aria-live="polite" data-tour="completion-map">
            <div className="kcx-grid" aria-hidden />
            <div className="kcx-origin-rail">
              <div className="kcx-origin-node">
                <span>起点固定</span>
                <strong>{note.title}</strong>
                <small>切粒度、点节点、继续延伸都不会换起点</small>
              </div>
              <div className="kcx-branch-list" aria-label="知识分支">
                {note.branches.map((branch) => <span key={branch.id}><i />{branch.title}</span>)}
              </div>
              <div className="kcx-map-tip">
                <span><i />本库有内容</span>
                <span><i />灰色虚线可联网补全</span>
              </div>
            </div>

            <div className="kcx-hop-viewport" ref={hopViewportRef} tabIndex={0} aria-label={`当前已展开 ${visibleDepth} 跳，可横向滚动`}>
              <div className="kcx-hop-canvas" style={{ width: `${(visibleDepth + (extendingDepth ? 1 : 0)) * 182}px` }}>
                {Array.from({ length: visibleDepth }, (_, index) => (index + 1) as KnowledgeDepth).map((depth) => (
                  <section className="kcx-hop-column" key={depth} aria-label={`第 ${depth} 跳`}>
                    <header><span>H{depth}</span><strong>第 {depth} 跳</strong></header>
                    {note.branches.map((branch, branchIndex) => {
                      const node = visibleNodes.find((item) => item.branchId === branch.id && item.depth === depth);
                      if (!node) return null;
                      const saved = savedEvidence[nodeKey(note.id, node.id)];
                      const coverage: Coverage = saved ? "covered" : node.coverage;
                      const selected = selectedNode?.id === node.id;
                      const inPath = Boolean(selectedPathIds?.has(node.id));
                      const muted = Boolean(selectedPathIds && !inPath);
                      return (
                        <div key={node.id} className={`kcx-hop-cell is-${coverage}${inPath ? " is-path" : ""}${muted ? " is-muted" : ""}`}>
                          <button
                            type="button"
                            className={`kcx-concept is-${coverage}${selected ? " is-selected" : ""}${depth >= 5 ? " is-far" : ""}`}
                            style={{ animationDelay: `${branchIndex * 70}ms` }}
                            onClick={() => chooseNode(node)}
                            aria-label={`第 ${depth} 跳，${coverageLabel(coverage)}，${node.label}`}
                          >
                            <span>{branch.title} · {saved ? "刚补入" : coverageLabel(coverage)}</span>
                            <strong>{node.label}</strong>
                            <small>{coverage === "missing" ? "点击联网搜索" : `${node.evidence.length + (saved ? 1 : 0)} 条本库证据`}</small>
                          </button>
                        </div>
                      );
                    })}
                  </section>
                ))}

                {extendingDepth ? (
                  <section className="kcx-hop-column is-loading" aria-label={`正在生成第 ${extendingDepth} 跳`}>
                    <header><span>H{extendingDepth}</span><strong>生成中</strong></header>
                    {note.branches.map((branch, index) => <div className="kcx-hop-cell" key={branch.id}><div className="kcx-node-skeleton" style={{ animationDelay: `${index * 90}ms` }}><i /><b /><em /></div></div>)}
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </main>

        <aside className="kcx-inspector" data-tour="completion-inspector">
          {!selectedNode ? (
            <div className="kcx-guide">
              <span>Step 3</span>
              <h2>点击一个相邻知识点</h2>
              <p>暖色节点会显示本库笔记；灰色节点会自动联网搜索。</p>
            </div>
          ) : effectiveCoverage !== "missing" && !readingResult ? (
            <div className="kcx-local">
              <div className="kcx-inspector-head">
                <span className={`is-${effectiveCoverage}`}>{savedSource ? "刚刚补入知识库" : coverageLabel(effectiveCoverage ?? "covered")}</span>
                <h2>{selectedNode.label}</h2>
                <p>{selectedNode.summary}</p>
              </div>

              <div className="kcx-path-strip" aria-label="从起点到当前知识点的路径">
                <span>起点</span>{selectedPath.map((item) => <span key={item.id}>→ {item.label}</span>)}
              </div>

              {savedFlash ? <div className="kcx-saved-flash"><i>✓</i><span>{savedFlash}<small>原位置节点已由灰色变为暖色</small></span></div> : null}

              <div className="kcx-relation">
                <span>与起点笔记的关系</span>
                <strong>{selectedNode.relation}</strong>
              </div>

              <div className="kcx-local-title">
                <div><strong>本库证据</strong><span>{selectedNode.evidence.length + (savedSource ? 1 : 0)} 条</span></div>
                <small>先读当前笔记与本库证据，不自动联网</small>
              </div>

              <div className="kcx-evidence-list">
                {savedSource ? (
                  <article className="is-new">
                    <span>网页补全 · 刚刚保存</span>
                    <h3>{savedSource.title}</h3>
                    <p>{savedSource.snippet}</p>
                    <small>{savedSource.domain} · {savedSource.date}</small>
                  </article>
                ) : null}
                {selectedNode.evidence.map((item) => (
                  <article key={item.title}>
                    <span>{selectedNode.coverage === "covered" ? "当前起点笔记" : "明晰相关笔记"}</span>
                    <h3>{item.title}</h3>
                    <blockquote>{item.excerpt}</blockquote>
                    <small>{item.source}</small>
                  </article>
                ))}
              </div>

              {effectiveCoverage === "partial" ? (
                <button type="button" className="kcx-search-more" onClick={() => runSearch(`${selectedNode.label} ${note.domain}`)}>继续联网补全这个知识点</button>
              ) : null}
            </div>
          ) : readingResult ? (
            <div className="kcx-reader">
              <button type="button" className="kcx-back" onClick={() => setReadingResultId(null)}>← 返回搜索结果</button>
              <div className="kcx-reader-source"><i />{readingResult.domain}<span>{readingResult.path}</span></div>
              <h2>{readingResult.title}</h2>
              <div className="kcx-reader-meta">{readingResult.date} · {readingResult.readTime}</div>
              <p className="kcx-reader-lead">{readingResult.snippet}</p>
              <div className="kcx-reader-body">
                <span>站内阅读预览</span>
                <p>这条资料与“{selectedNode.label}”直接相关。明晰先保留来源、标题和关键段落，再由你决定是否写入个人知识库。</p>
                <h3>关键内容</h3>
                <ul>{readingResult.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                <p>保存后会生成一张新的明晰笔记卡，并把图中原位置的灰色知识点更新为“本库已覆盖”。起点与跳数不会变化。</p>
              </div>
              <div className="kcx-reader-actions">
                <button type="button" onClick={() => setReadingResultId(null)}>继续看结果</button>
                <button type="button" className="primary" onClick={() => saveResult(readingResult)}>保存为笔记并补全</button>
              </div>
            </div>
          ) : (
            <div className="kcx-search-view">
              <div className="kcx-search-head">
                <div className="kcx-inspector-head compact">
                  <span className="is-missing">知识库未覆盖</span>
                  <h2>{selectedNode.label}</h2>
                  <p>{selectedNode.summary}</p>
                </div>
                <div className="kcx-path-strip compact" aria-label="从起点到当前知识点的路径">
                  <span>第 {selectedNode.depth} 跳</span>{selectedPath.map((item) => <span key={item.id}>→ {item.label}</span>)}
                </div>
                <form
                  className="kcx-web-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runSearch();
                  }}
                >
                  <span aria-hidden>⌕</span>
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="联网搜索关键词" />
                  <button type="submit">搜索</button>
                </form>
                <div className="kcx-search-tabs" role="tablist">
                  {([
                    ["all", "综合"],
                    ["academic", "学术"],
                    ["docs", "权威资料"],
                    ["chinese", "中文网页"],
                  ] as Array<[SearchScope, string]>).map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={searchScope === id} className={searchScope === id ? "is-on" : ""} onClick={() => setSearchScope(id)}>{label}</button>
                  ))}
                </div>
              </div>

              {searchStatus === "loading" ? (
                <div className="kcx-search-loading">
                  <span><i />正在联网搜索</span>
                  <p>{searchMessage}</p>
                  {[1, 2, 3, 4].map((item) => <div key={item}><i /><b /><em /></div>)}
                </div>
              ) : searchStatus === "error" ? (
                <div className="kcx-search-state"><strong>暂时无法完成搜索</strong><p>关键词已保留，你可以直接重试。</p><button type="button" onClick={() => runSearch()}>重新搜索</button></div>
              ) : searchStatus === "empty" || !rankedResults.length ? (
                <div className="kcx-search-state"><strong>没有找到匹配结果</strong><p>试着减少限定词，或切换到“综合”。</p><button type="button" onClick={() => { setSearchScope("all"); runSearch(); }}>扩大搜索范围</button></div>
              ) : (
                <>
                  <div className="kcx-result-summary">
                    <span>约 {rankedResults.length * 128} 条结果 · 已去重 {rankedResults.length * 3 + 7}</span>
                    <small>按与“{selectedNode.label}”的相关性排序</small>
                  </div>
                  <div className="kcx-results" tabIndex={0} aria-label="可滚动的联网搜索结果">
                    {rankedResults.map((result, index) => (
                      <article key={result.id}>
                        <div className="kcx-result-domain"><i>{result.domain.slice(0, 1).toUpperCase()}</i><span>{result.domain}<small>{result.path}</small></span></div>
                        <button type="button" className="kcx-result-title" onClick={() => setReadingResultId(result.id)}>{result.title}</button>
                        <p>{result.snippet}</p>
                        <div className="kcx-result-foot">
                          <span>{result.date}</span>
                          {result.tags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}
                          <button type="button" onClick={() => saveResult(result)}>保存为笔记</button>
                        </div>
                        {index === 0 ? <b className="kcx-best">最相关</b> : null}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
