import type { MiddlewareHandler } from "hono";
import { AppError } from "../errors";
import type { RateLimiter, RateLimitRule } from "../rate-limit";
import type { SessionUser } from "./types";

/** 业务接口按用户限流（计数在 Redis，多实例共享，EC-P4）。超限返回 429 与 Retry-After。 */
export function rateLimitPerUser<E extends { Variables: { user: SessionUser } }>(
  limiter: RateLimiter,
  scope: string,
  rule: RateLimitRule,
): MiddlewareHandler<E> {
  return async (c, next) => {
    const decision = await limiter.consume(`api:${scope}:u:${c.var.user.id}`, rule);
    if (!decision.allowed) {
      const retryAfter = decision.retryAfter ?? rule.window;
      c.header("Retry-After", String(retryAfter));
      throw new AppError("rate_limited", "请求太频繁，请稍后再试", { retryAfter });
    }
    await next();
  };
}
