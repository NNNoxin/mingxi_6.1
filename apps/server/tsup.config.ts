import { cp } from "node:fs/promises";
import { defineConfig } from "tsup";

// 生产产物自包含：全部依赖（含 workspace 内部包）打进单文件，部署时只需要 dist/ 与 Node 运行时，
// 冷启动快（免费实例休眠后唤醒时尤其重要）。pg-native 是 pg 的可选原生绑定，本项目不使用。
export default defineConfig({
  entry: { main: "src/main.ts", migrate: "src/migrate.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  splitting: true,
  noExternal: [/.*/],
  external: ["pg-native"],
  banner: {
    // 打包后的 CommonJS 依赖在 ESM 产物里需要 require。
    js: 'import { createRequire as __mingxiCreateRequire } from "node:module"; const require = __mingxiCreateRequire(import.meta.url);',
  },
  onSuccess: async () => {
    await cp("../../packages/db/migrations", "dist/migrations", { recursive: true });
  },
});
