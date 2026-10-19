"use client";

import { AdminActionResult, AdminUserDetail, type AdminPermission } from "@mingxi/contracts";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminGet, adminPost } from "../api";
import { ReasonDialog } from "../components/ReasonDialog";
import { Badge, Banner, Button, Cell, PageHeader, Panel, Table } from "../components/ui";
import { deviceLabel, formatTime, ROLE_LABELS } from "../format";
import { SignOutButton, useCan } from "../staff-context";
import { StatusBadges } from "./UsersView";

interface Action {
  key: string;
  label: string;
  path: string;
  permission: AdminPermission;
  description: string;
  danger?: boolean;
  visible: (detail: AdminUserDetail) => boolean;
}

const ACTIONS: Action[] = [
  {
    key: "freeze",
    label: "冻结账号",
    path: "freeze",
    permission: "users.freeze",
    danger: true,
    description: "冻结后该用户所有设备立即退出，所有业务接口拒绝访问，直到解冻。",
    visible: (d) => d.user.status === "active" && d.user.role === "user",
  },
  {
    key: "unfreeze",
    label: "解冻账号",
    path: "unfreeze",
    permission: "users.freeze",
    description: "恢复正常使用。用户申请删除账号期间不能由后台解冻。",
    visible: (d) => d.user.status === "frozen" && !d.user.deletionRequestedAt,
  },
  {
    key: "revoke",
    label: "退出所有设备",
    path: "revoke-sessions",
    permission: "users.sessions.revoke",
    description: "该用户在所有设备上的登录立即失效，需要重新登录。",
    visible: (d) => d.sessions.length > 0,
  },
  {
    key: "verify",
    label: "重发验证邮件",
    path: "resend-verification",
    permission: "users.email.resend",
    description: "给这个未验证的邮箱重新发送一封验证邮件。",
    visible: (d) => !d.user.emailVerified,
  },
  {
    key: "reset",
    label: "发送重置密码邮件",
    path: "send-password-reset",
    permission: "users.email.resend",
    description: "给用户发送一封重置密码的邮件，由用户本人设置新密码。",
    visible: (d) => d.user.emailVerified && d.user.status === "active",
  },
];

export function UserDetailView() {
  const id = useSearchParams().get("id") ?? "";
  const can = useCan();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<AdminApiError | Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await adminGet(`/users/${encodeURIComponent(id)}`, AdminUserDetail));
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: Action, reason: string) {
    setNotice(null);
    setError(null);
    try {
      await adminPost(`/users/${encodeURIComponent(id)}/${action.path}`, { reason }, AdminActionResult);
    } catch (failure) {
      // 需要重新登录的敏感操作：关闭确认框，在页面上给出“重新登录”的入口。
      if (failure instanceof AdminApiError && failure.reason === "reauth_required") {
        setError(failure);
        return;
      }
      throw failure;
    }
    setNotice(`已完成：${action.label}（已写入审计日志）`);
    await load();
  }

  if (!detail) {
    return error ? (
      <Banner tone="error">{error.message}</Banner>
    ) : (
      <p className="text-[13px] text-muted">加载中…</p>
    );
  }
  const { user, sessions } = detail;
  const actions = ACTIONS.filter((action) => can(action.permission) && action.visible(detail));

  return (
    <>
      <PageHeader
        title={user.email}
        description={`用户 ID ${user.id}`}
        actions={actions.map((action) => (
          <Button
            key={action.key}
            tone={action.danger ? "danger" : "secondary"}
            onClick={() => {
              setPending(action);
            }}
          >
            {action.label}
          </Button>
        ))}
      />
      <div className="space-y-3">
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        {error ? (
          <Banner
            tone="error"
            action={
              error instanceof AdminApiError && error.reason === "reauth_required" ? (
                <SignOutButton next={`/users/detail?id=${user.id}`}>重新登录</SignOutButton>
              ) : undefined
            }
          >
            {error.message}
          </Banner>
        ) : null}
        <Panel title="账号">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-[13px] md:grid-cols-4">
            <Item label="昵称">{user.name}</Item>
            <Item label="状态">
              <StatusBadges user={user} />
            </Item>
            <Item label="角色">
              {user.role === "user" ? "普通用户" : <Badge tone="accent">{ROLE_LABELS[user.role]}</Badge>}
            </Item>
            <Item label="两步验证">{user.twoFactorEnabled ? "已开启" : "未开启"}</Item>
            <Item label="套餐">{user.planId ?? "—"}</Item>
            <Item label="注册时间">{formatTime(user.createdAt)}</Item>
            <Item label="最近活跃">{formatTime(user.lastActiveAt)}</Item>
            <Item label="申请删除">{formatTime(user.deletionRequestedAt)}</Item>
          </dl>
        </Panel>
        <Panel title={`有效会话（${String(sessions.length)}）`}>
          <Table
            head={["设备", "登录时间", "最近活跃", "到期", "两步验证"]}
            empty={sessions.length ? undefined : "没有有效会话"}
          >
            {sessions.map((session) => (
              <tr key={session.id}>
                <Cell>{deviceLabel(session.userAgent)}</Cell>
                <Cell className="text-muted">{formatTime(session.createdAt)}</Cell>
                <Cell className="text-muted">{formatTime(session.lastActiveAt)}</Cell>
                <Cell className="text-muted">{formatTime(session.expiresAt)}</Cell>
                <Cell>{session.mfaVerified ? "已验证" : <span className="text-muted">否</span>}</Cell>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
      {pending ? (
        <ReasonDialog
          title={pending.label}
          description={pending.description}
          confirmLabel={`确认${pending.label}`}
          danger={pending.danger ?? false}
          onConfirm={(reason) => run(pending, reason)}
          onClose={() => {
            setPending(null);
          }}
        />
      ) : null}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
