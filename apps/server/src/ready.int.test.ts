import { pino } from "pino";
import { afterAll, describe, expect, it } from "vitest";
import { ReadinessResponse } from "@mingxi/contracts";
import { createApp } from "./app";
import { createRuntime, type Runtime } from "./runtime";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const REDIS_URL = process.env.TEST_REDIS_URL;
if (!DATABASE_URL || !REDIS_URL) {
  throw new Error("集成测试需要 TEST_DATABASE_URL 与 TEST_REDIS_URL（指向真实的 PostgreSQL 与 Redis）");
}

const silent = pino({ level: "silent" });
const noAuth = { handler: () => Promise.resolve(new Response(null, { status: 404 })) };
const runtimes: Runtime[] = [];

afterAll(async () => {
  await Promise.all(runtimes.map((runtime) => runtime.close()));
});

describe("就绪检查（真实依赖）", () => {
  it("PostgreSQL 与 Redis 都可用时返回 ready", async () => {
    const runtime = createRuntime({ DATABASE_URL, REDIS_URL }, silent);
    runtimes.push(runtime);
    expect(await runtime.waitForRedis(5_000)).toBe(true);
    const app = createApp({ logger: silent, version: "it", probes: runtime.probes, auth: noAuth });
    const response = await app.request("/api/ready");
    const body = ReadinessResponse.parse(await response.json());
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.checks.every((check) => check.ok)).toBe(true);
  });

  it("Redis 地址不可达时如实报告不可用", async () => {
    const runtime = createRuntime({ DATABASE_URL, REDIS_URL: "redis://127.0.0.1:1" }, silent);
    runtimes.push(runtime);
    expect(await runtime.waitForRedis(300)).toBe(false);
    const app = createApp({ logger: silent, version: "it", probes: runtime.probes, auth: noAuth });
    const response = await app.request("/api/ready");
    expect(response.status).toBe(503);
    const body = ReadinessResponse.parse(await response.json());
    expect(body.checks.find((check) => check.name === "postgres")?.ok).toBe(true);
    expect(body.checks.find((check) => check.name === "redis")?.ok).toBe(false);
  });
});
