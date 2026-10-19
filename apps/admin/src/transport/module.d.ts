// “@admin/transport” 只由构建配置决定指向哪个实现（next.config.ts 的 webpack 别名：live.ts 或 demo.ts）。
// 不用 tsconfig 的 paths：Next 也会按 paths 解析模块，并且优先于别名，演示版会被悄悄换回正式传输层。
declare module "@admin/transport" {
  /**
   * 后台访问服务端的唯一出口（docs/05 §12.5）：
   * - live：浏览器的 fetch，请求经后台站点的转发到达服务端；
   * - demo：页面内的演示服务，返回与服务端同样形状的响应，不发任何网络请求。
   */
  export const transport: {
    mode: "live" | "demo";
    send: (url: string, init?: RequestInit) => Promise<Response>;
  };
}
