import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate";
import { createPool, type Pool } from "./pool";
import { assertRuntimeRoleIsolated, ensureRuntimeLoginRole } from "./runtime-role";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export interface IntegrationDatabase {
  /** 表 owner 的连接：只用于迁移与测试准备，绕不过强制行级隔离。 */
  ownerPool: Pool;
  /** 运行时账号的连接：与生产相同的权限，测试业务行为与隔离都用它。 */
  appPool: Pool;
  close(): Promise<void>;
}

/**
 * 集成测试用的真实数据库：执行全部迁移、按 TEST_APP_DATABASE_URL 创建运行时账号，并确认它受行级隔离约束。
 * - TEST_DATABASE_URL：表 owner（CI 里是服务容器的超级用户，本地是有 CREATEROLE 的库 owner）；
 * - TEST_APP_DATABASE_URL：运行时账号（普通角色，mingxi_runtime 成员）。
 */
export async function prepareIntegrationDatabase(applicationName: string): Promise<IntegrationDatabase> {
  const ownerUrl = process.env.TEST_DATABASE_URL;
  const appUrl = process.env.TEST_APP_DATABASE_URL;
  if (!ownerUrl || !appUrl) {
    throw new Error(
      "集成测试需要 TEST_DATABASE_URL（表 owner）与 TEST_APP_DATABASE_URL（运行时账号），都指向真实的 PostgreSQL",
    );
  }
  const ownerPool = createPool({ connectionString: ownerUrl, max: 2, applicationName });
  await runMigrations(ownerPool, MIGRATIONS_FOLDER);
  await ensureRuntimeLoginRole(ownerPool, appUrl);
  const appPool = createPool({ connectionString: appUrl, max: 4, applicationName });
  await assertRuntimeRoleIsolated(appPool);
  return {
    ownerPool,
    appPool,
    close: async () => {
      await Promise.all([ownerPool.end(), appPool.end()]);
    },
  };
}
