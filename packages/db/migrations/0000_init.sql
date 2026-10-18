-- 0000 · 初始化：扩展与按职责划分的 schema（docs/02 §3）
-- 业务表从 0001 起按 P3 加入；本迁移不创建角色（运行时角色由部署脚本按环境创建，不在迁移里写口令）。

CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS auth;--> statement-breakpoint
COMMENT ON SCHEMA auth IS '账号、会话、第三方登录（Better Auth）';--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;--> statement-breakpoint
COMMENT ON SCHEMA app IS '笔记、片段、对话、画布、知识图、外查记录';--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS memory;--> statement-breakpoint
COMMENT ON SCHEMA memory IS '情景记忆事件、画像特征、知识状态';--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS agent;--> statement-breakpoint
COMMENT ON SCHEMA agent IS 'LangGraph 检查点（运行时状态，可清理）';--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS ops;--> statement-breakpoint
COMMENT ON SCHEMA ops IS '迁移记录、审计、用量、埋点';
