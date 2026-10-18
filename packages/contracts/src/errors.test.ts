import { describe, expect, it } from "vitest";
import { ApiErrorBody, ErrorCode, HTTP_STATUS_BY_CODE } from "./errors";

describe("错误契约", () => {
  it("每个错误码都映射到一个 4xx/5xx 状态码", () => {
    for (const code of ErrorCode.options) {
      const status = HTTP_STATUS_BY_CODE[code];
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it("拒绝未登记的错误码", () => {
    const parsed = ApiErrorBody.safeParse({
      error: { code: "teapot", message: "x", requestId: "r1" },
    });
    expect(parsed.success).toBe(false);
  });

  it("接受完整的错误体", () => {
    const parsed = ApiErrorBody.parse({
      error: { code: "not_found", message: "笔记不存在", requestId: "r1" },
    });
    expect(parsed.error.code).toBe("not_found");
  });
});
