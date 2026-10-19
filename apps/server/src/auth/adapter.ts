import type { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;

interface PgError {
  code?: string;
  constraint?: string;
  cause?: unknown;
}

/** 驱动错误可能被查询构造器包了一层（cause），逐层找 PostgreSQL 的错误码与约束名。 */
function isDuplicateEmail(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const pg = current as PgError;
    if (pg.code === "23505" && pg.constraint === "users_email_key") return true;
    current = pg.cause;
  }
  return false;
}

function guardCreate<T extends Pick<Adapter, "create">>(adapter: T): T["create"] {
  return async (args) => {
    try {
      return await adapter.create(args);
    } catch (error) {
      if (args.model === "user" && isDuplicateEmail(error)) {
        throw new APIError("FORBIDDEN", { code: "USER_ALREADY_EXISTS", message: "该邮箱已注册" });
      }
      throw error;
    }
  };
}

function wrap(adapter: Adapter): Adapter {
  return {
    ...adapter,
    create: guardCreate(adapter),
    transaction: (callback) => adapter.transaction((trx) => callback({ ...trx, create: guardCreate(trx) })),
  };
}

/**
 * 同一邮箱并发注册时（EC-U1），两个请求都通过了“邮箱是否已存在”的检查，后插入的那个会撞上唯一约束。
 * 认证模块对已注册邮箱的约定是：注册接口返回与正常注册相同的通用结果（不透露邮箱是否已注册），
 * 并把“创建用户时抛出的 403”按同样方式处理。这里在适配器这一层把唯一约束冲突换成这个 403，
 * 让并发时的结果与顺序重复注册一致，而不是返回“创建用户失败”。包括事务内使用的适配器。
 */
export function withDuplicateEmailHandling(factory: AdapterFactory): AdapterFactory {
  return (options) => wrap(factory(options));
}
