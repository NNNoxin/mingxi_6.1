import {
  HTTP_STATUS_BY_CODE,
  PERMISSIONS_BY_ROLE,
  ReasonBody,
  RoleChangeBody,
  StaffRole,
  type AdminPermission,
  type AdminSession,
  type AdminUserDetail,
  type AdminUserSummary,
  type AuditPage,
  type ErrorCode,
  type OutboxEntry,
  type OutboxPage,
  type StaffMe,
} from "@mingxi/contracts";
import { z } from "zod";
import { nextId, type DemoState, type DemoUser } from "./dataset";

// 后台演示版的“服务端”：在页面里按真实接口的路径、规则与响应形状处理请求（docs/05 §12.5）。
// 规则与 apps/server/src/admin 一致：查找与分页方式、工作人员不能直接冻结、冷静期内不能解冻、
// 至少保留一个开启两步验证的管理员、撤销全部工作人员会话时保留当前这次登录、每个写操作写审计。
// 与真实服务端的差别：任意邮箱和密码都能登录（登录的始终是演示管理员），任意 6 位数字都是有效验证码，
// 不检查“敏感操作需 10 分钟内登录”。

export interface DemoRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface DemoResponse {
  status: number;
  body: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 20;
const SESSION_MS = 7 * 24 * 60 * 60_000;
const DEMO_USER_AGENT = "演示版浏览器";

class DemoError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** 认证接口的失败（Better Auth 的响应形状：{ code, message }）。 */
class AuthFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DemoError("bad_request", "请求内容不合法", {
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

function activeSessions(user: DemoUser, now: Date) {
  return user.sessions.filter((session) => new Date(session.expiresAt) > now);
}

function summary(user: DemoUser, now: Date): AdminUserSummary {
  const sessions = activeSessions(user, now);
  const lastActive =
    sessions
      .map((session) => session.lastActiveAt)
      .sort()
      .at(-1) ?? null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    role: user.role,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
    deletionRequestedAt: user.deletionRequestedAt,
    activeSessions: sessions.length,
    lastActiveAt: lastActive,
    planId: user.planId,
  };
}

function byCreatedDesc(a: DemoUser, b: DemoUser) {
  return a.createdAt < b.createdAt ? 1 : -1;
}

export function handleDemoRequest(state: DemoState, request: DemoRequest, now: Date): DemoResponse {
  const requestId = () => nextId(state, now.getTime());
  try {
    if (request.path.startsWith("/api/auth/")) return authRoute(state, request, now);
    if (request.path.startsWith("/api/admin/")) return adminRoute(state, request, now, requestId);
    throw new DemoError("not_found", "接口不存在");
  } catch (error) {
    if (error instanceof AuthFailure) {
      return { status: error.status, body: { code: error.code, message: error.code } };
    }
    if (error instanceof DemoError) {
      return {
        status: HTTP_STATUS_BY_CODE[error.code],
        body: {
          error: {
            code: error.code,
            message: error.message,
            requestId: requestId(),
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        },
      };
    }
    throw error;
  }
}

function operatorOf(state: DemoState): DemoUser {
  const operator = state.users.find((user) => user.id === state.operatorId);
  if (!operator) throw new Error("演示数据集缺少演示管理员");
  return operator;
}

/** 当前这次登录的会话；被撤销（例如在后台对自己“退出所有设备”）后视为没有登录。 */
function currentSession(state: DemoState) {
  if (state.login.stage !== "verified") return null;
  const { sessionId } = state.login;
  return operatorOf(state).sessions.find((session) => session.id === sessionId) ?? null;
}

const SignInBody = z.object({ email: z.string().min(1), password: z.string().min(1) });
const CodeBody = z.object({ code: z.string() });

function authRoute(state: DemoState, request: DemoRequest, now: Date): DemoResponse {
  const route = `${request.method} ${request.path.slice("/api/auth".length)}`;
  switch (route) {
    case "POST /sign-in/email": {
      if (!SignInBody.safeParse(request.body).success)
        throw new AuthFailure(400, "INVALID_EMAIL_OR_PASSWORD");
      state.login = { stage: "password" };
      return { status: 200, body: { twoFactorRedirect: true } };
    }
    case "POST /two-factor/verify-totp":
    case "POST /two-factor/verify-backup-code": {
      if (state.login.stage !== "password") throw new AuthFailure(401, "INVALID_TWO_FACTOR_COOKIE");
      const backup = request.path.endsWith("backup-code");
      const { code } = parse(CodeBody, request.body);
      const valid = backup ? code.trim().length > 0 : /^\d{6}$/.test(code.trim());
      if (!valid) throw new AuthFailure(400, backup ? "INVALID_BACKUP_CODE" : "INVALID_CODE");
      const at = now.getTime();
      const session = {
        id: nextId(state, at),
        userAgent: DEMO_USER_AGENT,
        createdAt: now.toISOString(),
        lastActiveAt: now.toISOString(),
        expiresAt: new Date(at + SESSION_MS).toISOString(),
        mfaVerified: true,
      };
      operatorOf(state).sessions.push(session);
      state.login = { stage: "verified", sessionId: session.id };
      state.audit.push({
        id: nextId(state, at),
        at: now.toISOString(),
        actorUserId: state.operatorId,
        action: "auth.sign_in",
        targetType: null,
        targetId: null,
        metadata: {},
      });
      return { status: 200, body: { token: null } };
    }
    case "POST /sign-out": {
      const session = currentSession(state);
      if (session) {
        const operator = operatorOf(state);
        operator.sessions = operator.sessions.filter((item) => item.id !== session.id);
      }
      state.login = { stage: "signed_out" };
      return { status: 200, body: { success: true } };
    }
    case "GET /get-session": {
      if (!currentSession(state)) return { status: 200, body: null };
      const operator = operatorOf(state);
      return {
        status: 200,
        body: { user: { email: operator.email, twoFactorEnabled: operator.twoFactorEnabled } },
      };
    }
    case "POST /two-factor/enable":
      throw new AuthFailure(400, "TOTP_ALREADY_ENABLED");
    default:
      throw new DemoError("not_found", "接口不存在");
  }
}

const ACTION_PATH =
  /^\/users\/([^/]+)\/(freeze|unfreeze|revoke-sessions|resend-verification|send-password-reset)$/;
const DETAIL_PATH = /^\/users\/([^/]+)$/;

function adminRoute(
  state: DemoState,
  request: DemoRequest,
  now: Date,
  requestId: () => string,
): DemoResponse {
  const session = currentSession(state);
  if (!session) throw new DemoError("unauthenticated", "请先登录");
  const operator = operatorOf(state);
  const role = StaffRole.safeParse(operator.role);
  if (!role.success) throw new DemoError("forbidden", "这个账号不是工作人员", { reason: "not_staff" });
  const permissions = PERMISSIONS_BY_ROLE[role.data];
  const need = (permission: AdminPermission) => {
    if (!permissions.includes(permission)) {
      throw new DemoError("forbidden", "当前角色没有这个操作的权限", { reason: "permission_denied" });
    }
  };
  const path = request.path.slice("/api/admin".length);
  const at = now.getTime();
  const audit = (action: string, targetId: string | null, metadata: Record<string, unknown>) => {
    state.audit.push({
      id: nextId(state, at),
      at: now.toISOString(),
      actorUserId: operator.id,
      action,
      targetType: targetId ? "user" : null,
      targetId,
      metadata: { ...metadata, requestId: requestId() },
    });
  };
  const target = (id: string) => {
    const user = state.users.find((item) => item.id === id);
    if (!user) throw new DemoError("not_found", "没有这个用户");
    return user;
  };
  const done = { status: 200, body: { ok: true } };

  if (request.method === "GET" && path === "/me") {
    const me: StaffMe = {
      id: operator.id,
      email: operator.email,
      name: operator.name,
      role: role.data,
      permissions: [...permissions],
      sessionCreatedAt: session.createdAt,
    };
    return { status: 200, body: me };
  }

  if (request.method === "GET" && path === "/users") {
    need("users.read");
    const q = (request.query.get("q") ?? "").trim();
    const users = UUID.test(q)
      ? state.users.filter((user) => user.id === q.toLowerCase())
      : state.users
          .filter((user) => q === "" || user.email.toLowerCase().startsWith(q.toLowerCase()))
          .sort(byCreatedDesc)
          .slice(0, SEARCH_LIMIT);
    return { status: 200, body: { users: users.map((user) => summary(user, now)) } };
  }

  const detail = DETAIL_PATH.exec(path);
  if (request.method === "GET" && detail?.[1]) {
    need("users.read");
    const user = target(detail[1]);
    const body: AdminUserDetail = {
      user: summary(user, now),
      sessions: activeSessions(user, now)
        .sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1))
        .slice(0, PAGE_SIZE)
        .map((item): AdminSession => ({ ...item })),
    };
    return { status: 200, body };
  }

  const action = ACTION_PATH.exec(path);
  if (request.method === "POST" && action?.[1] && action[2]) {
    const user = target(action[1]);
    const { reason } = parse(ReasonBody, request.body);
    switch (action[2]) {
      case "freeze": {
        need("users.freeze");
        if (user.role !== "user")
          throw new DemoError("conflict", "工作人员账号不能直接冻结：先撤销工作人员身份");
        if (user.status === "frozen") throw new DemoError("conflict", "这个账号已经是冻结状态");
        const revoked = user.sessions.length;
        user.status = "frozen";
        user.sessions = [];
        audit("admin.user_frozen", user.id, { reason, revokedSessions: revoked });
        return done;
      }
      case "unfreeze": {
        need("users.freeze");
        if (user.deletionRequestedAt) {
          throw new DemoError("conflict", "用户已申请删除账号，冷静期内只能由用户本人撤销申请");
        }
        if (user.status === "active") throw new DemoError("conflict", "这个账号没有被冻结");
        user.status = "active";
        audit("admin.user_unfrozen", user.id, { reason });
        return done;
      }
      case "revoke-sessions": {
        need("users.sessions.revoke");
        const revoked = user.sessions.length;
        user.sessions = [];
        audit("admin.sessions_revoked", user.id, { reason, revokedSessions: revoked });
        return done;
      }
      case "resend-verification": {
        need("users.email.resend");
        if (user.emailVerified) throw new DemoError("conflict", "这个账号已经验证过邮箱");
        audit("admin.verification_resent", user.id, { reason });
        deliver(state, now, user.email, "verify_email");
        return done;
      }
      default: {
        need("users.email.resend");
        if (!user.emailVerified) throw new DemoError("conflict", "这个账号还没有验证邮箱，先重发验证邮件");
        if (user.status !== "active") throw new DemoError("conflict", "账号已冻结，不能重置密码");
        audit("admin.password_reset_sent", user.id, { reason });
        deliver(state, now, user.email, "reset_password");
        return done;
      }
    }
  }

  if (request.method === "GET" && path === "/audit") {
    need("audit.read");
    return { status: 200, body: auditPage(state, request.query) };
  }

  if (request.method === "GET" && path === "/email-outbox") {
    need("jobs.read");
    return { status: 200, body: outboxPage(state, request.query) };
  }

  if (request.method === "GET" && path === "/staff") {
    need("staff.manage");
    const staff = state.users
      .filter((user) => user.role !== "user")
      .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role.localeCompare(b.role)));
    return { status: 200, body: { staff: staff.map((user) => summary(user, now)) } };
  }

  if (request.method === "POST" && path === "/staff") {
    need("staff.manage");
    const input = parse(RoleChangeBody, request.body);
    const user = state.users.find((item) => item.email === input.email);
    if (!user)
      throw new DemoError("conflict", `没有邮箱为 ${input.email} 的账号：请先在正式站注册并验证邮箱`);
    if (!user.emailVerified) throw new DemoError("conflict", `账号 ${input.email} 还没有验证邮箱`);
    if (user.role === input.role) return done;
    if (user.role === "admin") {
      const others = state.users.filter(
        (item) => item.role === "admin" && item.id !== user.id && item.twoFactorEnabled,
      );
      if (others.length === 0) {
        throw new DemoError(
          "conflict",
          "不能撤销最后一个已开启两步验证的管理员：先让另一位管理员开启两步验证",
        );
      }
    }
    const from = user.role;
    user.role = input.role;
    audit("staff.role_changed", user.id, { from, to: input.role, via: "admin", reason: input.reason });
    return done;
  }

  if (request.method === "POST" && path === "/staff/revoke-sessions") {
    need("staff.manage");
    const { reason } = parse(ReasonBody, request.body);
    const staff = state.users.filter((user) => user.role !== "user");
    let revokedSessions = 0;
    for (const user of staff) {
      const kept = user.sessions.filter((item) => item.id === session.id);
      revokedSessions += user.sessions.length - kept.length;
      user.sessions = kept;
    }
    const result = { revokedSessions, staffAccounts: staff.length };
    audit("admin.staff_sessions_revoked", null, { reason, ...result });
    return { status: 200, body: { ok: true, ...result } };
  }

  throw new DemoError("not_found", "接口不存在");
}

/** 演示版没有后台任务：新邮件直接记为已发送。 */
function deliver(state: DemoState, now: Date, toAddress: string, template: OutboxEntry["template"]) {
  const at = now.toISOString();
  state.outbox.push({
    id: nextId(state, now.getTime()),
    toAddress,
    template,
    status: "sent",
    attempts: 1,
    lastError: null,
    createdAt: at,
    nextAttemptAt: at,
    sentAt: at,
  });
}

function auditPage(state: DemoState, query: URLSearchParams): AuditPage {
  const actor = query.get("actor") ?? "";
  const targetId = query.get("target") ?? "";
  const action = query.get("action") ?? "";
  const before = query.get("before") ?? "";
  const emails = new Map(state.users.map((user) => [user.id, user.email]));
  const rows = state.audit
    .filter((entry) => !(actor && UUID.test(actor)) || entry.actorUserId === actor)
    .filter((entry) => !targetId || entry.targetId === targetId)
    .filter((entry) => !action || entry.action.startsWith(action))
    .filter((entry) => !(before && UUID.test(before)) || entry.id < before)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  const page = rows.slice(0, PAGE_SIZE);
  return {
    entries: page.map((entry) => ({
      ...entry,
      actorEmail: entry.actorUserId ? (emails.get(entry.actorUserId) ?? null) : null,
    })),
    nextBefore: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}

const OutboxStatus = z.enum(["pending", "sending", "sent", "failed"]);

function outboxPage(state: DemoState, query: URLSearchParams): OutboxPage {
  const status = OutboxStatus.safeParse(query.get("status"));
  const before = query.get("before") ?? "";
  const rows = state.outbox
    .filter((entry) => !status.success || entry.status === status.data)
    .filter((entry) => !(before && UUID.test(before)) || entry.id < before)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  const page = rows.slice(0, PAGE_SIZE);
  return { entries: page, nextBefore: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null };
}
