import type { Metadata } from "next";
import { Suspense } from "react";
import { UserDetailView } from "../../../../src/views/UserDetailView";

export const metadata: Metadata = { title: "用户详情" };

// 静态导出没有动态路由参数，用户 ID 放在查询参数里（?id=）。
export default function Page() {
  return (
    <Suspense>
      <UserDetailView />
    </Suspense>
  );
}
