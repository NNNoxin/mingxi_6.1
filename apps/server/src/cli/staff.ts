// 用法：pnpm --filter @mingxi/server staff:grant <邮箱> <角色> "<原因>"
// 生产环境：node dist/staff.js grant <邮箱> <角色> "<原因>"
// 角色：admin（管理员）、support（客服）、analyst（分析）、user（撤销工作人员身份）。
// 第一个管理员只能这样产生（docs/05 §5），需要表 owner 的连接 DATABASE_URL_DIRECT，写审计。
import { createPool } from "@mingxi/db";
import { changeRole, isUserRole, StaffRoleError } from "../staff/roles";

const [command, email, role, reason] = process.argv.slice(2);
const ownerUrl = process.env.DATABASE_URL_DIRECT;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (command !== "grant" || !email || !role || !reason?.trim()) {
  fail('用法：staff grant <邮箱> <admin|support|analyst|user> "<原因>"');
}
if (!isUserRole(role)) fail(`角色不合法：${role}（可选 admin、support、analyst、user）`);
if (!ownerUrl) fail("需要 DATABASE_URL_DIRECT（表 owner 的连接）");

const pool = createPool({ connectionString: ownerUrl, max: 1, applicationName: "mingxi-staff-cli" });
const client = await pool.connect();
let exitCode = 0;
try {
  await client.query("BEGIN");
  const change = await changeRole(client, {
    email,
    role,
    actorUserId: null,
    via: "cli",
    reason: reason.trim(),
  });
  await client.query("COMMIT");
  process.stdout.write(
    change.from === change.to
      ? `${email} 已经是 ${role}，没有改动\n`
      : `${email}：${change.from} → ${change.to}（已写审计）。工作人员登录后台前必须开启两步验证。\n`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  if (!(error instanceof StaffRoleError)) throw error;
  process.stderr.write(`${error.message}\n`);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
process.exit(exitCode);
