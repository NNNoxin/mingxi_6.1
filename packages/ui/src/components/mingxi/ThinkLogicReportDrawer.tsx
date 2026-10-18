"use client";

import type { CSSProperties } from "react";
import type { DemoEdge, DemoNode } from "../../lib/mingxi/web/think-replay-types";

export type ReportChatItem = {
  role: "user" | "assistant" | "thinking";
  text: string;
};

function cleanText(value: string): string {
  return value
    .replace(/\[cite:[^\]]+\]/gi, "")
    .replace(/\{\{cite:[^}]+\}\}/gi, "")
    .replace(/^#{1,6}\s*/g, "")
    .replace(/^[-*>\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function compact(value: string, max: number): string {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sourceKindOf(node: DemoNode): "library" | "web" | "structure" {
  if (node.sourceKind === "web") return "web";
  if (node.sourceKind === "library" || node.kind === "note") return "library";
  return "structure";
}

function keyPointsOf(chat: ReportChatItem[], nodes: DemoNode[]): string[] {
  const seen = new Set<string>();
  const points: string[] = [];
  const assistantLines = chat
    .filter((item) => item.role === "assistant")
    .flatMap((item) => item.text.split("\n"));

  for (const raw of assistantLines) {
    const line = cleanText(raw.replace(/^\d+[.)]\s*/, ""));
    if (line.length < 12 || line.length > 150 || seen.has(line)) continue;
    if (/^(意图|角度|联网|主逻辑链|仓库笔记|网络来源)/.test(line)) continue;
    seen.add(line);
    points.push(line);
    if (points.length >= 8) break;
  }

  if (points.length < 5) {
    for (const node of nodes) {
      if (node.reportAction || node.kind === "intent") continue;
      const point = compact(`${node.label}${node.sub ? `：${node.sub}` : ""}`, 110);
      if (!point || seen.has(point)) continue;
      seen.add(point);
      points.push(point);
      if (points.length >= 8) break;
    }
  }
  return points;
}

function LogicReportPreview({ nodes, edges }: { nodes: DemoNode[]; edges: DemoEdge[] }) {
  if (!nodes.length) return <p className="tld-report-empty">暂无逻辑图。</p>;
  const minX = Math.min(...nodes.map((node) => node.x)) - 38;
  const minY = Math.min(...nodes.map((node) => node.y)) - 34;
  const maxX = Math.max(...nodes.map((node) => node.x + 150)) + 38;
  const maxY = Math.max(...nodes.map((node) => node.y + 54)) + 34;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  function nodeTone(node: DemoNode) {
    if (node.reportAction || node.kind === "action") {
      return { fill: "#24221f", stroke: "#24221f", text: "#fff" };
    }
    if (sourceKindOf(node) === "web") {
      return { fill: "#e4f3fb", stroke: "#4d94b9", text: "#245f82" };
    }
    if (sourceKindOf(node) === "library") {
      return { fill: "#f8eee2", stroke: "#c9986e", text: "#744a2d" };
    }
    if (node.kind === "intent") {
      return { fill: "#fff3ed", stroke: "#c57a62", text: "#7a4433" };
    }
    if (node.kind === "branch") {
      return { fill: "#eef5f1", stroke: "#5c9278", text: "#315e48" };
    }
    return { fill: "#fffdfa", stroke: "#aaa096", text: "#3b3732" };
  }

  return (
    <svg
      className="tld-report-map"
      viewBox={`${minX} ${minY} ${Math.max(320, maxX - minX)} ${Math.max(180, maxY - minY)}`}
      role="img"
      aria-label="本次会话逻辑图缩略图"
    >
      <defs>
        <marker id="tld-report-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 1.5 9 5 0 8.5Z" fill="#a49b91" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.x + 72;
        const y1 = from.y + 24;
        const x2 = to.x + 72;
        const y2 = to.y + 24;
        const bend = Math.max(28, Math.abs(x2 - x1) * 0.35);
        return (
          <path
            key={edge.id}
            d={`M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={edge.tone === "break" ? "#4d876b" : edge.tone === "loop" ? "#c57a62" : "#b8afa5"}
            strokeWidth={edge.tone ? 2.2 : 1.4}
            strokeDasharray={edge.tone === "warn" ? "5 4" : undefined}
            markerEnd="url(#tld-report-arrow)"
          />
        );
      })}
      {nodes.map((node) => {
        const tone = nodeTone(node);
        return (
          <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
            <rect width="144" height="48" rx="12" fill={tone.fill} stroke={tone.stroke} strokeWidth="1.4" />
            <text x="10" y="18" fill={tone.text} fontSize="8.5" fontWeight="700" opacity="0.7">
              {node.reportAction ? "REPORT" : node.badge || node.kind.toUpperCase()}
            </text>
            <text x="10" y="34" fill={tone.text} fontSize="10.5" fontWeight="650">
              {compact(node.label, 18)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ThinkLogicReportDrawer({
  open,
  onClose,
  title,
  branch,
  chat,
  nodes,
  edges,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  branch: string;
  chat: ReportChatItem[];
  nodes: DemoNode[];
  edges: DemoEdge[];
}) {
  const reportNodes = nodes.filter((node) => !node.reportAction);
  const points = keyPointsOf(chat, reportNodes);
  const libraryCount = reportNodes.filter((node) => sourceKindOf(node) === "library").length;
  const webCount = reportNodes.filter((node) => sourceKindOf(node) === "web").length;
  const structureCount = Math.max(0, reportNodes.length - libraryCount - webCount);
  const sourceTotal = Math.max(1, libraryCount + webCount + structureCount);
  const libraryDeg = (libraryCount / sourceTotal) * 360;
  const webDeg = libraryDeg + (webCount / sourceTotal) * 360;
  const kindRows = (["spine", "branch", "note", "action"] as const).map((kind) => ({
    kind,
    label: { spine: "主链", branch: "分支", note: "证据笔记", action: "行动" }[kind],
    value: reportNodes.filter((node) => node.kind === kind).length,
  }));
  const maxKind = Math.max(1, ...kindRows.map((row) => row.value));
  const latestAnswer = [...chat].reverse().find((item) => item.role === "assistant")?.text || "";
  const overview = latestAnswer
    .split("\n")
    .map(cleanText)
    .find((line) => line.length >= 30 && line.length <= 260) || points[0] || branch;
  const actionItems = reportNodes.filter((node) => node.kind === "action").slice(0, 5);
  const conclusion = points.at(-1) || actionItems.at(-1)?.label || "将本次梳理转化为一个可执行的下一步。";

  return (
    <aside
      className={`tld-report-drawer${open ? " is-open" : ""}`}
      aria-hidden={!open}
      aria-label="总结报告"
    >
      <header className="tld-report-head">
        <div>
          <em>CONVERSATION REPORT · HTML</em>
          <h2>{title} · 梳理总结</h2>
          <p>{branch}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭总结报告">×</button>
      </header>

      <div className="tld-report-scroll">
        <article className="tld-report-page">
          <section className="tld-report-hero">
            <div>
              <span>本次梳理的核心命题</span>
              <h3>{branch}</h3>
              <p>{compact(overview, 230)}</p>
            </div>
            <div className="tld-report-seal" aria-hidden>
              <b>已收束</b>
              <span>用户主动生成</span>
            </div>
          </section>

          <section className="tld-report-kpis" aria-label="报告摘要数据">
            <div><span>对话记录</span><strong>{chat.filter((item) => item.role !== "thinking").length}</strong><em>条</em></div>
            <div><span>逻辑节点</span><strong>{reportNodes.length}</strong><em>个</em></div>
            <div><span>本库证据</span><strong>{libraryCount}</strong><em>篇</em></div>
            <div><span>网页来源</span><strong>{webCount}</strong><em>页</em></div>
          </section>

          <section className="tld-report-section">
            <header><span>01</span><div><em>LOGIC OVERVIEW</em><h3>逻辑全景</h3></div></header>
            <p className="tld-report-caption">保留 Converse 画布的节点、连线与来源色，用于回看“结论如何长出来”。</p>
            <div className="tld-report-map-wrap"><LogicReportPreview nodes={nodes} edges={edges} /></div>
          </section>

          <section className="tld-report-chart-grid">
            <div className="tld-report-chart-card">
              <header><em>SOURCE MIX</em><h3>证据来源结构</h3></header>
              <div className="tld-report-donut-row">
                <div
                  className="tld-report-donut"
                  style={{ "--report-lib": `${libraryDeg}deg`, "--report-web": `${webDeg}deg` } as CSSProperties}
                ><span><b>{reportNodes.length}</b>节点</span></div>
                <ul>
                  <li><i className="is-library" /><span>本库笔记</span><b>{libraryCount}</b></li>
                  <li><i className="is-web" /><span>网页结果</span><b>{webCount}</b></li>
                  <li><i className="is-structure" /><span>逻辑结构</span><b>{structureCount}</b></li>
                </ul>
              </div>
            </div>

            <div className="tld-report-chart-card">
              <header><em>NODE DENSITY</em><h3>逻辑层级密度</h3></header>
              <ul className="tld-report-bars">
                {kindRows.map((row) => (
                  <li key={row.kind}>
                    <span>{row.label}</span>
                    <i><b style={{ width: `${(row.value / maxKind) * 100}%` }} /></i>
                    <em>{row.value}</em>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="tld-report-section">
            <header><span>02</span><div><em>KEY FINDINGS</em><h3>关键信息</h3></div></header>
            <ol className="tld-report-findings">
              {points.map((point, index) => (
                <li key={`${index}-${point}`}><b>{String(index + 1).padStart(2, "0")}</b><p>{point}</p></li>
              ))}
            </ol>
          </section>

          <section className="tld-report-section">
            <header><span>03</span><div><em>EVIDENCE TABLE</em><h3>逻辑节点与证据表</h3></div></header>
            <div className="tld-report-table-wrap">
              <table>
                <thead><tr><th>#</th><th>节点</th><th>角色</th><th>来源</th><th>状态</th></tr></thead>
                <tbody>
                  {reportNodes.slice(0, 14).map((node, index) => (
                    <tr key={node.id}>
                      <td>{String(index + 1).padStart(2, "0")}</td>
                      <td><strong>{node.label}</strong>{node.sub ? <small>{node.sub}</small> : null}</td>
                      <td>{({ intent: "意图", spine: "主链", branch: "分支", note: "证据", action: "行动", gate: "检查点" } as const)[node.kind]}</td>
                      <td><span className={`tld-report-source is-${sourceKindOf(node)}`}>{sourceKindOf(node) === "web" ? "网页" : sourceKindOf(node) === "library" ? "本库" : "结构"}</span></td>
                      <td>{node.done ? "已确认" : "待执行"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tld-report-section">
            <header><span>04</span><div><em>NEXT ACTIONS</em><h3>收束与下一步</h3></div></header>
            <div className="tld-report-actions">
              {(actionItems.length ? actionItems : reportNodes.slice(-3)).map((node, index) => (
                <div key={node.id}><b>{index + 1}</b><span>{node.label}</span><em>{node.done ? "已具备条件" : "建议下一步执行"}</em></div>
              ))}
            </div>
          </section>

          <section className="tld-report-conclusion">
            <span>FINAL TAKEAWAY</span>
            <h3>最后关键信息</h3>
            <p>{conclusion}</p>
          </section>

          <footer className="tld-report-foot">明晰 · 会话逻辑总结报告 <span>基于当前对话与画布实时生成</span></footer>
        </article>
      </div>
    </aside>
  );
}
