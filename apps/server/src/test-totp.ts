import { createHmac } from "node:crypto";

// 测试用的 TOTP 计算（RFC 6238：HMAC-SHA1、30 秒一步、6 位），模拟用户手机上的验证器 App。

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
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

export function totpCode(key: Buffer, atMs = Date.now(), digits = 6, stepSeconds = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / stepSeconds)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** 从开启两步验证时返回的 otpauth:// 地址里取出密钥，算出当前的验证码。 */
export function totpFromUri(uri: string, atMs = Date.now()): string {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error(`otpauth 地址里没有 secret：${uri}`);
  return totpCode(base32Decode(secret), atMs);
}
