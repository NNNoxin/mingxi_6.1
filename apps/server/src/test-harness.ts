import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Redis } from "ioredis";
import { simpleParser } from "mailparser";
import { pino } from "pino";
import { SMTPServer } from "smtp-server";
import { expect } from "vitest";
import { withUserTransaction } from "@mingxi/db";
import { prepareIntegrationDatabase, type IntegrationDatabase } from "@mingxi/db/testing";
import { adminActions } from "./admin/actions";
import { createApp } from "./app";
import { adminAuthActions, authPort, createAuth } from "./auth/auth";
import { createRedisIdempotencyStore } from "./http/idempotency";
import { dispatchDueEmails } from "./mail/outbox";
import { createSmtpTransport, type MailTransport } from "./mail/transport";
import { createRedisRateLimiter } from "./rate-limit";

// 集成测试的共用环境：真实 PostgreSQL、Redis、本进程内的 SMTP 服务，以及与生产相同装配的应用
// （认证、业务接口、运营后台）。每个测试文件在自己的进程里运行，这里的模块级状态只属于一个文件。

export const PUBLIC_URL = "http://localhost:8787";
export const ADMIN_URL = "http://admin.localhost:8788";
export const PASSWORD = "灯塔-paper-river-42";
export const silent = pino({ level: "silent" });

export interface ReceivedMail {
  to: string;
  subject: string;
  text: string;
}

export interface Harness {
  db: IntegrationDatabase;
  redis: Redis;
  transport: MailTransport;
  app: ReturnType<typeof createApp>;
}

/** 收到的邮件。测试之间用 clearInbox() 清空。 */
export const inbox: ReceivedMail[] = [];
export function clearInbox(): void {
  inbox.length = 0;
}

let state: (Harness & { smtp: SMTPServer }) | undefined;

export function harness(): Harness {
  if (!state) throw new Error("先在 beforeAll 里调用 setupHarness()");
  return state;
}

export async function setupHarness(
  applicationName: string,
  configure?: (app: Harness["app"], db: IntegrationDatabase) => void,
): Promise<Harness> {
  const redisUrl = process.env.TEST_REDIS_URL;
  if (!redisUrl) throw new Error("集成测试需要 TEST_REDIS_URL");
  const db = await prepareIntegrationDatabase(applicationName);
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((mail) => {
          const to = Array.isArray(mail.to) ? mail.to[0]?.text : mail.to?.text;
          inbox.push({ to: to ?? "", subject: mail.subject ?? "", text: mail.text ?? "" });
          callback();
        })
        .catch((error: unknown) => {
          callback(error instanceof Error ? error : new Error(String(error)));
        });
    },
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const { port } = smtp.server.address() as AddressInfo;
  const transport = createSmtpTransport(`smtp://127.0.0.1:${String(port)}`, "明晰 <no-reply@test.local>");
  // 每次运行用独立前缀，避免上一次运行留下的限流计数与幂等记录影响本次。
  const runPrefix = randomBytes(4).toString("hex");
  const rateLimiter = createRedisRateLimiter(redis, `rl:test:${runPrefix}:`);
  const secret = randomBytes(32).toString("base64");
  const auth = createAuth({
    env: {
      NODE_ENV: "test",
      MINGXI_PUBLIC_URL: PUBLIC_URL,
      MINGXI_ADMIN_URL: ADMIN_URL,
      BETTER_AUTH_SECRET: secret,
      GITHUB_CLIENT_ID: undefined,
      GITHUB_CLIENT_SECRET: undefined,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    },
    pool: db.appPool,
    rateLimiter,
    logger: silent,
  });
  const authAdapter = authPort(auth);
  const app = createApp({
    logger: silent,
    version: "it",
    probes: [],
    auth: authAdapter,
    publicOrigin: PUBLIC_URL,
    trustedProxyHops: 0,
    rateLimiter,
    idempotencyStore: createRedisIdempotencyStore(redis, `idem:test:${runPrefix}:`),
    withUserTransaction: (userId) => (work) => withUserTransaction(db.appPool, userId, work),
    apiRateLimit: { window: 60, max: 30 },
    admin: {
      origin: ADMIN_URL,
      auth: authAdapter,
      readPool: db.adminPool,
      actions: adminActions(db.appPool, adminAuthActions(auth)),
      rateLimiter,
      trustedProxyHops: 0,
      ipHashSecret: secret,
    },
  });
  configure?.(app, db);
  state = { db, redis, transport, app, smtp };
  return state;
}

export async function teardownHarness(): Promise<void> {
  if (!state) return;
  const { redis, smtp, db } = state;
  redis.disconnect();
  await new Promise<void>((resolve) => {
    smtp.close(() => {
      resolve();
    });
  });
  await db.close();
  state = undefined;
}

let ipCounter = 0;
/** 每台设备用不同的客户端 IP，限流计数互不影响。 */
function nextIp(): string {
  ipCounter += 1;
  return `203.0.${String(Math.floor(ipCounter / 250))}.${String((ipCounter % 250) + 1)}`;
}

export interface CallInit {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * 一台浏览器：保存 Cookie，从固定的地址连到服务（直连地址由 @hono/node-server 的连接信息给出，
 * 测试里通过 app.request 的第三个参数传入同样形状的数据）。origin 是页面所在的站：正式站或运营后台。
 */
export class Device {
  readonly cookies = new Map<string, string>();
  readonly ip: string;
  readonly origin: string;

  constructor(options: { ip?: string; origin?: string } = {}) {
    this.ip = options.ip ?? nextIp();
    this.origin = options.origin ?? PUBLIC_URL;
  }

  /** 调认证接口（/api/auth/*）；以 http 开头的完整地址（邮件里的链接）原样请求。 */
  call(path: string, init: CallInit = {}) {
    return this.request(path.startsWith("http") ? path : `${this.origin}/api/auth${path}`, init);
  }

  /** 调业务接口（/api/*）。 */
  api(path: string, init: CallInit = {}) {
    return this.request(`${this.origin}/api${path}`, init);
  }

  /** 调运营后台接口（/api/admin/*）。 */
  admin(path: string, init: CallInit = {}) {
    return this.request(`${this.origin}/api/admin${path}`, init);
  }

  private async request(url: string, init: CallInit) {
    const headers: Record<string, string> = { origin: this.origin, ...init.headers };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    }
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const response = await harness().app.request(
      url,
      {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "manual",
      },
      { incoming: { socket: { remoteAddress: this.ip } } },
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair?.indexOf("=") ?? -1;
      if (!pair || index < 0) continue;
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return {
      status: response.status,
      json: json as Record<string, unknown> | null,
      headers: response.headers,
    };
  }

  async session() {
    const { json } = await this.call("/get-session");
    return json as { user?: { email: string; emailVerified: boolean } } | null;
  }
}

let emailCounter = 0;
export function newEmail(): string {
  emailCounter += 1;
  return `user${String(Date.now())}${String(emailCounter)}@example.com`;
}

/** 投递发件箱里到期的邮件，返回寄给 email 的那一封（其他测试留下的邮件可能一起被投递）。 */
export async function deliverMailTo(email: string): Promise<ReceivedMail | undefined> {
  const { db, transport } = harness();
  await dispatchDueEmails(db.appPool, transport, silent);
  return inbox.filter((mail) => mail.to === email).at(-1);
}

export function linkIn(mail: ReceivedMail | undefined, path: string): string {
  const match = mail?.text.match(new RegExp(`${PUBLIC_URL}/api/auth${path}[^\\s]+`));
  if (!match) throw new Error(`邮件里没有 ${path} 链接：${mail?.text ?? "（没有邮件）"}`);
  return match[0];
}

/** 注册并点击验证邮件里的链接（验证后自动登录在这台设备上）。 */
export async function registerAndVerify(email = newEmail(), password = PASSWORD) {
  const device = new Device();
  const signUp = await device.call("/sign-up/email", { body: { email, password, name: "测试用户" } });
  expect(signUp.status, JSON.stringify(signUp.json)).toBe(200);
  const mail = await deliverMailTo(email);
  const verified = await device.call(linkIn(mail, "/verify-email"));
  expect([200, 302]).toContain(verified.status);
  return { email, device };
}

/** Cookie 里是“令牌.签名”，取出令牌用于直接定位这台设备的会话行。 */
export function sessionTokenOf(device: Device): string {
  const cookie = decodeURIComponent(device.cookies.get("mingxi.session_token") ?? "");
  const token = cookie.slice(0, cookie.lastIndexOf("."));
  if (!token) throw new Error("这台设备没有会话 Cookie");
  return token;
}
