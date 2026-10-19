import type { OutboxEntry, StaffRole, UserRole } from "@mingxi/contracts";

const DATE_TIME = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 后台时间一律按北京时间显示（docs/02 §3：存 UTC，按 Asia/Shanghai 展示）。 */
export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return DATE_TIME.format(new Date(iso)).replace(/\//g, "-");
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: "普通用户",
  admin: "管理员",
  support: "客服",
  analyst: "分析",
};

export const STAFF_ROLES: StaffRole[] = ["admin", "support", "analyst"];

export const TEMPLATE_LABELS: Record<OutboxEntry["template"], string> = {
  verify_email: "邮箱验证",
  reset_password: "重置密码",
  existing_account: "已注册提示",
};

export const OUTBOX_STATUS_LABELS: Record<OutboxEntry["status"], string> = {
  pending: "待发送",
  sending: "发送中",
  sent: "已发送",
  failed: "失败",
};

/** 审计操作的中文名；没登记的显示原始标识。 */
const ACTION_LABELS: Record<string, string> = {
  "auth.sign_up": "注册",
  "auth.sign_in": "登录",
  "auth.password_reset": "重置密码",
  "auth.two_factor_enabled": "开启两步验证",
  "auth.two_factor_disabled": "关闭两步验证",
  "admin.user_frozen": "冻结账号",
  "admin.user_unfrozen": "解冻账号",
  "admin.sessions_revoked": "退出所有设备",
  "admin.verification_resent": "重发验证邮件",
  "admin.password_reset_sent": "发送重置密码邮件",
  "staff.role_changed": "修改工作人员角色",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const BROWSERS: [marker: string, name: string][] = [
  ["Edg/", "Edge"],
  ["Chrome/", "Chrome"],
  ["Firefox/", "Firefox"],
  ["Safari/", "Safari"],
];
const SYSTEMS: [markers: string[], name: string][] = [
  [["iPhone", "iPad"], "iOS"],
  [["Android"], "Android"],
  [["Mac OS X"], "macOS"],
  [["Windows"], "Windows"],
  [["Linux"], "Linux"],
];

/** 设备描述：从 User-Agent 里取出浏览器与系统的大致名称（按顺序匹配，Edge 与 Chrome 的标识都含 Chrome/）。 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "未知设备";
  const browser = BROWSERS.find(([marker]) => userAgent.includes(marker))?.[1] ?? "浏览器";
  const os =
    SYSTEMS.find(([markers]) => markers.some((marker) => userAgent.includes(marker)))?.[1] ?? "其他系统";
  return `${browser} · ${os}`;
}
