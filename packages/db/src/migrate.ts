import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "./pool";

/**
 * 执行 migrationsFolder 中全部未执行的迁移（记录在 ops.schema_migrations）。
 * 迁移需要表 owner 权限，应使用直连地址而不是连接池地址。
 * 迁移目录由调用方传入：开发时是 packages/db/migrations，生产产物里是随产物复制的 dist/migrations。
 */
export async function runMigrations(pool: Pool, migrationsFolder: string): Promise<void> {
  await migrate(drizzle(pool), {
    migrationsFolder,
    migrationsSchema: "ops",
    migrationsTable: "schema_migrations",
  });
}
