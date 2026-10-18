import { z } from "zod";

/**
 * 全站统一的错误码。前端据此决定在原界面哪个已有位置展示错误，
 * 服务端日志据此聚合失败率。新增错误码必须在这里登记。
 */
export const ErrorCode = z.enum([
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "payload_too_large",
  "rate_limited",
  "quota_exceeded",
  "dependency_unavailable",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  quota_exceeded: 429,
  dependency_unavailable: 503,
  internal: 500,
};
