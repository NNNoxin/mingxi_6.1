import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { HTTP_STATUS_BY_CODE } from "@mingxi/contracts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError, errorBody } from "./errors";
import type { Logger } from "./logger";
import { healthRoutes, type DependencyProbe } from "./routes/health";

export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
  };
}

/** 认证模块对外只需要一个处理 /api/auth/* 请求的函数（Better Auth 实例满足这个形状）。 */
export interface AuthHandler {
  handler: (request: Request) => Promise<Response>;
}

export interface AppOptions {
  logger: Logger;
  version: string;
  probes: DependencyProbe[];
  auth: AuthHandler;
  /** 单个请求体上限（字节）。文件上传走对象存储预签名直传，不经过这里。 */
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

function status(code: keyof typeof HTTP_STATUS_BY_CODE): ContentfulStatusCode {
  return HTTP_STATUS_BY_CODE[code] as ContentfulStatusCode;
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
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
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

  app.route("/api", healthRoutes({ version: options.version, probes: options.probes }));
  // 注册、登录、验证邮箱、找回密码、会话管理（docs/02 §4.1）。
  app.on(["GET", "POST"], "/api/auth/*", (c) => options.auth.handler(c.req.raw));

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
