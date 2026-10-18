/**
 * 梳理逻辑 Demo · 共享类型（避免 script / stm 循环依赖）
 */

export type DemoNodeKind =
  | "intent"
  | "spine"
  | "branch"
  | "note"
  | "action"
  | "gate";

export type DemoNode = {
  id: string;
  label: string;
  sub?: string;
  kind: DemoNodeKind;
  x: number;
  y: number;
  badge?: string;
  done?: boolean;
  noteId?: string;
  /** 用于在同一逻辑图中区分本库笔记与联网网页 */
  sourceKind?: "library" | "web";
  /** 联网节点可点击回到原始页面 */
  sourceUrl?: string;
  /** 联网结果侧栏需要展示的原始标题、摘要与标签 */
  sourceSummary?: string;
  sourceTags?: string[];
  sourceTitle?: string;
  /** 用户主动收束会话后生成的可视化报告入口 */
  reportAction?: boolean;
};

export type DemoEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** 画布强调：负闭环回流 / 破局 / 警告支路 */
  tone?: "loop" | "break" | "warn";
};

export type ClarifyOption = {
  id: string;
  label: string;
  desc: string;
  level: string;
};

export type DemoChatItem =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      options?: ClarifyOption[];
      autoPick?: string[];
    }
  | { id: string; role: "thinking"; text: string };

export type DemoStep = {
  id: string;
  title: string;
  holdMs: number;
  chat: DemoChatItem[];
  graph?: { nodes: DemoNode[]; edges: DemoEdge[] };
  highlightIds?: string[];
  canvasHint?: string;
  phase?: "clarify" | "draft" | "extend" | "final";
};

export type DemoSessionPreset = {
  id: string;
  title: string;
  subtitle: string;
  branch: string;
  canvasTitle: string;
  when: string;
  script: DemoStep[];
  seedRemembered?: boolean;
};
