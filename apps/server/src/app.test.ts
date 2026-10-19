import { pino } from "pino";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ApiErrorBody, LivenessResponse, ReadinessResponse } from "@mingxi/contracts";
import { createApp } from "./app";
import { AppError } from "./errors";

const silent = pino({ level: "silent" });

/** 记录收到的请求路径；认证模块本身的行为在 auth.int.test.ts 里连真实依赖测试。 */
function recordingAuth() {
  const seen: string[] = [];
  return {
    seen,
    handler: (request: Request) => {
      seen.push(`${request.method} ${new URL(request.url).pathname}`);
      return Promise.resolve(Response.json({ ok: true }));
    },
  };
}

function appWith(probeResults: { postgres: boolean; redis: boolean }) {
  return createApp({
    logger: silent,
    version: "test",
    probes: [
      {
        name: "postgres",
        probe: () =>
          probeResults.postgres ? Promise.resolve() : Promise.reject(new Error("connection refused")),
      },
      {
        name: "redis",
        probe: () => (probeResults.redis ? Promise.resolve() : Promise.reject(new Error("ECONNREFUSED"))),
      },
    ],
    maxBodyBytes: 64,
    auth: recordingAuth(),
  });
}

describe("健康检查", () => {
  it("存活检查不依赖外部服务", async () => {
    const response = await appWith({ postgres: false, redis: false }).request("/api/health");
    expect(response.status).toBe(200);
    expect(LivenessResponse.parse(await response.json()).version).toBe("test");
  });

  it("依赖都可用时就绪", async () => {
    const response = await appWith({ postgres: true, redis: true }).request("/api/ready");
    expect(response.status).toBe(200);
    const body = ReadinessResponse.parse(await response.json());
    expect(body.status).toBe("ready");
    expect(body.checks.map((check) => check.name).sort()).toEqual(["postgres", "redis"]);
  });

  it("任一依赖不可用时返回 503，并指出是哪一个", async () => {
    const response = await appWith({ postgres: true, redis: false }).request("/api/ready");
    expect(response.status).toBe(503);
    const body = ReadinessResponse.parse(await response.json());
    expect(body.status).toBe("unavailable");
    const redis = body.checks.find((check) => check.name === "redis");
    expect(redis?.ok).toBe(false);
    expect(redis?.error).toContain("ECONNREFUSED");
  });

  it("探针超时视为不可用", async () => {
    const app = createApp({
      logger: silent,
      version: "test",
      probes: [{ name: "postgres", probe: () => new Promise(() => undefined) }],
      auth: recordingAuth(),
    });
    const response = await app.request("/api/ready");
    expect(response.status).toBe(503);
    const body = ReadinessResponse.parse(await response.json());
    expect(body.checks[0]?.error).toContain("未响应");
  }, 5_000);
});

describe("统一错误格式", () => {
  it("未知接口返回 not_found，并带请求 ID", async () => {
    const response = await appWith({ postgres: true, redis: true }).request("/api/nope", {
      headers: { "X-Request-Id": "req-123" },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Request-Id")).toBe("req-123");
    const body = ApiErrorBody.parse(await response.json());
    expect(body.error).toMatchObject({ code: "not_found", requestId: "req-123" });
  });

  it("请求体超限返回 payload_too_large", async () => {
    const app = appWith({ postgres: true, redis: true });
    app.post("/api/echo", (c) => c.text("ok"));
    const response = await app.request("/api/echo", { method: "POST", body: "x".repeat(200) });
    expect(response.status).toBe(413);
    expect(ApiErrorBody.parse(await response.json()).error.code).toBe("payload_too_large");
  });

  it("AppError 按错误码映射状态码", async () => {
    const app = appWith({ postgres: true, redis: true });
    app.route(
      "/api/test",
      new Hono().get("/conflict", () => {
        throw new AppError("conflict", "画布版本已变化", { expected: 3, actual: 4 });
      }),
    );
    const response = await app.request("/api/test/conflict");
    expect(response.status).toBe(409);
    const body = ApiErrorBody.parse(await response.json());
    expect(body.error).toMatchObject({ code: "conflict", details: { expected: 3, actual: 4 } });
  });

  it("未预期的异常不泄露内部信息", async () => {
    const app = appWith({ postgres: true, redis: true });
    app.route(
      "/api/test",
      new Hono().get("/boom", () => {
        throw new Error("password=hunter2 leaked in stack");
      }),
    );
    const response = await app.request("/api/test/boom");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("hunter2");
    expect(ApiErrorBody.parse(JSON.parse(text)).error.code).toBe("internal");
  });

  it("设置安全响应头", async () => {
    const response = await appWith({ postgres: true, redis: true }).request("/api/health");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});

describe("认证路由", () => {
  it("/api/auth/* 的 GET 与 POST 交给认证模块处理", async () => {
    const auth = recordingAuth();
    const app = createApp({ logger: silent, version: "test", probes: [], auth });
    expect((await app.request("/api/auth/get-session")).status).toBe(200);
    expect((await app.request("/api/auth/sign-in/email", { method: "POST", body: "{}" })).status).toBe(200);
    expect(auth.seen).toEqual(["GET /api/auth/get-session", "POST /api/auth/sign-in/email"]);
  });
});
