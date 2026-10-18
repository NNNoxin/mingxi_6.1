import type { UserConfig } from "vitest/config";

/** 单元测试：*.test.ts，不访问外部服务。 */
export function unitConfig(): UserConfig;
/** 集成测试：*.int.test.ts，连真实 PostgreSQL / Redis，串行执行。 */
export function integrationConfig(): UserConfig;
