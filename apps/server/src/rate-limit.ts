import type { Redis } from "ioredis";

export interface RateLimitRule {
  /** 窗口长度（秒）。 */
  window: number;
  /** 窗口内最多允许的请求数。 */
  max: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** 被拒绝时距离窗口结束还有几秒；允许时为 null。 */
  retryAfter: number | null;
}

/**
 * 固定窗口计数，计数与判断在 Redis 里一步完成（Lua 脚本原子执行），
 * 多实例部署时共享同一份计数（EC-P4），并发请求也不会一起绕过上限。
 * 返回 {当前计数, 剩余毫秒}。
 */
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export interface RateLimiter {
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

export function createRedisRateLimiter(redis: Redis, prefix = "rl:"): RateLimiter {
  return {
    async consume(key, rule) {
      const result = (await redis.eval(CONSUME_SCRIPT, 1, `${prefix}${key}`, String(rule.window * 1000))) as [
        number,
        number,
      ];
      const [count, ttlMs] = result;
      if (count <= rule.max) return { allowed: true, retryAfter: null };
      return { allowed: false, retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)) };
    },
  };
}
