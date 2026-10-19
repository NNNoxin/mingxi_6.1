"use client";

import { AdminUserList, type AdminUserSummary } from "@mingxi/contracts";
import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { adminGet } from "../api";
import { Badge, Banner, Button, Cell, PageHeader, Panel, Table, TextInput } from "../components/ui";
import { formatTime, ROLE_LABELS } from "../format";

export function StatusBadges({ user }: { user: AdminUserSummary }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.status === "frozen" ? <Badge tone="danger">已冻结</Badge> : <Badge tone="ok">正常</Badge>}
      {user.emailVerified ? null : <Badge tone="warn">邮箱未验证</Badge>}
      {user.deletionRequestedAt ? <Badge tone="danger">申请删除中</Badge> : null}
    </span>
  );
}

/** 用户查找：按邮箱前缀或用户 ID；不输入时列出最近注册的 20 个账号。只显示账号元数据。 */
export function UsersView() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    setError(null);
    try {
      const result = await adminGet(`/users?q=${encodeURIComponent(q)}`, AdminUserList);
      setUsers(result.users);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);

  useEffect(() => {
    void search("");
  }, [search]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(query);
  }

  return (
    <>
      <PageHeader title="用户" description="账号元数据与设备会话；看不到任何笔记、对话或画像内容。" />
      <form className="mb-3 flex gap-2" onSubmit={submit}>
        <TextInput
          aria-label="查找用户"
          placeholder="邮箱（前缀即可）或用户 ID"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="w-80"
        />
        <Button type="submit" tone="primary">
          查找
        </Button>
      </form>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Panel>
        <Table
          head={["邮箱", "昵称", "状态", "角色", "两步验证", "有效会话", "最近活跃", "注册时间"]}
          empty={users?.length === 0 ? "没有匹配的账号" : undefined}
        >
          {(users ?? []).map((user) => (
            <tr key={user.id} className="hover:bg-canvas/70">
              <Cell>
                <a className="font-medium text-ink hover:text-accent" href={`/users/detail?id=${user.id}`}>
                  {user.email}
                </a>
              </Cell>
              <Cell>{user.name}</Cell>
              <Cell>
                <StatusBadges user={user} />
              </Cell>
              <Cell>
                {user.role === "user" ? (
                  <span className="text-muted">—</span>
                ) : (
                  <Badge tone="accent">{ROLE_LABELS[user.role]}</Badge>
                )}
              </Cell>
              <Cell>{user.twoFactorEnabled ? "已开启" : <span className="text-muted">未开启</span>}</Cell>
              <Cell className="tabular-nums">{user.activeSessions}</Cell>
              <Cell className="whitespace-nowrap text-muted">{formatTime(user.lastActiveAt)}</Cell>
              <Cell className="whitespace-nowrap text-muted">{formatTime(user.createdAt)}</Cell>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
