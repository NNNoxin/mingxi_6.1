# apps/demo 基准与偏离清单

演示站（决策 D1）：明晰 demo 5 的界面原样运行，数据全部来自从原版录制的接口响应（`packages/demo-data`），静态导出，不调用任何后端。对应需求清单 B1、B2、D5a 与 CLAUDE.md 红线 1、4。

- 来源仓库：`noxinsun-source/mingxi-demo-5`，基准提交 `81f92d7`（决策 D2）
- 导入方式：`scripts/import-baseline.ts` 复制产品导览经过的三个路由（`/demo`、`/demo/phone`、`/mingxi/web`）、根布局、根路由与整个 `public/`；每个文件的 sha256 与导入改写数见 `baseline-manifest.json`
- 界面组件本身在 `packages/ui`（偏离见 `packages/ui/BASELINE.md`）

## 偏离清单（每一处对原文件的改动都必须登记）

| # | 文件 | 改动 | 类别（docs/02 §1.4） | 是否影响渲染 | 提交 |
|---|---|---|---|---|---|
| 1 | 6 个路由文件共 10 处导入 | `@/…` 改为 `@mingxi/ui/…`；`./globals.css` 改为界面包里的同一文件 | 1 · 导入路径 | 否 | 本次提交 |
| 2 | `app/layout.tsx` | 页面内容与导览外面包一层 `DemoDataSourceProvider`（注入 `ScriptedDataSource`），不产生任何 DOM | 2 · 数据源接缝 | 否 | 本次提交 |
| 3 | `app/mingxi/web/page.tsx` | `generateMetadata` 原本读请求头拼 Open Graph 图片的绝对地址；静态导出没有请求，改为读构建时的 `MINGXI_PUBLIC_URL`（缺失即构建失败）。只影响 `<head>` 里的分享元数据 | 框架适配（静态导出） | 否 | 本次提交 |

## 构建方式与原因

- **Next.js 16 静态导出，构建器用 webpack**（`next build --webpack`）：`web-workbench.css` 第一行 `@import` 了 Google Fonts 的远程样式表（DM Sans、Instrument Serif）。实测 Turbopack 会丢掉这条导入，工作台字体退回系统字体，第 15–40 步像素差 1%–7%；webpack 与原版的 Vite 一样把它原样保留为独立样式表的第一行，改用 webpack 后差异归零。
- **Tailwind 从仓库根目录扫描**（`postcss.config.mjs`）：原版从它自己的仓库根目录自动扫描类名，界面代码现在在 `packages/ui`，扫描起点同样设为仓库根目录。
- **录制数据**：构建前 `scripts/sync-fixtures.ts` 把 `packages/demo-data/fixtures` 复制到 `public/demo-fixtures`（不入库）。
- **静态托管规则**：`/a/b` 依次找 `a/b`、`a/b.html`、`a/b/index.html`，找不到返回 `404.html`；本地由 `scripts/serve-static.ts` 实现，线上托管按同样规则配置（P9）。
- `public/` 原样保留原版的全部静态资源，包括原版自己已不再引用的文件（`demo/mingxi-product-demo.html`、`sw.js` 等），不做取舍。原版导航里指向 `/汇报网页/capability-eval-matrix.html` 的链接在原版里本来就是 404，保持一致。

## 校验

1. 逐字校验：路由文件与原版逐行比对，只有上表三处不同。
2. 视觉回归：`e2e` 在网络回放下对原版生产构建与演示站各走 41 步导览，DOM 快照逐项比对 + 像素比对（docs/04 P2）。
