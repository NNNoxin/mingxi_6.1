"use client";

import { useSearchParams } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { requestPasswordReset, resendVerification, signIn, signUp, type AuthResult } from "./api";
import { Alert, AuthShell, Field } from "./AuthShell";
import { failureMessage } from "./messages";
import { RESET_PASSWORD_PATH, safeNextPath, VERIFY_EMAIL_PATH } from "./paths";

type Mode = "login" | "register" | "forgot";
interface Sent {
  kind: "verify" | "reset";
  email: string;
}
interface Feedback {
  tone: "error" | "success";
  text: string;
  offerResend?: boolean;
}

const TITLES: Record<Mode, string> = { login: "登录明晰", register: "注册明晰账号", forgot: "找回密码" };

/** 登录、注册、找回密码三种状态共用一张卡片；注册与找回密码提交后切换为“查收邮件”。 */
export function LoginView() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const switchTo = (next: Mode) => {
    setMode(next);
    setFeedback(null);
    setPassword("");
  };

  async function run(action: () => Promise<AuthResult>, onSuccess: () => void) {
    setBusy(true);
    setFeedback(null);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      onSuccess();
      return;
    }
    setFeedback({
      tone: "error",
      text: failureMessage(result),
      offerResend: result.kind === "error" && result.code === "EMAIL_NOT_VERIFIED",
    });
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    switch (mode) {
      case "login":
        void run(
          () => signIn(trimmedEmail, password),
          () => {
            window.location.assign(safeNextPath(params.get("next")));
          },
        );
        return;
      case "register":
        void run(
          () => signUp(name.trim(), trimmedEmail, password, VERIFY_EMAIL_PATH),
          () => {
            setSent({ kind: "verify", email: trimmedEmail });
          },
        );
        return;
      case "forgot":
        void run(
          () => requestPasswordReset(trimmedEmail, RESET_PASSWORD_PATH),
          () => {
            setSent({ kind: "reset", email: trimmedEmail });
          },
        );
        return;
    }
  }

  function resend(target: string) {
    void run(
      () => resendVerification(target, VERIFY_EMAIL_PATH),
      () => {
        setFeedback({ tone: "success", text: "验证邮件已重新发送，请查收" });
      },
    );
  }

  if (sent) {
    return (
      <AuthShell
        title="查收邮件"
        lead={
          sent.kind === "verify" ? (
            <>
              我们给 <strong>{sent.email}</strong> 发了一封验证邮件，点击邮件里的链接即可完成注册，链接 24
              小时内有效。
            </>
          ) : (
            <>
              如果 <strong>{sent.email}</strong> 注册过明晰，重置密码的链接已经发到这个邮箱，1 小时内有效。
            </>
          )
        }
      >
        {sent.kind === "verify" ? (
          <p className="mxa-hint">
            没收到？先看看垃圾邮件；仍然没有可以
            <button
              type="button"
              className="mxa-inline"
              disabled={busy}
              onClick={() => {
                resend(sent.email);
              }}
            >
              重新发送
            </button>
            。
          </p>
        ) : null}
        {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}
        <div className="mxa-links">
          <button
            type="button"
            onClick={() => {
              setSent(null);
              switchTo("login");
            }}
          >
            返回登录
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={TITLES[mode]}
      lead={mode === "forgot" ? "输入注册时用的邮箱，我们会发一封重置密码的邮件。" : undefined}
    >
      {mode === "forgot" ? null : (
        <div className="mxa-switch" role="tablist" aria-label="登录或注册">
          {(["login", "register"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              className={mode === item ? "is-on" : undefined}
              onClick={() => {
                switchTo(item);
              }}
            >
              {item === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>
      )}

      <form className="mxa-form" onSubmit={submit}>
        {mode === "register" ? (
          <Field
            label="怎么称呼你"
            name="name"
            autoComplete="nickname"
            required
            maxLength={40}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        ) : null}
        <Field
          label="邮箱"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        {mode === "forgot" ? null : (
          <Field
            label="密码"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            maxLength={128}
            hint={mode === "register" ? "至少 8 位，别用常见密码，也别包含邮箱名或昵称" : undefined}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        )}
        <button type="submit" className="mxa-submit" disabled={busy}>
          {busy ? "请稍候…" : mode === "login" ? "登录" : mode === "register" ? "注册" : "发送重置邮件"}
        </button>
      </form>

      {feedback ? (
        <Alert tone={feedback.tone}>
          {feedback.text}
          {feedback.offerResend ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                resend(email.trim());
              }}
            >
              没收到？重新发送
            </button>
          ) : null}
        </Alert>
      ) : null}

      <div className="mxa-links">
        {mode === "login" ? (
          <button
            type="button"
            onClick={() => {
              switchTo("forgot");
            }}
          >
            忘记密码？
          </button>
        ) : null}
        {mode === "forgot" ? (
          <button
            type="button"
            onClick={() => {
              switchTo("login");
            }}
          >
            返回登录
          </button>
        ) : null}
      </div>
    </AuthShell>
  );
}
