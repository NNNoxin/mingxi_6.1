import type { PoolClient } from "@mingxi/db";
import { schema } from "@mingxi/db";

export type UserRole = (typeof schema.USER_ROLES)[number];
/** 工作人员角色（docs/05 §5）；user 为普通用户。 */
export const STAFF_ROLES = ["admin", "support", "analyst"] as const satisfies readonly UserRole[];

export function isUserRole(value: string): value is UserRole {
  return (schema.USER_ROLES as readonly string[]).includes(value);
}

export class StaffRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffRoleError";
  }
}

export interface RoleChange {
  userId: string;
  from: UserRole;
  to: UserRole;
}

/**
 * 修改账号角色，并在同一事务里写审计。调用方负责开事务（命令行用表 owner 的连接，后台接口用运行时账号）。
 * - 账号必须存在且已验证邮箱；
 * - 至少保留一个已开启两步验证的管理员（EC-A6）：先锁住全部管理员行再计数，两个并发的撤销不会同时成功。
 */
export async function changeRole(
  client: PoolClient,
  input: { email: string; role: UserRole; actorUserId: string | null; via: "cli" | "admin"; reason: string },
): Promise<RoleChange> {
  const found = await client.query<{ id: string; role: UserRole; email_verified: boolean }>(
    "SELECT id, role, email_verified FROM auth.users WHERE email = $1 FOR UPDATE",
    [input.email],
  );
  const user = found.rows[0];
  if (!user) throw new StaffRoleError(`没有邮箱为 ${input.email} 的账号：请先在正式站注册并验证邮箱`);
  if (!user.email_verified) throw new StaffRoleError(`账号 ${input.email} 还没有验证邮箱`);
  if (user.role === input.role) return { userId: user.id, from: user.role, to: input.role };

  if (user.role === "admin") {
    const admins = await client.query<{ id: string; two_factor_enabled: boolean }>(
      "SELECT id, two_factor_enabled FROM auth.users WHERE role = 'admin' FOR UPDATE",
    );
    const remaining = admins.rows.filter((row) => row.id !== user.id && row.two_factor_enabled);
    if (remaining.length === 0) {
      throw new StaffRoleError("不能撤销最后一个已开启两步验证的管理员：先让另一位管理员开启两步验证");
    }
  }
  await client.query("UPDATE auth.users SET role = $2 WHERE id = $1", [user.id, input.role]);
  await client.query(
    `INSERT INTO ops.audit_log (actor_user_id, action, target_type, target_id, metadata)
     VALUES ($1, 'staff.role_changed', 'user', $2, $3)`,
    [
      input.actorUserId,
      user.id,
      JSON.stringify({ from: user.role, to: input.role, via: input.via, reason: input.reason }),
    ],
  );
  return { userId: user.id, from: user.role, to: input.role };
}
