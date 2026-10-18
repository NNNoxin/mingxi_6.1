/** 客户端安全：笔记媒体类型与占位预览判断（无 node:fs） */

export type MediaKind =
  | "image"
  | "pdf"
  | "pptx"
  | "docx"
  | "html"
  | "markdown"
  | "text"
  | "link"
  | "unknown";

export interface NoteMedia {
  kind: MediaKind;
  url?: string | null;
  downloadUrl?: string | null;
  snapshotUrl?: string | null;
  label?: string;
  caption?: string;
}

export interface LibraryNoteMediaFields {
  title: string;
  preview: string;
  modality?: string;
  imageUrl?: string | null;
  sourceUri?: string;
  media?: NoteMedia | null;
}

export function mediaKindFromPath(pathOrUrl: string): MediaKind {
  const clean = pathOrUrl.split("?")[0].split("#")[0].toLowerCase();
  const m = clean.match(/\.([a-z0-9]+)$/);
  const ext = m ? `.${m[1]}` : "";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"].includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (ext === ".pptx" || ext === ".ppt") return "pptx";
  if (ext === ".docx" || ext === ".doc") return "docx";
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if ([".txt", ".csv", ".tsv", ".json", ".xml"].includes(ext)) return "text";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return "link";
  return "unknown";
}

export function isPlaceholderPreview(preview: string, note?: LibraryNoteMediaFields): boolean {
  const t = preview.trim();
  if (!t) return true;
  if (/^(Obsidian 图片|链接索引|文件过大未全文抽取)[：:].+/i.test(t)) return true;
  if (note?.media?.kind === "image" && t.length < 80 && /\.(png|jpe?g|webp|gif)\s*$/i.test(t)) {
    return true;
  }
  return false;
}
