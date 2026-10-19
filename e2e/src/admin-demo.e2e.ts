import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_DEMO_ROOT, startStaticSite, type StaticSite } from "./stack";

// 后台演示版的端到端测试（docs/04 P3.5 步骤 5，D16）：演示版按线上方式部署为纯静态站（没有转发），
// 真实浏览器走完全部页面，断言没有一次 /api/ 请求、也没有访问别的网站；并检查两份构建产物互不混入。
// 设置 MINGXI_SCREENSHOT_DIR 时截图（给用户看）。

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const LIVE_ROOT = join(REPO_ROOT, "apps/admin/out");
const DATASET_MARKER = "mingxi-admin-demo-dataset";
const screenshotDir = process.env.MINGXI_SCREENSHOT_DIR;

let site: StaticSite;
let browser: Browser;
let context: BrowserContext;
let page: Page;
/** 浏览器发出的全部请求地址（含跨站请求）。 */
const requested: string[] = [];

function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(js|html|txt)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function filesContaining(root: string, text: string): string[] {
  return filesUnder(root).filter((file) => readFileSync(file, "utf8").includes(text));
}

async function shot(name: string) {
  if (!screenshotDir) return;
  await page.screenshot({ path: join(screenshotDir, `${name}.png`), animations: "disabled" });
}

async function expectRibbon(target: Page = page) {
  await target.getByRole("note").filter({ hasText: "演示数据" }).waitFor();
}

async function signIn(target: Page) {
  await target.goto(`${site.url}/login`);
  await expectRibbon(target);
  await target.getByLabel("工作邮箱").fill("visitor@example.com");
  await target.getByLabel("密码").fill("anything");
  await target.getByRole("button", { name: "登录", exact: true }).click();
  await target.getByLabel("验证码").fill("123456");
  await target.getByRole("button", { name: "验证" }).click();
  await target.getByRole("heading", { name: "用户", exact: true }).waitFor();
}

beforeAll(async () => {
  site = await startStaticSite(ADMIN_DEMO_ROOT, "pnpm --filter @mingxi/admin build:demo");
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
  browser = await chromium.launch();
  context = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 900 } });
  context.on("request", (request) => {
    requested.push(request.url());
  });
  page = await context.newPage();
});

afterAll(async () => {
  await browser.close();
  await site.stop();
});

describe("后台演示版", () => {
  it("构建产物互不混入：正式后台里没有演示数据，演示版里有", () => {
    expect(filesContaining(LIVE_ROOT, DATASET_MARKER)).toEqual([]);
    expect(filesContaining(ADMIN_DEMO_ROOT, DATASET_MARKER).length).toBeGreaterThan(0);
  });

  it("任意邮箱、密码与 6 位验证码即可登录；每页顶部都有“演示数据”标记", async () => {
    await page.goto(`${site.url}/login`);
    await expectRibbon();
    await shot("01-登录");
    await signIn(page);
    await expect.poll(() => page.locator("tbody tr").count()).toBe(20);
    await shot("02-用户列表");
  });

  it("查找用户 → 详情 → 冻结：状态与审计都更新", async () => {
    await page.getByLabel("查找用户").fill("su.wan");
    await page.getByRole("button", { name: "查找" }).click();
    await page.getByRole("link", { name: "su.wan@example.com" }).click();
    await page.getByRole("heading", { name: "su.wan@example.com" }).waitFor();
    await expectRibbon();
    await page.getByRole("button", { name: "冻结账号", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("原因（写入审计日志）").fill("演示：疑似盗号，先冻结核实");
    await dialog.getByRole("button", { name: "确认冻结账号" }).click();
    await page.getByRole("status").filter({ hasText: "已完成：冻结账号" }).waitFor();
    await expect.poll(() => page.getByText("已冻结").first().isVisible()).toBe(true);
    await shot("03-冻结后的用户详情");

    await page.getByRole("link", { name: "审计日志" }).click();
    await page.getByRole("heading", { name: "审计日志", exact: true }).waitFor();
    await expectRibbon();
    await expect
      .poll(() => page.locator("tbody tr").first().textContent())
      .toContain("演示：疑似盗号，先冻结核实");
    await shot("04-审计日志");
  });

  it("邮件投递：按“失败”筛选", async () => {
    await page.getByRole("link", { name: "邮件投递" }).click();
    await page.getByRole("heading", { name: "邮件投递", exact: true }).waitFor();
    await expectRibbon();
    await page.getByRole("tab", { name: "失败" }).click();
    await expect.poll(() => page.locator("tbody tr").count()).toBeGreaterThan(0);
    const rows = await page.locator("tbody tr").allTextContents();
    for (const row of rows) expect(row).toContain("失败");
    await shot("05-邮件投递-失败");
  });

  it("工作人员：撤销全部工作人员会话，当前这次登录保留", async () => {
    await page.getByRole("link", { name: "工作人员" }).click();
    await page.getByRole("heading", { name: "工作人员", exact: true }).waitFor();
    await expectRibbon();
    await page.getByRole("button", { name: "撤销全部工作人员会话" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("原因（写入审计日志）").fill("演示：怀疑有工作人员账号被盗");
    await dialog.getByRole("button", { name: "确认撤销全部会话" }).click();
    await page.getByRole("status").filter({ hasText: "你当前这次登录保留" }).waitFor();
    await shot("06-工作人员");
    await page.reload();
    await page.getByRole("heading", { name: "工作人员", exact: true }).waitFor();
  });

  it("同一标签页刷新后演示数据仍在；新标签页从初始数据开始", async () => {
    await page.goto(`${site.url}/audit`);
    await expect.poll(() => page.locator("tbody tr").first().textContent()).toContain("撤销全部工作人员会话");
    const fresh = await context.newPage();
    await signIn(fresh);
    await fresh.goto(`${site.url}/audit`);
    await fresh.getByRole("heading", { name: "审计日志", exact: true }).waitFor();
    await expect.poll(() => fresh.locator("tbody tr").count()).toBeGreaterThan(0);
    expect(await fresh.locator("tbody").textContent()).not.toContain("演示：疑似盗号，先冻结核实");
    await fresh.close();
  });

  it("退出后回到登录页，再打开后台页面要求登录", async () => {
    await page.getByRole("button", { name: "退出" }).click();
    await page.waitForURL(/\/login/);
    await page.goto(`${site.url}/users`);
    await page.waitForURL(/\/login\?next=/);
  });

  it("全程没有一次 /api/ 请求，也没有访问别的网站", () => {
    expect(site.apiHits).toEqual([]);
    expect(requested.length).toBeGreaterThan(0);
    const origin = new URL(site.url).origin;
    expect(requested.filter((url) => new URL(url).origin !== origin)).toEqual([]);
    expect(requested.filter((url) => new URL(url).pathname.startsWith("/api/"))).toEqual([]);
  });
});
