// 后台登录用的认证接口（/api/auth/*，经后台站点的转发到达服务端）。

export type AuthOutcome =
  | { ok: true; twoFactorRedirect: boolean }
  | {
      ok: false;
      status: number;
      code: string | null;
      message: string | null;
      retryAfterSeconds: number | null;
    };

async function post(path: string, body: Record<string, unknown>): Promise<AuthOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: null, retryAfterSeconds: null };
  }
  const parsed = (await response.json().catch(() => null)) as {
    code?: unknown;
    message?: unknown;
    twoFactorRedirect?: unknown;
  } | null;
  if (response.ok) return { ok: true, twoFactorRedirect: parsed?.twoFactorRedirect === true };
  const retryAfter = Number(response.headers.get("X-Retry-After"));
  return {
    ok: false,
    status: response.status,
    code: typeof parsed?.code === "string" ? parsed.code : null,
    message: typeof parsed?.message === "string" ? parsed.message : null,
    retryAfterSeconds:
      response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  };
}

export const signIn = (email: string, password: string) => post("/sign-in/email", { email, password });
/** 后台从不请求“信任此设备”：这样建立的会话不算经过两步验证，进不了后台。 */
export const verifyTotp = (code: string) => post("/two-factor/verify-totp", { code });
export const verifyBackupCode = (code: string) => post("/two-factor/verify-backup-code", { code });
export const signOut = () => post("/sign-out", {});

export async function enableTwoFactor(
  password: string,
): Promise<{ ok: true; totpURI: string; backupCodes: string[] } | Extract<AuthOutcome, { ok: false }>> {
  const response = await fetch("/api/auth/two-factor/enable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password }),
  }).catch(() => null);
  if (!response) return { ok: false, status: 0, code: "network", message: null, retryAfterSeconds: null };
  const body = (await response.json().catch(() => null)) as {
    totpURI?: unknown;
    backupCodes?: unknown;
    code?: unknown;
    message?: unknown;
  } | null;
  if (response.ok && typeof body?.totpURI === "string" && Array.isArray(body.backupCodes)) {
    return {
      ok: true,
      totpURI: body.totpURI,
      backupCodes: body.backupCodes.filter((code): code is string => typeof code === "string"),
    };
  }
  return {
    ok: false,
    status: response.status,
    code: typeof body?.code === "string" ? body.code : null,
    message: typeof body?.message === "string" ? body.message : null,
    retryAfterSeconds: null,
  };
}

/** 当前浏览器的登录状态（用于区分“没开两步验证”与“本次登录没经过两步验证”）。 */
export async function currentAccount(): Promise<{ email: string; twoFactorEnabled: boolean } | null> {
  const response = await fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`读取登录状态失败（HTTP ${String(response.status)}）`);
  const body = (await response.json()) as { user?: { email?: unknown; twoFactorEnabled?: unknown } } | null;
  if (typeof body?.user?.email !== "string") return null;
  return { email: body.user.email, twoFactorEnabled: body.user.twoFactorEnabled === true };
}
