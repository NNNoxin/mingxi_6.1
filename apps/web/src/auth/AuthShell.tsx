import type { ReactNode } from "react";
import "@mingxi/ui/components/mingxi/web-workbench.css";
import "./auth.css";
import { WORKBENCH_PATH } from "./paths";

/**
 * 登录 / 注册等账号页面的外框（docs/00 D5c：基准版本没有登录界面，按工作台风格新做）。
 * 顶栏、底色、字体直接沿用工作台的 .mwb / .mwb-top / .mwb-brand；卡片与表单样式在 auth.css，取值来自工作台的配色变量。
 */
export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mwb mxa">
      <header className="mwb-top">
        <div className="mwb-brand">
          <a href={WORKBENCH_PATH}>明晰</a>
        </div>
      </header>
      <main className="mxa-main">
        <section className="mxa-card" aria-labelledby="mxa-title">
          <h1 id="mxa-title" className="mxa-title">
            {title}
          </h1>
          {lead ? <p className="mxa-lead">{lead}</p> : null}
          {children}
        </section>
        <p className="mxa-foot">你的笔记、对话与画像只属于你自己，按账号严格隔离。</p>
      </main>
    </div>
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `mxa-${String(input.name)}`;
  return (
    <div className="mxa-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...input} />
      {hint ? <p className="mxa-hint">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <div className={`mxa-alert is-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
