import { createConfig } from "@mingxi/config/eslint";

// 正式站的代码都是新写的（原样迁移的界面在 packages/ui），全部按本仓库规则检查。
// postcss.config.mjs 与演示站相同（Tailwind 扫描起点设为仓库根目录），不在 TypeScript 项目里。
export default createConfig(import.meta.dirname, { ignores: ["next-env.d.ts", "postcss.config.mjs"] });
