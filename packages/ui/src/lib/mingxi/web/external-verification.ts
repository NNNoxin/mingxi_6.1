export type VerificationOrigin = {
  noteId: string;
  title: string;
  summary: string;
  domainPath: string[];
  sourceUri?: string;
};

export type EvidenceKind = "origin" | "official" | "research" | "counterexample" | "context";

export type EvidenceVerdict = "pending" | "accepted" | "cautious" | "excluded";
export type VerificationScope = "fact" | "timeliness" | "controversy";

export type VerificationVerdict =
  | "supported"
  | "partly_supported"
  | "outdated"
  | "unsupported"
  | "insufficient";

export type VerificationEvidence = {
  id: string;
  kind: EvidenceKind;
  sourceName: string;
  sourceUrl: string;
  title: string;
  snippet: string;
  content: string[];
  freshness: string;
  reliability: "高" | "中" | "待核";
};

export type VerificationRecord = {
  id: string;
  noteId: string;
  question: string;
  scope: VerificationScope;
  verdict: VerificationVerdict;
  conclusion: string;
  acceptedEvidenceIds: string[];
  cautiousEvidenceIds: string[];
  excludedEvidenceIds: string[];
  exclusionReasons: Record<string, string>;
  reviewedEvidence: Array<
    VerificationEvidence & {
      verdict: Exclude<EvidenceVerdict, "pending">;
      exclusionReason?: string;
    }
  >;
  appendToNote: boolean;
  createLogicBranch: boolean;
  verifiedAt: string;
};

function searchUrl(query: string): string {
  return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
}

function clipped(text: string, max = 148): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function isLicenseEvaluation(origin: VerificationOrigin): boolean {
  return /营业执照|Qwen3?-VL|信用代码|视觉语言模型|OCR/i.test(
    `${origin.title} ${origin.summary} ${origin.domainPath.join(" ")}`,
  );
}

function isKnowledgeRetrieval(origin: VerificationOrigin): boolean {
  return /RAG|检索增强|BM25|向量检索|知识库|医疗诊断/i.test(
    `${origin.title} ${origin.summary} ${origin.domainPath.join(" ")}`,
  );
}

/**
 * 高保真前端 Demo 的录制证据夹具。
 * 它只提供核验路径与可读快照，不把演示文本伪装成实时事实结论。
 */
export function buildVerificationEvidence(
  origin: VerificationOrigin,
  question: string,
  scope: VerificationScope = "fact",
): VerificationEvidence[] {
  const title = origin.title;
  const domain = origin.domainPath.join(" / ") || "当前领域";
  const scopeQuery =
    scope === "timeliness"
      ? "最新 版本 更新 日期"
      : scope === "controversy"
        ? "反例 争议 局限"
        : "事实 数据 官方";
  const query = (text: string) => searchUrl(`${text} ${scopeQuery} ${question}`);
  const originalSummary = clipped(origin.summary || title, 210);
  const originalUrl = /^https?:\/\//i.test(origin.sourceUri || "")
    ? String(origin.sourceUri)
    : query(`${title} 原始资料`);

  const base: VerificationEvidence[] = [
    {
      id: `${origin.noteId}:origin`,
      kind: "origin",
      sourceName: "当前笔记 · 本库原文",
      sourceUrl: originalUrl,
      title: "先锁定原笔记真正提出的结论",
      snippet: originalSummary,
      content: [
        `核实对象：${question}`,
        `原笔记摘要：${originalSummary}`,
        "这条证据只说明原文说了什么，不自动证明原文是对的。后续公开资料必须与它交叉比对。",
      ],
      freshness: "原始记录",
      reliability: "高",
    },
  ];

  if (isLicenseEvaluation(origin)) {
    return [
      ...base,
      {
        id: `${origin.noteId}:standard`,
        kind: "official",
        sourceName: "国家标准与官方口径检索",
        sourceUrl: query("GB 32100 统一社会信用代码 校验规则 官方"),
        title: "统一社会信用代码应按权威规则单独复核",
        snippet:
          "18 位代码的字符集合、位置和校验位可以形成独立复核线索，不能只依赖通用视觉模型的一次输出。",
        content: [
          "建议核对字符集合、长度、登记管理部门码和校验位规则。",
          "这能验证原报告对‘密集字母数字串容易误读’的风险判断，但不能替代原始图片人工复核。",
        ],
        freshness: "官方口径",
        reliability: "高",
      },
      {
        id: `${origin.noteId}:api`,
        kind: "official",
        sourceName: "营业执照识别官方文档检索",
        sourceUrl: query("营业执照识别 API 字段 官方文档"),
        title: "对照服务的字段定义与空值口径需要一致",
        snippet:
          "注册资本、营业期限等字段存在合法空值；评测前必须确认被测模型与对照 API 使用相同字段定义。",
        content: [
          "优先检查字段是否允许为空、日期格式和经营范围归一化方式。",
          "如果两套系统字段定义不同，宏平均指标会把口径差异误判成模型错误。",
        ],
        freshness: "持续更新",
        reliability: "高",
      },
      {
        id: `${origin.noteId}:vlm`,
        kind: "research",
        sourceName: "论文与技术报告检索",
        sourceUrl: query("vision language model OCR character confusion document evaluation paper"),
        title: "视觉语言模型在密集小字符上的误读需要单项评测",
        snippet:
          "总体 F1 可能掩盖信用代码、人名和长地址等关键字段的局部失败，适合同时报告逐字段指标与坏例分桶。",
        content: [
          "检查论文或技术报告是否使用相近分辨率、文本密度和语言环境。",
          "只采纳能说明实验条件的资料；纯产品宣传不能作为性能证明。",
        ],
        freshness: "近年研究",
        reliability: "中",
      },
      {
        id: `${origin.noteId}:gold`,
        kind: "counterexample",
        sourceName: "评测方法反证检索",
        sourceUrl: query("silver label gold annotation evaluation bias OCR"),
        title: "银标 GT 本身可能造成低估或误判",
        snippet:
          "若对照系统也会漏读或错读，必须抽样制作人工 gold；否则不能把所有差异直接归因于被测模型。",
        content: [
          "核对 gold 覆盖比例、复核者一致性和争议样本处理方法。",
          "若人工 gold 尚未完成，结论应保留‘当前口径下’这一限制语。",
        ],
        freshness: "方法论",
        reliability: "高",
      },
    ];
  }

  if (isKnowledgeRetrieval(origin)) {
    return [
      ...base,
      {
        id: `${origin.noteId}:official`,
        kind: "official",
        sourceName: "官方技术文档检索",
        sourceUrl: query(`${title} 官方 文档`),
        title: "先核对版本、能力边界与官方定义",
        snippet: "确认原结论针对的组件版本、数据范围和适用场景，避免把旧版本经验直接外推。",
        content: ["检查发布日期与版本号。", "只把官方明确承诺的能力作为强证据。"],
        freshness: "持续更新",
        reliability: "高",
      },
      {
        id: `${origin.noteId}:paper`,
        kind: "research",
        sourceName: "论文与基准检索",
        sourceUrl: query(`${title} paper benchmark evaluation`),
        title: "检索公开实验，看结论是否跨数据集成立",
        snippet: "关注基线、数据规模、检索指标与消融实验，而不是只看结论段。",
        content: ["记录实验设置与原笔记是否一致。", "优先采纳可以复现或有完整表格的结果。"],
        freshness: "近年研究",
        reliability: "中",
      },
      {
        id: `${origin.noteId}:risk`,
        kind: "counterexample",
        sourceName: "失败案例与安全边界检索",
        sourceUrl: query(`${title} failure cases limitations`),
        title: "主动查找反例、失效条件与部署风险",
        snippet: "医疗、高风险决策或实时知识场景需要额外的来源追踪、人工复核和失效兜底。",
        content: ["区分检索质量、生成质量与最终业务效果。", "把未验证风险留在核实记录中。"],
        freshness: "风险核对",
        reliability: "中",
      },
      {
        id: `${origin.noteId}:context`,
        kind: "context",
        sourceName: "行业实践检索",
        sourceUrl: query(`${title} production case study`),
        title: "行业案例只能补充情境，不能替代一手证据",
        snippet: "案例可帮助判断成本、流程和团队约束，但应标明机构、时间和是否可复现。",
        content: ["保留来源、时间和使用条件。", "宣传稿或二次转载默认降权。"],
        freshness: "案例资料",
        reliability: "待核",
      },
    ];
  }

  return [
    ...base,
    {
      id: `${origin.noteId}:official`,
      kind: "official",
      sourceName: "官方与一手资料检索",
      sourceUrl: query(`${title} 官方 一手资料`),
      title: "核对定义、时间与适用范围",
      snippet: `围绕「${domain}」寻找权威定义，并确认原笔记是否遗漏版本或地区差异。`,
      content: ["先看一手发布者，再看二次解读。", "记录发布日期、版本和适用范围。"],
      freshness: "持续更新",
      reliability: "高",
    },
    {
      id: `${origin.noteId}:research`,
      kind: "research",
      sourceName: "研究与深度资料检索",
      sourceUrl: query(`${title} 论文 研究 数据`),
      title: "寻找数据、方法与可复核的论证",
      snippet: "优先阅读包含样本、方法、限制和引用链的资料，避免只采纳观点相似的摘要。",
      content: ["检查样本规模和方法。", "确认结论是否被正文数据支持。"],
      freshness: "研究资料",
      reliability: "中",
    },
    {
      id: `${origin.noteId}:counter`,
      kind: "counterexample",
      sourceName: "反例与争议检索",
      sourceUrl: query(`${title} 反例 争议 局限`),
      title: "主动寻找会推翻或限制原结论的证据",
      snippet: "至少保留一条反方路径，用来判断原结论是成立、部分成立，还是证据不足。",
      content: ["记录反例发生的条件。", "区分真正冲突与适用场景不同。"],
      freshness: "争议资料",
      reliability: "中",
    },
    {
      id: `${origin.noteId}:context`,
      kind: "context",
      sourceName: "行业案例检索",
      sourceUrl: query(`${title} 实践 案例`),
      title: "用实践资料补充可落地性，不作为唯一证明",
      snippet: "案例用于补充成本、流程和实施约束；没有方法和数据时不能直接升级为强结论。",
      content: ["确认案例主体和时间。", "把不可复现的经验降为背景资料。"],
      freshness: "案例资料",
      reliability: "待核",
    },
  ];
}

export function draftVerificationConclusion(
  origin: VerificationOrigin,
  verdicts: Record<string, EvidenceVerdict>,
): { verdict: VerificationVerdict; text: string } {
  const externalValues = Object.entries(verdicts)
    .filter(([id]) => !id.endsWith(":origin"))
    .map(([, value]) => value);
  const accepted = externalValues.filter((value) => value === "accepted").length;
  const cautious = externalValues.filter((value) => value === "cautious").length;
  const excluded = externalValues.filter((value) => value === "excluded").length;

  if (accepted === 0) {
    return {
      verdict: "insufficient",
      text: `目前没有足够的可采纳证据支持「${clipped(origin.title, 42)}」中的核心结论。建议保留原笔记，但标注为“待继续核实”，不要直接用于高风险决策。`,
    };
  }
  if (cautious > 0 || excluded > accepted) {
    return {
      verdict: "partly_supported",
      text: `现有资料对原笔记的方向提供了部分支持，但仍有 ${cautious + excluded} 条证据存在适用边界、时效或可靠性问题。建议保留结论，同时补上限制条件与待验证项。`,
    };
  }
  return {
    verdict: "supported",
    text: `已完成交叉核对：${accepted} 条资料可作为当前结论的支撑。建议保留原笔记的核心判断，并把来源、时间和适用范围一并写入核实记录。`,
  };
}

export function createVerificationRecord(input: {
  origin: VerificationOrigin;
  question: string;
  scope?: VerificationScope;
  verdict: VerificationVerdict;
  conclusion: string;
  verdicts: Record<string, EvidenceVerdict>;
  evidence?: VerificationEvidence[];
  exclusionReasons?: Record<string, string>;
  appendToNote: boolean;
  createLogicBranch: boolean;
  now?: string;
}): VerificationRecord {
  const ids = Object.entries(input.verdicts);
  const verifiedAt = input.now ?? new Date().toISOString();
  return {
    id: `verify:${input.origin.noteId}:${verifiedAt}`,
    noteId: input.origin.noteId,
    question: input.question.trim(),
    scope: input.scope || "fact",
    verdict: input.verdict,
    conclusion: input.conclusion.trim(),
    acceptedEvidenceIds: ids.filter(([, value]) => value === "accepted").map(([id]) => id),
    cautiousEvidenceIds: ids.filter(([, value]) => value === "cautious").map(([id]) => id),
    excludedEvidenceIds: ids.filter(([, value]) => value === "excluded").map(([id]) => id),
    exclusionReasons: Object.fromEntries(
      ids.flatMap(([id, value]) => {
        if (value !== "excluded") return [];
        const reason = String(input.exclusionReasons?.[id] || "").trim();
        return reason ? [[id, reason]] : [];
      }),
    ),
    reviewedEvidence: (input.evidence || []).flatMap((item) => {
      const verdict = input.verdicts[item.id];
      if (!verdict || verdict === "pending" || item.kind === "origin") return [];
      const exclusionReason = String(input.exclusionReasons?.[item.id] || "").trim();
      return [{ ...item, verdict, ...(exclusionReason ? { exclusionReason } : {}) }];
    }),
    appendToNote: input.appendToNote,
    createLogicBranch: input.createLogicBranch,
    verifiedAt,
  };
}
