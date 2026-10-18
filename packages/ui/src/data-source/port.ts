/**
 * 界面数据端口（Port）。
 *
 * demo 5 的组件原本直接 fetch 一组 /api/mingxi/* 接口。为了让同一份界面既能跑演示站（回放录制数据）
 * 又能跑正式站（真实后端），这些调用统一改为通过本接口完成（docs/02 §1.2–§1.4）。
 *
 * 约定（与原 fetch 语义一一对应，保证组件里的判断分支不变）：
 * - 服务端处理了请求但返回失败 → resolve，ok 为 false，status 为对应状态码，data 为错误体；
 * - 请求没能完成（断网、超时、被取消）→ reject；被 AbortSignal 取消时抛出 name 为 "AbortError" 的错误。
 * - data 的形状就是原接口返回的 JSON（类型按组件实际读取的字段定义）。
 */
import type { LibraryNote } from "../components/mingxi/WebWorkbench";
import type {
  DecisionCardView,
  EvalReportView,
  LookupCardView,
  PurposeCandidateView,
} from "../components/mingxi/ProductAgentPanels";
import type { ThinkApiEdge, ThinkApiNode, ThinkApiResponse } from "../lib/mingxi/web/think-replay-live";

export interface PortResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export interface PortErrorBody {
  error?: string;
  code?: string;
}

export interface LibraryListQuery {
  q?: string;
}

export interface LibraryListData extends PortErrorBody {
  version?: string;
  count?: number;
  liveCount?: number;
  silverCount?: number;
  purposes?: Record<string, number>;
  notes?: LibraryNote[];
}

export interface ProfileEntryView {
  id: string;
  statement: string;
}

export interface ProfileData extends PortErrorBody {
  ok?: boolean;
  autoLearnedWeek?: number;
  signalCount?: number;
  active?: ProfileEntryView[];
  pending?: ProfileEntryView[];
  negativeConstraints?: string[];
}

export type ProfileActionRequest =
  { action: "rollback"; entryId: string } | { action: "tag_choice"; purpose: string };

export interface ProfileActionData extends PortErrorBody {
  ok?: boolean;
}

export interface ThinkAttachment {
  name: string;
  size: number;
  type: string;
  text?: string;
  dataUrl?: string;
}

export interface ThinkTurnRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  demo?: boolean;
  mode?: "agent" | "llm_graph";
  agentMode?: "agent" | "ask" | "plan";
  thinkLevel?: string;
  webSearch?: boolean;
  sessionId?: string | null;
  workspaceId?: string;
  workspaceTitle?: string;
  workspaceSubtitle?: string;
  attachments?: ThinkAttachment[];
  lockedNodeIds?: string[];
  scopeNodeId?: string;
  intentHint?: "reline" | "lookup" | "decide";
}

export interface HarnessStepView {
  tool: string;
  summary: string;
  status: string;
}

export interface ThinkTurnData extends ThinkApiResponse {
  code?: string;
  lookupCard?: LookupCardView | null;
  decisionCard?: DecisionCardView | null;
  ingest?: { warnings?: string[]; noteIds?: string[] };
  harness?: {
    planner?: string;
    intent?: string;
    tools?: string[];
    steps?: HarnessStepView[];
    webSearchUsed?: boolean;
  };
  angle?: { order: string; groupBy: string; confidence?: number };
  diff?: { added?: string[]; moved?: string[]; lockedKept?: string[] } | null;
  pending?: { sessionId: string; pendingId: string | null; summary?: string } | null;
}

export interface LineDecisionRequest {
  sessionId: string;
  pendingId: string | null;
}

export interface ApproveLineData extends PortErrorBody {
  ok?: boolean;
  logicLine?: ThinkTurnData["logicLine"];
}

export interface RejectLineData extends PortErrorBody {
  ok?: boolean;
}

export interface ThinkMemoryData extends PortErrorBody {
  ok?: boolean;
  workspaces?: unknown[];
  activeWsId?: string;
}

export interface ThinkMemoryPutRequest {
  workspace: unknown;
  activeWsId: string;
  interaction?: { kind: string; workspaceId: string; utterance?: string; detail: string };
}

export interface PurposeSuggestionData extends PortErrorBody {
  title?: string;
  pending?: boolean;
  purposeLabel?: string;
  candidates?: Partial<PurposeCandidateView>[];
}

export interface PurposeConfirmRequest {
  noteId: string;
  purpose: string;
  action: "confirm";
}

export interface PurposeConfirmData extends PortErrorBody {
  purposeLabel?: string;
  note?: { id: string; title: string; purposeLabel: string };
}

export interface OrganizeRequest {
  noteId: string;
  purpose: string;
  confirmOnly: boolean;
}

export interface OrganizeData extends PortErrorBody {
  purposeLabel: string;
  stanceOk?: boolean;
  piece?: {
    recipe?: string;
    blocks?: { role: string; text: string; citations?: unknown[]; flag?: string }[];
  };
}

export interface LookupWriteBackRequest {
  sessionId: string;
  card: LookupCardView;
  approved: boolean;
}

export interface LookupWriteBackData extends PortErrorBody {
  summary?: string;
  /** 成功时总是带完整的图（原接口 lookup/writeback 用 lineToLogicGraph 生成，没有时为空数组）。 */
  logicLine?: { nodes: ThinkApiNode[]; edges: ThinkApiEdge[] };
}

export interface CaptureRequest {
  url?: string;
  text?: string;
  purposeLabel: string;
  enrichVision: boolean;
  tag: boolean;
  persist: boolean;
}

export interface CaptureData extends PortErrorBody {
  materialId?: string;
  domainPath?: string[];
  /** 成功时是入库后的笔记（原接口 capture 返回 runCapturePipeline 的 note，带 id）。 */
  note?: { id: string; title?: string; purposeLabel?: string } & Record<string, unknown>;
}

export type EvalRunData = EvalReportView & PortErrorBody;

export interface MingxiDataSource {
  /** 数据源类型：演示站回放录制数据，正式站调用真实后端。 */
  readonly kind: "scripted" | "live";
  listLibrary(query: LibraryListQuery): Promise<PortResult<LibraryListData>>;
  getProfile(): Promise<PortResult<ProfileData>>;
  profileAction(request: ProfileActionRequest): Promise<PortResult<ProfileActionData>>;
  thinkTurn(
    request: ThinkTurnRequest,
    options?: { signal?: AbortSignal },
  ): Promise<PortResult<ThinkTurnData>>;
  approveLine(request: LineDecisionRequest): Promise<PortResult<ApproveLineData>>;
  rejectLine(request: LineDecisionRequest): Promise<PortResult<RejectLineData>>;
  getThinkMemory(): Promise<PortResult<ThinkMemoryData>>;
  putThinkMemory(request: ThinkMemoryPutRequest): Promise<PortResult<PortErrorBody>>;
  suggestPurpose(noteId: string): Promise<PortResult<PurposeSuggestionData>>;
  confirmPurpose(request: PurposeConfirmRequest): Promise<PortResult<PurposeConfirmData>>;
  organizeNote(request: OrganizeRequest): Promise<PortResult<OrganizeData>>;
  writeBackLookup(request: LookupWriteBackRequest): Promise<PortResult<LookupWriteBackData>>;
  capture(request: CaptureRequest): Promise<PortResult<CaptureData>>;
  runEval(): Promise<PortResult<EvalRunData>>;
}
