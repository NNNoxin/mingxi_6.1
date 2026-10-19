"use client";

import {
  AdminActionResult,
  StaffList,
  StaffSessionsRevoked,
  type AdminUserSummary,
  type UserRole,
} from "@mingxi/contracts";
import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { AdminApiError, adminGet, adminPost } from "../api";
import { ReasonDialog } from "../components/ReasonDialog";
import { Badge, Banner, Button, Cell, PageHeader, Panel, Select, Table, TextInput } from "../components/ui";
import { formatTime, ROLE_LABELS } from "../format";
import { SignOutButton } from "../staff-context";

const ROLE_OPTIONS: UserRole[] = ["support", "analyst", "admin", "user"];

/** 工作人员与角色。授予或撤销角色属于敏感操作，需要 10 分钟内登录过。 */
export function StaffView() {
  const [staff, setStaff] = useState<AdminUserSummary[] | null>(null);
  const [form, setForm] = useState<{ email: string; role: UserRole; reason: string }>({
    email: "",
    role: "support",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [confirmingRevokeAll, setConfirmingRevokeAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<AdminApiError | Error | null>(null);

  const load = useCallback(async () => {
    try {
      setStaff((await adminGet("/staff", StaffList)).staff);
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await adminPost(
        "/staff",
        { ...form, email: form.email.trim(), reason: form.reason.trim() },
        AdminActionResult,
      );
      setNotice(
        form.role === "user"
          ? `已撤销 ${form.email} 的工作人员身份`
          : `已把 ${form.email} 设为${ROLE_LABELS[form.role]}。对方开启两步验证后即可登录后台。`,
      );
      setForm({ email: "", role: "support", reason: "" });
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)));
    } finally {
      setBusy(false);
    }
  }

  /** 撤销全部工作人员会话（EC-A1）。需要重新登录时关闭确认框、在页面上给出入口；其他失败显示在确认框里。 */
  async function revokeAll(reason: string) {
    setNotice(null);
    setError(null);
    let result: StaffSessionsRevoked;
    try {
      result = await adminPost("/staff/revoke-sessions", { reason }, StaffSessionsRevoked);
    } catch (failure) {
      if (failure instanceof AdminApiError && failure.reason === "reauth_required") {
        setError(failure);
        return;
      }
      throw failure;
    }
    setNotice(
      `已撤销 ${String(result.revokedSessions)} 个会话（共 ${String(result.staffAccounts)} 个工作人员账号），你当前这次登录保留（已写入审计日志）`,
    );
    await load();
  }

  return (
    <>
      <PageHeader
        title="工作人员"
        description="后台账号与角色。所有工作人员都必须开启两步验证；至少保留一位开启两步验证的管理员。"
        actions={
          <Button
            tone="danger"
            onClick={() => {
              setConfirmingRevokeAll(true);
            }}
          >
            撤销全部工作人员会话
          </Button>
        }
      />
      <div className="space-y-3">
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        {error ? (
          <Banner
            tone="error"
            action={
              error instanceof AdminApiError && error.reason === "reauth_required" ? (
                <SignOutButton next="/staff">重新登录</SignOutButton>
              ) : undefined
            }
          >
            {error.message}
          </Banner>
        ) : null}
        <Panel title="授予或撤销角色">
          <form
            className="flex flex-wrap items-center gap-2 px-4 py-3"
            onSubmit={(event) => void submit(event)}
          >
            <TextInput
              aria-label="账号邮箱"
              type="email"
              required
              placeholder="已注册并验证过的账号邮箱"
              value={form.email}
              onChange={(event) => {
                setForm({ ...form, email: event.target.value });
              }}
              className="w-64"
            />
            <Select
              aria-label="角色"
              value={form.role}
              onChange={(event) => {
                setForm({ ...form, role: event.target.value as UserRole });
              }}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role === "user" ? "撤销工作人员身份" : ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
            <TextInput
              aria-label="原因"
              required
              minLength={2}
              placeholder="原因（写入审计日志）"
              value={form.reason}
              onChange={(event) => {
                setForm({ ...form, reason: event.target.value });
              }}
              className="w-72"
            />
            <Button type="submit" tone="primary" disabled={busy}>
              {busy ? "处理中…" : "确认"}
            </Button>
          </form>
        </Panel>
        <Panel title="当前工作人员">
          <Table
            head={["邮箱", "昵称", "角色", "两步验证", "最近活跃", "加入时间"]}
            empty={staff?.length === 0 ? "还没有工作人员" : undefined}
          >
            {(staff ?? []).map((member) => (
              <tr key={member.id}>
                <Cell>
                  <a className="font-medium hover:text-accent" href={`/users/detail?id=${member.id}`}>
                    {member.email}
                  </a>
                </Cell>
                <Cell>{member.name}</Cell>
                <Cell>
                  <Badge tone="accent">{ROLE_LABELS[member.role]}</Badge>
                </Cell>
                <Cell>{member.twoFactorEnabled ? "已开启" : <Badge tone="warn">未开启</Badge>}</Cell>
                <Cell className="text-muted">{formatTime(member.lastActiveAt)}</Cell>
                <Cell className="text-muted">{formatTime(member.createdAt)}</Cell>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
      {confirmingRevokeAll ? (
        <ReasonDialog
          title="撤销全部工作人员会话"
          description="除你当前这次登录外，所有工作人员（包括你在其他设备上的登录）立即退出，需要重新用密码和验证码登录。用于怀疑有工作人员账号被盗时。"
          confirmLabel="确认撤销全部会话"
          danger
          onConfirm={revokeAll}
          onClose={() => {
            setConfirmingRevokeAll(false);
          }}
        />
      ) : null}
    </>
  );
}
