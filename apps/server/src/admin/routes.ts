import { Hono, type Context } from "hono";
import type { z } from "zod";
import {
  AdminUserDetail,
  AdminUserList,
  AuditPage,
  OutboxEntry,
  OutboxPage,
  ReasonBody,
  RoleChangeBody,
  StaffList,
  StaffMe,
  type AdminActionResult,
} from "@mingxi/contracts";
import type { Pool } from "@mingxi/db";
import { AppError } from "../errors";
import { hashClientIp, resolveClientIp, socketAddressOf } from "../http/client-ip";
import { rateLimitPerUser } from "../http/rate-limit";
import { requireSameOrigin } from "../http/same-origin";
import type { AuthPort } from "../http/types";
import type { RateLimiter } from "../rate-limit";
import type { Actor, AdminActions } from "./actions";
import { requirePermission, requireStaff, type AdminEnv } from "./guard";
import { auditPage, findUsers, outboxPage, staffMembers, userDetail } from "./queries";

export interface AdminDeps {
  /** 运营后台的来源（MINGXI_ADMIN_URL 的 origin）：后台写接口只接受这个来源。 */
  origin: string;
  auth: AuthPort;
  /** 后台只读账号的连接池（mingxi_admin）。 */
  readPool: Pool;
  actions: AdminActions;
  rateLimiter: RateLimiter;
  trustedProxyHops: number;
  /** 审计里客户端地址哈希的盐（与认证模块相同）。 */
  ipHashSecret: string;
}

async function body<T extends z.ZodType>(c: Context<AdminEnv>, schema: T): Promise<z.infer<T>> {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("bad_request", "请求内容不合法", {
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

const done: AdminActionResult = { ok: true };

/**
 * 运营后台接口 /api/admin/*（docs/05 §4–§6）。整组中间件：后台来源检查 → 工作人员检查 → 按工作人员限流；
 * 每个接口再声明自己需要的权限。最后的兜底路由让未知路径在这里返回 404，不会落进普通用户接口的中间件。
 */
export function adminRoutes(deps: AdminDeps) {
  const app = new Hono<AdminEnv>();
  app.use(
    requireSameOrigin<AdminEnv>(deps.origin),
    requireStaff(deps.auth),
    rateLimitPerUser<AdminEnv>(deps.rateLimiter, "admin", { window: 60, max: 120 }),
  );

  const actor = (c: Context<AdminEnv>): Actor => ({
    userId: c.var.user.id,
    requestId: c.var.requestId,
    ipHash: hashClientIp(
      deps.ipHashSecret,
      resolveClientIp(socketAddressOf(c.env), c.req.header("X-Forwarded-For"), deps.trustedProxyHops),
    ),
  });

  app.get("/me", (c) => {
    const { user, staff } = c.var;
    return c.json(
      StaffMe.parse({
        id: user.id,
        email: user.email,
        name: user.name,
        role: staff.role,
        permissions: [...staff.permissions],
        sessionCreatedAt: staff.session.createdAt.toISOString(),
      }),
    );
  });

  app.get("/users", requirePermission("users.read", { write: false }), async (c) => {
    const users = await findUsers(deps.readPool, c.req.query("q") ?? "");
    return c.json(AdminUserList.parse({ users }));
  });

  app.get("/users/:id", requirePermission("users.read", { write: false }), async (c) => {
    const detail = await userDetail(deps.readPool, c.req.param("id"));
    if (!detail) throw new AppError("not_found", "没有这个用户");
    return c.json(AdminUserDetail.parse(detail));
  });

  app.post("/users/:id/freeze", requirePermission("users.freeze", { write: true }), async (c) => {
    const { reason } = await body(c, ReasonBody);
    await deps.actions.freezeUser(actor(c), c.req.param("id"), reason);
    return c.json(done);
  });

  app.post("/users/:id/unfreeze", requirePermission("users.freeze", { write: true }), async (c) => {
    const { reason } = await body(c, ReasonBody);
    await deps.actions.unfreezeUser(actor(c), c.req.param("id"), reason);
    return c.json(done);
  });

  app.post(
    "/users/:id/revoke-sessions",
    requirePermission("users.sessions.revoke", { write: true }),
    async (c) => {
      const { reason } = await body(c, ReasonBody);
      await deps.actions.revokeSessions(actor(c), c.req.param("id"), reason);
      return c.json(done);
    },
  );

  app.post(
    "/users/:id/resend-verification",
    requirePermission("users.email.resend", { write: true }),
    async (c) => {
      const { reason } = await body(c, ReasonBody);
      await deps.actions.resendVerification(actor(c), c.req.param("id"), reason);
      return c.json(done);
    },
  );

  app.post(
    "/users/:id/send-password-reset",
    requirePermission("users.email.resend", { write: true }),
    async (c) => {
      const { reason } = await body(c, ReasonBody);
      await deps.actions.sendPasswordReset(actor(c), c.req.param("id"), reason);
      return c.json(done);
    },
  );

  app.get("/audit", requirePermission("audit.read", { write: false }), async (c) => {
    const page = await auditPage(deps.readPool, {
      actorUserId: c.req.query("actor"),
      targetId: c.req.query("target"),
      action: c.req.query("action"),
      before: c.req.query("before"),
    });
    return c.json(AuditPage.parse(page));
  });

  app.get("/email-outbox", requirePermission("jobs.read", { write: false }), async (c) => {
    const status = OutboxEntry.shape.status.safeParse(c.req.query("status"));
    const page = await outboxPage(deps.readPool, {
      ...(status.success ? { status: status.data } : {}),
      before: c.req.query("before"),
    });
    return c.json(OutboxPage.parse(page));
  });

  app.get("/staff", requirePermission("staff.manage", { write: false }), async (c) => {
    return c.json(StaffList.parse({ staff: await staffMembers(deps.readPool) }));
  });

  app.post("/staff", requirePermission("staff.manage", { write: true }), async (c) => {
    const input = await body(c, RoleChangeBody);
    await deps.actions.changeStaffRole(actor(c), input);
    return c.json(done);
  });

  app.all("*", () => {
    throw new AppError("not_found", "接口不存在");
  });

  return app;
}
