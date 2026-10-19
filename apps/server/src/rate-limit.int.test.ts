import { randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { createRedisRateLimiter } from "./rate-limit";

const REDIS_URL = process.env.TEST_REDIS_URL;
if (!REDIS_URL) throw new Error("集成测试需要 TEST_REDIS_URL");

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
const limiter = createRedisRateLimiter(redis, `rl:test:${randomBytes(4).toString("hex")}:`);

afterAll(() => {
  redis.disconnect();
});

describe("Redis 限流（真实 Redis）", () => {
  it("窗口内允许 max 次，之后拒绝并给出剩余秒数；窗口过后重新计数", async () => {
    const rule = { window: 1, max: 3 };
    const decisions = [];
    for (let i = 0; i < 4; i += 1) decisions.push(await limiter.consume("window", rule));
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false]);
    expect(decisions[3]?.retryAfter).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await limiter.consume("window", rule)).allowed).toBe(true);
  });

  it("并发请求不会一起绕过上限（计数与判断原子完成）", async () => {
    const rule = { window: 60, max: 5 };
    const decisions = await Promise.all(Array.from({ length: 50 }, () => limiter.consume("burst", rule)));
    expect(decisions.filter((d) => d.allowed)).toHaveLength(5);
  });

  it("不同键互不影响", async () => {
    const rule = { window: 60, max: 1 };
    expect((await limiter.consume("a", rule)).allowed).toBe(true);
    expect((await limiter.consume("b", rule)).allowed).toBe(true);
    expect((await limiter.consume("a", rule)).allowed).toBe(false);
  });
});
