import { z } from "zod";

/**
 * 进程角色：同一镜像按需在本进程启用哪些职责（docs/02 §8.1）。
 * api：HTTP 接口；worker：后台任务（当前为发件箱投递）；web：托管正式站静态产物（与 /api 同源）。
 */
export const ProcessRole = z.enum(["api", "worker", "web"]);
export type ProcessRole = z.infer<typeof ProcessRole>;

/** 空字符串视为未填写（`.env` 里常见 `KEY=` 这种占位写法）。 */
const blankAsUndefined = (value: unknown) => (typeof value === "string" && !value.trim() ? undefined : value);

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const ServerEnv = z
  .object({
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
    /** 运行时数据库账号（受行级隔离约束），见 .env.example。 */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    /** 正式站对外地址：认证回调、邮件里的链接、可信来源（CSRF 校验）都以它为准。 */
    MINGXI_PUBLIC_URL: z.url({ protocol: /^https?$/ }),
    /**
     * 本服务前面有几层会追加 X-Forwarded-For 的可信反向代理（直连部署为 0）。
     * 客户端地址只信任这几层代理追加的部分（http/client-ip.ts）；不设默认值，部署时必须按平台实际情况明确填写。
     */
    MINGXI_TRUSTED_PROXY_HOPS: z.preprocess(
      blankAsUndefined,
      z.coerce.number({ error: "必须填写：直连部署为 0，前面有一层反向代理为 1" }).int().min(0).max(5),
    ),
    /** 会话 Cookie 签名与第三方令牌加密的密钥，至少 32 个字符（例如 `openssl rand -base64 32`）。 */
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET 至少 32 个字符"),
    /** smtp：真实投递；log：只把邮件内容写进日志，仅限本地开发，生产环境拒绝。 */
    MAIL_TRANSPORT: z.enum(["smtp", "log"]),
    SMTP_URL: z.preprocess(blankAsUndefined, z.url({ protocol: /^smtps?$/ }).optional()),
    /** 发件人，例如 `明晰 <no-reply@example.com>`。 */
    MAIL_FROM: z.string().min(3),
    /** 运营后台的对外地址（与正式站不同源，docs/05 §6.1）。设置后启用后台接口 /api/admin/*。 */
    MINGXI_ADMIN_URL: z.preprocess(blankAsUndefined, z.url({ protocol: /^https?$/ }).optional()),
    /** 运营后台只读数据库账号（mingxi_admin 成员，由 db:roles 创建）。与 MINGXI_ADMIN_URL 同时设置。 */
    ADMIN_DATABASE_URL: z.preprocess(blankAsUndefined, z.url({ protocol: /^postgres(ql)?$/ }).optional()),
    /** web 角色托管的正式站静态产物目录（apps/web 的 next build 输出 out/）。 */
    MINGXI_WEB_ROOT: z.preprocess(blankAsUndefined, z.string().optional()),
    GITHUB_CLIENT_ID: optionalSecret,
    GITHUB_CLIENT_SECRET: optionalSecret,
    GOOGLE_CLIENT_ID: optionalSecret,
    GOOGLE_CLIENT_SECRET: optionalSecret,
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === "smtp" && !env.SMTP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message: "MAIL_TRANSPORT=smtp 时必须提供 SMTP_URL",
      });
    }
    if (env.MINGXI_PROCESS_ROLES.includes("web") && !env.MINGXI_WEB_ROOT) {
      ctx.addIssue({
        code: "custom",
        path: ["MINGXI_WEB_ROOT"],
        message: "启用 web 角色时必须提供正式站静态产物目录",
      });
    }
    if (Boolean(env.MINGXI_ADMIN_URL) !== Boolean(env.ADMIN_DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["MINGXI_ADMIN_URL"],
        message: "MINGXI_ADMIN_URL 与 ADMIN_DATABASE_URL 必须同时设置（启用运营后台）或同时留空",
      });
    }
    if (
      env.MINGXI_ADMIN_URL &&
      new URL(env.MINGXI_ADMIN_URL).origin === new URL(env.MINGXI_PUBLIC_URL).origin
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["MINGXI_ADMIN_URL"],
        message: "运营后台必须与正式站不同源（不同域名或子域名），Cookie 才能隔离",
      });
    }
    if (env.MAIL_TRANSPORT === "log" && env.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message: "生产环境不能使用 log：验证与找回密码邮件必须真实投递",
      });
    }
    for (const provider of ["GITHUB", "GOOGLE"] as const) {
      const id = env[`${provider}_CLIENT_ID`];
      const secret = env[`${provider}_CLIENT_SECRET`];
      if (Boolean(id) !== Boolean(secret)) {
        ctx.addIssue({
          code: "custom",
          path: [`${provider}_CLIENT_ID`],
          message: `${provider}_CLIENT_ID 与 ${provider}_CLIENT_SECRET 必须同时提供（启用该第三方登录）或同时留空`,
        });
      }
    }
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
