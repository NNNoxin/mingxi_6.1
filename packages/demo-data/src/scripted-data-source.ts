/**
 * 演示站数据源：回放从 demo 5 基准版本录制的接口响应（录制方式见 scripts/record-baseline-fixtures.ts）。
 *
 * - 与输入无关的请求（笔记库、个人习得、梳逻辑记忆、评测、用途建议）：返回录制结果；笔记库搜索按基准接口
 *   app/api/mingxi/library/route.ts 的同一逻辑在浏览器里过滤。
 * - 梳逻辑：请求与录制范围（样例意图 × 模式 × 档位、60 篇笔记的“开梳逻辑线”按钮）完全一致时返回录制结果。
 * - 其余需要后端或模型的自由输入（追问、自定义问题、附件、捕获、写回等）：按决策 D5a 返回明确的“演示站离线”
 *   失败，由组件在原界面已有的错误位置展示。不调用任何网络接口以外的服务，也不伪造结果。
 */
import type {
  CaptureData,
  EvalRunData,
  LibraryListData,
  LibraryListQuery,
  MingxiDataSource,
  OrganizeData,
  PortErrorBody,
  PortResult,
  ProfileData,
  PurposeSuggestionData,
  ThinkMemoryData,
  ThinkTurnData,
  ThinkTurnRequest,
} from "@mingxi/ui/data-source/port";
import { thinkFixtureKey } from "./think-key";

export const DEMO_OFFLINE_MESSAGE = "演示站为离线演示，这里只回放样例；自由输入请到正式站体验。";

/** 与基准版本 think/route.ts 一致的默认演示意图（界面预填并一键发送的那句）。 */
const DEMO_AGENT_INTENT = "把库里关于 Agent 评测与 Skill 落地的避雷和正例，梳成一条可执行的学习逻辑线";

type LibraryNoteRecord = NonNullable<LibraryListData["notes"]>[number];

interface LibraryFixture {
  liveCount: number;
  silverCount: number;
  notes: LibraryNoteRecord[];
}

interface ThinkFixtureFile {
  status: number;
  data: ThinkTurnData;
}

export interface ScriptedDataSourceOptions {
  /** 录制数据的静态地址前缀，例如 "/demo-fixtures"。 */
  fixtureBaseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function offline<T extends PortErrorBody>(): PortResult<T> {
  return { ok: false, status: 501, data: { error: DEMO_OFFLINE_MESSAGE, code: "demo_offline" } as T };
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** 深拷贝录制数据，避免组件修改返回对象时污染缓存。 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

export class ScriptedDataSource implements MingxiDataSource {
  readonly kind = "scripted" as const;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(options: ScriptedDataSourceOptions) {
    this.base = options.fixtureBaseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  private load<T>(path: string, signal?: AbortSignal): Promise<T> {
    const cached = this.cache.get(path);
    if (cached) return cached as Promise<T>;
    const pending = this.fetchImpl(`${this.base}/${path}`, signal ? { signal } : undefined).then(
      async (response) => {
        if (!response.ok) throw new Error(`演示数据 ${path} 加载失败（HTTP ${response.status}）`);
        return (await response.json()) as T;
      },
    );
    // 失败（含取消）不缓存，下次重新加载。
    pending.catch(() => this.cache.delete(path));
    this.cache.set(path, pending);
    return pending;
  }

  async listLibrary(query: LibraryListQuery): Promise<PortResult<LibraryListData>> {
    const library = await this.load<LibraryFixture>("library.json");
    const q = (query.q ?? "").trim().toLowerCase();
    const notes = q
      ? library.notes.filter((n) =>
          `${n.title} ${n.summary} ${n.preview} ${n.domainPath.join(" ")} ${n.tags.join(" ")}`
            .toLowerCase()
            .includes(q),
        )
      : library.notes;
    const purposes = new Map<string, number>();
    for (const note of notes) purposes.set(note.purposeLabel, (purposes.get(note.purposeLabel) ?? 0) + 1);
    return {
      ok: true,
      status: 200,
      data: clone({
        version: "merged-library",
        count: notes.length,
        liveCount: library.liveCount,
        silverCount: library.silverCount,
        purposes: Object.fromEntries(purposes),
        notes,
      }),
    };
  }

  async getProfile(): Promise<PortResult<ProfileData>> {
    return { ok: true, status: 200, data: clone(await this.load<ProfileData>("profile.json")) };
  }

  profileAction() {
    return Promise.resolve(offline());
  }

  async thinkTurn(
    request: ThinkTurnRequest,
    options?: { signal?: AbortSignal },
  ): Promise<PortResult<ThinkTurnData>> {
    const signal = options?.signal;
    if (signal?.aborted) throw abortError();
    const message = request.message.trim();
    const scripted =
      !request.sessionId &&
      !request.history?.length &&
      !request.attachments?.length &&
      !request.lockedNodeIds?.length &&
      !request.scopeNodeId &&
      !request.intentHint &&
      !request.webSearch;
    if (!scripted) return offline();
    const agentMode = request.agentMode ?? "agent";
    const thinkLevel = request.thinkLevel ?? "high-fast";
    const demo = Boolean(request.demo);
    const key = thinkFixtureKey({
      message,
      demo,
      agentMode,
      thinkLevel,
      webSearch: false,
      demoContext:
        demo ||
        message === DEMO_AGENT_INTENT ||
        thinkLevel === "demo" ||
        Boolean(request.workspaceId?.startsWith("ws-sample")),
    });
    const index = await this.load<Record<string, { file: string }>>("think-index.json", signal);
    const entry = index[key];
    if (!entry) return offline();
    const fixture = await this.load<ThinkFixtureFile>(entry.file, signal);
    if (signal?.aborted) throw abortError();
    return {
      ok: fixture.status >= 200 && fixture.status < 300,
      status: fixture.status,
      data: clone(fixture.data),
    };
  }

  approveLine() {
    return Promise.resolve(offline());
  }

  rejectLine() {
    return Promise.resolve(offline());
  }

  async getThinkMemory(): Promise<PortResult<ThinkMemoryData>> {
    return { ok: true, status: 200, data: clone(await this.load<ThinkMemoryData>("think-memory.json")) };
  }

  putThinkMemory(): Promise<PortResult<PortErrorBody>> {
    // 基准版本在演示部署里同样无法写入服务端记忆（软失败），界面以浏览器 localStorage 为准。
    return Promise.resolve({
      ok: true,
      status: 200,
      data: { error: DEMO_OFFLINE_MESSAGE, code: "demo_offline" },
    });
  }

  async suggestPurpose(noteId: string): Promise<PortResult<PurposeSuggestionData>> {
    const suggestions = await this.load<Record<string, PurposeSuggestionData>>("purpose-suggestions.json");
    const suggestion = suggestions[noteId];
    if (!suggestion)
      return { ok: false, status: 404, data: { error: "note not found", code: "NOTE_NOT_FOUND" } };
    return { ok: true, status: 200, data: clone(suggestion) };
  }

  confirmPurpose() {
    return Promise.resolve(offline());
  }

  organizeNote() {
    return Promise.resolve(offline<OrganizeData>());
  }

  writeBackLookup() {
    return Promise.resolve(offline());
  }

  capture() {
    return Promise.resolve(offline<CaptureData>());
  }

  async runEval(): Promise<PortResult<EvalRunData>> {
    const report = await this.load<EvalRunData>("eval.json");
    // 基准版本每次运行时记录 ranAt 为当前时间。
    return { ok: true, status: 200, data: { ...clone(report), ranAt: this.now().toISOString() } };
  }
}
