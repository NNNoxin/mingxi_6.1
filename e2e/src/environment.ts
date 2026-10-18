import type { Browser, BrowserContext, BrowserContextOptions } from "playwright-core";

/**
 * 视觉对比的确定性环境：原版与新版必须在完全相同的条件下渲染。
 * 固定视口、语言、时区、时间（取基准版本发布日），减少动态效果；导览速度固定为最快档以缩短等待。
 */
export const FIXED_TIME = new Date("2026-08-09T10:00:00+08:00");

export const CONTEXT_OPTIONS: BrowserContextOptions = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
  reducedMotion: "reduce",
  colorScheme: "light",
};

const TOUR_SPEED_STORAGE_KEY = "mingxi-product-tour-speed-v1";

export async function newDeterministicContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext(CONTEXT_OPTIONS);
  await context.clock.setFixedTime(FIXED_TIME);
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [TOUR_SPEED_STORAGE_KEY, "2"] as const,
  );
  return context;
}
