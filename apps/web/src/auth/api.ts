/**
 * 正式站调用认证接口（apps/server 的 /api/auth/*，同源，Cookie 会话）。
 * 每个调用都返回明确的成功或失败，失败带上认证模块的错误码，由 messages.ts 翻译成界面文案。
 */

export type AuthFailure =
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "network" }
  | { kind: "error"; status: number; code: string | null; message: string | null };

export type AuthResult = { ok: true } | ({ ok: false } & AuthFailure);

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

function failureFrom(response: Response, parsed: ErrorBody | null): AuthFailure {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("X-Retry-After"));
    return {
      kind: "rate_limited",
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    };
  }
  return {
    kind: "error",
    status: response.status,
    code: typeof parsed?.code === "string" ? parsed.code : null,
    message: typeof parsed?.message === "string" ? parsed.message : null,
  };
}

async function post(path: string, body: Record<string, string>): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: "network" };
  }
  if (response.ok) return { ok: true };
  const parsed = (await response.json().catch(() => null)) as ErrorBody | null;
  return { ok: false, ...failureFrom(response, parsed) };
}

export type SessionCheck =
  | { kind: "signed_in"; email: string; emailVerified: boolean }
  | { kind: "signed_out" }
  | { kind: "failed"; failure: AuthFailure };

/** 向服务端确认当前浏览器的登录状态（不凭地址栏参数判断）。 */
export async function currentSession(): Promise<SessionCheck> {
  let response: Response;
  try {
    response = await fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" });
  } catch {
    return { kind: "failed", failure: { kind: "network" } };
  }
  const parsed = (await response.json().catch(() => null)) as
    (ErrorBody & { user?: { email?: unknown; emailVerified?: unknown } }) | null;
  if (!response.ok) return { kind: "failed", failure: failureFrom(response, parsed) };
  const user = parsed?.user;
  if (!user || typeof user.email !== "string") return { kind: "signed_out" };
  return { kind: "signed_in", email: user.email, emailVerified: user.emailVerified === true };
}

export function signIn(email: string, password: string): Promise<AuthResult> {
  return post("/sign-in/email", { email, password });
}

/** 注册。邮箱已注册时认证模块同样返回成功（不透露邮箱是否已注册），提示由邮件发给邮箱主人。 */
export function signUp(
  name: string,
  email: string,
  password: string,
  verifyCallbackPath: string,
): Promise<AuthResult> {
  return post("/sign-up/email", { name, email, password, callbackURL: verifyCallbackPath });
}

export function resendVerification(email: string, verifyCallbackPath: string): Promise<AuthResult> {
  return post("/send-verification-email", { email, callbackURL: verifyCallbackPath });
}

/** 申请重置密码。无论邮箱是否注册过都返回成功。 */
export function requestPasswordReset(email: string, resetPagePath: string): Promise<AuthResult> {
  return post("/request-password-reset", { email, redirectTo: resetPagePath });
}

export function resetPassword(token: string, newPassword: string): Promise<AuthResult> {
  return post("/reset-password", { token, newPassword });
}
