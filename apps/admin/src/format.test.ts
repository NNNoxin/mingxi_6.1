import { describe, expect, it } from "vitest";
import { actionLabel, deviceLabel, formatTime } from "./format";
import { authFailureMessage } from "./messages";

describe("后台显示格式", () => {
  it("时间按北京时间显示", () => {
    expect(formatTime("2026-10-19T16:30:00.000Z")).toBe("2026-10-20 00:30");
    expect(formatTime(null)).toBe("—");
  });

  it("审计操作与设备的中文名", () => {
    expect(actionLabel("admin.user_frozen")).toBe("冻结账号");
    expect(actionLabel("future.action")).toBe("future.action");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      ),
    ).toBe("Safari · macOS");
    expect(deviceLabel(null)).toBe("未知设备");
  });

  it("登录失败的说明不吞掉未知错误", () => {
    expect(
      authFailureMessage({
        ok: false,
        status: 401,
        code: "INVALID_CODE",
        message: null,
        retryAfterSeconds: null,
      }),
    ).toContain("验证码不对");
    expect(
      authFailureMessage({ ok: false, status: 500, code: null, message: null, retryAfterSeconds: null }),
    ).toBe("登录失败（HTTP 500）");
    expect(
      authFailureMessage({ ok: false, status: 429, code: null, message: null, retryAfterSeconds: 30 }),
    ).toBe("尝试次数太多，请 30 秒后再试");
  });
});
