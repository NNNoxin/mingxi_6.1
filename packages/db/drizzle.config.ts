import { defineConfig } from "drizzle-kit";

// 迁移只前进；生成的 SQL 必须人工审阅后提交。表结构定义在 src/schema 下（P3 起逐步加入）。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  migrations: { schema: "ops", table: "schema_migrations" },
});
