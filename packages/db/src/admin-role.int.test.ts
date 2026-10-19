import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_GROUP_ROLE,
  assertAdminRoleIsolated,
  assertRuntimeRoleIsolated,
  DatabaseRoleError,
  ensureLoginRole,
} from "./db-roles";
import type { Pool } from "./pool";
import { prepareIntegrationDatabase, type IntegrationDatabase } from "./testing";
import { withUserTransaction } from "./user-context";

// 运营后台只读账号的权限边界（docs/05 §6.1、EC-A3）：能读账号元数据，读不到任何用户内容与凭据，不能写。

let db: IntegrationDatabase;
let admin: Pool;
let userId: string;
let email: string;

beforeAll(async () => {
  db = await prepareIntegrationDatabase("mingxi-db-admin-role-test");
  admin = db.adminPool;
  email = `admin-view-${String(Date.now())}@example.com`;
  const { rows } = await db.appPool.query<{ id: string }>(
    "INSERT INTO auth.users (name, email) VALUES ('被查看的用户', $1) RETURNING id",
    [email],
  );
  userId = rows[0]?.id ?? "";
  await db.appPool.query(
    `INSERT INTO auth.sessions (user_id, token, expires_at, user_agent)
     VALUES ($1, $2, now() + interval '1 day', 'Mozilla/5.0 测试')`,
    [userId, `token-${String(Date.now())}`],
  );
  // 套餐定义要到 P9 才写入迁移；测试用 owner 建一个测试套餐。
  await db.ownerPool.query(
    `INSERT INTO ops.plans (id, name, monthly_tokens, monthly_agent_turns, monthly_web_searches, storage_bytes)
     VALUES ('test_plan', '测试套餐', 1000, 10, 10, 1048576) ON CONFLICT (id) DO NOTHING`,
  );
  await withUserTransaction(db.appPool, userId, async (client) => {
    await client.query("INSERT INTO ops.user_plans (user_id, plan_id) VALUES ($1, 'test_plan')", [userId]);
    const workspace = await client.query<{ id: string }>(
      "INSERT INTO app.workspaces (user_id, name) VALUES ($1, '个人空间') RETURNING id",
      [userId],
    );
    await client.query(
      `INSERT INTO app.notes (user_id, workspace_id, title, modality, content_hash, origin)
       VALUES ($1, $2, '私密笔记', 'webpage', $3, 'upload')`,
      [userId, workspace.rows[0]?.id, "b".repeat(64)],
    );
  });
});

afterAll(async () => {
  await db.close();
});

async function denied(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await admin.query(sql, params);
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
  throw new Error(`后台账号竟然可以执行：${sql}`);
}

describe("后台只读账号", () => {
  it("能读用户元数据：会话数、套餐（跨用户，不受所有者隔离限制）", async () => {
    const { rows } = await admin.query(
      `SELECT email, name, role, status, active_sessions, plan_id, two_factor_enabled
         FROM ops.admin_user_overview WHERE id = $1`,
      [userId],
    );
    expect(rows).toEqual([
      {
        email,
        name: "被查看的用户",
        role: "user",
        status: "active",
        active_sessions: 1,
        plan_id: "test_plan",
        two_factor_enabled: false,
      },
    ]);
  });

  it("读不到任何用户内容：app、memory 两个 schema 整体不可用", async () => {
    // 42501 = insufficient_privilege
    expect(await denied("SELECT title FROM app.notes")).toBe("42501");
    expect(await denied("SELECT * FROM app.conversations")).toBe("42501");
    expect(await denied("SELECT * FROM app.messages")).toBe("42501");
    expect(await denied("SELECT * FROM memory.traits")).toBe("42501");
  });

  it("读不到凭据：会话令牌、IP、密码、两步验证密钥、邮件正文", async () => {
    expect(await denied("SELECT token FROM auth.sessions")).toBe("42501");
    expect(await denied("SELECT ip_address FROM auth.sessions")).toBe("42501");
    expect(await denied("SELECT * FROM auth.sessions")).toBe("42501");
    expect(await denied("SELECT password FROM auth.accounts")).toBe("42501");
    expect(await denied("SELECT * FROM auth.verifications")).toBe("42501");
    expect(await denied("SELECT secret, backup_codes FROM auth.two_factors")).toBe("42501");
    expect(await denied("SELECT payload FROM ops.email_outbox")).toBe("42501");
  });

  it("没有任何写权限", async () => {
    expect(await denied("UPDATE auth.users SET status = 'frozen' WHERE id = $1", [userId])).toBe("42501");
    expect(await denied("DELETE FROM auth.sessions WHERE user_id = $1", [userId])).toBe("42501");
    expect(await denied("INSERT INTO ops.audit_log (action) VALUES ('admin.forged')")).toBe("42501");
    expect(await denied("DELETE FROM ops.audit_log")).toBe("42501");
  });

  it("运行时账号读不到后台视图；两个账号的权限组互斥", async () => {
    await expect(db.appPool.query("SELECT * FROM ops.admin_user_overview")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(assertAdminRoleIsolated(db.appPool)).rejects.toBeInstanceOf(DatabaseRoleError);
    await expect(assertRuntimeRoleIsolated(admin)).rejects.toBeInstanceOf(DatabaseRoleError);
    // 已经是运行时账号的角色不能再加入后台权限组。
    await expect(
      ensureLoginRole(db.ownerPool, process.env.TEST_APP_DATABASE_URL ?? "", ADMIN_GROUP_ROLE),
    ).rejects.toThrow(/已属于 mingxi_runtime/);
  });
});
