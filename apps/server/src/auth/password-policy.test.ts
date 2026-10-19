import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password-policy";

const context = { email: "lin.xiaoyu@example.com", name: "林小雨" };

describe("密码规则", () => {
  it("合格的密码通过", () => {
    expect(passwordProblem("灯塔-paper-river-42", context)).toBeNull();
  });

  it("长度不在 8–128 之间时拒绝", () => {
    expect(passwordProblem("abc12", context)).toContain("至少 8 位");
    expect(passwordProblem("a".repeat(64) + "b".repeat(65), context)).toContain("最多 128 位");
  });

  it("常见弱密码（含中文拼音与数字谐音）不分大小写拒绝", () => {
    for (const weak of ["12345678", "Password1", "woaini1314", "QWERTYUI", "5201314520"]) {
      expect(passwordProblem(weak, context), weak).toBe("这个密码太常见了，换一个更难猜的");
    }
  });

  it("只由一两个字符重复组成时拒绝", () => {
    expect(passwordProblem("abababababab", context)).toContain("一两个字符");
  });

  it("包含邮箱用户名时拒绝", () => {
    expect(passwordProblem("lin.xiaoyu-2026", context)).toContain("邮箱用户名");
  });
});
