import { HTTP_STATUS_BY_CODE, type ApiErrorBody, type ErrorCode } from "@mingxi/contracts";

/** 业务代码抛出的可预期错误。未被包装成 AppError 的异常一律视为 internal 并记录完整堆栈。 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return HTTP_STATUS_BY_CODE[this.code];
  }
}

export function errorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ApiErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}
