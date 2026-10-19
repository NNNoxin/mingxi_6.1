import { describe, expect, it } from "vitest";
import { AdminPermission, PERMISSIONS_BY_ROLE, SENSITIVE_PERMISSIONS, StaffRole, UserRole } from "./admin";

describe("后台权限矩阵", () => {
  it("管理员拥有全部权限；客服与分析的权限都是管理员权限的子集", () => {
    expect([...PERMISSIONS_BY_ROLE.admin].sort()).toEqual([...AdminPermission.options].sort());
    for (const role of StaffRole.options) {
      for (const permission of PERMISSIONS_BY_ROLE[role])
        expect(PERMISSIONS_BY_ROLE.admin).toContain(permission);
    }
  });

  it("与 docs/05 §5 一致的几条关键边界", () => {
    expect(PERMISSIONS_BY_ROLE.support).not.toContain("users.freeze");
    expect(PERMISSIONS_BY_ROLE.support).not.toContain("audit.read");
    expect(PERMISSIONS_BY_ROLE.analyst).not.toContain("users.read");
    expect(PERMISSIONS_BY_ROLE.analyst).not.toContain("support.access");
    expect(SENSITIVE_PERMISSIONS.has("staff.manage")).toBe(true);
    expect(SENSITIVE_PERMISSIONS.has("users.read")).toBe(false);
  });

  it("工作人员角色是账号角色去掉 user", () => {
    expect(UserRole.options.filter((role) => role !== "user")).toEqual(StaffRole.options);
  });
});
