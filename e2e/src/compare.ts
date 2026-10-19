// 用法：pnpm --filter @mingxi/e2e compare --expected .artifacts/base-1,.artifacts/base-2,.artifacts/base-3 --actual .artifacts/candidate --out .artifacts/diff
// 逐步比较新版与原版（docs/00 B1）。--expected 给原版的多次捕获（建议 3 次以上，都在网络回放下得到）：
//
// 1. DOM 快照：新版必须与原版逐项完全相同（标签、class、文字、样式、位置尺寸、滚动位置）；原版多次捕获之间也必须相同，
//    否则说明捕获本身不确定，这次对比无效。
// 2. 像素：新版与任意一次原版捕获的差异 ≤ 容差即一致。容差 = max(基础阈值 0.1%, 原版多次捕获之间在这一步的最大差异)，
//    即“新版和原版的差别不超过原版和它自己的差别”。放宽的步骤在报告中逐一列出。
// 3. 请求：--forbid-requests 给出路径前缀（逗号分隔），新版在导览全程发出的页面与接口请求不得以这些前缀开头。
//    CI 对演示站传 /api/：演示站只读站内的剧本数据，不连后端（红线 4）。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { diffDomSnapshots, type DomDifference, type DomSnapshot } from "./dom-snapshot";
import { diffScreenshots, type PixelDiff } from "./pixel-diff";

interface StepsFile {
  total: number;
  network?: { misses: string[] };
  steps: {
    index: number;
    file: string;
    domFile: string;
    title: string;
    path: string;
    stable: boolean;
    requests: { method: string; path: string }[];
  }[];
}

interface Run {
  dir: string;
  steps: StepsFile;
}

const { values } = parseArgs({
  options: {
    expected: { type: "string" },
    actual: { type: "string" },
    out: { type: "string" },
    "max-ratio": { type: "string", default: "0.001" },
    "forbid-requests": { type: "string" },
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

async function loadRun(dir: string): Promise<Run> {
  return { dir, steps: JSON.parse(await readFile(join(dir, "steps.json"), "utf8")) as StepsFile };
}

function stepOf(run: Run, index: number) {
  return run.steps.steps.find((item) => item.index === index);
}

async function loadDom(run: Run, file: string): Promise<DomSnapshot> {
  return JSON.parse(await readFile(join(run.dir, file), "utf8")) as DomSnapshot;
}

const expectedRuns = await Promise.all(expectedDirs.map(loadRun));
const actual = await loadRun(actualDir);
const reference = expectedRuns[0];
if (!reference) throw new Error("至少需要一个原版捕获目录");

const failures: string[] = [];
for (const run of [...expectedRuns, actual]) {
  if (run.steps.total !== reference.steps.total) {
    failures.push(`导览步数不同：${reference.dir} ${reference.steps.total}，${run.dir} ${run.steps.total}`);
  }
  if (run.steps.network?.misses.length) {
    failures.push(`${run.dir} 不是在完整网络回放下捕获的（${run.steps.network.misses.length} 个请求未命中）`);
  }
}

const forbidden = (values["forbid-requests"] ?? "")
  .split(",")
  .map((prefix) => prefix.trim())
  .filter(Boolean);
for (const step of actual.steps.steps) {
  for (const request of step.requests) {
    if (forbidden.some((prefix) => request.path.startsWith(prefix))) {
      failures.push(`第 ${step.index + 1} 步：新版发出了不允许的请求 ${request.method} ${request.path}`);
    }
  }
}

const rows = [];
for (const counterpart of actual.steps.steps) {
  const step = stepOf(reference, counterpart.index);
  const label = `第 ${counterpart.index + 1} 步「${step?.title ?? counterpart.title}」`;
  if (!step) {
    failures.push(`${label}：原版缺少这一步`);
    continue;
  }

  // 原版各次捕获之间：像素最大差异（决定容差）与 DOM 是否一致（决定这次对比是否有效）。
  const expectedSteps = expectedRuns.map((run) => {
    const item = stepOf(run, counterpart.index);
    if (!item) throw new Error(`${run.dir} 缺少${label}`);
    return { run, item };
  });
  const expectedPngs = await Promise.all(
    expectedSteps.map(({ run, item }) => readFile(join(run.dir, item.file))),
  );
  let baselineSpread = 0;
  for (let i = 0; i < expectedPngs.length; i += 1) {
    for (let j = i + 1; j < expectedPngs.length; j += 1) {
      const a = expectedPngs[i];
      const b = expectedPngs[j];
      if (!a || !b) continue;
      baselineSpread = Math.max(baselineSpread, diffScreenshots(a, b).diffRatio);
    }
  }
  const referenceDom = await loadDom(reference, step.domFile);
  for (const { run, item } of expectedSteps.slice(1)) {
    if (diffDomSnapshots(referenceDom, await loadDom(run, item.domFile))) {
      failures.push(`${label}：原版多次捕获的 DOM 不一致（${run.dir}），捕获本身不确定，对比无效`);
    }
  }

  const actualPng = await readFile(join(actualDir, counterpart.file));
  const attempts: { run: string; result: PixelDiff }[] = expectedSteps.map(({ run }, i) => {
    const png = expectedPngs[i];
    if (!png) throw new Error(`${run.dir} 缺少截图`);
    return { run: run.dir, result: diffScreenshots(png, actualPng) };
  });
  const best = attempts.reduce((min, attempt) =>
    attempt.result.diffRatio < min.result.diffRatio ? attempt : min,
  );
  if (best.result.diffPng) {
    await writeFile(join(outDir, `diff-${counterpart.file}`), best.result.diffPng);
  }
  const tolerance = Math.max(maxRatio, baselineSpread);
  const domDifference: DomDifference | null = diffDomSnapshots(
    referenceDom,
    await loadDom(actual, counterpart.domFile),
  );
  const pixelPass = best.result.sameSize && best.result.diffRatio <= tolerance;
  const routePass = step.path === counterpart.path;
  const pass = pixelPass && routePass && !domDifference;
  if (!pixelPass) {
    failures.push(
      `${label}：像素最小差异 ${(best.result.diffRatio * 100).toFixed(3)}%（${best.result.diffPixels} 像素），容差 ${(tolerance * 100).toFixed(3)}%`,
    );
  }
  if (!routePass) failures.push(`${label}：路由不同 ${step.path} → ${counterpart.path}`);
  if (domDifference) {
    failures.push(
      `${label}：DOM 有 ${domDifference.differingNodes} 处不同（原版 ${domDifference.expectedCount} 个节点，新版 ${domDifference.actualCount} 个）`,
    );
  }
  rows.push({
    step: counterpart.index + 1,
    title: step.title,
    diffPixels: best.result.diffPixels,
    diffRatio: best.result.diffRatio,
    baselineSpread,
    tolerance,
    matchedRun: best.run,
    domDifference,
    pass,
    stable: counterpart.stable,
  });
}

await writeFile(
  join(outDir, "report.json"),
  JSON.stringify({ maxRatio, expectedDirs, actualDir, failures, rows }, null, 2),
);
for (const row of rows) {
  const widened =
    row.tolerance > maxRatio ? `  （原版自身差异 ${(row.baselineSpread * 100).toFixed(3)}%，按此放宽）` : "";
  const dom = row.domDifference ? `  DOM ${row.domDifference.differingNodes} 处不同` : "";
  process.stdout.write(
    `${row.pass ? "✓" : "✗"} ${String(row.step).padStart(2)}  ${(row.diffRatio * 100).toFixed(3)}%  ${row.title}${dom}${widened}\n`,
  );
}
if (failures.length) {
  process.stderr.write(`\n视觉回归未通过：\n${failures.map((item) => `  - ${item}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`\n视觉回归通过：${rows.length} 步全部一致\n`);
