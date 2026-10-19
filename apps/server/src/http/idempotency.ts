import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode, StatusCode } from "hono/utils/http-status";
import type { Redis } from "ioredis";
import { AppError } from "../errors";
import type { ProtectedEnv } from "./session";

/** 幂等记录的存储（生产为 Redis，docs/02 §2.3：保存 24 小时）。 */
export interface IdempotencyStore {
  /** 键不存在时写入并返回 true；已存在返回 false。 */
  claim: (key: string, value: string, ttlSeconds: number) => Promise<boolean>;
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, ttlSeconds: number) => Promise<void>;
  release: (key: string) => Promise<void>;
}

export function createRedisIdempotencyStore(redis: Redis, prefix = "idem:"): IdempotencyStore {
  return {
    claim: async (key, value, ttlSeconds) =>
      (await redis.set(`${prefix}${key}`, value, "EX", ttlSeconds, "NX")) === "OK",
    get: (key) => redis.get(`${prefix}${key}`),
    put: async (key, value, ttlSeconds) => {
      await redis.set(`${prefix}${key}`, value, "EX", ttlSeconds);
    },
    release: async (key) => {
      await redis.del(`${prefix}${key}`);
    },
  };
}

type IdempotencyRecord =
  | { state: "in_progress"; fingerprint: string }
  | { state: "done"; fingerprint: string; status: number; contentType: string | null; body: string };

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
/** 结果保存 24 小时。 */
const DONE_TTL_SECONDS = 24 * 60 * 60;
/**
 * “处理中”占位的租期：进程在处理途中崩溃或重启时，这个键最多锁住这么久，之后可以用同一个键重试。
 * 写接口都是短请求（Agent 回合异步执行，只立即返回 runId），5 分钟足够覆盖。
 */
const IN_PROGRESS_TTL_SECONDS = 5 * 60;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * Idempotency-Key（docs/02 §2.3）：写接口带上这个头时，同一用户同一个键在 24 小时内只执行一次，
 * 重复提交直接返回第一次的结果（响应头 Idempotent-Replayed: true）。
 * - 第一次仍在处理时重复提交：409；
 * - 同一个键配了不同的请求（方法、路径或请求体不同）：409，不执行；
 * - 第一次执行出现 5xx：不保存结果，允许用同一个键重试。
 */
export function idempotency(store: IdempotencyStore): MiddlewareHandler<ProtectedEnv> {
  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (!key || !UNSAFE_METHODS.has(c.req.method)) {
      await next();
      return;
    }
    if (!KEY_PATTERN.test(key)) {
      throw new AppError("bad_request", "Idempotency-Key 只能包含字母、数字与 ._:-，长度 8–128");
    }
    const body = await c.req.text();
    const fingerprint = createHash("sha256").update(`${c.req.method} ${c.req.path}\n${body}`).digest("hex");
    // 键按用户隔离：不同用户用了相同的键互不影响。
    const storeKey = `${c.var.user.id}:${key}`;
    const claimed = await store.claim(
      storeKey,
      JSON.stringify({ state: "in_progress", fingerprint } satisfies IdempotencyRecord),
      IN_PROGRESS_TTL_SECONDS,
    );
    if (!claimed) {
      const existing = await store.get(storeKey);
      const record = existing ? (JSON.parse(existing) as IdempotencyRecord) : null;
      // 记录在两次读取之间过期或被释放（第一次执行出现 5xx）：让客户端用同一个键重试。
      if (!record) throw new AppError("conflict", "相同的请求刚刚结束，请重试");
      if (record.fingerprint !== fingerprint) {
        throw new AppError("conflict", "这个 Idempotency-Key 已用于另一个请求");
      }
      if (record.state === "in_progress")
        throw new AppError("conflict", "相同的请求正在处理，请稍后查看结果");
      c.header("Idempotent-Replayed", "true");
      if (record.contentType) c.header("Content-Type", record.contentType);
      if (NULL_BODY_STATUSES.has(record.status)) return c.body(null, record.status as StatusCode);
      return c.body(record.body, record.status as ContentfulStatusCode);
    }
    await next();
    if (c.res.status >= 500) {
      await store.release(storeKey);
      return;
    }
    const done: IdempotencyRecord = {
      state: "done",
      fingerprint,
      status: c.res.status,
      contentType: c.res.headers.get("Content-Type"),
      body: await c.res.clone().text(),
    };
    try {
      await store.put(storeKey, JSON.stringify(done), DONE_TTL_SECONDS);
    } catch (error) {
      // 写操作已经完成，如实返回它的结果；“处理中”占位保留到租期结束，期间重复提交得到 409 而不会重复执行。
      c.var.logger.error({ err: error, status: done.status }, "保存幂等结果失败");
    }
    return;
  };
}
