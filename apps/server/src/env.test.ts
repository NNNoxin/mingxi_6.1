import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://app:secret@localhost:5432/mingxi",
  REDIS_URL: "redis://localhost:6379",
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
    expect(() => loadEnv({ ...valid, MINGXI_PROCESS_ROLES: "api,worker" })).toThrow(EnvError);
  });

  it("拒绝越界端口", () => {
    expect(() => loadEnv({ ...valid, PORT: "70000" })).toThrow(EnvError);
  });
});
