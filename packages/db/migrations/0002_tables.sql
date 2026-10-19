-- 0002 · 业务表、索引、外键、行级隔离策略（drizzle-kit 依据 src/schema 生成，已人工审阅）。
-- 删除了生成的 CREATE SCHEMA：四个 schema 已由 0000 创建。
CREATE TABLE "auth"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK (role IN ('user', 'admin', 'support')),
	CONSTRAINT "users_status_check" CHECK (status IN ('active', 'frozen')),
	CONSTRAINT "users_deletion_frozen_check" CHECK (deletion_requested_at IS NULL OR status = 'frozen')
);
--> statement-breakpoint
CREATE TABLE "auth"."verifications" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."agent_run_events" (
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_events_pkey" PRIMARY KEY("run_id","seq"),
	CONSTRAINT "agent_run_events_seq_check" CHECK (seq >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."agent_run_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"map_id" uuid,
	"agent" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"model" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	CONSTRAINT "agent_runs_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "agent_runs_agent_check" CHECK (agent IN ('logic', 'knowledge', 'verify')),
	CONSTRAINT "agent_runs_status_check" CHECK (status IN ('queued', 'running', 'interrupted', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "agent_runs_target_check" CHECK (num_nonnulls(conversation_id, map_id) <= 1),
	CONSTRAINT "agent_runs_tokens_check" CHECK (tokens_in >= 0 AND tokens_out >= 0 AND cost >= 0),
	CONSTRAINT "agent_runs_finished_check" CHECK ((finished_at IS NOT NULL) = (status IN ('succeeded', 'failed', 'cancelled')))
);
--> statement-breakpoint
ALTER TABLE "app"."agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."canvas_ops" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor" text NOT NULL,
	"op" jsonb NOT NULL,
	"seen_by_agent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_ops_actor_check" CHECK (actor IN ('human', 'agent')),
	CONSTRAINT "canvas_ops_op_check" CHECK (coalesce(jsonb_typeof(op -> 'type') = 'string', false))
);
--> statement-breakpoint
ALTER TABLE "app"."canvas_ops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."canvas_revisions" (
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"positions" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_revisions_pkey" PRIMARY KEY("conversation_id","revision"),
	CONSTRAINT "canvas_revisions_revision_check" CHECK (revision >= 1),
	CONSTRAINT "canvas_revisions_created_by_check" CHECK (created_by IN ('agent', 'human')),
	CONSTRAINT "canvas_revisions_shape_check" CHECK (jsonb_typeof(nodes) = 'array' AND jsonb_typeof(edges) = 'array' AND jsonb_typeof(positions) = 'object')
);
--> statement-breakpoint
ALTER TABLE "app"."canvas_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"branch" text,
	"canvas_title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"summary" jsonb,
	"current_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "conversations_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "conversations_kind_check" CHECK (kind IN ('logic', 'verify')),
	CONSTRAINT "conversations_status_check" CHECK (status IN ('active', 'archived')),
	CONSTRAINT "conversations_revision_check" CHECK (current_revision >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."knowledge_branches" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"title" text NOT NULL,
	"lens" text NOT NULL,
	"library_source" text,
	"ord" integer NOT NULL,
	CONSTRAINT "knowledge_branches_id_user_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "app"."knowledge_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."knowledge_maps" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"seed_note_id" uuid NOT NULL,
	"goal" text,
	"max_depth_generated" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_maps_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_maps_depth_check" CHECK (max_depth_generated BETWEEN 0 AND 6),
	CONSTRAINT "knowledge_maps_status_check" CHECK (status IN ('generating', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "app"."knowledge_maps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."knowledge_points" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	"labels" jsonb NOT NULL,
	"summary" text NOT NULL,
	"relation" text,
	"coverage" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_terms" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_points_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "knowledge_points_depth_check" CHECK (depth BETWEEN 1 AND 6),
	CONSTRAINT "knowledge_points_coverage_check" CHECK (coverage IN ('covered', 'partial', 'missing')),
	CONSTRAINT "knowledge_points_labels_check" CHECK (coalesce(jsonb_typeof(labels -> 'theme') = 'string' AND jsonb_typeof(labels -> 'concept') = 'string' AND jsonb_typeof(labels -> 'atomic') = 'string', false)),
	CONSTRAINT "knowledge_points_evidence_check" CHECK (jsonb_typeof(evidence) = 'array')
);
--> statement-breakpoint
ALTER TABLE "app"."knowledge_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."messages" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_role_check" CHECK (role IN ('user', 'assistant', 'thinking')),
	CONSTRAINT "messages_status_check" CHECK (status IN ('complete', 'error', 'cancelled')),
	CONSTRAINT "messages_parts_check" CHECK (coalesce(jsonb_typeof(parts -> 'v') = 'number' AND jsonb_typeof(parts -> 'parts') = 'array', false)),
	CONSTRAINT "messages_seq_check" CHECK (seq >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."note_chunks" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"heading_path" text[] DEFAULT '{}'::text[] NOT NULL,
	"text" text NOT NULL,
	"tokens" "tsvector" NOT NULL,
	"embedding" vector(1024),
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_chunks_embedding_model_check" CHECK ((embedding IS NULL) = (embedding_model IS NULL))
);
--> statement-breakpoint
ALTER TABLE "app"."note_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."note_files" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_files_object_key_check" CHECK (object_key = 'u/' || user_id::text || '/' || note_id::text || '/' || id::text),
	CONSTRAINT "note_files_bytes_check" CHECK (bytes >= 0),
	CONSTRAINT "note_files_sha256_check" CHECK (sha256 ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "app"."note_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."notes" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"body_html" text,
	"source_kind" text DEFAULT 'library' NOT NULL,
	"modality" text NOT NULL,
	"source_uri" text,
	"source_title" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose_label" text DEFAULT '待定' NOT NULL,
	"purpose_state" text DEFAULT 'pending' NOT NULL,
	"domain_path" text[] DEFAULT '{}'::text[] NOT NULL,
	"theme" text,
	"polarity" text,
	"stance" text,
	"functional_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"user_goals" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_hash" text NOT NULL,
	"origin" text NOT NULL,
	"is_sample" boolean GENERATED ALWAYS AS (origin = 'sample') STORED NOT NULL,
	"origin_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "notes_purpose_state_check" CHECK (purpose_state IN ('declared', 'confirmed_ai', 'pending')),
	CONSTRAINT "notes_source_kind_check" CHECK (source_kind IN ('library', 'web')),
	CONSTRAINT "notes_polarity_check" CHECK (polarity IS NULL OR polarity IN ('neutral_observe', 'positive_exemplar', 'mixed', 'negative_caution')),
	CONSTRAINT "notes_stance_check" CHECK (stance IS NULL OR stance IN ('transform_ok', 'do_not_imitate_failure_path', 'imitate')),
	CONSTRAINT "notes_origin_check" CHECK (origin IN ('upload', 'capture', 'evidence_saved', 'verify', 'sample')),
	CONSTRAINT "notes_content_hash_check" CHECK (content_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "app"."notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."point_searches" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"point_id" uuid NOT NULL,
	"query" text NOT NULL,
	"scope" text NOT NULL,
	"results" jsonb NOT NULL,
	"provider_status" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."point_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."purpose_labels" (
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"ord" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purpose_labels_pkey" PRIMARY KEY("user_id","label"),
	CONSTRAINT "purpose_labels_label_check" CHECK (length(btrim(label)) BETWEEN 1 AND 20)
);
--> statement-breakpoint
ALTER TABLE "app"."purpose_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."verification_records" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"question" text NOT NULL,
	"verdict" text NOT NULL,
	"conclusion" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"append_to_note" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_records_scope_check" CHECK (scope IN ('fact', 'timeliness', 'controversy')),
	CONSTRAINT "verification_records_verdict_check" CHECK (verdict IN ('supported', 'partly_supported', 'outdated', 'unsupported', 'insufficient')),
	CONSTRAINT "verification_records_evidence_check" CHECK (jsonb_typeof(evidence) = 'array')
);
--> statement-breakpoint
ALTER TABLE "app"."verification_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'personal' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "workspaces_kind_check" CHECK (kind IN ('personal'))
);
--> statement-breakpoint
ALTER TABLE "app"."workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory"."events" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"subject_ref" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	CONSTRAINT "events_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "events_source_check" CHECK (source IN ('logic', 'knowledge', 'library', 'verify', 'profile')),
	CONSTRAINT "events_type_check" CHECK (type ~ '^[a-z][a-z_]*$')
);
--> statement-breakpoint
ALTER TABLE "memory"."events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory"."trait_constraints" (
	"user_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trait_constraints_pkey" PRIMARY KEY("user_id","dimension","key"),
	CONSTRAINT "trait_constraints_dimension_check" CHECK (dimension IN ('knowledge_interest', 'knowledge_level', 'source_trust', 'logic_paradigm', 'granularity', 'entry_point', 'deepen_logic', 'dig_direction', 'perspective', 'presentation'))
);
--> statement-breakpoint
ALTER TABLE "memory"."trait_constraints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory"."trait_evidence" (
	"user_id" uuid NOT NULL,
	"trait_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trait_evidence_pkey" PRIMARY KEY("trait_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "memory"."trait_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory"."traits" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"key" text NOT NULL,
	"statement" text NOT NULL,
	"scope" jsonb DEFAULT '{"kind":"global"}'::jsonb NOT NULL,
	"polarity" text NOT NULL,
	"weight" real NOT NULL,
	"confidence" real NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"origin" text NOT NULL,
	"half_life_days" integer NOT NULL,
	"last_reinforced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" vector(1024),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traits_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "traits_dimension_check" CHECK (dimension IN ('knowledge_interest', 'knowledge_level', 'source_trust', 'logic_paradigm', 'granularity', 'entry_point', 'deepen_logic', 'dig_direction', 'perspective', 'presentation')),
	CONSTRAINT "traits_polarity_check" CHECK (polarity IN ('prefer', 'avoid')),
	CONSTRAINT "traits_status_check" CHECK (status IN ('proposed', 'active', 'rolled_back', 'deleted')),
	CONSTRAINT "traits_origin_check" CHECK (origin IN ('rule', 'reflection', 'explicit')),
	CONSTRAINT "traits_confidence_check" CHECK (confidence >= 0 AND confidence <= 1),
	CONSTRAINT "traits_half_life_check" CHECK (half_life_days > 0),
	CONSTRAINT "traits_scope_check" CHECK (coalesce(jsonb_typeof(scope -> 'kind') = 'string', false))
);
--> statement-breakpoint
ALTER TABLE "memory"."traits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory"."user_concepts" (
	"user_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"embedding" vector(1024),
	"state" text NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_concepts_pkey" PRIMARY KEY("user_id","concept"),
	CONSTRAINT "user_concepts_state_check" CHECK (state IN ('unknown', 'seen', 'understood', 'applied')),
	CONSTRAINT "user_concepts_evidence_check" CHECK (evidence_count >= 0)
);
--> statement-breakpoint
ALTER TABLE "memory"."user_concepts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	CONSTRAINT "audit_log_action_check" CHECK (action ~ '^[a-z][a-z_.]*$')
);
--> statement-breakpoint
CREATE TABLE "ops"."email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"to_address" "citext" NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_template_check" CHECK (template IN ('verify_email', 'reset_password')),
	CONSTRAINT "email_outbox_status_check" CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
	CONSTRAINT "email_outbox_sent_check" CHECK ((sent_at IS NOT NULL) = (status = 'sent')),
	CONSTRAINT "email_outbox_attempts_check" CHECK (attempts >= 0)
);
--> statement-breakpoint
CREATE TABLE "ops"."plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_tokens" bigint NOT NULL,
	"monthly_agent_turns" integer NOT NULL,
	"monthly_web_searches" integer NOT NULL,
	"storage_bytes" bigint NOT NULL,
	CONSTRAINT "plans_id_check" CHECK (id ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "plans_limits_check" CHECK (monthly_tokens >= 0 AND monthly_agent_turns >= 0 AND monthly_web_searches >= 0 AND storage_bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "ops"."usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT app.uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"model" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_estimate" numeric(12, 6) DEFAULT '0' NOT NULL,
	"byok" text DEFAULT 'platform' NOT NULL,
	"run_id" uuid,
	CONSTRAINT "usage_ledger_kind_check" CHECK (kind IN ('model', 'search', 'agent_turn', 'embedding')),
	CONSTRAINT "usage_ledger_byok_check" CHECK (byok IN ('platform', 'user')),
	CONSTRAINT "usage_ledger_amounts_check" CHECK (tokens_in >= 0 AND tokens_out >= 0 AND cost_estimate >= 0)
);
--> statement-breakpoint
ALTER TABLE "ops"."usage_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops"."user_plans" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops"."user_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agent_run_events" ADD CONSTRAINT "agent_run_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agent_run_events" ADD CONSTRAINT "agent_run_events_run_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "app"."agent_runs"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agent_runs" ADD CONSTRAINT "agent_runs_conversation_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "app"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agent_runs" ADD CONSTRAINT "agent_runs_map_fk" FOREIGN KEY ("map_id","user_id") REFERENCES "app"."knowledge_maps"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."canvas_ops" ADD CONSTRAINT "canvas_ops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."canvas_ops" ADD CONSTRAINT "canvas_ops_conversation_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "app"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."canvas_revisions" ADD CONSTRAINT "canvas_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."canvas_revisions" ADD CONSTRAINT "canvas_revisions_conversation_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "app"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."canvas_revisions" ADD CONSTRAINT "canvas_revisions_run_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "app"."agent_runs"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."conversations" ADD CONSTRAINT "conversations_workspace_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "app"."workspaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_branches" ADD CONSTRAINT "knowledge_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_branches" ADD CONSTRAINT "knowledge_branches_map_fk" FOREIGN KEY ("map_id","user_id") REFERENCES "app"."knowledge_maps"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_maps" ADD CONSTRAINT "knowledge_maps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_maps" ADD CONSTRAINT "knowledge_maps_workspace_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "app"."workspaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_maps" ADD CONSTRAINT "knowledge_maps_seed_note_fk" FOREIGN KEY ("seed_note_id","user_id") REFERENCES "app"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_points" ADD CONSTRAINT "knowledge_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_points" ADD CONSTRAINT "knowledge_points_map_fk" FOREIGN KEY ("map_id","user_id") REFERENCES "app"."knowledge_maps"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."knowledge_points" ADD CONSTRAINT "knowledge_points_branch_fk" FOREIGN KEY ("branch_id","user_id") REFERENCES "app"."knowledge_branches"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "app"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_run_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "app"."agent_runs"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."note_chunks" ADD CONSTRAINT "note_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."note_chunks" ADD CONSTRAINT "note_chunks_note_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "app"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."note_files" ADD CONSTRAINT "note_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."note_files" ADD CONSTRAINT "note_files_note_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "app"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notes" ADD CONSTRAINT "notes_workspace_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "app"."workspaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."point_searches" ADD CONSTRAINT "point_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."point_searches" ADD CONSTRAINT "point_searches_point_fk" FOREIGN KEY ("point_id","user_id") REFERENCES "app"."knowledge_points"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."purpose_labels" ADD CONSTRAINT "purpose_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."verification_records" ADD CONSTRAINT "verification_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."verification_records" ADD CONSTRAINT "verification_records_note_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "app"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."trait_constraints" ADD CONSTRAINT "trait_constraints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."trait_evidence" ADD CONSTRAINT "trait_evidence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."trait_evidence" ADD CONSTRAINT "trait_evidence_trait_fk" FOREIGN KEY ("trait_id","user_id") REFERENCES "memory"."traits"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."trait_evidence" ADD CONSTRAINT "trait_evidence_event_fk" FOREIGN KEY ("event_id","user_id") REFERENCES "memory"."events"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."traits" ADD CONSTRAINT "traits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."user_concepts" ADD CONSTRAINT "user_concepts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."user_plans" ADD CONSTRAINT "user_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."user_plans" ADD CONSTRAINT "user_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "ops"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_key" ON "auth"."accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "auth"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "auth"."sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "auth"."verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "agent_run_events_at_idx" ON "app"."agent_run_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "agent_runs_user_created_idx" ON "app"."agent_runs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_active_idx" ON "app"."agent_runs" USING btree ("status","heartbeat_at") WHERE status IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "canvas_ops_unseen_idx" ON "app"."canvas_ops" USING btree ("conversation_id","revision") WHERE NOT seen_by_agent;--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "app"."conversations" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_branches_map_ord_key" ON "app"."knowledge_branches" USING btree ("map_id","ord");--> statement-breakpoint
CREATE INDEX "knowledge_maps_user_idx" ON "app"."knowledge_maps" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "knowledge_points_branch_depth_idx" ON "app"."knowledge_points" USING btree ("branch_id","depth");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_seq_key" ON "app"."messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "messages_user_idx" ON "app"."messages" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_chunks_note_ord_key" ON "app"."note_chunks" USING btree ("note_id","ord");--> statement-breakpoint
CREATE INDEX "note_chunks_user_idx" ON "app"."note_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "note_chunks_tokens_idx" ON "app"."note_chunks" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX "note_chunks_embedding_idx" ON "app"."note_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "note_files_object_key_key" ON "app"."note_files" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "note_files_note_idx" ON "app"."note_files" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_user_content_hash_key" ON "app"."notes" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "notes_user_captured_at_idx" ON "app"."notes" USING btree ("user_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notes_user_purpose_idx" ON "app"."notes" USING btree ("user_id","purpose_label");--> statement-breakpoint
CREATE INDEX "notes_domain_path_idx" ON "app"."notes" USING gin ("domain_path");--> statement-breakpoint
CREATE INDEX "notes_tags_idx" ON "app"."notes" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "notes_title_trgm_idx" ON "app"."notes" USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "point_searches_point_created_idx" ON "app"."point_searches" USING btree ("point_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "verification_records_note_idx" ON "app"."verification_records" USING btree ("note_id","verified_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_one_personal_per_user" ON "app"."workspaces" USING btree ("user_id") WHERE kind = 'personal';--> statement-breakpoint
CREATE INDEX "events_user_occurred_idx" ON "memory"."events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "trait_evidence_event_idx" ON "memory"."trait_evidence" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "traits_user_dimension_idx" ON "memory"."traits" USING btree ("user_id","dimension","status");--> statement-breakpoint
CREATE INDEX "user_concepts_embedding_idx" ON "memory"."user_concepts" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "audit_log_actor_at_idx" ON "ops"."audit_log" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "ops"."email_outbox" USING btree ("next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "usage_ledger_user_at_idx" ON "ops"."usage_ledger" USING btree ("user_id","at");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."agent_run_events" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."agent_runs" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."canvas_ops" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."canvas_revisions" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."conversations" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."knowledge_branches" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."knowledge_maps" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."knowledge_points" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."messages" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."note_chunks" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."note_files" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."notes" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."point_searches" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."purpose_labels" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."verification_records" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "app"."workspaces" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "memory"."events" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "memory"."trait_constraints" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "memory"."trait_evidence" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "memory"."traits" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "memory"."user_concepts" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "ops"."usage_ledger" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "ops"."user_plans" AS PERMISSIVE FOR ALL TO public USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));