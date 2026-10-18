import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 演示站是纯静态站点：不运行服务端代码，所有数据来自 public/demo-fixtures 的录制数据。
  output: "export",
  // 界面包与演示数据包直接以 TypeScript 源码发布，由 Next 编译。
  transpilePackages: ["@mingxi/ui", "@mingxi/demo-data"],
};

export default nextConfig;
