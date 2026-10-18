"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildVerificationEvidence,
  createVerificationRecord,
  draftVerificationConclusion,
  type EvidenceVerdict,
  type VerificationEvidence,
  type VerificationOrigin,
  type VerificationRecord,
  type VerificationScope,
  type VerificationVerdict,
} from "../../lib/mingxi/web/external-verification";
import "./external-verification-flow.css";

type VerificationStage = "defining" | "searching" | "reviewing" | "conclusion" | "done";
type EvidenceFilter = "all" | "pending" | "reviewed";

const VERDICT_LABEL: Record<VerificationVerdict, string> = {
  supported: "基本成立",
  partly_supported: "部分成立",
  outdated: "已经过时",
  unsupported: "不被支持",
  insufficient: "证据不足",
};

const EVIDENCE_KIND_LABEL: Record<VerificationEvidence["kind"], string> = {
  origin: "原笔记",
  official: "官方口径",
  research: "研究资料",
  counterexample: "反证线索",
  context: "情境资料",
};

const REVIEW_LABEL: Record<Exclude<EvidenceVerdict, "pending">, string> = {
  accepted: "采纳",
  cautious: "保留",
  excluded: "排除",
};

const EXCLUSION_REASONS = ["与问题无关", "资料已过期", "来源可信度不足", "正文无法核读"] as const;

function defaultQuestion(origin: VerificationOrigin): string {
  return `核实「${origin.title}」的核心结论是否仍然成立，并确认它的适用边界。`;
}

export function ExternalVerificationFlow({
  origin,
  onBack,
  onComplete,
  onOpenLogic,
}: {
  origin: VerificationOrigin;
  onBack: () => void;
  onComplete: (record: VerificationRecord) => void;
  onOpenLogic: (record: VerificationRecord) => void;
}) {
  const [stage, setStage] = useState<VerificationStage>("defining");
  const [question, setQuestion] = useState(() => defaultQuestion(origin));
  const [scope, setScope] = useState<VerificationScope>("fact");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [submittedScope, setSubmittedScope] = useState<VerificationScope>("fact");
  const [evidence, setEvidence] = useState<VerificationEvidence[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, EvidenceVerdict>>({});
  const [exclusionReasons, setExclusionReasons] = useState<Record<string, string>>({});
  const [activeEvidenceId, setActiveEvidenceId] = useState("");
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const [searchNonce, setSearchNonce] = useState(0);
  const [conclusionVerdict, setConclusionVerdict] =
    useState<VerificationVerdict>("partly_supported");
  const [conclusion, setConclusion] = useState("");
  const [appendToNote, setAppendToNote] = useState(true);
  const [createLogicBranch, setCreateLogicBranch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState<VerificationRecord | null>(null);

  useEffect(() => {
    if (stage !== "searching") return;
    const timer = window.setTimeout(() => {
      const next = buildVerificationEvidence(origin, submittedQuestion, submittedScope);
      setEvidence(next);
      setVerdicts(
        Object.fromEntries(
          next.filter((item) => item.kind !== "origin").map((item) => [item.id, "pending" as const]),
        ),
      );
      setActiveEvidenceId(next[0]?.id || "");
      setStage("reviewing");
    }, 720);
    return () => window.clearTimeout(timer);
  }, [origin, searchNonce, stage, submittedQuestion, submittedScope]);

  const reviewCount = useMemo(
    () => Object.values(verdicts).filter((value) => value !== "pending").length,
    [verdicts],
  );
  const acceptedCount = useMemo(
    () => Object.values(verdicts).filter((value) => value === "accepted").length,
    [verdicts],
  );
  const cautiousCount = useMemo(
    () => Object.values(verdicts).filter((value) => value === "cautious").length,
    [verdicts],
  );
  const excludedCount = useMemo(
    () => Object.values(verdicts).filter((value) => value === "excluded").length,
    [verdicts],
  );
  const unexplainedExclusions = useMemo(
    () =>
      Object.entries(verdicts).filter(
        ([id, value]) => value === "excluded" && !exclusionReasons[id],
      ).length,
    [exclusionReasons, verdicts],
  );
  const reviewableCount = evidence.filter((item) => item.kind !== "origin").length;
  const pendingCount = Math.max(0, reviewableCount - reviewCount);
  const filteredEvidence = useMemo(
    () =>
      evidence.filter((item) => {
        if (item.kind === "origin") return filter === "all";
        const verdict = verdicts[item.id] || "pending";
        if (filter === "pending") return verdict === "pending";
        if (filter === "reviewed") return verdict !== "pending";
        return true;
      }),
    [evidence, filter, verdicts],
  );

  function startSearch() {
    if (!question.trim() || stage === "searching") return;
    setSubmittedQuestion(question.trim());
    setSubmittedScope(scope);
    setStage("searching");
    setEvidence([]);
    setVerdicts({});
    setExclusionReasons({});
    setActiveEvidenceId("");
    setConclusion("");
    setSavedRecord(null);
    setSearchNonce((value) => value + 1);
  }

  function reviewEvidence(id: string, verdict: Exclude<EvidenceVerdict, "pending">) {
    if (stage !== "reviewing") return;
    setVerdicts((prev) => ({ ...prev, [id]: prev[id] === verdict ? "pending" : verdict }));
  }

  function makeConclusion() {
    if (pendingCount > 0 || unexplainedExclusions > 0) return;
    const draft = draftVerificationConclusion(origin, verdicts);
    setConclusionVerdict(draft.verdict);
    setConclusion(draft.text);
    setStage("conclusion");
  }

  function saveRecord() {
    if (
      !conclusion.trim() ||
      saving ||
      pendingCount > 0 ||
      unexplainedExclusions > 0 ||
      (!appendToNote && !createLogicBranch)
    ) return;
    setSaving(true);
    const record = createVerificationRecord({
      origin,
      question,
      scope,
      verdict: conclusionVerdict,
      conclusion,
      verdicts,
      evidence,
      exclusionReasons,
      appendToNote,
      createLogicBranch,
    });
    setSavedRecord(record);
    setStage("done");
    setSaving(false);
    onComplete(record);
  }

  const stageIndex =
    stage === "defining" || stage === "searching"
      ? 1
      : stage === "reviewing"
        ? 2
        : stage === "conclusion"
          ? 3
          : 4;

  return (
    <main className="mxv" aria-label="外查核实工作台">
      <header className="mxv-header">
        <div className="mxv-header-copy">
          <button type="button" className="mxv-back" disabled={saving} onClick={onBack}>
            ← 返回当前笔记
          </button>
          <span className="mxv-kicker">EXTERNAL VERIFICATION · 人在回路</span>
          <h1>外查核实</h1>
          <p>从一条笔记的具体主张出发，逐条判断公开资料，再决定结论如何写回。</p>
        </div>
        <div className="mxv-progress" aria-label={`核实进度，第 ${stageIndex} 步，共 4 步`}>
          {[
            [1, "定义问题"],
            [2, "审阅证据"],
            [3, "形成结论"],
            [4, "确认写回"],
          ].map(([index, label]) => (
            <span
              key={String(index)}
              className={stageIndex >= Number(index) ? "is-on" : ""}
              aria-current={stageIndex === Number(index) ? "step" : undefined}
            >
              <b>{stageIndex > Number(index) ? "✓" : index}</b>
              {label}
            </span>
          ))}
        </div>
      </header>

      <div className="mxv-demo-note" role="note">
        <span>前端交互演示</span>
        当前展示的是可审阅的录制资料与检索路径；它用来演示产品闭环，不冒充最终事实结论。
      </div>

      <section className="mxv-workspace">
        <aside className="mxv-origin-pane">
          <section className="mxv-origin-card">
            <span>核实起点 · 当前笔记</span>
            <h2>{origin.title}</h2>
            <p>{origin.summary}</p>
            <small>{origin.domainPath.join(" / ") || "未分类"}</small>
          </section>

          <fieldset className="mxv-scope">
            <legend>这次主要核实什么？</legend>
            {[
              ["fact", "事实是否成立"],
              ["timeliness", "结论是否过时"],
              ["controversy", "争议与反例"],
            ].map(([id, label]) => (
              <label key={id} className={scope === id ? "is-on" : ""}>
                <input
                  type="radio"
                  name="verification-scope"
                  value={id}
                  checked={scope === id}
                  disabled={stage === "searching" || stage === "done"}
                  onChange={() => setScope(id as VerificationScope)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <label className="mxv-question">
            <span>要核实的问题</span>
            <textarea
              value={question}
              rows={6}
              disabled={stage === "searching" || stage === "done"}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="mxv-search"
            disabled={!question.trim() || stage === "searching" || stage === "done"}
            onClick={startSearch}
          >
            <span aria-hidden>⌕</span>
            {stage === "defining"
              ? "开始核实这条问题"
              : stage === "searching"
                ? "正在查找并整理资料…"
                : "按当前问题重新搜索"}
          </button>
          <p className="mxv-origin-hint">起始笔记始终不变；外查只增加核实记录，不会覆盖原文。</p>
        </aside>

        <section className="mxv-evidence-pane" aria-busy={stage === "searching"}>
          <header className="mxv-evidence-head">
            <div>
              <span>公开资料与本库对照</span>
              <strong>
                {stage === "defining"
                  ? "先确认左侧核实问题"
                  : stage === "searching"
                    ? "正在建立证据队列"
                    : `${reviewableCount} 条外部资料待你判断`}
              </strong>
            </div>
            <div className="mxv-filter" aria-label="证据筛选">
              {[
                ["all", "全部"],
                ["pending", "未判断"],
                ["reviewed", "已判断"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? "is-on" : ""}
                  aria-pressed={filter === id}
                  disabled={stage === "defining" || stage === "searching"}
                  onClick={() => setFilter(id as EvidenceFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          {stage === "defining" ? (
            <div className="mxv-defining">
              <span>01</span>
              <h2>先把“查什么”说清楚</h2>
              <p>外查不是按标题搜几个网页，而是先锁定一条可判断的主张，再从官方口径、研究资料、反例和情境案例四个方向交叉核对。</p>
              <ol>
                <li><b>选择角度</b><span>事实、时效，或争议反例</span></li>
                <li><b>确认问题</b><span>问题会成为本次核实记录的标题</span></li>
                <li><b>开始核实</b><span>结果出来后仍必须由你逐条判断</span></li>
              </ol>
            </div>
          ) : stage === "searching" ? (
            <div className="mxv-loading" role="status">
              <span><i />正在拆分搜索词、去重来源并生成可审阅快照…</span>
              {[0, 1, 2, 3].map((item) => (
                <div key={item}><i /><b /><em /></div>
              ))}
            </div>
          ) : (
            <div className="mxv-evidence-list">
              {filteredEvidence.map((item, index) => {
                const isOrigin = item.kind === "origin";
                const review = verdicts[item.id] || "pending";
                const expanded = activeEvidenceId === item.id;
                return (
                  <article key={item.id} className={`mxv-evidence${isOrigin ? " is-origin" : ` is-${review}`}${expanded ? " is-open" : ""}`}>
                    <button
                      type="button"
                      className="mxv-evidence-main"
                      aria-expanded={expanded}
                      onClick={() => setActiveEvidenceId(expanded ? "" : item.id)}
                    >
                      <span className="mxv-evidence-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="mxv-evidence-copy">
                        <span className="mxv-evidence-source">
                          <b>{EVIDENCE_KIND_LABEL[item.kind]}</b>
                          {item.sourceName} · {item.freshness} · 可靠度 {item.reliability}
                        </span>
                        <strong>{item.title}</strong>
                        <span>{item.snippet}</span>
                      </span>
                      <span className="mxv-evidence-open">{expanded ? "收起" : "阅读快照"}</span>
                    </button>
                    {expanded ? (
                      <div className="mxv-evidence-reader">
                        {item.content.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer">打开对应搜索页 ↗</a>
                      </div>
                    ) : null}
                    {isOrigin ? (
                      <div className="mxv-origin-locked"><span>✓</span>核实对象已锁定 · 不计入支持证据</div>
                    ) : (
                      <div className="mxv-review-actions" aria-label={`判断证据：${item.title}`}>
                        {(["accepted", "cautious", "excluded"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={stage !== "reviewing"}
                            className={review === value ? `is-on is-${value}` : ""}
                            aria-pressed={review === value}
                            onClick={() => reviewEvidence(item.id, value)}
                          >
                            <span aria-hidden>{value === "accepted" ? "✓" : value === "cautious" ? "?" : "×"}</span>
                            {REVIEW_LABEL[value]}
                          </button>
                        ))}
                      </div>
                    )}
                    {!isOrigin && review === "excluded" ? (
                      <fieldset className="mxv-exclude-reasons">
                        <legend>为什么排除？这会保留在审阅记录里</legend>
                        {EXCLUSION_REASONS.map((reason) => (
                          <label key={reason} className={exclusionReasons[item.id] === reason ? "is-on" : ""}>
                            <input
                              type="radio"
                              name={`exclude-${item.id}`}
                              checked={exclusionReasons[item.id] === reason}
                              disabled={stage !== "reviewing"}
                              onChange={() =>
                                setExclusionReasons((prev) => ({ ...prev, [item.id]: reason }))
                              }
                            />
                            <span>{reason}</span>
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                  </article>
                );
              })}
              {!filteredEvidence.length ? <div className="mxv-empty">这个筛选下暂时没有资料。</div> : null}
            </div>
          )}
        </section>

        <aside className="mxv-conclusion-pane">
          <section className="mxv-review-summary">
            <span>人工审阅进度</span>
            <strong>{reviewCount} / {reviewableCount || 4}</strong>
            <div>
              <em className="accepted">采纳 {acceptedCount}</em>
              <em className="cautious">保留 {cautiousCount}</em>
              <em className="excluded">排除 {excludedCount}</em>
            </div>
            <progress
              value={reviewCount}
              max={Math.max(reviewableCount, 1)}
              aria-label={`已人工判断 ${reviewCount} 条，共 ${reviewableCount || 4} 条`}
            />
          </section>

          {stage === "done" && savedRecord ? (
            <section className={`mxv-done tone-${savedRecord.verdict}`} role="status">
              <i>✓</i>
              <span>核实记录已保存到此浏览器</span>
              <h2>{VERDICT_LABEL[savedRecord.verdict]}</h2>
              <p>{savedRecord.conclusion}</p>
              <div>
                <button type="button" className="primary" onClick={onBack}>返回笔记查看记录</button>
                {savedRecord.createLogicBranch ? (
                  <button type="button" onClick={() => onOpenLogic(savedRecord)}>查看已生成的逻辑图</button>
                ) : null}
              </div>
            </section>
          ) : stage === "conclusion" ? (
            <section className="mxv-conclusion-editor">
              <span>结论草稿 · 最终由你确认</span>
              <h2>这条笔记现在应如何标记？</h2>
              <div className="mxv-verdicts" role="group" aria-label="核实结论">
                {(Object.keys(VERDICT_LABEL) as VerificationVerdict[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={conclusionVerdict === value ? "is-on" : ""}
                    aria-pressed={conclusionVerdict === value}
                    onClick={() => setConclusionVerdict(value)}
                  >
                    {VERDICT_LABEL[value]}
                  </button>
                ))}
              </div>
              <label>
                <span>核实结论</span>
                <textarea value={conclusion} rows={8} onChange={(event) => setConclusion(event.target.value)} />
              </label>
              <button type="button" className="mxv-regenerate" onClick={makeConclusion}>根据当前判断重写草稿</button>
              <button
                type="button"
                className="mxv-back-to-review"
                onClick={() => {
                  setConclusion("");
                  setStage("reviewing");
                }}
              >
                ← 返回调整证据判断
              </button>
              <fieldset className="mxv-targets">
                <legend>保存到哪里？</legend>
                <label>
                  <input type="checkbox" checked={appendToNote} onChange={(event) => setAppendToNote(event.target.checked)} />
                  <span><strong>追加到当前笔记</strong><small>保留原文，只新增一段核实记录</small></span>
                </label>
                <label>
                  <input type="checkbox" checked={createLogicBranch} onChange={(event) => setCreateLogicBranch(event.target.checked)} />
                  <span><strong>建立核实逻辑分支</strong><small>生成起点、证据、结论与下一步节点</small></span>
                </label>
              </fieldset>
              <button
                type="button"
                className="mxv-save primary"
                disabled={
                  saving ||
                  !conclusion.trim() ||
                  pendingCount > 0 ||
                  unexplainedExclusions > 0 ||
                  (!appendToNote && !createLogicBranch)
                }
                onClick={() => void saveRecord()}
              >
                {saving ? "正在保存核实记录…" : "确认结论并保存"}
              </button>
            </section>
          ) : stage === "defining" || stage === "searching" ? (
            <section className="mxv-conclusion-empty is-defining">
              <span>第一步 · 定义核实对象</span>
              <h2>{stage === "searching" ? "正在准备证据" : "先别急着下结论"}</h2>
              <p>
                {stage === "searching"
                  ? "正在按你选择的核实角度整理资料。结果出现后，需要逐条阅读并由你作出判断。"
                  : "确认左侧的问题足够具体、可判断。只有你主动点击“开始核实”，系统才会建立证据队列。"}
              </p>
            </section>
          ) : (
            <section className="mxv-conclusion-empty">
              <span>下一步 · 形成结论</span>
              <h2>不是搜到就算完成</h2>
              <p>请先逐条决定哪些资料可以采纳、哪些需要保留、哪些应该排除。排除资料时还要留下理由，核实过程才可追溯。</p>
              <button
                type="button"
                className="primary"
                disabled={pendingCount > 0 || unexplainedExclusions > 0}
                onClick={makeConclusion}
              >
                {pendingCount > 0
                  ? `还需判断 ${pendingCount} 条`
                  : unexplainedExclusions > 0
                    ? `还需说明 ${unexplainedExclusions} 条排除理由`
                    : "形成核实结论"}
              </button>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
