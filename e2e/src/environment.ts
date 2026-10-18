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
 * 仍无法消除的一处：逻辑画布 `.tld-world` 带 `will-change: transform`，Chromium 按它第一次光栅化时的缩放保留位图，
 * 第一次光栅化落在 fitView 之前还是之后取决于帧时序，原版自己多次截图也会出现两种结果（第 39 步，约 0.18%），
 * 对比时按原版自身的差异放宽这一步，并用 DOM 快照保证布局完全一致（见 compare.ts）。
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
