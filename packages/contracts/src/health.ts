import { z } from "zod";

/** 存活检查：进程在跑即返回，不依赖外部服务（供负载均衡判断是否重启）。 */
export const LivenessResponse = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
});
export type LivenessResponse = z.infer<typeof LivenessResponse>;

/**
 * 单个依赖的检查结果。就绪检查对公网开放，失败原因（可能含数据库主机名、内网地址）只写服务端日志，
 * 不出现在响应里。
 */
export const DependencyCheck = z
  .object({
    name: z.enum(["postgres", "redis"]),
    ok: z.boolean(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();
export type DependencyCheck = z.infer<typeof DependencyCheck>;

/** 就绪检查：依赖全部可用才返回 ready（供部署平台判断能否接流量）。 */
export const ReadinessResponse = z.object({
  status: z.enum(["ready", "unavailable"]),
  checks: z.array(DependencyCheck),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponse>;
