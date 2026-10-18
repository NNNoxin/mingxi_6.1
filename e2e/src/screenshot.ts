import type { Page } from "playwright-core";

export interface StableShot {
  png: Buffer;
  /** 画面在 quietMs 时间窗内完全不变才算稳定；超过 timeoutMs 仍在变化时为 false。 */
  stable: boolean;
  waitedMs: number;
}

/**
 * 反复截图，直到画面连续 quietMs 毫秒没有任何变化，返回这张截图。
 * 时间窗要长于界面里最长的自动停顿（例如梳逻辑回忆播放每一步之间的等待），
 * 否则会截到播放途中的某一帧，原版与新版的结果就取决于时序而不是界面本身。
 * CSS 动画与过渡在截图时被禁用。
 */
export async function stableScreenshot(
  page: Page,
  options: { intervalMs?: number; quietMs?: number; timeoutMs?: number } = {},
): Promise<StableShot> {
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
