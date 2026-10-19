import type { PoolClient } from "./pool";

export class AccountUnavailableError extends Error {
  readonly userId: string;
  readonly reason: "not_found" | "frozen";

  constructor(userId: string, reason: "not_found" | "frozen") {
    super(reason === "frozen" ? `账号 ${userId} 已冻结（申请删除中）` : `账号 ${userId} 不存在`);
    this.name = "AccountUnavailableError";
    this.userId = userId;
    this.reason = reason;
  }
}

/**
 * 异步任务执行前重新校验账号状态（docs/02 §4.4 隔离点 7、EC-U4）：
 * 账号已删除或已冻结时抛错，任务直接放弃，不再读写这个用户的数据。
 * 在任务自己的用户事务里调用；FOR SHARE 让并发的“删除账号”等这个任务的事务结束后再继续。
 */
export async function assertAccountActive(client: PoolClient, userId: string): Promise<void> {
  const { rows } = await client.query<{ status: string }>(
    "SELECT status FROM auth.users WHERE id = $1 FOR SHARE",
    [userId],
  );
  const row = rows[0];
  if (!row) throw new AccountUnavailableError(userId, "not_found");
  if (row.status !== "active") throw new AccountUnavailableError(userId, "frozen");
}
