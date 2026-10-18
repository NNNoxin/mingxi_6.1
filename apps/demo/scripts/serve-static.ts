// 本地预览与视觉回归用的静态服务器：伺服 next build 导出的 out/。
// 规则与线上静态托管一致：/a/b 依次找 out/a/b、out/a/b.html、out/a/b/index.html；找不到返回 out/404.html。
// 用法：pnpm --filter @mingxi/demo serve [端口，默认 4400]
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const port = Number(process.argv[2] ?? 4400);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".webmanifest": "application/manifest+json",
};

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function resolveFile(pathname: string): Promise<string | null> {
  const relativePath = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const base = join(root, relativePath);
  // 拒绝跳出 out/ 的路径（例如 /../x）。
  if (!base.startsWith(root) && `${base}${sep}` !== root) return null;
  for (const candidate of [base, `${base}.html`, join(base, "index.html")]) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

createServer((request, response) => {
  void (async () => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const file = await resolveFile(pathname);
    const path = file ?? join(root, "404.html");
    response.writeHead(file ? 200 : 404, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    });
    createReadStream(path).pipe(response);
  })().catch((error: unknown) => {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(String(error));
  });
}).listen(port, () => {
  process.stdout.write(`演示站静态预览：http://localhost:${String(port)}/demo\n`);
});
