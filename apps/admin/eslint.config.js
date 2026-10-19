import { createConfig } from "@mingxi/config/eslint";

// 运营后台的代码都是新写的，全部按本仓库规则检查。
export default createConfig(import.meta.dirname, {
  ignores: ["next-env.d.ts", "postcss.config.mjs", "out-demo/**"],
});
