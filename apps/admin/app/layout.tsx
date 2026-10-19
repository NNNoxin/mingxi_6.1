import { transport } from "@admin/transport";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoRibbon } from "../src/components/DemoRibbon";
import "./globals.css";

const demo = transport.mode === "demo";
const title = demo ? "明晰运营后台 · 演示版" : "明晰运营后台";

export const metadata: Metadata = {
  title: { default: title, template: `%s · ${title}` },
  // 内部工具：不让搜索引擎收录（docs/05 §3 第 1 条）。
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {demo ? <DemoRibbon /> : null}
        {children}
      </body>
    </html>
  );
}
