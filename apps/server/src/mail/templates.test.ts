import { describe, expect, it } from "vitest";
import { retryDelaySeconds } from "./outbox";
import { renderEmail, type EmailTemplate } from "./templates";

describe("邮件模板", () => {
  it("三种模板都包含称呼与完整链接", () => {
    const url = "https://mingxi.example.com/api/auth/verify-email?token=abc&callbackURL=%2Fmingxi%2Fweb";
    for (const template of ["verify_email", "reset_password", "existing_account"] as EmailTemplate[]) {
      const mail = renderEmail(template, { name: "林小雨", url });
      expect(mail.subject.length).toBeGreaterThan(0);
      expect(mail.text).toContain("林小雨，你好：");
      expect(mail.text).toContain(url);
      expect(mail.html).toContain(url.replaceAll("&", "&amp;"));
    }
  });

  it("HTML 版本对称呼与链接转义，用户填写的昵称不能注入标签", () => {
    const mail = renderEmail("verify_email", {
      name: '<img src=x onerror="alert(1)">',
      url: 'https://x.example/"><script>alert(1)</script>',
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});

describe("发件箱重试间隔", () => {
  it("按 30 秒起、4 倍递增，上限 1 小时", () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelaySeconds)).toEqual([30, 120, 480, 1920, 3600, 3600]);
  });
});
