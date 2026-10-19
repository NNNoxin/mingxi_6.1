"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Banner, Button } from "./ui";

/**
 * 后台写操作的确认框：每个操作都必须填写原因（与操作一起写进审计，docs/05 §3 第 4 条）。
 * onConfirm 抛出的错误显示在框内，不关闭。
 */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[420px] max-w-[calc(100vw-32px)] rounded-lg border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-ink/30"
    >
      <form onSubmit={(event) => void submit(event)} className="p-5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-muted">{description}</p>
        <label className="mt-4 block text-[13px] font-medium" htmlFor="reason">
          原因（写入审计日志）
        </label>
        <textarea
          id="reason"
          required
          minLength={2}
          maxLength={500}
          rows={3}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          className="mt-1.5 w-full rounded-md border border-line-strong px-2.5 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder="例如：用户来信说手机丢失，要求退出所有设备"
        />
        {error ? (
          <div className="mt-3">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="submit"
            tone={danger ? "danger" : "primary"}
            disabled={busy || reason.trim().length < 2}
          >
            {busy ? "处理中…" : confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
