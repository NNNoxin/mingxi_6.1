"use client";

import { StaffMe, type AdminPermission } from "@mingxi/contracts";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AdminApiError, adminGet } from "./api";
import { currentAccount, signOut } from "./auth-client";
import { TwoFactorSetup } from "./components/TwoFactorSetup";
import { Badge, Banner, Button, type ButtonTone } from "./components/ui";
import { ROLE_LABELS } from "./format";
import { DENIAL_MESSAGES } from "./messages";

type State =
  | { kind: "loading" }
  | { kind: "ready"; me: StaffMe }
  | { kind: "setup_two_factor"; email: string }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

const StaffContext = createContext<StaffMe | null>(null);

/** 当前工作人员（只在已通过检查的页面里可用）。 */
export function useStaff(): StaffMe {
  const me = useContext(StaffContext);
  if (!me) throw new Error("useStaff 只能在 ConsoleShell 内使用");
  return me;
}

export function useCan(): (permission: AdminPermission) => boolean {
  const me = useStaff();
  return (permission) => me.permissions.includes(permission);
}

export function loginUrl(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * 退出后回到登录页（敏感操作需要重新登录时也用它）。退出没成功就报错、留在原页：
 * 不能在会话还有效时把人带到登录页，让他以为已经退出（共用电脑上尤其危险）。
 */
async function signOutAndLogin(next: string): Promise<void> {
  const outcome = await signOut();
  if (!outcome.ok) {
    throw new Error(
      outcome.status === 0
        ? "连不上服务器，没能退出，请重试"
        : `没能退出（HTTP ${String(outcome.status)}），请重试`,
    );
  }
  window.location.assign(loginUrl(next));
}

/** 退出并回到登录页的按钮；退出失败时在按钮旁显示原因。 */
export function SignOutButton({
  next,
  tone,
  children,
}: {
  next: string;
  tone?: ButtonTone;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click() {
    setBusy(true);
    setError(null);
    try {
      await signOutAndLogin(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      <Button tone={tone} disabled={busy} onClick={() => void click()}>
        {children}
      </Button>
    </span>
  );
}

const NAV: { href: string; label: string; permission: AdminPermission }[] = [
  { href: "/users", label: "用户", permission: "users.read" },
  { href: "/audit", label: "审计日志", permission: "audit.read" },
  { href: "/email", label: "邮件投递", permission: "jobs.read" },
  { href: "/staff", label: "工作人员", permission: "staff.manage" },
];

/** 把 /me 的失败翻译成外框要显示的状态；没登录直接跳转登录页。 */
async function diagnose(error: unknown): Promise<State> {
  if (!(error instanceof AdminApiError)) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (error.status === 401) {
    window.location.replace(loginUrl(currentPath()));
    return { kind: "loading" };
  }
  if (error.reason === "mfa_required") {
    try {
      const account = await currentAccount();
      if (account && !account.twoFactorEnabled) return { kind: "setup_two_factor", email: account.email };
    } catch (accountError) {
      return {
        kind: "error",
        message: accountError instanceof Error ? accountError.message : String(accountError),
      };
    }
    return { kind: "blocked", message: "这次登录没有经过两步验证。请退出后用密码和验证码重新登录。" };
  }
  if (error.reason) return { kind: "blocked", message: DENIAL_MESSAGES[error.reason] };
  return { kind: "error", message: error.message };
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * 后台外框：确认当前浏览器是通过检查的工作人员后才渲染页面。
 * 没登录跳到登录页；没开两步验证就地引导开启；本次登录没经过两步验证则要求退出后用验证码重新登录。
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      setState({ kind: "ready", me: await adminGet("/me", StaffMe) });
    } catch (error) {
      setState(await diagnose(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") return <p className="p-8 text-[13px] text-muted">正在确认登录状态…</p>;
  if (state.kind === "setup_two_factor") {
    return <TwoFactorSetup email={state.email} onEnabled={() => void load()} />;
  }
  if (state.kind === "blocked" || state.kind === "error") {
    return (
      <div className="mx-auto mt-16 w-[480px] max-w-[calc(100vw-32px)]">
        <Banner
          tone="error"
          action={
            <SignOutButton next="/users">
              {state.kind === "blocked" ? "退出并重新登录" : "重新登录"}
            </SignOutButton>
          }
        >
          {state.message}
        </Banner>
      </div>
    );
  }

  const { me } = state;
  return (
    <StaffContext.Provider value={me}>
      <div className="flex min-h-screen">
        <aside className="w-52 shrink-0 border-r border-line bg-panel">
          <div className="border-b border-line px-4 py-3.5">
            <span className="font-brand text-[19px]">明晰</span>
            <span className="ml-1.5 text-xs text-muted">运营后台</span>
          </div>
          <nav className="p-2" aria-label="后台导航">
            {NAV.filter((item) => me.permissions.includes(item.permission)).map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-1.5 text-[13px] ${
                    active ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-canvas"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex h-12 items-center justify-end gap-3 border-b border-line bg-panel px-5 text-[13px]">
            <span className="text-muted">{me.email}</span>
            <Badge tone="accent">{ROLE_LABELS[me.role]}</Badge>
            <SignOutButton next="/users" tone="ghost">
              退出
            </SignOutButton>
          </header>
          <main className="p-5">{children}</main>
        </div>
      </div>
    </StaffContext.Provider>
  );
}
