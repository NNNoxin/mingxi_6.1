import type { Pool } from "./pool";

/** 迁移 0001 创建的运行时权限组：只有业务表的增删改查，受行级隔离约束。 */
export const RUNTIME_GROUP_ROLE = "mingxi_runtime";

const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export class RuntimeRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeRoleError";
  }
}

export interface RuntimeRoleInfo {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
  /** 是否继承了 mingxi_runtime 的权限。 */
  inheritsRuntimeGroup: boolean;
}

/** 当前连接所用数据库角色的权限情况。 */
export async function inspectCurrentRole(pool: Pool): Promise<RuntimeRoleInfo> {
  const { rows } = await pool.query<{
    role: string;
    superuser: boolean;
    bypass_rls: boolean;
    inherits_runtime: boolean;
  }>(
    `SELECT current_user AS role,
            r.rolsuper AS superuser,
            r.rolbypassrls AS bypass_rls,
            pg_has_role(current_user, $1, 'USAGE') AS inherits_runtime
       FROM pg_roles r
      WHERE r.rolname = current_user`,
    [RUNTIME_GROUP_ROLE],
  );
  const row = rows[0];
  if (!row) throw new RuntimeRoleError("无法读取当前数据库角色");
  return {
    role: row.role,
    superuser: row.superuser,
    bypassRls: row.bypass_rls,
    inheritsRuntimeGroup: row.inherits_runtime,
  };
}

/**
 * 运行时连接必须受行级隔离约束：不能是超级用户、不能带 BYPASSRLS，并且继承 mingxi_runtime 的权限。
 * 不满足时抛错——服务启动、集成测试都调用它，避免“隔离策略写了但其实没生效”。
 */
export async function assertRuntimeRoleIsolated(pool: Pool): Promise<RuntimeRoleInfo> {
  const info = await inspectCurrentRole(pool);
  const problems: string[] = [];
  if (info.superuser) problems.push("是超级用户");
  if (info.bypassRls) problems.push("带 BYPASSRLS");
  if (!info.inheritsRuntimeGroup) problems.push(`没有继承 ${RUNTIME_GROUP_ROLE} 的权限`);
  if (problems.length) {
    throw new RuntimeRoleError(
      `运行时数据库角色 ${info.role} ${problems.join("、")}，行级隔离不会生效。` +
        `请用 \`pnpm --filter @mingxi/db db:runtime-role\` 创建普通运行时账号，并让 DATABASE_URL 使用它。`,
    );
  }
  return info;
}

/**
 * 按运行时连接地址里的用户名与口令创建（或更新口令）登录角色，并加入 mingxi_runtime。
 * 由表 owner 的连接执行（需要 CREATEROLE）；口令只来自环境变量，不进迁移、不写日志。
 */
export async function ensureRuntimeLoginRole(
  ownerPool: Pool,
  runtimeConnectionString: string,
): Promise<{ role: string; created: boolean }> {
  const url = new URL(runtimeConnectionString);
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!ROLE_NAME_PATTERN.test(role)) {
    throw new RuntimeRoleError(`运行时角色名不合法（只允许小写字母、数字、下划线）：${role}`);
  }
  if (password.length < 12) throw new RuntimeRoleError("运行时角色口令至少 12 位");

  const client = await ownerPool.connect();
  let brokenConnection: Error | undefined;
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1",
      [role],
    );
    const found = existing.rows[0];
    if (found && (found.rolsuper || found.rolbypassrls)) {
      throw new RuntimeRoleError(`角色 ${role} 是超级用户或带 BYPASSRLS，不能作为运行时账号`);
    }
    const identifier = client.escapeIdentifier(role);
    const literal = client.escapeLiteral(password);
    if (found) {
      await client.query(`ALTER ROLE ${identifier} LOGIN PASSWORD ${literal}`);
    } else {
      await client.query(
        `CREATE ROLE ${identifier} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${literal}`,
      );
    }
    await client.query(`GRANT ${client.escapeIdentifier(RUNTIME_GROUP_ROLE)} TO ${identifier}`);
    await client.query("COMMIT");
    return { role, created: !found };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      brokenConnection = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(brokenConnection);
  }
}
