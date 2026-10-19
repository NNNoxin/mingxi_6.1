import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate";
import { createPool, type Pool } from "./pool";
import {
  ADMIN_GROUP_ROLE,
  assertAdminRoleIsolated,
  assertRuntimeRoleIsolated,
  ensureLoginRole,
  RUNTIME_GROUP_ROLE,
} from "./db-roles";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export interface IntegrationDatabase {
  /** 表 owner 的连接：只用于迁移与测试准备，绕不过强制行级隔离。 */
  ownerPool: Pool;
  /** 运行时账号的连接：与生产相同的权限，测试业务行为与隔离都用它。 */
  appPool: Pool;
  /** 运营后台只读账号的连接：与生产相同的权限（mingxi_admin）。 */
  adminPool: Pool;
  close(): Promise<void>;
}

/**
 * 集成测试用的真实数据库：执行全部迁移，按连接地址创建两个应用账号，并确认各自只有设计内的权限。
 * - TEST_DATABASE_URL：表 owner（CI 里是服务容器的超级用户，本地是有 CREATEROLE 的库 owner）；
 * - TEST_APP_DATABASE_URL：运行时账号（普通角色，mingxi_runtime 成员）；
 * - TEST_ADMIN_DATABASE_URL：运营后台只读账号（普通角色，mingxi_admin 成员）。
 */
export async function prepareIntegrationDatabase(applicationName: string): Promise<IntegrationDatabase> {
  const ownerUrl = process.env.TEST_DATABASE_URL;
  const appUrl = process.env.TEST_APP_DATABASE_URL;
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  if (!ownerUrl || !appUrl || !adminUrl) {
    throw new Error(
      "集成测试需要 TEST_DATABASE_URL（表 owner）、TEST_APP_DATABASE_URL（运行时账号）与 TEST_ADMIN_DATABASE_URL（后台只读账号），都指向真实的 PostgreSQL",
    );
  }
  const ownerPool = createPool({ connectionString: ownerUrl, max: 2, applicationName });
  await runMigrations(ownerPool, MIGRATIONS_FOLDER);
  await ensureLoginRole(ownerPool, appUrl, RUNTIME_GROUP_ROLE);
  await ensureLoginRole(ownerPool, adminUrl, ADMIN_GROUP_ROLE);
  const appPool = createPool({ connectionString: appUrl, max: 4, applicationName });
  const adminPool = createPool({ connectionString: adminUrl, max: 2, applicationName });
  await assertRuntimeRoleIsolated(appPool);
  await assertAdminRoleIsolated(adminPool);
  return {
    ownerPool,
    appPool,
    adminPool,
    close: async () => {
      await Promise.all([ownerPool.end(), appPool.end(), adminPool.end()]);
    },
  };
}
