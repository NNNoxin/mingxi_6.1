// 用法：pnpm --filter @mingxi/db db:roles
// 按连接地址里的用户名与口令创建应用的数据库登录账号（需先执行迁移），用 DATABASE_URL_DIRECT（表 owner，需要 CREATEROLE）执行：
// - DATABASE_URL：运行时账号，加入 mingxi_runtime（必填）；
// - ADMIN_DATABASE_URL：运营后台只读账号，加入 mingxi_admin（启用运营后台时必填）。
// 本地、CI、生产都用这一条命令。
import { createPool } from "../pool";
import {
  ADMIN_GROUP_ROLE,
  assertAdminRoleIsolated,
  assertRuntimeRoleIsolated,
  ensureLoginRole,
  RUNTIME_GROUP_ROLE,
} from "../db-roles";

const ownerUrl = process.env.DATABASE_URL_DIRECT;
const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!ownerUrl || !runtimeUrl) {
  process.stderr.write("需要 DATABASE_URL_DIRECT（表 owner）与 DATABASE_URL（运行时账号）\n");
  process.exit(1);
}

const ownerPool = createPool({ connectionString: ownerUrl, max: 1, applicationName: "mingxi-db-roles" });
const pools = [ownerPool];
try {
  const runtime = await ensureLoginRole(ownerPool, runtimeUrl, RUNTIME_GROUP_ROLE);
  const runtimePool = createPool({
    connectionString: runtimeUrl,
    max: 1,
    applicationName: "mingxi-db-roles",
  });
  pools.push(runtimePool);
  await assertRuntimeRoleIsolated(runtimePool);
  process.stdout.write(
    `运行时账号 ${runtime.role} 已${runtime.created ? "创建" : "更新口令"}，并确认受行级隔离约束\n`,
  );

  if (adminUrl) {
    const admin = await ensureLoginRole(ownerPool, adminUrl, ADMIN_GROUP_ROLE);
    const adminPool = createPool({ connectionString: adminUrl, max: 1, applicationName: "mingxi-db-roles" });
    pools.push(adminPool);
    await assertAdminRoleIsolated(adminPool);
    process.stdout.write(
      `后台只读账号 ${admin.role} 已${admin.created ? "创建" : "更新口令"}，并确认只有只读权限\n`,
    );
  } else {
    process.stdout.write("没有设置 ADMIN_DATABASE_URL：未创建运营后台只读账号（不启用运营后台时可以不设）\n");
  }
} finally {
  await Promise.all(pools.map((pool) => pool.end()));
}
