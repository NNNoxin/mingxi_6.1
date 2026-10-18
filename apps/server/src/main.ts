import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { createRuntime } from "./runtime";

const SHUTDOWN_GRACE_MS = 10_000;
const STARTUP_REDIS_WAIT_MS = 5_000;

const env = loadEnv();
const logger = createLogger(env);
const runtime = createRuntime(env, logger);
if (!(await runtime.waitForRedis(STARTUP_REDIS_WAIT_MS))) {
  logger.warn(
    { waitedMs: STARTUP_REDIS_WAIT_MS },
    "启动时 Redis 未连上，继续启动；就绪检查会报告不可用直到连上",
  );
}
const app = createApp({ logger, version: env.MINGXI_VERSION, probes: runtime.probes });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, roles: env.MINGXI_PROCESS_ROLES }, "mingxi-server 已启动");
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "收到停机信号，停止接收新请求");
  const forceExit = setTimeout(() => {
    logger.error("优雅停机超时，强制退出");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();
  server.close((closeError) => {
    if (closeError) logger.error({ err: closeError }, "关闭 HTTP 服务时出错");
    runtime
      .close()
      .then(() => {
        logger.info("已释放数据库与 Redis 连接，退出");
        process.exit(closeError ? 1 : 0);
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "释放资源时出错");
        process.exit(1);
      });
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
