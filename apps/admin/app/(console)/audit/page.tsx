import type { Metadata } from "next";
import { AuditView } from "../../../src/views/AuditView";

export const metadata: Metadata = { title: "审计日志" };

export default function Page() {
  return <AuditView />;
}
