// 一次性导入：把明晰 demo 5 基准提交（81f92d7）的路由文件与 public 静态资源原样复制进 apps/demo。
// 路由文件唯一的自动改动是把 "@/..." 别名导入改写为 "@mingxi/ui/..."、"./globals.css" 改为界面包里的同一文件
// （docs/02 §1.4 第 1 类）；其余改动手工完成并登记在 apps/demo/BASELINE.md。
// 用法：pnpm --filter @mingxi/demo exec tsx scripts/import-baseline.ts <基准仓库目录>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_COMMIT = "81f92d7";
const baselineRoot = resolve(process.argv[2] ?? "");
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const head = execFileSync("git", ["-C", baselineRoot, "rev-parse", "--short=7", "HEAD"]).toString().trim();
if (head !== BASELINE_COMMIT) {
  throw new Error(`基准仓库必须检出在 ${BASELINE_COMMIT}，当前是 ${head}`);
}
const dirty = execFileSync("git", ["-C", baselineRoot, "status", "--porcelain"]).toString().trim();
if (dirty) throw new Error(`基准仓库有未提交改动，不能作为导入来源：\n${dirty}`);

/** 产品导览经过的三个路由（/demo、/demo/phone、/mingxi/web）、根布局与根路由（跳转到 /demo）。 */
const ROUTE_FILES = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/demo/page.tsx",
  "app/demo/phone/page.tsx",
  "app/mingxi/web/page.tsx",
  "app/mingxi/web/MingxiWebClient.tsx",
];

const IMPORT_PATTERN = /(from\s+|import\s*\(\s*|import\s+)(["'])(@\/[^"']+|\.\/globals\.css)\2/g;

function rewriteImports(source: string): { text: string; count: number } {
  let count = 0;
  const text = source.replace(IMPORT_PATTERN, (_match, prefix: string, quote: string, spec: string) => {
    count += 1;
    const target = spec === "./globals.css" ? "@mingxi/ui/styles/globals.css" : `@mingxi/ui/${spec.slice(2)}`;
    return `${prefix}${quote}${target}${quote}`;
  });
  return { text, count };
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    }),
  );
  return files.flat().sort();
}

const routes: { file: string; sourceSha256: string; importRewrites: number }[] = [];
for (const file of ROUTE_FILES) {
  const source = await readFile(join(baselineRoot, file), "utf8");
  const { text, count } = rewriteImports(source);
  const target = join(appRoot, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
  routes.push({ file, sourceSha256: sha256(source), importRewrites: count });
}

const publicRoot = join(baselineRoot, "public");
const publicFiles: { file: string; sha256: string }[] = [];
for (const path of await listFiles(publicRoot)) {
  const file = relative(publicRoot, path);
  const target = join(appRoot, "public", file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(path, target);
  publicFiles.push({ file, sha256: sha256(await readFile(path)) });
}

const manifest = { baseline: BASELINE_COMMIT, routes, public: publicFiles };
await writeFile(join(appRoot, "baseline-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const rewrites = routes.reduce((total, route) => total + route.importRewrites, 0);
process.stdout.write(
  `路由文件 ${String(routes.length)} 个（导入改写 ${String(rewrites)} 处），静态资源 ${String(publicFiles.length)} 个\n`,
);
