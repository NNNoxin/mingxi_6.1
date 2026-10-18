// 生产迁移入口：部署流程在启动新版本前执行 `node dist/migrate.js`（Render 的 pre-deploy 命令）。
// 迁移文件在构建时复制到 dist/migrations，产物自包含，不依赖源码目录。
import { fileURLToPath } from "node:url";
import { createPool, runMigrations } from "@mingxi/db";

const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!connectionString) {
  process.stderr.write("缺少 DATABASE_URL_DIRECT（或 DATABASE_URL），无法执行迁移\n");
  process.exit(1);
}

const pool = createPool({ connectionString, max: 1, applicationName: "mingxi-migrate" });
try {
  await runMigrations(pool, fileURLToPath(new URL("./migrations", import.meta.url)));
  process.stdout.write("迁移完成\n");
} finally {
  await pool.end();
}
