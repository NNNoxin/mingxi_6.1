import type { Metadata } from "next";
import { EmailView } from "../../../src/views/EmailView";

export const metadata: Metadata = { title: "邮件投递" };

export default function Page() {
  return <EmailView />;
}
