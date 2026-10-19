import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IntegrationDatabase } from "@mingxi/db/testing";
import type { ProtectedEnv } from "../http/session";
import { dispatchDueEmails } from "../mail/outbox";
import type { MailTransport } from "../mail/transport";
import {
  clearInbox,
  deliverMailTo,
  Device,
  inbox,
  linkIn,
  newEmail,
  PASSWORD,
  PUBLIC_URL,
  registerAndVerify,
  sessionTokenOf,
  setupHarness,
  silent,
  teardownHarness,
} from "../test-harness";
import { totpFromUri } from "../test-totp";

// 认证全流程（docs/02 §4.1、EC-U1）与业务接口鉴权（docs/02 §2.3、§4.4），
// 连真实 PostgreSQL、Redis 与一个本进程内的 SMTP 服务（环境见 test-harness.ts）。

let db: IntegrationDatabase;
let transport: MailTransport;

let counter = 0;
function testRoutes() {
  return new Hono<ProtectedEnv>()
    .get("/whoami", async (c) => {
      const { rows } = await c.var.withUserTx((client) =>
        client.query<{ id: string }>("SELECT app.current_user_id()::text AS id"),
      );
      return c.json({ userId: c.var.user.id, dbUserId: rows[0]?.id });
    })
    .post("/counter", (c) => {
      counter += 1;
      return c.json({ counter }, 201);
    });
}

beforeAll(async () => {
  // 只在测试里挂的业务接口：注册在 createApp 之后，同样经过登录、来源、限流与幂等中间件。
  const h = await setupHarness("mingxi-auth-test", (app) => app.route("/api/test", testRoutes()));
  db = h.db;
  transport = h.transport;
});

afterAll(teardownHarness);

beforeEach(clearInbox);

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
    clearInbox();
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

    clearInbox();
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

  it("伪造 X-Forwarded-For 换不出新的限流计数：按实际连接地址计", async () => {
    const { email } = await registerAndVerify();
    const attacker = new Device();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const result = await attacker.call("/sign-in/email", {
        body: { email, password: `wrong-${String(i)}-xx` },
        headers: {
          "x-forwarded-for": `198.51.100.${String(i + 1)}`,
          "x-mingxi-client-ip": `192.0.2.${String(i + 1)}`,
        },
      });
      statuses.push(result.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    // 会话记录的也是实际连接地址。
    const signedIn = new Device();
    await signedIn.call("/sign-in/email", {
      body: { email, password: PASSWORD },
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const { rows } = await db.appPool.query<{ ip_address: string }>(
      `SELECT s.ip_address FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
        WHERE u.email = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [email],
    );
    expect(rows[0]?.ip_address).toBe(signedIn.ip);
  });
});

describe("业务接口（真实会话）", () => {
  async function signedInDevice() {
    const { email } = await registerAndVerify();
    const device = new Device();
    const signIn = await device.call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(signIn.status).toBe(200);
    const { rows } = await db.appPool.query<{ id: string }>("SELECT id FROM auth.users WHERE email = $1", [
      email,
    ]);
    const userId = rows[0]?.id ?? "";
    return { email, device, userId };
  }

  it("未登录 401；登录后 /api/me 返回本人信息；业务事务以本人身份运行", async () => {
    expect((await new Device().api("/me")).status).toBe(401);
    const { email, device, userId } = await signedInDevice();
    const me = await device.api("/me");
    expect(me.status).toBe(200);
    expect(me.json).toEqual({ id: userId, email, name: "测试用户", emailVerified: true, role: "user" });
    const whoami = await device.api("/test/whoami");
    expect(whoami.json).toEqual({ userId, dbUserId: userId });
  });

  it("账号冻结后立即 403（EC-U4）", async () => {
    const { device, userId } = await signedInDevice();
    await db.appPool.query("UPDATE auth.users SET status = 'frozen' WHERE id = $1", [userId]);
    const response = await device.api("/me");
    expect(response.status).toBe(403);
    expect(response.json).toMatchObject({
      error: { code: "forbidden", details: { reason: "account_frozen" } },
    });
  });

  it("会话超过一天未续期时，访问业务接口顺带续期并写回新 Cookie", async () => {
    const { device } = await signedInDevice();
    const token = sessionTokenOf(device);
    // 模拟这台设备的会话已创建两天：剩余 5 天，超过“每天续期一次”的间隔。
    await db.appPool.query(
      "UPDATE auth.sessions SET expires_at = now() + interval '5 days' WHERE token = $1",
      [token],
    );
    const response = await device.api("/me");
    expect(response.status).toBe(200);
    const renewed = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("mingxi.session_token="));
    expect(renewed).toContain(`Max-Age=${String(7 * 24 * 60 * 60)}`);
    const { rows } = await db.appPool.query<{ days: string }>(
      "SELECT extract(epoch FROM expires_at - now()) / 86400 AS days FROM auth.sessions WHERE token = $1",
      [token],
    );
    expect(Number(rows[0]?.days)).toBeGreaterThan(6.9);
  });

  it("会话过期后 401，并清除浏览器里的会话 Cookie", async () => {
    const { device } = await signedInDevice();
    await db.appPool.query(
      "UPDATE auth.sessions SET expires_at = now() - interval '1 minute' WHERE token = $1",
      [sessionTokenOf(device)],
    );
    const response = await device.api("/me");
    expect(response.status).toBe(401);
    expect(device.cookies.has("mingxi.session_token")).toBe(false);
  });

  it("会话在续期途中被删除：401 并清除 Cookie，而不是服务器错误", async () => {
    const { device } = await signedInDevice();
    const token = sessionTokenOf(device);
    await db.appPool.query(
      "UPDATE auth.sessions SET expires_at = now() + interval '5 days' WHERE token = $1",
      [token],
    );
    // 用触发器让这一行的续期更新落空，等同于“读到会话之后、续期之前，会话被另一个请求删除”。
    const trigger = `skip_renewal_${randomBytes(4).toString("hex")}`;
    await db.ownerPool.query(
      `CREATE FUNCTION auth.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`,
    );
    await db.ownerPool.query(
      `CREATE TRIGGER ${trigger} BEFORE UPDATE ON auth.sessions FOR EACH ROW WHEN (OLD.token = '${token}') EXECUTE FUNCTION auth.${trigger}()`,
    );
    try {
      const response = await device.api("/me");
      expect(response.status).toBe(401);
      expect(device.cookies.has("mingxi.session_token")).toBe(false);
    } finally {
      await db.ownerPool.query(`DROP TRIGGER ${trigger} ON auth.sessions`);
      await db.ownerPool.query(`DROP FUNCTION auth.${trigger}()`);
    }
  });

  it("幂等键（Redis）：重复提交只执行一次；另一个用户用同一个键互不影响", async () => {
    const a = await signedInDevice();
    const b = await signedInDevice();
    const key = { "idempotency-key": `order-${randomBytes(6).toString("hex")}` };
    const first = await a.device.api("/test/counter", { body: {}, headers: key });
    const replay = await a.device.api("/test/counter", { body: {}, headers: key });
    expect(first.status).toBe(201);
    expect(replay.json).toEqual(first.json);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    const fromB = await b.device.api("/test/counter", { body: {}, headers: key });
    expect(fromB.headers.get("idempotent-replayed")).toBeNull();
    expect((fromB.json as { counter: number }).counter).toBe((first.json as { counter: number }).counter + 1);
  });

  it("跨站写请求 403；按用户限流在 Redis 里计数", async () => {
    const { device } = await signedInDevice();
    const forged = await device.api("/test/counter", {
      body: {},
      headers: { origin: "https://evil.example" },
    });
    expect(forged.status).toBe(403);
    const statuses: number[] = [];
    // 跨站请求在来源检查就被拒绝，不占用限流次数：上限 30 次，第 31 次被拒绝。
    for (let i = 0; i < 31; i += 1) statuses.push((await device.api("/me")).status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(30);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("两步验证", () => {
  async function mfaFlag(device: Device): Promise<boolean | undefined> {
    const { rows } = await db.appPool.query<{ mfa_verified: boolean }>(
      "SELECT mfa_verified FROM auth.sessions WHERE token = $1",
      [sessionTokenOf(device)],
    );
    return rows[0]?.mfa_verified;
  }

  async function enableTwoFactor() {
    const { email, device } = await registerAndVerify();
    // 验证邮箱后自动登录的会话没有经过两步验证。
    expect(await mfaFlag(device)).toBe(false);
    const enabled = await device.call("/two-factor/enable", { body: { password: PASSWORD } });
    expect(enabled.status, JSON.stringify(enabled.json)).toBe(200);
    const { totpURI, backupCodes } = enabled.json as { totpURI: string; backupCodes: string[] };
    expect(totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(backupCodes.length).toBeGreaterThanOrEqual(8);
    const confirmed = await device.call("/two-factor/verify-totp", { body: { code: totpFromUri(totpURI) } });
    expect(confirmed.status, JSON.stringify(confirmed.json)).toBe(200);
    return { email, device, totpURI, backupCodes };
  }

  it("开启：用验证码确认后生效，换发的会话标记为经过两步验证，密钥与备用码加密存储，并写审计", async () => {
    const { email, device, totpURI, backupCodes } = await enableTwoFactor();
    expect(await mfaFlag(device)).toBe(true);
    const { rows } = await db.ownerPool.query<{
      two_factor_enabled: boolean;
      secret: string;
      backup_codes: string;
      id: string;
    }>(
      `SELECT u.id, u.two_factor_enabled, t.secret, t.backup_codes
         FROM auth.users u JOIN auth.two_factors t ON t.user_id = u.id WHERE u.email = $1`,
      [email],
    );
    const row = rows[0];
    expect(row?.two_factor_enabled).toBe(true);
    const plainSecret = new URL(totpURI).searchParams.get("secret") ?? "";
    expect(row?.secret).not.toContain(plainSecret);
    for (const code of backupCodes) expect(row?.backup_codes).not.toContain(code);
    const audit = await db.ownerPool.query(
      "SELECT 1 FROM ops.audit_log WHERE actor_user_id = $1 AND action = 'auth.two_factor_enabled'",
      [row?.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it("开启后在新设备登录：密码正确也不给会话，验证 TOTP 后才建立会话", async () => {
    const { email, totpURI } = await enableTwoFactor();
    const laptop = new Device();
    const signIn = await laptop.call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(signIn.status).toBe(200);
    expect(signIn.json).toMatchObject({ twoFactorRedirect: true });
    expect(laptop.cookies.has("mingxi.session_token")).toBe(false);
    expect((await laptop.api("/me")).status).toBe(401);

    const wrong = await laptop.call("/two-factor/verify-totp", { body: { code: "000000" } });
    expect(wrong.status).toBe(401);
    const verified = await laptop.call("/two-factor/verify-totp", { body: { code: totpFromUri(totpURI) } });
    expect(verified.status, JSON.stringify(verified.json)).toBe(200);
    expect((await laptop.api("/me")).status).toBe(200);
    expect(await mfaFlag(laptop)).toBe(true);
  });

  it("备用码可以代替 TOTP，但每个只能用一次", async () => {
    const { email, backupCodes } = await enableTwoFactor();
    const code = backupCodes[0] ?? "";
    const first = new Device();
    await first.call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect((await first.call("/two-factor/verify-backup-code", { body: { code } })).status).toBe(200);
    expect(await mfaFlag(first)).toBe(true);

    const second = new Device();
    await second.call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect((await second.call("/two-factor/verify-backup-code", { body: { code } })).status).toBe(401);
    expect(second.cookies.has("mingxi.session_token")).toBe(false);
  });

  it("“信任此设备”之后再登录不用验证码，但这样的会话不算经过两步验证（后台不接受）", async () => {
    const { email, totpURI } = await enableTwoFactor();
    const phone = new Device();
    await phone.call("/sign-in/email", { body: { email, password: PASSWORD } });
    const trusted = await phone.call("/two-factor/verify-totp", {
      body: { code: totpFromUri(totpURI), trustDevice: true },
    });
    expect(trusted.status).toBe(200);
    expect((await phone.call("/sign-out", { body: {} })).status).toBe(200);

    const again = await phone.call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(again.status).toBe(200);
    expect(again.json).not.toMatchObject({ twoFactorRedirect: true });
    expect((await phone.api("/me")).status).toBe(200);
    expect(await mfaFlag(phone)).toBe(false);
  });

  it("客户端无法自己声明会话经过两步验证", async () => {
    const { email } = await registerAndVerify();
    const device = new Device();
    const signIn = await device.call("/sign-in/email", {
      body: { email, password: PASSWORD, mfaVerified: true },
    });
    expect(signIn.status).toBe(200);
    expect(await mfaFlag(device)).toBe(false);
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
