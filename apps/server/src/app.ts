import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { HTTP_STATUS_BY_CODE } from "@mingxi/contracts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { adminRoutes, type AdminDeps } from "./admin/routes";
import { AppError, errorBody } from "./errors";
import { resolveClientIp, socketAddressOf, withClientIpHeader } from "./http/client-ip";
import { idempotency, type IdempotencyStore } from "./http/idempotency";
import { rateLimitPerUser } from "./http/rate-limit";
import { requireSameOrigin } from "./http/same-origin";
import { requireUser, type ProtectedEnv } from "./http/session";
import type { AuthPort, SessionUser, UserTransaction } from "./http/types";
import type { Logger } from "./logger";
import type { RateLimiter, RateLimitRule } from "./rate-limit";
import { healthRoutes, type DependencyProbe } from "./routes/health";
import { meRoutes } from "./routes/me";
import { staticSite } from "./web/static-site";

export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
    /** 只在业务接口（鉴权通过后）存在，供请求日志记录 userId。 */
    user?: SessionUser;
  };
}

export interface AppOptions {
  logger: Logger;
  version: string;
  probes: DependencyProbe[];
  auth: AuthPort;
  /** 正式站来源（MINGXI_PUBLIC_URL 的 origin）：业务写接口只接受这个来源的请求。 */
  publicOrigin: string;
  /** 可信反向代理层数（MINGXI_TRUSTED_PROXY_HOPS），决定 X-Forwarded-For 里哪一项是客户端地址。 */
  trustedProxyHops: number;
  rateLimiter: RateLimiter;
  idempotencyStore: IdempotencyStore;
  /** 按用户 ID 得到“以该用户身份开事务”的函数（生产为 @mingxi/db 的 withUserTransaction）。 */
  withUserTransaction: (userId: string) => UserTransaction;
  /** 业务接口按用户限流，默认每分钟 120 次。 */
  apiRateLimit?: RateLimitRule;
  /** 单个请求体上限（字节）。文件上传走对象存储预签名直传，不经过这里。 */
  maxBodyBytes?: number;
  /** web 角色：正式站静态产物目录（MINGXI_WEB_ROOT）。不提供时本进程只提供 /api。 */
  webRoot?: string;
  /** 运营后台接口（docs/05）。不提供时 /api/admin/* 与其他未知接口一样按普通业务接口处理。 */
  admin?: AdminDeps;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_API_RATE_LIMIT: RateLimitRule = { window: 60, max: 120 };

function status(code: keyof typeof HTTP_STATUS_BY_CODE): ContentfulStatusCode {
  return HTTP_STATUS_BY_CODE[code] as ContentfulStatusCode;
}

/** 请求日志里的路径。找回密码链接把一次性令牌放在路径里（/api/auth/reset-password/<令牌>），记录前隐去。 */
export function loggablePath(path: string): string {
  return path.replace(/^(\/api\/auth\/reset-password\/)[^/]+/, "$1[已隐藏]");
}

export function createApp(options: AppOptions) {
  const app = new Hono<AppEnv>();

  app.use(requestId({ headerName: "X-Request-Id" }));
  app.use(async (c, next) => {
    c.set("logger", options.logger.child({ requestId: c.var.requestId }));
    const startedAt = performance.now();
    await next();
    c.var.logger.info(
      {
        method: c.req.method,
        path: loggablePath(c.req.path),
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
        userId: c.var.user?.id,
      },
      "request",
    );
  });
  app.use(secureHeaders());
  app.use(
    bodyLimit({
      maxSize: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          errorBody("payload_too_large", "请求体超过上限", c.var.requestId),
          status("payload_too_large"),
        ),
    }),
  );

  // —— 公开接口：健康检查与认证。必须注册在下面的业务接口之前。——
  app.route("/api", healthRoutes({ version: options.version, probes: options.probes }));
  // 注册、登录、验证邮箱、找回密码、会话管理（docs/02 §4.1）。
  // 认证模块按客户端地址限流；地址由这里按可信代理层数算好再交给它，客户端伪造的 X-Forwarded-For 不起作用。
  app.on(["GET", "POST"], "/api/auth/*", (c) => {
    const clientIp = resolveClientIp(
      socketAddressOf(c.env),
      c.req.header("X-Forwarded-For"),
      options.trustedProxyHops,
    );
    if (!clientIp) throw new Error("无法确定客户端地址，拒绝处理认证请求（限流依赖它）");
    return options.auth.handler(withClientIpHeader(c.req.raw, clientIp));
  });

  // —— 运营后台接口：独立的一组中间件（后台来源、工作人员、两步验证），必须注册在普通业务接口之前。——
  if (options.admin) app.route("/api/admin", adminRoutes(options.admin));

  // —— 业务接口：其余 /api/* 一律要求登录。默认拒绝：以后在这里或之后注册的路由都经过这组中间件。——
  const api = new Hono<ProtectedEnv>();
  api.use(
    requireSameOrigin(options.publicOrigin),
    requireUser(options.auth, options.withUserTransaction),
    rateLimitPerUser(options.rateLimiter, "all", options.apiRateLimit ?? DEFAULT_API_RATE_LIMIT),
    idempotency(options.idempotencyStore),
  );
  api.route("/", meRoutes());
  app.route("/api", api);

  // —— 正式站网页（web 角色）：/api 以外的 GET 请求返回静态产物，与 /api 同源。——
  if (options.webRoot) app.get("*", staticSite(options.webRoot));

  app.notFound((c) => c.json(errorBody("not_found", "接口不存在", c.var.requestId), status("not_found")));

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        errorBody(error.code, error.message, c.var.requestId, error.details),
        error.status as ContentfulStatusCode,
      );
    }
    c.var.logger.error({ err: error }, "未处理的异常");
    return c.json(errorBody("internal", "服务器内部错误", c.var.requestId), status("internal"));
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
