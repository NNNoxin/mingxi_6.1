import { Redis } from "ioredis";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareIntegrationDatabase } from "@mingxi/db/testing";
import { startStack, type ReceivedMail, type Stack } from "./stack";

// 正式站账号流程的端到端测试（docs/04 P3 步骤 4）：真实浏览器操作登录 / 注册页，
// 后面是构建产物启动的服务端（api + worker + web）、真实 PostgreSQL 与 Redis、进程内 SMTP。
// 用例按顺序走完同一个账号的生命周期：注册 → 未验证登录 → 验证 → 登录 → 找回密码 → 重置。

const PASSWORD = "灯塔-paper-river-42";
const NEW_PASSWORD = "海边-lantern-sky-97";
const WORKBENCH_PATH = "/mingxi/web";

let stack: Stack;
let browser: Browser;
const contexts: BrowserContext[] = [];
const email = `e2e${String(Date.now())}@example.com`;
/** 登录后保留的设备，用来验证“重置密码后所有设备退出”。 */
let firstDevice: BrowserContext;

beforeAll(async () => {
  // 迁移与运行时账号准备（与集成测试同一套）；服务端进程用运行时账号连接。
  const db = await prepareIntegrationDatabase("mingxi-e2e");
  await db.close();
  // 清掉上一次本地运行留下的认证限流计数（每次运行都从同一个 127.0.0.1 发出请求）；只动服务端默认前缀的键。
  const redis = new Redis(process.env.TEST_REDIS_URL ?? "", { maxRetriesPerRequest: 1 });
  const keys = await redis.keys("rl:auth:*");
  if (keys.length) await redis.del(...keys);
  redis.disconnect();

  stack = await startStack();
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  await stack.stop();
});

async function newPage(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ locale: "zh-CN" });
  contexts.push(context);
  return { context, page: await context.newPage() };
}

function link(mail: ReceivedMail, path: string): string {
  const match = new RegExp(`${stack.baseUrl}/api/auth${path}\\S+`).exec(mail.text);
  if (!match) throw new Error(`邮件里没有 ${path} 链接：${mail.text}`);
  return match[0];
}

async function me(context: BrowserContext): Promise<{ status: number; email?: string }> {
  const response = await context.request.get(`${stack.baseUrl}/api/me`);
  const body = (await response.json()) as { email?: string };
  return { status: response.status(), email: body.email };
}

async function fillLogin(page: Page, password: string) {
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

describe("正式站账号流程", () => {
  it("注册后显示“查收邮件”，并真的寄出验证邮件", async () => {
    const { page } = await newPage();
    await page.goto(`${stack.baseUrl}/login?mode=register`);
    await page.getByLabel("怎么称呼你").fill("林溪");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(PASSWORD);
    await page.getByRole("button", { name: "注册", exact: true }).click();
    await expect.poll(() => page.locator(".mxa-title").textContent()).toBe("查收邮件");
    await expect.poll(() => page.locator(".mxa-lead").textContent()).toContain(email);
    const mail = await stack.waitForMail(email, "验证你的明晰账号邮箱");
    expect(link(mail, "/verify-email")).toContain("callbackURL=%2Fverify-email");
  });

  it("验证前登录：提示先验证，并提供重新发送", async () => {
    const { page } = await newPage();
    await page.goto(`${stack.baseUrl}/login`);
    await fillLogin(page, PASSWORD);
    const alert = page.locator(".mxa-alert");
    await expect.poll(() => alert.textContent()).toContain("这个邮箱还没有验证");
    expect(await alert.getByRole("button", { name: "没收到？重新发送" }).isVisible()).toBe(true);
  });

  it("点验证链接：显示已验证并自动登录（会话 Cookie 不能被页面脚本读取）", async () => {
    const { context, page } = await newPage();
    const mail = await stack.waitForMail(email, "验证你的明晰账号邮箱");
    await page.goto(link(mail, "/verify-email"));
    await page.waitForURL(`${stack.baseUrl}/verify-email`);
    await expect.poll(() => page.locator(".mxa-title").textContent()).toBe("邮箱已验证");
    const session = (await context.cookies()).find((cookie) => cookie.name === "mingxi.session_token");
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");
    expect(await me(context)).toEqual({ status: 200, email });
  });

  it("没经过验证链接、直接打开验证页：不会显示“已验证”", async () => {
    const { page } = await newPage();
    await page.goto(`${stack.baseUrl}/verify-email`);
    await expect.poll(() => page.locator(".mxa-title").textContent()).toBe("请从验证邮件打开");
  });

  it("密码错误：提示邮箱或密码不对，不登录", async () => {
    const { context, page } = await newPage();
    await page.goto(`${stack.baseUrl}/login`);
    await fillLogin(page, "wrong-password-1");
    await expect.poll(() => page.locator(".mxa-alert").textContent()).toBe("邮箱或密码不对");
    expect((await me(context)).status).toBe(401);
  });

  it("登录成功后进入工作台；?next= 指向站外时不跟随（防开放重定向）", async () => {
    const { context, page } = await newPage();
    firstDevice = context;
    await page.goto(`${stack.baseUrl}/login?next=${encodeURIComponent("https://evil.example/steal")}`);
    await fillLogin(page, PASSWORD);
    await page.waitForURL(`${stack.baseUrl}${WORKBENCH_PATH}`);
    expect(await me(context)).toEqual({ status: 200, email });
  });

  it("找回密码 → 邮件链接 → 设置新密码：所有设备退出，旧密码失效，新密码可登录", async () => {
    const { page } = await newPage();
    await page.goto(`${stack.baseUrl}/login`);
    await page.getByRole("button", { name: "忘记密码？" }).click();
    await page.getByLabel("邮箱").fill(email);
    await page.getByRole("button", { name: "发送重置邮件" }).click();
    await expect.poll(() => page.locator(".mxa-title").textContent()).toBe("查收邮件");

    const mail = await stack.waitForMail(email, "重置明晰账号密码");
    await page.goto(link(mail, "/reset-password/"));
    await page.waitForURL(/\/reset-password\?token=/);
    await page.getByLabel("新密码", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("再输入一次").fill(`${NEW_PASSWORD}x`);
    await page.getByRole("button", { name: "保存新密码" }).click();
    await expect.poll(() => page.locator(".mxa-alert").textContent()).toBe("两次输入的密码不一样");
    await page.getByLabel("再输入一次").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "保存新密码" }).click();
    await expect.poll(() => page.locator(".mxa-title").textContent()).toBe("密码已重置");

    expect((await me(firstDevice)).status).toBe(401);

    const { context: fresh, page: login } = await newPage();
    await login.goto(`${stack.baseUrl}/login`);
    await fillLogin(login, NEW_PASSWORD);
    await login.waitForURL(`${stack.baseUrl}${WORKBENCH_PATH}`);
    expect(await me(fresh)).toEqual({ status: 200, email });
  });

  it("同源托管：未知页面返回 404 页，未知接口返回 JSON 错误而不是网页", async () => {
    const page404 = await fetch(`${stack.baseUrl}/no-such-page`);
    expect(page404.status).toBe(404);
    expect(page404.headers.get("content-type")).toContain("text/html");
    const api = await fetch(`${stack.baseUrl}/api/no-such-endpoint`);
    expect(api.status).toBe(401);
    expect(api.headers.get("content-type")).toContain("application/json");
  });
});
