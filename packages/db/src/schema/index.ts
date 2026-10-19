// 全部表结构（docs/02 §5）。迁移由 drizzle-kit 依据这里生成，人工审阅后提交；
// 函数、强制行级隔离、触发器、授权写在手写迁移 0001 / 0003 中。
export * from "./auth";
export * from "./app";
export * from "./memory";
export * from "./ops";
export { EMBEDDING_DIMENSIONS } from "./common";
