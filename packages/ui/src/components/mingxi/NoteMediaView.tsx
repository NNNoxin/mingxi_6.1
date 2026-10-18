"use client";

import { useEffect, useRef, useState } from "react";
import {
  isPlaceholderPreview,
  type LibraryNoteMediaFields,
  type NoteMedia,
} from "../../lib/mingxi/web/note-media";
import { MarkdownView } from "./MarkdownView";

type NoteLike = LibraryNoteMediaFields & { id?: string };

function resolveMedia(note: NoteLike): NoteMedia | null {
  if (note.media?.kind) return note.media;
  if (note.imageUrl) {
    return { kind: "image", url: note.imageUrl, downloadUrl: note.imageUrl, label: note.title };
  }
  if (note.sourceUri?.startsWith("http")) {
    return { kind: "link", url: note.sourceUri, downloadUrl: note.sourceUri, label: note.sourceUri };
  }
  return null;
}

function kindLabel(kind: NoteMedia["kind"]) {
  switch (kind) {
    case "image":
      return "图片";
    case "pdf":
      return "PDF";
    case "pptx":
      return "PPT";
    case "docx":
      return "Word";
    case "html":
      return "HTML 快照";
    case "markdown":
      return "Markdown";
    case "text":
      return "文本快照";
    case "link":
      return "网页链接";
    default:
      return "附件";
  }
}

/** 按桌面页宽等比缩放到预览窗，尽量多看页面信息 */
function ScaledWebFrame({
  src,
  title,
  sandbox,
}: {
  src: string;
  title: string;
  sandbox?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.42);
  const PAGE_W = 1280;
  const PAGE_H = 900;

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || PAGE_W;
      // 略小于 1:1，让侧栏里能看到约一整屏信息
      setScale(Math.max(0.28, Math.min(0.92, w / PAGE_W)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={shellRef}
      className="mwb-media-scale-shell"
      style={{ height: Math.round(PAGE_H * scale) }}
    >
      <iframe
        className="mwb-media-scale-frame"
        title={title}
        src={src}
        sandbox={sandbox}
        referrerPolicy="no-referrer"
        style={{
          width: PAGE_W,
          height: PAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

function SnapshotText({ url }: { url: string }) {
  const [result, setResult] = useState<{
    url: string;
    text: string;
    err: boolean;
  }>({ url: "", text: "", err: false });

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setResult({ url, text: t, err: false });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ url, text: "快照加载失败", err: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const loading = result.url !== url;
  const text = loading ? "加载快照…" : result.text;
  const err = !loading && result.err;

  return (
    <div className={`mwb-media-snapshot${err ? " is-err" : ""}`} tabIndex={0}>
      {err ? text : <MarkdownView content={text} />}
    </div>
  );
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mwb-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="mwb-lightbox-close" onClick={onClose} aria-label="关闭">
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function NoteMediaView({
  note,
  compact = false,
}: {
  note: NoteLike;
  compact?: boolean;
}) {
  const media = resolveMedia(note);
  const [open, setOpen] = useState(false);
  const [frameFailed, setFrameFailed] = useState(false);

  if (!media) {
    if (!note.preview || isPlaceholderPreview(note.preview, note)) return null;
    return (
      <div className={`mwb-media${compact ? " is-compact" : ""}`}>
        <div className="mwb-media-subhead">正文摘录</div>
        <div className="mwb-doc-body">
          <MarkdownView content={note.preview} />
        </div>
      </div>
    );
  }

  const showPreviewText =
    note.preview && !isPlaceholderPreview(note.preview, { ...note, media });

  return (
    <div className={`mwb-media${compact ? " is-compact" : ""}`}>
      <div className="mwb-media-head">
        <strong>{kindLabel(media.kind)}</strong>
        {media.label ? <span>{media.label}</span> : null}
        {media.downloadUrl ? (
          <a href={media.downloadUrl} target="_blank" rel="noreferrer" className="mwb-media-dl">
            打开 / 下载
          </a>
        ) : null}
      </div>

      {media.kind === "image" && media.url ? (
        <button
          type="button"
          className="mwb-media-image-btn"
          onClick={() => setOpen(true)}
          title="点击放大"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mwb-media-image" src={media.url} alt={media.caption || note.title} />
        </button>
      ) : null}

      {media.kind === "pdf" && media.url && !frameFailed ? (
        <iframe
          className="mwb-media-frame"
          title={note.title}
          src={media.url}
          onError={() => setFrameFailed(true)}
        />
      ) : null}

      {media.kind === "html" && media.url && !frameFailed ? (
        <ScaledWebFrame
          src={media.url}
          title={note.title}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      ) : null}

      {media.kind === "link" && media.url && !frameFailed ? (
        <div className="mwb-media-link-wrap">
          <ScaledWebFrame
            src={media.url}
            title={note.title}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
          <p className="mwb-media-link-hint">
            预览为桌面页等比缩小；若外站禁止嵌入，请用右上角「打开 / 下载」。
          </p>
        </div>
      ) : null}

      {(media.kind === "pptx" || media.kind === "docx" || media.kind === "unknown") && (
        <div className="mwb-media-filecard">
          <div>
            <strong>{kindLabel(media.kind)} 文件</strong>
            <p>{media.label || note.title}</p>
            <p className="mwb-media-filecard-tip">
              浏览器无法原生渲染 Office 文件；下方展示抽取快照（如有），原文件可下载。
            </p>
          </div>
        </div>
      )}

      {(media.kind === "markdown" || media.kind === "text") &&
      (media.url || media.snapshotUrl) ? (
        <SnapshotText url={(media.url || media.snapshotUrl)!} />
      ) : null}

      {media.snapshotUrl &&
      media.kind !== "markdown" &&
      media.kind !== "text" ? (
        <>
          <div className="mwb-media-subhead">文字快照</div>
          <SnapshotText url={media.snapshotUrl} />
        </>
      ) : null}

      {media.caption ? <p className="mwb-media-caption">{media.caption}</p> : null}

      {showPreviewText && !media.snapshotUrl && media.kind !== "markdown" && media.kind !== "text" ? (
        <>
          <div className="mwb-media-subhead">正文摘录</div>
          <div className="mwb-doc-body">
            <MarkdownView content={note.preview} />
          </div>
        </>
      ) : null}

      {!media.url && !media.snapshotUrl && showPreviewText ? (
        <div className="mwb-doc-body">
          <MarkdownView content={note.preview} />
        </div>
      ) : null}

      {open && media.url && media.kind === "image" ? (
        <Lightbox src={media.url} alt={note.title} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}
