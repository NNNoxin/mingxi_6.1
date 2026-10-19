-- 0006 · 运营后台只读权限组 mingxi_admin（docs/05 §6.1）
--
-- 后台读数据用单独的登录账号（mingxi_admin 成员，由 `pnpm --filter @mingxi/db db:roles` 按 ADMIN_DATABASE_URL 创建）。
-- 它只能读账号元数据与运维表的指定列，读不到任何用户内容：
-- - 不授予 app、memory 两个 schema 的使用权，笔记、对话、画布、画像等表的名字都解析不到；
-- - auth、ops 里按列授权：会话令牌、IP、密码、两步验证密钥与备用码、邮件正文（含一次性链接）都不在授权列里；
-- - 没有任何写权限。后台的写操作由服务端逐个实现、走运行时账号，并与审计记录在同一事务里写入。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mingxi_admin') THEN
    CREATE ROLE mingxi_admin NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
COMMENT ON ROLE mingxi_admin IS '明晰运营后台只读权限组：账号元数据与运维表的指定列，读不到用户内容';--> statement-breakpoint

GRANT USAGE ON SCHEMA auth, ops TO mingxi_admin;--> statement-breakpoint

GRANT SELECT (id, name, email, email_verified, role, status, deletion_requested_at, two_factor_enabled, created_at, updated_at)
  ON auth.users TO mingxi_admin;--> statement-breakpoint
GRANT SELECT (id, user_id, expires_at, user_agent, mfa_verified, created_at, updated_at)
  ON auth.sessions TO mingxi_admin;--> statement-breakpoint
GRANT SELECT (user_id, verified, created_at) ON auth.two_factors TO mingxi_admin;--> statement-breakpoint

GRANT SELECT ON ops.plans TO mingxi_admin;--> statement-breakpoint
GRANT SELECT (user_id, plan_id, since) ON ops.user_plans TO mingxi_admin;--> statement-breakpoint
-- user_plans 强制行级隔离；这条策略只对 mingxi_admin 生效，运行时账号仍只能看到自己的行。
CREATE POLICY user_plans_admin_read ON ops.user_plans FOR SELECT TO mingxi_admin USING (true);--> statement-breakpoint
GRANT SELECT ON ops.audit_log TO mingxi_admin;--> statement-breakpoint
GRANT SELECT (id, to_address, template, status, attempts, last_error, next_attempt_at, created_at, sent_at)
  ON ops.email_outbox TO mingxi_admin;--> statement-breakpoint

-- 后台的用户列表与详情。security_invoker：按查询者（mingxi_admin）的权限与行级策略执行，视图不放大权限。
CREATE VIEW ops.admin_user_overview WITH (security_invoker = true, security_barrier = true) AS
SELECT u.id,
       u.email,
       u.name,
       u.email_verified,
       u.role,
       u.status,
       u.deletion_requested_at,
       u.two_factor_enabled,
       u.created_at,
       s.active_sessions,
       s.last_active_at,
       p.plan_id
  FROM auth.users u
  LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE expires_at > now())::int AS active_sessions,
               max(updated_at) AS last_active_at
          FROM auth.sessions
         WHERE user_id = u.id
       ) s ON true
  LEFT JOIN ops.user_plans p ON p.user_id = u.id;--> statement-breakpoint
COMMENT ON VIEW ops.admin_user_overview IS '运营后台的用户元数据：不含任何用户内容';--> statement-breakpoint
GRANT SELECT ON ops.admin_user_overview TO mingxi_admin;
