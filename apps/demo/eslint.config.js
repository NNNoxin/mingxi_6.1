import { createConfig } from "@mingxi/config/eslint";

// app/ 下是原样迁移的路由文件、public/ 是原样静态资源，都不按本仓库规则改写（见 BASELINE.md）。
export default createConfig(import.meta.dirname, {
  ignores: ["app/**", "public/**", ".next/**", "out/**", "next-env.d.ts"],
});
