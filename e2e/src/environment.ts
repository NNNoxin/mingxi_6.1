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
  // 原版生产构建会注册离线缓存 Service Worker（public/sw.js），它接管资源请求后网络回放就拦不到了；
  // 它只负责离线缓存，不影响画面，原版与新版截图时都屏蔽。
  serviceWorkers: "block",
};

/**
 * 固定 Chromium 的文字与图层光栅化方式，减少同一页面两次截图之间的亚像素差异。
 * 带 `will-change: transform` 的图层沿用旧位图造成的差异（第 39 步逻辑画布）由截图前重新光栅化消除，见 screenshot.ts。
 */
export const CHROMIUM_ARGS = [
  "--disable-gpu",
  "--disable-lcd-text",
  "--disable-font-subpixel-positioning",
  "--force-color-profile=srgb",
  "--disable-partial-raster",
  "--disable-threaded-animation",
  "--disable-checker-imaging",
] as const;

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
