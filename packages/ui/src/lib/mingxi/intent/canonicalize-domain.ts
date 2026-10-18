/**
 * C1 领域路径规范化：同义前缀 → 骨干 L1/L2，禁止非法顶层与 L2 互挂。
 */
import backbone from "../../../data/mingxi/eval/vocab/domain-backbone.json" with { type: "json" };
import synonyms from "../../../data/mingxi/eval/vocab/domain-synonyms.json" with { type: "json" };

export type DomainBackbone = {
  version: string;
  maxDepth: number;
  roots: Array<{ name: string; children: string[] }>;
  aliases?: Record<string, string>;
};

type SynonymPack = {
  prefixMap: Record<string, string[]>;
  segmentAliases?: Record<string, string>;
};

const bb = backbone as DomainBackbone;
const syn = synonyms as SynonymPack;

const L1_SET = new Set(bb.roots.map((r) => r.name));
const L2_BY_L1 = new Map(bb.roots.map((r) => [r.name, new Set(r.children)]));
/** 全局 L2 名 → 所属 L1（同名 L2 不应跨门类出现） */
const L2_OWNER = new Map<string, string>();
for (const r of bb.roots) {
  for (const c of r.children) L2_OWNER.set(c, r.name);
}
const ALL_L2 = new Set(L2_OWNER.keys());
const MAX_DEPTH = bb.maxDepth || 4;

/** 最长前缀优先 */
const PREFIX_RULES = Object.entries(syn.prefixMap)
  .map(([k, v]) => ({
    key: k.split("/").map((s) => s.trim()).filter(Boolean),
    to: v.map((s) => String(s).trim()).filter(Boolean),
  }))
  .sort((a, b) => b.key.length - a.key.length);

function collapseDupes(path: string[]): string[] {
  const out: string[] = [];
  for (const seg of path) {
    const s = seg.trim();
    if (!s) continue;
    if (out.length && out[out.length - 1] === s) continue;
    out.push(s);
  }
  return out;
}

function aliasSegment(seg: string): string {
  const a = bb.aliases?.[seg] || syn.segmentAliases?.[seg];
  return a || seg;
}

function applyPrefix(path: string[]): string[] {
  for (const rule of PREFIX_RULES) {
    if (rule.key.length > path.length) continue;
    const hit = rule.key.every((k, i) => path[i] === k || aliasSegment(path[i]) === k);
    if (!hit) continue;
    return [...rule.to, ...path.slice(rule.key.length)];
  }
  return path;
}

/** 非法 L1 时，按关键词落到骨干 */
function rescueL1(path: string[]): string[] {
  const blob = path.join(" ");
  if (/医学|临床|病理|药|诊|mNGS|医疗/.test(blob)) {
    return ["医药科学", "临床医学", ...path.filter((s) => !L1_SET.has(s))].slice(0, MAX_DEPTH);
  }
  if (/金融|银行|利率|理财/.test(blob)) {
    return ["生活与职业", "理财消费", ...path.slice(0, 2)].slice(0, MAX_DEPTH);
  }
  if (/学习|记忆|间隔重复|教育/.test(blob)) {
    return ["人文与社会科学", "教育学", ...path.filter((s) => !L1_SET.has(s))].slice(
      0,
      MAX_DEPTH,
    );
  }
  if (/知识管理|Obsidian|知识图谱|KG/.test(blob)) {
    return ["生活与职业", "知识管理", ...path.filter((s) => !L1_SET.has(s))].slice(
      0,
      MAX_DEPTH,
    );
  }
  if (/公众号|内容创作|小红书|演示|幻灯|模板/.test(blob)) {
    return ["创作与媒介", "内容创作", ...path.filter((s) => !L1_SET.has(s))].slice(
      0,
      MAX_DEPTH,
    );
  }
  if (/职业|实习|产品运营/.test(blob) && !/评测|Agent|模型/.test(blob)) {
    return ["生活与职业", "职业发展", ...path.filter((s) => !L1_SET.has(s))].slice(
      0,
      MAX_DEPTH,
    );
  }
  return ["工程与技术科学", "人工智能", ...path.filter((s) => s !== "未分类")].slice(
    0,
    MAX_DEPTH,
  );
}

/**
 * 工程门类下按主题关键词选 L2（解决 AI 乱挂父子）。
 * 返回 null 表示没有强信号。
 */
function inferEngineeringL2(segments: string[]): string | null {
  const blob = segments.join(" ");
  if (
    /\bPEP\b|Python|前端|Fetch|Markdown|JSON|协议|RFC|CommonMark|代码风格|解释器|软工|编程|开发规范|API\b/i.test(
      blob,
    )
  ) {
    return "软件工程";
  }
  if (/工业|机床|质检|制造|伺服|自动化产线/.test(blob)) return "工业与制造";
  if (/Power\s*Platform|低代码|企业信息化|Fabric|Rayfin|ERP|OA\b/i.test(blob)) {
    return "企业信息化";
  }
  if (/数据科学|测评|切分|MinerU|语料|标注规范/.test(blob) && !/大模型|Agent|RAG/.test(blob)) {
    return "数据科学";
  }
  if (/电子|通信|射频|芯片|嵌入式/.test(blob)) return "电子与通信";
  if (
    /操作系统|编译|算法与数据结构|计算机网络|体系结构|计科/.test(blob) &&
    !/大模型|Agent|RAG|提示词|LLM|NLP|多模态/.test(blob)
  ) {
    return "计算机科学技术";
  }
  if (
    /人工智能|大模型|LLM|Agent|RAG|提示词|Prompt|Skill|Harness|NLP|自然语言|多模态|推理部署|GPU推理|Transformer|注意力|检索增强/i.test(
      blob,
    )
  ) {
    return "人工智能";
  }
  return null;
}

function inferL2ForL1(l1: string, tail: string[]): string | null {
  if (l1 === "工程与技术科学") return inferEngineeringL2(tail);
  if (l1 === "人文与社会科学") {
    const blob = tail.join(" ");
    if (/学习|记忆|间隔|教育|教学法/.test(blob)) return "教育学";
    if (/心理|认知/.test(blob)) return "心理学";
    if (/语言|语法|词汇/.test(blob)) return "语言学";
  }
  if (l1 === "生活与职业") {
    const blob = tail.join(" ");
    if (/知识管理|Obsidian|知识图谱|第二大脑/.test(blob)) return "知识管理";
    if (/理财|金融|利率/.test(blob)) return "理财消费";
    if (/效率|番茄|GTD|习惯/.test(blob)) return "个人效率";
    if (/职业|实习|简历|职场/.test(blob)) return "职业发展";
  }
  if (l1 === "创作与媒介") {
    const blob = tail.join(" ");
    if (/演示|PPT|幻灯|汇报/.test(blob)) return "演示表达";
    if (/视觉|设计|排版/.test(blob)) return "视觉设计";
    if (/增长|投放|转化/.test(blob)) return "产品增长";
    return "内容创作";
  }
  return null;
}

/**
 * 禁止把别的 L2 名挂在当前 L2 下面（如 人工智能/软件工程/Python）。
 * 策略：用关键词重选 L2；若尾段出现另一 L2 名，优先抬为正 L2。
 */
function untangleSiblingL2(path: string[]): string[] {
  if (path.length < 2) return path;
  const l1 = path[0];
  const allowed = L2_BY_L1.get(l1);
  if (!allowed) return path;

  const l2 = aliasSegment(path[1]);
  const rest = path.slice(2).map(aliasSegment);

  // 尾部若出现「别的 L2 名」，记录候选
  const nestedL2 = rest.find((s) => ALL_L2.has(s) && s !== l2);
  // 推断只用非 L2 主题词，避免「数据科学」等段名自己把自己选成 L2
  const themeOnly = rest.filter((s) => !ALL_L2.has(s));
  const inferred = inferL2ForL1(
    l1,
    themeOnly.length ? themeOnly : nestedL2 ? [] : [l2, ...rest],
  );

  if (nestedL2 && allowed.has(nestedL2)) {
    // 有主题关键词则听关键词；否则把嵌套的第一个 L2 抬正
    const chosen =
      inferred && allowed.has(inferred) ? inferred : nestedL2;
    const cleaned = rest.filter((s) => s !== chosen && !ALL_L2.has(s));
    return collapseDupes([l1, chosen, ...cleaned]).slice(0, MAX_DEPTH);
  }

  if (!allowed.has(l2)) {
    const fallback =
      (inferred && allowed.has(inferred) ? inferred : null) ||
      [...allowed][0] ||
      "未归类";
    const asTheme = !ALL_L2.has(l2) && l2 !== "未归类" && l2 !== "未分类";
    return collapseDupes(
      asTheme ? [l1, fallback, l2, ...rest] : [l1, fallback, ...rest],
    ).slice(0, MAX_DEPTH);
  }

  // L2 合法，但主题词强烈指向另一并列 L2（如挂在 AI 下的 Python）
  if (inferred && inferred !== l2 && allowed.has(inferred)) {
    const cleaned = rest.filter((s) => s !== inferred && !ALL_L2.has(s));
    return collapseDupes([l1, inferred, ...cleaned]).slice(0, MAX_DEPTH);
  }

  const cleaned = rest.filter((s) => !ALL_L2.has(s) || s === l2);
  return collapseDupes([l1, l2, ...cleaned]).slice(0, MAX_DEPTH);
}

function alignL2(path: string[]): string[] {
  if (path.length < 1) return path;
  // 若第一段其实是 L2，补 L1
  if (!L1_SET.has(path[0]) && L2_OWNER.has(aliasSegment(path[0]))) {
    const l2 = aliasSegment(path[0]);
    const l1 = L2_OWNER.get(l2)!;
    return untangleSiblingL2([l1, l2, ...path.slice(1)]);
  }
  if (path.length < 2) {
    const l1 = path[0];
    const allowed = L2_BY_L1.get(l1);
    const inferred = inferL2ForL1(l1, path);
    const l2 = (inferred && allowed?.has(inferred) ? inferred : null) || [...(allowed || [])][0] || "未归类";
    return [l1, l2];
  }
  return untangleSiblingL2(path);
}

/**
 * 将任意 domainPath 收敛到 C1 骨干。
 * 保证：L1 ∈ 封闭门类；L2 ∈ 该门类骨干；深度 ≤ 4；禁止 L2 互为子孙。
 */
export function canonicalizeDomainPath(input: string[] | null | undefined): string[] {
  let path = (input || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (!path.length) return ["工程与技术科学", "未归类"];

  path = path.map(aliasSegment);
  path = applyPrefix(path);
  path = collapseDupes(path);

  // 去掉误当路径段的 L1 重复
  if (path.length >= 2 && L1_SET.has(path[1]) && path[1] !== path[0]) {
    // 例如 ["工程与技术科学","生活与职业",...] —— 保留更靠后的门类信号较难，优先保留首 L1
    path = [path[0], ...path.slice(1).filter((s) => !L1_SET.has(s))];
  }

  if (!L1_SET.has(path[0])) {
    path = rescueL1(path);
    path = collapseDupes(path);
  }

  path = alignL2(path);
  path = collapseDupes(path).slice(0, MAX_DEPTH);

  if (!path.length) return ["工程与技术科学", "未归类"];
  // 最终再扫一遍：不允许 L3+ 含其它 L2
  if (path.length >= 3) {
    const l2 = path[1];
    const rest = path.slice(2).filter((s) => !ALL_L2.has(s) || s === l2);
    path = collapseDupes([path[0], l2, ...rest]).slice(0, MAX_DEPTH);
  }
  return path;
}

export function listDomainL1(): string[] {
  return bb.roots.map((r) => r.name);
}

export function listDomainL2(l1?: string): string[] {
  if (l1) return [...(L2_BY_L1.get(l1) || [])];
  return [...ALL_L2];
}

export function domainBackbonePromptBlock(): string {
  const lines = bb.roots.map(
    (r) => `- ${r.name} → ${r.children.slice(0, 8).join(" / ")}`,
  );
  return [
    `domainPath 必须挂在下列封闭 L1 下（禁止另起「技术/科技/编程/人工智能」作顶层）：`,
    ...lines,
    `L2 为并列学科，禁止互为父子（禁止：…/人工智能/软件工程/…）。`,
    `大模型 / Agent / RAG / 提示词 → 工程与技术科学 / 人工智能 / …`,
    `Python / PEP / 前端 / 协议 → 工程与技术科学 / 软件工程 / …`,
    `输出 3-4 级；L3–L4 用具体主题词，不要再用其它 L2 名。`,
  ].join("\n");
}
