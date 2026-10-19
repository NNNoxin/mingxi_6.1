-- 0001 · 运行时基础：主键生成、当前用户、更新时间触发器函数、运行时权限组（docs/02 §3、§4.4）
--
-- 迁移由表 owner 执行。mingxi_runtime 是不能登录、没有口令的权限组，应用运行时的数据库账号是它的成员；
-- 各环境的登录账号由 `pnpm --filter @mingxi/db db:runtime-role` 按 DATABASE_URL 创建（口令不进迁移）。
-- 行级隔离对超级用户和带 BYPASSRLS 的角色无效，所以运行时账号必须是普通角色（服务启动时校验）。

-- UUIDv7（RFC 9562）：前 48 位为毫秒时间戳，版本号 7，其余随机。PostgreSQL 18 起自带 uuidv7()，16 需要自定义。
-- 做法：取一个随机 UUIDv4，用时间戳覆盖前 6 个字节，再把版本位从 0100 改成 0111（第 52、53 位）。
CREATE OR REPLACE FUNCTION app.uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE PARALLEL SAFE AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid
$$;--> statement-breakpoint
COMMENT ON FUNCTION app.uuid_v7() IS '时间有序的 UUIDv7，作为各表主键默认值';--> statement-breakpoint

-- 当前事务的用户身份（由 withUserTransaction 用 set_config(..., true) 设置，事务结束即失效）。
-- 未设置或事务结束后会话里残留空字符串时返回 NULL：行级隔离策略因此看不到任何行、拒绝任何写入。
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;--> statement-breakpoint
COMMENT ON FUNCTION app.current_user_id() IS '行级隔离策略使用的当前用户 ID；未设置时为 NULL';--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mingxi_runtime') THEN
    CREATE ROLE mingxi_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
COMMENT ON ROLE mingxi_runtime IS '明晰应用运行时权限组：只有业务表的增删改查，受行级隔离约束';--> statement-breakpoint

GRANT USAGE ON SCHEMA auth, app, memory, ops TO mingxi_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.uuid_v7(), app.current_user_id() TO mingxi_runtime;--> statement-breakpoint

-- 之后由 owner 在 auth / app / memory 里新建的表自动授予增删改查；ops 里的表逐张授权（迁移 0003）。
ALTER DEFAULT PRIVILEGES IN SCHEMA auth, app, memory
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mingxi_runtime;
