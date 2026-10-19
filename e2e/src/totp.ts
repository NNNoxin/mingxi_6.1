import { createHmac } from "node:crypto";

// 端到端测试里模拟用户手机上的验证器 App（RFC 6238：HMAC-SHA1、30 秒一步、6 位）。
// 与 apps/server/src/test-totp.ts 是同一算法；两个包互不依赖源码，各自保留一份并各自用 RFC 测试向量校验。

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`不是 base32 字符：${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(key: Buffer, atMs = Date.now(), digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}
