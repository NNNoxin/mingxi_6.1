import { describe, expect, it } from "vitest";
import type { Pool } from "./pool";
import { InvalidUserIdError, withUserTransaction } from "./user-context";

describe("withUserTransaction 参数校验", () => {
  it("userId 不是 UUID 时不取连接直接拒绝（防止把任意字符串写进会话变量）", async () => {
    let connected = false;
    const pool = {
      connect: () => {
        connected = true;
        return Promise.reject(new Error("不应该走到这里"));
      },
    } as unknown as Pool;
    await expect(
      withUserTransaction(pool, "'; drop table x; --", () => Promise.resolve(1)),
    ).rejects.toBeInstanceOf(InvalidUserIdError);
    expect(connected).toBe(false);
  });
});
