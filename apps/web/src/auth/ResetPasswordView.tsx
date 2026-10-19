"use client";

import { useSearchParams } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { resetPassword } from "./api";
import { Alert, AuthShell, Field } from "./AuthShell";
import { failureMessage, linkErrorMessage } from "./messages";
import { LOGIN_PATH } from "./paths";

/** 找回密码邮件里的链接先到认证接口校验，有效时跳到这里并附 ?token=，无效时附 ?error=。 */
export function ResetPasswordView() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (linkError || !token) {
    return (
      <AuthShell title="链接无法使用" lead={linkErrorMessage(linkError ?? "INVALID_TOKEN")}>
        <a className="mxa-submit" href={LOGIN_PATH}>
          返回登录
        </a>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="密码已重置" lead="所有设备上的登录都已退出，请用新密码重新登录。">
        <a className="mxa-submit" href={LOGIN_PATH}>
          去登录
        </a>
      </AuthShell>
    );
  }

  async function submit(event: SubmitEvent<HTMLFormElement>, resetToken: string) {
    event.preventDefault();
    if (password !== confirm) {
      setError("两次输入的密码不一样");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await resetPassword(resetToken, password);
    setBusy(false);
    if (result.ok) setDone(true);
    else setError(failureMessage(result));
  }

  return (
    <AuthShell title="设置新密码" lead="重置后，所有设备上的登录都会退出。">
      <form className="mxa-form" onSubmit={(event) => void submit(event, token)}>
        <Field
          label="新密码"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          hint="至少 8 位，别用常见密码"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <Field
          label="再输入一次"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
          }}
        />
        <button type="submit" className="mxa-submit" disabled={busy}>
          {busy ? "请稍候…" : "保存新密码"}
        </button>
      </form>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </AuthShell>
  );
}
