import { Hono } from "hono";
import type { DependencyCheck, LivenessResponse, ReadinessResponse } from "@mingxi/contracts";
import type { AppEnv } from "../app";

export interface DependencyProbe {
  name: DependencyCheck["name"];
  /** 依赖可用时正常返回，否则抛错（错误信息只写日志，不对外返回）。 */
  probe: () => Promise<void>;
}

const PROBE_TIMEOUT_MS = 2_000;

async function runProbe({
  name,
  probe,
}: DependencyProbe): Promise<{ check: DependencyCheck; error?: string }> {
  const startedAt = performance.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`超过 ${PROBE_TIMEOUT_MS}ms 未响应`));
    }, PROBE_TIMEOUT_MS);
  });
  try {
    await Promise.race([probe(), timeout]);
    return { check: { name, ok: true, latencyMs: Math.round(performance.now() - startedAt) } };
  } catch (error) {
    return {
      check: { name, ok: false, latencyMs: Math.round(performance.now() - startedAt) },
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
      const results = await Promise.all(options.probes.map(runProbe));
      const ready = results.every(({ check }) => check.ok);
      for (const { check, error } of results) {
        if (!check.ok) c.var.logger.warn({ dependency: check.name, error }, "依赖不可用");
      }
      const body: ReadinessResponse = {
        status: ready ? "ready" : "unavailable",
        checks: results.map(({ check }) => check),
      };
      return c.json(body, ready ? 200 : 503);
    });
}
