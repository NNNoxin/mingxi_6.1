"use client";

import type { ReactNode } from "react";

type CiteHandler = (token: string) => ReactNode;

/** 极轻量 Markdown → React（标题/加粗/斜体/代码/列表/引用/链接/段落） */
export function MarkdownView({
  content,
  className,
  renderCite,
}: {
  content: string;
  className?: string;
  /** 把 [cite:id] / [#n] 渲染成自定义节点 */
  renderCite?: CiteHandler;
}) {
  const text = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const blocks = splitBlocks(text);
  return (
    <div className={`mwb-md${className ? ` ${className}` : ""}`}>
      {blocks.map((b, i) => renderBlock(b, i, renderCite))}
    </div>
  );
}

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "hr" };

function splitBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, "").trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      out.push({ type: "hr" });
      i += 1;
      continue;
    }

    const hm = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (hm) {
      out.push({ type: "h", level: hm[1].length, text: hm[2].trim() });
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push({ type: "quote", lines: buf });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      out.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      out.push({ type: "ol", items });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push({ type: "p", text: buf.join("\n") });
  }

  return out;
}

function renderBlock(b: Block, key: number, renderCite?: CiteHandler) {
  switch (b.type) {
    case "h": {
      const level = Math.min(6, Math.max(1, b.level));
      const children = inline(b.text, renderCite);
      const cls = `mwb-md-h mwb-md-h${level}`;
      if (level === 1) return <h1 key={key} className={cls}>{children}</h1>;
      if (level === 2) return <h2 key={key} className={cls}>{children}</h2>;
      if (level === 3) return <h3 key={key} className={cls}>{children}</h3>;
      if (level === 4) return <h4 key={key} className={cls}>{children}</h4>;
      if (level === 5) return <h5 key={key} className={cls}>{children}</h5>;
      return <h6 key={key} className={cls}>{children}</h6>;
    }
    case "p":
      return (
        <p key={key} className="mwb-md-p">
          {inline(b.text, renderCite)}
        </p>
      );
    case "ul":
      return (
        <ul key={key} className="mwb-md-ul">
          {b.items.map((it, j) => (
            <li key={j}>{inline(it, renderCite)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="mwb-md-ol">
          {b.items.map((it, j) => (
            <li key={j}>{inline(it, renderCite)}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={key} className="mwb-md-quote">
          {b.lines.map((ln, j) => (
            <p key={j}>{inline(ln, renderCite)}</p>
          ))}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} className="mwb-md-code">
          <code>{b.text}</code>
        </pre>
      );
    case "hr":
      return <hr key={key} className="mwb-md-hr" />;
    default:
      return null;
  }
}

function inline(text: string, renderCite?: CiteHandler): ReactNode[] {
  // 先拆 cite token，再对普通段做强调/代码/链接
  const chunks = text.split(/(\[cite:[^\]]+\]|\[#\d+\])/g);
  const out: ReactNode[] = [];
  chunks.forEach((chunk, i) => {
    if (!chunk) return;
    if (/^\[cite:[^\]]+\]$/.test(chunk) || /^\[#\d+\]$/.test(chunk)) {
      out.push(renderCite ? <span key={`c${i}`}>{renderCite(chunk)}</span> : <span key={`c${i}`}>{chunk}</span>);
      return;
    }
    out.push(...inlineDecor(chunk, `t${i}`));
  });
  return out;
}

function inlineDecor(text: string, keyPrefix: string): ReactNode[] {
  const re =
    /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+?`|\*[^*\n]+?\*|_[^_\n]+?_|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(re);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (/^\*\*[^*]+?\*\*$/.test(part) || /^__[^_]+?__$/.test(part)) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+?\*$/.test(part) || /^_[^_]+?_$/.test(part)) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (/^`[^`]+?`$/.test(part)) {
      return (
        <code key={key} className="mwb-md-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={key} className="mwb-md-img" src={img[2]} alt={img[1]} />
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="mwb-md-a">
          {link[1]}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}
