import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, numeric, pgSchema, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { citext, createdAt, id, ownerIsolation, timestamptz } from "./common";

/** 套餐、用量、审计、发件箱（docs/02 §4.5、§3）。 */
export const opsSchema = pgSchema("ops");

/** 套餐定义（公开配置，不含用户数据）；初始数据在迁移 0003。 */
export const plans = opsSchema.table(
  "plans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    monthlyTokens: bigint("monthly_tokens", { mode: "number" }).notNull(),
    monthlyAgentTurns: integer("monthly_agent_turns").notNull(),
    monthlyWebSearches: integer("monthly_web_searches").notNull(),
    storageBytes: bigint("storage_bytes", { mode: "number" }).notNull(),
  },
  () => [
    check("plans_id_check", sql`id ~ '^[a-z][a-z0-9_]*$'`),
    check(
      "plans_limits_check",
      sql`monthly_tokens >= 0 AND monthly_agent_turns >= 0 AND monthly_web_searches >= 0 AND storage_bytes >= 0`,
    ),
  ],
);

export const userPlans = opsSchema
  .table(
    "user_plans",
    {
      userId: uuid("user_id")
        .primaryKey()
        .references(() => users.id, { onDelete: "cascade" }),
      planId: text("plan_id")
        .notNull()
        .references(() => plans.id),
      since: timestamptz("since").notNull().defaultNow(),
    },
    () => [ownerIsolation()],
  )
  .enableRLS();

/** 逐笔用量记账：模型调用、联网搜索、Agent 回合、嵌入。 */
export const usageLedger = opsSchema
  .table(
    "usage_ledger",
    {
      id: id(),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      at: timestamptz("at").notNull().defaultNow(),
      kind: text("kind", { enum: ["model", "search", "agent_turn", "embedding"] }).notNull(),
      model: text("model"),
      tokensIn: integer("tokens_in").notNull().default(0),
      tokensOut: integer("tokens_out").notNull().default(0),
      costEstimate: numeric("cost_estimate", { precision: 12, scale: 6 }).notNull().default("0"),
      /** 是否使用了用户自己的模型密钥（BYOK 不扣平台额度，docs/02 §4.5）。 */
      byok: text("byok", { enum: ["platform", "user"] })
        .notNull()
        .default("platform"),
      /**
       * 产生这笔用量的运行，只作追溯，不设外键：运行记录会随会话删除，账目不能跟着消失，
       * 否则删除会话就能清空本月用量。
       */
      runId: uuid("run_id"),
    },
    (t) => [
      index("usage_ledger_user_at_idx").on(t.userId, t.at),
      check("usage_ledger_kind_check", sql`kind IN ('model', 'search', 'agent_turn', 'embedding')`),
      check("usage_ledger_byok_check", sql`byok IN ('platform', 'user')`),
      check("usage_ledger_amounts_check", sql`tokens_in >= 0 AND tokens_out >= 0 AND cost_estimate >= 0`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/**
 * 审计日志：登录、改密码、删除账号、后台带授权码查看用户数据等敏感操作（docs/02 §4.2）。
 * 运行时角色只能写入不能读取（迁移 0003 的授权）；不存正文，IP 只存哈希。
 * actor_user_id 不设外键：账号删除后审计记录保留，标识做假名化。
 */
export const auditLog = opsSchema.table(
  "audit_log",
  {
    id: id(),
    at: timestamptz("at").notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipHash: text("ip_hash"),
  },
  (t) => [
    index("audit_log_actor_at_idx").on(t.actorUserId, t.at),
    check("audit_log_action_check", sql`action ~ '^[a-z][a-z_.]*$'`),
  ],
);

/**
 * 发件箱：验证邮件、找回密码邮件先写入这里，再由发送任务投递（与业务写入同一事务，不丢信）。
 * 正文里有一次性链接，发送成功后清空 payload，只留投递记录。
 */
export const emailOutbox = opsSchema.table(
  "email_outbox",
  {
    id: id(),
    toAddress: citext("to_address").notNull(),
    /** existing_account：有人用已注册的邮箱再次注册时通知邮箱主人（注册接口本身不透露邮箱是否已注册）。 */
    template: text("template", { enum: ["verify_email", "reset_password", "existing_account"] }).notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["pending", "sending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamptz("next_attempt_at").notNull().defaultNow(),
    createdAt: createdAt(),
    sentAt: timestamptz("sent_at"),
  },
  (t) => [
    index("email_outbox_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`status = 'pending'`),
    check(
      "email_outbox_template_check",
      sql`template IN ('verify_email', 'reset_password', 'existing_account')`,
    ),
    index("email_outbox_recipient_idx").on(t.toAddress, t.template, t.createdAt),
    check("email_outbox_status_check", sql`status IN ('pending', 'sending', 'sent', 'failed')`),
    check("email_outbox_sent_check", sql`(sent_at IS NOT NULL) = (status = 'sent')`),
    check("email_outbox_attempts_check", sql`attempts >= 0`),
  ],
);
