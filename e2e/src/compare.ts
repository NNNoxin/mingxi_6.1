// 用法：pnpm --filter @mingxi/e2e compare -- --expected .artifacts/baseline-a,.artifacts/baseline-b --actual .artifacts/candidate --out .artifacts/diff
// 逐步比较新版截图与原版截图。--expected 可以给多次原版捕获：原版个别步骤自身存在渲染波动时，
// 新版与任意一次原版捕获的差异不超过阈值（默认 0.1%，见 docs/00 B1）即视为一致，并在报告中标注该步原版不稳定。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { diffScreenshots, type PixelDiff } from "./pixel-diff";

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
  process.stderr.write("需要 --expected（可逗号分隔多个）、--actual、--out\n");
  process.exit(2);
}
const maxRatio = Number(values["max-ratio"]);
const expectedDirs = values.expected.split(",").map((dir) => resolve(dir.trim()));
const actualDir = resolve(values.actual);
const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

async function loadSteps(dir: string): Promise<StepsFile> {
  return JSON.parse(await readFile(join(dir, "steps.json"), "utf8")) as StepsFile;
}

const expectedRuns = await Promise.all(
  expectedDirs.map(async (dir) => ({ dir, steps: await loadSteps(dir) })),
);
const actual = await loadSteps(actualDir);
const reference = expectedRuns[0];
if (!reference) throw new Error("至少需要一个原版捕获目录");

const failures: string[] = [];
for (const run of expectedRuns) {
  if (run.steps.total !== actual.total) {
    failures.push(`导览步数不同：原版（${run.dir}）${run.steps.total}，新版 ${actual.total}`);
  }
}

const rows = [];
for (const counterpart of actual.steps) {
  const step = reference.steps.steps.find((item) => item.index === counterpart.index);
  if (!step) {
    failures.push(`第 ${counterpart.index + 1} 步：原版缺少截图`);
    continue;
  }
  const actualPng = await readFile(join(actualDir, counterpart.file));
  const attempts: { run: string; result: PixelDiff }[] = [];
  for (const run of expectedRuns) {
    const expectedStep = run.steps.steps.find((item) => item.index === counterpart.index);
    if (!expectedStep) continue;
    const expectedPng = await readFile(join(run.dir, expectedStep.file));
    attempts.push({ run: run.dir, result: diffScreenshots(expectedPng, actualPng) });
  }
  // 原版多次捕获之间是否完全一致：不一致说明这一步原版自身存在渲染波动。
  const baselineSelfConsistent =
    expectedRuns.length < 2 ||
    attempts.every((attempt) => attempt.result.diffPixels === attempts[0]?.result.diffPixels);
  const best = attempts.reduce((min, attempt) =>
    attempt.result.diffRatio < min.result.diffRatio ? attempt : min,
  );
  if (best.result.diffPng) await writeFile(join(outDir, `diff-${counterpart.file}`), best.result.diffPng);
  const pass = best.result.sameSize && best.result.diffRatio <= maxRatio && step.path === counterpart.path;
  if (!pass) {
    failures.push(
      `第 ${counterpart.index + 1} 步「${step.title}」：最小差异 ${(best.result.diffRatio * 100).toFixed(3)}%（${best.result.diffPixels} 像素）` +
        (step.path === counterpart.path ? "" : `；路由不同 ${step.path} → ${counterpart.path}`),
    );
  }
  rows.push({
    step: counterpart.index + 1,
    title: step.title,
    diffPixels: best.result.diffPixels,
    diffRatio: best.result.diffRatio,
    matchedRun: best.run,
    baselineSelfConsistent,
    pass,
    stable: counterpart.stable,
  });
}

await writeFile(
  join(outDir, "report.json"),
  JSON.stringify({ maxRatio, expectedDirs, failures, rows }, null, 2),
);
for (const row of rows) {
  process.stdout.write(
    `${row.pass ? "✓" : "✗"} ${String(row.step).padStart(2)}  ${(row.diffRatio * 100).toFixed(3)}%  ${row.title}${row.baselineSelfConsistent ? "" : "  （原版此步自身有渲染波动）"}\n`,
  );
}
if (failures.length) {
  process.stderr.write(`\n视觉回归未通过：\n${failures.map((item) => `  - ${item}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`\n视觉回归通过：${rows.length} 步全部一致\n`);
