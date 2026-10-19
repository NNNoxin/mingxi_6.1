import { describe, expect, it } from "vitest";
import { totpCode } from "./test-totp";

describe("测试用 TOTP", () => {
  it("与 RFC 6238 附录 B 的 SHA-1 测试向量一致", () => {
    const key = Buffer.from("12345678901234567890");
    expect(totpCode(key, 59_000, 8)).toBe("94287082");
    expect(totpCode(key, 1_111_111_109_000, 8)).toBe("07081804");
    expect(totpCode(key, 2_000_000_000_000, 8)).toBe("69279037");
  });
});
