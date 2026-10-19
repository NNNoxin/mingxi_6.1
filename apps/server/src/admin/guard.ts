import type { MiddlewareHandler } from "hono";
import {
  PERMISSIONS_BY_ROLE,
  SENSITIVE_PERMISSIONS,
  StaffRole,
  type AdminDenialReason,
  type AdminPermission,
} from "@mingxi/contracts";
import type { AppEnv } from "../app";
import { AppError } from "../errors";
import { readSession } from "../http/session";
import type { AuthPort, SessionLookup, SessionUser } from "../http/types";

/** 工作人员会话最长 12 小时，之后必须重新登录（docs/05 §3 第 2 条）。 */
export const STAFF_SESSION_MAX_MS = 12 * 60 * 60 * 1000;
/** 敏感操作要求会话在 10 分钟内建立。 */
export const RECENT_LOGIN_MS = 10 * 60 * 1000;

export interface StaffContext {
  session: SessionLookup;
  role: StaffRole;
  permissions: ReadonlySet<AdminPermission>;
}

export interface AdminEnv {
  Variables: Omit<AppEnv["Variables"], "user"> & {
    user: SessionUser;
    staff: StaffContext;
  };
}

function deny(code: "unauthenticated" | "forbidden", reason: AdminDenialReason, message: string): AppError {
  return new AppError(code, message, { reason });
}

/**
 * 后台接口的工作人员检查：已登录、角色是工作人员、账号未冻结、开启了两步验证，
 * 当前会话经过两步验证建立且不超过 12 小时。任一不满足即拒绝，并在 details.reason 里说明原因。
 */
export function requireStaff(auth: AuthPort, now: () => number = Date.now): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const { session, writeCookies } = await readSession(c, auth);
    const reject = (error: AppError): never => {
      writeCookies();
      throw error;
    };
    if (!session) return reject(new AppError("unauthenticated", "请先登录"));
    const role = StaffRole.safeParse(session.user.role);
    if (!role.success) return reject(deny("forbidden", "not_staff", "这个账号不是工作人员"));
    if (session.user.status !== "active") {
      return reject(deny("forbidden", "not_staff", "账号已冻结"));
    }
    if (!session.user.twoFactorEnabled || !session.mfaVerified) {
      return reject(deny("forbidden", "mfa_required", "工作人员必须开启两步验证，并用验证码登录"));
    }
    if (now() - session.createdAt.getTime() > STAFF_SESSION_MAX_MS) {
      return reject(deny("unauthenticated", "session_too_old", "后台登录已超过 12 小时，请重新登录"));
    }
    c.set("user", session.user);
    c.set("staff", { session, role: role.data, permissions: new Set(PERMISSIONS_BY_ROLE[role.data]) });
    await next();
    writeCookies();
  };
}

/**
 * 接口所需的权限。写操作若属于敏感权限（SENSITIVE_PERMISSIONS），还要求 10 分钟内重新登录过，
 * 后台界面据 details.reason = reauth_required 引导重新登录。
 */
export function requirePermission(
  permission: AdminPermission,
  options: { write: boolean },
  now: () => number = Date.now,
): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const { staff } = c.var;
    if (!staff.permissions.has(permission)) {
      throw deny("forbidden", "permission_denied", "当前角色没有这个操作的权限");
    }
    if (
      options.write &&
      SENSITIVE_PERMISSIONS.has(permission) &&
      now() - staff.session.createdAt.getTime() > RECENT_LOGIN_MS
    ) {
      throw deny("forbidden", "reauth_required", "这是敏感操作，请重新登录确认身份后再试");
    }
    await next();
  };
}
