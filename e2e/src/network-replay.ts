import type { BrowserContext, Request, Route } from "playwright-core";

/**
 * 网络回放：先完整走一遍导览，把页面发出的每个请求的响应记下来（预热），截图那一遍再从内存里原样返回。
 *
 * 原版导览有几处“滚动到目标”和“异步内容加载完成”在抢时间（例如第 29 步笔记快照加载与滚动定位），
 * 服务器响应快慢不同，最后停下来的画面就不同。回放让原版与新版的每个响应都在同样的条件下立即返回，
 * 比较的就只是界面本身。同一请求出现多次时按出现顺序依次返回当次录到的响应；浏览器缓存行为不同可能让
 * 同一静态资源多请求一次，只有预热时它每次的响应都完全相同，才把这份响应再返回一次。
 */
interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface ReplayStats {
  served: number;
  /** 截图那一遍出现、预热时没出现过（或出现次数更多且响应有变化）的请求：照常请求服务器，并在结果里列出。 */
  misses: string[];
}

// 回放时由 Playwright 按实际 body 重新计算，原样带上会与解码后的 body 不符。
const DROPPED_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding"]);

function isUnchanging(entries: readonly RecordedResponse[]): boolean {
  const [first, ...rest] = entries;
  return (
    first !== undefined &&
    rest.every((entry) => entry.status === first.status && entry.body.equals(first.body))
  );
}

function requestKey(request: Request): string {
  return `${request.method()} ${request.url()} ${request.postData() ?? ""}`;
}

export class NetworkReplay {
  private readonly recorded = new Map<string, RecordedResponse[]>();
  private readonly replayCursor = new Map<string, number>();
  private readonly stats: ReplayStats = { served: 0, misses: [] };

  async record(context: BrowserContext): Promise<void> {
    await context.route("**/*", async (route) => {
      const response = await route.fetch();
      const key = requestKey(route.request());
      const entries = this.recorded.get(key) ?? [];
      entries.push({
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
      });
      this.recorded.set(key, entries);
      await route.fulfill({ response });
    });
  }

  async replay(context: BrowserContext): Promise<void> {
    await context.route("**/*", (route) => this.serve(route));
  }

  result(): ReplayStats {
    return { served: this.stats.served, misses: [...this.stats.misses] };
  }

  private async serve(route: Route): Promise<void> {
    const key = requestKey(route.request());
    const entries = this.recorded.get(key) ?? [];
    const cursor = this.replayCursor.get(key) ?? 0;
    this.replayCursor.set(key, cursor + 1);
    const entry = entries[cursor] ?? (isUnchanging(entries) ? entries[0] : undefined);
    if (!entry) {
      this.stats.misses.push(`${key.slice(0, 300)}（第 ${cursor + 1} 次，预热只出现 ${entries.length} 次）`);
      await route.fallback();
      return;
    }
    this.stats.served += 1;
    await route.fulfill({
      status: entry.status,
      headers: Object.fromEntries(
        Object.entries(entry.headers).filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase())),
      ),
      body: entry.body,
    });
  }
}
