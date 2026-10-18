import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { MingxiDataSource } from "@mingxi/ui/data-source/port";
import { describe, expect, it } from "vitest";
import { DEMO_OFFLINE_MESSAGE, ScriptedDataSource } from "./scripted-data-source";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** 用磁盘上真实的录制数据模拟静态站点：/demo-fixtures/<path> → fixtures/<path>。 */
function fixtureFetch(): typeof fetch {
  return async (input, init) => {
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const href = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    const url = new URL(href, "http://demo.local");
    const path = decodeURIComponent(url.pathname.replace(/^\/demo-fixtures\//, ""));
    try {
      return new Response(await readFile(`${FIXTURES}${path}`, "utf8"), { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  };
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(`${FIXTURES}${path}`, "utf8")) as T;
}

/** 组件只通过端口接口使用数据源，测试也按接口调用（写入类方法在实现里不读取参数）。 */
function createSource(now = new Date("2026-08-09T02:00:00.000Z")): MingxiDataSource {
  return new ScriptedDataSource({
    fixtureBaseUrl: "/demo-fixtures",
    fetchImpl: fixtureFetch(),
    now: () => now,
  });
}

const DEMO_INTENT = "把库里关于 Agent 评测与 Skill 落地的避雷和正例，梳成一条可执行的学习逻辑线";

describe("笔记库", () => {
  it("不带搜索词时与原版接口响应逐字一致", async () => {
    const recorded = await json<Record<string, unknown>>("library.json");
    const result = await createSource().listLibrary({});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(recorded);
  });

  it("带搜索词时与原版接口对同一搜索词的响应逐字一致", async () => {
    const recorded = await json<Record<string, unknown>>("library-queries.verification.json");
    const source = createSource();
    for (const [q, expected] of Object.entries(recorded)) {
      const result = await source.listLibrary({ q: q.trim() });
      expect(result.data, `q=${q}`).toEqual(expected);
    }
  });

  it("返回的是副本，组件修改不会污染后续结果", async () => {
    const source = createSource();
    const first = await source.listLibrary({});
    first.data.notes?.splice(0, 10);
    const second = await source.listLibrary({});
    expect(second.data.notes).toHaveLength(60);
  });
});

describe("梳逻辑", () => {
  const base = {
    message: DEMO_INTENT,
    demo: true,
    mode: "agent" as const,
    agentMode: "agent" as const,
    thinkLevel: "high-fast",
    webSearch: false,
    sessionId: null,
    workspaceId: "ws-sample-agent-skill",
    attachments: [],
    lockedNodeIds: [],
  };

  it("样例意图命中录制结果", async () => {
    const result = await createSource().thinkTurn(base);
    expect(result.ok).toBe(true);
    expect(result.data.logicLine?.nodes?.length).toBeGreaterThan(0);
    expect(result.data.answer).toBeTruthy();
  });

  it("非样例工作区带 demo 标记时与样例工作区同一结果（与原版服务端判定一致）", async () => {
    const source = createSource();
    const sample = await source.thinkTurn(base);
    const blank = await source.thinkTurn({ ...base, workspaceId: "ws-blank-1" });
    expect(blank.data).toEqual(sample.data);
  });

  it("笔记“开梳逻辑线”按钮命中录制结果", async () => {
    const library = await json<{ notes: { title: string }[] }>("library.json");
    const title = library.notes[3]?.title ?? "";
    const result = await createSource().thinkTurn({
      ...base,
      demo: false,
      message: `围绕「${title}」相关笔记，梳一条可用的逻辑线`,
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ["自定义问题", { message: "帮我梳理一下 RAG 的发展" }],
    ["带会话的追问", { sessionId: "think_abc" }],
    ["带附件", { attachments: [{ name: "a.md", size: 1, type: "text/markdown", text: "x" }] }],
    ["锁定节点", { lockedNodeIds: ["n1"] }],
    ["局部重生成", { scopeNodeId: "n1" }],
    ["意图快捷", { intentHint: "lookup" as const }],
    ["联网", { webSearch: true }],
    ["回忆界面的对话历史", { history: [{ role: "user" as const, content: "上一句" }] }],
  ])("%s → 明确返回“演示站离线”", async (_label, override) => {
    const result = await createSource().thinkTurn({ ...base, ...override });
    expect(result).toMatchObject({
      ok: false,
      status: 501,
      data: { error: DEMO_OFFLINE_MESSAGE, code: "demo_offline" },
    });
  });

  it("已取消的请求抛出 AbortError（组件据此显示“已停止生成”）", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createSource().thinkTurn(base, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("其余接口", () => {
  it("个人习得与梳逻辑记忆回放录制结果", async () => {
    const source = createSource();
    expect((await source.getProfile()).data).toEqual(await json("profile.json"));
    expect((await source.getThinkMemory()).data).toEqual(await json("think-memory.json"));
  });

  it("评测结果回放录制数据，运行时间取调用时刻", async () => {
    const now = new Date("2026-08-09T02:30:00.000Z");
    const result = await createSource(now).runEval();
    const recorded = await json<Record<string, unknown>>("eval.json");
    expect(result.data).toEqual({ ...recorded, ranAt: now.toISOString() });
  });

  it("用途建议按笔记返回录制结果，未知笔记 404", async () => {
    const source = createSource();
    const suggestions = await json<Record<string, unknown>>("purpose-suggestions.json");
    const [noteId, expected] = Object.entries(suggestions)[0] ?? [];
    expect((await source.suggestPurpose(String(noteId))).data).toEqual(expected);
    expect(await source.suggestPurpose("missing")).toMatchObject({ ok: false, status: 404 });
  });

  it("写入类请求一律明确返回“演示站离线”", async () => {
    const source = createSource();
    for (const result of [
      await source.capture({
        text: "x",
        purposeLabel: "待定",
        enrichVision: false,
        tag: true,
        persist: true,
      }),
      await source.organizeNote({ noteId: "n", purpose: "学习理论", confirmOnly: false }),
      await source.confirmPurpose({ noteId: "n", purpose: "学习理论", action: "confirm" }),
      await source.approveLine({ sessionId: "s", pendingId: null }),
      await source.rejectLine({ sessionId: "s", pendingId: null }),
      await source.profileAction({ action: "rollback", entryId: "e" }),
    ]) {
      expect(result).toMatchObject({ ok: false, status: 501, data: { code: "demo_offline" } });
    }
  });
});
