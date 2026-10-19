import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export type ButtonTone = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: "bg-ink text-white hover:bg-black border-ink",
  secondary: "bg-panel text-ink hover:bg-canvas border-line-strong",
  danger: "bg-panel text-danger hover:bg-danger-soft border-danger/40",
  ghost: "bg-transparent text-muted hover:text-ink border-transparent",
};

export function Button({
  tone = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_TONES[tone]} ${className}`}
      {...props}
    />
  );
}

type BadgeTone = "neutral" | "ok" | "danger" | "warn" | "accent";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-canvas text-muted border-line",
  ok: "bg-ok-soft text-ok border-ok/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  accent: "bg-accent-soft text-accent border-accent/20",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-px text-xs whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Banner({
  tone,
  children,
  action,
}: {
  tone: "error" | "info" | "success";
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    error: "border-danger/25 bg-danger-soft text-danger",
    info: "border-line bg-panel text-ink",
    success: "border-ok/25 bg-ok-soft text-ok",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[13px] ${tones[tone]}`}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-8 rounded-md border border-line-strong bg-panel px-2.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-8 rounded-md border border-line-strong bg-panel px-2 text-[13px] outline-none focus:border-accent ${className}`}
      {...props}
    />
  );
}

export function Panel({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      {title ? (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-xs text-muted">
            {head.map((label) => (
              <th key={label} className="px-3 py-2 font-medium whitespace-nowrap">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty ? <p className="px-3 py-8 text-center text-[13px] text-muted">{empty}</p> : null}
    </div>
  );
}

export function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}
