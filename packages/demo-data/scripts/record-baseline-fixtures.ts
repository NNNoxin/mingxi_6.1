// 从运行中的 demo 5 基准版本（81f92d7）录制演示站所需的接口响应。
// 用法：pnpm --filter @mingxi/demo-data record -- --base http://localhost:4317 --baseline-dir <基准仓库目录>
//
// 录制规则：
// 1. 只录“与输入无关或输入由界面固定给出”的请求（docs/00 D5a）：笔记库、个人习得、梳逻辑记忆、评测、
//    60 篇笔记的用途建议、7 个样例意图在 3 种模式 × 4 个档位下的梳逻辑结果、60 篇笔记“用这条笔记开梳逻辑线”。
// 2. 每条梳逻辑请求录两次，去掉会话 ID 与时间戳后必须完全一致，否则中止（说明不是确定性的，不能录）。
// 3. 录制前后检查基准仓库工作目录无改动；录制会改变基准服务进程的内存状态，录完需要重启它再做视觉对比。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { thinkFixtureKey, type ThinkFixtureKeyInput } from "../src/think-key";

const BASELINE_COMMIT = "81f92d7";
const { values } = parseArgs({
  options: { base: { type: "string" }, "baseline-dir": { type: "string" } },
  allowPositionals: true,
});
if (!values.base || !values["baseline-dir"]) {
  process.stderr.write("需要 --base <基准服务地址> 与 --baseline-dir <基准仓库目录>\n");
  process.exit(2);
}
const base = values.base.replace(/\/$/, "");
const baselineDir = values["baseline-dir"];
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const workbenchSource = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../../ui/src/components/mingxi/WebWorkbench.tsx"),
  "utf8",
);

function git(...args: string[]) {
  return execFileSync("git", ["-C", baselineDir, ...args])
    .toString()
    .trim();
}
if (git("rev-parse", "--short=7", "HEAD") !== BASELINE_COMMIT)
  throw new Error(`基准仓库必须检出在 ${BASELINE_COMMIT}`);
if (git("status", "--porcelain")) throw new Error("基准仓库工作目录有改动，拒绝录制");

/** 界面里写死的样例意图（WebWorkbench 的 DEMO_AGENT_INTENT 与 THINK_SAMPLE_PRESETS），逐条校验仍在源码中。 */
const SAMPLE_PRESETS = [
  {
    id: "ws-sample-agent-skill",
    demo: true,
    intent: "把库里关于 Agent 评测与 Skill 落地的避雷和正例，梳成一条可执行的学习逻辑线",
  },
  {
    id: "ws-sample-academic-write",
    demo: false,
    intent:
      "我想模仿学术论文的写作技巧与语法表述方法：请把库里关于 Agent、RAG、Skill 的综述与论文型笔记，按问题驱动梳成一条「如何把工程经验写成可引用论述」的学习逻辑线——问题陈述 → 相关工作对照 → 方法表述句式 → 证据与局限 → 可复用措辞清单",
  },
  {
    id: "ws-sample-objection",
    demo: false,
    intent:
      "把库里关于提示词工程、Agent 评测的反例和避坑先排出来，反对意见与风险前置，再对照正例，梳一条可执行的避雷学习逻辑线",
  },
  {
    id: "ws-sample-contrast",
    demo: false,
    intent:
      "对比 Agent Skill、提示词工程与 Agentic Harness 的差异与优劣，按对标拆解梳一条学习逻辑线：各自适用场景、边界与可借鉴点",
  },
  {
    id: "ws-sample-causal",
    demo: false,
    intent:
      "从因果机制角度梳理：为什么纯文本 RAG 与间隔重复能提升效果？原因 → 机制链条 → 落地约束，结合库里相关正例与避雷",
  },
  {
    id: "ws-sample-timeline",
    demo: false,
    intent:
      "按时间线梳理从提示词工程到 Agent Skills 可安装能力包的演进历程，串起库里 Google skills、Skill 综述与情报简报，形成一条发展脉络逻辑线",
  },
  {
    id: "ws-sample-evidence",
    demo: false,
    intent:
      "按证据强度排序梳逻辑线：库里关于 RAG、BM25、评测 dirty work 的笔记，先排有实验或数据支撑的，再排经验帖，标明可信度层次",
  },
] as const;
for (const preset of SAMPLE_PRESETS) {
  if (!workbenchSource.includes(preset.intent) || !workbenchSource.includes(`"${preset.id}"`)) {
    throw new Error(`样例 ${preset.id} 的意图与 WebWorkbench.tsx 不一致`);
  }
}
const AGENT_MODES = ["agent", "ask", "plan"] as const;
const THINK_LEVELS = ["high-fast", "balanced", "deep", "demo"] as const;

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`GET ${path} → HTTP ${response.status}`);
  return response.json();
}
async function postJson(path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

const VOLATILE_KEYS = new Set([
  "sessionId",
  "pendingId",
  "at",
  "createdAt",
  "updatedAt",
  "ranAt",
  "rememberedAt",
  "generatedAt",
]);
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !VOLATILE_KEYS.has(key))
        .map(([key, item]) => [key, stripVolatile(item)]),
    );
  }
  return value;
}

await rm(fixturesDir, { recursive: true, force: true });
await mkdir(join(fixturesDir, "think"), { recursive: true });

const library = (await getJson("/api/mingxi/library")) as { notes: { id: string; title: string }[] };
await writeFile(join(fixturesDir, "library.json"), JSON.stringify(library));
// 几组带搜索词的原版响应：用于校验演示数据源在浏览器里的过滤逻辑与原版接口逐字一致（不用于回放）。
const LIBRARY_QUERIES = ["rag", "评测", " Agent ", "医疗诊断", "不存在的词组xyz"];
const libraryQueries: Record<string, unknown> = {};
for (const q of LIBRARY_QUERIES) {
  libraryQueries[q] = await getJson(`/api/mingxi/library?q=${encodeURIComponent(q.trim())}`);
}
await writeFile(join(fixturesDir, "library-queries.verification.json"), JSON.stringify(libraryQueries));
await writeFile(join(fixturesDir, "profile.json"), JSON.stringify(await getJson("/api/mingxi/profile")));
await writeFile(
  join(fixturesDir, "think-memory.json"),
  JSON.stringify(await getJson("/api/mingxi/think/memory")),
);

const evalRun = await postJson("/api/mingxi/eval");
if (evalRun.status !== 200) throw new Error(`POST /api/mingxi/eval → HTTP ${evalRun.status}`);
await writeFile(join(fixturesDir, "eval.json"), JSON.stringify(evalRun.data));

const purpose: Record<string, unknown> = {};
for (const note of library.notes) {
  purpose[note.id] = await getJson(`/api/mingxi/purpose?noteId=${encodeURIComponent(note.id)}`);
}
await writeFile(join(fixturesDir, "purpose-suggestions.json"), JSON.stringify(purpose));

interface ThinkCase extends ThinkFixtureKeyInput {
  label: string;
}
const cases: ThinkCase[] = [];
for (const preset of SAMPLE_PRESETS) {
  for (const agentMode of AGENT_MODES) {
    for (const thinkLevel of THINK_LEVELS) {
      cases.push({
        label: `样例 ${preset.id} · ${agentMode} · ${thinkLevel}`,
        message: preset.intent,
        demo: preset.demo || thinkLevel === "demo",
        agentMode,
        thinkLevel,
        webSearch: false,
        demoContext: true,
      });
    }
  }
}
for (const note of library.notes) {
  cases.push({
    label: `笔记开梳 ${note.id}`,
    message: `围绕「${note.title}」相关笔记，梳一条可用的逻辑线`,
    demo: false,
    agentMode: "agent",
    thinkLevel: "high-fast",
    webSearch: false,
    demoContext: true,
  });
}

const index: Record<string, { label: string; file: string }> = {};
for (const item of cases) {
  const key = thinkFixtureKey(item);
  // 样例上下文：基准服务端以 workspaceId 前缀 ws-sample 判断，这里固定用默认样例工作区。
  const body = {
    message: item.message,
    demo: item.demo,
    mode: item.agentMode === "ask" ? "llm_graph" : "agent",
    agentMode: item.agentMode,
    thinkLevel: item.thinkLevel,
    webSearch: item.webSearch,
    sessionId: null,
    workspaceId: "ws-sample-agent-skill",
    workspaceTitle: "可执行落地",
    workspaceSubtitle: "行动优先 · Agent 评测与 Skill",
    attachments: [],
    lockedNodeIds: [],
  };
  const first = await postJson("/api/mingxi/think", body);
  const second = await postJson("/api/mingxi/think", body);
  if (
    JSON.stringify(stripVolatile(first.data)) !== JSON.stringify(stripVolatile(second.data)) ||
    first.status !== second.status
  ) {
    throw new Error(`${item.label}：两次结果不一致，不能作为确定性录制`);
  }
  const file = `think/${key}.json`;
  await writeFile(join(fixturesDir, file), JSON.stringify({ status: first.status, data: first.data }));
  index[key] = { label: item.label, file };
  process.stdout.write(`✓ ${item.label}\n`);
}
await writeFile(join(fixturesDir, "think-index.json"), JSON.stringify(index, null, 2));

const manifest = {
  baseline: { repo: "noxinsun-source/mingxi-demo-5", commit: BASELINE_COMMIT },
  recordedFrom: base,
  recordedAt: new Date().toISOString(),
  counts: {
    notes: library.notes.length,
    purposeSuggestions: Object.keys(purpose).length,
    thinkCases: cases.length,
  },
  digest: createHash("sha256").update(JSON.stringify(index)).digest("hex"),
};
await writeFile(join(fixturesDir, "manifest.json"), JSON.stringify(manifest, null, 2));

if (git("status", "--porcelain")) throw new Error("录制后基准仓库工作目录出现改动，录制结果不可信");
process.stdout.write(`录制完成：${cases.length} 条梳逻辑、${Object.keys(purpose).length} 条用途建议\n`);
