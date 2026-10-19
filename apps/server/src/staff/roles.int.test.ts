import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "@mingxi/db";
import { prepareIntegrationDatabase, type IntegrationDatabase } from "@mingxi/db/testing";
import { changeRole, StaffRoleError, type UserRole } from "./roles";

// 工作人员角色变更（docs/05 §5、EC-A6），连真实 PostgreSQL，用表 owner 的连接（与命令行相同）。

let db: IntegrationDatabase;
let counter = 0;

beforeAll(async () => {
  db = await prepareIntegrationDatabase("mingxi-staff-test");
});

afterAll(async () => {
  await db.close();
});

async function newUser(
  options: { verified?: boolean; role?: UserRole; twoFactor?: boolean } = {},
): Promise<string> {
  counter += 1;
  const email = `staff${String(Date.now())}${String(counter)}@example.com`;
  await db.ownerPool.query(
    "INSERT INTO auth.users (name, email, email_verified, role, two_factor_enabled) VALUES ('工作人员', $1, $2, $3, $4)",
    [email, options.verified ?? true, options.role ?? "user", options.twoFactor ?? false],
  );
  return email;
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.ownerPool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const grant = (email: string, role: UserRole) =>
  inTransaction((client) =>
    changeRole(client, { email, role, actorUserId: null, via: "cli", reason: "测试" }),
  );

describe("工作人员角色", () => {
  it("授予角色并在同一事务写审计", async () => {
    const email = await newUser();
    const change = await grant(email, "support");
    expect(change).toMatchObject({ from: "user", to: "support" });
    const { rows } = await db.ownerPool.query<{ metadata: unknown }>(
      "SELECT metadata FROM ops.audit_log WHERE action = 'staff.role_changed' AND target_id = $1",
      [change.userId],
    );
    expect(rows).toEqual([{ metadata: { from: "user", to: "support", via: "cli", reason: "测试" } }]);
  });

  it("没有这个账号、邮箱未验证：拒绝且不写任何东西", async () => {
    await expect(grant("nobody@example.com", "admin")).rejects.toBeInstanceOf(StaffRoleError);
    const unverified = await newUser({ verified: false });
    await expect(grant(unverified, "admin")).rejects.toThrow(/还没有验证邮箱/);
  });

  it("至少保留一个开启了两步验证的管理员（EC-A6）", async () => {
    // 先把库里其他测试留下的管理员都降级，构造“只剩一个管理员”的情形。
    await db.ownerPool.query("UPDATE auth.users SET role = 'user' WHERE role = 'admin'");
    const only = await newUser({ role: "admin", twoFactor: true });
    await expect(grant(only, "user")).rejects.toThrow(/最后一个已开启两步验证的管理员/);
    // 另一个管理员没开两步验证，同样不算。
    await newUser({ role: "admin", twoFactor: false });
    await expect(grant(only, "support")).rejects.toThrow(/最后一个/);
    const second = await newUser({ role: "admin", twoFactor: true });
    expect((await grant(only, "user")).to).toBe("user");
    await expect(grant(second, "user")).rejects.toThrow(/最后一个/);
  });

  it("两个并发的撤销不会同时成功", async () => {
    await db.ownerPool.query("UPDATE auth.users SET role = 'user' WHERE role = 'admin'");
    const a = await newUser({ role: "admin", twoFactor: true });
    const b = await newUser({ role: "admin", twoFactor: true });
    const results = await Promise.allSettled([grant(a, "user"), grant(b, "user")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const { rows } = await db.ownerPool.query(
      "SELECT 1 FROM auth.users WHERE role = 'admin' AND two_factor_enabled",
    );
    expect(rows).toHaveLength(1);
  });
});
