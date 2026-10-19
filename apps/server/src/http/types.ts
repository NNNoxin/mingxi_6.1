import type { PoolClient } from "@mingxi/db";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: "user" | "admin" | "support";
  /** frozen：已申请删除账号，所有业务接口拒绝访问（EC-U4）。 */
  status: "active" | "frozen";
}

export interface SessionLookup {
  sessionId: string;
  user: SessionUser;
}

export interface SessionResolution {
  session: SessionLookup | null;
  /** 认证模块要求写回浏览器的 Cookie：会话滚动续期时的新 Cookie，或会话失效时的清除指令。 */
  setCookie: string[];
}

/** 认证模块对外的两个能力：处理 /api/auth/*，按请求头解析当前会话。 */
export interface AuthPort {
  handler: (request: Request) => Promise<Response>;
  getSession: (headers: Headers) => Promise<SessionResolution>;
}

/** 以当前用户身份开一个数据库事务（set_config app.user_id，行级隔离生效）。 */
export type UserTransaction = <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
