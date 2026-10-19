import { isIP } from "node:net";

/**
 * 交给认证模块的客户端地址请求头。由本服务计算后写入，覆盖客户端自带的同名头；
 * 认证模块只读这个头（auth.ts 的 ipAddressHeaders），不再自己解析 X-Forwarded-For。
 */
export const CLIENT_IP_HEADER = "x-mingxi-client-ip";

/**
 * 计算客户端地址。X-Forwarded-For 可以被客户端随意伪造，只有可信代理追加的部分才可信：
 * 把直连本服务的地址接在链尾，从右往左跳过 trustedHops 个可信代理，得到的就是客户端地址。
 * - trustedHops = 0：直连部署，完全不看 X-Forwarded-For；
 * - trustedHops = 1：前面有一层会追加地址的代理（例如 Render）。
 * 链比可信跳数短时（有人绕过代理直连），取链最左端，即直连方自己声明的地址也只是它本身的位置。
 */
export function resolveClientIp(
  socketAddress: string | undefined,
  forwardedFor: string | null | undefined,
  trustedHops: number,
): string | null {
  if (!socketAddress) return null;
  const forwarded = trustedHops > 0 && forwardedFor ? forwardedFor.split(",").map((part) => part.trim()) : [];
  const chain = [...forwarded.filter(Boolean), socketAddress];
  const candidate = chain[Math.max(0, chain.length - 1 - trustedHops)];
  if (!candidate) return null;
  const mapped = candidate.startsWith("::ffff:") ? candidate.slice(7) : candidate;
  return isIP(mapped) ? mapped : null;
}

/** 复制一份请求，把计算出的客户端地址写进专用请求头（覆盖客户端自带的值）。 */
export function withClientIpHeader(request: Request, clientIp: string): Request {
  const headers = new Headers(request.headers);
  headers.set(CLIENT_IP_HEADER, clientIp);
  return new Request(request, { headers });
}

interface NodeBindings {
  incoming?: { socket?: { remoteAddress?: string } };
  server?: NodeBindings;
}

/** 从 @hono/node-server 提供的连接信息里取直连地址（测试里由调用方传入同样形状的 env）。 */
export function socketAddressOf(env: unknown): string | undefined {
  const bindings = (env ?? {}) as NodeBindings;
  return (bindings.server ?? bindings).incoming?.socket?.remoteAddress;
}
