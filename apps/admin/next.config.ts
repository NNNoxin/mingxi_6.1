import { resolve } from "node:path";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

// 运营后台构建为静态产物，线上是一个独立的 Cloudflare Pages 项目（与正式站不同源，D11），
// 由它的 Pages Function 只转发 /api/auth/* 与 /api/admin/* 到服务端。
// 本地开发时 next dev 在 4402 端口运行，同样只转发这两组接口到本机的 apps/server。
//
// MINGXI_ADMIN_MODE=demo 时构建后台演示版（D16，docs/05 §12.5）：传输层换成页面内的演示服务，
// 产物输出到 out-demo/（静态导出时 distDir 就是导出目录），部署为另一个纯静态站，没有转发、连不到后端。
const MODES = ["live", "demo"] as const;
type Mode = (typeof MODES)[number];

function modeOf(value: string | undefined): Mode {
  if (value === undefined || value === "") return "live";
  if ((MODES as readonly string[]).includes(value)) return value as Mode;
  throw new Error(`MINGXI_ADMIN_MODE 只能是 live 或 demo，收到：${value}`);
}

export default function config(phase: string): NextConfig {
  const mode = modeOf(process.env.MINGXI_ADMIN_MODE);
  const transport = resolve(import.meta.dirname, `src/transport/${mode}.ts`);
  const base: NextConfig = {
    output: "export",
    ...(mode === "demo" ? { distDir: "out-demo" } : {}),
    transpilePackages: ["@mingxi/contracts"],
    webpack: (webpackConfig: { resolve: { alias: Record<string, string> }; cache?: unknown }) => {
      webpackConfig.resolve.alias["@admin/transport"] = transport;
      // Next 的 webpack 持久缓存键不包含这里加的别名：两种模式必须各用一份缓存，否则后构建的模式会沿用
      // 先构建模式解析出的传输层（实测：先构建演示版，再构建的正式版里打包进了演示数据）。
      const { cache } = webpackConfig;
      if (
        typeof cache === "object" &&
        cache !== null &&
        (cache as { type?: unknown }).type === "filesystem"
      ) {
        const named = cache as { name?: unknown };
        if (typeof named.name !== "string") throw new Error("无法区分两种模式的 webpack 缓存：缓存没有 name");
        named.name = `${named.name}-transport-${mode}`;
      }
      return webpackConfig;
    },
  };
  if (phase !== PHASE_DEVELOPMENT_SERVER || mode === "demo") return base;
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
