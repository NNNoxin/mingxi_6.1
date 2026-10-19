import { pino, type DestinationStream, type Logger } from "pino";
import type { ServerEnv } from "./env";

export type { Logger };

/**
 * 结构化日志。凭据与用户内容一律脱敏（docs/02 §4.3：L4 永不记录，L3 只记长度与 ID）。
 * 新增可能携带敏感内容的字段时，必须同步加入这里的脱敏路径。
 */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  "*.password",
  "*.apiKey",
  "*.token",
  "*.secret",
  "*.content",
  "*.body",
];

/** destination 默认是标准输出；测试传入内存流以检查实际写出的日志。 */
export function createLogger(
  env: Pick<ServerEnv, "LOG_LEVEL" | "NODE_ENV" | "MINGXI_VERSION">,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: env.LOG_LEVEL,
    base: { service: "mingxi-server", version: env.MINGXI_VERSION },
    redact: { paths: REDACT_PATHS, censor: "[已隐藏]" },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (destination) return pino(options, destination);
  return pino({
    ...options,
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } }
      : {}),
  });
}
