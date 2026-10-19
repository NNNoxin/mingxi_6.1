/**
 * 密码规则（docs/02 §4.1）：长度 8–128，拦截常见弱密码（参照 NIST SP 800-63B：与常用 / 已泄露密码表比对）。
 * 这里内置的是最常见的英文、数字与中文拼音 / 数字谐音密码；不做“必须含大写和符号”之类的组合规则。
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "0123456789",
  "87654321",
  "987654321",
  "11111111",
  "00000000",
  "88888888",
  "66666666",
  "99999999",
  "12121212",
  "11223344",
  "12341234",
  "123123123",
  "1234qwer",
  "qwer1234",
  "1qaz2wsx",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "qwertyui",
  "qwerty123",
  "qwertyuiop",
  "asdfghjk",
  "asdf1234",
  "zxcvbnm1",
  "zxcvbnm123",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "admin123",
  "admin1234",
  "administrator",
  "abcd1234",
  "abc12345",
  "abcdefgh",
  "aaaaaaaa",
  "a1234567",
  "a12345678",
  "a123456789",
  "iloveyou",
  "iloveyou1",
  "welcome1",
  "welcome123",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "dragon123",
  "monkey123",
  "letmein1",
  "trustno1",
  "superman",
  "starwars",
  "computer",
  "internet",
  "whatever",
  "11111111a",
  "aa123456",
  "aa12345678",
  "woaini1314",
  "woaini520",
  "woaini123",
  "5201314520",
  "52013145",
  "1314520520",
  "13145200",
  "woainima",
  "wodemima",
  "mima1234",
  "mima123456",
  "zhang123",
  "wang1234",
  "li123456",
  "qq123456",
  "qq12345678",
  "a5201314",
  "z123456789",
  "q1w2e3r4",
  "123qweasd",
  "qweasdzxc",
  "1qazxsw2",
  "zaq12wsx",
  "123456aa",
  "123456abc",
  "abc123456",
  "abcabc123",
  "xiaoming",
  "nihao123",
  "huang123",
  "dearbook",
  "mingxi123",
  "mingxi1234",
  "12345678a",
  "123456789a",
]);

export interface PasswordContext {
  email: string;
  name?: string;
}

/** 返回不符合规则的原因；符合时返回 null。 */
export function passwordProblem(password: string, context: PasswordContext): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `密码至少 ${String(MIN_PASSWORD_LENGTH)} 位`;
  if (password.length > MAX_PASSWORD_LENGTH) return `密码最多 ${String(MAX_PASSWORD_LENGTH)} 位`;
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered)) return "这个密码太常见了，换一个更难猜的";
  if (new Set(lowered).size <= 2) return "密码不能只由一两个字符重复组成";
  const localPart = context.email.split("@")[0]?.toLowerCase() ?? "";
  if (localPart.length >= 4 && lowered.includes(localPart)) return "密码不能包含邮箱用户名";
  const name = context.name?.trim().toLowerCase() ?? "";
  if (name.length >= 4 && lowered.includes(name)) return "密码不能包含昵称";
  return null;
}
