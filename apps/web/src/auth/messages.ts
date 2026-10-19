import type { AuthFailure } from "./api";

/** 认证模块错误码 → 界面文案。没有列出的错误码显示通用文案并附上错误码，方便用户反馈。 */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不对",
  EMAIL_NOT_VERIFIED: "这个邮箱还没有验证，请先点击验证邮件里的链接。",
  INVALID_EMAIL: "邮箱格式不对",
  PASSWORD_TOO_SHORT: "密码至少 8 位",
  PASSWORD_TOO_LONG: "密码最多 128 位",
  INVALID_TOKEN: "链接无效或已经用过，请重新申请",
  TOKEN_EXPIRED: "链接已过期，请重新申请",
  USER_NOT_FOUND: "链接对应的账号不存在，请重新注册",
  EMAIL_ALREADY_VERIFIED: "这个邮箱已经验证过，可以直接登录",
};

/** 服务端自己给出中文说明的错误码（例如弱密码的具体原因），直接显示服务端的说明。 */
const SERVER_WORDED = new Set(["WEAK_PASSWORD"]);

export function failureMessage(failure: AuthFailure): string {
  switch (failure.kind) {
    case "network":
      return "连不上服务器，请检查网络后重试";
    case "rate_limited":
      return failure.retryAfterSeconds
        ? `尝试次数太多，请 ${formatWait(failure.retryAfterSeconds)}后再试`
        : "尝试次数太多，请稍后再试";
    case "error": {
      if (failure.code && SERVER_WORDED.has(failure.code) && failure.message) return failure.message;
      const known = failure.code ? MESSAGES[failure.code] : undefined;
      if (known) return known;
      return `出了点问题，请稍后再试（${failure.code ?? `HTTP ${String(failure.status)}`}）`;
    }
  }
}

/** 邮件链接打开后，认证模块在跳转地址上附带的 ?error= 错误码。 */
export function linkErrorMessage(code: string): string {
  return MESSAGES[code] ?? `链接无法使用，请重新申请（${code}）`;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${String(seconds)} 秒`;
  return `${String(Math.ceil(seconds / 60))} 分钟`;
}
