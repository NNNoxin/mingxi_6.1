import { defineConfig } from "vitest/config";

// 端到端测试：真实浏览器 + 构建产物启动的服务端 + 真实 PostgreSQL / Redis。运行前需要先构建 apps/server、apps/web 与 apps/admin。
export default defineConfig({
  test: {
    include: ["src/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // 同一个文件里的用例按顺序共享一个账号的完整生命周期。
    sequence: { concurrent: false },
    // 文件之间也串行：各文件的服务端连同一个测试库，后台任务会把别的文件的待发邮件投递到自己的收件箱。
    fileParallelism: false,
  },
});
