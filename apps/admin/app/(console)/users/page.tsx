import type { Metadata } from "next";
import { UsersView } from "../../../src/views/UsersView";

export const metadata: Metadata = { title: "用户" };

export default function Page() {
  return <UsersView />;
}
