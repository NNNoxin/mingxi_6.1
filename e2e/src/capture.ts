// 用法：pnpm --filter @mingxi/e2e capture -- --base http://localhost:4317 --out .artifacts/baseline
// 遍历 40 步产品导览，输出每一步的截图（step-XX.png）与 steps.json（标题、路由、是否稳定、期间的请求）。
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { CHROMIUM_ARGS, newDeterministicContext } from "./environment";
import { walkTour, type TourStepCapture } from "./tour";

const { values } = parseArgs({
  options: { base: { type: "string" }, out: { type: "string" }, only: { type: "string" } },
  allowPositionals: true,
});
if (!values.base || !values.out) {
  process.stderr.write("需要 --base <应用地址> 与 --out <输出目录>\n");
  process.exit(2);
}
const baseUrl = values.base.replace(/\/$/, "");
const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

// --only 38,39 只截这些步骤（排查用）；不传则截全部。
const onlySteps = values.only
  ? new Set(values.only.split(",").map((item) => Number(item.trim())))
  : undefined;

const browser = await chromium.launch({ args: [...CHROMIUM_ARGS] });
try {
  const context = await newDeterministicContext(browser);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const steps: (Omit<TourStepCapture, "png"> & { file: string })[] = [];
  const total = await walkTour(
    page,
    baseUrl,
    async (capture) => {
      const file = `step-${String(capture.index + 1).padStart(2, "0")}.png`;
      await writeFile(join(outDir, file), capture.png);
      steps.push({
        index: capture.index,
        kicker: capture.kicker,
        title: capture.title,
        path: capture.path,
        stable: capture.stable,
        requests: capture.requests,
        file,
      });
      process.stdout.write(
        `${capture.kicker}  ${capture.stable ? "稳定" : "未稳定"}  ${capture.path}  ${capture.title}\n`,
      );
    },
    onlySteps,
  );
  await writeFile(
    join(outDir, "steps.json"),
    JSON.stringify({ baseUrl, total, capturedAt: new Date().toISOString(), pageErrors, steps }, null, 2),
  );
  process.stdout.write(`完成：${total} 步，输出到 ${outDir}\n`);
} finally {
  await browser.close();
}
