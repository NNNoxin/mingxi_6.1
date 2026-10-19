import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountUnavailableError, assertAccountActive } from "./accounts";
import { commitCanvasRevision, StaleCanvasRevisionError } from "./canvas";
import type { Pool, PoolClient } from "./pool";
import { inspectCurrentRole } from "./db-roles";
import { prepareIntegrationDatabase, type IntegrationDatabase } from "./testing";
import { withUserTransaction } from "./user-context";

// 数据层隔离与约束（docs/02 §3、§4.4，docs/04 P3 验收）。全部通过运行时账号连接执行，权限与生产相同。

let db: IntegrationDatabase;
let app: Pool;

interface Fixture {
  userId: string;
  workspaceId: string;
  noteId: string;
  conversationId: string;
}

let alice: Fixture;
let bob: Fixture;

/** 确定性的单位向量：第 i 维为 1，其余为 0（第 0 维附近的向量彼此接近）。 */
function basis(index: number, noise = 0): string {
  const values = Array.from({ length: 1024 }, (_, i) => (i === index ? 1 : i === 0 ? noise : 0));
  return `[${values.join(",")}]`;
}

let fixtureCounter = 0;

async function createFixture(name: string): Promise<Fixture> {
  fixtureCounter += 1;
  const email = `${name}-${String(Date.now())}-${String(fixtureCounter)}@example.com`;
  const { rows } = await app.query<{ id: string }>(
    "INSERT INTO auth.users (name, email) VALUES ($1, $2) RETURNING id",
    [name, email],
  );
  const userId = rows[0]?.id;
  if (!userId) throw new Error("创建用户失败");
  return withUserTransaction(app, userId, async (client) => {
    const workspace = await client.query<{ id: string }>(
      "INSERT INTO app.workspaces (user_id, name) VALUES ($1, '个人空间') RETURNING id",
      [userId],
    );
    const workspaceId = workspace.rows[0]?.id ?? "";
    const note = await client.query<{ id: string }>(
      `INSERT INTO app.notes (user_id, workspace_id, title, modality, content_hash, origin)
       VALUES ($1, $2, $3, 'webpage', $4, 'upload') RETURNING id`,
      [userId, workspaceId, `${name} 的笔记`, "a".repeat(63) + String(fixtureCounter % 10)],
    );
    const noteId = note.rows[0]?.id ?? "";
    const conversation = await client.query<{ id: string }>(
      "INSERT INTO app.conversations (user_id, workspace_id, kind) VALUES ($1, $2, 'logic') RETURNING id",
      [userId, workspaceId],
    );
    return { userId, workspaceId, noteId, conversationId: conversation.rows[0]?.id ?? "" };
  });
}

beforeAll(async () => {
  db = await prepareIntegrationDatabase("mingxi-db-isolation-test");
  app = db.appPool;
  alice = await createFixture("alice");
  bob = await createFixture("bob");
});

afterAll(async () => {
  await db.close();
});

describe("运行时账号", () => {
  it("不是超级用户、不带 BYPASSRLS，并继承 mingxi_runtime", async () => {
    const info = await inspectCurrentRole(app);
    expect(info).toMatchObject({
      superuser: false,
      bypassRls: false,
      inheritsRuntimeGroup: true,
      inheritsAdminGroup: false,
    });
  });
});

describe("隔离策略覆盖", () => {
  it("app / memory 的每张表、ops 的用户数据表都启用并强制行级隔离，且有 owner_isolation 策略", async () => {
    const { rows } = await db.ownerPool.query<{
      table: string;
      rls: boolean;
      forced: boolean;
      has_user_id: boolean;
      has_policy: boolean;
    }>(
      `SELECT n.nspname || '.' || c.relname AS table,
              c.relrowsecurity AS rls,
              c.relforcerowsecurity AS forced,
              EXISTS (SELECT 1 FROM pg_attribute a
                       WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped) AS has_user_id,
              EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname = n.nspname AND p.tablename = c.relname
                         AND p.policyname = 'owner_isolation') AS has_policy
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND (n.nspname IN ('app', 'memory')
              OR (n.nspname = 'ops' AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped)))
        ORDER BY 1`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(23);
    const unprotected = rows.filter((row) => !(row.rls && row.forced && row.has_user_id && row.has_policy));
    expect(unprotected).toEqual([]);
  });
});

describe("行级隔离（故意不写 user_id 条件）", () => {
  it("查询只返回当前用户的行", async () => {
    const titles = await withUserTransaction(app, alice.userId, async (client) => {
      const { rows } = await client.query<{ title: string }>("SELECT title FROM app.notes");
      return rows.map((row) => row.title);
    });
    expect(titles).toEqual(["alice 的笔记"]);
  });

  it("没有设置用户身份时什么都看不到，也写不进去", async () => {
    const { rows } = await app.query("SELECT id FROM app.notes");
    expect(rows).toEqual([]);
    await expect(
      app.query("INSERT INTO app.purpose_labels (user_id, label, ord) VALUES ($1, '学习理论', 0)", [
        alice.userId,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it("不能以别人的 user_id 写入", async () => {
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query("INSERT INTO app.purpose_labels (user_id, label, ord) VALUES ($1, '学习理论', 0)", [
          bob.userId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("按 ID 改、删别人的行不生效", async () => {
    const affected = await withUserTransaction(app, alice.userId, async (client) => {
      const updated = await client.query("UPDATE app.notes SET title = '篡改' WHERE id = $1", [bob.noteId]);
      const deleted = await client.query("DELETE FROM app.notes WHERE id = $1", [bob.noteId]);
      return [updated.rowCount, deleted.rowCount];
    });
    expect(affected).toEqual([0, 0]);
    const title = await withUserTransaction(app, bob.userId, async (client) => {
      const { rows } = await client.query<{ title: string }>("SELECT title FROM app.notes WHERE id = $1", [
        bob.noteId,
      ]);
      return rows[0]?.title;
    });
    expect(title).toBe("bob 的笔记");
  });

  it("知道别人笔记的 ID 也挂不上自己的片段（复合外键）", async () => {
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query(
          `INSERT INTO app.note_chunks (user_id, note_id, ord, text, tokens)
           VALUES ($1, $2, 0, '偷挂', to_tsvector('simple', '偷挂'))`,
          [alice.userId, bob.noteId],
        ),
      ),
    ).rejects.toThrow(/note_chunks_note_fk/);
  });

  it("向量检索只在本人片段里排序，过滤后召回不缩水（pgvector 迭代扫描）", async () => {
    // bob 的 60 个片段都比 alice 的片段更接近查询向量；alice 取前 5 条仍应拿到自己的 5 条。
    await withUserTransaction(app, bob.userId, async (client) => {
      for (let i = 0; i < 60; i += 1) {
        await client.query(
          `INSERT INTO app.note_chunks (user_id, note_id, ord, text, tokens, embedding, embedding_model)
           VALUES ($1, $2, $3, 'bob', to_tsvector('simple', 'bob'), $4, 'test')`,
          [bob.userId, bob.noteId, i, basis(0, 0)],
        );
      }
    });
    await withUserTransaction(app, alice.userId, async (client) => {
      for (let i = 0; i < 5; i += 1) {
        await client.query(
          `INSERT INTO app.note_chunks (user_id, note_id, ord, text, tokens, embedding, embedding_model)
           VALUES ($1, $2, $3, 'alice', to_tsvector('simple', 'alice'), $4, 'test')`,
          [alice.userId, alice.noteId, i, basis(i + 1, 0.5)],
        );
      }
    });
    const found = await withUserTransaction(app, alice.userId, async (client) => {
      await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
      await client.query("SET LOCAL enable_seqscan = off");
      const { rows } = await client.query<{ text: string; user_id: string }>(
        "SELECT text, user_id FROM app.note_chunks ORDER BY embedding <=> $1 LIMIT 5",
        [basis(0)],
      );
      return rows;
    });
    expect(found).toHaveLength(5);
    expect(found.every((row) => row.user_id === alice.userId && row.text === "alice")).toBe(true);
  });
});

describe("只追加记录", () => {
  it("消息不能被修改或删除；删除会话时级联删除", async () => {
    const conversationId = await withUserTransaction(app, alice.userId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO app.conversations (user_id, workspace_id, kind) VALUES ($1, $2, 'logic') RETURNING id",
        [alice.userId, alice.workspaceId],
      );
      const id = rows[0]?.id ?? "";
      await client.query(
        `INSERT INTO app.messages (user_id, conversation_id, seq, role, parts)
         VALUES ($1, $2, 0, 'user', '{"v":1,"parts":[{"type":"text","text":"你好"}]}')`,
        [alice.userId, id],
      );
      return id;
    });
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query("UPDATE app.messages SET status = 'error' WHERE conversation_id = $1", [conversationId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query("DELETE FROM app.messages WHERE conversation_id = $1", [conversationId]),
      ),
    ).rejects.toThrow(/permission denied/);
    const remaining = await withUserTransaction(app, alice.userId, async (client) => {
      await client.query("DELETE FROM app.conversations WHERE id = $1", [conversationId]);
      const { rows } = await client.query("SELECT 1 FROM app.messages WHERE conversation_id = $1", [
        conversationId,
      ]);
      return rows.length;
    });
    expect(remaining).toBe(0);
  });

  it("消息分段必须是带版本号的数组", async () => {
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query(
          `INSERT INTO app.messages (user_id, conversation_id, seq, role, parts)
           VALUES ($1, $2, 99, 'user', '"纯文本"')`,
          [alice.userId, alice.conversationId],
        ),
      ),
    ).rejects.toThrow(/messages_parts_check/);
  });

  it("用量账目只能新增；删除会话与运行后账目仍在", async () => {
    const runId = await withUserTransaction(app, alice.userId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO app.agent_runs (user_id, conversation_id, agent, input) VALUES ($1, $2, 'logic', '{}') RETURNING id",
        [alice.userId, alice.conversationId],
      );
      const id = rows[0]?.id ?? "";
      await client.query(
        "INSERT INTO ops.usage_ledger (user_id, kind, tokens_in, run_id) VALUES ($1, 'model', 120, $2)",
        [alice.userId, id],
      );
      return id;
    });
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query("UPDATE ops.usage_ledger SET tokens_in = 0 WHERE run_id = $1", [runId]),
      ),
    ).rejects.toThrow(/permission denied/);
    const ledger = await withUserTransaction(app, alice.userId, async (client) => {
      await client.query("DELETE FROM app.agent_runs WHERE id = $1", [runId]);
      const { rows } = await client.query<{ tokens_in: number }>(
        "SELECT tokens_in FROM ops.usage_ledger WHERE run_id = $1",
        [runId],
      );
      return rows;
    });
    expect(ledger).toEqual([{ tokens_in: 120 }]);
  });

  it("审计日志只能写入、不能读取", async () => {
    await app.query("INSERT INTO ops.audit_log (actor_user_id, action) VALUES ($1, 'auth.sign_in')", [
      alice.userId,
    ]);
    await expect(app.query("SELECT * FROM ops.audit_log")).rejects.toThrow(/permission denied/);
  });
});

describe("约束", () => {
  it("同一邮箱（大小写不同）并发注册只有一个成功（EC-U1）", async () => {
    const email = `Race-${String(Date.now())}@Example.com`;
    const results = await Promise.allSettled([
      app.query("INSERT INTO auth.users (name, email) VALUES ('a', $1)", [email]),
      app.query("INSERT INTO auth.users (name, email) VALUES ('b', $1)", [email.toLowerCase()]),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected?.reason as { code?: string } | undefined)?.code).toBe("23505");
  });

  it("JSONB 内部结构缺键时被拒绝（CHECK 结果为 NULL 时默认放行，约束必须显式处理）", async () => {
    const attempts: [string, RegExp, (client: PoolClient) => Promise<unknown>][] = [
      [
        "画布操作缺 type",
        /canvas_ops_op_check/,
        (client) =>
          client.query(
            "INSERT INTO app.canvas_ops (user_id, conversation_id, revision, actor, op) VALUES ($1, $2, 0, 'human', '{}')",
            [alice.userId, alice.conversationId],
          ),
      ],
      [
        "特征作用域缺 kind",
        /traits_scope_check/,
        (client) =>
          client.query(
            `INSERT INTO memory.traits (user_id, dimension, key, statement, scope, polarity, weight, confidence, origin, half_life_days)
             VALUES ($1, 'granularity', 'atomic', '偏好原子级', '{}', 'prefer', 1, 0.5, 'rule', 30)`,
            [alice.userId],
          ),
      ],
      [
        "知识点三档名称缺一档",
        /knowledge_points_labels_check/,
        async (client) => {
          const map = await client.query<{ id: string }>(
            "INSERT INTO app.knowledge_maps (user_id, workspace_id, seed_note_id) VALUES ($1, $2, $3) RETURNING id",
            [alice.userId, alice.workspaceId, alice.noteId],
          );
          const branch = await client.query<{ id: string }>(
            "INSERT INTO app.knowledge_branches (user_id, map_id, title, lens, ord) VALUES ($1, $2, '机制', 'mechanism', 0) RETURNING id",
            [alice.userId, map.rows[0]?.id],
          );
          return client.query(
            `INSERT INTO app.knowledge_points (user_id, map_id, branch_id, depth, labels, summary, coverage)
             VALUES ($1, $2, $3, 1, '{"theme":"检索","concept":"混合检索"}', '摘要', 'missing')`,
            [alice.userId, map.rows[0]?.id, branch.rows[0]?.id],
          );
        },
      ],
    ];
    for (const [label, constraint, attempt] of attempts) {
      await expect(withUserTransaction(app, alice.userId, attempt), label).rejects.toThrow(constraint);
    }
  });

  it("画像维度是白名单，敏感维度写不进去（EC-M5）", async () => {
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query(
          `INSERT INTO memory.traits (user_id, dimension, key, statement, polarity, weight, confidence, origin, half_life_days)
           VALUES ($1, 'health', 'x', 'x', 'prefer', 1, 0.5, 'rule', 30)`,
          [alice.userId],
        ),
      ),
    ).rejects.toThrow(/traits_dimension_check/);
  });

  it("对象存储键必须落在本人前缀下", async () => {
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        client.query(
          `INSERT INTO app.note_files (user_id, note_id, object_key, mime, bytes, sha256)
           VALUES ($1, $2, 'u/someone-else/x', 'image/png', 1, $3)`,
          [alice.userId, alice.noteId, "b".repeat(64)],
        ),
      ),
    ).rejects.toThrow(/note_files_object_key_check/);
  });

  it("同一用户重复导入同一内容被去重（EC-I3）", async () => {
    await expect(
      withUserTransaction(app, alice.userId, async (client) => {
        const { rows } = await client.query<{ content_hash: string }>(
          "SELECT content_hash FROM app.notes WHERE id = $1",
          [alice.noteId],
        );
        await client.query(
          `INSERT INTO app.notes (user_id, workspace_id, title, modality, content_hash, origin)
           VALUES ($1, $2, '重复', 'webpage', $3, 'upload')`,
          [alice.userId, alice.workspaceId, rows[0]?.content_hash],
        );
      }),
    ).rejects.toThrow(/notes_user_content_hash_key/);
  });

  it("主键是时间有序的 UUIDv7，updated_at 由触发器刷新", async () => {
    const [first, second] = await withUserTransaction(app, alice.userId, async (client) => {
      const a = await client.query<{ id: string }>("SELECT app.uuid_v7() AS id");
      await client.query("SELECT pg_sleep(0.002)");
      const b = await client.query<{ id: string }>("SELECT app.uuid_v7() AS id");
      return [a.rows[0]?.id ?? "", b.rows[0]?.id ?? ""];
    });
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first < second).toBe(true);
    const readUpdatedAt = () =>
      withUserTransaction(app, alice.userId, async (client) => {
        const { rows } = await client.query<{ updated_at: Date }>(
          "SELECT updated_at FROM app.notes WHERE id = $1",
          [alice.noteId],
        );
        return rows[0]?.updated_at.getTime() ?? 0;
      });
    const before = await readUpdatedAt();
    await withUserTransaction(app, alice.userId, (client) =>
      client.query("UPDATE app.notes SET summary = '摘要' WHERE id = $1", [alice.noteId]),
    );
    expect(await readUpdatedAt()).toBeGreaterThan(before);
  });
});

describe("画布版本并发（EC-U3）", () => {
  it("两个基于同一版本的写入只有一个成功，另一个明确报版本过期", async () => {
    const results = await Promise.allSettled(
      ["设备 A", "设备 B"].map((label) =>
        withUserTransaction(app, alice.userId, (client) =>
          commitCanvasRevision(client, {
            conversationId: alice.conversationId,
            baseRevision: 0,
            nodes: [{ id: "n1", label }],
            edges: [],
            positions: {},
            createdBy: "human",
          }),
        ),
      ),
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toEqual([{ status: "fulfilled", value: 1 }]);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(StaleCanvasRevisionError);
    expect((rejected?.reason as StaleCanvasRevisionError).currentRevision).toBe(1);
    const next = await withUserTransaction(app, alice.userId, (client) =>
      commitCanvasRevision(client, {
        conversationId: alice.conversationId,
        baseRevision: 1,
        nodes: [],
        edges: [],
        positions: {},
        createdBy: "agent",
      }),
    );
    expect(next).toBe(2);
  });

  it("别人的会话即使知道 ID 也提交不了", async () => {
    await expect(
      withUserTransaction(app, alice.userId, (client) =>
        commitCanvasRevision(client, {
          conversationId: bob.conversationId,
          baseRevision: 0,
          nodes: [],
          edges: [],
          positions: {},
          createdBy: "human",
        }),
      ),
    ).rejects.toMatchObject({ name: "StaleCanvasRevisionError", currentRevision: null });
  });
});

describe("账号状态（EC-U2、EC-U4）", () => {
  it("运行属于用户而不是登录会话：会话全部失效后运行仍在、仍可读", async () => {
    const runId = await withUserTransaction(app, bob.userId, async (client) => {
      await client.query(
        "INSERT INTO auth.sessions (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 day')",
        [bob.userId, `token-${String(Date.now())}`],
      );
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO app.agent_runs (user_id, agent, input, status, started_at) VALUES ($1, 'logic', '{}', 'running', now()) RETURNING id",
        [bob.userId],
      );
      return rows[0]?.id ?? "";
    });
    await app.query("DELETE FROM auth.sessions WHERE user_id = $1", [bob.userId]);
    const status = await withUserTransaction(app, bob.userId, async (client) => {
      await client.query(
        "UPDATE app.agent_runs SET status = 'succeeded', finished_at = now() WHERE id = $1",
        [runId],
      );
      const { rows } = await client.query<{ status: string }>(
        "SELECT status FROM app.agent_runs WHERE id = $1",
        [runId],
      );
      return rows[0]?.status;
    });
    expect(status).toBe("succeeded");
  });

  it("冻结账号的任务在执行前被拒绝", async () => {
    const carol = await createFixture("carol");
    await app.query("UPDATE auth.users SET status = 'frozen', deletion_requested_at = now() WHERE id = $1", [
      carol.userId,
    ]);
    await expect(
      withUserTransaction(app, carol.userId, (client) => assertAccountActive(client, carol.userId)),
    ).rejects.toBeInstanceOf(AccountUnavailableError);
    await expect(
      withUserTransaction(app, alice.userId, (client) => assertAccountActive(client, alice.userId)),
    ).resolves.toBeUndefined();
  });

  it("删除账号级联删除这个用户的全部数据，不影响别人", async () => {
    const dave = await createFixture("dave");
    await withUserTransaction(app, dave.userId, async (client) => {
      await client.query(
        `INSERT INTO app.messages (user_id, conversation_id, seq, role, parts)
         VALUES ($1, $2, 0, 'user', '{"v":1,"parts":[]}')`,
        [dave.userId, dave.conversationId],
      );
      await client.query(
        "INSERT INTO memory.events (user_id, source, type) VALUES ($1, 'logic', 'clarify_option_picked')",
        [dave.userId],
      );
    });
    await app.query("DELETE FROM auth.users WHERE id = $1", [dave.userId]);
    // 以被删用户的身份查：行级隔离下只会看到他自己的行，删干净时应为 0。
    const left = await withUserTransaction(app, dave.userId, async (client) => {
      const counts = await client.query<{ n: string }>(
        "SELECT (SELECT count(*) FROM app.notes) + (SELECT count(*) FROM app.messages) + (SELECT count(*) FROM memory.events) AS n",
      );
      return counts.rows[0]?.n;
    });
    expect(left).toBe("0");
    const bobNotes = await withUserTransaction(app, bob.userId, async (client) => {
      const { rows: notes } = await client.query("SELECT id FROM app.notes");
      return notes.length;
    });
    expect(bobNotes).toBe(1);
  });
});
