// 用法：pnpm --filter @mingxi/db db:runtime-role
// 按 DATABASE_URL 里的用户名与口令创建运行时登录账号并加入 mingxi_runtime（需先执行迁移）。
// 用 DATABASE_URL_DIRECT（表 owner，需要 CREATEROLE）执行。本地、CI、生产都用这一条命令。
import { createPool } from "../pool";
import { assertRuntimeRoleIsolated, ensureRuntimeLoginRole } from "../runtime-role";

const ownerUrl = process.env.DATABASE_URL_DIRECT;
const runtimeUrl = process.env.DATABASE_URL;
if (!ownerUrl || !runtimeUrl) {
  process.stderr.write("需要 DATABASE_URL_DIRECT（表 owner）与 DATABASE_URL（运行时账号）\n");
  process.exit(1);
}

const ownerPool = createPool({ connectionString: ownerUrl, max: 1, applicationName: "mingxi-runtime-role" });
const runtimePool = createPool({
  connectionString: runtimeUrl,
  max: 1,
  applicationName: "mingxi-runtime-role",
});
try {
  const { role, created } = await ensureRuntimeLoginRole(ownerPool, runtimeUrl);
  await assertRuntimeRoleIsolated(runtimePool);
  process.stdout.write(`运行时账号 ${role} 已${created ? "创建" : "更新口令"}，并确认受行级隔离约束\n`);
} finally {
  await Promise.all([ownerPool.end(), runtimePool.end()]);
}
