import { z } from "zod";

/**
 * 进程角色：同一镜像按需在本进程启用哪些职责（docs/02 §8.1）。
 * 只登记已经实现的角色；worker（后台任务）与 web（托管正式站静态产物）随对应阶段加入。
 */
export const ProcessRole = z.enum(["api"]);
export type ProcessRole = z.infer<typeof ProcessRole>;

const ServerEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MINGXI_VERSION: z.string().min(1).default("dev"),
  MINGXI_PROCESS_ROLES: z
    .string()
    .default("api")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(ProcessRole).nonempty()),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

export class EnvError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`环境变量不合法：\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "EnvError";
    this.issues = issues;
  }
}

/** 启动时校验全部环境变量；任何一项不合法都拒绝启动，并一次性列出所有问题。 */
export function loadEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = ServerEnv.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return parsed.data;
}
