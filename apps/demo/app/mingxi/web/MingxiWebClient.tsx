"use client";

import dynamic from "next/dynamic";
import "@mingxi/ui/components/mingxi/web-workbench.css";

const WebWorkbench = dynamic(
  () => import("@mingxi/ui/components/mingxi/WebWorkbench").then((m) => m.WebWorkbench),
  {
    ssr: false,
    loading: () => (
      <div className="mwb mwb-boot">
        <div className="mwb-empty">加载网页工作台…</div>
      </div>
    ),
  },
);

export default function MingxiWebClient() {
  return <WebWorkbench />;
}
