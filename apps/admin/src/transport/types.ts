import type { transport } from "@admin/transport";

/**
 * 传输层的类型，来自 module.d.ts 的声明（只定义一处）。两种模式下，响应的解析与契约校验都是同一份代码
 * （api.ts、auth-client.ts）；live.ts 与 demo.ts 都声明为这个类型，实现与声明不一致时类型检查失败。
 */
export type AdminTransport = typeof transport;
