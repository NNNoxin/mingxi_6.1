import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// 原版的 Tailwind 从仓库根目录自动扫描类名。界面代码现在在 packages/ui，扫描起点同样设为仓库根目录。
// Next 在应用目录下执行构建并打包本文件，这里按工作目录定位仓库根目录。
const repoRoot = resolve(process.cwd(), "../..");
if (!existsSync(join(repoRoot, "pnpm-workspace.yaml"))) {
  throw new Error(`没有在 ${repoRoot} 找到仓库根目录：请在应用目录下运行构建`);
}

const config = {
  plugins: {
    "@tailwindcss/postcss": { base: repoRoot },
  },
};

export default config;
