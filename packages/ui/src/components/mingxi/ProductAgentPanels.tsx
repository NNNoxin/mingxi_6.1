"use client";

import { useEffect, useState } from "react";

/** 产品 Demo：外查卡 / 决断卡 / 成件 / 评测 / 捕获 / 用途确认 */

export type LookupCardView = {
  id: string;
  question: string;
  mode: "Replay" | "Live";
  status: string;
  findings: Array<{
    claim: string;
    sourceUrl: string;
    sourceName: string;
    publishedAt: string;
    reliability: string;
  }>;
  conflicts: Array<{ materialId: string; blockId: string; note: string }>;
  fallbackAdvice?: string[];
};

export type DecisionCardView = {
  id: string;
  question: string;
  options: Array<{
    label: string;
    pros: string[];
    cons: string[];
    strongEvidenceCount: number;
  }>;
  recommendation?: string;
  reason?: string;
  unknowns: string[];
  refused?: boolean;
  refusedReason?: string;
};

export type OrganizePieceView = {
  purposeLabel: string;
  recipe: string;
  stanceOk?: boolean;
  blocks: Array<{ role: string; text: string; citations?: unknown[]; flag?: string }>;
};

export type EvalReportView = {
  passRate: number;
  passed: number;
  total: number;
  byCapability: Array<{ id: string; passed: number; total: number; passRate: number }>;
  failedTasks?: Array<{ id: string; capability: string; reason?: string }>;
  ranAt?: string;
};

const PURPOSES = ["学习理论", "资料收藏", "反例避坑", "对标拆解", "素材金句"] as const;
const CAPTURE_PURPOSES = [...PURPOSES, "待定"] as const;
const PURPOSE_OVERRIDE_STORAGE_KEY = "mingxi-purpose-overrides-v1";

type PurposeValue = (typeof PURPOSES)[number];
type PurposeCandidateSource = "ai_inferred" | "prior" | "heuristic";
type PurposeLoadState = "loading" | "ready" | "error";
type PurposeSaveState = "idle" | "saving" | "saved-server" | "saved-browser" | "error";

export type PurposeCandidateView = {
  purpose: PurposeValue;
  why: string;
  confidence: number;
  source: PurposeCandidateSource;
};

const PURPOSE_SOURCE_LABEL: Record<PurposeCandidateSource, string> = {
  ai_inferred: "AI理解",
  prior: "历史习惯",
  heuristic: "内容线索",
};

function isPendingPurpose(label: string | undefined | null) {
  const t = String(label || "").trim();
  return !t || t === "待定" || t === "未定";
}

function isPurposeValue(value: unknown): value is PurposeValue {
  return (PURPOSES as readonly unknown[]).includes(value);
}

function isPurposeCandidateSource(value: unknown): value is PurposeCandidateSource {
  return value === "ai_inferred" || value === "prior" || value === "heuristic";
}

function saveBrowserPurposeOverride(noteId: string, purposeLabel: PurposeValue): boolean {
  try {
    const raw = window.localStorage.getItem(PURPOSE_OVERRIDE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const previous =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, { purposeLabel: string; updatedAt: string }>)
        : {};
    const next: Record<string, { purposeLabel: string; updatedAt: string }> = {
      ...previous,
      [noteId]: { purposeLabel, updatedAt: new Date().toISOString() },
    };
    window.localStorage.setItem(PURPOSE_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** 待定 → 系统推荐 → 人明确选择 → 服务端或浏览器确认 */
export function PurposeConfirmPanel({
  noteId,
  currentPurpose,
  compact,
  browserOnly,
  onConfirmed,
}: {
  noteId: string;
  currentPurpose?: string;
  /** 捕获抽屉里用紧凑样式 */
  compact?: boolean;
  /** 纯前端演示：不发送确认 POST，仅写入浏览器覆盖层 */
  browserOnly?: boolean;
  onConfirmed?: (payload: {
    purposeLabel: string;
    note: { id: string; title: string; purposeLabel: string };
    persistence: "server" | "browser";
  }) => void;
}) {
  const [loadState, setLoadState] = useState<PurposeLoadState>("loading");
  const [saveState, setSaveState] = useState<PurposeSaveState>("idle");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(isPendingPurpose(currentPurpose));
  const [purpose, setPurpose] = useState<PurposeValue | "">("");
  const [candidates, setCandidates] = useState<PurposeCandidateView[]>([]);
  const [title, setTitle] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [loadedNoteId, setLoadedNoteId] = useState(noteId);

  useEffect(() => {
    if (!isPendingPurpose(currentPurpose)) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/mingxi/purpose?noteId=${encodeURIComponent(noteId)}`);
        const data = (await res.json()) as {
          title?: string;
          pending?: boolean;
          purposeLabel?: string;
          candidates?: Array<Partial<PurposeCandidateView>>;
        };
        if (!res.ok) throw new Error("PURPOSE_CANDIDATES_UNAVAILABLE");
        if (cancelled) return;
        setLoadedNoteId(noteId);
        setSaveState("idle");
        setFeedback("");
        setPurpose("");
        setCollapsed(false);
        setTitle(data.title || "");
        setPending(Boolean(data.pending));
        setCandidates(
          (Array.isArray(data.candidates) ? data.candidates : [])
            .filter(
              (candidate): candidate is PurposeCandidateView =>
                isPurposeValue(candidate.purpose) &&
                typeof candidate.why === "string" &&
                typeof candidate.confidence === "number" &&
                isPurposeCandidateSource(candidate.source),
            )
            .filter(
              (candidate, index, all) =>
                all.findIndex((item) => item.purpose === candidate.purpose) === index,
            ),
        );
        if (!isPendingPurpose(data.purposeLabel) && isPurposeValue(data.purposeLabel)) {
          setPurpose(data.purposeLabel);
        }
        setLoadState("ready");
      } catch {
        if (!cancelled) {
          setLoadedNoteId(noteId);
          setSaveState("idle");
          setPending(isPendingPurpose(currentPurpose));
          setPurpose("");
          setCandidates([]);
          setTitle("");
          setCollapsed(false);
          setLoadState("error");
          setFeedback("暂时无法生成建议，你仍可以直接选择一个用途。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPurpose, noteId, retryKey]);

  function completeBrowserSave(selectedPurpose: PurposeValue, reason?: string) {
    if (!saveBrowserPurposeOverride(noteId, selectedPurpose)) {
      setSaveState("error");
      setFeedback("浏览器暂时无法保存，你的选择已保留，请重试。");
      return;
    }
    setPending(false);
    setSaveState("saved-browser");
    setFeedback(reason || `已保存到此浏览器 · ${selectedPurpose}`);
    onConfirmed?.({
      purposeLabel: selectedPurpose,
      note: { id: noteId, title, purposeLabel: selectedPurpose },
      persistence: "browser",
    });
  }

  async function confirm() {
    if (!purpose || isPendingPurpose(purpose)) {
      setSaveState("error");
      setFeedback("请先选择一个具体用途。");
      return;
    }
    setSaveState("saving");
    setFeedback("");

    if (browserOnly) {
      completeBrowserSave(purpose);
      return;
    }

    try {
      const res = await fetch("/api/mingxi/purpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, purpose, action: "confirm" }),
      });
      const data = (await res.json()) as {
        code?: string;
        purposeLabel?: string;
        note?: { id: string; title: string; purposeLabel: string };
      };
      if (!res.ok) {
        if (data.code === "STORAGE_READ_ONLY" || res.status >= 500) {
          completeBrowserSave(
            purpose,
            `服务端暂时不可写，已保存到此浏览器 · ${purpose}`,
          );
          return;
        }
        setSaveState("error");
        setFeedback(
          data.code === "NOTE_NOT_FOUND"
            ? "没有找到这条笔记，请返回后重新打开。"
            : "这个用途暂时无法确认，请重新选择。",
        );
        return;
      }
      const confirmedPurpose = isPurposeValue(data.purposeLabel) ? data.purposeLabel : purpose;
      setPending(false);
      setSaveState("saved-server");
      setFeedback(`已确认用途 · ${confirmedPurpose}`);
      onConfirmed?.({
        purposeLabel: confirmedPurpose,
        note: data.note || { id: noteId, title, purposeLabel: confirmedPurpose },
        persistence: "server",
      });
    } catch {
      completeBrowserSave(
        purpose,
        `暂时无法连接服务端，已保存到此浏览器 · ${purpose}`,
      );
    }
  }

  // 已经有明确用途的笔记永远不进入确认流程，也不显示确认后的回执界面。
  if (!isPendingPurpose(currentPurpose) || !pending) return null;

  if (collapsed) {
    return (
      <section
        className={`mwb-purpose-confirm is-collapsed${compact ? " is-compact" : ""}`}
        data-tour="purpose-confirm"
      >
        <div>
          <span className="mwb-purpose-kicker">仍待确认</span>
          <strong>这条笔记还没有主要用途</strong>
        </div>
        <button type="button" className="mwb-purpose-resume" onClick={() => setCollapsed(false)}>
          继续确认
        </button>
      </section>
    );
  }

  const recommendedCandidates = candidates.slice(0, 2);
  const recommendedPurpose = recommendedCandidates[0]?.purpose;
  const candidatePurposes = new Set(recommendedCandidates.map((candidate) => candidate.purpose));
  const otherPurposes = PURPOSES.filter((item) => !candidatePurposes.has(item));
  const saving = saveState === "saving";
  const visibleLoadState = loadedNoteId === noteId ? loadState : "loading";
  const headingId = `purpose-heading-${noteId}`;
  const helpId = `purpose-help-${noteId}`;

  return (
    <section
      className={`mwb-purpose-confirm${compact ? " is-compact" : ""}`}
      data-tour="purpose-confirm"
      aria-labelledby={headingId}
      aria-busy={visibleLoadState === "loading" || saving}
    >
      <header className="mwb-purpose-head">
        <div>
          <span className="mwb-purpose-kicker">需要你确认</span>
          <h2 id={headingId}>这条笔记主要是为了什么？</h2>
        </div>
        <button type="button" className="mwb-purpose-collapse" onClick={() => setCollapsed(true)}>
          稍后再说
        </button>
      </header>
      <p id={helpId} className="mwb-purpose-help">
        先看 AI 推荐；如果不准确，再从其他用途里选择。确认只调整用途分类，不改笔记正文。
      </p>

      {visibleLoadState === "loading" ? (
        <div className="mwb-purpose-loading" role="status" aria-live="polite">
          <span />
          <span />
          <em>正在整理用途建议…</em>
        </div>
      ) : (
        <fieldset className="mwb-purpose-fieldset" disabled={saving} aria-describedby={helpId}>
          <legend className="mwb-purpose-ai-heading">
            <strong>AI 推荐</strong>
            <span>请选择最符合的一项</span>
          </legend>
          {recommendedCandidates.length ? (
            <div className="mwb-purpose-cands">
              {recommendedCandidates.map((candidate) => {
                const reasonId = `purpose-reason-${noteId}-${candidate.purpose}`;
                const selected = purpose === candidate.purpose;
                return (
                  <label
                    key={candidate.purpose}
                    className={`mwb-purpose-option${selected ? " is-on" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`purpose-${noteId}`}
                      value={candidate.purpose}
                      checked={selected}
                      onChange={() => {
                        setPurpose(candidate.purpose);
                        setSaveState("idle");
                        setFeedback("");
                      }}
                      aria-describedby={reasonId}
                    />
                    <span className="mwb-purpose-radio" aria-hidden="true" />
                    <span className="mwb-purpose-option-copy">
                      <span className="mwb-purpose-option-topline">
                        <strong>{candidate.purpose}</strong>
                        <span className="mwb-purpose-recommended">
                          {candidate.purpose === recommendedPurpose ? "AI 首选" : "AI 推荐"}
                        </span>
                        <em>匹配度 {Math.round(candidate.confidence * 100)}%</em>
                      </span>
                      <small id={reasonId}>
                        {PURPOSE_SOURCE_LABEL[candidate.source]} · {candidate.why}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {otherPurposes.length ? (
            <div className="mwb-purpose-other">
              <span className="mwb-purpose-other-heading">
                <strong>AI 推荐不准？</strong>
                <small>请从其他用途中选择</small>
              </span>
              <div>
                {otherPurposes.map((item) => (
                  <label key={item} className={purpose === item ? "is-on" : ""}>
                    <input
                      type="radio"
                      name={`purpose-${noteId}`}
                      value={item}
                      checked={purpose === item}
                      onChange={() => {
                        setPurpose(item);
                        setSaveState("idle");
                        setFeedback("");
                      }}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </fieldset>
      )}

      {visibleLoadState === "error" ? (
        <div className="mwb-purpose-feedback is-warning" role="alert">
          <span>暂时无法生成建议，你仍可以直接选择一个用途。</span>
          <button
            type="button"
            onClick={() => {
              setLoadState("loading");
              setFeedback("");
              setCandidates([]);
              setPurpose("");
              setRetryKey((value) => value + 1);
            }}
          >
            重新获取建议
          </button>
        </div>
      ) : null}
      {saveState === "error" && feedback ? (
        <div className="mwb-purpose-feedback is-error" role="alert">
          {feedback}
        </div>
      ) : null}

      <div className="mwb-purpose-actions">
        <button
          type="button"
          className="primary"
          disabled={visibleLoadState === "loading" || saving || !purpose}
          onClick={() => void confirm()}
        >
          {saving ? "正在保存…" : purpose ? `确认用途：${purpose}` : "请先选择一个用途"}
        </button>
        <button type="button" className="secondary" disabled={saving} onClick={() => setCollapsed(true)}>
          稍后再说
        </button>
      </div>
    </section>
  );
}

export function OrganizePanel({
  noteId,
  currentPurpose,
  onDone,
}: {
  noteId: string;
  currentPurpose: string;
  onDone?: (piece: OrganizePieceView) => void;
}) {
  const [purpose, setPurpose] = useState(currentPurpose || "资料收藏");
  const [busy, setBusy] = useState(false);
  const [piece, setPiece] = useState<OrganizePieceView | null>(null);
  const [err, setErr] = useState("");

  async function run(confirmOnly = false) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/mingxi/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, purpose, confirmOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "成件失败");
      if (confirmOnly) {
        setPiece({
          purposeLabel: data.purposeLabel,
          recipe: "confirmed",
          blocks: [],
        });
        return;
      }
      const view: OrganizePieceView = {
        purposeLabel: data.purposeLabel,
        recipe: data.piece?.recipe || "",
        stanceOk: data.stanceOk,
        blocks: data.piece?.blocks || [],
      };
      setPiece(view);
      onDone?.(view);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mwb-organize-panel">
      <strong>C2 用途确认 · 成件</strong>
      <p>声明用途后才会按配方整理成件；未确认不得擅自成件。</p>
      <div className="mwb-purpose-picks">
        {PURPOSES.map((p) => (
          <button
            key={p}
            type="button"
            className={purpose === p ? "is-on" : ""}
            onClick={() => setPurpose(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mwb-organize-actions">
        <button type="button" disabled={busy} onClick={() => void run(true)}>
          仅确认用途
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void run(false)}>
          {busy ? "成件中…" : "确认并成件"}
        </button>
      </div>
      {err ? <div className="mwb-panel-err">{err}</div> : null}
      {piece ? (
        <div className="mwb-piece-view">
          <em>
            {piece.purposeLabel} · {piece.recipe}
            {piece.stanceOk === false ? " · 立场预警" : ""}
          </em>
          {piece.blocks.map((b, i) => (
            <div key={i} className="mwb-piece-block">
              <span>{b.role}</span>
              <p>{b.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LookupPanel({
  card,
  sessionId,
  onWriteBack,
}: {
  card: LookupCardView;
  sessionId: string | null;
  onWriteBack?: (logicLine?: { nodes: unknown[]; edges: unknown[] }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function writeBack(approved: boolean) {
    if (!sessionId) {
      setMsg("无会话，请先梳一条逻辑线再写回");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/mingxi/lookup/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, card, approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "写回失败");
      setMsg(approved ? data.summary || "已写回" : "已拒绝写回");
      if (approved) onWriteBack?.(data.logicLine);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`mwb-lookup-panel mode-${card.mode.toLowerCase()}`}>
      <header>
        <strong>外查卡</strong>
        <span data-mode={card.mode}>{card.mode}</span>
        <em>{card.status}</em>
      </header>
      <p className="mwb-card-q">{card.question}</p>
      {card.findings?.length ? (
        <ol>
          {card.findings.map((f, i) => (
            <li key={i}>
              <strong>{f.claim}</strong>
              <a href={f.sourceUrl} target="_blank" rel="noreferrer">
                {f.sourceName} · {f.reliability}
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <ul>
          {(card.fallbackAdvice || []).map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {card.conflicts?.length ? (
        <div className="mwb-conflicts">
          <strong>与已有笔记冲突</strong>
          {card.conflicts.map((c, i) => (
            <p key={i}>
              {c.materialId}/{c.blockId}：{c.note}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mwb-organize-actions">
        <button type="button" disabled={busy} onClick={() => void writeBack(false)}>
          拒绝
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || card.status === "no_result"}
          onClick={() => void writeBack(true)}
        >
          {busy ? "处理中…" : "批准写回链路"}
        </button>
      </div>
      {msg ? <div className="mwb-panel-msg">{msg}</div> : null}
    </div>
  );
}

export function DecisionPanel({
  card,
  onPick,
}: {
  card: DecisionCardView;
  onPick?: (label: string) => void;
}) {
  const [picked, setPicked] = useState("");
  return (
    <div className="mwb-decision-panel">
      <header>
        <strong>决断卡</strong>
        {card.refused ? <em className="is-refuse">弃权</em> : null}
      </header>
      <p className="mwb-card-q">{card.question}</p>
      {card.refused ? (
        <p>{card.refusedReason}</p>
      ) : (
        <ol>
          {card.options.map((o, i) => (
            <li key={i}>
              <strong>{o.label}</strong>
              <span>证据 {o.strongEvidenceCount}</span>
              <p>利：{o.pros.join("；") || "—"}</p>
              <p>弊：{o.cons.join("；") || "—"}</p>
              {!card.refused ? (
                <button
                  type="button"
                  className={picked === o.label ? "primary" : ""}
                  onClick={() => {
                    setPicked(o.label);
                    onPick?.(o.label);
                  }}
                >
                  {picked === o.label ? "已拍板" : "选这个"}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {card.recommendation ? (
        <div className="mwb-rec">
          建议：{card.recommendation}
          {card.reason ? `（${card.reason}）` : ""}
        </div>
      ) : null}
      <div className="mwb-unknowns">未知：{(card.unknowns || []).join("；") || "—"}</div>
      {picked ? <div className="mwb-panel-msg">你已拍板：{picked}（写入对话，不替你执行）</div> : null}
    </div>
  );
}

export function CapturePanel({
  onCaptured,
}: {
  onCaptured?: (note?: { id: string; title?: string; purposeLabel?: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [purposeLabel, setPurposeLabel] = useState<(typeof CAPTURE_PURPOSES)[number]>("待定");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  async function run() {
    if (!url.trim() && !text.trim()) return;
    setBusy(true);
    setLog("");
    setPendingNoteId(null);
    try {
      const res = await fetch("/api/mingxi/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || undefined,
          text: text.trim() || undefined,
          purposeLabel,
          enrichVision: false,
          tag: true,
          persist: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "捕获失败");
      const notePurpose = String(data.note?.purposeLabel || purposeLabel);
      setLog(
        `已入库：${data.note?.title || data.materialId} · ${notePurpose} · ${(data.domainPath || []).join("/")}`,
      );
      setUrl("");
      setText("");
      if (isPendingPurpose(notePurpose) && data.note?.id) {
        setPendingNoteId(String(data.note.id));
      }
      onCaptured?.(data.note);
    } catch (e) {
      setLog(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mwb-capture-panel">
      <strong>捕获入库</strong>
      <p>链接或粘贴 → 打标入库。用途选「待定」时，入库后立刻出现候选确认。</p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… 公开网页"
        aria-label="捕获链接"
      />
      <textarea
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        placeholder="或粘贴文本笔记"
        aria-label="捕获文本"
      />
      <div className="mwb-purpose-picks" aria-label="捕获时用途">
        {CAPTURE_PURPOSES.map((p) => (
          <button
            key={p}
            type="button"
            className={purposeLabel === p ? "is-on" : ""}
            onClick={() => setPurposeLabel(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <button type="button" className="primary" disabled={busy} onClick={() => void run()}>
        {busy ? "入库中…" : "写入活知识库"}
      </button>
      {log ? <div className="mwb-panel-msg">{log}</div> : null}
      {pendingNoteId ? (
        <PurposeConfirmPanel
          noteId={pendingNoteId}
          currentPurpose="待定"
          compact
          onConfirmed={({ purposeLabel: confirmed }) => {
            setLog((prev) => `${prev} → 已确认「${confirmed}」`);
            setPendingNoteId(null);
            onCaptured?.({ id: pendingNoteId, purposeLabel: confirmed });
          }}
        />
      ) : null}
    </div>
  );
}

export function EvalPanel({
  report,
  busy,
  onRun,
}: {
  report: EvalReportView | null;
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <div className="mwb-eval-panel">
      <header>
        <strong>引擎评测 · 冻结 50 题</strong>
        <button type="button" className="primary" disabled={busy} onClick={onRun}>
          {busy ? "评测中…" : "跑一遍"}
        </button>
      </header>
      {report ? (
        <>
          <div className="mwb-eval-score">
            {(report.passRate * 100).toFixed(1)}% · {report.passed}/{report.total}
          </div>
          <div className="mwb-eval-caps">
            {report.byCapability.map((c) => (
              <div
                key={c.id}
                className={`mwb-eval-row${c.passed === c.total ? " pass" : " fail"}`}
              >
                <span>{c.id}</span>
                <em>
                  {c.passed}/{c.total}
                </em>
              </div>
            ))}
          </div>
          {report.failedTasks?.length ? (
            <details>
              <summary>失败题 {report.failedTasks.length}</summary>
              {report.failedTasks.map((t) => (
                <div key={t.id} className="mwb-eval-fail">
                  {t.id} · {t.capability} — {t.reason}
                </div>
              ))}
            </details>
          ) : null}
          <em className="mwb-eval-at">{report.ranAt}</em>
        </>
      ) : (
        <p>不同能力用不同断言：用途路由 / 凭据 / 梳链 / 锁定 / 外查 Replay / 决断 / 习得 / 安全。</p>
      )}
    </div>
  );
}
