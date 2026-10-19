import type {
  AdminSession,
  AdminUserDetail,
  AdminUserSummary,
  AuditEntry,
  AuditPage,
  OutboxEntry,
  OutboxPage,
  UserRole,
} from "@mingxi/contracts";
import type { Pool } from "@mingxi/db";

// 后台的只读查询。全部通过后台只读账号（mingxi_admin）执行：即使这里写错一条 SQL，
// 数据库也不会返回任何用户内容或凭据（迁移 0006 的授权）。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 20;

interface OverviewRow {
  id: string;
  email: string;
  name: string;
  email_verified: boolean;
  role: UserRole;
  status: "active" | "frozen";
  two_factor_enabled: boolean;
  created_at: Date;
  deletion_requested_at: Date | null;
  active_sessions: number;
  last_active_at: Date | null;
  plan_id: string | null;
}

const OVERVIEW_COLUMNS = `id, email, name, email_verified, role, status, two_factor_enabled, created_at,
  deletion_requested_at, active_sessions, last_active_at, plan_id`;

function toSummary(row: OverviewRow): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.email_verified,
    role: row.role,
    status: row.status,
    twoFactorEnabled: row.two_factor_enabled,
    createdAt: row.created_at.toISOString(),
    deletionRequestedAt: row.deletion_requested_at?.toISOString() ?? null,
    activeSessions: row.active_sessions,
    lastActiveAt: row.last_active_at?.toISOString() ?? null,
    planId: row.plan_id,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 按用户 ID 精确查找，或按邮箱前缀查找；不给条件时列出最近注册的用户。 */
export async function findUsers(pool: Pool, query: string): Promise<AdminUserSummary[]> {
  const trimmed = query.trim();
  const { rows } = UUID.test(trimmed)
    ? await pool.query<OverviewRow>(`SELECT ${OVERVIEW_COLUMNS} FROM ops.admin_user_overview WHERE id = $1`, [
        trimmed,
      ])
    : await pool.query<OverviewRow>(
        `SELECT ${OVERVIEW_COLUMNS} FROM ops.admin_user_overview
          WHERE $1 = '' OR email ILIKE $2
          ORDER BY created_at DESC LIMIT ${String(SEARCH_LIMIT)}`,
        [trimmed, `${escapeLike(trimmed)}%`],
      );
  return rows.map(toSummary);
}

export async function staffMembers(pool: Pool): Promise<AdminUserSummary[]> {
  const { rows } = await pool.query<OverviewRow>(
    `SELECT ${OVERVIEW_COLUMNS} FROM ops.admin_user_overview WHERE role <> 'user' ORDER BY role, email`,
  );
  return rows.map(toSummary);
}

export async function userDetail(pool: Pool, userId: string): Promise<AdminUserDetail | null> {
  if (!UUID.test(userId)) return null;
  const overview = await pool.query<OverviewRow>(
    `SELECT ${OVERVIEW_COLUMNS} FROM ops.admin_user_overview WHERE id = $1`,
    [userId],
  );
  const row = overview.rows[0];
  if (!row) return null;
  const sessions = await pool.query<{
    id: string;
    user_agent: string | null;
    created_at: Date;
    updated_at: Date;
    expires_at: Date;
    mfa_verified: boolean;
  }>(
    `SELECT id, user_agent, created_at, updated_at, expires_at, mfa_verified
       FROM auth.sessions WHERE user_id = $1 AND expires_at > now()
      ORDER BY updated_at DESC LIMIT ${String(PAGE_SIZE)}`,
    [userId],
  );
  return {
    user: toSummary(row),
    sessions: sessions.rows.map((session): AdminSession => ({
      id: session.id,
      userAgent: session.user_agent,
      createdAt: session.created_at.toISOString(),
      lastActiveAt: session.updated_at.toISOString(),
      expiresAt: session.expires_at.toISOString(),
      mfaVerified: session.mfa_verified,
    })),
  };
}

export interface AuditFilter {
  actorUserId?: string;
  targetId?: string;
  action?: string;
  before?: string;
}

/** 审计日志按时间倒序分页（主键是时间有序的 UUIDv7，用它做游标）。 */
export async function auditPage(pool: Pool, filter: AuditFilter): Promise<AuditPage> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(sql.replace("?", `$${String(params.length)}`));
  };
  if (filter.actorUserId && UUID.test(filter.actorUserId)) add("a.actor_user_id = ?", filter.actorUserId);
  if (filter.targetId) add("a.target_id = ?", filter.targetId);
  if (filter.action) add("a.action LIKE ?", `${escapeLike(filter.action)}%`);
  if (filter.before && UUID.test(filter.before)) add("a.id < ?", filter.before);
  const { rows } = await pool.query<{
    id: string;
    at: Date;
    actor_user_id: string | null;
    actor_email: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    metadata: Record<string, unknown>;
  }>(
    `SELECT a.id, a.at, a.actor_user_id, u.email AS actor_email, a.action, a.target_type, a.target_id, a.metadata
       FROM ops.audit_log a LEFT JOIN auth.users u ON u.id = a.actor_user_id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY a.id DESC LIMIT ${String(PAGE_SIZE + 1)}`,
    params,
  );
  const page = rows.slice(0, PAGE_SIZE);
  return {
    entries: page.map((row): AuditEntry => ({
      id: row.id,
      at: row.at.toISOString(),
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata,
    })),
    nextBefore: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function outboxPage(
  pool: Pool,
  filter: { status?: OutboxEntry["status"]; before?: string },
): Promise<OutboxPage> {
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${String(params.length)}`);
  }
  if (filter.before && UUID.test(filter.before)) {
    params.push(filter.before);
    conditions.push(`id < $${String(params.length)}`);
  }
  const { rows } = await pool.query<{
    id: string;
    to_address: string;
    template: OutboxEntry["template"];
    status: OutboxEntry["status"];
    attempts: number;
    last_error: string | null;
    created_at: Date;
    next_attempt_at: Date;
    sent_at: Date | null;
  }>(
    `SELECT id, to_address, template, status, attempts, last_error, created_at, next_attempt_at, sent_at
       FROM ops.email_outbox ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY id DESC LIMIT ${String(PAGE_SIZE + 1)}`,
    params,
  );
  const page = rows.slice(0, PAGE_SIZE);
  return {
    entries: page.map((row): OutboxEntry => ({
      id: row.id,
      toAddress: row.to_address,
      template: row.template,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      createdAt: row.created_at.toISOString(),
      nextAttemptAt: row.next_attempt_at.toISOString(),
      sentAt: row.sent_at?.toISOString() ?? null,
    })),
    nextBefore: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}
