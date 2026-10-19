import nodemailer from "nodemailer";
import type { Logger } from "../logger";
import type { RenderedEmail } from "./templates";

export interface MailTransport {
  readonly kind: "smtp" | "log";
  send(message: { to: string } & RenderedEmail): Promise<void>;
}

/** 通过 SMTP 投递（任意邮件服务商，或本地 / 测试用的 SMTP 服务）。 */
export function createSmtpTransport(smtpUrl: string, from: string): MailTransport {
  const transporter = nodemailer.createTransport(smtpUrl);
  return {
    kind: "smtp",
    async send(message) {
      await transporter.sendMail({ from, ...message });
    },
  };
}

/**
 * 只写日志、不投递：仅用于本地开发时没有 SMTP 的情况，必须显式配置 MAIL_TRANSPORT=log，生产环境拒绝（env.ts）。
 * 链接会出现在本机日志里，便于开发者完成验证流程。
 */
export function createLogTransport(logger: Logger): MailTransport {
  return {
    kind: "log",
    send(message) {
      logger.warn(
        { mail: { to: message.to, subject: message.subject, text: message.text } },
        "邮件未投递（MAIL_TRANSPORT=log）",
      );
      return Promise.resolve();
    },
  };
}
