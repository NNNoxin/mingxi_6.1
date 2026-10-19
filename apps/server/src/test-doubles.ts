import type { IdempotencyStore } from "./http/idempotency";
import type { AuthPort, SessionLookup, SessionUser } from "./http/types";
import type { RateLimiter } from "./rate-limit";

// 单元测试用的替身。真实实现（Better Auth、Redis 限流与幂等存储）在 *.int.test.ts 里连真实依赖测试。

export function testUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "0192f0c4-5b8a-7c3d-9e1f-2a3b4c5d6e7f",
    email: "reader@example.com",
    name: "读者",
    emailVerified: true,
    role: "user",
    status: "active",
    ...overrides,
  };
}

/** 按 Cookie 里的 `session=<名字>` 查会话；同时记录 /api/auth/* 收到的请求。 */
export function fakeAuth(sessions: Record<string, SessionLookup> = {}, setCookie: string[] = []) {
  const seen: { method: string; path: string; clientIp: string | null }[] = [];
  const port: AuthPort = {
    handler: (request) => {
      seen.push({
        method: request.method,
        path: new URL(request.url).pathname,
        clientIp: request.headers.get("x-mingxi-client-ip"),
      });
      return Promise.resolve(Response.json({ ok: true }));
    },
    getSession: (headers) => {
      const name = /(?:^|;\s*)session=([^;]+)/.exec(headers.get("cookie") ?? "")?.[1];
      return Promise.resolve({ session: name ? (sessions[name] ?? null) : null, setCookie });
    },
  };
  return { port, seen };
}

/** 进程内计数，不按时间重置（单元测试只关心“第几次被拒绝”）。 */
export function memoryRateLimiter(): RateLimiter {
  const counts = new Map<string, number>();
  return {
    consume: (key, rule) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve(
        count <= rule.max ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: rule.window },
      );
    },
  };
}

export function memoryIdempotencyStore(): IdempotencyStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    claim: (key, value) => {
      if (entries.has(key)) return Promise.resolve(false);
      entries.set(key, value);
      return Promise.resolve(true);
    },
    get: (key) => Promise.resolve(entries.get(key) ?? null),
    put: (key, value) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    release: (key) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}

export const noDatabase = () => () => Promise.reject(new Error("单元测试不连接数据库"));
