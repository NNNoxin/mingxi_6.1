import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";

// 端到端测试的运行环境：用构建产物启动真正的服务端进程（api + worker + web 三个角色，与零成本部署一致），
// 邮件投递到本进程内的 SMTP 服务，测试从收件箱里取验证与重置链接。

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SERVER_ENTRY = join(REPO_ROOT, "apps/server/dist/main.js");
const WEB_ROOT = join(REPO_ROOT, "apps/web/out");

export interface ReceivedMail {
  to: string;
  subject: string;
  text: string;
}

export interface Stack {
  baseUrl: string;
  inbox: ReceivedMail[];
  /** 等待寄给 address、主题为 subject 的邮件（后台任务每 2 秒投递一次）。 */
  waitForMail: (address: string, subject: string) => Promise<ReceivedMail>;
  serverLog: () => string;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => {
        resolvePort(port);
      });
    });
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`端到端测试需要环境变量 ${name}（见 .env.example 的测试部分）`);
  return value;
}

async function startSmtp(inbox: ReceivedMail[]): Promise<{ port: number; close: () => Promise<void> }> {
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((mail) => {
          const to = Array.isArray(mail.to) ? mail.to[0]?.text : mail.to?.text;
          inbox.push({ to: to ?? "", subject: mail.subject ?? "", text: mail.text ?? "" });
          callback();
        })
        .catch((error: unknown) => {
          callback(error instanceof Error ? error : new Error(String(error)));
        });
    },
  });
  await new Promise<void>((done) => smtp.listen(0, "127.0.0.1", done));
  const { port } = smtp.server.address() as AddressInfo;
  return {
    port,
    close: () =>
      new Promise<void>((done) => {
        smtp.close(() => {
          done();
        });
      }),
  };
}

async function waitUntilReady(baseUrl: string, server: ChildProcess, log: () => string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`服务端启动后退出（${String(server.exitCode)}）：\n${log()}`);
    try {
      const response = await fetch(`${baseUrl}/api/ready`);
      if (response.ok) return;
    } catch {
      // 端口还没开始监听，继续等待。
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  throw new Error(`服务端 30 秒内没有就绪：\n${log()}`);
}

export async function startStack(): Promise<Stack> {
  for (const [path, how] of [
    [SERVER_ENTRY, "pnpm --filter @mingxi/server build"],
    [join(WEB_ROOT, "404.html"), "pnpm --filter @mingxi/web build"],
  ] as const) {
    if (!existsSync(path)) throw new Error(`缺少构建产物 ${path}，先运行 ${how}`);
  }
  const inbox: ReceivedMail[] = [];
  const smtp = await startSmtp(inbox);
  const port = await freePort();
  const baseUrl = `http://localhost:${String(port)}`;
  let output = "";
  // 只传服务端需要的变量，不把本机 .env 或其他密钥带进子进程。
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: join(REPO_ROOT, "apps/server"),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
      PORT: String(port),
      MINGXI_PROCESS_ROLES: "api,worker,web",
      MINGXI_WEB_ROOT: WEB_ROOT,
      MINGXI_PUBLIC_URL: baseUrl,
      MINGXI_TRUSTED_PROXY_HOPS: "0",
      DATABASE_URL: requireEnv("TEST_APP_DATABASE_URL"),
      REDIS_URL: requireEnv("TEST_REDIS_URL"),
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      MAIL_TRANSPORT: "smtp",
      SMTP_URL: `smtp://127.0.0.1:${String(smtp.port)}`,
      MAIL_FROM: "明晰 <no-reply@e2e.local>",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const append = (chunk: Buffer) => {
    output += chunk.toString("utf8");
  };
  server.stdout.on("data", append);
  server.stderr.on("data", append);
  const serverLog = () => output;
  await waitUntilReady(baseUrl, server, serverLog);

  return {
    baseUrl,
    inbox,
    serverLog,
    waitForMail: async (address, subject) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const found = inbox.filter((mail) => mail.to === address && mail.subject === subject).at(-1);
        if (found) return found;
        await new Promise((done) => setTimeout(done, 250));
      }
      throw new Error(`20 秒内没有收到寄给 ${address} 的「${subject}」，已收到：${JSON.stringify(inbox)}`);
    },
    stop: async () => {
      if (server.exitCode === null) {
        const exited = new Promise((done) => server.once("exit", done));
        server.kill("SIGTERM");
        await exited;
      }
      await smtp.close();
    },
  };
}
