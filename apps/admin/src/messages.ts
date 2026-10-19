import type { AdminDenialReason } from "@mingxi/contracts";
import type { AuthOutcome } from "./auth-client";

const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不对",
  EMAIL_NOT_VERIFIED: "这个邮箱还没有验证，请先在正式站完成验证",
  INVALID_CODE: "验证码不对，请输入验证器 App 里当前的 6 位数字",
  INVALID_BACKUP_CODE: "备用码不对，或已经用过",
  INVALID_PASSWORD: "密码不对",
  TOTP_ALREADY_ENABLED: "已经开启过两步验证",
  INVALID_TWO_FACTOR_COOKIE: "验证已超时，请重新输入邮箱和密码",
  ACCOUNT_TEMPORARILY_LOCKED: "验证失败次数太多，账号已临时锁定，请稍后再试",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "尝试次数太多，请重新登录",
};

export function authFailureMessage(outcome: Extract<AuthOutcome, { ok: false }>): string {
  if (outcome.code === "network") return "连不上服务器，请检查网络后重试";
  if (outcome.status === 429) {
    return outcome.retryAfterSeconds
      ? `尝试次数太多，请 ${String(outcome.retryAfterSeconds)} 秒后再试`
      : "尝试次数太多，请稍后再试";
  }
  const known = outcome.code ? AUTH_MESSAGES[outcome.code] : undefined;
  return known ?? `登录失败（${outcome.code ?? `HTTP ${String(outcome.status)}`}）`;
}

/** 后台接口拒绝访问时的说明。 */
export const DENIAL_MESSAGES: Record<AdminDenialReason, string> = {
  not_staff: "这个账号不是工作人员，不能使用运营后台",
  mfa_required: "工作人员必须开启两步验证，并用验证码登录",
  session_too_old: "后台登录已超过 12 小时，请重新登录",
  reauth_required: "这是敏感操作，需要在 10 分钟内重新登录确认身份",
  permission_denied: "当前角色没有这个操作的权限",
};
