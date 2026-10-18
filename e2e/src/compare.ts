// 用法：pnpm --filter @mingxi/e2e compare -- --expected .artifacts/baseline --actual .artifacts/candidate --out .artifacts/diff
// 逐步比较两次导览截图；任何一步差异比例超过阈值（默认 0.1%，见 docs/00 B1）即以非零码退出。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { diffScreenshots } from "./pixel-diff";

interface StepsFile {
  total: number;
  steps: { index: number; file: string; title: string; path: string; stable: boolean }[];
}

const { values } = parseArgs({
  options: {
    expected: { type: "string" },
    actual: { type: "string" },
    out: { type: "string" },
    "max-ratio": { type: "string", default: "0.001" },
  },
  allowPositionals: true,
});
if (!values.expected || !values.actual || !values.out) {
  process.stderr.write("需要 --expected、--actual、--out 三个目录\n");
  process.exit(2);
}
const maxRatio = Number(values["max-ratio"]);
const expectedDir = resolve(values.expected);
const actualDir = resolve(values.actual);
const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

const expected = JSON.parse(await readFile(join(expectedDir, "steps.json"), "utf8")) as StepsFile;
const actual = JSON.parse(await readFile(join(actualDir, "steps.json"), "utf8")) as StepsFile;

const failures: string[] = [];
if (expected.total !== actual.total)
  failures.push(`导览步数不同：原版 ${expected.total}，新版 ${actual.total}`);

const rows = [];
for (const step of expected.steps) {
  const counterpart = actual.steps.find((item) => item.index === step.index);
  if (!counterpart) {
    failures.push(`第 ${step.index + 1} 步：新版缺少截图`);
    continue;
  }
  const result = diffScreenshots(
    await readFile(join(expectedDir, step.file)),
    await readFile(join(actualDir, counterpart.file)),
  );
  if (result.diffPng) await writeFile(join(outDir, `diff-${step.file}`), result.diffPng);
  const pass = result.sameSize && result.diffRatio <= maxRatio && step.path === counterpart.path;
  if (!pass) {
    failures.push(
      `第 ${step.index + 1} 步「${step.title}」：差异 ${(result.diffRatio * 100).toFixed(3)}%（${result.diffPixels} 像素）` +
        (step.path === counterpart.path ? "" : `；路由不同 ${step.path} → ${counterpart.path}`),
    );
  }
  rows.push({
    step: step.index + 1,
    title: step.title,
    diffPixels: result.diffPixels,
    diffRatio: result.diffRatio,
    pass,
    stable: [step.stable, counterpart.stable],
  });
}

await writeFile(join(outDir, "report.json"), JSON.stringify({ maxRatio, failures, rows }, null, 2));
for (const row of rows) {
  process.stdout.write(
    `${row.pass ? "✓" : "✗"} ${String(row.step).padStart(2)}  ${(row.diffRatio * 100).toFixed(3)}%  ${row.title}\n`,
  );
}
if (failures.length) {
  process.stderr.write(`\n视觉回归未通过：\n${failures.map((item) => `  - ${item}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`\n视觉回归通过：${rows.length} 步全部一致\n`);
