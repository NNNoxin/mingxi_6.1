"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type SubmitEvent } from "react";
import { currentSession, resendVerification, type SessionCheck } from "./api";
import { Alert, AuthShell, Field } from "./AuthShell";
import { failureMessage, linkErrorMessage } from "./messages";
import { LOGIN_PATH, VERIFY_EMAIL_PATH, WORKBENCH_PATH } from "./paths";

/**
 * 验证邮件里的链接先到认证接口，验证成功后已自动登录并跳到这里；失败时附带 ?error=错误码。
 * 没有错误码时也不直接显示“已验证”：向服务端确认当前确实是已验证的登录状态才显示，
 * 直接打开这个页面（没有经过验证链接）时如实提示。
 */
export function VerifyEmailView() {
  const error = useSearchParams().get("error");
  const [session, setSession] = useState<SessionCheck | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (error) return;
    let active = true;
    void currentSession().then((result) => {
      if (active) setSession(result);
    });
    return () => {
      active = false;
    };
  }, [error]);

  if (!error) {
    if (!session) return <AuthShell title="正在确认…">{null}</AuthShell>;
    if (session.kind === "failed") {
      return (
        <AuthShell title="暂时无法确认" lead={failureMessage(session.failure)}>
          <a className="mxa-submit" href={VERIFY_EMAIL_PATH}>
            重试
          </a>
        </AuthShell>
      );
    }
    if (session.kind === "signed_in" && session.emailVerified) {
      return (
        <AuthShell title="邮箱已验证" lead="注册完成，已经为你登录。">
          <a className="mxa-submit" href={WORKBENCH_PATH}>
            进入明晰
          </a>
        </AuthShell>
      );
    }
    return (
      <AuthShell
        title="请从验证邮件打开"
        lead="这个页面需要通过验证邮件里的链接打开。已经验证过的话，直接登录即可。"
      >
        <a className="mxa-submit" href={LOGIN_PATH}>
          去登录
        </a>
      </AuthShell>
    );
  }

  async function resend(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await resendVerification(email.trim(), VERIFY_EMAIL_PATH);
    setBusy(false);
    setFeedback(
      result.ok
        ? { tone: "success", text: "如果这个邮箱注册过且尚未验证，新的验证邮件已经发出，请查收" }
        : { tone: "error", text: failureMessage(result) },
    );
  }

  return (
    <AuthShell title="验证没有完成" lead={linkErrorMessage(error)}>
      <form className="mxa-form" onSubmit={(event) => void resend(event)}>
        <Field
          label="邮箱"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <button type="submit" className="mxa-submit" disabled={busy}>
          {busy ? "请稍候…" : "重新发送验证邮件"}
        </button>
      </form>
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}
      <div className="mxa-links">
        <a href={LOGIN_PATH}>返回登录</a>
      </div>
    </AuthShell>
  );
}
