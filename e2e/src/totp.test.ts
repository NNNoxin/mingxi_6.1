import { describe, expect, it } from "vitest";
import { base32Decode, totpCode } from "./totp";

describe("测试用 TOTP", () => {
  it("与 RFC 6238 附录 B 的 SHA-1 测试向量一致", () => {
    const key = Buffer.from("12345678901234567890");
    expect(totpCode(key, 59_000, 8)).toBe("94287082");
    expect(totpCode(key, 1_111_111_109_000, 8)).toBe("07081804");
  });

  it("base32 解码", () => {
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").toString()).toBe("12345678901234567890");
  });
});
