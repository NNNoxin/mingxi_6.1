import type { Metadata } from "next";
import { StaffView } from "../../../src/views/StaffView";

export const metadata: Metadata = { title: "工作人员" };

export default function Page() {
  return <StaffView />;
}
