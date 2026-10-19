import { describe, expect, it } from "vitest";
import { failureMessage, linkErrorMessage } from "./messages";
import { safeNextPath, WORKBENCH_PATH } from "./paths";

describe("认证错误文案", () => {
  it("已知错误码翻译成中文", () => {
    expect(
      failureMessage({
        kind: "error",
        status: 401,
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      }),
    ).toBe("邮箱或密码不对");
  });

  it("弱密码显示服务端给出的具体原因", () => {
    expect(
      failureMessage({
        kind: "error",
        status: 400,
        code: "WEAK_PASSWORD",
        message: "这个密码太常见了，换一个更难猜的",
      }),
    ).toBe("这个密码太常见了，换一个更难猜的");
  });

  it("未知错误不吞掉：附上错误码或状态码", () => {
    expect(failureMessage({ kind: "error", status: 500, code: null, message: null })).toBe(
      "出了点问题，请稍后再试（HTTP 500）",
    );
    expect(
      failureMessage({ kind: "error", status: 422, code: "FAILED_TO_CREATE_USER", message: null }),
    ).toContain("FAILED_TO_CREATE_USER");
  });

  it("限流与网络错误", () => {
    expect(failureMessage({ kind: "rate_limited", retryAfterSeconds: 42 })).toBe(
      "尝试次数太多，请 42 秒后再试",
    );
    expect(failureMessage({ kind: "rate_limited", retryAfterSeconds: 290 })).toBe(
      "尝试次数太多，请 5 分钟后再试",
    );
    expect(failureMessage({ kind: "rate_limited", retryAfterSeconds: null })).toBe(
      "尝试次数太多，请稍后再试",
    );
    expect(failureMessage({ kind: "network" })).toBe("连不上服务器，请检查网络后重试");
  });

  it("邮件链接的错误码", () => {
    expect(linkErrorMessage("TOKEN_EXPIRED")).toBe("链接已过期，请重新申请");
    expect(linkErrorMessage("SOMETHING_NEW")).toContain("SOMETHING_NEW");
  });
});

describe("登录后跳转地址", () => {
  it("只接受本站相对路径", () => {
    expect(safeNextPath("/mingxi/web?tab=logic")).toBe("/mingxi/web?tab=logic");
    for (const unsafe of [
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(unsafe)).toBe(WORKBENCH_PATH);
    }
  });
});
