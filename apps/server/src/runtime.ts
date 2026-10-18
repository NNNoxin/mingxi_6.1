import { Redis } from "ioredis";
import { createPool, type Pool } from "@mingxi/db";
import type { ServerEnv } from "./env";
import type { Logger } from "./logger";
import type { DependencyProbe } from "./routes/health";

export interface Runtime {
  pool: Pool;
  redis: Redis;
  probes: DependencyProbe[];
  /**
   * 等待 Redis 完成首次连接，最多等待 timeoutMs。返回是否已连上。
   * 启动时调用，使进程开始接流量时就绪状态是准确的；连不上不会阻止启动，由就绪检查如实报告。
   */
  waitForRedis: (timeoutMs: number) => Promise<boolean>;
  close: () => Promise<void>;
}

/** 创建进程级共享资源（数据库连接池、Redis 连接）以及对应的就绪探针。 */
export function createRuntime(env: Pick<ServerEnv, "DATABASE_URL" | "REDIS_URL">, logger: Logger): Runtime {
  const pool = createPool({ connectionString: env.DATABASE_URL, applicationName: "mingxi-server" });
  pool.on("error", (error) => {
    logger.error({ err: error }, "数据库连接池中的空闲连接出错");
  });

  // 不排队离线命令：Redis 不可用时命令立即失败，由调用方与就绪检查如实反映，而不是无限等待。
  const redis = new Redis(env.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
  redis.on("error", (error: Error) => {
    logger.warn({ err: error }, "Redis 连接出错，正在重连");
  });

  const probes: DependencyProbe[] = [
    {
      name: "postgres",
      probe: async () => {
        await pool.query("SELECT 1");
      },
    },
    {
      name: "redis",
      probe: async () => {
        await redis.ping();
      },
    },
  ];

  const waitForRedis = (timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
      if (redis.status === "ready") {
        resolve(true);
        return;
      }
      const onReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        redis.off("ready", onReady);
        resolve(false);
      }, timeoutMs);
      redis.once("ready", onReady);
    });

  return {
    pool,
    redis,
    probes,
    waitForRedis,
    close: async () => {
      redis.disconnect();
      await pool.end();
    },
  };
}
