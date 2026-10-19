import {
  AdminUserDetail,
  AdminUserList,
  ApiErrorBody,
  AuditPage,
  OutboxPage,
  StaffList,
  StaffMe,
  StaffSessionsRevoked,
} from "@mingxi/contracts";
import { describe, expect, it } from "vitest";
import { createDemoDataset, type DemoState } from "./dataset";
import { handleDemoRequest } from "./server";
import { createDemoTransport, type DemoStore } from "./transport";

// 演示服务的响应必须与真实接口同形：每个响应都用服务端与后台界面共用的契约校验。

const NOW = new Date("2026-10-19T08:00:00.000Z");

function call(state: DemoState, method: string, url: string, body?: unknown) {
  const target = new URL(url, "https://admin-demo.invalid");
  return handleDemoRequest(state, { method, path: target.pathname, query: target.searchParams, body }, NOW);
}

function signedIn(): DemoState {
  const state = createDemoDataset(NOW);
  expect(call(state, "POST", "/api/auth/sign-in/email", { email: "a@b.c", password: "x" }).body).toEqual({
    twoFactorRedirect: true,
  });
  expect(call(state, "POST", "/api/auth/two-factor/verify-totp", { code: "123456" }).status).toBe(200);
  return state;
}

function users(state: DemoState, q = "") {
  return AdminUserList.parse(call(state, "GET", `/api/admin/users?q=${encodeURIComponent(q)}`).body).users;
}

function regularUser(state: DemoState, predicate: (user: DemoState["users"][number]) => boolean) {
  const user = state.users.find((item) => item.role === "user" && predicate(item));
  if (!user) throw new Error("演示数据集里没有符合条件的用户");
  return user;
}

function errorOf(response: { status: number; body: unknown }) {
  return ApiErrorBody.parse(response.body).error;
}

describe("演示数据集", () => {
  it("同一时刻生成的数据集完全相同；编号按时间有序", () => {
    expect(createDemoDataset(NOW)).toEqual(createDemoDataset(NOW));
    const state = createDemoDataset(NOW);
    const ids = state.audit.map((entry) => entry.id);
    expect([...ids].sort()).toEqual(ids);
    const times = state.audit.map((entry) => entry.at);
    expect([...times].sort()).toEqual(times);
  });

  it("数据前后一致：冻结 / 申请删除之后没有登录；未验证邮箱的账号没有会话与登录", () => {
    const state = createDemoDataset(NOW);
    const signIns = (userId: string) =>
      state.audit.filter((entry) => entry.action === "auth.sign_in" && entry.actorUserId === userId);
    for (const user of state.users) {
      if (user.status === "frozen") {
        const frozenAt =
          user.deletionRequestedAt ??
          state.audit.find((entry) => entry.action === "admin.user_frozen" && entry.targetId === user.id)?.at;
        expect(frozenAt, user.email).toBeDefined();
        expect(user.sessions, user.email).toEqual([]);
        expect(
          signIns(user.id).filter((entry) => entry.at > (frozenAt ?? "")),
          user.email,
        ).toEqual([]);
      }
      if (!user.emailVerified) {
        expect(user.sessions, user.email).toEqual([]);
        expect(signIns(user.id), user.email).toEqual([]);
      }
    }
  });
});

describe("登录", () => {
  it("没登录时后台接口 401；密码之后必须输入 6 位数字验证码", () => {
    const state = createDemoDataset(NOW);
    const denied = call(state, "GET", "/api/admin/me");
    expect(denied.status).toBe(401);
    expect(errorOf(denied).code).toBe("unauthenticated");
    expect(call(state, "GET", "/api/auth/get-session").body).toBeNull();
    call(state, "POST", "/api/auth/sign-in/email", { email: "a@b.c", password: "x" });
    expect(call(state, "POST", "/api/auth/two-factor/verify-totp", { code: "12ab" })).toMatchObject({
      status: 400,
      body: { code: "INVALID_CODE" },
    });
    expect(call(state, "POST", "/api/auth/two-factor/verify-totp", { code: "654321" }).status).toBe(200);
    const me = StaffMe.parse(call(state, "GET", "/api/admin/me").body);
    expect(me).toMatchObject({ email: "demo-admin@example.com", role: "admin" });
    expect(me.permissions).toContain("staff.manage");
  });

  it("退出后接口重新要求登录", () => {
    const state = signedIn();
    expect(call(state, "POST", "/api/auth/sign-out", {}).status).toBe(200);
    expect(call(state, "GET", "/api/admin/me").status).toBe(401);
  });
});

describe("读取", () => {
  it("用户：默认最近注册的 20 个；邮箱前缀；用户 ID 精确查找；详情", () => {
    const state = signedIn();
    const recent = users(state);
    expect(recent).toHaveLength(20);
    expect(recent.map((user) => user.createdAt)).toEqual(
      [...recent.map((user) => user.createdAt)].sort().reverse(),
    );
    expect(users(state, "LIN").map((user) => user.email)).toEqual([
      "lin.support@example.com",
      "linxi@example.com",
    ]);
    const [first] = recent;
    if (!first) throw new Error("没有用户");
    expect(users(state, first.id)).toEqual([first]);
    const detail = AdminUserDetail.parse(call(state, "GET", `/api/admin/users/${first.id}`).body);
    expect(detail.user).toEqual(first);
    expect(call(state, "GET", "/api/admin/users/not-a-user").status).toBe(404);
  });

  it("审计按编号倒序分页，第二页接着第一页；带操作人邮箱", () => {
    const state = signedIn();
    const first = AuditPage.parse(call(state, "GET", "/api/admin/audit").body);
    expect(first.entries).toHaveLength(50);
    expect(first.nextBefore).not.toBeNull();
    const second = AuditPage.parse(
      call(state, "GET", `/api/admin/audit?before=${first.nextBefore ?? ""}`).body,
    );
    const lastOfFirst = first.entries.at(-1)?.id ?? "";
    expect(second.entries.every((entry) => entry.id < lastOfFirst)).toBe(true);
    const cli = [...first.entries, ...second.entries].find((entry) => entry.metadata.via === "cli");
    expect(cli?.actorEmail ?? null).toBeNull();
    const signIn = first.entries.find((entry) => entry.action === "auth.sign_in");
    expect(signIn?.actorEmail).toMatch(/@example\.com$/);
  });

  it("发件箱按状态筛选；工作人员按角色、邮箱排序", () => {
    const state = signedIn();
    const failed = OutboxPage.parse(call(state, "GET", "/api/admin/email-outbox?status=failed").body);
    expect(failed.entries.length).toBeGreaterThan(0);
    expect(failed.entries.every((entry) => entry.status === "failed")).toBe(true);
    const staff = StaffList.parse(call(state, "GET", "/api/admin/staff").body).staff;
    expect(staff.map((member) => `${member.role} ${member.email}`)).toEqual([
      "admin demo-admin@example.com",
      "analyst wu.analyst@example.com",
      "support lin.support@example.com",
      "support zhou.support@example.com",
    ]);
  });

  it("未知接口 404，形状与服务端一致", () => {
    const state = signedIn();
    const response = call(state, "GET", "/api/admin/nothing");
    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("not_found");
  });
});

describe("写操作（规则与服务端一致，并写审计）", () => {
  it("冻结：撤销全部会话，写审计；重复冻结 409；工作人员不能直接冻结；原因太短 400", () => {
    const state = signedIn();
    const target = regularUser(state, (user) => user.status === "active" && user.sessions.length > 0);
    expect(call(state, "POST", `/api/admin/users/${target.id}/freeze`, { reason: "x" }).status).toBe(400);
    expect(call(state, "POST", `/api/admin/users/${target.id}/freeze`, { reason: "疑似盗号" }).status).toBe(
      200,
    );
    const after = users(state, target.id)[0];
    expect(after).toMatchObject({ status: "frozen", activeSessions: 0 });
    const entry = AuditPage.parse(call(state, "GET", `/api/admin/audit?target=${target.id}`).body).entries[0];
    expect(entry).toMatchObject({ action: "admin.user_frozen", actorEmail: "demo-admin@example.com" });
    expect(entry?.metadata).toMatchObject({ reason: "疑似盗号" });
    expect(call(state, "POST", `/api/admin/users/${target.id}/freeze`, { reason: "再冻一次" }).status).toBe(
      409,
    );
    const staffId = state.users.find((user) => user.role === "support")?.id ?? "";
    expect(call(state, "POST", `/api/admin/users/${staffId}/freeze`, { reason: "测试冻结" }).status).toBe(
      409,
    );
  });

  it("冷静期内不能解冻；已验证的账号不能重发验证邮件；未验证的账号不能发重置邮件", () => {
    const state = signedIn();
    const leaving = regularUser(state, (user) => user.deletionRequestedAt !== null);
    expect(
      call(state, "POST", `/api/admin/users/${leaving.id}/unfreeze`, { reason: "用户来电" }).status,
    ).toBe(409);
    const verified = regularUser(state, (user) => user.emailVerified && user.status === "active");
    expect(
      call(state, "POST", `/api/admin/users/${verified.id}/resend-verification`, { reason: "再发" }).status,
    ).toBe(409);
    const unverified = regularUser(state, (user) => !user.emailVerified);
    expect(
      call(state, "POST", `/api/admin/users/${unverified.id}/send-password-reset`, { reason: "重置" }).status,
    ).toBe(409);
    const before = state.outbox.length;
    expect(
      call(state, "POST", `/api/admin/users/${unverified.id}/resend-verification`, { reason: "没收到" })
        .status,
    ).toBe(200);
    expect(state.outbox.slice(before)).toMatchObject([
      { toAddress: unverified.email, template: "verify_email" },
    ]);
  });

  it("授予角色写审计；不能撤销最后一个开启两步验证的管理员", () => {
    const state = signedIn();
    const newcomer = regularUser(state, (user) => user.emailVerified && user.status === "active");
    expect(
      call(state, "POST", "/api/admin/staff", {
        email: newcomer.email,
        role: "support",
        reason: "新同事入职",
      }).status,
    ).toBe(200);
    const entry = AuditPage.parse(call(state, "GET", `/api/admin/audit?target=${newcomer.id}`).body)
      .entries[0];
    expect(entry?.metadata).toMatchObject({ from: "user", to: "support", via: "admin" });
    const demote = call(state, "POST", "/api/admin/staff", {
      email: "demo-admin@example.com",
      role: "user",
      reason: "测试撤销",
    });
    expect(demote.status).toBe(409);
  });

  it("撤销全部工作人员会话：只保留当前这次登录，普通用户不受影响", () => {
    const state = signedIn();
    const regularSessions = state.users
      .filter((user) => user.role === "user")
      .reduce((sum, user) => sum + user.sessions.length, 0);
    const response = call(state, "POST", "/api/admin/staff/revoke-sessions", {
      reason: "演练：怀疑账号被盗",
    });
    const result = StaffSessionsRevoked.parse(response.body);
    expect(result.revokedSessions).toBeGreaterThanOrEqual(2);
    expect(result.staffAccounts).toBe(4);
    const remaining = state.users.filter((user) => user.role !== "user").flatMap((user) => user.sessions);
    expect(remaining).toHaveLength(1);
    expect(call(state, "GET", "/api/admin/me").status).toBe(200);
    const regularAfter = state.users
      .filter((user) => user.role === "user")
      .reduce((sum, user) => sum + user.sessions.length, 0);
    expect(regularAfter).toBe(regularSessions);
  });

  it("对自己“退出所有设备”之后，当前登录也失效", () => {
    const state = signedIn();
    expect(
      call(state, "POST", `/api/admin/users/${state.operatorId}/revoke-sessions`, { reason: "测试退出" })
        .status,
    ).toBe(200);
    expect(call(state, "GET", "/api/admin/me").status).toBe(401);
  });
});

describe("传输层", () => {
  it("返回真正的 Response，状态保存在存储里，换页（重新加载存储）后仍在", async () => {
    let saved: string | null = null;
    const store: DemoStore = {
      load: () => (saved ? (JSON.parse(saved) as DemoState) : createDemoDataset(NOW)),
      save: (state) => {
        saved = JSON.stringify(state);
      },
    };
    const send = createDemoTransport(store, () => NOW).send;
    const post = (url: string, body: unknown) =>
      send(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    await post("/api/auth/sign-in/email", { email: "a@b.c", password: "x" });
    await post("/api/auth/two-factor/verify-totp", { code: "000000" });
    const me = await send("/api/admin/me");
    expect(me.status).toBe(200);
    expect(StaffMe.parse(await me.json()).role).toBe("admin");
    const reloaded = createDemoTransport(store, () => NOW);
    expect((await reloaded.send("/api/admin/me")).status).toBe(200);
  });
});
