// 用法：pnpm --filter @mingxi/e2e capture --base http://localhost:4317 --out .artifacts/baseline
// 遍历产品导览，输出每一步的截图（step-XX.png）、DOM 快照（step-XX.dom.json）与 steps.json（标题、路由、是否稳定、期间的请求、网络回放统计）。
// 先预热走一遍记录全部响应，再在网络回放下走第二遍截图（见 network-replay.ts）。
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { CHROMIUM_ARGS, newDeterministicContext } from "./environment";
import { NetworkReplay } from "./network-replay";
import { walkTour, type TourStepCapture } from "./tour";

const { values } = parseArgs({
  options: { base: { type: "string" }, out: { type: "string" } },
  allowPositionals: true,
});
if (!values.base || !values.out) {
  process.stderr.write("需要 --base <应用地址> 与 --out <输出目录>\n");
  process.exit(2);
}
const baseUrl = values.base.replace(/\/$/, "");
const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: [...CHROMIUM_ARGS] });
try {
  const replay = new NetworkReplay();
  const warmup = await newDeterministicContext(browser);
  await replay.record(warmup);
  const warmupTotal = await walkTour(await warmup.newPage(), baseUrl, () => Promise.resolve());
  await warmup.close();
  process.stdout.write(`预热完成：${warmupTotal} 步\n`);

  const context = await newDeterministicContext(browser);
  await replay.replay(context);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const steps: (Omit<TourStepCapture, "png" | "dom"> & { file: string; domFile: string })[] = [];
  const total = await walkTour(page, baseUrl, async (capture) => {
    const name = `step-${String(capture.index + 1).padStart(2, "0")}`;
    const file = `${name}.png`;
    const domFile = `${name}.dom.json`;
    await writeFile(join(outDir, file), capture.png);
    await writeFile(join(outDir, domFile), JSON.stringify(capture.dom));
    steps.push({
      index: capture.index,
      kicker: capture.kicker,
      title: capture.title,
      path: capture.path,
      stable: capture.stable,
      requests: capture.requests,
      file,
      domFile,
    });
    process.stdout.write(
      `${capture.kicker}  ${capture.stable ? "稳定" : "未稳定"}  ${capture.path}  ${capture.title}\n`,
    );
  });
  const network = replay.result();
  await writeFile(
    join(outDir, "steps.json"),
    JSON.stringify(
      { baseUrl, total, capturedAt: new Date().toISOString(), pageErrors, network, steps },
      null,
      2,
    ),
  );
  process.stdout.write(`完成：${total} 步，回放 ${network.served} 个响应，输出到 ${outDir}\n`);
  if (network.misses.length) {
    // 截图那一遍出现了预热时没有的请求：这次截图不是在回放条件下得到的，不能作为对比依据。
    process.stderr.write(`回放未命中 ${network.misses.length} 个请求：\n  ${network.misses.join("\n  ")}\n`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
