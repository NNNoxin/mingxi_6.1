import { serve } from "@hono/node-server";
import { assertAdminRoleIsolated, assertRuntimeRoleIsolated, withUserTransaction } from "@mingxi/db";
import { adminActions } from "./admin/actions";
import { createApp } from "./app";
import { adminAuthActions, authPort, createAuth } from "./auth/auth";
import { loadEnv } from "./env";
import { createRedisIdempotencyStore } from "./http/idempotency";
import { createLogger } from "./logger";
import { createMailTransport, startOutboxDispatcher } from "./mail";
import { createRedisRateLimiter } from "./rate-limit";
import { createRuntime } from "./runtime";

const SHUTDOWN_GRACE_MS = 10_000;
const STARTUP_REDIS_WAIT_MS = 5_000;

const env = loadEnv();
const logger = createLogger(env);
const runtime = createRuntime(env, logger);

// 行级隔离对超级用户与 BYPASSRLS 角色无效：运行时账号不满足要求时拒绝启动，而不是带着失效的隔离运行。
try {
  const role = await assertRuntimeRoleIsolated(runtime.pool);
  logger.info({ role: role.role }, "数据库运行时账号受行级隔离约束");
  if (runtime.adminPool) {
    const admin = await assertAdminRoleIsolated(runtime.adminPool);
    logger.info({ role: admin.role }, "运营后台数据库账号只有只读权限");
  }
} catch (error) {
  logger.fatal(
    { err: error },
    "数据库账号检查未通过（运行时账号须受行级隔离约束、后台账号须只读），拒绝启动",
  );
  await runtime.close();
  process.exit(1);
}

if (!(await runtime.waitForRedis(STARTUP_REDIS_WAIT_MS))) {
  logger.warn(
    { waitedMs: STARTUP_REDIS_WAIT_MS },
    "启动时 Redis 未连上，继续启动；就绪检查会报告不可用直到连上",
  );
}

const rateLimiter = createRedisRateLimiter(runtime.redis);
const auth = createAuth({ env, pool: runtime.pool, rateLimiter, logger });
const port = authPort(auth);
const app = createApp({
  logger,
  version: env.MINGXI_VERSION,
  probes: runtime.probes,
  auth: port,
  publicOrigin: new URL(env.MINGXI_PUBLIC_URL).origin,
  trustedProxyHops: env.MINGXI_TRUSTED_PROXY_HOPS,
  rateLimiter,
  idempotencyStore: createRedisIdempotencyStore(runtime.redis),
  withUserTransaction: (userId) => (work) => withUserTransaction(runtime.pool, userId, work),
  ...(env.MINGXI_PROCESS_ROLES.includes("web") ? { webRoot: env.MINGXI_WEB_ROOT } : {}),
  ...(env.MINGXI_ADMIN_URL && runtime.adminPool
    ? {
        admin: {
          origin: new URL(env.MINGXI_ADMIN_URL).origin,
          auth: port,
          readPool: runtime.adminPool,
          actions: adminActions(runtime.pool, adminAuthActions(auth)),
          rateLimiter,
          trustedProxyHops: env.MINGXI_TRUSTED_PROXY_HOPS,
          ipHashSecret: env.BETTER_AUTH_SECRET,
        },
      }
    : {}),
});

const stopDispatcher = env.MINGXI_PROCESS_ROLES.includes("worker")
  ? startOutboxDispatcher(runtime.pool, createMailTransport(env, logger), logger)
  : () => Promise.resolve();

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
    stopDispatcher()
      .then(() => runtime.close())
      .then(() => {
        logger.info("已停止后台任务并释放数据库与 Redis 连接，退出");
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
