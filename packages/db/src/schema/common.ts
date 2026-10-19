import { sql } from "drizzle-orm";
import { customType, pgPolicy, timestamp, uuid } from "drizzle-orm/pg-core";

/** 大小写不敏感文本（citext 扩展），用于邮箱。 */
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

/** 全文检索向量。中文分词在应用层完成（Intl.Segmenter），入库时用 simple 配置。 */
export const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

/** 嵌入向量维度（bge-m3），docs/02 §5.1。 */
export const EMBEDDING_DIMENSIONS = 1024;

/** 主键：UUIDv7，时间有序（docs/02 §3）。数据库默认值由迁移 0001 的 app.uuid_v7() 生成。 */
export const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`app.uuid_v7()`);

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** 由触发器 app.touch_updated_at() 在每次 UPDATE 时刷新（迁移 0003）。 */
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// 约束提示：CHECK 结果为 NULL 时视为通过。检查 JSONB 内部键（x -> 'key' 可能为 NULL）的约束一律包一层
// coalesce(..., false)，否则缺键或类型不对的数据会被放进来（集成测试覆盖）。

/**
 * 行级隔离策略：只能读写 user_id 等于当前事务 app.user_id 的行（docs/02 §3、§4.4）。
 * 未设置 app.user_id 时 app.current_user_id() 为 NULL，任何行都不可见、任何写入都被拒绝。
 * 子查询写法让函数每条语句只算一次，而不是每行一次。
 */
export const ownerIsolation = () =>
  pgPolicy("owner_isolation", {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`user_id = (SELECT app.current_user_id())`,
    withCheck: sql`user_id = (SELECT app.current_user_id())`,
  });
