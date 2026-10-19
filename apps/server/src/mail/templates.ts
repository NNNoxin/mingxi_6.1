/** 发件箱里的邮件模板（与 ops.email_outbox.template 的取值一致）。 */
export type EmailTemplate = "verify_email" | "reset_password" | "existing_account";

export interface EmailPayload {
  /** 收件人称呼。 */
  name: string;
  /** 一次性链接（含令牌）。发送成功后从发件箱清除。 */
  url: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const COPY: Record<EmailTemplate, { subject: string; intro: string; action: string; outro: string }> = {
  verify_email: {
    subject: "验证你的明晰账号邮箱",
    intro: "欢迎使用明晰。请点击下面的链接验证邮箱，完成注册：",
    action: "验证邮箱",
    outro: "链接 24 小时内有效。如果这不是你本人的操作，忽略这封邮件即可。",
  },
  existing_account: {
    subject: "有人用你的邮箱注册明晰",
    intro:
      "刚刚有人用这个邮箱注册明晰账号，但这个邮箱已经注册过了。如果是你本人，可以直接登录；忘记密码可以在登录页找回：",
    action: "前往登录",
    outro: "如果不是你本人的操作，忽略这封邮件即可，你的账号不受影响。",
  },
  reset_password: {
    subject: "重置明晰账号密码",
    intro: "我们收到了重置密码的请求。请点击下面的链接设置新密码：",
    action: "重置密码",
    outro:
      "链接 1 小时内有效，重置后所有设备上的登录都会失效。如果不是你本人的操作，忽略这封邮件即可，密码不会改变。",
  },
};

export function renderEmail(template: EmailTemplate, payload: EmailPayload): RenderedEmail {
  const copy = COPY[template];
  const greeting = `${payload.name}，你好：`;
  const text = [greeting, "", copy.intro, payload.url, "", copy.outro, "", "—— 明晰"].join("\n");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(copy.intro)}</p>`,
    `<p><a href="${escapeHtml(payload.url)}">${escapeHtml(copy.action)}</a></p>`,
    `<p style="color:#6f675c">${escapeHtml(payload.url)}</p>`,
    `<p style="color:#6f675c">${escapeHtml(copy.outro)}</p>`,
    "<p>—— 明晰</p>",
  ].join("\n");
  return { subject: copy.subject, text, html };
}
