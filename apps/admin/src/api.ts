import { AdminDenialReason, ApiErrorBody } from "@mingxi/contracts";
import type { z } from "zod";

/** 后台接口返回的失败（网络不通也归为一种），界面据 reason 决定下一步。 */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason: AdminDenialReason | null;
  readonly requestId: string | null;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    reason: AdminDenialReason | null;
    requestId: string | null;
  }) {
    super(input.message);
    this.name = "AdminApiError";
    this.status = input.status;
    this.code = input.code;
    this.reason = input.reason;
    this.requestId = input.requestId;
  }
}

async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    throw new AdminApiError({
      status: 0,
      code: "network",
      message: "连不上服务器，请检查网络后重试",
      reason: null,
      requestId: null,
    });
  }
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorBody.safeParse(raw);
    if (!parsed.success) {
      throw new AdminApiError({
        status: response.status,
        code: "unknown",
        message: `服务器返回 ${String(response.status)}`,
        reason: null,
        requestId: null,
      });
    }
    const { code, message, requestId, details } = parsed.data.error;
    const reason = AdminDenialReason.safeParse((details as { reason?: unknown } | undefined)?.reason);
    throw new AdminApiError({
      status: response.status,
      code,
      message,
      reason: reason.success ? reason.data : null,
      requestId,
    });
  }
  // 契约与服务端共用：响应结构对不上说明前后端版本不一致，明确报错而不是带着错数据渲染。
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AdminApiError({
      status: response.status,
      code: "contract",
      message: "服务器返回的数据格式与后台版本不一致，请刷新页面",
      reason: null,
      requestId: null,
    });
  }
  return parsed.data;
}

export function adminGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  return request(path, schema);
}

export function adminPost<T extends z.ZodType>(path: string, body: unknown, schema: T): Promise<z.infer<T>> {
  return request(path, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
