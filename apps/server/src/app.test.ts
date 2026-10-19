import { Writable } from "node:stream";
import { pino } from "pino";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ApiErrorBody, LivenessResponse, ReadinessResponse } from "@mingxi/contracts";
import { createApp, type AppOptions } from "./app";
import { MAX_REPLAY_BODY_BYTES } from "./http/idempotency";
import { AppError } from "./errors";
import { createLogger } from "./logger";
import { fakeAuth, memoryIdempotencyStore, memoryRateLimiter, noDatabase, testUser } from "./test-doubles";

const silent = pino({ level: "silent" });
const ORIGIN = "https://mingxi.example.com";
/** @hono/node-server 传给应用的连接信息（测试里直接给出直连地址）。 */
const fromSocket = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });

function appWith(overrides: Partial<AppOptions> = {}) {
  return createApp({
    logger: silent,
    version: "test",
    probes: [],
    auth: fakeAuth().port,
    publicOrigin: ORIGIN,
    trustedProxyHops: 0,
    rateLimiter: memoryRateLimiter(),
    idempotencyStore: memoryIdempotencyStore(),
    withUserTransaction: noDatabase,
    ...overrides,
  });
}

function probes(results: { postgres: boolean; redis: boolean }): AppOptions["probes"] {
  return [
    {
      name: "postgres",
      probe: () => (results.postgres ? Promise.resolve() : Promise.reject(new Error("connection refused"))),
    },
    {
      name: "redis",
      probe: () => (results.redis ? Promise.resolve() : Promise.reject(new Error("ECONNREFUSED"))),
    },
  ];
}

const reader = { sessionId: "s-reader", user: testUser() };
const other = { sessionId: "s-other", user: testUser({ id: "0192f0c4-5b8a-7c3d-9e1f-000000000002" }) };
const frozen = {
  sessionId: "s-frozen",
  user: testUser({ id: "0192f0c4-5b8a-7c3d-9e1f-000000000003", status: "frozen" }),
};

function signedIn(name: "reader" | "other" | "frozen", init: RequestInit = {}): RequestInit {
  return { ...init, headers: { cookie: `session=${name}`, ...(init.headers as Record<string, string>) } };
}

describe("健康检查", () => {
  it("存活检查不依赖外部服务", async () => {
    const response = await appWith({ probes: probes({ postgres: false, redis: false }) }).request(
      "/api/health",
    );
    expect(response.status).toBe(200);
    expect(LivenessResponse.parse(await response.json()).version).toBe("test");
  });

  it("依赖都可用时就绪", async () => {
    const response = await appWith({ probes: probes({ postgres: true, redis: true }) }).request("/api/ready");
    expect(response.status).toBe(200);
    const body = ReadinessResponse.parse(await response.json());
    expect(body.status).toBe("ready");
    expect(body.checks.map((check) => check.name).sort()).toEqual(["postgres", "redis"]);
  });

  it("任一依赖不可用时返回 503，并指出是哪一个", async () => {
    const response = await appWith({ probes: probes({ postgres: true, redis: false }) }).request(
      "/api/ready",
    );
    expect(response.status).toBe(503);
    const body = ReadinessResponse.parse(await response.json());
    expect(body.status).toBe("unavailable");
    const redis = body.checks.find((check) => check.name === "redis");
    expect(redis?.ok).toBe(false);
    expect(redis?.error).toContain("ECONNREFUSED");
  });

  it("探针超时视为不可用", async () => {
    const app = appWith({ probes: [{ name: "postgres", probe: () => new Promise(() => undefined) }] });
    const response = await app.request("/api/ready");
    expect(response.status).toBe(503);
    const body = ReadinessResponse.parse(await response.json());
    expect(body.checks[0]?.error).toContain("未响应");
  }, 5_000);
});

describe("统一错误格式", () => {
  it("未知接口返回 not_found，并带请求 ID", async () => {
    const app = appWith({ auth: fakeAuth({ reader }).port });
    const response = await app.request(
      "/api/nope",
      signedIn("reader", { headers: { "X-Request-Id": "req-123" } }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Request-Id")).toBe("req-123");
    const body = ApiErrorBody.parse(await response.json());
    expect(body.error).toMatchObject({ code: "not_found", requestId: "req-123" });
  });

  it("请求体超限返回 payload_too_large", async () => {
    const app = appWith({ maxBodyBytes: 64 });
    app.post("/echo", (c) => c.text("ok"));
    const response = await app.request("/echo", { method: "POST", body: "x".repeat(200) });
    expect(response.status).toBe(413);
    expect(ApiErrorBody.parse(await response.json()).error.code).toBe("payload_too_large");
  });

  it("AppError 按错误码映射状态码", async () => {
    const app = appWith();
    app.route(
      "/test",
      new Hono().get("/conflict", () => {
        throw new AppError("conflict", "画布版本已变化", { expected: 3, actual: 4 });
      }),
    );
    const response = await app.request("/test/conflict");
    expect(response.status).toBe(409);
    const body = ApiErrorBody.parse(await response.json());
    expect(body.error).toMatchObject({ code: "conflict", details: { expected: 3, actual: 4 } });
  });

  it("未预期的异常不泄露内部信息", async () => {
    const app = appWith();
    app.route(
      "/test",
      new Hono().get("/boom", () => {
        throw new Error("password=hunter2 leaked in stack");
      }),
    );
    const response = await app.request("/test/boom");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("hunter2");
    expect(ApiErrorBody.parse(JSON.parse(text)).error.code).toBe("internal");
  });

  it("设置安全响应头", async () => {
    const response = await appWith().request("/api/health");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});

describe("认证路由与客户端地址", () => {
  it("/api/auth/* 的 GET 与 POST 交给认证模块，并附上按连接算出的客户端地址", async () => {
    const auth = fakeAuth();
    const app = appWith({ auth: auth.port });
    expect((await app.request("/api/auth/get-session", {}, fromSocket("198.51.100.7"))).status).toBe(200);
    const post = await app.request(
      "/api/auth/sign-in/email",
      // 客户端自带的 X-Forwarded-For 与同名地址头都不算数。
      {
        method: "POST",
        body: "{}",
        headers: { "X-Forwarded-For": "1.2.3.4", "x-mingxi-client-ip": "5.6.7.8" },
      },
      fromSocket("198.51.100.7"),
    );
    expect(post.status).toBe(200);
    expect(auth.seen).toEqual([
      { method: "GET", path: "/api/auth/get-session", clientIp: "198.51.100.7" },
      { method: "POST", path: "/api/auth/sign-in/email", clientIp: "198.51.100.7" },
    ]);
  });

  it("前面有一层可信代理时取代理追加的地址", async () => {
    const auth = fakeAuth();
    const app = appWith({ auth: auth.port, trustedProxyHops: 1 });
    await app.request(
      "/api/auth/get-session",
      { headers: { "X-Forwarded-For": "1.2.3.4, 203.0.113.9" } },
      fromSocket("10.0.0.2"),
    );
    expect(auth.seen[0]?.clientIp).toBe("203.0.113.9");
  });

  it("拿不到连接地址时拒绝处理（限流依赖它），不交给认证模块", async () => {
    const auth = fakeAuth();
    const response = await appWith({ auth: auth.port }).request("/api/auth/get-session");
    expect(response.status).toBe(500);
    expect(auth.seen).toEqual([]);
  });
});

describe("业务接口鉴权", () => {
  it("没有会话返回 401；认证模块要求清除的 Cookie 随响应返回", async () => {
    const clear = "mingxi.session_token=; Max-Age=0; Path=/";
    const app = appWith({ auth: fakeAuth({}, [clear]).port });
    for (const path of ["/api/me", "/api/anything-else"]) {
      const response = await app.request(path);
      expect(response.status).toBe(401);
      expect(ApiErrorBody.parse(await response.json()).error.code).toBe("unauthenticated");
      expect(response.headers.getSetCookie()).toEqual([clear]);
    }
  });

  it("账号已冻结返回 403，并说明原因", async () => {
    const response = await appWith({ auth: fakeAuth({ frozen }).port }).request(
      "/api/me",
      signedIn("frozen"),
    );
    expect(response.status).toBe(403);
    expect(ApiErrorBody.parse(await response.json()).error).toMatchObject({
      code: "forbidden",
      details: { reason: "account_frozen" },
    });
  });

  it("/api/me 只返回本人可见的字段；会话续期的 Cookie 写回浏览器", async () => {
    const renewed = "mingxi.session_token=new; Max-Age=604800; Path=/; HttpOnly";
    const response = await appWith({ auth: fakeAuth({ reader }, [renewed]).port }).request(
      "/api/me",
      signedIn("reader"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: reader.user.id,
      email: reader.user.email,
      name: reader.user.name,
      emailVerified: true,
      role: "user",
    });
    expect(response.headers.getSetCookie()).toEqual([renewed]);
  });

  it("写接口只接受正式站来源的请求", async () => {
    const app = appWith({ auth: fakeAuth({ reader }).port });
    app.post("/api/test/notes", (c) => c.json({ ok: true }, 201));
    const post = (headers: Record<string, string>) =>
      app.request("/api/test/notes", signedIn("reader", { method: "POST", body: "{}", headers }));
    expect((await post({ Origin: "https://evil.example" })).status).toBe(403);
    expect((await post({})).status).toBe(403);
    expect((await post({ Origin: ORIGIN })).status).toBe(201);
    // 读接口不要求 Origin。
    expect((await app.request("/api/me", signedIn("reader"))).status).toBe(200);
  });

  it("按用户限流：超限返回 429 与 Retry-After，不影响其他用户", async () => {
    const app = appWith({ auth: fakeAuth({ reader, other }).port, apiRateLimit: { window: 60, max: 2 } });
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await app.request("/api/me", signedIn("reader"))).status);
    expect(statuses).toEqual([200, 200, 429]);
    const limited = await app.request("/api/me", signedIn("reader"));
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(ApiErrorBody.parse(await limited.json()).error).toMatchObject({
      code: "rate_limited",
      details: { retryAfter: 60 },
    });
    expect((await app.request("/api/me", signedIn("other"))).status).toBe(200);
  });
});

describe("幂等键", () => {
  function writeApp(handler: (body: string) => Promise<Response> | Response) {
    const store = memoryIdempotencyStore();
    const app = appWith({ auth: fakeAuth({ reader, other }).port, idempotencyStore: store });
    app.post("/api/test/notes", async (c) => handler(await c.req.text()));
    const post = (who: "reader" | "other", key: string | null, body = '{"title":"一"}') =>
      app.request(
        "/api/test/notes",
        signedIn(who, {
          method: "POST",
          body,
          headers: {
            Origin: ORIGIN,
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
        }),
      );
    return { app, store, post };
  }

  it("同一个键重复提交只执行一次，返回第一次的结果", async () => {
    let calls = 0;
    const { post } = writeApp((body) => {
      calls += 1;
      return Response.json({ created: calls, body: JSON.parse(body) as unknown }, { status: 201 });
    });
    const first = await post("reader", "key-0001");
    const second = await post("reader", "key-0001");
    expect(calls).toBe(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(second.headers.get("Content-Type")).toContain("application/json");
    expect(second.headers.get("X-Request-Id")).toBeTruthy();
    // 不带键的请求每次都执行。
    await post("reader", null);
    await post("reader", null);
    expect(calls).toBe(3);
  });

  it("同一个键配不同的请求体：409，不执行", async () => {
    let calls = 0;
    const { post } = writeApp(() => {
      calls += 1;
      return Response.json({}, { status: 201 });
    });
    await post("reader", "key-0002");
    const mismatch = await post("reader", "key-0002", '{"title":"二"}');
    expect(mismatch.status).toBe(409);
    expect(ApiErrorBody.parse(await mismatch.json()).error.message).toContain("另一个请求");
    expect(calls).toBe(1);
  });

  it("第一次还在处理时重复提交：409", async () => {
    let finish: () => void = () => undefined;
    const { post } = writeApp(
      () =>
        new Promise<Response>((resolve) => {
          finish = () => {
            resolve(Response.json({}, { status: 201 }));
          };
        }),
    );
    const first = post("reader", "key-0003");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const duplicate = await post("reader", "key-0003");
    expect(duplicate.status).toBe(409);
    expect(ApiErrorBody.parse(await duplicate.json()).error.message).toContain("正在处理");
    finish();
    expect((await first).status).toBe(201);
  });

  it("第一次执行出现 5xx 时不保存结果，可以用同一个键重试", async () => {
    let calls = 0;
    const { post } = writeApp(() => {
      calls += 1;
      if (calls === 1) throw new Error("数据库暂时不可用");
      return Response.json({ ok: true }, { status: 201 });
    });
    expect((await post("reader", "key-0004")).status).toBe(500);
    const retry = await post("reader", "key-0004");
    expect(retry.status).toBe(201);
    expect(retry.headers.get("Idempotent-Replayed")).toBeNull();
    expect(calls).toBe(2);
  });

  it("4xx 结果同样保存并重放；无正文的 204 也能重放", async () => {
    let calls = 0;
    const { post } = writeApp((body) => {
      calls += 1;
      if (body.includes("坏")) throw new AppError("bad_request", "标题不合法");
      return new Response(null, { status: 204 });
    });
    expect((await post("reader", "key-0005", '{"title":"坏"}')).status).toBe(400);
    expect((await post("reader", "key-0005", '{"title":"坏"}')).status).toBe(400);
    const replayed = await post("reader", "key-0006");
    expect(replayed.status).toBe(204);
    const again = await post("reader", "key-0006");
    expect(again.status).toBe(204);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    expect(calls).toBe(2);
  });

  it("超过上限的结果不保存正文：重复提交得到 409，也不会再执行一次", async () => {
    let calls = 0;
    const { post, store } = writeApp(() => {
      calls += 1;
      return Response.json({ items: "x".repeat(MAX_REPLAY_BODY_BYTES) }, { status: 201 });
    });
    expect((await post("reader", "key-big-01")).status).toBe(201);
    const again = await post("reader", "key-big-01");
    expect(again.status).toBe(409);
    expect(ApiErrorBody.parse(await again.json()).error).toMatchObject({
      message: "相同的请求已经完成，结果无法重放，请刷新查看最新状态",
      details: { status: 201 },
    });
    expect(calls).toBe(1);
    // Redis 里只留下几十字节的状态记录。
    const stored = [...store.entries.values()].join("");
    expect(stored.length).toBeLessThan(200);
  });

  it("非文本结果不按文本重放", async () => {
    let calls = 0;
    const { post } = writeApp(() => {
      calls += 1;
      return new Response(new Uint8Array([0xff, 0xfe, 0x00]), {
        status: 201,
        headers: { "Content-Type": "application/octet-stream" },
      });
    });
    expect((await post("reader", "key-bin-01")).status).toBe(201);
    expect((await post("reader", "key-bin-01")).status).toBe(409);
    expect(calls).toBe(1);
  });

  it("键按用户隔离；格式不合法的键返回 400", async () => {
    let calls = 0;
    const { post } = writeApp(() => {
      calls += 1;
      return Response.json({ n: calls }, { status: 201 });
    });
    await post("reader", "shared-key");
    const otherUser = await post("other", "shared-key");
    expect(otherUser.headers.get("Idempotent-Replayed")).toBeNull();
    expect(calls).toBe(2);
    expect((await post("reader", "short")).status).toBe(400);
    expect((await post("reader", "has space!")).status).toBe(400);
  });
});

describe("请求日志", () => {
  function capture() {
    const lines: Record<string, unknown>[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        for (const line of chunk.toString("utf8").split("\n")) {
          if (line) lines.push(JSON.parse(line) as Record<string, unknown>);
        }
        callback();
      },
    });
    return {
      lines,
      logger: createLogger({ LOG_LEVEL: "info", NODE_ENV: "test", MINGXI_VERSION: "test" }, destination),
    };
  }

  it("记录方法、路径、状态与 userId，不记录 Cookie 与请求体", async () => {
    const { lines, logger } = capture();
    const app = appWith({ logger, auth: fakeAuth({ reader }).port });
    await app.request("/api/me", signedIn("reader"));
    const entry = lines.find((line) => line.msg === "request");
    expect(entry).toMatchObject({ method: "GET", path: "/api/me", status: 200, userId: reader.user.id });
    expect(JSON.stringify(lines)).not.toContain("session=reader");
  });

  it("找回密码链接路径里的一次性令牌不进日志", async () => {
    const { lines, logger } = capture();
    const app = appWith({ logger });
    await app.request(
      "/api/auth/reset-password/Tok3nSecretValue123456?callbackURL=%2F",
      {},
      fromSocket("192.0.2.1"),
    );
    expect(lines.find((line) => line.msg === "request")?.path).toBe("/api/auth/reset-password/[已隐藏]");
    expect(JSON.stringify(lines)).not.toContain("Tok3nSecretValue123456");
  });

  it("凭据与用户内容字段脱敏", () => {
    const { lines, logger } = capture();
    logger.info(
      {
        req: { headers: { authorization: "Bearer abc", cookie: "mingxi.session_token=xyz" } },
        user: { password: "hunter2", token: "t-1", content: "我的笔记正文" },
      },
      "脱敏检查",
    );
    const text = JSON.stringify(lines);
    for (const secret of ["Bearer abc", "xyz", "hunter2", "t-1", "我的笔记正文"])
      expect(text).not.toContain(secret);
    expect(text).toContain("[已隐藏]");
  });
});
