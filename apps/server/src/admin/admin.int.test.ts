import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AdminUserDetail,
  AdminUserList,
  AuditPage,
  OutboxPage,
  StaffMe,
  StaffSessionsRevoked,
  type StaffRole,
} from "@mingxi/contracts";
import type { IntegrationDatabase } from "@mingxi/db/testing";
import {
  ADMIN_URL,
  clearInbox,
  deliverMailTo,
  Device,
  newEmail,
  PASSWORD,
  PUBLIC_URL,
  registerAndVerify,
  setupHarness,
  teardownHarness,
} from "../test-harness";
import { totpFromUri } from "../test-totp";

// 运营后台接口（docs/05 §4–§6、EC-A1–A3、A6、A9），连真实 PostgreSQL、Redis 与本进程 SMTP。
// 工作人员从后台来源（ADMIN_URL）登录并调用；数据读取走后台只读账号，写操作与审计同一事务。

let db: IntegrationDatabase;

beforeAll(async () => {
  db = (await setupHarness("mingxi-admin-test")).db;
});

afterAll(teardownHarness);

beforeEach(clearInbox);

async function userIdOf(email: string): Promise<string> {
  const { rows } = await db.ownerPool.query<{ id: string }>("SELECT id FROM auth.users WHERE email = $1", [
    email,
  ]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`没有账号 ${email}`);
  return id;
}

/** 一位工作人员：注册、（默认）开启两步验证、授予角色，再从后台来源用密码 + 验证码登录。 */
async function staff(role: StaffRole, options: { twoFactor?: boolean } = {}) {
  const { email, device } = await registerAndVerify();
  let totpURI: string | undefined;
  if (options.twoFactor !== false) {
    const enabled = await device.call("/two-factor/enable", { body: { password: PASSWORD } });
    totpURI = (enabled.json as { totpURI: string }).totpURI;
    expect(
      (await device.call("/two-factor/verify-totp", { body: { code: totpFromUri(totpURI) } })).status,
    ).toBe(200);
  }
  await db.ownerPool.query("UPDATE auth.users SET role = $2 WHERE email = $1", [email, role]);
  const admin = new Device({ origin: ADMIN_URL });
  const signIn = await admin.call("/sign-in/email", { body: { email, password: PASSWORD } });
  expect(signIn.status, JSON.stringify(signIn.json)).toBe(200);
  if (totpURI) {
    const verified = await admin.call("/two-factor/verify-totp", { body: { code: totpFromUri(totpURI) } });
    expect(verified.status, JSON.stringify(verified.json)).toBe(200);
  }
  return { email, admin, totpURI, userId: await userIdOf(email) };
}

async function auditRows(targetId: string, action: string) {
  const { rows } = await db.ownerPool.query<{
    actor_user_id: string;
    metadata: Record<string, unknown>;
    ip_hash: string | null;
  }>("SELECT actor_user_id, metadata, ip_hash FROM ops.audit_log WHERE target_id = $1 AND action = $2", [
    targetId,
    action,
  ]);
  return rows;
}

function reason(response: { json: Record<string, unknown> | null }) {
  return (response.json?.error as { details?: { reason?: string } } | undefined)?.details?.reason;
}

describe("工作人员检查", () => {
  it("未登录 401；普通用户 403 not_staff；未开启两步验证的工作人员 403 mfa_required", async () => {
    expect((await new Device({ origin: ADMIN_URL }).admin("/me")).status).toBe(401);

    const { email } = await registerAndVerify();
    const plain = new Device({ origin: ADMIN_URL });
    await plain.call("/sign-in/email", { body: { email, password: PASSWORD } });
    const notStaff = await plain.admin("/me");
    expect(notStaff.status).toBe(403);
    expect(reason(notStaff)).toBe("not_staff");

    const { admin } = await staff("support", { twoFactor: false });
    const noMfa = await admin.admin("/me");
    expect(noMfa.status).toBe(403);
    expect(reason(noMfa)).toBe("mfa_required");
  });

  it("开启了两步验证，但本次登录用“信任此设备”跳过了验证：不能进后台（EC-A1）", async () => {
    const { email, device } = await registerAndVerify();
    const enabled = await device.call("/two-factor/enable", { body: { password: PASSWORD } });
    const { totpURI } = enabled.json as { totpURI: string };
    await device.call("/two-factor/verify-totp", { body: { code: totpFromUri(totpURI) } });
    await db.ownerPool.query("UPDATE auth.users SET role = 'admin' WHERE email = $1", [email]);

    const laptop = new Device({ origin: ADMIN_URL });
    await laptop.call("/sign-in/email", { body: { email, password: PASSWORD } });
    await laptop.call("/two-factor/verify-totp", { body: { code: totpFromUri(totpURI), trustDevice: true } });
    expect((await laptop.admin("/me")).status).toBe(200);
    await laptop.call("/sign-out", { body: {} });
    // 同一台受信任的设备再次登录：认证模块不再要验证码，但这个会话没有经过两步验证。
    const again = await laptop.call("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(again.json).not.toMatchObject({ twoFactorRedirect: true });
    const denied = await laptop.admin("/me");
    expect(denied.status).toBe(403);
    expect(reason(denied)).toBe("mfa_required");
  });

  it("管理员：/me 返回角色与权限", async () => {
    const { admin, email } = await staff("admin");
    const me = await admin.admin("/me");
    expect(me.status).toBe(200);
    const body = StaffMe.parse(me.json);
    expect(body).toMatchObject({ email, role: "admin" });
    expect(body.permissions).toContain("staff.manage");
  });

  it("会话超过 12 小时：要求重新登录；敏感操作要求 10 分钟内登录过", async () => {
    const { admin, userId } = await staff("admin");
    const target = await registerAndVerify();
    const targetId = await userIdOf(target.email);

    await db.ownerPool.query(
      "UPDATE auth.sessions SET created_at = now() - interval '20 minutes' WHERE user_id = $1",
      [userId],
    );
    expect((await admin.admin("/users")).status).toBe(200);
    const stale = await admin.admin(`/users/${targetId}/freeze`, { body: { reason: "测试重新验证" } });
    expect(stale.status).toBe(403);
    expect(reason(stale)).toBe("reauth_required");

    await db.ownerPool.query(
      "UPDATE auth.sessions SET created_at = now() - interval '13 hours' WHERE user_id = $1",
      [userId],
    );
    const old = await admin.admin("/me");
    expect(old.status).toBe(401);
    expect(reason(old)).toBe("session_too_old");
  });

  it("后台写接口只接受后台来源；未知后台路径返回 404，不落进普通业务接口", async () => {
    const { admin } = await staff("admin");
    const target = await registerAndVerify();
    const forged = await admin.admin(`/users/${await userIdOf(target.email)}/revoke-sessions`, {
      body: { reason: "跨来源" },
      headers: { origin: PUBLIC_URL },
    });
    expect(forged.status).toBe(403);
    // 用写请求：如果落进普通业务接口，会因为“来源不是正式站”被拒绝为 403，而不是这里的 404。
    const unknown = await admin.admin("/no-such-thing", { body: {} });
    expect(unknown.status).toBe(404);
  });
});

describe("用户管理", () => {
  it("查找与详情：只有元数据，没有会话令牌", async () => {
    const { admin } = await staff("support");
    const target = await registerAndVerify();
    const list = AdminUserList.parse(
      (await admin.admin(`/users?q=${encodeURIComponent(target.email)}`)).json,
    );
    expect(list.users.map((user) => user.email)).toEqual([target.email]);
    const detailResponse = await admin.admin(`/users/${list.users[0]?.id ?? ""}`);
    const detail = AdminUserDetail.parse(detailResponse.json);
    expect(detail.user).toMatchObject({ email: target.email, emailVerified: true, status: "active" });
    expect(detail.sessions.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(detailResponse.json)).not.toMatch(/token/i);
  });

  it("冻结：立即退出该用户全部设备，写审计（操作人、原因、请求 ID、地址哈希）；解冻后恢复（EC-A9）", async () => {
    const { admin, userId: actorId } = await staff("admin");
    const target = await registerAndVerify();
    const targetId = await userIdOf(target.email);
    expect((await target.device.api("/me")).status).toBe(200);

    expect((await admin.admin(`/users/${targetId}/freeze`, { body: { reason: "疑似盗号" } })).status).toBe(
      200,
    );
    expect((await target.device.api("/me")).status).toBe(401);
    const frozen = await auditRows(targetId, "admin.user_frozen");
    expect(frozen).toHaveLength(1);
    expect(frozen[0]).toMatchObject({
      actor_user_id: actorId,
      metadata: { reason: "疑似盗号", revokedSessions: 1 },
    });
    expect(frozen[0]?.metadata.requestId).toEqual(expect.any(String));
    expect(frozen[0]?.ip_hash).toMatch(/^[0-9a-f]{32}$/);

    const again = await admin.admin(`/users/${targetId}/freeze`, { body: { reason: "重复冻结" } });
    expect(again.status).toBe(409);
    expect(
      (await admin.admin(`/users/${targetId}/unfreeze`, { body: { reason: "已核实本人" } })).status,
    ).toBe(200);
    expect(await auditRows(targetId, "admin.user_unfrozen")).toHaveLength(1);
    const signIn = await new Device().call("/sign-in/email", {
      body: { email: target.email, password: PASSWORD },
    });
    expect(signIn.status).toBe(200);
  });

  it("工作人员账号不能直接冻结；没有填写原因的操作被拒绝", async () => {
    const { admin } = await staff("admin");
    const colleague = await staff("support");
    expect(
      (await admin.admin(`/users/${colleague.userId}/freeze`, { body: { reason: "测试" } })).status,
    ).toBe(409);
    expect((await admin.admin(`/users/${colleague.userId}/revoke-sessions`, { body: {} })).status).toBe(400);
  });

  it("重发验证邮件：只对未验证账号，邮件真的寄出", async () => {
    const { admin } = await staff("support");
    const email = newEmail();
    await new Device().call("/sign-up/email", { body: { email, password: PASSWORD, name: "未验证用户" } });
    await deliverMailTo(email);
    clearInbox();
    const targetId = await userIdOf(email);
    expect(
      (await admin.admin(`/users/${targetId}/resend-verification`, { body: { reason: "用户说没收到" } }))
        .status,
    ).toBe(200);
    expect((await deliverMailTo(email))?.subject).toBe("验证你的明晰账号邮箱");
    expect(await auditRows(targetId, "admin.verification_resent")).toHaveLength(1);

    const verified = await registerAndVerify();
    const conflict = await admin.admin(`/users/${await userIdOf(verified.email)}/resend-verification`, {
      body: { reason: "测试" },
    });
    expect(conflict.status).toBe(409);
  });
});

describe("角色权限", () => {
  it("客服：能查用户、能让用户退出所有设备；不能冻结、不能看审计", async () => {
    const { admin } = await staff("support");
    const target = await registerAndVerify();
    const targetId = await userIdOf(target.email);
    expect((await admin.admin("/users")).status).toBe(200);
    const freeze = await admin.admin(`/users/${targetId}/freeze`, { body: { reason: "越权测试" } });
    expect(freeze.status).toBe(403);
    expect(reason(freeze)).toBe("permission_denied");
    expect(
      (await admin.admin(`/users/${targetId}/revoke-sessions`, { body: { reason: "用户请求" } })).status,
    ).toBe(200);
    expect((await target.device.api("/me")).status).toBe(401);
    expect((await admin.admin("/audit")).status).toBe(403);
  });

  it("分析：不能查看用户", async () => {
    const { admin } = await staff("analyst");
    const users = await admin.admin("/users");
    expect(users.status).toBe(403);
    expect(reason(users)).toBe("permission_denied");
  });
});

describe("审计、发件箱与工作人员", () => {
  it("审计按时间倒序，带操作人邮箱；发件箱列表不含邮件正文", async () => {
    const { admin, email } = await staff("admin");
    const target = await registerAndVerify();
    await admin.admin(`/users/${await userIdOf(target.email)}/revoke-sessions`, {
      body: { reason: "审计测试" },
    });
    const audit = AuditPage.parse((await admin.admin("/audit?action=admin.")).json);
    expect(audit.entries[0]).toMatchObject({ action: "admin.sessions_revoked", actorEmail: email });

    const outboxResponse = await admin.admin("/email-outbox");
    const outbox = OutboxPage.parse(outboxResponse.json);
    expect(outbox.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(outboxResponse.json)).not.toContain("payload");
  });

  it("管理员授予与撤销工作人员角色，写审计；不能撤销最后一个开启两步验证的管理员（EC-A6）", async () => {
    const { admin } = await staff("admin");
    const newcomer = await registerAndVerify();
    const granted = await admin.admin("/staff", {
      body: { email: newcomer.email, role: "support", reason: "新同事入职" },
    });
    expect(granted.status, JSON.stringify(granted.json)).toBe(200);
    const rows = await auditRows(await userIdOf(newcomer.email), "staff.role_changed");
    expect(rows[0]?.metadata).toMatchObject({
      from: "user",
      to: "support",
      via: "admin",
      reason: "新同事入职",
    });
    const list = (await admin.admin("/staff")).json as { staff: { email: string }[] };
    expect(list.staff.map((member) => member.email)).toContain(newcomer.email);

    // 只剩自己一个开启两步验证的管理员时，不能撤销自己。
    await db.ownerPool.query("UPDATE auth.users SET role = 'user' WHERE role = 'admin' AND email <> $1", [
      StaffMe.parse((await admin.admin("/me")).json).email,
    ]);
    const self = StaffMe.parse((await admin.admin("/me")).json);
    const demote = await admin.admin("/staff", { body: { email: self.email, role: "user", reason: "测试" } });
    expect(demote.status).toBe(409);
  });

  it("撤销全部工作人员会话：只保留执行者当前这次登录，普通用户不受影响，写审计（EC-A1）", async () => {
    const { admin, email, totpURI, userId } = await staff("admin");
    // 同一位管理员在另一台设备上的登录（被盗的可能正是这一份）。
    const otherLaptop = new Device({ origin: ADMIN_URL });
    await otherLaptop.call("/sign-in/email", { body: { email, password: PASSWORD } });
    await otherLaptop.call("/two-factor/verify-totp", { body: { code: totpFromUri(totpURI ?? "") } });
    const support = await staff("support");
    const reader = await registerAndVerify();
    expect((await otherLaptop.admin("/me")).status).toBe(200);
    expect((await support.admin.admin("/me")).status).toBe(200);

    const denied = await support.admin.admin("/staff/revoke-sessions", { body: { reason: "客服尝试" } });
    expect(denied.status).toBe(403);
    expect(reason(denied)).toBe("permission_denied");

    const response = await admin.admin("/staff/revoke-sessions", {
      body: { reason: "怀疑有工作人员账号被盗" },
    });
    expect(response.status, JSON.stringify(response.json)).toBe(200);
    const result = StaffSessionsRevoked.parse(response.json);
    expect(result.revokedSessions).toBeGreaterThanOrEqual(2);

    expect((await admin.admin("/me")).status).toBe(200);
    expect((await otherLaptop.admin("/me")).status).toBe(401);
    expect((await support.admin.admin("/me")).status).toBe(401);
    expect((await reader.device.api("/me")).status).toBe(200);
    const { rows: remaining } = await db.ownerPool.query<{ user_id: string }>(
      "SELECT s.user_id FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id WHERE u.role <> 'user'",
    );
    expect(remaining.map((row) => row.user_id)).toEqual([userId]);

    const { rows: audits } = await db.ownerPool.query<{ target_id: string | null; metadata: object }>(
      "SELECT target_id, metadata FROM ops.audit_log WHERE action = 'admin.staff_sessions_revoked' AND actor_user_id = $1",
      [userId],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.target_id).toBeNull();
    expect(audits[0]?.metadata).toMatchObject({
      reason: "怀疑有工作人员账号被盗",
      revokedSessions: result.revokedSessions,
      staffAccounts: result.staffAccounts,
    });
  });
});
