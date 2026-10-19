import type { Pool } from "./pool";

/** 迁移 0001 创建的运行时权限组：只有业务表的增删改查，受行级隔离约束。 */
export const RUNTIME_GROUP_ROLE = "mingxi_runtime";
/** 迁移 0006 创建的运营后台只读权限组：只能读账号元数据与运维表的指定列，读不到任何用户内容（docs/05 §6.1）。 */
export const ADMIN_GROUP_ROLE = "mingxi_admin";

export type GroupRole = typeof RUNTIME_GROUP_ROLE | typeof ADMIN_GROUP_ROLE;

const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export class DatabaseRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseRoleError";
  }
}

export interface DatabaseRoleInfo {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
  /** 是否继承了 mingxi_runtime 的权限。 */
  inheritsRuntimeGroup: boolean;
  /** 是否继承了 mingxi_admin 的权限。 */
  inheritsAdminGroup: boolean;
}

/** 当前连接所用数据库角色的权限情况。 */
export async function inspectCurrentRole(pool: Pool): Promise<DatabaseRoleInfo> {
  const { rows } = await pool.query<{
    role: string;
    superuser: boolean;
    bypass_rls: boolean;
    inherits_runtime: boolean;
    inherits_admin: boolean;
  }>(
    `SELECT current_user AS role,
            r.rolsuper AS superuser,
            r.rolbypassrls AS bypass_rls,
            pg_has_role(current_user, $1, 'USAGE') AS inherits_runtime,
            pg_has_role(current_user, $2, 'USAGE') AS inherits_admin
       FROM pg_roles r
      WHERE r.rolname = current_user`,
    [RUNTIME_GROUP_ROLE, ADMIN_GROUP_ROLE],
  );
  const row = rows[0];
  if (!row) throw new DatabaseRoleError("无法读取当前数据库角色");
  return {
    role: row.role,
    superuser: row.superuser,
    bypassRls: row.bypass_rls,
    inheritsRuntimeGroup: row.inherits_runtime,
    inheritsAdminGroup: row.inherits_admin,
  };
}

function assertGroupRole(info: DatabaseRoleInfo, group: GroupRole, envName: string): DatabaseRoleInfo {
  const problems: string[] = [];
  if (info.superuser) problems.push("是超级用户");
  if (info.bypassRls) problems.push("带 BYPASSRLS");
  const inherits = group === RUNTIME_GROUP_ROLE ? info.inheritsRuntimeGroup : info.inheritsAdminGroup;
  const other = group === RUNTIME_GROUP_ROLE ? ADMIN_GROUP_ROLE : RUNTIME_GROUP_ROLE;
  const inheritsOther = group === RUNTIME_GROUP_ROLE ? info.inheritsAdminGroup : info.inheritsRuntimeGroup;
  if (!inherits) problems.push(`没有继承 ${group} 的权限`);
  if (inheritsOther) problems.push(`同时继承了 ${other} 的权限`);
  if (problems.length) {
    throw new DatabaseRoleError(
      `数据库角色 ${info.role} ${problems.join("、")}，隔离不会按设计生效。` +
        `请用 \`pnpm --filter @mingxi/db db:roles\` 创建普通账号，并让 ${envName} 使用它。`,
    );
  }
  return info;
}

/**
 * 运行时连接必须受行级隔离约束：不能是超级用户、不能带 BYPASSRLS，只继承 mingxi_runtime。
 * 不满足时抛错——服务启动、集成测试都调用它，避免“隔离策略写了但其实没生效”。
 */
export async function assertRuntimeRoleIsolated(pool: Pool): Promise<DatabaseRoleInfo> {
  return assertGroupRole(await inspectCurrentRole(pool), RUNTIME_GROUP_ROLE, "DATABASE_URL");
}

/** 后台连接只能有 mingxi_admin 的只读权限：不是超级用户、不带 BYPASSRLS、不继承运行时权限组。 */
export async function assertAdminRoleIsolated(pool: Pool): Promise<DatabaseRoleInfo> {
  return assertGroupRole(await inspectCurrentRole(pool), ADMIN_GROUP_ROLE, "ADMIN_DATABASE_URL");
}

/**
 * 按连接地址里的用户名与口令创建（或更新口令）登录角色，并加入指定的权限组。
 * 由表 owner 的连接执行（需要 CREATEROLE）；口令只来自环境变量，不进迁移、不写日志。
 * 已经属于另一个权限组的角色直接拒绝，不替它改成员关系——两个账号必须分开。
 */
export async function ensureLoginRole(
  ownerPool: Pool,
  connectionString: string,
  group: GroupRole,
): Promise<{ role: string; created: boolean }> {
  const url = new URL(connectionString);
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!ROLE_NAME_PATTERN.test(role)) {
    throw new DatabaseRoleError(`数据库角色名不合法（只允许小写字母、数字、下划线）：${role}`);
  }
  if (password.length < 12) throw new DatabaseRoleError(`数据库角色 ${role} 的口令至少 12 位`);
  const other = group === RUNTIME_GROUP_ROLE ? ADMIN_GROUP_ROLE : RUNTIME_GROUP_ROLE;

  const client = await ownerPool.connect();
  let brokenConnection: Error | undefined;
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ rolsuper: boolean; rolbypassrls: boolean; in_other: boolean }>(
      "SELECT rolsuper, rolbypassrls, pg_has_role(rolname, $2, 'MEMBER') AS in_other FROM pg_roles WHERE rolname = $1",
      [role, other],
    );
    const found = existing.rows[0];
    if (found && (found.rolsuper || found.rolbypassrls)) {
      throw new DatabaseRoleError(`角色 ${role} 是超级用户或带 BYPASSRLS，不能作为应用账号`);
    }
    if (found?.in_other) throw new DatabaseRoleError(`角色 ${role} 已属于 ${other}，不能同时加入 ${group}`);
    const identifier = client.escapeIdentifier(role);
    const literal = client.escapeLiteral(password);
    if (found) {
      await client.query(`ALTER ROLE ${identifier} LOGIN PASSWORD ${literal}`);
    } else {
      await client.query(
        `CREATE ROLE ${identifier} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${literal}`,
      );
    }
    await client.query(`GRANT ${client.escapeIdentifier(group)} TO ${identifier}`);
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
