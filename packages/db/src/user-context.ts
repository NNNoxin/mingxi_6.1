import type { Pool, PoolClient } from "./pool";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidUserIdError extends Error {
  constructor(value: string) {
    super(`userId 不是合法的 UUID：${value}`);
    this.name = "InvalidUserIdError";
  }
}

/**
 * 在一个事务里以指定用户身份执行操作。
 *
 * 事务开始后执行 `set_config('app.user_id', userId, true)`（仅本事务有效），
 * 所有启用行级安全的表都按这个值过滤——这是“服务层带 user_id 条件”之外的第二道隔离防线。
 * 回调抛错时整个事务回滚并原样抛出原始错误；如果连回滚都失败（连接已损坏），
 * 这条连接会被销毁而不是放回连接池，避免后续请求拿到处于未知事务状态的连接。
 */
export async function withUserTransaction<T>(
  pool: Pool,
  userId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(userId)) throw new InvalidUserIdError(userId);
  const client = await pool.connect();
  let brokenConnection: Error | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      brokenConnection = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(brokenConnection);
  }
}
