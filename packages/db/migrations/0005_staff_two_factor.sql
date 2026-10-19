-- 0005 · 工作人员角色增加 analyst；两步验证（Better Auth twoFactor 插件）的用户标记、密钥表；会话记录是否经过两步验证建立（docs/05 §5、§6.1）。
CREATE TABLE "auth"."two_factors" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD COLUMN "mfa_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "two_factors_user_id_key" ON "auth"."two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "auth"."two_factors" USING btree ("secret");--> statement-breakpoint
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_role_check" CHECK (role IN ('user', 'admin', 'support', 'analyst'));