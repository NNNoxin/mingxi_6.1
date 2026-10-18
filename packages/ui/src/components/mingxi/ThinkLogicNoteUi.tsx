"use client";

import { useEffect, useRef } from "react";
import {
  DEMO_NOTES_BY_ID,
  type DemoNoteCard,
} from "../../lib/mingxi/web/think-demo-notes";
import type { DemoNode } from "../../lib/mingxi/web/think-replay-types";

const CITE_RE = /\{\{cite:([a-z0-9-]+)\}\}/gi;

export function parseCiteSegments(text: string): Array<
  { type: "text"; text: string } | { type: "cite"; noteId: string; note?: DemoNoteCard }
> {
  const out: Array<
    { type: "text"; text: string } | { type: "cite"; noteId: string; note?: DemoNoteCard }
  > = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CITE_RE.source, "gi");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    const noteId = m[1];
    out.push({ type: "cite", noteId, note: DEMO_NOTES_BY_ID[noteId] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

function toneClass(tone: DemoNoteCard["thumbTone"]) {
  return `tone-${tone}`;
}

export function NoteHoverCard({
  note,
  x,
  y,
}: {
  note: DemoNoteCard;
  x: number;
  y: number;
}) {
  return (
    <div
      className="tld-cite-pop"
      style={{ left: Math.min(x, typeof window !== "undefined" ? window.innerWidth - 300 : x), top: y }}
      role="tooltip"
    >
      <div className={`tld-cite-pop-thumb ${toneClass(note.thumbTone)}`}>
        <span>{note.thumbLabel}</span>
        <em>{note.yearHint}</em>
      </div>
      <div className="tld-cite-pop-body">
        <header>
          <b>笔记</b>
          <span>{note.domainPath.slice(-1)[0]}</span>
        </header>
        <strong>{note.title}</strong>
        <p>{note.summary}</p>
        <footer>
          {note.fragments.length} 相关片段 · {note.purposeLabel}
        </footer>
      </div>
    </div>
  );
}

export function RichAssistantText({
  text,
  activeNoteId,
  onCiteHover,
  onCiteLeave,
  onCiteClick,
}: {
  text: string;
  activeNoteId?: string | null;
  onCiteHover: (note: DemoNoteCard, clientX: number, clientY: number) => void;
  onCiteLeave: () => void;
  onCiteClick: (note: DemoNoteCard) => void;
}) {
  const parts = parseCiteSegments(text);
  return (
    <div className="tld-rich">
      {parts.map((p, i) => {
        if (p.type === "text") {
          return (
            <span key={i} className="tld-rich-text">
              {p.text.split("\n").map((line, j, arr) => (
                <span key={j}>
                  {line.startsWith("**") && line.endsWith("**") ? (
                    <strong>{line.slice(2, -2)}</strong>
                  ) : (
                    formatInlineBold(line)
                  )}
                  {j < arr.length - 1 ? <br /> : null}
                </span>
              ))}
            </span>
          );
        }
        const label = p.note?.thumbLabel || "笔记";
        const isOn = Boolean(activeNoteId && p.noteId === activeNoteId);
        return (
          <button
            key={i}
            type="button"
            className={`tld-cite${isOn ? " is-on" : ""}`}
            title={
              isOn
                ? `再次点击关闭「${p.note?.title || p.noteId}」`
                : p.note?.title || p.noteId
            }
            onMouseEnter={(e) => {
              if (p.note) onCiteHover(p.note, e.clientX, e.clientY);
            }}
            onMouseMove={(e) => {
              if (p.note) onCiteHover(p.note, e.clientX, e.clientY);
            }}
            onMouseLeave={onCiteLeave}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (p.note) onCiteClick(p.note);
            }}
          >
            <i aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function formatInlineBold(line: string) {
  const bits = line.split(/(\*\*[^*]+\*\*)/g);
  return bits.map((b, i) => {
    if (b.startsWith("**") && b.endsWith("**")) {
      return <strong key={i}>{b.slice(2, -2)}</strong>;
    }
    return <span key={i}>{b}</span>;
  });
}

export function NoteDetailDrawer({
  note,
  open,
  onClose,
}: {
  note: DemoNoteCard | null;
  open: boolean;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const ready = open && Boolean(note);

  useEffect(() => {
    if (!open || !note) return;
    const t = window.setTimeout(() => {
      const el = bodyRef.current?.querySelector("mark, figure[data-frag]");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 280);
    return () => window.clearTimeout(t);
  }, [open, note]);

  return (
    <div
      className={`tld-note-drawer${open && note ? " is-open" : ""}`}
      aria-hidden={!open}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {note ? (
        <>
          <header className="tld-note-drawer-head">
            <div>
              <em className="tld-note-crumb">
                {note.domainPath.join(" / ") || "未分类"} · {note.purposeLabel}
              </em>
              <h2>{note.title}</h2>
              {note.sourceTitle && note.sourceTitle !== note.title ? (
                <span className="tld-note-src">原文件 · {note.sourceTitle}</span>
              ) : null}
            </div>
            <button type="button" className="tld-btn ghost sm" onClick={onClose}>
              收起
            </button>
          </header>
          <div className="tld-note-props">
            <div>
              <span>时期</span>
              <strong>{note.yearHint}</strong>
            </div>
            <div>
              <span>tags</span>
              <div className="tld-note-prop-tags">
                <em>{note.purposeLabel}</em>
                <em>{note.polarity}</em>
                {note.domainPath.map((t) => (
                  <em key={t}>{t}</em>
                ))}
              </div>
            </div>
          </div>
          <div className="tld-note-drawer-meta">
            <span>当前对话相关片段已标黄</span>
            <span>{note.fragments.length} 处命中 · 移入左侧对话区自动收起</span>
          </div>
          <div
            ref={bodyRef}
            className={`tld-note-drawer-body${ready ? " is-ready" : ""}`}
            dangerouslySetInnerHTML={{
              __html: note.bodyHtml + (note.figureHtml || ""),
            }}
          />
          <aside className="tld-note-frags">
            <strong>命中片段</strong>
            <ul>
              {note.fragments.map((f) => (
                <li key={f.id}>
                  <b>{f.kind === "image" ? "图" : "文"}</b>
                  <span>{f.excerpt}</span>
                  <em>{f.relevance}</em>
                </li>
              ))}
            </ul>
          </aside>
        </>
      ) : null}
    </div>
  );
}

export function WebDetailDrawer({
  node,
  open,
  onClose,
}: {
  node: DemoNode | null;
  open: boolean;
  onClose: () => void;
}) {
  const ready = open && Boolean(node);
  if (!node) {
    return <aside className="tld-web-drawer" aria-hidden="true" />;
  }
  let hostname = "公开网页";
  if (node.sourceUrl) {
    try {
      hostname = new URL(node.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      hostname = "公开网页";
    }
  }
  return (
    <aside
      className={`tld-web-drawer${ready ? " is-open" : ""}`}
      aria-hidden={!open}
      aria-label="网页来源详情"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="tld-web-drawer-head">
        <div>
          <em>WEB SOURCE · PUBLIC PAGE</em>
          <h2>{node.sourceTitle || node.label}</h2>
          <span>{hostname}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭网页详情">×</button>
      </header>
      <div className="tld-web-drawer-body">
        <div className="tld-web-source-badge"><i aria-hidden />联网搜索结果</div>
        <h3>{node.label}</h3>
        <p className="tld-web-summary">
          {node.sourceSummary || node.sub || "该网页被作为本次梳理的外部证据接入逻辑图。"}
        </p>
        {node.sourceTags?.length ? (
          <div className="tld-web-tags">
            {node.sourceTags.map((tag) => <span key={tag}>{tag.replace(/^source:/, "")}</span>)}
          </div>
        ) : null}
        <section className="tld-web-explain">
          <span>在本次逻辑图中的作用</span>
          <p>{node.sub || "外部网页证据 · 与本库笔记分色显示"}</p>
        </section>
        {node.sourceUrl ? (
          <a
            className="tld-web-open-link"
            href={node.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            打开原网页 <span aria-hidden>↗</span>
          </a>
        ) : (
          <p className="tld-web-no-url">本结果没有可打开的原始 URL，仅保留搜索摘要。</p>
        )}
      </div>
    </aside>
  );
}
