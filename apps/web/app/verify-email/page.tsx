import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailView } from "../../src/auth/VerifyEmailView";

export const metadata: Metadata = { title: "验证邮箱", robots: { index: false } };

// 页面读取地址栏参数，静态导出时需要 Suspense 边界（参数在浏览器里才可用）。
export default function Page() {
  return (
    <Suspense>
      <VerifyEmailView />
    </Suspense>
  );
}
