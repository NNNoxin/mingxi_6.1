import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import { AppError } from "../errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 防跨站请求伪造（docs/02 §2.3）：业务写接口只接受正式站页面发出的请求。
 * 浏览器对 GET / HEAD 以外的请求总会带 Origin 头，所以直接要求它等于正式站来源；
 * 缺少 Origin 或来源不同一律 403（会话 Cookie 的 SameSite=Lax 之外的第二道防线，也不依赖请求体类型）。
 */
export function requireSameOrigin(origin: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.header("Origin") !== origin) {
      throw new AppError("forbidden", "请求来源不被允许");
    }
    await next();
  };
}
