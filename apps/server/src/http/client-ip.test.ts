import { describe, expect, it } from "vitest";
import { resolveClientIp } from "./client-ip";

describe("客户端地址", () => {
  it("直连部署不看 X-Forwarded-For（客户端可以随意伪造）", () => {
    expect(resolveClientIp("198.51.100.7", "1.2.3.4", 0)).toBe("198.51.100.7");
  });

  it("一层可信代理：取代理追加的那一项，客户端在前面伪造的值被忽略", () => {
    // 客户端发来 X-Forwarded-For: 1.2.3.4，代理追加真实地址 203.0.113.9，再以代理地址 10.0.0.2 连到本服务。
    expect(resolveClientIp("10.0.0.2", "1.2.3.4, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(resolveClientIp("10.0.0.2", "203.0.113.9", 1)).toBe("203.0.113.9");
  });

  it("配置了代理但请求绕过代理直连时，取链最左端", () => {
    expect(resolveClientIp("198.51.100.7", null, 1)).toBe("198.51.100.7");
  });

  it("IPv4 映射的 IPv6 地址还原成 IPv4；非法地址返回 null", () => {
    expect(resolveClientIp("::ffff:192.0.2.1", null, 0)).toBe("192.0.2.1");
    expect(resolveClientIp("10.0.0.2", "not-an-ip", 1)).toBeNull();
    expect(resolveClientIp(undefined, "1.2.3.4", 1)).toBeNull();
  });
});
