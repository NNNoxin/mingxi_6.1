import { fileURLToPath } from "node:url";
import { runMigrations } from "../migrate";
import { createPool } from "../pool";

// 迁移用表 owner 的直连地址；DATABASE_URL 是受行级隔离约束的运行时账号，没有建表权限。
const connectionString = process.env.DATABASE_URL_DIRECT;
if (!connectionString) {
  process.stderr.write("缺少 DATABASE_URL_DIRECT（表 owner 的直连地址），无法执行迁移\n");
  process.exit(1);
}

const pool = createPool({ connectionString, max: 1, applicationName: "mingxi-migrate" });
try {
  await runMigrations(pool, fileURLToPath(new URL("../../migrations", import.meta.url)));
  process.stdout.write("迁移完成\n");
} finally {
  await pool.end();
}
