-- 0003 · 强制行级隔离、updated_at 触发器、运行时权限（docs/02 §3、§4.3、§5.1）

-- 1) 强制行级隔离：表 owner 也受策略约束（默认 owner 不受 RLS 限制）。
--    只有超级用户与带 BYPASSRLS 的角色能绕过，运行时账号不能是这两类（服务启动时校验）。
--    新增带 user_id 的表时必须同样处理；集成测试会检查 app / memory 与 ops 里所有用户数据表都已强制隔离。
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.notes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.note_chunks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.note_files FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.purpose_labels FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.conversations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.messages FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.canvas_revisions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.canvas_ops FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.agent_runs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.agent_run_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.knowledge_maps FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.knowledge_branches FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.knowledge_points FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.point_searches FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE app.verification_records FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memory.events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memory.traits FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memory.trait_evidence FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memory.trait_constraints FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memory.user_concepts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ops.user_plans FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ops.usage_ledger FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 2) updated_at 在每次 UPDATE 时由数据库刷新，应用不必（也不能忘记）手动维护。
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER sessions_touch_updated_at BEFORE UPDATE ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER accounts_touch_updated_at BEFORE UPDATE ON auth.accounts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER verifications_touch_updated_at BEFORE UPDATE ON auth.verifications
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER notes_touch_updated_at BEFORE UPDATE ON app.notes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER conversations_touch_updated_at BEFORE UPDATE ON app.conversations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER knowledge_maps_touch_updated_at BEFORE UPDATE ON app.knowledge_maps
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER traits_touch_updated_at BEFORE UPDATE ON memory.traits
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

-- 3) 运行时权限。auth / app / memory 的表已由 0001 的默认权限授予增删改查，这里再显式授予一次（幂等），
--    然后收回“只追加”记录的修改与删除权限：消息、运行事件、记忆事件、画布版本一经写入不可改。
--    删除用户或会话时的级联删除由外键动作以表 owner 身份执行，不受这些收回影响。
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, app, memory TO mingxi_runtime;--> statement-breakpoint
REVOKE UPDATE, DELETE ON app.messages, app.agent_run_events, app.canvas_revisions, memory.events FROM mingxi_runtime;--> statement-breakpoint

-- ops：套餐只读；用户套餐可改；用量只记账不改；审计只写不读（后台用单独角色查看聚合）；发件箱由发送任务更新状态。
GRANT SELECT ON ops.plans TO mingxi_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ops.user_plans TO mingxi_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON ops.usage_ledger TO mingxi_runtime;--> statement-breakpoint
GRANT INSERT ON ops.audit_log TO mingxi_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ops.email_outbox TO mingxi_runtime;
