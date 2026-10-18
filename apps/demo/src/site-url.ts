/**
 * 演示站的对外地址，用于 Open Graph 图片这类必须是绝对地址的元数据。
 * 原版在请求时读 Host 头拼出地址；静态导出没有请求，改为构建时由 MINGXI_PUBLIC_URL 提供，缺失即构建失败。
 */
export function publicSiteUrl(): string {
  const value = process.env.MINGXI_PUBLIC_URL;
  if (!value) {
    throw new Error(
      "构建演示站需要环境变量 MINGXI_PUBLIC_URL（站点对外地址，例如 https://demo.example.com）",
    );
  }
  return new URL(value).origin;
}
