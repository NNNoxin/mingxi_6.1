import type { Pool } from "@mingxi/db";
import type { Logger } from "../logger";
import { renderEmail, type EmailPayload, type EmailTemplate } from "./templates";
import type { MailTransport } from "./transport";

/** 一封邮件最多尝试几次；之后标记为 failed（链接本身也会过期，没有必要一直重试）。 */
export const MAX_ATTEMPTS = 5;
/** 认领后的租约：投递进程在这段时间内崩溃，邮件会被其他进程重新认领。 */
const LEASE_SECONDS = 120;

/** 写入发件箱。调用方可以传入事务连接，让邮件与业务写入同时提交。 */
export async function enqueueEmail(
  db: Pick<Pool, "query">,
  email: { to: string; template: EmailTemplate; payload: EmailPayload },
): Promise<void> {
  await db.query("INSERT INTO ops.email_outbox (to_address, template, payload) VALUES ($1, $2, $3)", [
    email.to,
    email.template,
    JSON.stringify(email.payload),
  ]);
}

interface ClaimedEmail {
  id: string;
  to_address: string;
  template: EmailTemplate;
  payload: EmailPayload;
  attempts: number;
}

/** 第 n 次失败后的重试间隔（秒）：30、120、480……上限 1 小时。 */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(3600, 30 * 4 ** Math.max(0, attempts - 1));
}

/**
 * 认领一批到期的邮件并投递。认领用 FOR UPDATE SKIP LOCKED，多个进程同时运行也不会重复发送；
 * 认领时把下次尝试时间推后一个租约，进程中途崩溃时邮件会在租约到期后被重新认领。
 * 成功：标记 sent 并清空 payload（一次性链接不留存）；失败：按退避重试，超过次数标记 failed。
 */
export async function dispatchDueEmails(
  pool: Pool,
  transport: MailTransport,
  logger: Logger,
  batchSize = 20,
): Promise<{ sent: number; failed: number }> {
  const { rows } = await pool.query<ClaimedEmail>(
    `UPDATE ops.email_outbox
        SET status = 'sending', attempts = attempts + 1, next_attempt_at = now() + make_interval(secs => $2)
      WHERE id IN (
        SELECT id FROM ops.email_outbox
         WHERE status IN ('pending', 'sending') AND next_attempt_at <= now()
         ORDER BY next_attempt_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
  RETURNING id, to_address, template, payload, attempts`,
    [batchSize, LEASE_SECONDS],
  );
  let sent = 0;
  let failed = 0;
  for (const email of rows) {
    try {
      await transport.send({ to: email.to_address, ...renderEmail(email.template, email.payload) });
      await pool.query(
        "UPDATE ops.email_outbox SET status = 'sent', sent_at = now(), payload = '{}', last_error = NULL WHERE id = $1",
        [email.id],
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const giveUp = email.attempts >= MAX_ATTEMPTS;
      await pool.query(
        `UPDATE ops.email_outbox
            SET status = $2, last_error = $3,
                next_attempt_at = now() + make_interval(secs => $4),
                payload = CASE WHEN $2 = 'failed' THEN '{}'::jsonb ELSE payload END
          WHERE id = $1`,
        [email.id, giveUp ? "failed" : "pending", message.slice(0, 500), retryDelaySeconds(email.attempts)],
      );
      logger.error({ emailId: email.id, attempts: email.attempts, giveUp, err: error }, "邮件投递失败");
    }
  }
  return { sent, failed };
}

/** 后台循环投递（worker 角色）。返回停止函数，停机时等待当前一轮结束。 */
export function startOutboxDispatcher(
  pool: Pool,
  transport: MailTransport,
  logger: Logger,
  intervalMs = 2_000,
): () => Promise<void> {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<unknown> = Promise.resolve();
  const tick = () => {
    if (stopped) return;
    current = dispatchDueEmails(pool, transport, logger)
      .catch((error: unknown) => {
        logger.error({ err: error }, "发件箱轮询出错");
      })
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, intervalMs);
      });
  };
  tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await current;
  };
}
