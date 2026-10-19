import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Redis } from "ioredis";
import { simpleParser } from "mailparser";
import { pino } from "pino";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prepareIntegrationDatabase, type IntegrationDatabase } from "@mingxi/db/testing";
import { createApp } from "../app";
import { dispatchDueEmails } from "../mail/outbox";
import { createSmtpTransport, type MailTransport } from "../mail/transport";
import { createRedisRateLimiter } from "../rate-limit";
import { createAuth } from "./auth";

// 认证全流程（docs/02 §4.1、EC-U1），连真实 PostgreSQL、Redis 与一个本进程内的 SMTP 服务。

const REDIS_URL = process.env.TEST_REDIS_URL;
if (!REDIS_URL) throw new Error("集成测试需要 TEST_REDIS_URL");

const PUBLIC_URL = "http://localhost:8787";
const silent = pino({ level: "silent" });

interface ReceivedMail {
  to: string;
  subject: string;
  text: string;
}

let db: IntegrationDatabase;
let redis: Redis;
let smtp: SMTPServer;
let transport: MailTransport;
let inbox: ReceivedMail[] = [];
let app: ReturnType<typeof createApp>;
let ipCounter = 0;

beforeAll(async () => {
  db = await prepareIntegrationDatabase("mingxi-auth-test");
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
  smtp = new SMTPServer({
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
  transport = createSmtpTransport(`smtp://127.0.0.1:${String(port)}`, "明晰 <no-reply@test.local>");
  const auth = createAuth({
    env: {
      NODE_ENV: "test",
      MINGXI_PUBLIC_URL: PUBLIC_URL,
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      GITHUB_CLIENT_ID: undefined,
      GITHUB_CLIENT_SECRET: undefined,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    },
    pool: db.appPool,
    // 每次运行用独立前缀，避免上一次运行留下的限流计数影响本次。
    rateLimiter: createRedisRateLimiter(redis, `rl:test:${randomBytes(4).toString("hex")}:`),
    logger: silent,
  });
  app = createApp({ logger: silent, version: "it", probes: [], auth });
});

afterAll(async () => {
  redis.disconnect();
  await new Promise<void>((resolve) => {
    smtp.close(() => {
      resolve();
    });
  });
  await db.close();
});

beforeEach(() => {
  inbox = [];
});

/** 每个测试用不同的客户端 IP，限流计数互不影响。 */
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${String(ipCounter)}`;
}

class Device {
  readonly cookies = new Map<string, string>();
  constructor(readonly ip: string = nextIp()) {}

  async call(path: string, init: { method?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { origin: PUBLIC_URL, "x-forwarded-for": this.ip };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    }
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const response = await app.request(path.startsWith("http") ? path : `${PUBLIC_URL}/api/auth${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "manual",
    });
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
function newEmail(): string {
  emailCounter += 1;
  return `user${String(Date.now())}${String(emailCounter)}@example.com`;
}

const PASSWORD = "灯塔-paper-river-42";

/** 投递发件箱里到期的邮件，返回寄给 email 的那一封（其他测试留下的邮件可能一起被投递）。 */
async function deliverMailTo(email: string): Promise<ReceivedMail | undefined> {
  await dispatchDueEmails(db.appPool, transport, silent);
  return inbox.filter((mail) => mail.to === email).at(-1);
}

function linkIn(mail: ReceivedMail | undefined, path: string): string {
  const match = mail?.text.match(new RegExp(`${PUBLIC_URL}/api/auth${path}[^\\s]+`));
  if (!match) throw new Error(`邮件里没有 ${path} 链接：${mail?.text ?? "（没有邮件）"}`);
  return match[0];
}

async function registerAndVerify(email = newEmail(), password = PASSWORD) {
  const device = new Device();
  const signUp = await device.call("/sign-up/email", { body: { email, password, name: "测试用户" } });
  expect(signUp.status, JSON.stringify(signUp.json)).toBe(200);
  const mail = await deliverMailTo(email);
  const verified = await device.call(linkIn(mail, "/verify-email"));
  expect([200, 302]).toContain(verified.status);
  return { email, device };
}

describe("注册与邮箱验证", () => {
  it("注册后收到验证邮件；验证前不能登录；点链接后已验证并自动登录", async () => {
    const email = newEmail();
    const device = new Device();
    const signUp = await device.call("/sign-up/email", {
      body: { email, password: PASSWORD, name: "测试用户", callbackURL: "/mingxi/web" },
    });
    expect(signUp.status, JSON.stringify(signUp.json)).toBe(200);

    const blocked = await new Device().call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(blocked.status).toBe(403);
    expect(blocked.json?.code).toBe("EMAIL_NOT_VERIFIED");

    const mail = await deliverMailTo(email);
    expect(mail?.subject).toBe("验证你的明晰账号邮箱");
    const verified = await device.call(linkIn(mail, "/verify-email"));
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("/mingxi/web");
    expect((await device.session())?.user).toMatchObject({ email, emailVerified: true });

    // 投递后一次性链接从发件箱清除。
    const { rows } = await db.appPool.query<{ status: string; payload: unknown }>(
      "SELECT status, payload FROM ops.email_outbox WHERE to_address = $1",
      [email],
    );
    expect(rows).toEqual([{ status: "sent", payload: {} }]);
  });

  it("同一邮箱（大小写不同）并发注册：只建一个账号，两个请求得到同样的通用结果（EC-U1）", async () => {
    const email = newEmail();
    const results = await Promise.all([
      new Device().call("/sign-up/email", { body: { email, password: PASSWORD, name: "甲" } }),
      new Device().call("/sign-up/email", {
        body: { email: email.toUpperCase(), password: PASSWORD, name: "乙" },
      }),
    ]);
    // 注册接口不透露邮箱是否已注册：后到的那个与正常注册一样返回 200、未验证、不发会话。
    for (const result of results) {
      expect(result.status, JSON.stringify(result.json)).toBe(200);
      expect(result.json).toMatchObject({ token: null, user: { email, emailVerified: false } });
    }
    const { rows } = await db.appPool.query("SELECT 1 FROM auth.users WHERE email = $1", [email]);
    expect(rows).toHaveLength(1);
  });

  it("用已注册的邮箱再注册：接口返回通用结果，提示邮件发给邮箱主人，一小时内只发一封", async () => {
    const { email } = await registerAndVerify();
    inbox = [];
    for (let i = 0; i < 2; i += 1) {
      const again = await new Device().call("/sign-up/email", {
        body: { email, password: "另一个-password-99", name: "冒用者" },
      });
      expect(again.status).toBe(200);
      expect(again.json).toMatchObject({ token: null, user: { emailVerified: false } });
    }
    await dispatchDueEmails(db.appPool, transport, silent);
    const notices = inbox.filter((mail) => mail.to === email);
    expect(notices.map((mail) => mail.subject)).toEqual(["有人用你的邮箱注册明晰"]);
    expect(notices[0]?.text).toContain(`${PUBLIC_URL}/login`);
    // 原密码照常可用，冒用者的密码无效。
    expect((await new Device().call("/sign-in/email", { body: { email, password: PASSWORD } })).status).toBe(
      200,
    );
    expect(
      (await new Device().call("/sign-in/email", { body: { email, password: "另一个-password-99" } })).status,
    ).toBe(401);
  });

  it("常见弱密码、过短密码被拒绝并说明原因", async () => {
    const weak = await new Device().call("/sign-up/email", {
      body: { email: newEmail(), password: "woaini1314", name: "测试用户" },
    });
    expect(weak.status).toBe(400);
    expect(weak.json).toMatchObject({ code: "WEAK_PASSWORD", message: "这个密码太常见了，换一个更难猜的" });
    const short = await new Device().call("/sign-up/email", {
      body: { email: newEmail(), password: "abc", name: "测试用户" },
    });
    expect(short.status).toBe(400);
  });
});

describe("找回密码与会话", () => {
  it("重置密码后旧密码失效、所有设备的会话失效，新密码可以登录", async () => {
    const { email, device: original } = await registerAndVerify();
    expect((await original.session())?.user?.email).toBe(email);

    inbox = [];
    const request = await new Device().call("/request-password-reset", {
      body: { email, redirectTo: `${PUBLIC_URL}/reset-password` },
    });
    expect(request.status).toBe(200);
    const mail = await deliverMailTo(email);
    expect(mail?.subject).toBe("重置明晰账号密码");
    const opened = await new Device().call(linkIn(mail, "/reset-password/"));
    expect(opened.status).toBe(302);
    const token = new URL(opened.headers.get("location") ?? "", PUBLIC_URL).searchParams.get("token");
    expect(token).toBeTruthy();

    const newPassword = "海边-lantern-sky-97";
    const reset = await new Device().call("/reset-password", { body: { newPassword, token } });
    expect(reset.status, JSON.stringify(reset.json)).toBe(200);

    expect(await original.session()).toBeNull();
    const oldLogin = await new Device().call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(oldLogin.status).toBe(401);
    const newLogin = await new Device().call("/sign-in/email", { body: { email, password: newPassword } });
    expect(newLogin.status).toBe(200);

    const { rows } = await db.ownerPool.query<{ action: string }>(
      `SELECT a.action FROM ops.audit_log a JOIN auth.users u ON u.id = a.actor_user_id
        WHERE u.email = $1 ORDER BY a.at`,
      [email],
    );
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(["auth.sign_up", "auth.sign_in", "auth.password_reset"]),
    );
  });

  it("设备列表与退出所有设备", async () => {
    const { email } = await registerAndVerify();
    const laptop = new Device();
    const phone = new Device();
    for (const device of [laptop, phone]) {
      const signIn = await device.call("/sign-in/email", { body: { email, password: PASSWORD } });
      expect(signIn.status).toBe(200);
    }
    const listed = await laptop.call("/list-sessions");
    expect(Array.isArray(listed.json) && listed.json.length).toBeGreaterThanOrEqual(2);

    const revoked = await laptop.call("/revoke-sessions", { body: {} });
    expect(revoked.status).toBe(200);
    expect(await phone.session()).toBeNull();
    expect(await laptop.session()).toBeNull();
  });

  it("同一 IP 连续登录失败第 6 次被限流", async () => {
    const { email } = await registerAndVerify();
    const attacker = new Device();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const result = await attacker.call("/sign-in/email", {
        body: { email, password: `wrong-${String(i)}-xx` },
      });
      statuses.push(result.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
    // 换一个 IP 不受影响。
    const legit = await new Device().call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(legit.status).toBe(200);
  });
});

describe("发件箱", () => {
  it("投递失败按退避重试，超过次数标记失败并清除链接", async () => {
    const email = newEmail();
    await new Device().call("/sign-up/email", { body: { email, password: PASSWORD, name: "测试用户" } });
    const broken: MailTransport = { kind: "smtp", send: () => Promise.reject(new Error("SMTP 拒绝连接")) };
    const first = await dispatchDueEmails(db.appPool, broken, silent);
    expect(first.failed).toBeGreaterThanOrEqual(1);
    const afterFirst = await db.appPool.query<{ status: string; attempts: number; last_error: string }>(
      "SELECT status, attempts, last_error FROM ops.email_outbox WHERE to_address = $1",
      [email],
    );
    expect(afterFirst.rows[0]).toMatchObject({ status: "pending", attempts: 1, last_error: "SMTP 拒绝连接" });

    // 把下次尝试时间拨到现在，模拟退避时间已过，直到超过最大次数。
    for (let i = 0; i < 4; i += 1) {
      await db.appPool.query("UPDATE ops.email_outbox SET next_attempt_at = now() WHERE to_address = $1", [
        email,
      ]);
      await dispatchDueEmails(db.appPool, broken, silent);
    }
    const final = await db.appPool.query<{ status: string; attempts: number; payload: unknown }>(
      "SELECT status, attempts, payload FROM ops.email_outbox WHERE to_address = $1",
      [email],
    );
    expect(final.rows[0]).toEqual({ status: "failed", attempts: 5, payload: {} });
  });
});
