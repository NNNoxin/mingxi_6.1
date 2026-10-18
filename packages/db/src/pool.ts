import pg from "pg";

export interface PoolOptions {
  connectionString: string;
  /** 每个进程的最大连接数；生产环境经 PgBouncer / Neon pooler 时保持较小。 */
  max?: number;
  /** 单条语句超时（毫秒），防止慢查询拖垮连接池。 */
  statementTimeoutMs?: number;
  applicationName: string;
}

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(options: PoolOptions): Pool {
  return new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    statement_timeout: options.statementTimeoutMs ?? 15_000,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: options.applicationName,
  });
}
