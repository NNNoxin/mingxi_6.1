import type { UserRole } from "@mingxi/contracts";
import type { Pool, PoolClient } from "@mingxi/db";
import { AppError } from "../errors";
import { changeRole, StaffRoleError } from "../staff/roles";

// 后台的写操作。逐个实现、走运行时账号，每个操作与它的审计记录在同一事务里写入（docs/05 §3 第 4 条）：
// 审计写不进去，操作本身也回滚。

/** 需要认证模块完成的操作（发邮件），由 auth.ts 实现。 */
export interface AdminAuthActions {
  resendVerification: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

export interface Actor {
  userId: string;
  /** 执行者当前这次登录的会话（撤销全部工作人员会话时保留它）。 */
  sessionId: string;
  ipHash: string | null;
  requestId: string;
}

interface TargetRow {
  id: string;
  email: string;
  role: UserRole;
  status: "active" | "frozen";
  email_verified: boolean;
  deletion_requested_at: Date | null;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

async function lockTarget(client: PoolClient, userId: string): Promise<TargetRow> {
  const { rows } = await client.query<TargetRow>(
    `SELECT id, email, role, status, email_verified, deletion_requested_at
       FROM auth.users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new AppError("not_found", "没有这个用户");
  return row;
}

/** targetId 为 null 表示不针对单个用户的操作（例如撤销全部工作人员会话）。 */
async function audit(
  client: PoolClient,
  actor: Actor,
  action: string,
  targetId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO ops.audit_log (actor_user_id, action, target_type, target_id, metadata, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actor.userId,
      action,
      targetId ? "user" : null,
      targetId,
      JSON.stringify({ ...metadata, requestId: actor.requestId }),
      actor.ipHash,
    ],
  );
}

async function deleteSessions(client: PoolClient, userId: string): Promise<number> {
  const result = await client.query("DELETE FROM auth.sessions WHERE user_id = $1", [userId]);
  return result.rowCount ?? 0;
}

export function adminActions(pool: Pool, authActions: AdminAuthActions) {
  return {
    /** 冻结：立即撤销该用户全部会话（EC-A9）。工作人员账号要先撤销角色再冻结。 */
    freezeUser: (actor: Actor, userId: string, reason: string) =>
      inTransaction(pool, async (client) => {
        const target = await lockTarget(client, userId);
        if (target.role !== "user") {
          throw new AppError("conflict", "工作人员账号不能直接冻结：先撤销工作人员身份");
        }
        if (target.status === "frozen") throw new AppError("conflict", "这个账号已经是冻结状态");
        await client.query("UPDATE auth.users SET status = 'frozen' WHERE id = $1", [userId]);
        const revoked = await deleteSessions(client, userId);
        await audit(client, actor, "admin.user_frozen", userId, { reason, revokedSessions: revoked });
      }),

    /** 解冻。用户本人申请了删除账号（冷静期内）时不能由后台解冻，只能由用户撤销申请。 */
    unfreezeUser: (actor: Actor, userId: string, reason: string) =>
      inTransaction(pool, async (client) => {
        const target = await lockTarget(client, userId);
        if (target.deletion_requested_at) {
          throw new AppError("conflict", "用户已申请删除账号，冷静期内只能由用户本人撤销申请");
        }
        if (target.status === "active") throw new AppError("conflict", "这个账号没有被冻结");
        await client.query("UPDATE auth.users SET status = 'active' WHERE id = $1", [userId]);
        await audit(client, actor, "admin.user_unfrozen", userId, { reason });
      }),

    revokeSessions: (actor: Actor, userId: string, reason: string) =>
      inTransaction(pool, async (client) => {
        await lockTarget(client, userId);
        const revoked = await deleteSessions(client, userId);
        await audit(client, actor, "admin.sessions_revoked", userId, { reason, revokedSessions: revoked });
      }),

    /**
     * 重发验证邮件：只对未验证的账号。审计先写入同一事务，发信失败则一起回滚；
     * 发信成功而提交失败的极端情况下会多一封邮件、少一条审计（发信不在数据库事务里）。
     */
    resendVerification: (actor: Actor, userId: string, reason: string) =>
      inTransaction(pool, async (client) => {
        const target = await lockTarget(client, userId);
        if (target.email_verified) throw new AppError("conflict", "这个账号已经验证过邮箱");
        await audit(client, actor, "admin.verification_resent", userId, { reason });
        await authActions.resendVerification(target.email);
      }),

    sendPasswordReset: (actor: Actor, userId: string, reason: string) =>
      inTransaction(pool, async (client) => {
        const target = await lockTarget(client, userId);
        if (!target.email_verified) throw new AppError("conflict", "这个账号还没有验证邮箱，先重发验证邮件");
        if (target.status !== "active") throw new AppError("conflict", "账号已冻结，不能重置密码");
        await audit(client, actor, "admin.password_reset_sent", userId, { reason });
        await authActions.sendPasswordReset(target.email);
      }),

    /**
     * 撤销全部工作人员会话（EC-A1：怀疑有工作人员账号被盗时止损）。只保留执行者当前这次登录；
     * 执行者自己在其他设备上的登录也一并撤销——被盗的可能正是执行者的账号。
     */
    revokeAllStaffSessions: (actor: Actor, reason: string) =>
      inTransaction(pool, async (client) => {
        // 锁住全部工作人员行：与授予 / 撤销角色并发时，后到的一方看到最新的工作人员名单。
        const staff = await client.query("SELECT id FROM auth.users WHERE role <> 'user' FOR UPDATE");
        const deleted = await client.query(
          `DELETE FROM auth.sessions s USING auth.users u
            WHERE s.user_id = u.id AND u.role <> 'user' AND s.id <> $1`,
          [actor.sessionId],
        );
        const result = { revokedSessions: deleted.rowCount ?? 0, staffAccounts: staff.rowCount ?? 0 };
        await audit(client, actor, "admin.staff_sessions_revoked", null, { reason, ...result });
        return result;
      }),

    /** 修改工作人员角色（规则见 staff/roles.ts：账号须已验证；至少保留一个开启两步验证的管理员）。 */
    changeStaffRole: (actor: Actor, input: { email: string; role: UserRole; reason: string }) =>
      inTransaction(pool, async (client) => {
        try {
          return await changeRole(client, {
            email: input.email,
            role: input.role,
            actorUserId: actor.userId,
            via: "admin",
            reason: input.reason,
            requestId: actor.requestId,
            ipHash: actor.ipHash,
          });
        } catch (error) {
          if (error instanceof StaffRoleError) throw new AppError("conflict", error.message);
          throw error;
        }
      }),
  };
}

export type AdminActions = ReturnType<typeof adminActions>;
