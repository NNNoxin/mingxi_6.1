import { Hono } from "hono";
import type { DependencyCheck, LivenessResponse, ReadinessResponse } from "@mingxi/contracts";
import type { AppEnv } from "../app";

export interface DependencyProbe {
  name: DependencyCheck["name"];
  /** 依赖可用时正常返回，否则抛错（错误信息会出现在就绪检查结果里）。 */
  probe: () => Promise<void>;
}

const PROBE_TIMEOUT_MS = 2_000;

async function runProbe({ name, probe }: DependencyProbe): Promise<DependencyCheck> {
  const startedAt = performance.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`超过 ${PROBE_TIMEOUT_MS}ms 未响应`));
    }, PROBE_TIMEOUT_MS);
  });
  try {
    await Promise.race([probe(), timeout]);
    return { name, ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      name,
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function healthRoutes(options: { version: string; probes: DependencyProbe[] }) {
  return new Hono<AppEnv>()
    .get("/health", (c) => {
      const body: LivenessResponse = { status: "ok", service: "mingxi-server", version: options.version };
      return c.json(body);
    })
    .get("/ready", async (c) => {
      const checks = await Promise.all(options.probes.map(runProbe));
      const ready = checks.every((check) => check.ok);
      for (const check of checks) {
        if (!check.ok) c.var.logger.warn({ dependency: check.name, error: check.error }, "依赖不可用");
      }
      const body: ReadinessResponse = { status: ready ? "ready" : "unavailable", checks };
      return c.json(body, ready ? 200 : 503);
    });
}
