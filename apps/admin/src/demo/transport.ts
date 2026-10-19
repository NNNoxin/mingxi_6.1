import type { AdminTransport } from "../transport/types";
import { createDemoDataset, DEMO_DATASET_MARKER, type DemoState } from "./dataset";
import { handleDemoRequest } from "./server";

// 演示版的传输层：把后台发出的请求交给页面内的演示服务，不发任何网络请求。
// 后台页面之间是整页跳转，演示数据保存在本标签页的 sessionStorage 里，关掉标签页即恢复初始数据。
// 浏览器不允许使用 sessionStorage 时（隐私模式等）退回到只存在内存里：每次换页都从初始数据开始。

const STORAGE_KEY = DEMO_DATASET_MARKER;

function isDemoState(value: unknown): value is DemoState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { marker?: unknown }).marker === DEMO_DATASET_MARKER
  );
}

export interface DemoStore {
  load: () => DemoState;
  save: (state: DemoState) => void;
}

export function sessionStore(now: () => Date): DemoStore {
  let memory: DemoState | null = null;
  return {
    load() {
      if (memory) return memory;
      try {
        const saved: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
        if (isDemoState(saved)) memory = saved;
      } catch {
        // 读不到或内容损坏：用初始数据。
      }
      memory ??= createDemoDataset(now());
      return memory;
    },
    save(state) {
      memory = state;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // 存不进去（隐私模式、空间不足）：只保留在内存里。
      }
    },
  };
}

function bodyOf(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

export function createDemoTransport(
  store: DemoStore = sessionStore(() => new Date()),
  now: () => Date = () => new Date(),
): AdminTransport {
  return {
    mode: "demo",
    send(url, init) {
      const target = new URL(url, "https://admin-demo.invalid");
      const state = store.load();
      const response = handleDemoRequest(
        state,
        {
          method: (init?.method ?? "GET").toUpperCase(),
          path: target.pathname,
          query: target.searchParams,
          body: bodyOf(init),
        },
        now(),
      );
      store.save(state);
      return Promise.resolve(
        new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    },
  };
}
