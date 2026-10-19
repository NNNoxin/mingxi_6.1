import { z } from "zod";

// 运营后台接口的契约（docs/05 §4–§6）。服务端用它校验与组装响应，后台界面用它得到类型；
// 权限矩阵也在这里定义一份：服务端据此拦截，后台界面据此隐藏没有权限的操作。

export const UserRole = z.enum(["user", "admin", "support", "analyst"]);
export type UserRole = z.infer<typeof UserRole>;
export const StaffRole = z.enum(["admin", "support", "analyst"]);
export type StaffRole = z.infer<typeof StaffRole>;

export const AdminPermission = z.enum([
  "metrics.read",
  "users.read",
  "users.freeze",
  "users.sessions.revoke",
  "users.email.resend",
  "users.quota.adjust",
  "usage.read",
  "runs.read",
  "runs.manage",
  "support.access",
  "flags.write",
  "jobs.read",
  "jobs.manage",
  "audit.read",
  "staff.manage",
]);
export type AdminPermission = z.infer<typeof AdminPermission>;

/** docs/05 §5 的权限矩阵。 */
export const PERMISSIONS_BY_ROLE: Record<StaffRole, readonly AdminPermission[]> = {
  admin: AdminPermission.options,
  support: [
    "metrics.read",
    "users.read",
    "users.sessions.revoke",
    "users.email.resend",
    "runs.read",
    "support.access",
    "jobs.read",
  ],
  analyst: ["metrics.read", "usage.read", "runs.read"],
};

/** 敏感操作：要求会话在 10 分钟内建立（重新登录确认身份），见 docs/05 §3 第 2 条。 */
export const SENSITIVE_PERMISSIONS: ReadonlySet<AdminPermission> = new Set([
  "users.freeze",
  "users.quota.adjust",
  "support.access",
  "flags.write",
  "staff.manage",
]);

/** 后台接口拒绝访问时 `error.details.reason` 的取值，后台界面据此提示下一步。 */
export const AdminDenialReason = z.enum([
  "not_staff",
  "mfa_required",
  "session_too_old",
  "reauth_required",
  "permission_denied",
]);
export type AdminDenialReason = z.infer<typeof AdminDenialReason>;

const timestamp = z.iso.datetime();

export const StaffMe = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: StaffRole,
  permissions: z.array(AdminPermission),
  sessionCreatedAt: timestamp,
});
export type StaffMe = z.infer<typeof StaffMe>;

export const AdminUserSummary = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  role: UserRole,
  status: z.enum(["active", "frozen"]),
  twoFactorEnabled: z.boolean(),
  createdAt: timestamp,
  deletionRequestedAt: timestamp.nullable(),
  activeSessions: z.number().int().nonnegative(),
  lastActiveAt: timestamp.nullable(),
  planId: z.string().nullable(),
});
export type AdminUserSummary = z.infer<typeof AdminUserSummary>;

export const AdminUserList = z.object({ users: z.array(AdminUserSummary) });
export type AdminUserList = z.infer<typeof AdminUserList>;

export const AdminSession = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  createdAt: timestamp,
  lastActiveAt: timestamp,
  expiresAt: timestamp,
  mfaVerified: z.boolean(),
});
export type AdminSession = z.infer<typeof AdminSession>;

export const AdminUserDetail = z.object({
  user: AdminUserSummary,
  sessions: z.array(AdminSession),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetail>;

export const AuditEntry = z.object({
  id: z.string(),
  at: timestamp,
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditPage = z.object({ entries: z.array(AuditEntry), nextBefore: z.string().nullable() });
export type AuditPage = z.infer<typeof AuditPage>;

export const OutboxEntry = z.object({
  id: z.string(),
  toAddress: z.string(),
  template: z.enum(["verify_email", "reset_password", "existing_account"]),
  status: z.enum(["pending", "sending", "sent", "failed"]),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: timestamp,
  nextAttemptAt: timestamp,
  sentAt: timestamp.nullable(),
});
export type OutboxEntry = z.infer<typeof OutboxEntry>;

export const OutboxPage = z.object({ entries: z.array(OutboxEntry), nextBefore: z.string().nullable() });
export type OutboxPage = z.infer<typeof OutboxPage>;

export const StaffList = z.object({ staff: z.array(AdminUserSummary) });
export type StaffList = z.infer<typeof StaffList>;

/** 每个后台写操作都必须填写原因，与操作一起写进审计。 */
export const ReasonBody = z.object({ reason: z.string().trim().min(2).max(500) });
export type ReasonBody = z.infer<typeof ReasonBody>;

export const RoleChangeBody = ReasonBody.extend({ email: z.email(), role: UserRole });
export type RoleChangeBody = z.infer<typeof RoleChangeBody>;

export const AdminActionResult = z.object({ ok: z.literal(true) });
export type AdminActionResult = z.infer<typeof AdminActionResult>;
