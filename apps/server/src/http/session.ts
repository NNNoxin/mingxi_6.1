import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import { AppError } from "../errors";
import type { AuthPort, SessionLookup, SessionUser, UserTransaction } from "./types";

export interface ProtectedEnv {
  Variables: Omit<AppEnv["Variables"], "user"> & {
    user: SessionUser;
    /** 业务代码访问数据库的唯一入口：每次调用是一个以当前用户身份运行的事务。 */
    withUserTx: UserTransaction;
  };
}

/**
 * 解析当前会话。认证模块要求写回浏览器的 Cookie（滚动续期、清除失效会话）需要随本次响应返回：
 * 拒绝请求前调用 writeCookies，放行时在业务处理之后调用（业务处理可能直接返回一个新的 Response）。
 */
export async function readSession(
  c: Context,
  auth: AuthPort,
): Promise<{ session: SessionLookup | null; writeCookies: () => void }> {
  const { session, setCookie } = await auth.getSession(c.req.raw.headers);
  return {
    session,
    writeCookies: () => {
      for (const cookie of setCookie) c.header("Set-Cookie", cookie, { append: true });
    },
  };
}

/**
 * 业务接口的鉴权：没有有效会话返回 401，账号已冻结返回 403；
 * 通过后在上下文里放入当前用户与“以当前用户身份开事务”的函数（docs/02 §4.4 隔离点 1）。
 */
export function requireUser(
  auth: AuthPort,
  withUserTransaction: (userId: string) => UserTransaction,
): MiddlewareHandler<ProtectedEnv> {
  return async (c, next) => {
    const { session, writeCookies } = await readSession(c, auth);
    if (!session) {
      writeCookies();
      throw new AppError("unauthenticated", "请先登录");
    }
    if (session.user.status !== "active") {
      writeCookies();
      throw new AppError("forbidden", "账号已申请删除，处于冻结状态", { reason: "account_frozen" });
    }
    c.set("user", session.user);
    c.set("withUserTx", withUserTransaction(session.user.id));
    await next();
    writeCookies();
  };
}
