import type { ReactNode } from "react";
import { ConsoleShell } from "../../src/staff-context";

export default function ConsoleLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
