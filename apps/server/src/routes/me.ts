import { Hono } from "hono";
import type { ProtectedEnv } from "../http/session";

/** 当前登录用户（正式站判断登录状态、显示账号信息用）。只返回本人可见的字段。 */
export function meRoutes() {
  return new Hono<ProtectedEnv>().get("/me", (c) => {
    const { id, email, name, emailVerified, role } = c.var.user;
    return c.json({ id, email, name, emailVerified, role });
  });
}
