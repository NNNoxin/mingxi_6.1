/** 登录后的默认去处：工作台（与演示站同一路径；正式站的工作台在 P4 接入真实数据源后上线）。 */
export const WORKBENCH_PATH = "/mingxi/web";
export const LOGIN_PATH = "/login";
/** 验证邮件里的链接验证完成后回到这里（认证模块会附上 ?error=… 表示失败）。 */
export const VERIFY_EMAIL_PATH = "/verify-email";
/** 找回密码邮件里的链接打开后回到这里（附 ?token=… 或 ?error=…）。 */
export const RESET_PASSWORD_PATH = "/reset-password";

/**
 * 登录后跳转的目标。只接受本站的相对路径，防止被人构造 ?next=https://evil.example 把用户带走（开放重定向）。
 */
export function safeNextPath(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return WORKBENCH_PATH;
  return next;
}
