import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

// 运营后台构建为静态产物，线上是一个独立的 Cloudflare Pages 项目（与正式站不同源，D11），
// 由它的 Pages Function 只转发 /api/auth/* 与 /api/admin/* 到服务端。
// 本地开发时 next dev 在 4402 端口运行，同样只转发这两组接口到本机的 apps/server。
export default function config(phase: string): NextConfig {
  const base: NextConfig = { output: "export", transpilePackages: ["@mingxi/contracts"] };
  if (phase !== PHASE_DEVELOPMENT_SERVER) return base;
  const apiOrigin = process.env.MINGXI_DEV_API_ORIGIN ?? "http://localhost:8787";
  return {
    ...base,
    rewrites: () =>
      Promise.resolve([
        { source: "/api/auth/:path*", destination: `${apiOrigin}/api/auth/:path*` },
        { source: "/api/admin/:path*", destination: `${apiOrigin}/api/admin/:path*` },
      ]),
  };
}
