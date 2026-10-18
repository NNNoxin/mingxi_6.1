// 测试分两层：单元测试（*.test.ts，不碰外部服务）与集成测试（*.int.test.ts，连真实 PostgreSQL / Redis）。
// 这里只返回配置对象（类型见 vitest.d.ts），不在运行时依赖 vitest，由各包自己的 vitest 加载。

export function unitConfig() {
  return {
    test: {
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      exclude: ["**/*.int.test.ts", "**/node_modules/**"],
      environment: "node",
    },
  };
}

export function integrationConfig() {
  return {
    test: {
      include: ["src/**/*.int.test.ts", "test/**/*.int.test.ts"],
      environment: "node",
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  };
}
