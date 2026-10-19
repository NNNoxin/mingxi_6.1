import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { schema, type Pool } from "@mingxi/db";
import type { ServerEnv } from "../env";
import { CLIENT_IP_HEADER } from "../http/client-ip";
import type { AuthPort } from "../http/types";
import type { Logger } from "../logger";
import { enqueueEmail } from "../mail/outbox";
import type { RateLimiter } from "../rate-limit";
import { withDuplicateEmailHandling } from "./adapter";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from "./password-policy";

export type AuthEnv = Pick<
  ServerEnv,
  | "NODE_ENV"
  | "MINGXI_PUBLIC_URL"
  | "BETTER_AUTH_SECRET"
  | "GITHUB_CLIENT_ID"
  | "GITHUB_CLIENT_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
>;

export interface AuthDependencies {
  env: AuthEnv;
  /** 运行时账号的连接池（auth schema 不启用行级隔离，由认证模块统一读写）。 */
  pool: Pool;
  rateLimiter: RateLimiter;
  logger: Logger;
}

const SESSION_DAYS = 7;

/** 审计日志里的 IP 只存加盐哈希（docs/02 §4.3 L2）。 */
function hashIp(secret: string, ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex").slice(0, 32);
}

async function audit(
  pool: Pool,
  entry: { actorUserId: string; action: string; ipHash?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  await pool.query(
    "INSERT INTO ops.audit_log (actor_user_id, action, ip_hash, metadata) VALUES ($1, $2, $3, $4)",
    [entry.actorUserId, entry.action, entry.ipHash ?? null, JSON.stringify(entry.metadata ?? {})],
  );
}

/** 需要检查密码强度的接口与对应的请求字段。 */
const PASSWORD_FIELDS: Record<string, string> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
};

/**
 * 认证（docs/02 §4.1）：邮箱 + 密码，必须验证邮箱后才能登录；找回密码；数据库会话 7 天滚动续期；
 * 设备列表与退出所有设备；第三方登录按配置启用；按 IP 与接口限流（计数在 Redis，多实例共享）。
 */
export function createAuth({ env, pool, rateLimiter, logger }: AuthDependencies) {
  const origin = new URL(env.MINGXI_PUBLIC_URL).origin;
  const socialProviders = {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
  };

  return betterAuth({
    appName: "明晰",
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    database: withDuplicateEmailHandling(
      drizzleAdapter(drizzle(pool), {
        provider: "pg",
        // 注册时用户与密码账号在同一个事务里写入。
        transaction: true,
        schema: {
          user: schema.users,
          session: schema.sessions,
          account: schema.accounts,
          verification: schema.verifications,
        },
      }),
    ),
    advanced: {
      // 主键由数据库生成（app.uuid_v7()），与业务表的 user_id 类型一致。
      database: { generateId: false },
      cookiePrefix: "mingxi",
      useSecureCookies: env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      // 限流与会话记录用的客户端地址只读服务端算好的这个头（app.ts 按可信代理层数计算并覆盖客户端自带的值），
      // 不读客户端可以伪造的 X-Forwarded-For。
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, input: false, defaultValue: "user" },
        status: { type: "string", required: false, input: false, defaultValue: "active" },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await enqueueEmail(pool, {
          to: user.email,
          template: "reset_password",
          payload: { name: user.name, url },
        });
      },
      onPasswordReset: async ({ user }) => {
        await audit(pool, { actorUserId: user.id, action: "auth.password_reset" });
      },
      // 已注册的邮箱再次注册：接口照常返回通用结果（不透露邮箱是否已注册），提示通过邮件发给邮箱主人；
      // 同一邮箱一小时内最多发一封，避免被人用来轰炸别人的邮箱。
      onExistingUserSignUp: async ({ user }) => {
        const recent = await pool.query(
          `SELECT 1 FROM ops.email_outbox
            WHERE to_address = $1 AND template = 'existing_account' AND created_at > now() - interval '1 hour'
            LIMIT 1`,
          [user.email],
        );
        if (recent.rowCount) return;
        await enqueueEmail(pool, {
          to: user.email,
          template: "existing_account",
          payload: { name: user.name, url: `${origin}/login` },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await enqueueEmail(pool, {
          to: user.email,
          template: "verify_email",
          payload: { name: user.name, url },
        });
      },
    },
    session: {
      expiresIn: SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      // 改密码、删除账号、导出数据等敏感操作要求最近 10 分钟内登录过。
      freshAge: 10 * 60,
    },
    account: { encryptOAuthTokens: true },
    socialProviders,
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60 * 60, max: 10 },
        "/send-verification-email": { window: 5 * 60, max: 3 },
        "/request-password-reset": { window: 5 * 60, max: 3 },
        "/reset-password": { window: 5 * 60, max: 5 },
        "/change-password": { window: 5 * 60, max: 5 },
      },
      customStorage: { consume: (key, rule) => rateLimiter.consume(`auth:${key}`, rule) },
    },
    hooks: {
      before: createAuthMiddleware((ctx) => {
        const field = PASSWORD_FIELDS[ctx.path];
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const password = field ? body[field] : undefined;
        if (typeof password !== "string") return Promise.resolve();
        // 注册时请求里带邮箱与昵称，可以一并检查“密码不含邮箱用户名 / 昵称”；改密码、重置密码只检查常见密码与重复字符。
        const problem = passwordProblem(password, {
          email: typeof body.email === "string" ? body.email : "",
          name: typeof body.name === "string" ? body.name : undefined,
        });
        if (!problem) return Promise.resolve();
        return Promise.reject(new APIError("BAD_REQUEST", { message: problem, code: "WEAK_PASSWORD" }));
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await audit(pool, { actorUserId: user.id, action: "auth.sign_up" });
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await audit(pool, {
              actorUserId: session.userId,
              action: "auth.sign_in",
              ipHash: hashIp(env.BETTER_AUTH_SECRET, session.ipAddress),
            });
          },
        },
      },
    },
    logger: {
      level: "warn",
      // 附带参数里可能有用户对象或令牌，只保留错误的名称与消息。
      log: (level, message, ...args: unknown[]) => {
        const errors = args
          .filter((arg): arg is Error => arg instanceof Error)
          .map((error) => ({ name: error.name, message: error.message }));
        logger[level]({ source: "better-auth", errors }, message);
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** 会话接口的返回：没有会话时为 null；只取业务需要的字段。 */
const SessionPayload = z
  .object({
    session: z.object({ id: z.string() }),
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      emailVerified: z.boolean(),
      role: z.enum(schema.USER_ROLES),
      status: z.enum(schema.USER_STATUSES),
    }),
  })
  .nullable();

/** 把认证模块包装成服务端使用的 AuthPort。 */
export function authPort(auth: Auth): AuthPort {
  return {
    handler: (request) => auth.handler(request),
    getSession: async (headers) => {
      // 以响应形式取结果：会话在续期途中被删除时认证模块回 401 并附带清除 Cookie 的指令，
      // 这属于“没有会话”，不是服务器错误；其余非 2xx 才按错误处理。
      const response = await auth.api.getSession({ headers, asResponse: true });
      const setCookie = response.headers.getSetCookie();
      if (response.status === 401) return { session: null, setCookie };
      if (!response.ok) throw new Error(`读取会话失败：认证模块返回 ${String(response.status)}`);
      const payload = SessionPayload.parse(await response.json());
      return {
        session: payload ? { sessionId: payload.session.id, user: payload.user } : null,
        setCookie,
      };
    },
  };
}
