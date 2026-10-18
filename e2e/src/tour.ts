import type { Page, Request } from "playwright-core";
import { stableScreenshot } from "./screenshot";

export interface RecordedRequest {
  method: string;
  path: string;
  resourceType: string;
  status: number | null;
  postData: string | null;
}

export interface TourStepCapture {
  index: number;
  /** 导览卡片上的“第几步 / 共几步” */
  kicker: string;
  title: string;
  path: string;
  png: Buffer;
  stable: boolean;
  requests: RecordedRequest[];
}

const CARD = ".mx-tour-card";
const POST_DATA_LIMIT = 4_000;

function isAppRequest(request: Request): boolean {
  return ["fetch", "xhr", "document"].includes(request.resourceType());
}

/**
 * 以“交互式逐步体验”模式从第 1 步走到最后一步：每步等待导览卡片切换、页面空闲、画面稳定后截图，
 * 并记录这一步期间发出的页面与接口请求。原版和新版用同一个函数遍历，保证操作序列完全一致。
 */
export async function walkTour(
  page: Page,
  baseUrl: string,
  onStep: (capture: TourStepCapture) => Promise<void>,
  /** 只截这些步骤（从 1 开始）；其余步骤照常推进但不等待稳定、不截图。默认全部。 */
  onlySteps?: ReadonlySet<number>,
): Promise<number> {
  let pending: RecordedRequest[] = [];
  const byRequest = new Map<Request, RecordedRequest>();
  page.on("request", (request) => {
    if (!isAppRequest(request)) return;
    const url = new URL(request.url());
    if (url.origin !== new URL(baseUrl).origin) return;
    const record: RecordedRequest = {
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      resourceType: request.resourceType(),
      status: null,
      postData: request.postData()?.slice(0, POST_DATA_LIMIT) ?? null,
    };
    byRequest.set(request, record);
    pending.push(record);
  });
  page.on("response", (response) => {
    const record = byRequest.get(response.request());
    if (record) record.status = response.status();
  });

  await page.goto(`${baseUrl}/demo?guidedtour=1`, { waitUntil: "networkidle" });
  const kicker = page.locator(`${CARD} .mx-tour-kicker`);
  await kicker.waitFor({ state: "visible", timeout: 30_000 });

  const firstText = (await kicker.innerText()).replace(/\s+/g, " ").trim();
  const totalMatch = /\/\s*(\d+)/.exec(firstText);
  if (!totalMatch?.[1]) throw new Error(`无法从导览卡片读出总步数：${firstText}`);
  const total = Number(totalMatch[1]);

  for (let index = 0; index < total; index += 1) {
    await page.waitForFunction(
      ([selector, expected]) => {
        const element = document.querySelector(selector);
        return (element?.textContent ?? "").replace(/\s+/g, " ").includes(expected);
      },
      [`${CARD} .mx-tour-kicker`, `${index + 1} / ${total}`] as const,
      { timeout: 60_000 },
    );
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !document.querySelector(".mx-tour-veil.on"), undefined, {
      timeout: 30_000,
    });
    if (onlySteps && !onlySteps.has(index + 1)) {
      if (index < total - 1) await page.locator(`${CARD} button.go`).click();
      continue;
    }
    const shot = await stableScreenshot(page);
    const title = (await page.locator(`${CARD} #mx-tour-title`).innerText()).trim();
    const requests = pending;
    pending = [];
    await onStep({
      index,
      kicker: (await kicker.innerText()).replace(/\s+/g, " ").trim(),
      title,
      path: new URL(page.url()).pathname,
      png: shot.png,
      stable: shot.stable,
      requests,
    });
    if (index < total - 1) await page.locator(`${CARD} button.go`).click();
  }
  return total;
}
