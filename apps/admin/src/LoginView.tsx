"use client";

import { useSearchParams } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { signIn, verifyBackupCode, verifyTotp } from "./auth-client";
import { Banner, Button, TextInput } from "./components/ui";
import { authFailureMessage } from "./messages";

/** 登录后只接受后台站内的相对路径（防开放重定向）。 */
function safeNext(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/users";
  return next;
}

/** 工作人员登录：邮箱 + 密码；开启了两步验证的账号再输入验证码（或一次性备用码）。 */
export function LoginView() {
  const params = useSearchParams();
  const [step, setStep] = useState<"password" | "code">("password");
  const [useBackup, setUseBackup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get("next"));

  async function submitPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(authFailureMessage(result));
      return;
    }
    if (result.twoFactorRedirect) setStep("code");
    else window.location.assign(next);
  }

  async function submitCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = useBackup ? await verifyBackupCode(code.trim()) : await verifyTotp(code.trim());
    setBusy(false);
    if (result.ok) window.location.assign(next);
    else setError(authFailureMessage(result));
  }

  return (
    <div className="flex min-h-screen items-start justify-center px-4 pt-24">
      <div className="w-[360px] rounded-lg border border-line bg-panel p-6">
        <div className="mb-5">
          <span className="font-brand text-[22px]">明晰</span>
          <span className="ml-1.5 text-[13px] text-muted">运营后台</span>
        </div>
        {step === "password" ? (
          <form className="space-y-3" onSubmit={(event) => void submitPassword(event)}>
            <div>
              <label className="text-[13px] font-medium" htmlFor="email">
                工作邮箱
              </label>
              <TextInput
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-[13px] font-medium" htmlFor="password">
                密码
              </label>
              <TextInput
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                className="mt-1 w-full"
              />
            </div>
            <Button type="submit" tone="primary" disabled={busy} className="w-full justify-center">
              {busy ? "登录中…" : "登录"}
            </Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(event) => void submitCode(event)}>
            <p className="text-[13px] text-muted">
              {useBackup ? "输入一个未用过的备用码。" : "输入验证器 App 里当前的 6 位验证码。"}
            </p>
            <TextInput
              id="code"
              aria-label={useBackup ? "备用码" : "验证码"}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              className="w-full tracking-widest"
            />
            <Button type="submit" tone="primary" disabled={busy} className="w-full justify-center">
              {busy ? "验证中…" : "验证"}
            </Button>
            <button
              type="button"
              className="text-[13px] text-muted hover:text-accent"
              onClick={() => {
                setUseBackup(!useBackup);
                setCode("");
                setError(null);
              }}
            >
              {useBackup ? "改用验证器 App 的验证码" : "手机不在身边？使用备用码"}
            </button>
          </form>
        )}
        {error ? (
          <div className="mt-3">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
      </div>
    </div>
  );
}
