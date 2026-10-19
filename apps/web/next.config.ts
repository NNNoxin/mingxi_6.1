import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

// 正式站构建为静态产物，由 apps/server 的 web 角色托管，网页与 /api 同源（docs/02 §2.3、§8）。
// 本地开发时 next dev 单独运行，把 /api 转发给本机的 apps/server，浏览器看到的仍是同一个来源。
export default function config(phase: string): NextConfig {
  const base: NextConfig = {
    output: "export",
    // 界面包直接以 TypeScript 源码发布，由 Next 编译。
    transpilePackages: ["@mingxi/ui"],
  };
  if (phase !== PHASE_DEVELOPMENT_SERVER) return base;
  const apiOrigin = process.env.MINGXI_DEV_API_ORIGIN ?? "http://localhost:8787";
  return {
    ...base,
    rewrites: () => Promise.resolve([{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]),
  };
}
