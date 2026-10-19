import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
  text,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, EMBEDDING_DIMENSIONS, id, ownerIsolation, timestamptz, updatedAt } from "./common";

/** 记忆与画像（docs/02 §5.4，策略见 docs/03 §4）。全部表按 user_id 强制行级隔离。 */
export const memorySchema = pgSchema("memory");

const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const EVENT_SOURCES = ["logic", "knowledge", "library", "verify", "profile"] as const;

/** 情景记忆：发生过什么。只追加；演示站与示范笔记产生的行为不写入（EC-M7，由写入方保证）。 */
export const events = memorySchema
  .table(
    "events",
    {
      id: id(),
      userId: userRef(),
      occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
      source: text("source", { enum: EVENT_SOURCES }).notNull(),
      /** 例如 clarify_option_picked、node_locked、trait_rolled_back。 */
      type: text("type").notNull(),
      subjectRef: text("subject_ref"),
      payload: jsonb("payload")
        .notNull()
        .default(sql`'{}'::jsonb`),
      weight: real("weight").notNull().default(1),
    },
    (t) => [
      unique("events_id_user_key").on(t.id, t.userId),
      index("events_user_occurred_idx").on(t.userId, t.occurredAt),
      check("events_source_check", sql`source IN ('logic', 'knowledge', 'library', 'verify', 'profile')`),
      check("events_type_check", sql`type ~ '^[a-z][a-z_]*$'`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/**
 * 画像维度白名单（docs/03 §4.1）。数据库约束只允许这些维度，
 * 从结构上杜绝推断健康、政治、宗教、性取向等敏感属性（EC-M5）。
 */
export const TRAIT_DIMENSIONS = [
  "knowledge_interest",
  "knowledge_level",
  "source_trust",
  "logic_paradigm",
  "granularity",
  "entry_point",
  "deepen_logic",
  "dig_direction",
  "perspective",
  "presentation",
] as const;

/** 语义 / 程序性记忆：它学到的我。每条特征都能追溯到证据（trait_evidence）。 */
export const traits = memorySchema
  .table(
    "traits",
    {
      id: id(),
      userId: userRef(),
      dimension: text("dimension", { enum: TRAIT_DIMENSIONS }).notNull(),
      key: text("key").notNull(),
      statement: text("statement").notNull(),
      /** 作用域：全局 / 某用途 / 某领域前缀，例如 {"kind":"purpose","value":"对标拆解"}。 */
      scope: jsonb("scope")
        .notNull()
        .default(sql`'{"kind":"global"}'::jsonb`),
      polarity: text("polarity", { enum: ["prefer", "avoid"] }).notNull(),
      weight: real("weight").notNull(),
      confidence: real("confidence").notNull(),
      status: text("status", { enum: ["proposed", "active", "rolled_back", "deleted"] })
        .notNull()
        .default("proposed"),
      origin: text("origin", { enum: ["rule", "reflection", "explicit"] }).notNull(),
      halfLifeDays: integer("half_life_days").notNull(),
      lastReinforcedAt: timestamptz("last_reinforced_at").notNull().defaultNow(),
      embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
      version: integer("version").notNull().default(1),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (t) => [
      unique("traits_id_user_key").on(t.id, t.userId),
      index("traits_user_dimension_idx").on(t.userId, t.dimension, t.status),
      check(
        "traits_dimension_check",
        sql`dimension IN ('knowledge_interest', 'knowledge_level', 'source_trust', 'logic_paradigm', 'granularity', 'entry_point', 'deepen_logic', 'dig_direction', 'perspective', 'presentation')`,
      ),
      check("traits_polarity_check", sql`polarity IN ('prefer', 'avoid')`),
      check("traits_status_check", sql`status IN ('proposed', 'active', 'rolled_back', 'deleted')`),
      check("traits_origin_check", sql`origin IN ('rule', 'reflection', 'explicit')`),
      check("traits_confidence_check", sql`confidence >= 0 AND confidence <= 1`),
      check("traits_half_life_check", sql`half_life_days > 0`),
      check("traits_scope_check", sql`coalesce(jsonb_typeof(scope -> 'kind') = 'string', false)`),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/**
 * 特征证据：回答“因为你之前……”（EC-M8）。
 * 删除特征时证据关联一并删除（EC-M6）；被引用的事件不能被单独清理（保留期限任务只清理未巩固的事件）。
 */
export const traitEvidence = memorySchema
  .table(
    "trait_evidence",
    {
      userId: userRef(),
      traitId: uuid("trait_id").notNull(),
      eventId: uuid("event_id").notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      primaryKey({ name: "trait_evidence_pkey", columns: [t.traitId, t.eventId] }),
      foreignKey({
        name: "trait_evidence_trait_fk",
        columns: [t.traitId, t.userId],
        foreignColumns: [traits.id, traits.userId],
      }).onDelete("cascade"),
      foreignKey({
        name: "trait_evidence_event_fk",
        columns: [t.eventId, t.userId],
        foreignColumns: [events.id, events.userId],
      }),
      index("trait_evidence_event_idx").on(t.eventId),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 否定约束：用户回滚过的特征不再学回来（EC-M6）。 */
export const traitConstraints = memorySchema
  .table(
    "trait_constraints",
    {
      userId: userRef(),
      dimension: text("dimension", { enum: TRAIT_DIMENSIONS }).notNull(),
      key: text("key").notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      primaryKey({ name: "trait_constraints_pkey", columns: [t.userId, t.dimension, t.key] }),
      check(
        "trait_constraints_dimension_check",
        sql`dimension IN ('knowledge_interest', 'knowledge_level', 'source_trust', 'logic_paradigm', 'granularity', 'entry_point', 'deepen_logic', 'dig_direction', 'perspective', 'presentation')`,
      ),
      ownerIsolation(),
    ],
  )
  .enableRLS();

/** 知识状态：知识补全据此判断“你已经懂什么、缺什么”。 */
export const userConcepts = memorySchema
  .table(
    "user_concepts",
    {
      userId: userRef(),
      concept: text("concept").notNull(),
      embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
      state: text("state", { enum: ["unknown", "seen", "understood", "applied"] }).notNull(),
      evidenceCount: integer("evidence_count").notNull().default(0),
      lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
    },
    (t) => [
      primaryKey({ name: "user_concepts_pkey", columns: [t.userId, t.concept] }),
      index("user_concepts_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
      check("user_concepts_state_check", sql`state IN ('unknown', 'seen', 'understood', 'applied')`),
      check("user_concepts_evidence_check", sql`evidence_count >= 0`),
      ownerIsolation(),
    ],
  )
  .enableRLS();
