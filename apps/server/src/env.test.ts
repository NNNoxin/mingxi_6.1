import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://app:secret@localhost:5432/mingxi",
  REDIS_URL: "redis://localhost:6379",
  MINGXI_PUBLIC_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "x".repeat(32),
  MAIL_TRANSPORT: "smtp",
  SMTP_URL: "smtp://localhost:2525",
  MAIL_FROM: "明晰 <no-reply@example.com>",
};

describe("环境变量校验", () => {
  it("给出默认值", () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(8787);
    expect(env.NODE_ENV).toBe("development");
    expect(env.MINGXI_PROCESS_ROLES).toEqual(["api"]);
  });

  it("缺少必填项时拒绝启动，并一次列出所有问题", () => {
    let caught: unknown;
    try {
      loadEnv({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvError);
    const issues = (caught as EnvError).issues.join("\n");
    expect(issues).toContain("DATABASE_URL");
    expect(issues).toContain("REDIS_URL");
  });

  it("拒绝非 postgres 协议的数据库地址", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toThrow(EnvError);
  });

  it("拒绝尚未实现的进程角色", () => {
    expect(loadEnv({ ...valid, MINGXI_PROCESS_ROLES: "api,worker" }).MINGXI_PROCESS_ROLES).toEqual([
      "api",
      "worker",
    ]);
    expect(() => loadEnv({ ...valid, MINGXI_PROCESS_ROLES: "api,web" })).toThrow(EnvError);
  });

  it("认证密钥至少 32 个字符", () => {
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("smtp 投递必须提供 SMTP_URL；生产环境不能只写日志", () => {
    expect(() => loadEnv({ ...valid, SMTP_URL: undefined })).toThrow(/SMTP_URL/);
    expect(loadEnv({ ...valid, MAIL_TRANSPORT: "log", SMTP_URL: undefined }).MAIL_TRANSPORT).toBe("log");
    // .env 里留空的 SMTP_URL= 视为未设置。
    expect(loadEnv({ ...valid, MAIL_TRANSPORT: "log", SMTP_URL: "" }).SMTP_URL).toBeUndefined();
    expect(() => loadEnv({ ...valid, MAIL_TRANSPORT: "log", NODE_ENV: "production" })).toThrow(
      /生产环境不能使用 log/,
    );
  });

  it("第三方登录的 ID 与密钥必须成对提供", () => {
    expect(() => loadEnv({ ...valid, GITHUB_CLIENT_ID: "id-only" })).toThrow(/GITHUB_CLIENT_ID/);
    const env = loadEnv({ ...valid, GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" });
    expect(env.GITHUB_CLIENT_ID).toBe("id");
    expect(loadEnv({ ...valid, GOOGLE_CLIENT_ID: "  " }).GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("拒绝越界端口", () => {
    expect(() => loadEnv({ ...valid, PORT: "70000" })).toThrow(EnvError);
  });
});
