"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DomainFanAtlas } from "./DomainFanAtlas";
import { DomainPurposeRail } from "./DomainPurposeRail";
import { LogicMindMap } from "./LogicMindMap";
import { NoteMediaView } from "./NoteMediaView";
import { MarkdownView } from "./MarkdownView";
import { ThinkLogicReplayDemo } from "./ThinkLogicReplayDemo";
import { KnowledgeExpansionDemo } from "./KnowledgeExpansionDemo";
import { ExternalVerificationFlow } from "./ExternalVerificationFlow";
import { LogicChainDeliveryCard } from "./LogicChainDeliveryCard";
import {
  CapturePanel,
  DecisionPanel,
  EvalPanel,
  LookupPanel,
  PurposeConfirmPanel,
  type DecisionCardView,
  type EvalReportView,
  type LookupCardView,
} from "./ProductAgentPanels";
import { noteMatchesDomainPrefix } from "../../lib/mingxi/web/domain-coverage";
import { onTourCmd } from "../../lib/mingxi/demo/tour-bus";
import type { NoteMedia } from "../../lib/mingxi/web/note-media";
import type {
  VerificationOrigin,
  VerificationRecord,
} from "../../lib/mingxi/web/external-verification";
import "./web-workbench.css";
import "./think-logic-demo.css";

/** 一键演示：Agent 评测 / Skill 落地逻辑线 */
const DEMO_AGENT_INTENT =
  "把库里关于 Agent 评测与 Skill 落地的避雷和正例，梳成一条可执行的学习逻辑线";

const AGENT_MODES = [
  { id: "agent", label: "Agent", hint: "Harness：召回 → 角度 → reline → 确认生效" },
  { id: "ask", label: "Ask", hint: "只召回+问答旁白，不改逻辑图" },
  { id: "plan", label: "Plan", hint: "召回+角度草案，不建链" },
] as const;

const THINK_LEVELS = [
  { id: "high-fast", label: "High Fast", hint: "硅基流动旁白 · 快路径" },
  { id: "balanced", label: "Balanced", hint: "均衡召回与报告" },
  { id: "deep", label: "Deep", hint: "更长上下文 · 更细角度" },
  { id: "demo", label: "Demo", hint: "固定演示意图 · 可离线走通" },
] as const;

type AgentModeId = (typeof AGENT_MODES)[number]["id"];
type ThinkLevelId = (typeof THINK_LEVELS)[number]["id"];

export type LibraryNote = {
  id: string;
  corpusId: string;
  title: string;
  summary: string;
  preview: string;
  modality: string;
  capturedAt?: string;
  purposeLabel: string;
  polarity: string;
  stance: string;
  domainPath: string[];
  functionalTypes: string[];
  userGoals: string[];
  theme?: string;
  /** 捕获时原标题（文件名等），仅溯源 */
  sourceTitle?: string;
  imageUrl?: string | null;
  sourceUri?: string;
  tags: string[];
  sourceKind?: "library" | "web";
  media?: NoteMedia | null;
};

type LogicNode = {
  id: string;
  label: string;
  kind: "intent" | "spine" | "branch" | "note" | "action" | "concept";
  noteId?: string;
  purposeLabel?: string;
  done?: boolean;
  parentId?: string;
  sourceKind?: "library" | "web";
};

type LogicEdge = { from: string; to: string; label?: string };

type View = "library" | "note" | "verify" | "atlas" | "think" | "extend";
type NoteReturnView = Exclude<View, "note" | "verify">;

type ChatMsg = { role: "user" | "assistant"; content: string };

type ThinkLineStatus = "idle" | "pending" | "active" | "rejected";

type ThinkWorkspaceData = {
  chat: ChatMsg[];
  thinkInput: string;
  nodes: LogicNode[];
  edges: LogicEdge[];
  citations: LibraryNote[];
  lineStatus: ThinkLineStatus;
  pending: {
    sessionId: string;
    pendingId: string | null;
    summary?: string;
  } | null;
  angleHint: string;
  diffHint: string;
  harnessHint?: string;
  harnessSteps?: Array<{ tool: string; summary: string; status: string }>;
  thinkSessionId?: string | null;
  webSearchOn?: boolean;
  lastUtterance?: string;
  rememberedAt?: string;
  lockedIds?: string[];
  intentHint?: "reline" | "lookup" | "decide" | null;
};

/** v2：强制丢弃早期空样例 localStorage（曾显示「0条消息」+ 空白画布） */
const THINK_MEMORY_LS = "mingxi-think-memory-v2";

type ThinkWorkspace = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  isSample?: boolean;
  data: ThinkWorkspaceData;
};

const SAMPLE_WS_ID = "ws-sample-agent-skill";

/** 梳逻辑线 · 多角度样例（左侧工作区预置） */
const THINK_SAMPLE_PRESETS: Array<{
  id: string;
  title: string;
  subtitle: string;
  intent: string;
  /** 走固定演示管线 */
  demo?: boolean;
}> = [
  {
    id: SAMPLE_WS_ID,
    title: "可执行落地",
    subtitle: "行动优先 · Agent 评测与 Skill",
    intent: DEMO_AGENT_INTENT,
    demo: true,
  },
  {
    id: "ws-sample-academic-write",
    title: "学术论文表述",
    subtitle: "模仿论文写法 · 论证与语法",
    intent:
      "我想模仿学术论文的写作技巧与语法表述方法：请把库里关于 Agent、RAG、Skill 的综述与论文型笔记，按问题驱动梳成一条「如何把工程经验写成可引用论述」的学习逻辑线——问题陈述 → 相关工作对照 → 方法表述句式 → 证据与局限 → 可复用措辞清单",
  },
  {
    id: "ws-sample-objection",
    title: "反例避坑优先",
    subtitle: "质疑与风险前置 · 提示词/评测",
    intent:
      "把库里关于提示词工程、Agent 评测的反例和避坑先排出来，反对意见与风险前置，再对照正例，梳一条可执行的避雷学习逻辑线",
  },
  {
    id: "ws-sample-contrast",
    title: "正反对标拆解",
    subtitle: "对比差异 · Skill / Prompt / Harness",
    intent:
      "对比 Agent Skill、提示词工程与 Agentic Harness 的差异与优劣，按对标拆解梳一条学习逻辑线：各自适用场景、边界与可借鉴点",
  },
  {
    id: "ws-sample-causal",
    title: "因果机制链",
    subtitle: "为什么有效 · RAG / 间隔重复",
    intent:
      "从因果机制角度梳理：为什么纯文本 RAG 与间隔重复能提升效果？原因 → 机制链条 → 落地约束，结合库里相关正例与避雷",
  },
  {
    id: "ws-sample-timeline",
    title: "时间线演进",
    subtitle: "按历程看 Agent Skills 生态",
    intent:
      "按时间线梳理从提示词工程到 Agent Skills 可安装能力包的演进历程，串起库里 Google skills、Skill 综述与情报简报，形成一条发展脉络逻辑线",
  },
  {
    id: "ws-sample-evidence",
    title: "证据强度排序",
    subtitle: "先硬证据 · RAG / 评测笔记",
    intent:
      "按证据强度排序梳逻辑线：库里关于 RAG、BM25、评测 dirty work 的笔记，先排有实验或数据支撑的，再排经验帖，标明可信度层次",
  },
];

function emptyThinkData(input = ""): ThinkWorkspaceData {
  return {
    chat: [],
    thinkInput: input,
    nodes: [],
    edges: [],
    citations: [],
    lineStatus: "idle",
    pending: null,
    angleHint: "",
    diffHint: "",
    harnessHint: "",
    harnessSteps: [],
    thinkSessionId: null,
    webSearchOn: false,
  };
}

function hasRememberedRun(d: ThinkWorkspaceData | undefined): boolean {
  if (!d) return false;
  if ((d.nodes?.length || 0) > 0 && (d.chat?.length || 0) > 0) return true;
  if (d.lineStatus === "active" || d.lineStatus === "pending") return true;
  return false;
}

function mergeWorkspaceLists(
  base: ThinkWorkspace[],
  remembered: ThinkWorkspace[],
): ThinkWorkspace[] {
  const byId = new Map(base.map((w) => [w.id, w]));
  for (const r of remembered) {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, r);
      continue;
    }
    // 有记忆结果则覆盖空样例
    if (hasRememberedRun(r.data)) {
      byId.set(r.id, {
        ...prev,
        ...r,
        isSample: prev.isSample ?? r.isSample,
        title: prev.isSample ? prev.title : r.title || prev.title,
        subtitle: r.subtitle || prev.subtitle,
        data: { ...emptyThinkData(), ...r.data },
      });
    }
  }
  // 保持样例顺序，其后跟用户工作区
  const sampleIds = THINK_SAMPLE_PRESETS.map((s) => s.id);
  const samples = sampleIds.map((id) => byId.get(id)).filter(Boolean) as ThinkWorkspace[];
  const others = Array.from(byId.values()).filter((w) => !sampleIds.includes(w.id));
  others.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return [...samples, ...others];
}

function initialWorkspaces(): ThinkWorkspace[] {
  const now = new Date().toISOString();
  const base: ThinkWorkspace[] = [
    ...THINK_SAMPLE_PRESETS.map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      updatedAt: now,
      isSample: true as const,
      data: emptyThinkData(s.intent),
    })),
    {
      id: "ws-blank-1",
      title: "新对话",
      subtitle: "空白工作区 · 对话与画布",
      updatedAt: now,
      data: emptyThinkData(""),
    },
  ];
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(THINK_MEMORY_LS);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as {
      workspaces?: ThinkWorkspace[];
      activeWsId?: string;
    };
    if (!parsed.workspaces?.length) return base;
    return mergeWorkspaceLists(base, parsed.workspaces);
  } catch {
    return base;
  }
}

const PURPOSE_FILTER_SEED = [
  "学习理论",
  "资料收藏",
  "反例避坑",
  "对标拆解",
  "素材金句",
  "待定",
] as const;

const PURPOSE_FILTER_LS = "mingxi-c2-filters-v1";
const PURPOSE_OVERRIDE_LS = "mingxi-purpose-overrides-v1";
const VERIFICATION_RECORDS_LS = "mingxi-verification-records-v1";

type PurposeOverride = { purposeLabel: string; updatedAt?: string };

function loadPurposeOverrides(): Record<string, PurposeOverride> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PURPOSE_OVERRIDE_LS) || "{}") as Record<
      string,
      PurposeOverride | string
    >;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([noteId, value]) => {
        const purposeLabel = typeof value === "string" ? value : value?.purposeLabel;
        return purposeLabel ? [[noteId, { purposeLabel, updatedAt: typeof value === "string" ? undefined : value.updatedAt }]] : [];
      }),
    );
  } catch {
    return {};
  }
}

function loadVerificationRecords(): Record<string, VerificationRecord> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VERIFICATION_RECORDS_LS) || "{}") as Record<
      string,
      VerificationRecord
    >;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveVerificationRecords(records: Record<string, VerificationRecord>) {
  try {
    window.localStorage.setItem(VERIFICATION_RECORDS_LS, JSON.stringify(records));
  } catch {
    /* 浏览器空间不足时仍保留当前会话状态 */
  }
}

function loadPurposeFilters(): string[] {
  if (typeof window === "undefined") return [...PURPOSE_FILTER_SEED];
  try {
    const raw = window.localStorage.getItem(PURPOSE_FILTER_LS);
    if (!raw) return [...PURPOSE_FILTER_SEED];
    const parsed = JSON.parse(raw) as { labels?: string[] };
    const labels = (parsed.labels || [])
      .map((x) => String(x || "").trim())
      .filter((x) => x && x !== "全部");
    return labels.length ? Array.from(new Set(labels)) : [...PURPOSE_FILTER_SEED];
  } catch {
    return [...PURPOSE_FILTER_SEED];
  }
}

function savePurposeFilters(labels: string[]) {
  try {
    window.localStorage.setItem(
      PURPOSE_FILTER_LS,
      JSON.stringify({ version: "v1", labels, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* quota */
  }
}

const POLARITY_LABEL: Record<string, string> = {
  positive_exemplar: "正向证据",
  negative_caution: "负向证据",
  mixed: "利弊并存",
  neutral_observe: "事实陈述",
  unknown: "",
};

const VERIFICATION_VERDICT_LABEL: Record<VerificationRecord["verdict"], string> = {
  supported: "基本成立",
  partly_supported: "部分成立",
  outdated: "已经过时",
  unsupported: "不被支持",
  insufficient: "证据不足",
};

const STANCE_LABEL: Record<string, string> = {
  imitate: "可直接借鉴",
  do_not_imitate_failure_path: "勿照搬失败路径",
  transform_ok: "可归纳改写",
  "勿模仿失败路径": "勿照搬失败路径",
  "可归纳改写": "可归纳改写",
  cite_only: "仅作引用",
};

const FUNCTIONAL_TYPE_LABEL: Record<string, string> = {
  experience: "经验叙述",
  procedure: "步骤清单",
  clip: "摘录片段",
  resource: "链接索引",
};

const MODALITY_LABEL: Record<string, string> = {
  text: "文本",
  image: "图片",
  audio: "音频",
  video: "视频",
  pdf: "PDF",
  web: "网页",
};

function formatTime(iso?: string) {
  if (!iso) return "—";
  // 只用日期段，避免 SSR/客户端时区差导致 hydration mismatch
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

type NoteTagGroup = {
  id: "purpose" | "function" | "verdict" | "guidance" | "domain" | "topic";
  label: string;
  hint: string;
  items: string[];
};

const TAG_MEANING_ALIAS: Record<string, string> = {
  待定: "purpose-pending",
  未定: "purpose-pending",
  待确认: "purpose-pending",
  资料收藏: "purpose-reference",
  暂存待用: "purpose-reference",
  park: "purpose-reference",
  学习理论: "purpose-learning",
  学习掌握: "purpose-learning",
  learn: "purpose-learning",
  反例避坑: "purpose-risk",
  避雷: "purpose-risk",
  负向证据: "purpose-risk",
  negative_caution: "purpose-risk",
  规避风险: "purpose-risk",
  avoid: "purpose-risk",
  素材金句: "purpose-quote",
  重点剪藏: "purpose-quote",
  clip: "purpose-quote",
};

function tagMeaningKey(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("zh-CN");
  return TAG_MEANING_ALIAS[normalized] || normalized;
}

function uniqueTagLabels(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const label = String(value || "").trim();
    if (!label) continue;
    const key = tagMeaningKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function noteTagGroups(note: LibraryNote): NoteTagGroup[] {
  const purposePending =
    !note.purposeLabel || note.purposeLabel === "待定" || note.purposeLabel === "未定";
  const purpose = uniqueTagLabels([
    purposePending ? "待确认" : note.purposeLabel,
  ]);
  const verdictLabel = POLARITY_LABEL[note.polarity];
  const verdict = uniqueTagLabels([
    verdictLabel === undefined ? note.polarity : verdictLabel,
  ]);
  const guidance = uniqueTagLabels([STANCE_LABEL[note.stance] || note.stance]);
  const functional = uniqueTagLabels(
    (note.functionalTypes || []).map((item) => FUNCTIONAL_TYPE_LABEL[item] || item),
  );
  const domain = uniqueTagLabels(note.domainPath?.length ? note.domainPath : ["未分类"]);
  const rawGroups: NoteTagGroup[] = [
    {
      id: "purpose",
      label: purposePending ? "用途状态" : "主要用途",
      hint: purposePending ? "为什么留下，尚未决定" : "为什么留下",
      items: purpose,
    },
    { id: "function", label: "内容结构", hint: "内容以什么形式组织", items: functional },
    { id: "verdict", label: "内容结论", hint: "证据整体指向什么", items: verdict },
    { id: "guidance", label: "使用建议", hint: "实际使用时怎么处理", items: guidance },
    { id: "domain", label: "知识领域", hint: "内容在讲什么", items: domain },
  ];

  // 按产品优先级做跨分组语义去重：同一个意思只在最先出现的维度展示一次。
  const seenMeanings = new Set<string>();
  const structuredGroups = rawGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const key = tagMeaningKey(item);
        if (seenMeanings.has(key)) return false;
        seenMeanings.add(key);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const assigned = new Set(
    [
      note.purposeLabel,
      note.polarity,
      note.stance,
      ...(note.userGoals || []),
      ...(note.functionalTypes || []),
      ...(note.domainPath || []),
      ...PURPOSE_FILTER_SEED,
      ...structuredGroups.flatMap((group) => group.items),
    ]
      .filter(Boolean)
      .map((item) => tagMeaningKey(String(item))),
  );
  const topic = uniqueTagLabels(note.tags || []).filter((item) => {
    const key = tagMeaningKey(item);
    if (assigned.has(key)) return false;
    return !/^(source:|live-capture$|real-corpus$|web-(search|read|hit)$)/i.test(key);
  });

  return [
    ...structuredGroups,
    ...(topic.length
      ? [{ id: "topic" as const, label: "主题关键词", hint: "补充检索词", items: topic }]
      : []),
  ];
}

function NoteTagGroups({ note }: { note: LibraryNote }) {
  const groups = noteTagGroups(note);
  return (
    <section className="mwb-tag-taxonomy" aria-labelledby={`note-tags-${note.id}`}>
      <div className="mwb-tag-taxonomy-head">
        <div>
          <span>标签结构</span>
          <strong id={`note-tags-${note.id}`}>每个标签，只回答一个问题</strong>
        </div>
        <em>{groups.reduce((total, group) => total + group.items.length, 0)} 个标签</em>
      </div>
      <div className="mwb-tag-groups">
        {groups.map((group) => (
          <div key={group.id} className={`mwb-tag-group tone-${group.id}`}>
            <div className="mwb-tag-group-label">
              <strong>{group.label}</strong>
              <span>{group.hint}</span>
            </div>
            <div className="mwb-tag-group-items">
              {group.items.map((item) => (
                <em key={item}>{item}</em>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NoteCard({
  note,
  onOpen,
}: {
  note: LibraryNote;
  onOpen: (n: LibraryNote) => void;
}) {
  return (
    <button type="button" className="mwb-card" onClick={() => onOpen(note)}>
      <div className={`mwb-card-media modality-${note.modality}`}>
        {note.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={note.imageUrl} alt="" />
        ) : (
          <div className="mwb-card-media-fallback">
            <span>{note.modality}</span>
            <strong>{note.domainPath[0] || "笔记"}</strong>
          </div>
        )}
        <span className="mwb-card-cat">{note.purposeLabel}</span>
      </div>
      <div className="mwb-card-body">
        <div className="mwb-card-meta">
          <span>{formatTime(note.capturedAt)}</span>
          <span>{POLARITY_LABEL[note.polarity] || note.polarity}</span>
        </div>
        <h3 className="mwb-card-title">{note.title}</h3>
        {note.summary &&
        note.summary !== note.title &&
        !note.summary.startsWith(note.title.replace(/…$/, "")) ? (
          <p className="mwb-card-sum">{note.summary}</p>
        ) : null}
        <div className="mwb-card-tags">
          {note.domainPath.slice(0, 3).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

export function WebWorkbench() {
  const [view, setView] = useState<View>("library");
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [purpose, setPurpose] = useState<string>("全部");
  const [purposeFilters, setPurposeFilters] = useState<string[]>([...PURPOSE_FILTER_SEED]);
  const [domainFilter, setDomainFilter] = useState<string[] | null>(null);
  const [addingPurpose, setAddingPurpose] = useState(false);
  const [newPurpose, setNewPurpose] = useState("");
  const [dragPurpose, setDragPurpose] = useState<string | null>(null);
  const [trashHot, setTrashHot] = useState(false);
  const longPressRef = useRef<{ id: string; timer: number | null }>({ id: "", timer: null });
  const dragPurposeRef = useRef<string | null>(null);
  const trashHotRef = useRef(false);
  const suppressChipClickRef = useRef(false);
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState(DEMO_AGENT_INTENT);
  const [selected, setSelected] = useState<LibraryNote | null>(null);
  const [noteReturnView, setNoteReturnView] = useState<NoteReturnView>("library");
  const noteReturnViewRef = useRef<NoteReturnView>("library");
  const noteReturnScrollRef = useRef(0);
  const [verificationOrigin, setVerificationOrigin] = useState<VerificationOrigin | null>(null);
  const [verificationReturnView, setVerificationReturnView] = useState<"note" | "atlas">("note");
  const [verificationRecords, setVerificationRecords] = useState<Record<string, VerificationRecord>>(
    loadVerificationRecords,
  );
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [thinkInput, setThinkInput] = useState(DEMO_AGENT_INTENT);
  const [thinking, setThinking] = useState(false);
  const [nodes, setNodes] = useState<LogicNode[]>([]);
  const [edges, setEdges] = useState<LogicEdge[]>([]);
  const [citations, setCitations] = useState<LibraryNote[]>([]);
  const [agentMode, setAgentMode] = useState<AgentModeId>("agent");
  const [thinkLevel, setThinkLevel] = useState<ThinkLevelId>("high-fast");
  /** 默认高保真回忆 Demo；可切回实机 Agent 管线 */
  const [thinkSurface, setThinkSurface] = useState<"replay" | "live">("replay");
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [composerMenu, setComposerMenu] = useState<"agent" | "level" | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const thinkAbortRef = useRef<AbortController | null>(null);
  const [domainFocus, setDomainFocus] = useState<{ path: string[]; notes: LibraryNote[] } | null>(null);
  const [pending, setPending] = useState<{
    sessionId: string;
    pendingId: string | null;
    summary?: string;
  } | null>(null);
  const [lineStatus, setLineStatus] = useState<ThinkLineStatus>("idle");
  const [angleHint, setAngleHint] = useState("");
  const [diffHint, setDiffHint] = useState("");
  const [harnessHint, setHarnessHint] = useState("");
  const [harnessSteps, setHarnessSteps] = useState<
    Array<{ tool: string; summary: string; status: string }>
  >([]);
  const [thinkSessionId, setThinkSessionId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [profileInfo, setProfileInfo] = useState<{
    autoLearnedWeek: number;
    active: Array<{ id: string; statement: string }>;
  } | null>(null);
  const [workspaces, setWorkspaces] = useState<ThinkWorkspace[]>(initialWorkspaces);
  const [activeWsId, setActiveWsId] = useState(() => {
    if (typeof window === "undefined") return SAMPLE_WS_ID;
    try {
      const raw = window.localStorage.getItem(THINK_MEMORY_LS);
      if (!raw) return SAMPLE_WS_ID;
      const parsed = JSON.parse(raw) as { activeWsId?: string };
      return parsed.activeWsId || SAMPLE_WS_ID;
    } catch {
      return SAMPLE_WS_ID;
    }
  });
  const [memoryReady, setMemoryReady] = useState(false);
  const sampleBootedRef = useRef<Set<string>>(new Set());
  const memoryHydratedRef = useRef(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [scopeNodeId, setScopeNodeId] = useState<string | null>(null);
  const [lookupCard, setLookupCard] = useState<LookupCardView | null>(null);
  const [decisionCard, setDecisionCard] = useState<DecisionCardView | null>(null);
  const [evalReport, setEvalReport] = useState<EvalReportView | null>(null);
  const [evalBusy, setEvalBusy] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [intentHint, setIntentHint] = useState<"reline" | "lookup" | "decide" | null>(null);

  const loadLibrary = useCallback(async (p = purpose, query = q) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/mingxi/library?${params}`);
      const data = await res.json();
      const overrides = loadPurposeOverrides();
      const merged = ((data.notes || []) as LibraryNote[]).map((note) => {
        const override = overrides[note.id];
        return override ? { ...note, purposeLabel: override.purposeLabel } : note;
      });
      setNotes(p && p !== "全部" ? merged.filter((note) => note.purposeLabel === p) : merged);
      setDomainFilter(null);
    } finally {
      setLoading(false);
    }
  }, [purpose, q]);

  const visibleNotes = useMemo(
    () => notes.filter((n) => noteMatchesDomainPrefix(n, domainFilter)),
    [notes, domainFilter],
  );

  const notesRef = useRef(notes);
  const visibleRef = useRef(visibleNotes);
  const viewRef = useRef(view);
  notesRef.current = notes;
  visibleRef.current = visibleNotes;
  viewRef.current = view;

  const closeStandaloneNote = useCallback(() => {
    const target = noteReturnViewRef.current;
    const top = target === "library" ? noteReturnScrollRef.current : 0;
    setSelected(null);
    setView(target);
    window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: "auto" }));
  }, []);

  useEffect(() => {
    return onTourCmd((cmd) => {
      if (cmd.type === "web.setView") {
        setView(cmd.view);
        return;
      }
      if (cmd.type === "web.setPurpose") {
        setPurpose(cmd.purpose);
        return;
      }
      if (cmd.type === "web.setDomainFilter") {
        setDomainFilter(cmd.path);
        return;
      }
      if (cmd.type === "web.openNote") {
        const list = cmd.purpose
          ? notesRef.current.filter((note) => note.purposeLabel === cmd.purpose)
          : visibleRef.current.length
            ? visibleRef.current
            : notesRef.current;
        const n = list[cmd.index ?? 0];
        if (n) {
          noteReturnViewRef.current = "library";
          noteReturnScrollRef.current = window.scrollY;
          setNoteReturnView("library");
          setSelected(n);
          setDomainFocus(null);
          setView("note");
          window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
        }
        return;
      }
      if (cmd.type === "web.closeNote") {
        if (viewRef.current === "note") closeStandaloneNote();
        else setSelected(null);
        return;
      }
      if (cmd.type === "web.setCapture") {
        setShowCapture(cmd.on);
        if (cmd.on) setShowEval(false);
        return;
      }
      if (cmd.type === "web.setEval") {
        setShowEval(cmd.on);
        if (cmd.on) setShowCapture(false);
        return;
      }
      if (cmd.type === "web.setThinkSurface") {
        setThinkSurface(cmd.surface);
        setView("think");
        return;
      }
      if (cmd.type === "web.clickTourTarget") {
        window.setTimeout(() => {
          const el = document.querySelector(`[data-tour="${cmd.target}"]`) as HTMLElement | null;
          el?.click();
        }, 80);
        return;
      }
      if (cmd.type === "web.focusAsk") {
        setView("library");
        const el = document.querySelector("[data-tour=web-ask] input, [data-tour=web-ask] textarea") as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        el?.focus();
      }
    });
  }, [closeStandaloneNote]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/mingxi/profile");
      const data = await res.json();
      if (res.ok) {
        setProfileInfo({
          autoLearnedWeek: data.autoLearnedWeek || 0,
          active: (data.active || []).map((e: { id: string; statement: string }) => ({
            id: e.id,
            statement: e.statement,
          })),
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setPurposeFilters(loadPurposeFilters());
  }, []);

  useEffect(() => {
    dragPurposeRef.current = dragPurpose;
  }, [dragPurpose]);

  useEffect(() => {
    trashHotRef.current = trashHot;
  }, [trashHot]);

  useEffect(() => {
    if (!dragPurpose) return;
    const endDrag = () => {
      const label = dragPurposeRef.current;
      const hot = trashHotRef.current;
      if (label && hot) {
        setPurposeFilters((prev) => {
          const next = prev.filter((x) => x !== label);
          savePurposeFilters(next);
          return next;
        });
        setPurpose((cur) => {
          if (cur === label) {
            void loadLibrary("全部", q);
            return "全部";
          }
          return cur;
        });
      }
      if (longPressRef.current.timer) {
        window.clearTimeout(longPressRef.current.timer);
        longPressRef.current.timer = null;
      }
      setDragPurpose(null);
      setTrashHot(false);
    };
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setTrashHot(Boolean(el?.closest?.("[data-purpose-trash]")));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [dragPurpose, loadLibrary, q]);

  useEffect(() => {
    if (!composerMenu) return;
    const onPointer = (e: MouseEvent) => {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
        setComposerMenu(null);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [composerMenu]);

  useEffect(() => {
    if (view !== "atlas" && view !== "note" && view !== "verify") return;
    if (view !== "verify" && !selected) return;
    const closeSelectedNote = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (view === "note") closeStandaloneNote();
      else if (view === "verify") setView(verificationReturnView);
      else setSelected(null);
    };
    window.addEventListener("keydown", closeSelectedNote);
    return () => window.removeEventListener("keydown", closeSelectedNote);
  }, [closeStandaloneNote, selected, verificationReturnView, view]);

  async function serializeAttachments(files: File[]) {
    const out: Array<{ name: string; size: number; type: string; text?: string; dataUrl?: string }> =
      [];
    for (const f of files.slice(0, 4)) {
      if (f.type.startsWith("image/")) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ""));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        });
        out.push({ name: f.name, size: f.size, type: f.type, dataUrl });
      } else {
        const text = await f.text().catch(() => "");
        out.push({ name: f.name, size: f.size, type: f.type, text: text.slice(0, 80_000) });
      }
    }
    return out;
  }

  async function runThink(
    message: string,
    opt?: { demo?: boolean; intentHint?: "reline" | "lookup" | "decide"; scopeNodeId?: string },
  ) {
    const text = message.trim();
    if (!text || thinking) return;
    const runWsId = activeWsId;
    const runWs = workspaces.find((w) => w.id === runWsId);
    setView("think");
    setThinkSurface("live");
    setChat((prev) => [...prev, { role: "user", content: text }]);
    setThinkInput("");
    setAsk(text);
    setThinking(true);
    setPending(null);
    setLineStatus("idle");
    setComposerMenu(null);
    setLookupCard(null);
    setDecisionCard(null);
    thinkAbortRef.current?.abort();
    const ac = new AbortController();
    thinkAbortRef.current = ac;
    const useDemo = Boolean(opt?.demo || thinkLevel === "demo" || text === DEMO_AGENT_INTENT);
    const scope = opt?.scopeNodeId || scopeNodeId || undefined;
    try {
      const packed = await serializeAttachments(attachments);
      const res = await fetch("/api/mingxi/think", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          message: text,
          demo: useDemo,
          mode: agentMode === "ask" ? "llm_graph" : "agent",
          agentMode,
          thinkLevel,
          webSearch: webSearchOn || opt?.intentHint === "lookup",
          sessionId: thinkSessionId,
          workspaceId: runWsId,
          workspaceTitle: runWs?.title,
          workspaceSubtitle: runWs?.subtitle,
          attachments: packed,
          lockedNodeIds: lockedIds,
          scopeNodeId: scope,
          intentHint: opt?.intentHint || intentHint || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.clarifyingQuestion || "请求失败");
      setScopeNodeId(null);
      if (data.lookupCard) setLookupCard(data.lookupCard);
      if (data.decisionCard) setDecisionCard(data.decisionCard);
      if (Array.isArray(data.ingest?.warnings) && data.ingest.warnings.length) {
        /* shown via harness steps */
      }
      if (data.ingest?.noteIds?.length) void loadLibrary();
      let snapChat: ChatMsg[] = [];
      setChat((prev) => {
        const base =
          prev[prev.length - 1]?.role === "user" && prev[prev.length - 1]?.content === text
            ? prev
            : [...prev, { role: "user" as const, content: text }];
        snapChat = [...base, { role: "assistant", content: data.answer || "" }];
        return snapChat;
      });
      const nextNodes = data.logicLine?.nodes || [];
      const nextEdges = data.logicLine?.edges || [];
      const nextCitations = (data.citations || []) as LibraryNote[];
      setNodes(nextNodes);
      setEdges(nextEdges);
      setCitations(nextCitations);
      if (data.sessionId) setThinkSessionId(data.sessionId);
      const steps = Array.isArray(data.harness?.steps) ? data.harness.steps : [];
      setHarnessSteps(steps);
      let nextHarnessHint = "";
      if (data.harness) {
        const webMark =
          data.webSearchUsed || data.harness.webSearchUsed || webSearchOn ? " · 联网开" : "";
        nextHarnessHint = `${data.harness.planner || "harness"} · ${data.harness.intent || "?"}${webMark} · ${(data.harness.tools || steps.map((s: { tool: string }) => s.tool)).join(" → ")}`;
        setHarnessHint(nextHarnessHint);
      } else {
        setHarnessHint("");
      }
      let nextAngle = "";
      if (data.angle) {
        nextAngle = `${data.angle.order} · ${data.angle.groupBy} · 置信 ${Number(data.angle.confidence || 0).toFixed(2)}`;
        setAngleHint(nextAngle);
      }
      let nextDiff = "";
      if (data.diff) {
        nextDiff = `新增 ${data.diff.added?.length ?? 0} · 移动 ${data.diff.moved?.length ?? 0} · 锁定保持 ${data.diff.lockedKept?.length ?? 0}`;
        setDiffHint(nextDiff);
      } else {
        setDiffHint("");
      }
      let nextPending: ThinkWorkspaceData["pending"] = null;
      let nextStatus: ThinkLineStatus = "idle";
      if (data.pending?.sessionId) {
        nextPending = {
          sessionId: data.pending.sessionId,
          pendingId: data.pending.pendingId,
          summary: data.pending.summary,
        };
        nextStatus = "pending";
        setPending(nextPending);
        setLineStatus("pending");
      } else if (data.sessionId && nextNodes.length > 0) {
        nextPending = { sessionId: data.sessionId, pendingId: null };
        nextStatus = "active";
        setPending(nextPending);
        setLineStatus("active");
      } else {
        setPending(null);
        setLineStatus("idle");
      }
      sampleBootedRef.current.add(runWsId);
      const snapData: ThinkWorkspaceData = {
        chat: snapChat.length
          ? snapChat
          : [
              { role: "user", content: text },
              { role: "assistant", content: data.answer || "" },
            ],
        thinkInput: "",
        nodes: nextNodes,
        edges: nextEdges,
        citations: nextCitations,
        lineStatus: nextStatus,
        pending: nextPending,
        angleHint: nextAngle,
        diffHint: nextDiff,
        harnessHint: nextHarnessHint,
        harnessSteps: steps,
        thinkSessionId: data.sessionId || null,
        webSearchOn,
        lastUtterance: text,
        rememberedAt: new Date().toISOString(),
        lockedIds,
        intentHint: opt?.intentHint || intentHint,
      };
      // 若用户已切走工作区，只写记忆、不覆盖当前 UI
      const stillOnRunWs = activeWsId === runWsId;
      setWorkspaces((prev) => {
        const next = prev.map((w) =>
          w.id === runWsId
            ? {
                ...w,
                updatedAt: new Date().toISOString(),
                subtitle: `${nextNodes.length} 节点 · ${
                  nextStatus === "pending" ? "待确认" : "已记忆"
                }`,
                data: snapData,
              }
            : w,
        );
        void persistThinkMemory(next, runWsId, {
          kind: webSearchOn ? "web_search" : "think_run",
          utterance: text,
          detail: `梳链完成并记忆：${nextNodes.length} 节点`,
        });
        return next;
      });
      if (stillOnRunWs) setAttachments([]);
      else {
        // 结果属于旧工作区：撤销当前聊天里误加的 loading 态由 finally 收尾
        setAttachments([]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // 切换工作区主动中止：不往当前聊天塞「已停止」
        if (activeWsId === runWsId) {
          setChat((prev) => [...prev, { role: "assistant", content: "已停止生成。" }]);
        }
      } else if (activeWsId === runWsId) {
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `调用失败：${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      }
    } finally {
      setThinking(false);
      thinkAbortRef.current = null;
    }
  }

  function stopThink() {
    thinkAbortRef.current?.abort();
  }

  function refreshComposer() {
    if (thinking) {
      stopThink();
      return;
    }
    const lastUser = [...chat].reverse().find((m) => m.role === "user");
    if (lastUser) {
      void runThink(lastUser.content, { demo: lastUser.content === DEMO_AGENT_INTENT });
    } else {
      setThinkInput(DEMO_AGENT_INTENT);
    }
  }

  function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setAttachments((prev) => [...prev, ...Array.from(files)].slice(0, 6));
  }

  function toggleMic() {
    type RecResult = { results: ArrayLike<{ 0?: { transcript?: string } }> };
    type Rec = {
      lang: string;
      interimResults: boolean;
      onresult: ((ev: RecResult) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Rec;
      webkitSpeechRecognition?: new () => Rec;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setThinkInput((v) => (v ? v : "（当前浏览器不支持语音输入，请直接打字）"));
      return;
    }
    if (listening) {
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const said = Array.from(ev.results)
        .map((r) => r[0]?.transcript || "")
        .join("");
      if (said) setThinkInput((prev) => (prev ? `${prev.trim()} ${said}` : said));
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  async function approveLine() {
    if (!pending?.sessionId || confirming) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/mingxi/think/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: pending.sessionId,
          pendingId: pending.pendingId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "确认失败");
      setNodes(data.logicLine?.nodes || nodes);
      setEdges(data.logicLine?.edges || edges);
      setPending(null);
      setLineStatus("active");
      setChat((prev) => {
        const nextChat = [
          ...prev,
          { role: "assistant" as const, content: "已确认生效：逻辑链写入会话记忆。刷新后将直接回放，不重复推理。" },
        ];
        setWorkspaces((wsPrev) => {
          const next = wsPrev.map((w) =>
            w.id === activeWsId
              ? {
                  ...w,
                  updatedAt: new Date().toISOString(),
                  subtitle: `${(data.logicLine?.nodes || nodes).length} 节点 · 已生效`,
                  data: {
                    ...captureThinkData(),
                    chat: nextChat,
                    nodes: data.logicLine?.nodes || nodes,
                    edges: data.logicLine?.edges || edges,
                    lineStatus: "active" as const,
                    pending: null,
                    rememberedAt: new Date().toISOString(),
                  },
                }
              : w,
          );
          void persistThinkMemory(next, activeWsId, {
            kind: "approve",
            detail: "用户确认逻辑链生效并写入记忆",
            utterance: ask,
          });
          return next;
        });
        return nextChat;
      });
      void loadProfile();
    } catch (err) {
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `确认失败：${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setConfirming(false);
    }
  }

  async function rejectLine() {
    if (!pending?.sessionId || confirming) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/mingxi/think/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: pending.sessionId,
          pendingId: pending.pendingId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "放弃失败");
      setPending(null);
      setLineStatus("rejected");
      setChat((prev) => {
        const nextChat = [
          ...prev,
          { role: "assistant" as const, content: "已放弃本次重排。预览仍保留在记忆中，刷新不会重跑。" },
        ];
        setWorkspaces((wsPrev) => {
          const next = wsPrev.map((w) =>
            w.id === activeWsId
              ? {
                  ...w,
                  updatedAt: new Date().toISOString(),
                  subtitle: `${nodes.length} 节点 · 已放弃`,
                  data: {
                    ...captureThinkData(),
                    chat: nextChat,
                    lineStatus: "rejected" as const,
                    pending: null,
                    rememberedAt: new Date().toISOString(),
                  },
                }
              : w,
          );
          void persistThinkMemory(next, activeWsId, {
            kind: "reject",
            detail: "用户放弃重排，保留预览记忆",
            utterance: ask,
          });
          return next;
        });
        return nextChat;
      });
      void loadProfile();
    } catch (err) {
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `放弃失败：${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setConfirming(false);
    }
  }

  async function rollbackProfile(entryId: string) {
    await fetch("/api/mingxi/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rollback", entryId }),
    });
    void loadProfile();
  }

  function openNote(n: LibraryNote) {
    // 笔记库卡片进入独立阅读页；旭日分屏只由旭日中的明确笔记叶触发。
    const origin =
      viewRef.current === "note" || viewRef.current === "verify"
        ? noteReturnViewRef.current
        : viewRef.current;
    noteReturnViewRef.current = origin;
    noteReturnScrollRef.current = origin === "library" ? window.scrollY : 0;
    setNoteReturnView(origin);
    setSelected(n);
    setDomainFocus(null);
    setView("note");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  /** 旭日图内选笔记：只更新右侧栏，不跳页 */
  function openNoteFromAtlas(n: { id: string }) {
    const full = notes.find((x) => x.id === n.id) || (n as LibraryNote);
    setSelected(full);
    setDomainFocus(null);
  }

  function startVerification(note: LibraryNote) {
    setSelected(note);
    setVerificationReturnView(viewRef.current === "atlas" ? "atlas" : "note");
    setVerificationOrigin({
      noteId: note.id,
      title: note.title,
      summary: note.summary || note.preview || note.title,
      domainPath: note.domainPath || [],
      sourceUri: note.sourceUri,
    });
    setView("verify");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function saveVerificationRecord(record: VerificationRecord) {
    setVerificationRecords((prev) => {
      const next = { ...prev, [record.noteId]: record };
      saveVerificationRecords(next);
      return next;
    });
  }

  function openVerificationLogic(record: VerificationRecord) {
    const originNote = notes.find((note) => note.id === record.noteId) ||
      (selected?.id === record.noteId ? selected : null);
    const stamp = record.verifiedAt.replace(/[^0-9]/g, "").slice(0, 14);
    const stem = `verify-${record.noteId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${stamp}`;
    const accepted = record.acceptedEvidenceIds.length;
    const cautious = record.cautiousEvidenceIds.length;
    const reviewedEvidence = record.reviewedEvidence || [];
    const evidenceNotes: LibraryNote[] = reviewedEvidence.map((item) => ({
      id: item.id,
      corpusId: "external-verification",
      title: item.title,
      summary: item.snippet,
      preview: item.content.join("\n\n"),
      modality: "web",
      capturedAt: record.verifiedAt,
      purposeLabel:
        item.verdict === "accepted" ? "核实采纳" : item.verdict === "cautious" ? "核实保留" : "核实排除",
      polarity: item.verdict === "excluded" ? "negative_caution" : "neutral_observe",
      stance: item.verdict === "accepted" ? "cite_only" : "transform_ok",
      domainPath: originNote?.domainPath || [],
      functionalTypes: ["resource"],
      userGoals: ["learn"],
      sourceUri: item.sourceUrl,
      tags: ["web-search", item.sourceName, item.reliability],
      sourceKind: "web",
    }));
    const nextNodes: LogicNode[] = [
      { id: `${stem}-intent`, label: `核实：${originNote?.title || "当前笔记"}`, kind: "intent" },
      {
        id: `${stem}-origin`,
        label: "原笔记主张",
        kind: "note",
        noteId: record.noteId,
        purposeLabel: originNote?.purposeLabel,
        sourceKind: "library",
      },
      ...reviewedEvidence.map((item, index) => ({
        id: `${stem}-evidence-${index + 1}`,
        label: `${item.verdict === "accepted" ? "采纳" : item.verdict === "cautious" ? "保留" : "排除"}：${item.title}`,
        kind: "note" as const,
        noteId: item.id,
        purposeLabel: item.sourceName,
        sourceKind: "web" as const,
      })),
      {
        id: `${stem}-conclusion`,
        label: `${VERIFICATION_VERDICT_LABEL[record.verdict]}：${record.conclusion}`,
        kind: "action",
        done: true,
      },
    ];
    const nextChat: ChatMsg[] = [
      { role: "user", content: record.question },
      {
        role: "assistant",
        content: `已把人工核实记录整理成逻辑分支：采纳 ${accepted} 条、保留 ${cautious} 条、排除 ${record.excludedEvidenceIds.length} 条。结论为「${VERIFICATION_VERDICT_LABEL[record.verdict]}」。`,
      },
    ];
    const nextEdges: LogicEdge[] = [
      { from: `${stem}-intent`, to: `${stem}-origin`, label: "锁定原主张" },
      ...reviewedEvidence.flatMap((item, index) => [
        { from: `${stem}-origin`, to: `${stem}-evidence-${index + 1}`, label: "外部核对" },
        { from: `${stem}-evidence-${index + 1}`, to: `${stem}-conclusion`, label: "人工判断" },
      ]),
      ...(reviewedEvidence.length
        ? []
        : [{ from: `${stem}-origin`, to: `${stem}-conclusion`, label: "核实结论" }]),
    ];
    const nextData: ThinkWorkspaceData = {
      chat: nextChat,
      thinkInput: record.question,
      nodes: nextNodes,
      edges: nextEdges,
      citations: [...(originNote ? [originNote] : []), ...evidenceNotes],
      lineStatus: "active",
      pending: null,
      angleHint: "原笔记主张 → 外部证据 → 人工结论",
      diffHint: "独立核实工作区 · 不覆盖原笔记正文或既有逻辑线",
      harnessHint: "前端演示记录已转换为可编辑逻辑线",
      harnessSteps: [
        { tool: "origin_note", summary: "锁定原笔记与核实问题", status: "done" },
        { tool: "evidence_review", summary: `人工审阅 ${reviewedEvidence.length} 条资料`, status: "done" },
        { tool: "writeback", summary: "生成核实结论分支", status: "done" },
      ],
      thinkSessionId: null,
      webSearchOn: true,
      lastUtterance: record.question,
      rememberedAt: record.verifiedAt,
      lockedIds: [`${stem}-origin`],
      intentHint: "lookup",
    };
    const nextWorkspace: ThinkWorkspace = {
      id: stem,
      title: `核实 · ${originNote?.title?.slice(0, 16) || "当前笔记"}`,
      subtitle: `${VERIFICATION_VERDICT_LABEL[record.verdict]} · ${reviewedEvidence.length} 条已审资料`,
      updatedAt: record.verifiedAt,
      data: nextData,
    };
    setWorkspaces((prev) => [nextWorkspace, ...prev.filter((workspace) => workspace.id !== stem)]);
    setActiveWsId(stem);
    applyThinkData(nextData);
    setAsk(record.question);
    setLookupCard(null);
    setDecisionCard(null);
    setThinkSurface("live");
    setView("think");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function captureThinkData(): ThinkWorkspaceData {
    return {
      chat,
      thinkInput,
      nodes,
      edges,
      citations,
      lineStatus,
      pending,
      angleHint,
      diffHint,
      harnessHint,
      harnessSteps,
      thinkSessionId,
      webSearchOn,
      lastUtterance: chat.find((m) => m.role === "user")?.content,
      rememberedAt: new Date().toISOString(),
      lockedIds,
      intentHint,
    };
  }

  function applyThinkData(d: ThinkWorkspaceData) {
    setChat(d.chat || []);
    setThinkInput(d.thinkInput || "");
    setNodes(d.nodes || []);
    setEdges(d.edges || []);
    setCitations((d.citations || []) as LibraryNote[]);
    setLineStatus(d.lineStatus || "idle");
    setPending(d.pending || null);
    setAngleHint(d.angleHint || "");
    setDiffHint(d.diffHint || "");
    setHarnessHint(d.harnessHint || "");
    setHarnessSteps(d.harnessSteps || []);
    setThinkSessionId(d.thinkSessionId ?? null);
    if (typeof d.webSearchOn === "boolean") setWebSearchOn(d.webSearchOn);
    setLockedIds(Array.isArray(d.lockedIds) ? d.lockedIds : []);
    setIntentHint(d.intentHint ?? null);
  }

  function writeLocalMemory(list: ThinkWorkspace[], activeId = activeWsId) {
    try {
      window.localStorage.setItem(
        THINK_MEMORY_LS,
        JSON.stringify({
          version: "v1",
          updatedAt: new Date().toISOString(),
          activeWsId: activeId,
          workspaces: list,
        }),
      );
    } catch {
      /* quota */
    }
  }

  async function persistThinkMemory(
    list: ThinkWorkspace[],
    activeId = activeWsId,
    interaction?: {
      kind: "think_run" | "approve" | "reject" | "switch_ws" | "web_search";
      detail: string;
      utterance?: string;
    },
  ) {
    writeLocalMemory(list, activeId);
    const current = list.find((w) => w.id === activeId);
    if (!current) return;
    try {
      await fetch("/api/mingxi/think/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: current,
          activeWsId: activeId,
          interaction: interaction
            ? {
                kind: interaction.kind,
                workspaceId: activeId,
                utterance: interaction.utterance,
                detail: interaction.detail,
              }
            : undefined,
        }),
      });
    } catch {
      /* 离线仍保留 localStorage */
    }
  }

  function persistActiveWorkspace(list: ThinkWorkspace[]): ThinkWorkspace[] {
    const data = captureThinkData();
    const firstUser = data.chat.find((m) => m.role === "user")?.content?.trim();
    return list.map((w) => {
      if (w.id !== activeWsId) return w;
      return {
        ...w,
        updatedAt: new Date().toISOString(),
        title: w.isSample
          ? w.title
          : firstUser
            ? firstUser.slice(0, 22) + (firstUser.length > 22 ? "…" : "")
            : w.title,
        subtitle: data.nodes.length
          ? `${data.nodes.length} 节点 · ${
              data.lineStatus === "pending"
                ? "待确认"
                : data.lineStatus === "active"
                  ? "已生效"
                  : "画布中"
            }`
          : data.chat.length
            ? `${data.chat.length} 条消息`
            : w.subtitle,
        data,
      };
    });
  }

  function switchWorkspace(id: string) {
    if (id === activeWsId) return;
    // 切换时打断进行中的请求，避免结果写进新工作区或继续转圈
    if (thinking) {
      thinkAbortRef.current?.abort();
      setThinking(false);
    }
    const nextList = persistActiveWorkspace(workspaces);
    const target = nextList.find((w) => w.id === id);
    if (!target) return;
    setWorkspaces(nextList);
    setActiveWsId(id);
    applyThinkData(target.data);
    // 有记忆则标记已启动，禁止自动重跑
    if (hasRememberedRun(target.data)) {
      sampleBootedRef.current.add(id);
    } else {
      const preset = THINK_SAMPLE_PRESETS.find((s) => s.id === id);
      if (preset && !(target.data.thinkInput || "").trim()) {
        setThinkInput(preset.intent);
        setAsk(preset.intent);
      }
    }
    void persistThinkMemory(nextList, id, {
      kind: "switch_ws",
      detail: `切换到工作区 ${target.title}`,
    });
  }

  function createWorkspace() {
    const id = `ws-${Date.now()}`;
    const nextList = persistActiveWorkspace(workspaces);
    const blank: ThinkWorkspace = {
      id,
      title: `对话 ${nextList.length}`,
      subtitle: "新工作区 · 对话与画布",
      updatedAt: new Date().toISOString(),
      data: emptyThinkData(""),
    };
    setWorkspaces([...nextList, blank]);
    setActiveWsId(id);
    applyThinkData(blank.data);
  }

  // 启动：静态样例夹具 + 服务端记忆 + localStorage 合并（vinext 常写不了盘，样例靠静态 JSON）
  useEffect(() => {
    if (memoryHydratedRef.current) return;
    memoryHydratedRef.current = true;
    let cancelled = false;
    (async () => {
      // 先回放 localStorage 当前区，避免闪空白
      let localList = workspaces;
      const localCur = localList.find((w) => w.id === activeWsId);
      if (localCur) {
        applyThinkData(localCur.data);
        if (hasRememberedRun(localCur.data)) sampleBootedRef.current.add(localCur.id);
      }
      for (const w of localList) {
        if (hasRememberedRun(w.data)) sampleBootedRef.current.add(w.id);
      }

      // 1) 打包进 public 的预置样例（保证左侧不是「0条消息」、画布可回放）
      try {
        const fxRes = await fetch("/data/mingxi-think-samples.json", { cache: "no-store" });
        if (fxRes.ok) {
          const fx = await fxRes.json();
          const fixtures = (fx.workspaces || []) as ThinkWorkspace[];
          if (fixtures.length) {
            localList = mergeWorkspaceLists(localList, fixtures);
            if (!cancelled) {
              setWorkspaces(localList);
              writeLocalMemory(localList, activeWsId);
              const cur = localList.find((w) => w.id === activeWsId);
              if (cur && hasRememberedRun(cur.data)) {
                applyThinkData(cur.data);
                sampleBootedRef.current.add(cur.id);
              }
              for (const w of localList) {
                if (hasRememberedRun(w.data)) sampleBootedRef.current.add(w.id);
              }
            }
          }
        }
      } catch {
        /* 无夹具时仍可现场跑 */
      }

      // 2) 服务端记忆（若 vinext 可读盘则覆盖/合并）
      try {
        const res = await fetch("/api/mingxi/think/memory");
        const data = await res.json();
        if (!cancelled && data?.ok) {
          const remote = (data.workspaces || []) as ThinkWorkspace[];
          const nextActive = data.activeWsId || activeWsId;
          if (remote.length) {
            const merged = mergeWorkspaceLists(localList, remote);
            writeLocalMemory(merged, nextActive);
            if (!cancelled) {
              setWorkspaces(merged);
              if (data.activeWsId) setActiveWsId(data.activeWsId);
              const cur = merged.find((w) => w.id === nextActive);
              if (cur) {
                applyThinkData(cur.data);
                if (hasRememberedRun(cur.data)) sampleBootedRef.current.add(cur.id);
              }
              for (const w of merged) {
                if (hasRememberedRun(w.data)) sampleBootedRef.current.add(w.id);
              }
            }
          }
        }
      } catch {
        /* 仅用 localStorage + 静态样例 */
      } finally {
        if (!cancelled) setMemoryReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 进入梳逻辑线：有记忆则回放；仅默认「可执行落地」样例在无记忆时自动跑一次 demo。
  // 其它样例不再自动打 API（避免一切换就转圈跑实时 Agent）。
  useEffect(() => {
    if (view !== "think" || !memoryReady) return;
    const preset = THINK_SAMPLE_PRESETS.find((s) => s.id === activeWsId);
    if (!preset) return;
    if (sampleBootedRef.current.has(activeWsId)) return;
    const ws = workspaces.find((w) => w.id === activeWsId);
    if (hasRememberedRun(ws?.data) || chat.length > 0 || nodes.length > 0 || thinking) {
      sampleBootedRef.current.add(activeWsId);
      return;
    }
    sampleBootedRef.current.add(activeWsId);
    // 预填意图，方便一键发送
    setThinkInput(preset.intent);
    setAsk(preset.intent);
    // 只有主演示样例自动跑；其余等用户点发送（完成后会写入记忆）
    if (preset.demo && preset.id === SAMPLE_WS_ID) {
      void runThink(preset.intent, { demo: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeWsId, memoryReady]);

  // 当前工作区内容变化时轻量回写侧栏摘要 + localStorage
  useEffect(() => {
    if (view !== "think" || !memoryReady) return;
    setWorkspaces((prev) => {
      const next = persistActiveWorkspace(prev);
      writeLocalMemory(next, activeWsId);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, nodes, lineStatus, angleHint, harnessSteps]);

  const renderAnswer = (content: string) => (
    <MarkdownView
      content={content}
      renderCite={(token) => {
        const cite = token.match(/^\[cite:([^\]]+)\]$/);
        const hash = token.match(/^\[#(\d+)\]$/);
        let note: LibraryNote | undefined;
        if (cite) note = citations.find((c) => c.id === cite[1]);
        if (hash) note = citations[Number(hash[1]) - 1];
        return (
          <button
            type="button"
            className="mwb-cite"
            title={note?.title || token}
            onClick={() => note && openNote(note)}
          >
            {note ? note.title.slice(0, 10) : token}
          </button>
        );
      }}
    />
  );

  const noteReturnLabel: Record<NoteReturnView, string> = {
    library: "笔记库",
    think: "梳逻辑线",
    atlas: "领域旭日",
    extend: "扩展",
  };

  const renderVerificationRecord = (note: LibraryNote) => {
    const record = verificationRecords[note.id];
    if (!record?.appendToNote) return null;
    return (
      <section
        className={`mwb-verification-record tone-${record.verdict}`}
        aria-label="最近一次外查核实记录"
      >
        <header>
          <div>
            <span>外查核实 · 人工确认</span>
            <strong>{VERIFICATION_VERDICT_LABEL[record.verdict]}</strong>
          </div>
          <time dateTime={record.verifiedAt}>{formatTime(record.verifiedAt)}</time>
        </header>
        <p>{record.conclusion}</p>
        {record.reviewedEvidence?.length ? (
          <details>
            <summary>查看 {record.reviewedEvidence.length} 条已审资料与判断</summary>
            <div className="mwb-verification-sources">
              {record.reviewedEvidence.map((item) => (
                <a key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer">
                  <span className={`is-${item.verdict}`}>
                    {item.verdict === "accepted" ? "采纳" : item.verdict === "cautious" ? "保留" : "排除"}
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.sourceName}{item.exclusionReason ? ` · ${item.exclusionReason}` : ""}</small>
                </a>
              ))}
            </div>
          </details>
        ) : null}
        <footer>
          <span>采纳 {record.acceptedEvidenceIds.length} 条</span>
          <span>保留 {record.cautiousEvidenceIds.length} 条</span>
          <span>排除 {record.excludedEvidenceIds.length} 条</span>
          <button type="button" onClick={() => startVerification(note)}>重新核实</button>
        </footer>
      </section>
    );
  };

  const renderNoteDocument = (note: LibraryNote, mode: "page" | "atlas") => (
    <article
      className={`mwb-doc ${mode === "page" ? "mwb-doc-in-page" : "mwb-doc-in-atlas"}`}
    >
      {mode === "page" ? (
        <div className="mwb-note-page-bar">
          <button
            type="button"
            className="mwb-note-back"
            onClick={closeStandaloneNote}
          >
            ← 返回{noteReturnLabel[noteReturnView]}
          </button>
          <span>独立阅读 · 按 Esc 返回</span>
        </div>
      ) : (
        <button type="button" className="mwb-atlas-close" onClick={() => setSelected(null)}>
          ← 返回全图
        </button>
      )}

      <div className="mwb-crumb">
        {note.domainPath.join(" / ") || "未分类"} · {note.purposeLabel}
      </div>
      <h1>{note.title}</h1>
      {note.sourceTitle && note.sourceTitle !== note.title ? (
        <p className="mwb-source-title">原文件 · {note.sourceTitle}</p>
      ) : null}

      <div className="mwb-props mwb-note-facts">
        <div>
          <span>记录日期</span>
          <strong>{formatTime(note.capturedAt)}</strong>
        </div>
        <div>
          <span>内容形态</span>
          <strong>
            {MODALITY_LABEL[note.modality] || note.modality || "文本"} ·{" "}
            {note.sourceKind === "web" ? "网页资料" : "知识库笔记"}
          </strong>
        </div>
      </div>

      <NoteTagGroups note={note} />

      {note.purposeLabel === "待定" || note.purposeLabel === "未定" || !note.purposeLabel ? (
        <PurposeConfirmPanel
          noteId={note.id}
          currentPurpose={note.purposeLabel}
          browserOnly
          onConfirmed={({ purposeLabel, note: updatedNote, persistence }) => {
            const updatedId = updatedNote?.id || note.id;
            setSelected((prev) =>
              prev && prev.id === updatedId ? { ...prev, purposeLabel } : prev,
            );
            setNotes((prev) =>
              prev.map((item) => (item.id === updatedId ? { ...item, purposeLabel } : item)),
            );
            if (persistence === "server") void loadLibrary();
          }}
        />
      ) : null}

      <div className="mwb-doc-callout">
        <strong>AI 主旨 · C1 领域路径</strong>
        <p>
          {(note.theme || note.summary || note.title) +
            (note.domainPath.length ? ` · ${note.domainPath.join(" / ")}` : "")}
        </p>
      </div>
      {renderVerificationRecord(note)}
      <NoteMediaView note={note} />
      <div className="mwb-doc-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void runThink(`围绕「${note.title}」相关笔记，梳一条可用的逻辑线`)}
        >
          用这条笔记开梳逻辑线
        </button>
        <button
          type="button"
          onClick={() => startVerification(note)}
        >
          外查核实
        </button>
      </div>
    </article>
  );

  return (
    <div className="mwb">
      <header className="mwb-top">
        <div className="mwb-brand" data-tour="web-brand">
          <Link href="/mingxi/web">明晰</Link>
          <span>Demo 5.0</span>
        </div>
        <nav className="mwb-tabs" data-tour="web-tabs">
          <button
            type="button"
            className={view === "library" || view === "note" || view === "verify" ? "is-on" : ""}
            onClick={() => {
              setSelected(null);
              setView("library");
            }}
          >
            笔记库
          </button>
          <button
            type="button"
            className={view === "atlas" ? "is-on" : ""}
            onClick={() => {
              setSelected(null);
              setDomainFocus(null);
              setView("atlas");
            }}
          >
            领域旭日
          </button>
          <button
            type="button"
            className={view === "think" ? "is-on" : ""}
            onClick={() => {
              setThinkSurface("replay");
              setView("think");
            }}
          >
            梳逻辑线
          </button>
          <button
            type="button"
            className={view === "extend" ? "is-on" : ""}
            onClick={() => setView("extend")}
            title="知识补全"
          >
            扩展
          </button>
        </nav>
        <div className="mwb-top-right">
          {view === "think" ? <LogicChainDeliveryCard /> : null}
          {view === "think" ? (
            <button
              type="button"
              className={`mwb-ghost-btn${thinkSurface === "replay" ? " is-on" : ""}`}
              title={
                thinkSurface === "replay"
                  ? "当前：前端高保真回忆 Demo。点击切换到实机 Agent。"
                  : "当前：实机 Agent。点击切回回忆 Demo。"
              }
              onClick={() =>
                setThinkSurface((s) => (s === "replay" ? "live" : "replay"))
              }
            >
              {thinkSurface === "replay" ? "回忆 Demo · 开" : "切回回忆 Demo"}
            </button>
          ) : null}
          <span className="mwb-profile-chip" title={profileInfo?.active.map((a) => a.statement).join("；") || "尚无习得"}>
            本周学到 {profileInfo?.autoLearnedWeek ?? 0} 条
            {profileInfo?.active[0] ? (
              <button
                type="button"
                className="mwb-profile-rb"
                onClick={() => void rollbackProfile(profileInfo.active[0].id)}
              >
                回滚
              </button>
            ) : null}
          </span>
          <Link href="/demo/phone">手机 Demo</Link>
        </div>
      </header>

      {view === "library" ? (
        <section className="mwb-library">
          <div className="mwb-ask" data-tour="web-ask">
            <span className="mwb-ask-badge">问明晰</span>
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runThink(ask);
              }}
              placeholder="例如：把库里关于 Agent 评测的避雷与正例梳成一条学习逻辑线…"
            />
            <button
              type="button"
              className="mwb-demo-chip"
              onClick={() => {
                setAsk(DEMO_AGENT_INTENT);
                setThinkInput(DEMO_AGENT_INTENT);
              }}
            >
              演示·Agent
            </button>
            <button
              type="button"
              className="mwb-send"
              onClick={() => void runThink(ask, { demo: ask === DEMO_AGENT_INTENT })}
            >
              发送
            </button>
          </div>

          <div className="mwb-filters">
            <input
              className="mwb-search"
              data-tour="web-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadLibrary(purpose, q);
              }}
              placeholder="搜索标题、领域、摘要…"
            />
            <div className={`mwb-chips${dragPurpose ? " is-reordering" : ""}`} data-tour="purpose-chips">
              <button
                type="button"
                className={purpose === "全部" ? "is-on" : ""}
                onClick={() => {
                  setPurpose("全部");
                  void loadLibrary("全部", q);
                }}
              >
                全部
              </button>
              {purposeFilters.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={[
                    purpose === p ? "is-on" : "",
                    dragPurpose === p ? "is-dragging" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (dragPurpose || suppressChipClickRef.current) {
                      suppressChipClickRef.current = false;
                      return;
                    }
                    setPurpose(p);
                    void loadLibrary(p, q);
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    longPressRef.current.id = p;
                    if (longPressRef.current.timer) {
                      window.clearTimeout(longPressRef.current.timer);
                    }
                    longPressRef.current.timer = window.setTimeout(() => {
                      if (longPressRef.current.id !== p) return;
                      suppressChipClickRef.current = true;
                      setDragPurpose(p);
                      setTrashHot(false);
                    }, 420);
                  }}
                  onPointerUp={() => {
                    if (longPressRef.current.timer) {
                      window.clearTimeout(longPressRef.current.timer);
                      longPressRef.current.timer = null;
                    }
                  }}
                  onPointerCancel={() => {
                    if (longPressRef.current.timer) {
                      window.clearTimeout(longPressRef.current.timer);
                      longPressRef.current.timer = null;
                    }
                  }}
                >
                  {p}
                </button>
              ))}
              {addingPurpose ? (
                <form
                  className="mwb-chip-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const label = newPurpose.trim();
                    if (!label || label === "全部") return;
                    if (!purposeFilters.includes(label)) {
                      const next = [...purposeFilters, label];
                      setPurposeFilters(next);
                      savePurposeFilters(next);
                    }
                    setNewPurpose("");
                    setAddingPurpose(false);
                  }}
                >
                  <input
                    autoFocus
                    value={newPurpose}
                    onChange={(e) => setNewPurpose(e.target.value)}
                    placeholder="新用途标签"
                    maxLength={24}
                  />
                  <button type="submit">保存</button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPurpose(false);
                      setNewPurpose("");
                    }}
                  >
                    取消
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="mwb-chip-add"
                  onClick={() => setAddingPurpose(true)}
                  aria-label="新增用途标签"
                >
                  + 新增
                </button>
              )}
              {dragPurpose ? (
                <div
                  data-purpose-trash
                  className={`mwb-chip-trash${trashHot ? " is-hot" : ""}`}
                  aria-label="拖到此处删除"
                >
                  拖到此处删除
                </div>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="mwb-empty">加载银标笔记库…</div>
          ) : (
            <div className="mwb-library-body">
              <DomainPurposeRail
                notes={notes}
                purposeLabel={purpose}
                domainFilter={domainFilter}
                onDomainFilter={setDomainFilter}
              />
              <div className="mwb-library-main">
                {domainFilter?.length ? (
                  <div className="mwb-domain-filter-hint">
                    领域筛选 · {domainFilter.join(" / ")} · {visibleNotes.length}/{notes.length} 篇
                  </div>
                ) : null}
                <div className="mwb-grid" data-tour="note-grid">
                  {visibleNotes.map((n) => (
                    <NoteCard key={n.id} note={n} onOpen={openNote} />
                  ))}
                </div>
                {!visibleNotes.length ? (
                  <div className="mwb-empty soft">当前用途 / 领域下没有笔记</div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {view === "note" ? (
        <section className="mwb-note-page" data-tour="note-drawer">
          {selected ? (
            <div className="mwb-note-page-shell">{renderNoteDocument(selected, "page")}</div>
          ) : (
            <div className="mwb-empty soft">
              <button type="button" className="mwb-note-back" onClick={closeStandaloneNote}>
                ← 返回{noteReturnLabel[noteReturnView]}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {view === "verify" ? (
        verificationOrigin ? (
          <ExternalVerificationFlow
            key={verificationOrigin.noteId}
            origin={verificationOrigin}
            onBack={() => setView(verificationReturnView)}
            onComplete={saveVerificationRecord}
            onOpenLogic={openVerificationLogic}
          />
        ) : (
          <section className="mwb-note-page">
            <div className="mwb-empty soft">
              <button type="button" className="mwb-note-back" onClick={() => setView(verificationReturnView)}>
                ← 返回当前笔记
              </button>
            </div>
          </section>
        )
      ) : null}

      {view === "atlas" ? (
        <section
          className={`mwb-atlas ${selected ? "is-note-open" : "is-explore"}`}
          data-tour="web-atlas"
        >
          <aside className="mwb-atlas-left">
            <DomainFanAtlas
              notes={notes}
              selectedNoteId={selected?.id}
              onClearNote={() => setSelected(null)}
              onSelectNote={(n) => {
                openNoteFromAtlas(n);
              }}
              onSelectDomain={(path, domainNotes) => {
                const full = domainNotes
                  .map((d) => notes.find((x) => x.id === d.id))
                  .filter(Boolean) as LibraryNote[];
                setSelected(null);
                setDomainFocus({
                  path,
                  notes: full.length ? full : (domainNotes as LibraryNote[]),
                });
              }}
            />
            {!selected && domainFocus ? (
              <div className="mwb-atlas-focus-card" aria-live="polite">
                <span>当前领域</span>
                <strong>{domainFocus.path[domainFocus.path.length - 1] || "知识领域"}</strong>
                <p>{domainFocus.path.join(" / ") || "完整领域总览"}</p>
                <em>{domainFocus.notes.length} 篇笔记 · 继续点领域下钻，点白色笔记叶打开正文</em>
              </div>
            ) : null}
          </aside>
          <div className="mwb-atlas-right" data-tour="note-drawer">
            {selected ? (
              renderNoteDocument(selected, "atlas")
            ) : domainFocus ? (
              <div className="mwb-domain-panel">
                <div className="mwb-crumb">{domainFocus.path.join(" / ") || "知识领域"}</div>
                <h1>{domainFocus.path[domainFocus.path.length - 1] || "知识领域"}</h1>
                <p className="mwb-domain-cap">
                  该领域节点下 {domainFocus.notes.length} 条银标笔记 · 点击卡片在右侧展开
                </p>
                <div className="mwb-domain-list">
                  {domainFocus.notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className="mwb-domain-item"
                      onClick={() => openNoteFromAtlas(n)}
                    >
                      <strong>{n.title}</strong>
                      <span>
                        {n.purposeLabel} · {POLARITY_LABEL[n.polarity] || n.polarity}
                      </span>
                      <em>{n.summary}</em>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mwb-empty soft">
                左侧扇形目录按 <b>C1 知识领域</b>（AI 自动标注的 domainPath）分层。
                <br />
                拖曳旋转浏览，点外圈笔记标题 → 右侧展开该笔记（不跳页）。
              </div>
            )}
          </div>
        </section>
      ) : null}

      {view === "extend" ? <KnowledgeExpansionDemo /> : null}

      {view === "think" && thinkSurface === "replay" ? (
        <div className="mwb-think-replay-wrap" data-tour="think-area">
          <ThinkLogicReplayDemo />
        </div>
      ) : null}

      {view === "think" && thinkSurface === "live" ? (
        <section className="mwb-think mwb-think-pro" data-tour="think-area">
          <aside className="mwb-ws-rail" aria-label="工作区">
            <div className="mwb-ws-rail-head">
              <strong>工作区</strong>
              <button type="button" className="mwb-ws-new" title="新建对话" onClick={createWorkspace}>
                +
              </button>
            </div>
            <div className="mwb-ws-section">样例角度</div>
            {workspaces
              .filter((w) => w.isSample)
              .map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`mwb-ws-item${activeWsId === w.id ? " is-on" : ""} is-sample`}
                  onClick={() => switchWorkspace(w.id)}
                >
                  <span className="mwb-ws-badge">样例</span>
                  {hasRememberedRun(w.data) ? <span className="mwb-ws-mem">记忆</span> : null}
                  <strong>{w.title}</strong>
                  <span>{w.subtitle}</span>
                </button>
              ))}
            <div className="mwb-ws-section">我的对话</div>
            {workspaces
              .filter((w) => !w.isSample)
              .map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`mwb-ws-item${activeWsId === w.id ? " is-on" : ""}`}
                  onClick={() => switchWorkspace(w.id)}
                >
                  {hasRememberedRun(w.data) ? <span className="mwb-ws-mem">记忆</span> : null}
                  <strong>{w.title}</strong>
                  <span>{w.subtitle}</span>
                </button>
              ))}
          </aside>

          <aside className="mwb-chat mwb-chat-pro">
            {lineStatus === "pending" && pending ? (
              <div className="mwb-confirm-bar">
                <div>
                  <strong>待确认重排</strong>
                  <p>
                    {angleHint || "角度已解析"}
                    {diffHint ? ` · ${diffHint}` : ""}
                  </p>
                </div>
                <div className="mwb-confirm-actions">
                  <button type="button" disabled={confirming} onClick={() => void rejectLine()}>
                    放弃
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={confirming}
                    onClick={() => void approveLine()}
                  >
                    {confirming ? "处理中…" : "确认生效"}
                  </button>
                </div>
              </div>
            ) : null}
            {lineStatus === "active" ? (
              <div className="mwb-confirm-bar is-ok">
                <strong>逻辑链已生效</strong>
                <span>{angleHint}</span>
              </div>
            ) : null}

            <div className="mwb-chat-stream mwb-chat-stream-pro">
              {chat.length === 0 ? (
                <div className="mwb-chat-hint-pro">
                  <h3>从意图梳一条可执行逻辑线</h3>
                  <p>
                    左侧样例若已标「记忆」，点开即回放历史，不会自动重跑。
                    未跑过的样例只预填意图，需点发送才会调用 Agent；跑完写入本地 + 服务端记忆。
                    主路径：
                    <code>library_retrieve → preview_angle → reline</code>
                    。
                  </p>
                </div>
              ) : null}
              {!thinking && memoryReady && chat.length > 0 && nodes.length > 0 ? (
                <div className="mwb-memory-banner" role="status">
                  工作区已记忆 · {angleHint || "逻辑链"} · 刷新后回放，不自动重跑模型
                </div>
              ) : null}
              <div className="mwb-intent-chips" aria-label="意图快捷">
                {[
                  { id: "reline" as const, label: "梳逻辑链" },
                  { id: "lookup" as const, label: "外查核实" },
                  { id: "decide" as const, label: "决断建议" },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={intentHint === c.id ? "is-on" : ""}
                    onClick={() => setIntentHint((v) => (v === c.id ? null : c.id))}
                  >
                    {c.label}
                  </button>
                ))}
                {lockedIds.length ? (
                  <em className="mwb-lock-count">已锁 {lockedIds.length} 节点</em>
                ) : null}
              </div>
              {harnessSteps.length ? (
                <div className="mwb-harness-strip" aria-label="Agent Harness 步骤">
                  <div className="mwb-harness-meta">{harnessHint || "Agent Harness"}</div>
                  <ol>
                    {harnessSteps.map((s, i) => (
                      <li key={`${s.tool}-${i}`} data-status={s.status}>
                        <strong>{s.tool}</strong>
                        <span>{s.summary}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {lookupCard ? (
                <LookupPanel
                  card={lookupCard}
                  sessionId={thinkSessionId}
                  onWriteBack={(logicLine) => {
                    if (logicLine?.nodes) setNodes(logicLine.nodes as LogicNode[]);
                    if (logicLine?.edges) setEdges(logicLine.edges as LogicEdge[]);
                    setChat((prev) => [
                      ...prev,
                      { role: "assistant", content: "外查结论已写回逻辑链。" },
                    ]);
                  }}
                />
              ) : null}
              {decisionCard ? (
                <DecisionPanel
                  card={decisionCard}
                  onPick={(label) => {
                    setChat((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `已记录你的拍板：「${label}」。明晰不替你执行，只留下可审计的决策痕迹。`,
                      },
                    ]);
                  }}
                />
              ) : null}
              {chat.map((m, i) => (
                <div key={i} className={`mwb-row ${m.role}`}>
                  {m.role === "assistant" ? (
                    <span className="mwb-avatar sm" aria-hidden>
                      明
                    </span>
                  ) : null}
                  <div className={`mwb-bubble-pro ${m.role}`}>
                    {m.role === "assistant" ? renderAnswer(m.content) : m.content}
                  </div>
                </div>
              ))}
              {thinking ? (
                <div className="mwb-row assistant">
                  <span className="mwb-avatar sm" aria-hidden>
                    明
                  </span>
                  <div className="mwb-bubble-pro assistant is-loading">
                    <span className="mwb-typing">
                      <i />
                      <i />
                      <i />
                    </span>
                    {webSearchOn
                      ? "正在仓库召回 + 真实联网搜索/阅读，并跑 Agent 建链…"
                      : "正在召回知识库并跑 Agent 建链…"}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mwb-composer mwb-composer-cursor" ref={composerRef}>
              <div className="mwb-composer-shell">
                <textarea
                  value={thinkInput}
                  rows={2}
                  onChange={(e) => setThinkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void runThink(thinkInput, {
                        demo: thinkLevel === "demo" || thinkInput === DEMO_AGENT_INTENT,
                      });
                    }
                  }}
                  placeholder="继续追问，或切换上方「外查 / 决断」意图…"
                  aria-label="继续追问"
                />
                {attachments.length ? (
                  <div className="mwb-attach-row">
                    {attachments.map((f) => (
                      <button
                        key={`${f.name}-${f.size}`}
                        type="button"
                        className="mwb-attach-chip"
                        title="点击移除"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((x) => x !== f))
                        }
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mwb-composer-bar">
                  <div className="mwb-composer-left">
                    <div className="mwb-menu-wrap">
                      <button
                        type="button"
                        className={`mwb-agent-pill${composerMenu === "agent" ? " is-open" : ""}`}
                        onClick={() =>
                          setComposerMenu((m) => (m === "agent" ? null : "agent"))
                        }
                      >
                        <span className="mwb-inf" aria-hidden>
                          ∞
                        </span>
                        <span>{AGENT_MODES.find((m) => m.id === agentMode)?.label || "Agent"}</span>
                        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                          <path d="M3 4.5L6 8l3-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      </button>
                      {composerMenu === "agent" ? (
                        <div className="mwb-pop-menu" role="listbox">
                          {AGENT_MODES.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={agentMode === m.id}
                              className={agentMode === m.id ? "is-active" : ""}
                              onClick={() => {
                                setAgentMode(m.id);
                                setComposerMenu(null);
                              }}
                            >
                              <strong>{m.label}</strong>
                              <span>{m.hint}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className={`mwb-web-toggle${webSearchOn ? " is-on" : ""}`}
                      aria-pressed={webSearchOn}
                      title={
                        webSearchOn
                          ? "已开启真实联网：AnySearch/Jina 搜索并阅读公开页"
                          : "关闭时仅用仓库笔记建链"
                      }
                      onClick={() => setWebSearchOn((v) => !v)}
                    >
                      <span className="mwb-web-dot" aria-hidden />
                      联网
                    </button>

                    <div className="mwb-menu-wrap">
                      <button
                        type="button"
                        className={`mwb-level-btn${composerMenu === "level" ? " is-open" : ""}`}
                        onClick={() =>
                          setComposerMenu((m) => (m === "level" ? null : "level"))
                        }
                      >
                        <span>
                          {THINK_LEVELS.find((m) => m.id === thinkLevel)?.label || "High Fast"}
                        </span>
                        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                          <path d="M3 4.5L6 8l3-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      </button>
                      {composerMenu === "level" ? (
                        <div className="mwb-pop-menu" role="listbox">
                          {THINK_LEVELS.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={thinkLevel === m.id}
                              className={thinkLevel === m.id ? "is-active" : ""}
                              onClick={() => {
                                setThinkLevel(m.id);
                                setComposerMenu(null);
                              }}
                            >
                              <strong>{m.label}</strong>
                              <span>{m.hint}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mwb-composer-right">
                    <button
                      type="button"
                      className="mwb-icon-btn"
                      title={thinking ? "停止" : "重新生成"}
                      onClick={refreshComposer}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M20 12a8 8 0 1 1-2.2-5.4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                        <path
                          d="M20 5v5h-5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="mwb-icon-btn"
                      title="上传附件"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M16.5 7.5l-6.8 6.8a2.5 2.5 0 1 1-3.5-3.5l7.4-7.4a4 4 0 0 1 5.7 5.7L10.5 17.9a5.5 5.5 0 0 1-7.8-7.8L10 2.8"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`mwb-icon-btn${listening ? " is-live" : ""}`}
                      title={listening ? "听取中…" : "语音输入"}
                      onClick={toggleMic}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect
                          x="9"
                          y="3"
                          width="6"
                          height="11"
                          rx="3"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`mwb-send-circle${thinking ? " is-stop" : ""}`}
                      title={thinking ? "停止" : "发送"}
                      disabled={!thinking && !thinkInput.trim()}
                      onClick={() => {
                        if (thinking) stopThink();
                        else
                          void runThink(thinkInput, {
                            demo: thinkLevel === "demo" || thinkInput === DEMO_AGENT_INTENT,
                          });
                      }}
                    >
                      {thinking ? (
                        <span className="mwb-stop-sq" aria-hidden />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M5 12h12M13 6l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept="image/*,.pdf,.md,.txt,.json"
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </aside>

          <div className="mwb-logic mwb-logic-pro">
            <div className="mwb-logic-head">
              <div>
                <strong>逻辑画布</strong>
                <span className="mwb-logic-tip">
                  {lineStatus === "pending"
                    ? "预览中 · 确认后生效"
                    : lineStatus === "active"
                      ? "已生效"
                      : "可拖拽节点 · 悬停笔记预览"}
                  {angleHint ? ` · ${angleHint}` : ""}
                </span>
              </div>
            </div>
            {nodes.length ? (
              <LogicMindMap
                nodes={nodes}
                edges={edges}
                citations={citations}
                lockedIds={lockedIds}
                onToggleLock={(id) =>
                  setLockedIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                  )
                }
                onScopeRegen={(id) => {
                  setScopeNodeId(id);
                  const utter =
                    thinkInput.trim() ||
                    ask ||
                    "在锁定节点不变的前提下，只重生成选中分支";
                  void runThink(utter, { scopeNodeId: id });
                }}
                onOpenNote={openNote}
              />
            ) : (
              <div className="mwb-empty soft">发送意图后，这里会出现可交互的逻辑图</div>
            )}
          </div>
        </section>
      ) : null}

      {showCapture ? (
        <aside className="mwb-side-drawer" aria-label="捕获入库" data-tour="capture-drawer">
          <button type="button" className="mwb-drawer-close" onClick={() => setShowCapture(false)}>
            关闭
          </button>
          <CapturePanel
            onCaptured={() => {
              void loadLibrary();
            }}
          />
        </aside>
      ) : null}

      {showEval ? (
        <aside className="mwb-side-drawer is-eval" aria-label="评测" data-tour="eval-drawer">
          <button type="button" className="mwb-drawer-close" onClick={() => setShowEval(false)}>
            关闭
          </button>
          <EvalPanel
            report={evalReport}
            busy={evalBusy}
            onRun={() => {
              void (async () => {
                setEvalBusy(true);
                try {
                  const res = await fetch("/api/mingxi/eval", { method: "POST" });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "评测失败");
                  setEvalReport(data);
                } catch (e) {
                  setEvalReport({
                    passRate: 0,
                    passed: 0,
                    total: 0,
                    byCapability: [],
                    failedTasks: [
                      {
                        id: "eval_error",
                        capability: "runner",
                        reason: e instanceof Error ? e.message : String(e),
                      },
                    ],
                  });
                } finally {
                  setEvalBusy(false);
                }
              })();
            }}
          />
          <p className="mwb-eval-note">
            能力维度不同：梳链看结构 diff；锁定看字节不变；外查看人审闸；决断看未知项；安全看破坏性确认。
            完整矩阵见{" "}
            <Link href="/汇报网页/capability-eval-matrix.html">capability-eval-matrix</Link>
          </p>
        </aside>
      ) : null}
    </div>
  );
}
