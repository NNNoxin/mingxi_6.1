import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Redis } from "ioredis";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareIntegrationDatabase } from "@mingxi/db/testing";
import { startStack, type Stack } from "./stack";
import { base32Decode, totpCode } from "./totp";

// 运营后台的端到端测试（docs/04 P3.5 步骤 4）：真实浏览器在后台来源上操作，后台静态站只转发
// /api/auth/* 与 /api/admin/* 到构建产物启动的服务端（与线上 Pages Function 一致）。
// 设置 MINGXI_SCREENSHOT_DIR 时在关键步骤截图（给用户确认界面用，D12）。

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PASSWORD = "灯塔-paper-river-42";
const stamp = String(Date.now());
const adminEmail = `admin${stamp}@example.com`;
const targetEmail = `reader${stamp}@example.com`;
const screenshotDir = process.env.MINGXI_SCREENSHOT_DIR;

let stack: Stack;
let browser: Browser;
let adminContext: BrowserContext;
let page: Page;
let totpSecret: Buffer;
/** 目标用户在正式站上的会话 Cookie（用来验证“退出所有设备”真的生效）。 */
let targetCookie = "";
/** 目标用户的 ID（从详情页地址取，审计日志按它筛选，避免读到以前运行留下的同名记录）。 */
let targetId = "";

function adminUrl(path: string): string {
  if (!stack.adminUrl) throw new Error("后台站点没有启动");
  return `${stack.adminUrl}${path}`;
}

/**
 * 截图前由调用方先等到要看的内容出现（客户端路由切换后 networkidle 早已达成，不能用来等数据）；
 * 关掉过渡动画，避免拍到按钮淡入的中间帧。
 */
async function shot(name: string) {
  if (!screenshotDir) return;
  await page.screenshot({ path: join(screenshotDir, `${name}.png`), animations: "disabled" });
}

/** 在正式站注册并点击验证链接，返回自动登录后的会话 Cookie。 */
async function verifiedAccount(email: string, name: string): Promise<string> {
  const signUp = await fetch(`${stack.baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: stack.baseUrl },
    body: JSON.stringify({ email, password: PASSWORD, name }),
  });
  expect(signUp.status).toBe(200);
  const mail = await stack.waitForMail(email, "验证你的明晰账号邮箱");
  const link = new RegExp(`${stack.baseUrl}/api/auth/verify-email\\S+`).exec(mail.text)?.[0] ?? "";
  const verified = await fetch(link, { redirect: "manual" });
  expect(verified.status).toBe(302);
  return verified.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function meStatus(cookie: string): Promise<number> {
  return (await fetch(`${stack.baseUrl}/api/me`, { headers: { cookie } })).status;
}

async function confirmAction(label: string, reason: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("原因（写入审计日志）").fill(reason);
  await dialog.getByRole("button", { name: `确认${label}` }).click();
  await expect.poll(() => page.getByRole("status").first().textContent()).toContain(`已完成：${label}`);
}

beforeAll(async () => {
  const db = await prepareIntegrationDatabase("mingxi-e2e-admin");
  await db.close();
  const redis = new Redis(process.env.TEST_REDIS_URL ?? "", { maxRetriesPerRequest: 1 });
  const keys = await redis.keys("rl:auth:*");
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

  stack = await startStack({ admin: true });
  browser = await chromium.launch();
  adminContext = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 900 } });
  page = await adminContext.newPage();
});

afterAll(async () => {
  await browser.close();
  await stack.stop();
});

describe("运营后台", () => {
  it("构建产物带上 Cloudflare Pages 的响应头：禁止被其他网站嵌入、不被收录", () => {
    const headers = readFileSync(join(REPO_ROOT, "apps/admin/out/_headers"), "utf8");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("Content-Security-Policy: frame-ancestors 'none'");
    expect(headers).toContain("X-Robots-Tag: noindex");
  });

  it("第一个管理员由部署环境里的命令产生，并写审计", async () => {
    await verifiedAccount(adminEmail, "运营小林");
    targetCookie = await verifiedAccount(targetEmail, "林溪");
    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "apps/server/dist/staff.js"), "grant", adminEmail, "admin", "端到端测试初始化"],
      {
        env: { PATH: process.env.PATH, DATABASE_URL_DIRECT: process.env.TEST_DATABASE_URL },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("user → admin（已写审计）");
  });

  it("首次登录后台：没开两步验证就被引导开启，开启后直接进入后台", async () => {
    await page.goto(adminUrl("/login"));
    await shot("01-登录");
    await page.getByLabel("工作邮箱").fill(adminEmail);
    await page.getByLabel("密码").fill(PASSWORD);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("heading", { name: "开启两步验证" }).waitFor();
    await page.getByLabel("先确认登录密码").fill(PASSWORD);
    await page.getByRole("button", { name: "下一步" }).click();
    const secret = (await page.locator("code").first().textContent()) ?? "";
    totpSecret = base32Decode(secret.trim());
    await shot("02-开启两步验证");
    await page.getByLabel("3. 输入 App 里当前的验证码").fill(totpCode(totpSecret));
    await page.getByRole("button", { name: "确认开启" }).click();
    await page.getByRole("heading", { name: "用户", exact: true }).waitFor();
    // 不输入时列出最近注册的账号，刚注册的目标用户在其中。
    await page.getByRole("link", { name: targetEmail }).waitFor();
    await shot("03-用户列表");
  });

  it("查找用户 → 详情 → 退出所有设备：目标用户的会话立即失效", async () => {
    expect(await meStatus(targetCookie)).toBe(200);
    await page.getByLabel("查找用户").fill(targetEmail);
    await page.getByRole("button", { name: "查找" }).click();
    await page.getByRole("link", { name: targetEmail }).click();
    await page.getByRole("heading", { name: targetEmail }).waitFor();
    targetId = new URL(page.url()).searchParams.get("id") ?? "";
    expect(targetId).toMatch(/^[0-9a-f-]{36}$/);
    await shot("04-用户详情");
    await page.getByRole("button", { name: "退出所有设备", exact: true }).click();
    await page.getByRole("dialog").getByLabel("原因（写入审计日志）").fill("用户来信说手机丢失");
    await shot("05-填写原因");
    await page.getByRole("dialog").getByRole("button", { name: "确认退出所有设备" }).click();
    await expect.poll(() => page.getByRole("status").first().textContent()).toContain("已完成：退出所有设备");
    expect(await meStatus(targetCookie)).toBe(401);
  });

  it("冻结与解冻（敏感操作，刚登录可以直接执行）", async () => {
    await confirmAction("冻结账号", "疑似盗号，先冻结核实");
    await expect.poll(() => page.getByText("已冻结").first().isVisible()).toBe(true);
    await shot("06-已冻结");
    await confirmAction("解冻账号", "已与用户本人核实");
    await expect.poll(() => page.getByText("正常").first().isVisible()).toBe(true);
  });

  it("审计日志、邮件投递、工作人员三个页面", async () => {
    await page.getByRole("link", { name: "审计日志" }).click();
    await page.getByRole("heading", { name: "审计日志", exact: true }).waitFor();
    await page.getByLabel("对象").fill(targetId);
    await page.getByRole("button", { name: "筛选" }).click();
    // 本次对目标用户的三次操作，最新的在前；原因原样写进审计。
    await expect.poll(() => page.locator("tbody tr").count()).toBe(3);
    const rows = await page.locator("tbody tr").allTextContents();
    expect(rows[0]).toContain("已与用户本人核实");
    expect(rows[1]).toContain("疑似盗号，先冻结核实");
    expect(rows[2]).toContain("用户来信说手机丢失");
    await shot("07-审计日志");

    await page.getByRole("link", { name: "邮件投递" }).click();
    await page.getByRole("heading", { name: "邮件投递", exact: true }).waitFor();
    await expect.poll(() => page.getByRole("cell", { name: targetEmail }).first().isVisible()).toBe(true);
    await shot("08-邮件投递");

    await page.getByRole("link", { name: "工作人员" }).click();
    await page.getByRole("heading", { name: "工作人员", exact: true }).waitFor();
    await expect.poll(() => page.getByRole("link", { name: adminEmail }).isVisible()).toBe(true);
    await shot("09-工作人员");
  });

  it("撤销全部工作人员会话：执行者当前这次登录保留（EC-A1）", async () => {
    await page.getByRole("button", { name: "撤销全部工作人员会话" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("原因（写入审计日志）").fill("演练：怀疑有工作人员账号被盗");
    await dialog.getByRole("button", { name: "确认撤销全部会话" }).click();
    await page.getByRole("status").filter({ hasText: "你当前这次登录保留" }).waitFor();
    await shot("10-撤销全部工作人员会话");
    // 重新加载会重新检查登录状态：当前会话仍然有效。
    await page.reload();
    await page.getByRole("heading", { name: "工作人员", exact: true }).waitFor();
  });

  it("退出失败时留在原页并说明原因，不假装已经退出", async () => {
    await page.route("**/api/auth/sign-out", (route) => route.fulfill({ status: 503, body: "" }));
    await page.getByRole("button", { name: "退出" }).click();
    await page.getByRole("alert").filter({ hasText: "没能退出（HTTP 503），请重试" }).waitFor();
    expect(new URL(page.url()).pathname).toBe("/staff");
    await page.unroute("**/api/auth/sign-out");
  });

  it("退出后再登录需要验证码；后台的 Cookie 只属于后台站点", async () => {
    await page.getByRole("button", { name: "退出" }).click();
    await page.waitForURL(/\/login/);
    await page.getByLabel("工作邮箱").fill(adminEmail);
    await page.getByLabel("密码").fill(PASSWORD);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByLabel("验证码").waitFor();
    await shot("11-输入验证码");
    await page.getByLabel("验证码").fill(totpCode(totpSecret));
    await page.getByRole("button", { name: "验证" }).click();
    await page.getByRole("heading", { name: "用户", exact: true }).waitFor();
    const cookies = await adminContext.cookies();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) expect(cookie.domain).toBe("127.0.0.1");
  });

  it("普通用户登录后台：提示不是工作人员", async () => {
    const context = await browser.newContext({ locale: "zh-CN" });
    const visitor = await context.newPage();
    await visitor.goto(adminUrl("/login"));
    await visitor.getByLabel("工作邮箱").fill(targetEmail);
    await visitor.getByLabel("密码").fill(PASSWORD);
    await visitor.getByRole("button", { name: "登录", exact: true }).click();
    await expect
      .poll(() => visitor.getByRole("alert").first().textContent())
      .toContain("这个账号不是工作人员");
    await context.close();
  });
});
