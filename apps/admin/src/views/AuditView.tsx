"use client";

import { AuditPage, type AuditEntry } from "@mingxi/contracts";
import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { adminGet } from "../api";
import { Banner, Button, Cell, PageHeader, Panel, Table, TextInput } from "../components/ui";
import { actionLabel, formatTime } from "../format";

interface Filter {
  action: string;
  actor: string;
  target: string;
}

function query(filter: Filter, before: string | null): string {
  const params = new URLSearchParams();
  if (filter.action) params.set("action", filter.action);
  if (filter.actor) params.set("actor", filter.actor);
  if (filter.target) params.set("target", filter.target);
  if (before) params.set("before", before);
  return params.toString();
}

/** 审计日志：只追加，后台也不能修改或删除。 */
export function AuditView() {
  const [filter, setFilter] = useState<Filter>({ action: "", actor: "", target: "" });
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (current: Filter, before: string | null) => {
    setError(null);
    try {
      const page = await adminGet(`/audit?${query(current, before)}`, AuditPage);
      setEntries((previous) => (before ? [...previous, ...page.entries] : page.entries));
      setNextBefore(page.nextBefore);
      setLoaded(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);

  useEffect(() => {
    void load({ action: "", actor: "", target: "" }, null);
  }, [load]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(filter, null);
  }

  const field = (key: keyof Filter, label: string, placeholder: string) => (
    <TextInput
      aria-label={label}
      placeholder={placeholder}
      value={filter[key]}
      onChange={(event) => {
        setFilter({ ...filter, [key]: event.target.value });
      }}
      className="w-52"
    />
  );

  return (
    <>
      <PageHeader title="审计日志" description="登录、敏感操作与全部后台操作的记录，只能追加，不能修改。" />
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={submit}>
        {field("action", "操作类型", "操作类型前缀，如 admin.")}
        {field("actor", "操作人", "操作人用户 ID")}
        {field("target", "对象", "对象 ID")}
        <Button type="submit" tone="primary">
          筛选
        </Button>
      </form>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Panel>
        <Table
          head={["时间", "操作", "操作人", "对象", "原因与详情"]}
          empty={loaded && entries.length === 0 ? "没有记录" : undefined}
        >
          {entries.map((entry) => {
            const { reason, ...rest } = entry.metadata;
            return (
              <tr key={entry.id}>
                <Cell className="whitespace-nowrap text-muted">{formatTime(entry.at)}</Cell>
                <Cell className="whitespace-nowrap">{actionLabel(entry.action)}</Cell>
                <Cell>
                  {entry.actorEmail ?? entry.actorUserId ?? <span className="text-muted">系统</span>}
                </Cell>
                <Cell>
                  {entry.targetId ? (
                    <a className="hover:text-accent" href={`/users/detail?id=${entry.targetId}`}>
                      <code className="text-xs">{entry.targetId.slice(0, 8)}</code>
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Cell>
                <Cell className="max-w-md">
                  {typeof reason === "string" ? <div>{reason}</div> : null}
                  {Object.keys(rest).length ? (
                    <code className="text-xs text-muted">{JSON.stringify(rest)}</code>
                  ) : null}
                </Cell>
              </tr>
            );
          })}
        </Table>
        {nextBefore ? (
          <div className="border-t border-line p-2 text-center">
            <Button tone="ghost" onClick={() => void load(filter, nextBefore)}>
              加载更早的记录
            </Button>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
