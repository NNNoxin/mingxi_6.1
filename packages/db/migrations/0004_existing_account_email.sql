-- 0004 · 发件箱增加 existing_account 模板（已注册邮箱被再次注册时通知邮箱主人）与按收件人查询的索引。
ALTER TABLE "ops"."email_outbox" DROP CONSTRAINT "email_outbox_template_check";--> statement-breakpoint
CREATE INDEX "email_outbox_recipient_idx" ON "ops"."email_outbox" USING btree ("to_address","template","created_at");--> statement-breakpoint
ALTER TABLE "ops"."email_outbox" ADD CONSTRAINT "email_outbox_template_check" CHECK (template IN ('verify_email', 'reset_password', 'existing_account'));