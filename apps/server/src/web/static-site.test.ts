import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { fakeAuth, memoryIdempotencyStore, memoryRateLimiter, noDatabase } from "../test-doubles";
import { staticSite } from "./static-site";

function buildOutput() {
  const root = mkdtempSync(join(tmpdir(), "mingxi-web-"));
  mkdirSync(join(root, "_next/static/chunks"), { recursive: true });
  writeFileSync(join(root, "404.html"), "<h1>找不到页面</h1>");
  writeFileSync(join(root, "login.html"), "<h1>登录明晰</h1>");
  writeFileSync(join(root, "_next/static/chunks/app-1a2b.js"), "console.log(1)");
  return root;
}

function appServing(root: string) {
  return createApp({
    logger: pino({ level: "silent" }),
    version: "test",
    probes: [],
    auth: fakeAuth().port,
    publicOrigin: "http://localhost:8787",
    trustedProxyHops: 0,
    rateLimiter: memoryRateLimiter(),
    idempotencyStore: memoryIdempotencyStore(),
    withUserTransaction: noDatabase,
    webRoot: root,
  });
}

describe("正式站静态产物", () => {
  const app = appServing(buildOutput());

  it("/login 返回 login.html，每次向服务器确认", async () => {
    const response = await app.request("/login");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(await response.text()).toContain("登录明晰");
  });

  it("带哈希的静态资源长期缓存", async () => {
    const response = await app.request("/_next/static/chunks/app-1a2b.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("不存在的页面、跳出目录的路径、无法解码的路径都返回 404 页面", async () => {
    for (const path of ["/nope", "/..%2f..%2fetc%2fpasswd", "/%E0%A4%A"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
      expect(await response.text()).toContain("找不到页面");
    }
  });

  it("/api/* 不经过静态托管：未知接口仍是 JSON 错误", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const unknown = await app.request("/api/nope");
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("Content-Type")).toContain("application/json");
  });

  it("目录不是构建产物时启动即失败", () => {
    expect(() => staticSite(mkdtempSync(join(tmpdir(), "mingxi-empty-")))).toThrow(/不是正式站的构建产物/);
  });
});
