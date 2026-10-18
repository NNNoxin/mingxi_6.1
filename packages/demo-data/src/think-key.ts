/**
 * 梳逻辑录制数据的匹配键。只有完全由界面给出的请求才会命中录制（docs/00 D5a）：
 * 带会话（追问）、附件、锁定节点、局部重生成、意图快捷、联网的请求都不在录制范围内。
 */
export interface ThinkFixtureKeyInput {
  message: string;
  demo: boolean;
  agentMode: string;
  thinkLevel: string;
  webSearch: boolean;
  /** 基准服务端的“演示上下文”判定（think/route.ts 的 isDemo）：demo 标记、默认演示意图、Demo 档位或样例工作区。 */
  demoContext: boolean;
}

/** FNV-1a 64 位哈希（十六进制）。浏览器与 Node 中结果一致，不依赖异步加密接口。 */
function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function thinkFixtureKey(input: ThinkFixtureKeyInput): string {
  return fnv1a64(
    JSON.stringify([
      input.message.trim(),
      input.demo,
      input.agentMode,
      input.thinkLevel,
      input.webSearch,
      input.demoContext,
    ]),
  );
}
