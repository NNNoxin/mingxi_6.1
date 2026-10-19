"use client";

import QRCode from "qrcode";
import { useState, type SubmitEvent } from "react";
import { enableTwoFactor, verifyTotp } from "../auth-client";
import { authFailureMessage } from "../messages";
import { Banner, Button, TextInput } from "./ui";

/**
 * 开启两步验证（工作人员必须开启）：确认密码 → 扫描二维码并保存备用码 → 输入验证码确认。
 * 确认后认证模块换发一个经过两步验证的会话，直接可以使用后台。
 */
export function TwoFactorSetup({ email, onEnabled }: { email: string; onEnabled: () => void }) {
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ qr: string; secret: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await enableTwoFactor(password);
    setBusy(false);
    if (!result.ok) {
      setError(authFailureMessage(result));
      return;
    }
    const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
    setSetup({
      qr: await QRCode.toDataURL(result.totpURI, { margin: 1, width: 176 }),
      secret,
      backupCodes: result.backupCodes,
    });
  }

  async function confirm(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await verifyTotp(code.trim());
    setBusy(false);
    if (result.ok) onEnabled();
    else setError(authFailureMessage(result));
  }

  return (
    <div className="mx-auto mt-16 w-[480px] max-w-[calc(100vw-32px)] rounded-lg border border-line bg-panel p-6">
      <h1 className="text-[17px] font-semibold">开启两步验证</h1>
      <p className="mt-1 text-[13px] text-muted">
        {email} 是工作人员账号。使用运营后台前必须开启两步验证：登录时除了密码，还要输入验证器 App（如 Google
        Authenticator、1Password）里的 6 位验证码。
      </p>
      {setup ? (
        <form className="mt-5 space-y-4" onSubmit={(event) => void confirm(event)}>
          <div className="flex gap-4">
            <img
              src={setup.qr}
              alt="两步验证二维码"
              width={176}
              height={176}
              className="rounded border border-line"
            />
            <div className="text-[13px]">
              <p className="font-medium">1. 用验证器 App 扫描二维码</p>
              <p className="mt-1 text-muted">无法扫描时手动输入密钥：</p>
              <code className="mt-1 block break-all rounded bg-canvas px-2 py-1 text-xs">{setup.secret}</code>
            </div>
          </div>
          <div className="text-[13px]">
            <p className="font-medium">2. 保存备用码（每个只能用一次，手机丢失时用来登录）</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 rounded bg-canvas p-2 font-mono text-xs">
              {setup.backupCodes.map((backup) => (
                <li key={backup}>{backup}</li>
              ))}
            </ul>
          </div>
          <div>
            <label className="text-[13px] font-medium" htmlFor="code">
              3. 输入 App 里当前的验证码
            </label>
            <div className="mt-1.5 flex gap-2">
              <TextInput
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
                className="w-32 tracking-widest"
              />
              <Button type="submit" tone="primary" disabled={busy}>
                {busy ? "确认中…" : "确认开启"}
              </Button>
            </div>
          </div>
          {error ? <Banner tone="error">{error}</Banner> : null}
        </form>
      ) : (
        <form className="mt-5 space-y-3" onSubmit={(event) => void start(event)}>
          <label className="block text-[13px] font-medium" htmlFor="password">
            先确认登录密码
          </label>
          <div className="flex gap-2">
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              className="flex-1"
            />
            <Button type="submit" tone="primary" disabled={busy}>
              {busy ? "请稍候…" : "下一步"}
            </Button>
          </div>
          {error ? <Banner tone="error">{error}</Banner> : null}
        </form>
      )}
    </div>
  );
}
