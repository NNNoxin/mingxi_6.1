import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { createPool } from "./pool";
import { withUserTransaction } from "./user-context";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error("集成测试需要 TEST_DATABASE_URL（指向真实的 PostgreSQL）");

const pool = createPool({ connectionString: DATABASE_URL, max: 1, applicationName: "mingxi-db-test" });
const USER_A = "0192f7a0-0000-7000-8000-00000000000a";
const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

beforeAll(async () => {
  await runMigrations(pool, MIGRATIONS);
});

afterAll(async () => {
  await pool.end();
});

describe("迁移", () => {
  it("可重复执行（已执行的迁移不会再跑）", async () => {
    await expect(runMigrations(pool, MIGRATIONS)).resolves.toBeUndefined();
  });

  it("创建所需扩展", async () => {
    const { rows } = await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = ANY($1) ORDER BY extname",
      [["citext", "pg_trgm", "vector"]],
    );
    expect(rows.map((row) => row.extname)).toEqual(["citext", "pg_trgm", "vector"]);
  });

  it("创建按职责划分的 schema", async () => {
    const { rows } = await pool.query<{ nspname: string }>(
      "SELECT nspname FROM pg_namespace WHERE nspname = ANY($1) ORDER BY nspname",
      [["agent", "app", "auth", "memory", "ops"]],
    );
    expect(rows.map((row) => row.nspname)).toEqual(["agent", "app", "auth", "memory", "ops"]);
  });
});

describe("withUserTransaction", () => {
  it("事务内可读到 app.user_id", async () => {
    const seen = await withUserTransaction(pool, USER_A, async (client) => {
      const { rows } = await client.query<{ uid: string }>("SELECT current_setting('app.user_id') AS uid");
      return rows[0]?.uid;
    });
    expect(seen).toBe(USER_A);
  });

  it("事务结束后同一连接上不残留用户身份", async () => {
    await withUserTransaction(pool, USER_A, () => Promise.resolve());
    // 连接池只有 1 个连接，这里拿到的一定是刚才那条连接。
    const { rows } = await pool.query<{ uid: string | null }>(
      "SELECT current_setting('app.user_id', true) AS uid",
    );
    expect(rows[0]?.uid ?? "").toBe("");
  });

  it("回调抛错时回滚并原样抛出", async () => {
    await pool.query("CREATE TEMP TABLE IF NOT EXISTS tx_probe (v int)");
    await pool.query("TRUNCATE tx_probe");
    const failure = new Error("业务失败");
    await expect(
      withUserTransaction(pool, USER_A, async (client) => {
        await client.query("INSERT INTO tx_probe VALUES (1)");
        throw failure;
      }),
    ).rejects.toBe(failure);
    const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM tx_probe");
    expect(rows[0]?.n).toBe("0");
  });
});
