import type { ServerEnv } from "../env";
import type { Logger } from "../logger";
import { createLogTransport, createSmtpTransport, type MailTransport } from "./transport";

export { dispatchDueEmails, enqueueEmail, startOutboxDispatcher } from "./outbox";
export type { MailTransport } from "./transport";

/** 按 MAIL_TRANSPORT 选择投递方式（env.ts 已保证 smtp 时有 SMTP_URL、生产环境不能用 log）。 */
export function createMailTransport(
  env: Pick<ServerEnv, "MAIL_TRANSPORT" | "SMTP_URL" | "MAIL_FROM">,
  logger: Logger,
): MailTransport {
  if (env.MAIL_TRANSPORT === "log") return createLogTransport(logger);
  if (!env.SMTP_URL) throw new Error("MAIL_TRANSPORT=smtp 时必须提供 SMTP_URL");
  return createSmtpTransport(env.SMTP_URL, env.MAIL_FROM);
}
