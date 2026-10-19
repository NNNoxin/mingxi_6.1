import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function decodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/**
 * web 角色：托管正式站的静态构建产物（apps/web 的 next build 输出），与 /api 同源（docs/02 §2.3、§8）。
 * 解析规则与静态托管一致：/a/b 依次找 a/b、a/b.html、a/b/index.html，找不到返回 404.html；/api/* 不经过这里。
 * 带内容哈希的 /_next/static/* 长期缓存，其余（HTML 等）每次向服务器确认。
 */
export function staticSite(rootDir: string): MiddlewareHandler<AppEnv> {
  const root = `${resolve(rootDir)}${sep}`;
  const notFoundPage = join(root, "404.html");
  // 目录配错时启动即失败，而不是上线后每个页面都坏掉。
  if (!existsSync(notFoundPage)) {
    throw new Error(
      `MINGXI_WEB_ROOT=${rootDir} 不是正式站的构建产物（缺少 404.html），先运行 apps/web 的 build`,
    );
  }

  async function resolveFile(pathname: string): Promise<string | null> {
    const decoded = decodePath(pathname);
    if (decoded === null) return null;
    const base = join(root, normalize(decoded).replace(/^[/\\]+/, ""));
    // 拒绝跳出产物目录的路径（例如 /../x）。
    if (!base.startsWith(root)) return null;
    for (const candidate of [base, `${base}.html`, join(base, "index.html")]) {
      if (await isFile(candidate)) return candidate;
    }
    return null;
  }

  return async (c, next) => {
    const { pathname } = new URL(c.req.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      await next();
      return;
    }
    const file = await resolveFile(pathname);
    const path = file ?? notFoundPage;
    c.header("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
    c.header(
      "Cache-Control",
      file && pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
    );
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    return c.body(body, file ? 200 : 404);
  };
}
