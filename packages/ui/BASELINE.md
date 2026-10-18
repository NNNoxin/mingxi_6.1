# packages/ui 基准与偏离清单

本包是明晰 demo 5 界面的**原样迁移**，对应需求清单 B1、B2 与 CLAUDE.md 红线 1。

- 来源仓库：`noxinsun-source/mingxi-demo-5`
- 基准提交：`81f92d7`（2026-08-09 公开版，决策 D2）
- 导入方式：`scripts/import-baseline.mjs` 逐文件复制，文件清单与每个文件改写的导入数见 `baseline-manifest.json`
- 范围：从三个产品路由（`/demo`、`/demo/phone`、`/mingxi/web`）与根布局出发，按依赖关系闭包得到的全部界面文件（43 个）。原版的后端代码（`app/api`、`lib/mingxi/agent`、`engine`、`pi-agent` 等）不属于界面，不迁移（docs/01 §8）。

## 校验方式

1. **逐字校验**：导入后逐行比对原文件，只允许导入语句不同（首次导入：43 个文件、21 行导入语句不同，其余逐字节一致）。
2. **视觉回归**：`e2e` 包对原版与新版在相同条件下逐步走完 41 步产品导览，逐像素比较（docs/00 B1）。

## 偏离清单（每一处对原文件的改动都必须登记）

| # | 文件 | 改动 | 类别（docs/02 §1.4） | 是否影响渲染 | 提交 |
|---|---|---|---|---|---|
| 1 | 21 处导入语句（见 manifest） | `@/…` 别名改为包内相对路径 | 1 · 导入路径 | 否 | 首次导入 |
| 2 | `src/types/ambient.d.ts`（新增） | 声明原版由 Next 自动生成的全局类型与 `*.css` 副作用导入 | 新增类型声明，不改原文件 | 否 | 首次导入 |
| 3 | `src/data-source/port.ts`、`src/data-source/context.tsx`（新增） | 数据源端口接口与 React Provider | 2 · 数据源接缝 | 否 | `5e2cff4` |
| 4 | `tsconfig.build.json`（新增）、`package.json` 导出 | 只生成类型声明供其他包做类型检查；运行时仍直接使用源文件 | 构建配置，不改原文件 | 否 | `5e2cff4` |
| 5 | `WebWorkbench.tsx`（9 处）、`ProductAgentPanels.tsx`（5 处）、`ThinkLogicReplayDemo.tsx`（1 处） | 15 处 `fetch("/api/mingxi/…")` + `res.json()` 改为 `useMingxiDataSource()` 的对应方法，请求内容逐字段不变，`res.ok` / `res.status` / 错误体的判断分支不变；组件开头取一次数据源，`loadLibrary`、`loadProfile` 与用途建议的依赖数组加入 `dataSource`（引用固定，不会多触发）；用途建议、用途确认两处原来对 `res.json()` 结果的内联类型断言由端口类型代替 | 2 · 数据源接缝 | 否 | 本次提交 |
| 6 | `package.json` | 声明 `tailwindcss` 依赖：`styles/globals.css` 第一行 `@import "tailwindcss"`，样式文件现在在本包里，从本包解析 | 依赖声明，不改原文件 | 否 | 本次提交 |

保留未改的两处 `fetch`：`WebWorkbench.tsx` 读取静态样例 `/data/mingxi-think-samples.json`、`NoteMediaView.tsx` 读取笔记快照，二者都是站点自带的静态文件，不是后端接口。
