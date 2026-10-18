import type { CDPSession, Page } from "playwright-core";
import { CONTEXT_OPTIONS } from "./environment";

export interface StableShot {
  png: Buffer;
  /** 画面在 quietMs 时间窗内完全不变才算稳定；超过 timeoutMs 仍在变化时为 false。 */
  stable: boolean;
  waitedMs: number;
}

interface StabilityOptions {
  intervalMs?: number;
  quietMs?: number;
  timeoutMs?: number;
}

/**
 * 反复截图，直到画面连续 quietMs 毫秒没有任何变化。
 * 时间窗要长于界面里最长的自动停顿（例如梳逻辑回忆播放每一步之间的等待），
 * 否则会截到播放途中的某一帧，原版与新版的结果就取决于时序而不是界面本身。
 * CSS 动画与过渡在截图时被禁用。
 */
async function waitUntilStable(page: Page, options: StabilityOptions): Promise<StableShot> {
  const intervalMs = options.intervalMs ?? 300;
  const quietMs = options.quietMs ?? 2_500;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const startedAt = Date.now();
  let last = await page.screenshot({ animations: "disabled", caret: "hide" });
  let unchangedSince = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(intervalMs);
    const current = await page.screenshot({ animations: "disabled", caret: "hide" });
    if (!current.equals(last)) {
      last = current;
      unchangedSince = Date.now();
      continue;
    }
    if (Date.now() - unchangedSince >= quietMs) {
      return { png: current, stable: true, waitedMs: Date.now() - startedAt };
    }
  }
  return { png: last, stable: false, waitedMs: Date.now() - startedAt };
}

// 每个页面一个常驻的 CDP 会话：会话断开时 Chromium 会撤销它设置的设备参数，所以不在用完后断开。
const sessions = new WeakMap<Page, CDPSession>();

async function sessionFor(page: Page): Promise<CDPSession> {
  const existing = sessions.get(page);
  if (existing) return existing;
  const session = await page.context().newCDPSession(page);
  sessions.set(page, session);
  return session;
}

/**
 * 让页面所有图层按当前状态重新光栅化：把设备像素比临时改成 2 再改回原值。
 *
 * Chromium 对带 `will-change: transform` 的图层只在内容变化时重新光栅化，只是平移时沿用旧位图，
 * 位图的亚像素相位取决于最后一次光栅化时的平移量。逻辑画布 `.tld-world` 在回忆播放中反复 fitView，
 * 最后一次光栅化落在哪一次平移上取决于帧时序，原版自己多次截图就有两种结果（第 39 步，DOM 完全相同）。
 * 设备像素比变化会让所有图层按当前变换重新光栅化，截图只取决于页面当前状态。
 * 视口尺寸与屏幕参数不变（与 Playwright 设置的值一致），不触发 resize，DOM 不变（实测）。
 */
async function rerasterize(page: Page): Promise<void> {
  const viewport = CONTEXT_OPTIONS.viewport;
  if (!viewport) throw new Error("CONTEXT_OPTIONS 必须固定视口尺寸");
  const deviceScaleFactor = CONTEXT_OPTIONS.deviceScaleFactor ?? 1;
  const metrics = (scale: number) => ({
    mobile: false,
    width: viewport.width,
    height: viewport.height,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    deviceScaleFactor: scale,
    screenOrientation: { angle: 0, type: "landscapePrimary" as const },
  });
  const session = await sessionFor(page);
  await session.send("Emulation.setDeviceMetricsOverride", metrics(deviceScaleFactor * 2));
  await session.send("Emulation.setDeviceMetricsOverride", metrics(deviceScaleFactor));
}

/**
 * 等画面稳定 → 让所有图层按当前状态重新光栅化 → 再等画面稳定，返回这张截图。
 * 第一次等待保证页面已经停在这一步的最终状态；重新光栅化消除“之前经过了哪些帧”对位图的影响。
 */
export async function stableScreenshot(page: Page, options: StabilityOptions = {}): Promise<StableShot> {
  const settled = await waitUntilStable(page, options);
  if (!settled.stable) return settled;
  await rerasterize(page);
  const final = await waitUntilStable(page, options);
  return { ...final, waitedMs: settled.waitedMs + final.waitedMs };
}
