import type { AuditEntry, OutboxEntry, UserRole } from "@mingxi/contracts";

// 后台演示版的数据集（docs/05 §12.5）：全部虚构，邮箱一律用保留域名 example.com。
// 内容固定（固定随机种子），时间相对“第一次打开演示版的时刻”生成，看起来总是最近的数据。

/** 数据集标识：CI 检查正式后台的构建产物里找不到它（e2e/src/admin-demo.e2e.ts）。 */
export const DEMO_DATASET_MARKER = "mingxi-admin-demo-dataset-v1";

export interface DemoSession {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  mfaVerified: boolean;
}

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: UserRole;
  status: "active" | "frozen";
  twoFactorEnabled: boolean;
  createdAt: string;
  deletionRequestedAt: string | null;
  planId: string | null;
  sessions: DemoSession[];
}

/** 审计记录只存操作人 ID，读取时再按用户表补上邮箱（与服务端的 LEFT JOIN 一致）。 */
export type DemoAuditEntry = Omit<AuditEntry, "actorEmail">;

export type DemoLogin =
  { stage: "signed_out" } | { stage: "password" } | { stage: "verified"; sessionId: string };

export interface DemoState {
  marker: typeof DEMO_DATASET_MARKER;
  /** 编号计数器：所有编号按时间有序（UUIDv7 格式），审计与发件箱的游标分页因此与服务端一致。 */
  seq: number;
  users: DemoUser[];
  audit: DemoAuditEntry[];
  outbox: OutboxEntry[];
  /** 演示版里登录的始终是这位管理员。 */
  operatorId: string;
  login: DemoLogin;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SESSION_DAYS = 7;

/** UUIDv7 格式的编号：前 48 位是毫秒时间，后面是计数器，按字符串比较即按时间先后。 */
export function nextId(state: { seq: number }, at: number): string {
  state.seq += 1;
  const time = Math.floor(at).toString(16).padStart(12, "0");
  const counter = state.seq.toString(16).padStart(18, "0");
  return `${time.slice(0, 8)}-${time.slice(8)}-7${counter.slice(0, 3)}-8${counter.slice(3, 6)}-${counter.slice(6)}`;
}

/** 固定种子的伪随机数（mulberry32），保证每次生成的数据集相同。 */
function random(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
];

const PEOPLE: [name: string, local: string][] = [
  ["林溪", "linxi"],
  ["周明远", "zhou.mingyuan"],
  ["陈一帆", "chen.yifan"],
  ["王若曦", "wang.ruoxi"],
  ["李乔", "li.qiao"],
  ["赵小满", "zhao.xiaoman"],
  ["孙知远", "sun.zhiyuan"],
  ["吴桐", "wu.tong"],
  ["郑可", "zheng.ke"],
  ["冯渐", "feng.jian"],
  ["许诺", "xu.nuo"],
  ["何夕", "he.xi"],
  ["宋安", "song.an"],
  ["唐棠", "tang.tang"],
  ["韩松", "han.song"],
  ["曹语", "cao.yu"],
  ["邓清", "deng.qing"],
  ["萧然", "xiao.ran"],
  ["程远", "cheng.yuan"],
  ["沈默", "shen.mo"],
  ["罗意", "luo.yi"],
  ["叶舟", "ye.zhou"],
  ["苏晚", "su.wan"],
  ["蒋辰", "jiang.chen"],
  ["方圆", "fang.yuan"],
  ["江白", "jiang.bai"],
  ["顾言", "gu.yan"],
  ["陆遥", "lu.yao"],
  ["白露", "bai.lu"],
  ["谢宁", "xie.ning"],
  ["秦川", "qin.chuan"],
  ["夏至", "xia.zhi"],
];

/** 按时间先后生成的事件，最后统一分配编号（编号的先后必须与时间一致）。 */
type Pending =
  | { kind: "audit"; at: number; entry: Omit<DemoAuditEntry, "id" | "at"> }
  | { kind: "outbox"; at: number; entry: Omit<OutboxEntry, "id" | "createdAt"> };

export function createDemoDataset(now: Date): DemoState {
  const t = now.getTime();
  const rand = random(20261019);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
  const iso = (ms: number) => new Date(ms).toISOString();
  const state: DemoState = {
    marker: DEMO_DATASET_MARKER,
    seq: 0,
    users: [],
    audit: [],
    outbox: [],
    operatorId: "",
    login: { stage: "signed_out" },
  };
  const pending: Pending[] = [];
  const audit = (at: number, entry: Omit<DemoAuditEntry, "id" | "at">) => {
    pending.push({ kind: "audit", at, entry });
  };
  const mail = (at: number, entry: Omit<OutboxEntry, "id" | "createdAt">) => {
    pending.push({ kind: "outbox", at, entry });
  };

  function addUser(input: {
    name: string;
    email: string;
    createdAt: number;
    role?: UserRole;
    emailVerified?: boolean;
    twoFactorEnabled?: boolean;
    sessions?: number;
  }): DemoUser {
    const user: DemoUser = {
      id: nextId(state, input.createdAt),
      email: input.email,
      name: input.name,
      emailVerified: input.emailVerified ?? true,
      role: input.role ?? "user",
      status: "active",
      twoFactorEnabled: input.twoFactorEnabled ?? false,
      createdAt: iso(input.createdAt),
      deletionRequestedAt: null,
      planId: null,
      sessions: [],
    };
    state.users.push(user);
    audit(input.createdAt, {
      actorUserId: user.id,
      action: "auth.sign_up",
      targetType: null,
      targetId: null,
      metadata: {},
    });
    mail(input.createdAt + 1000, {
      toAddress: user.email,
      template: "verify_email",
      status: "sent",
      attempts: 1,
      lastError: null,
      nextAttemptAt: iso(input.createdAt + 1000),
      sentAt: iso(input.createdAt + 3000),
    });
    const count = user.emailVerified ? (input.sessions ?? Math.floor(rand() * 3)) : 0;
    for (let index = 0; index < count; index += 1) {
      // 登录时间在“注册半小时后”与“现在”之间随机取，只取最近 6 天；每次登录各自取值，不会挤在同一时刻。
      const earliest = Math.max(input.createdAt + 30 * MINUTE, t - 6 * DAY);
      const signedInAt = earliest + Math.floor(rand() * Math.max(0, t - 10 * MINUTE - earliest));
      const lastActiveAt = Math.min(t - 5 * MINUTE, signedInAt + Math.floor(rand() * 20 * HOUR));
      user.sessions.push({
        id: nextId(state, signedInAt),
        userAgent: pick(USER_AGENTS),
        createdAt: iso(signedInAt),
        lastActiveAt: iso(lastActiveAt),
        expiresAt: iso(lastActiveAt + SESSION_DAYS * DAY),
        mfaVerified: user.twoFactorEnabled,
      });
      audit(signedInAt, {
        actorUserId: user.id,
        action: "auth.sign_in",
        targetType: null,
        targetId: null,
        metadata: {},
      });
    }
    return user;
  }

  // 工作人员：第一个管理员由部署环境里的命令产生（审计里操作人为空、via 为 cli），其余由管理员在后台授予。
  const operator = addUser({
    name: "演示管理员",
    email: "demo-admin@example.com",
    createdAt: t - 90 * DAY,
    twoFactorEnabled: true,
    sessions: 1,
  });
  operator.role = "admin";
  state.operatorId = operator.id;
  audit(t - 90 * DAY + 10 * MINUTE, {
    actorUserId: null,
    action: "staff.role_changed",
    targetType: "user",
    targetId: operator.id,
    metadata: { from: "user", to: "admin", via: "cli", reason: "初始化第一个管理员" },
  });
  audit(t - 90 * DAY + 20 * MINUTE, {
    actorUserId: operator.id,
    action: "auth.two_factor_enabled",
    targetType: null,
    targetId: null,
    metadata: {},
  });

  const staff: [name: string, email: string, role: UserRole, twoFactor: boolean, daysAgo: number][] = [
    ["客服小周", "zhou.support@example.com", "support", true, 80],
    ["分析小吴", "wu.analyst@example.com", "analyst", true, 60],
    ["客服小林", "lin.support@example.com", "support", false, 2],
  ];
  for (const [name, email, role, twoFactor, daysAgo] of staff) {
    const member = addUser({
      name,
      email,
      createdAt: t - daysAgo * DAY - 3 * HOUR,
      twoFactorEnabled: twoFactor,
      sessions: twoFactor ? 1 : 0,
    });
    member.role = role;
    audit(t - daysAgo * DAY, {
      actorUserId: operator.id,
      action: "staff.role_changed",
      targetType: "user",
      targetId: member.id,
      metadata: { from: "user", to: role, via: "admin", reason: "新同事入职", requestId: nextId(state, t) },
    });
    if (twoFactor) {
      audit(t - daysAgo * DAY + 30 * MINUTE, {
        actorUserId: member.id,
        action: "auth.two_factor_enabled",
        targetType: null,
        targetId: null,
        metadata: {},
      });
    }
  }

  // 普通用户：注册时间分布在最近 60 天里，越近越多。
  const users = PEOPLE.map(([name, local], index) => {
    const createdAt = t - Math.floor(60 * DAY * ((PEOPLE.length - index) / PEOPLE.length) ** 1.6) - HOUR;
    const unverified = index % 11 === 7;
    // 第 9 位会被冻结、第 16 位申请了删除：不给它们生成登录，审计里就不会出现冻结之后的登录。
    const quiet = index === 9 || index === 16;
    return addUser({
      name,
      email: `${local}@example.com`,
      createdAt,
      emailVerified: !unverified,
      ...(quiet ? { sessions: 0 } : {}),
    });
  });

  const byIndex = (index: number): DemoUser => {
    const user = users[index];
    if (!user) throw new Error(`演示数据集没有第 ${String(index)} 个用户`);
    return user;
  };
  const adminAction = (at: number, action: string, target: DemoUser, metadata: Record<string, unknown>) => {
    audit(at, {
      actorUserId: operator.id,
      action,
      targetType: "user",
      targetId: target.id,
      metadata: { ...metadata, requestId: nextId(state, t) },
    });
  };

  // 冻结中的账号（会话已全部撤销）。
  const frozen = byIndex(9);
  adminAction(t - 3 * DAY, "admin.user_frozen", frozen, {
    reason: "短时间内大量注册小号，先冻结核实",
    revokedSessions: frozen.sessions.length,
  });
  frozen.status = "frozen";
  frozen.sessions = [];

  // 用户本人申请删除账号，冷静期内（账号随申请冻结，后台不能解冻）。
  const leaving = byIndex(16);
  leaving.status = "frozen";
  leaving.sessions = [];
  leaving.deletionRequestedAt = iso(t - 5 * DAY);

  // 客服处理过的几件事。
  const lostPhone = byIndex(3);
  adminAction(t - 6 * DAY, "admin.sessions_revoked", lostPhone, {
    reason: "用户来信说手机丢失，要求退出所有设备",
    revokedSessions: 2,
  });
  const forgot = byIndex(12);
  adminAction(t - 4 * DAY, "admin.password_reset_sent", forgot, {
    reason: "用户忘记密码，按工单 #1024 处理",
  });
  mail(t - 4 * DAY + 1000, {
    toAddress: forgot.email,
    template: "reset_password",
    status: "sent",
    attempts: 1,
    lastError: null,
    nextAttemptAt: iso(t - 4 * DAY + 1000),
    sentAt: iso(t - 4 * DAY + 4000),
  });
  audit(t - 4 * DAY + 20 * MINUTE, {
    actorUserId: forgot.id,
    action: "auth.password_reset",
    targetType: null,
    targetId: null,
    metadata: {},
  });

  // 投递失败与等待重试的邮件（第 18 位从注册起就没有验证邮箱）。
  const bounced = byIndex(18);
  const resendAt = t - DAY;
  adminAction(resendAt, "admin.verification_resent", bounced, { reason: "用户说没收到验证邮件" });
  mail(resendAt + 1000, {
    toAddress: bounced.email,
    template: "verify_email",
    status: "failed",
    attempts: 5,
    lastError: "收件服务器拒收：邮箱不存在",
    nextAttemptAt: iso(resendAt + 2 * HOUR),
    sentAt: null,
  });
  const waiting = byIndex(27);
  mail(t - 20 * MINUTE, {
    toAddress: waiting.email,
    template: "reset_password",
    status: "pending",
    attempts: 2,
    lastError: "SMTP 连接超时",
    nextAttemptAt: iso(t + 10 * MINUTE),
    sentAt: null,
  });
  mail(t - 2 * DAY, {
    toAddress: byIndex(1).email,
    template: "existing_account",
    status: "sent",
    attempts: 1,
    lastError: null,
    nextAttemptAt: iso(t - 2 * DAY),
    sentAt: iso(t - 2 * DAY + 2000),
  });

  // 管理员在另一台设备上的登录（演示“撤销全部工作人员会话”时会被撤销）。
  operator.sessions.push({
    id: nextId(state, t - 2 * DAY),
    userAgent: USER_AGENTS[2] ?? null,
    createdAt: iso(t - 2 * DAY),
    lastActiveAt: iso(t - 2 * DAY + 3 * HOUR),
    expiresAt: iso(t - 2 * DAY + 3 * HOUR + SESSION_DAYS * DAY),
    mfaVerified: true,
  });

  pending.sort((a, b) => a.at - b.at);
  for (const item of pending) {
    const id = nextId(state, item.at);
    if (item.kind === "audit") state.audit.push({ id, at: iso(item.at), ...item.entry });
    else state.outbox.push({ id, createdAt: iso(item.at), ...item.entry });
  }
  return state;
}
