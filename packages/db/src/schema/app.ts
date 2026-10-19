import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import {
  createdAt,
  EMBEDDING_DIMENSIONS,
  id,
  ownerIsolation,
  timestamptz,
  tsvector,
  updatedAt,
} from "./common";

/**
 * 笔记、片段、对话、画布、知识图、外查记录（docs/02 §5.2、§5.3）。
 *
 * 隔离约定（docs/02 §4.4）：
 * - 每张表都有 user_id，并启用、强制行级隔离（迁移 0003 FORCE ROW LEVEL SECURITY）；
 * - 子表用 (父表 id, user_id) 复合外键引用父表，数据库层面保证子行与父行属于同一个用户，
 *   写错一条 SQL 也不可能把 A 的片段挂到 B 的笔记下。
 */
export const appSchema = pgSchema("app");

const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/** 个人空间：现在每个用户一个；预留团队空间时不改表结构（docs/02 §4.2）。 */
export const workspaces = appSchema
  .table(
    "workspaces",
    {
      id: id(),
      userId: userRef(),
      kind: text("kind", { enum: ["personal"] })
        .notNull()
        .default("personal"),
      name: text("name").notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      unique("workspaces_id_user_key").on(t.id, t.userId),
      uniqueIndex("workspaces_one_personal_per_user")
        .on(t.userId)
        .where(sql`kind = 'personal'`),
      check("workspaces_kind_check", sql`kind IN ('personal')`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

export const NOTE_POLARITIES = ["neutral_observe", "positive_exemplar", "mixed", "negative_caution"] as const;
export const NOTE_STANCES = ["transform_ok", "do_not_imitate_failure_path", "imitate"] as const;
export const NOTE_ORIGINS = ["upload", "capture", "evidence_saved", "verify", "sample"] as const;

export const notes = appSchema
  .table(
    "notes",
    {
      id: id(),
      userId: userRef(),
      workspaceId: uuid("workspace_id").notNull(),
      title: text("title").notNull(),
      /** 摄取时生成的摘要（界面卡片的 summary）。 */
      summary: text("summary").notNull().default(""),
      bodyMd: text("body_md").notNull().default(""),
      /** 服务端净化后的 HTML（docs/01 指出原版直接渲染 bodyHtml 有 XSS 风险）。 */
      bodyHtml: text("body_html"),
      /** library：用户自己的笔记；web：从联网搜索结果保存下来的证据。 */
      sourceKind: text("source_kind", { enum: ["library", "web"] })
        .notNull()
        .default("library"),
      /** 内容形态（webpage / pdf / photo / screenshot / social_post / table……），由摄取识别，开放取值。 */
      modality: text("modality").notNull(),
      sourceUri: text("source_uri"),
      sourceTitle: text("source_title"),
      capturedAt: timestamptz("captured_at").notNull().defaultNow(),
      /** 用途标签：用户可自定义（app.purpose_labels），“待定”表示尚未确认。 */
      purposeLabel: text("purpose_label").notNull().default("待定"),
      purposeState: text("purpose_state", { enum: ["declared", "confirmed_ai", "pending"] })
        .notNull()
        .default("pending"),
      domainPath: text("domain_path")
        .array()
        .notNull()
        .default(sql`'{}'::text[]`),
      theme: text("theme"),
      polarity: text("polarity", { enum: NOTE_POLARITIES }),
      stance: text("stance", { enum: NOTE_STANCES }),
      functionalTypes: text("functional_types")
        .array()
        .notNull()
        .default(sql`'{}'::text[]`),
      userGoals: text("user_goals")
        .array()
        .notNull()
        .default(sql`'{}'::text[]`),
      tags: text("tags")
        .array()
        .notNull()
        .default(sql`'{}'::text[]`),
      /** 规范化正文的 sha256，同一用户重复上传 / 重复保存同一来源时去重（EC-I3、EC-K11）。 */
      contentHash: text("content_hash").notNull(),
      origin: text("origin", { enum: NOTE_ORIGINS }).notNull(),
      /** 示范笔记：由 origin 推出，不参与画像学习、可一键删除（docs/02 §4.6、EC-M7）。 */
      isSample: boolean("is_sample")
        .notNull()
        .generatedAlwaysAs(sql`origin = 'sample'`),
      /** 来源引用，例如外查记录 ID、保存证据时的搜索结果地址。 */
      originRef: text("origin_ref"),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      unique("notes_id_user_key").on(t.id, t.userId),
      foreignKey({
        name: "notes_workspace_fk",
        columns: [t.workspaceId, t.userId],
        foreignColumns: [workspaces.id, workspaces.userId],
      }).onDelete("cascade"),
      uniqueIndex("notes_user_content_hash_key").on(t.userId, t.contentHash),
      index("notes_user_captured_at_idx").on(t.userId, t.capturedAt.desc()),
      index("notes_user_purpose_idx").on(t.userId, t.purposeLabel),
      index("notes_domain_path_idx").using("gin", t.domainPath),
      index("notes_tags_idx").using("gin", t.tags),
      index("notes_title_trgm_idx").using("gin", sql`title gin_trgm_ops`),
      check("notes_purpose_state_check", sql`purpose_state IN ('declared', 'confirmed_ai', 'pending')`),
      check("notes_source_kind_check", sql`source_kind IN ('library', 'web')`),
      check(
        "notes_polarity_check",
        sql`polarity IS NULL OR polarity IN ('neutral_observe', 'positive_exemplar', 'mixed', 'negative_caution')`,
      ),
      check(
        "notes_stance_check",
        sql`stance IS NULL OR stance IN ('transform_ok', 'do_not_imitate_failure_path', 'imitate')`,
      ),
      check("notes_origin_check", sql`origin IN ('upload', 'capture', 'evidence_saved', 'verify', 'sample')`),
      check("notes_content_hash_check", sql`content_hash ~ '^[0-9a-f]{64}$'`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

export const noteChunks = appSchema
  .table(
    "note_chunks",
    {
      id: id(),
      userId: userRef(),
      noteId: uuid("note_id").notNull(),
      ord: integer("ord").notNull(),
      headingPath: text("heading_path")
        .array()
        .notNull()
        .default(sql`'{}'::text[]`),
      text: text("text").notNull(),
      /** 应用层中文分词后以 simple 配置生成。 */
      tokens: tsvector("tokens").notNull(),
      /** 嵌入异步生成，生成前为空。 */
      embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
      embeddingModel: text("embedding_model"),
      createdAt: createdAt(),
    },
    (t) => [
      foreignKey({
        name: "note_chunks_note_fk",
        columns: [t.noteId, t.userId],
        foreignColumns: [notes.id, notes.userId],
      }).onDelete("cascade"),
      uniqueIndex("note_chunks_note_ord_key").on(t.noteId, t.ord),
      index("note_chunks_user_idx").on(t.userId),
      index("note_chunks_tokens_idx").using("gin", t.tokens),
      index("note_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
      check("note_chunks_embedding_model_check", sql`(embedding IS NULL) = (embedding_model IS NULL)`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

export const noteFiles = appSchema
  .table(
    "note_files",
    {
      id: id(),
      userId: userRef(),
      noteId: uuid("note_id").notNull(),
      /** 对象存储键 u/{userId}/{noteId}/{fileId}，按用户前缀隔离（docs/02 §3）。 */
      objectKey: text("object_key").notNull(),
      mime: text("mime").notNull(),
      bytes: bigint("bytes", { mode: "number" }).notNull(),
      sha256: text("sha256").notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      foreignKey({
        name: "note_files_note_fk",
        columns: [t.noteId, t.userId],
        foreignColumns: [notes.id, notes.userId],
      }).onDelete("cascade"),
      uniqueIndex("note_files_object_key_key").on(t.objectKey),
      index("note_files_note_idx").on(t.noteId),
      check(
        "note_files_object_key_check",
        sql`object_key = 'u/' || user_id::text || '/' || note_id::text || '/' || id::text`,
      ),
      check("note_files_bytes_check", sql`bytes >= 0`),
      check("note_files_sha256_check", sql`sha256 ~ '^[0-9a-f]{64}$'`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 用户自定义用途标签与排序。 */
export const purposeLabels = appSchema
  .table(
    "purpose_labels",
    {
      userId: userRef(),
      label: text("label").notNull(),
      ord: integer("ord").notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      primaryKey({ name: "purpose_labels_pkey", columns: [t.userId, t.label] }),
      check("purpose_labels_label_check", sql`length(btrim(label)) BETWEEN 1 AND 20`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 一行一个会话；id 同时作为 LangGraph 的 thread_id（docs/02 §5.2）。 */
export const conversations = appSchema
  .table(
    "conversations",
    {
      id: id(),
      userId: userRef(),
      workspaceId: uuid("workspace_id").notNull(),
      kind: text("kind", { enum: ["logic", "verify"] }).notNull(),
      title: text("title").notNull().default(""),
      branch: text("branch"),
      canvasTitle: text("canvas_title"),
      status: text("status", { enum: ["active", "archived"] })
        .notNull()
        .default("active"),
      /** 滚动摘要，长对话压缩用。 */
      summary: jsonb("summary"),
      /** 当前画布版本号；写入新版本时做比对，防止并发覆盖（EC-U3）。 */
      currentRevision: integer("current_revision").notNull().default(0),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
      archivedAt: timestamptz("archived_at"),
    },
    (t) => [
      unique("conversations_id_user_key").on(t.id, t.userId),
      foreignKey({
        name: "conversations_workspace_fk",
        columns: [t.workspaceId, t.userId],
        foreignColumns: [workspaces.id, workspaces.userId],
      }).onDelete("cascade"),
      index("conversations_user_updated_idx").on(t.userId, t.updatedAt.desc()),
      check("conversations_kind_check", sql`kind IN ('logic', 'verify')`),
      check("conversations_status_check", sql`status IN ('active', 'archived')`),
      check("conversations_revision_check", sql`current_revision >= 0`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

export const AGENT_KINDS = ["logic", "knowledge", "verify"] as const;
export const RUN_STATUSES = ["queued", "running", "interrupted", "succeeded", "failed", "cancelled"] as const;

/** 知识图（知识补全）。放在 agent_runs 前定义，供运行记录引用。 */
export const knowledgeMaps = appSchema
  .table(
    "knowledge_maps",
    {
      id: id(),
      userId: userRef(),
      workspaceId: uuid("workspace_id").notNull(),
      /** 起点笔记；笔记删除时知识图一并删除。 */
      seedNoteId: uuid("seed_note_id").notNull(),
      goal: text("goal"),
      maxDepthGenerated: integer("max_depth_generated").notNull().default(0),
      status: text("status", { enum: ["generating", "ready", "failed"] })
        .notNull()
        .default("generating"),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      unique("knowledge_maps_id_user_key").on(t.id, t.userId),
      foreignKey({
        name: "knowledge_maps_workspace_fk",
        columns: [t.workspaceId, t.userId],
        foreignColumns: [workspaces.id, workspaces.userId],
      }).onDelete("cascade"),
      foreignKey({
        name: "knowledge_maps_seed_note_fk",
        columns: [t.seedNoteId, t.userId],
        foreignColumns: [notes.id, notes.userId],
      }).onDelete("cascade"),
      index("knowledge_maps_user_idx").on(t.userId, t.createdAt.desc()),
      check("knowledge_maps_depth_check", sql`max_depth_generated BETWEEN 0 AND 6`),
      check("knowledge_maps_status_check", sql`status IN ('generating', 'ready', 'failed')`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 每次 Agent 回合一行（docs/02 §5.2）。运行属于用户而不是会话：登录会话过期后运行照常完成（EC-U2）。 */
export const agentRuns = appSchema
  .table(
    "agent_runs",
    {
      id: id(),
      userId: userRef(),
      conversationId: uuid("conversation_id"),
      mapId: uuid("map_id"),
      agent: text("agent", { enum: AGENT_KINDS }).notNull(),
      status: text("status", { enum: RUN_STATUSES }).notNull().default("queued"),
      input: jsonb("input").notNull(),
      output: jsonb("output"),
      error: jsonb("error"),
      model: text("model"),
      tokensIn: integer("tokens_in").notNull().default(0),
      tokensOut: integer("tokens_out").notNull().default(0),
      /** 费用估算（美元）。 */
      cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
      createdAt: createdAt(),
      startedAt: timestamptz("started_at"),
      finishedAt: timestamptz("finished_at"),
      /** 运行中的心跳；巡检任务把长时间没有心跳的运行标记为失败。 */
      heartbeatAt: timestamptz("heartbeat_at"),
    },
    (t) => [
      unique("agent_runs_id_user_key").on(t.id, t.userId),
      foreignKey({
        name: "agent_runs_conversation_fk",
        columns: [t.conversationId, t.userId],
        foreignColumns: [conversations.id, conversations.userId],
      }).onDelete("cascade"),
      foreignKey({
        name: "agent_runs_map_fk",
        columns: [t.mapId, t.userId],
        foreignColumns: [knowledgeMaps.id, knowledgeMaps.userId],
      }).onDelete("cascade"),
      index("agent_runs_user_created_idx").on(t.userId, t.createdAt.desc()),
      index("agent_runs_active_idx")
        .on(t.status, t.heartbeatAt)
        .where(sql`status IN ('queued', 'running')`),
      check("agent_runs_agent_check", sql`agent IN ('logic', 'knowledge', 'verify')`),
      check(
        "agent_runs_status_check",
        sql`status IN ('queued', 'running', 'interrupted', 'succeeded', 'failed', 'cancelled')`,
      ),
      check("agent_runs_target_check", sql`num_nonnulls(conversation_id, map_id) <= 1`),
      check("agent_runs_tokens_check", sql`tokens_in >= 0 AND tokens_out >= 0 AND cost >= 0`),
      check(
        "agent_runs_finished_check",
        sql`(finished_at IS NOT NULL) = (status IN ('succeeded', 'failed', 'cancelled'))`,
      ),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 运行步骤事件：SSE 续传、Thinking 内容与审计；保留 90 天。 */
export const agentRunEvents = appSchema
  .table(
    "agent_run_events",
    {
      userId: userRef(),
      runId: uuid("run_id").notNull(),
      seq: integer("seq").notNull(),
      type: text("type").notNull(),
      payload: jsonb("payload").notNull(),
      at: timestamptz("at").notNull().defaultNow(),
    },
    (t) => [
      primaryKey({ name: "agent_run_events_pkey", columns: [t.runId, t.seq] }),
      foreignKey({
        name: "agent_run_events_run_fk",
        columns: [t.runId, t.userId],
        foreignColumns: [agentRuns.id, agentRuns.userId],
      }).onDelete("cascade"),
      index("agent_run_events_at_idx").on(t.at),
      check("agent_run_events_seq_check", sql`seq >= 0`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/**
 * 消息只追加。parts 为带版本号的分段数组：
 * {v:1, parts:[{type:"text",text}, {type:"clarify_options",options:[…],picked:[]}, {type:"cite",noteId,chunkId}]}
 */
export const messages = appSchema
  .table(
    "messages",
    {
      id: id(),
      userId: userRef(),
      conversationId: uuid("conversation_id").notNull(),
      seq: integer("seq").notNull(),
      role: text("role", { enum: ["user", "assistant", "thinking"] }).notNull(),
      parts: jsonb("parts").notNull(),
      status: text("status", { enum: ["complete", "error", "cancelled"] })
        .notNull()
        .default("complete"),
      runId: uuid("run_id"),
      createdAt: createdAt(),
    },
    (t) => [
      foreignKey({
        name: "messages_conversation_fk",
        columns: [t.conversationId, t.userId],
        foreignColumns: [conversations.id, conversations.userId],
      }).onDelete("cascade"),
      foreignKey({
        name: "messages_run_fk",
        columns: [t.runId, t.userId],
        foreignColumns: [agentRuns.id, agentRuns.userId],
      }),
      uniqueIndex("messages_conversation_seq_key").on(t.conversationId, t.seq),
      index("messages_user_idx").on(t.userId),
      check("messages_role_check", sql`role IN ('user', 'assistant', 'thinking')`),
      check("messages_status_check", sql`status IN ('complete', 'error', 'cancelled')`),
      check(
        "messages_parts_check",
        sql`coalesce(jsonb_typeof(parts -> 'v') = 'number' AND jsonb_typeof(parts -> 'parts') = 'array', false)`,
      ),
      check("messages_seq_check", sql`seq >= 0`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 每次 Agent 生成或人工编辑后一个画布版本；(conversation_id, revision) 唯一。 */
export const canvasRevisions = appSchema
  .table(
    "canvas_revisions",
    {
      userId: userRef(),
      conversationId: uuid("conversation_id").notNull(),
      revision: integer("revision").notNull(),
      nodes: jsonb("nodes").notNull(),
      edges: jsonb("edges").notNull(),
      positions: jsonb("positions").notNull(),
      createdBy: text("created_by", { enum: ["agent", "human"] }).notNull(),
      runId: uuid("run_id"),
      createdAt: createdAt(),
    },
    (t) => [
      primaryKey({ name: "canvas_revisions_pkey", columns: [t.conversationId, t.revision] }),
      foreignKey({
        name: "canvas_revisions_conversation_fk",
        columns: [t.conversationId, t.userId],
        foreignColumns: [conversations.id, conversations.userId],
      }).onDelete("cascade"),
      foreignKey({
        name: "canvas_revisions_run_fk",
        columns: [t.runId, t.userId],
        foreignColumns: [agentRuns.id, agentRuns.userId],
      }),
      check("canvas_revisions_revision_check", sql`revision >= 1`),
      check("canvas_revisions_created_by_check", sql`created_by IN ('agent', 'human')`),
      check(
        "canvas_revisions_shape_check",
        sql`jsonb_typeof(nodes) = 'array' AND jsonb_typeof(edges) = 'array' AND jsonb_typeof(positions) = 'object'`,
      ),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 人工操作日志；下一轮 Agent 读取“未感知的人工编辑”并当作约束。 */
export const canvasOps = appSchema
  .table(
    "canvas_ops",
    {
      id: id(),
      userId: userRef(),
      conversationId: uuid("conversation_id").notNull(),
      /** 操作基于的画布版本。 */
      revision: integer("revision").notNull(),
      actor: text("actor", { enum: ["human", "agent"] }).notNull(),
      op: jsonb("op").notNull(),
      seenByAgent: boolean("seen_by_agent").notNull().default(false),
      createdAt: createdAt(),
    },
    (t) => [
      foreignKey({
        name: "canvas_ops_conversation_fk",
        columns: [t.conversationId, t.userId],
        foreignColumns: [conversations.id, conversations.userId],
      }).onDelete("cascade"),
      index("canvas_ops_unseen_idx")
        .on(t.conversationId, t.revision)
        .where(sql`NOT seen_by_agent`),
      check("canvas_ops_actor_check", sql`actor IN ('human', 'agent')`),
      check("canvas_ops_op_check", sql`coalesce(jsonb_typeof(op -> 'type') = 'string', false)`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

export const knowledgeBranches = appSchema
  .table(
    "knowledge_branches",
    {
      id: id(),
      userId: userRef(),
      mapId: uuid("map_id").notNull(),
      title: text("title").notNull(),
      lens: text("lens").notNull(),
      librarySource: text("library_source"),
      ord: integer("ord").notNull(),
    },
    (t) => [
      unique("knowledge_branches_id_user_key").on(t.id, t.userId),
      foreignKey({
        name: "knowledge_branches_map_fk",
        columns: [t.mapId, t.userId],
        foreignColumns: [knowledgeMaps.id, knowledgeMaps.userId],
      }).onDelete("cascade"),
      uniqueIndex("knowledge_branches_map_ord_key").on(t.mapId, t.ord),
      ownerIsolation(),
    ],
  )
  .enableRLS();

export const knowledgePoints = appSchema
  .table(
    "knowledge_points",
    {
      id: id(),
      userId: userRef(),
      mapId: uuid("map_id").notNull(),
      branchId: uuid("branch_id").notNull(),
      depth: integer("depth").notNull(),
      /** 三档名称同时生成，切换粒度不调模型（EC-K6）：{theme, concept, atomic}。 */
      labels: jsonb("labels").notNull(),
      summary: text("summary").notNull(),
      relation: text("relation"),
      coverage: text("coverage", { enum: ["covered", "partial", "missing"] }).notNull(),
      /** 命中的本库片段 ID 与摘录。 */
      evidence: jsonb("evidence")
        .notNull()
        .default(sql`'[]'::jsonb`),
      searchTerms: text("search_terms")
        .array()
        .notNull()
        .default(sql`'{}'::text[]`),
      createdAt: createdAt(),
    },
    (t) => [
      unique("knowledge_points_id_user_key").on(t.id, t.userId),
      foreignKey({
        name: "knowledge_points_map_fk",
        columns: [t.mapId, t.userId],
        foreignColumns: [knowledgeMaps.id, knowledgeMaps.userId],
      }).onDelete("cascade"),
      foreignKey({
        name: "knowledge_points_branch_fk",
        columns: [t.branchId, t.userId],
        foreignColumns: [knowledgeBranches.id, knowledgeBranches.userId],
      }).onDelete("cascade"),
      index("knowledge_points_branch_depth_idx").on(t.branchId, t.depth),
      check("knowledge_points_depth_check", sql`depth BETWEEN 1 AND 6`),
      check("knowledge_points_coverage_check", sql`coverage IN ('covered', 'partial', 'missing')`),
      check(
        "knowledge_points_labels_check",
        sql`coalesce(jsonb_typeof(labels -> 'theme') = 'string' AND jsonb_typeof(labels -> 'concept') = 'string' AND jsonb_typeof(labels -> 'atomic') = 'string', false)`,
      ),
      check("knowledge_points_evidence_check", sql`jsonb_typeof(evidence) = 'array'`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 知识点的联网搜索结果缓存（30 天）。 */
export const pointSearches = appSchema
  .table(
    "point_searches",
    {
      id: id(),
      userId: userRef(),
      pointId: uuid("point_id").notNull(),
      query: text("query").notNull(),
      scope: text("scope").notNull(),
      results: jsonb("results").notNull(),
      /** 各搜索源的状态（成功 / 超时 / 限流），部分失败照常展示（EC-K9）。 */
      providerStatus: jsonb("provider_status").notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      foreignKey({
        name: "point_searches_point_fk",
        columns: [t.pointId, t.userId],
        foreignColumns: [knowledgePoints.id, knowledgePoints.userId],
      }).onDelete("cascade"),
      index("point_searches_point_created_idx").on(t.pointId, t.createdAt.desc()),
      ownerIsolation(),
    ],
  )
  .enableRLS();

export const VERIFICATION_VERDICTS = [
  "supported",
  "partly_supported",
  "outdated",
  "unsupported",
  "insufficient",
] as const;

/** 外查核实记录（取值与界面 ExternalVerificationFlow 一致）。 */
export const verificationRecords = appSchema
  .table(
    "verification_records",
    {
      id: id(),
      userId: userRef(),
      noteId: uuid("note_id").notNull(),
      scope: text("scope", { enum: ["fact", "timeliness", "controversy"] }).notNull(),
      question: text("question").notNull(),
      verdict: text("verdict", { enum: VERIFICATION_VERDICTS }).notNull(),
      conclusion: text("conclusion").notNull(),
      evidence: jsonb("evidence").notNull(),
      appendToNote: boolean("append_to_note").notNull().default(false),
      verifiedAt: timestamptz("verified_at").notNull().defaultNow(),
    },
    (t) => [
      foreignKey({
        name: "verification_records_note_fk",
        columns: [t.noteId, t.userId],
        foreignColumns: [notes.id, notes.userId],
      }).onDelete("cascade"),
      index("verification_records_note_idx").on(t.noteId, t.verifiedAt.desc()),
      check("verification_records_scope_check", sql`scope IN ('fact', 'timeliness', 'controversy')`),
      check(
        "verification_records_verdict_check",
        sql`verdict IN ('supported', 'partly_supported', 'outdated', 'unsupported', 'insufficient')`,
      ),
      check("verification_records_evidence_check", sql`jsonb_typeof(evidence) = 'array'`),
      ownerIsolation(),
    ],
  )
  .enableRLS();
