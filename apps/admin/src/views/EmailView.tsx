"use client";

import { OutboxPage, type OutboxEntry } from "@mingxi/contracts";
import { useCallback, useEffect, useState } from "react";
import { adminGet } from "../api";
import { Badge, Banner, Button, Cell, PageHeader, Panel, Table } from "../components/ui";
import { formatTime, OUTBOX_STATUS_LABELS, TEMPLATE_LABELS } from "../format";

type StatusFilter = OutboxEntry["status"] | "all";

const FILTERS: StatusFilter[] = ["all", "failed", "pending", "sent"];
const STATUS_TONES: Record<OutboxEntry["status"], "ok" | "danger" | "warn" | "neutral"> = {
  sent: "ok",
  failed: "danger",
  pending: "warn",
  sending: "neutral",
};

/** 邮件投递记录（不含正文）。失败的验证 / 重置邮件不能原样重发——在用户详情里重新发一封。 */
export function EmailView() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filter: StatusFilter, before: string | null) => {
    setError(null);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    if (before) params.set("before", before);
    try {
      const page = await adminGet(`/email-outbox?${params.toString()}`, OutboxPage);
      setEntries((previous) => (before ? [...previous, ...page.entries] : page.entries));
      setNextBefore(page.nextBefore);
      setLoaded(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);

  useEffect(() => {
    void load(status, null);
  }, [load, status]);

  return (
    <>
      <PageHeader
        title="邮件投递"
        description="验证、找回密码、已注册提示三类邮件的投递记录；正文含一次性链接，不在后台显示。"
      />
      <div
        className="mb-3 inline-flex rounded-md border border-line bg-panel p-0.5"
        role="tablist"
        aria-label="投递状态"
      >
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={status === filter}
            onClick={() => {
              setStatus(filter);
            }}
            className={`rounded px-3 py-1 text-[13px] ${status === filter ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
          >
            {filter === "all" ? "全部" : OUTBOX_STATUS_LABELS[filter]}
          </button>
        ))}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Panel>
        <Table
          head={["创建时间", "收件人", "类型", "状态", "尝试次数", "最后错误", "发送时间"]}
          empty={loaded && entries.length === 0 ? "没有记录" : undefined}
        >
          {entries.map((entry) => (
            <tr key={entry.id}>
              <Cell className="whitespace-nowrap text-muted">{formatTime(entry.createdAt)}</Cell>
              <Cell>{entry.toAddress}</Cell>
              <Cell className="whitespace-nowrap">{TEMPLATE_LABELS[entry.template]}</Cell>
              <Cell>
                <Badge tone={STATUS_TONES[entry.status]}>{OUTBOX_STATUS_LABELS[entry.status]}</Badge>
              </Cell>
              <Cell className="tabular-nums">{entry.attempts}</Cell>
              <Cell className="max-w-xs text-xs text-danger">{entry.lastError ?? ""}</Cell>
              <Cell className="whitespace-nowrap text-muted">{formatTime(entry.sentAt)}</Cell>
            </tr>
          ))}
        </Table>
        {nextBefore ? (
          <div className="border-t border-line p-2 text-center">
            <Button tone="ghost" onClick={() => void load(status, nextBefore)}>
              加载更早的记录
            </Button>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
