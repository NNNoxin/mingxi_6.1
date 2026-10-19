import { sql } from "drizzle-orm";
import { boolean, check, index, pgSchema, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { citext, createdAt, id, timestamptz, updatedAt } from "./common";

/**
 * 账号与会话（Better Auth 的四个核心模型，docs/02 §4.1）。
 * 这些表由认证模块统一读写（登录时要按邮箱查找任意账号），不启用行级隔离；业务代码不直接访问。
 */
export const authSchema = pgSchema("auth");

export const USER_ROLES = ["user", "admin", "support"] as const;
export const USER_STATUSES = ["active", "frozen"] as const;

export const users = authSchema.table(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: citext("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role", { enum: USER_ROLES }).notNull().default("user"),
    /** frozen：用户申请删除账号后立即冻结，任务执行前都会检查（EC-U4）。 */
    status: text("status", { enum: USER_STATUSES }).notNull().default("active"),
    /** 申请删除账号的时间；30 天冷静期后由后台任务硬删除（docs/02 §4.6）。 */
    deletionRequestedAt: timestamptz("deletion_requested_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // 同一邮箱并发注册由唯一约束兜底（EC-U1）；citext 让大小写不同的同一邮箱也算重复。
    uniqueIndex("users_email_key").on(t.email),
    check("users_role_check", sql`role IN ('user', 'admin', 'support')`),
    check("users_status_check", sql`status IN ('active', 'frozen')`),
    check("users_deletion_frozen_check", sql`deletion_requested_at IS NULL OR status = 'frozen'`),
  ],
);

export const sessions = authSchema.table(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 会话令牌。Cookie 里是带服务端密钥签名的令牌，仅拿到数据库内容无法伪造有效 Cookie。 */
    token: text("token").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sessions_token_key").on(t.token), index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = authSchema.table(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 邮箱密码登录时为 "credential"；第三方登录时为 github / google。 */
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    /** 第三方登录令牌由认证模块加密后存储（encryptOAuthTokens）。 */
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    /** scrypt 哈希，只在 provider_id = 'credential' 时存在。 */
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_provider_account_key").on(t.providerId, t.accountId),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const verifications = authSchema.table(
  "verifications",
  {
    id: id(),
    /** 邮箱验证、找回密码等一次性令牌的归属标识。 */
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
