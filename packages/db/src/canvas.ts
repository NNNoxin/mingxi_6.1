import type { PoolClient } from "./pool";

export class StaleCanvasRevisionError extends Error {
  readonly conversationId: string;
  readonly baseRevision: number;
  readonly currentRevision: number | null;

  constructor(conversationId: string, baseRevision: number, currentRevision: number | null) {
    super(
      currentRevision === null
        ? `会话 ${conversationId} 不存在`
        : `画布已被更新：提交基于第 ${String(baseRevision)} 版，当前是第 ${String(currentRevision)} 版`,
    );
    this.name = "StaleCanvasRevisionError";
    this.conversationId = conversationId;
    this.baseRevision = baseRevision;
    this.currentRevision = currentRevision;
  }
}

export interface CanvasRevisionInput {
  conversationId: string;
  /** 这次修改基于的版本号；与会话当前版本不一致时拒绝写入。 */
  baseRevision: number;
  nodes: unknown[];
  edges: unknown[];
  positions: Record<string, unknown>;
  createdBy: "agent" | "human";
  runId?: string | null;
}

/**
 * 写入新的画布版本（docs/02 §5.2、EC-U3）。
 * 用“基于的版本号”做比较再交换：只有会话当前版本仍是 baseRevision 时才写入 baseRevision + 1，
 * 否则抛 StaleCanvasRevisionError，由调用方拉取最新版本后重放人工操作，不会静默覆盖别人的修改。
 * 必须在 withUserTransaction 的事务里调用（user_id 由行级隔离与 app.current_user_id() 保证）。
 */
export async function commitCanvasRevision(client: PoolClient, input: CanvasRevisionInput): Promise<number> {
  const bumped = await client.query<{ revision: number }>(
    `UPDATE app.conversations
        SET current_revision = current_revision + 1
      WHERE id = $1 AND current_revision = $2
  RETURNING current_revision AS revision`,
    [input.conversationId, input.baseRevision],
  );
  const revision = bumped.rows[0]?.revision;
  if (revision === undefined) {
    const current = await client.query<{ current_revision: number }>(
      "SELECT current_revision FROM app.conversations WHERE id = $1",
      [input.conversationId],
    );
    throw new StaleCanvasRevisionError(
      input.conversationId,
      input.baseRevision,
      current.rows[0]?.current_revision ?? null,
    );
  }
  await client.query(
    `INSERT INTO app.canvas_revisions
       (user_id, conversation_id, revision, nodes, edges, positions, created_by, run_id)
     VALUES (app.current_user_id(), $1, $2, $3, $4, $5, $6, $7)`,
    [
      input.conversationId,
      revision,
      JSON.stringify(input.nodes),
      JSON.stringify(input.edges),
      JSON.stringify(input.positions),
      input.createdBy,
      input.runId ?? null,
    ],
  );
  return revision;
}
