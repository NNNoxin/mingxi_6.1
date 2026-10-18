import { fileURLToPath } from "node:url";
import { runMigrations } from "../migrate";
import { createPool } from "../pool";

const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!connectionString) {
  process.stderr.write("缺少 DATABASE_URL_DIRECT（或 DATABASE_URL），无法执行迁移\n");
  process.exit(1);
}

const pool = createPool({ connectionString, max: 1, applicationName: "mingxi-migrate" });
try {
  await runMigrations(pool, fileURLToPath(new URL("../../migrations", import.meta.url)));
  process.stdout.write("迁移完成\n");
} finally {
  await pool.end();
}
