"use client";

/**
 * 梳理逻辑 · 高保真前端回忆 Demo
 * 历史会话栏 · 左对话 · 右无限 2D 有向逻辑画布 · 「回忆」自动播放
 * 每个历史对话绑定独立画布状态。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_SESSION_PRESETS,
  buildSeededSessionState,
  type ClarifyOption,
  type DemoChatItem,
  type DemoEdge,
  type DemoNode,
  type DemoSessionPreset,
  type DemoStep,
} from "../../lib/mingxi/web/think-replay-script";
import {
  DEMO_NOTES_BY_ID,
  type DemoNoteCard,
} from "../../lib/mingxi/web/think-demo-notes";
import {
  NoteDetailDrawer,
  NoteHoverCard,
  RichAssistantText,
  WebDetailDrawer,
} from "./ThinkLogicNoteUi";
import { onTourCmd } from "../../lib/mingxi/demo/tour-bus";
import {
  layoutDemoGraph,
  layoutThinkGraph,
  type ThinkApiResponse,
} from "../../lib/mingxi/web/think-replay-live";
import { appendSummaryReportNode } from "../../lib/mingxi/web/think-replay-report";
import { ThinkLogicReportDrawer } from "./ThinkLogicReportDrawer";
import "./think-logic-demo.css";

type Pos = { x: number; y: number };

type VisibleChat =
  | Extract<DemoChatItem, { role: "user" | "thinking" }>
  | (Extract<DemoChatItem, { role: "assistant" }> & {
      picked?: string[];
      revealOptions?: boolean;
    });

type SessionRuntime = {
  chat: VisibleChat[];
  nodes: DemoNode[];
  edges: DemoEdge[];
  phase?: DemoStep["phase"];
  canvasHint: string;
  stepIndex: number;
  pan: { x: number; y: number };
  scale: number;
  positions: Record<string, Pos>;
  title: string;
  subtitle: string;
  branch: string;
  canvasTitle: string;
  when: string;
  /** 绑定的回忆脚本（新对话可为空脚本） */
  script: DemoStep[];
  isSample?: boolean;
  webSearchOn: boolean;
  agentSessionId: string | null;
};

const NODE_W: Record<DemoNode["kind"], number> = {
  intent: 200,
  spine: 188,
  branch: 176,
  note: 156,
  action: 200,
  gate: 188,
};
const NODE_H = 64;
const THINK_REQUEST_TIMEOUT_MS = 90_000;
const SUMMARY_REQUEST_PATTERN =
  /(?:帮我总结|总结一下|汇总一下|收束一下|生成(?:一份)?(?:总结)?报告)/;

function curvePath(a: Pos, b: Pos): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const vertical = Math.abs(dy) > Math.abs(dx) * 0.75;
  if (vertical) {
    const c = Math.min(72, dist * 0.32);
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + c}, ${b.x} ${b.y - c}, ${b.x} ${b.y}`;
  }
  const c = Math.min(100, dist * 0.38);
  const sx = Math.sign(dx) || 1;
  return `M ${a.x} ${a.y} C ${a.x + sx * c} ${a.y}, ${b.x - sx * c} ${b.y}, ${b.x} ${b.y}`;
}

function nodeAnchor(n: DemoNode, toward: Pos): Pos {
  const w = NODE_W[n.kind];
  const h = NODE_H;
  const cx = n.x + w / 2;
  const cy = n.y + h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: cx + Math.sign(dx) * (w / 2 - 4), y: cy };
  }
  return { x: cx, y: cy + Math.sign(dy || 1) * (h / 2 - 4) };
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function toVisibleChat(items: DemoChatItem[]): VisibleChat[] {
  return items.map((item) => {
    if (item.role !== "assistant") return item;
    return {
      ...item,
      revealOptions: Boolean(item.options?.length),
      picked: item.autoPick ? [...item.autoPick] : [],
    };
  });
}

function runtimeFromPreset(preset: DemoSessionPreset): SessionRuntime {
  const seed = buildSeededSessionState(preset);
  const laidOut = layoutDemoGraph(seed.nodes, seed.edges);
  return {
    chat: toVisibleChat(seed.chat),
    nodes: laidOut.nodes,
    edges: laidOut.edges,
    phase: seed.phase,
    canvasHint: seed.canvasHint,
    stepIndex: seed.stepIndex,
    pan: { x: 40, y: 28 },
    scale: seed.nodes.length > 12 ? 0.78 : 0.92,
    positions: {},
    title: preset.title,
    subtitle: preset.subtitle,
    branch: preset.branch,
    canvasTitle: preset.canvasTitle,
    when: preset.when,
    script: preset.script,
    isSample: true,
    webSearchOn: false,
    agentSessionId: null,
  };
}

function emptyRuntime(partial?: Partial<SessionRuntime>): SessionRuntime {
  return {
    chat: [],
    nodes: [],
    edges: [],
    phase: undefined,
    canvasHint: "点击「回忆」播放，或描述你想怎么梳（演示态）",
    stepIndex: -1,
    pan: { x: 40, y: 28 },
    scale: 0.92,
    positions: {},
    title: "新对话",
    subtitle: "空白工作区",
    branch: "方向未定 · 等待你的意图",
    canvasTitle: "新逻辑画布",
    when: "现在",
    script: DEMO_SESSION_PRESETS[0].script,
    isSample: false,
    webSearchOn: false,
    agentSessionId: null,
    ...partial,
  };
}

function PhasePill({ phase }: { phase?: DemoStep["phase"] }) {
  const map = {
    clarify: { label: "澄清中", cls: "is-clarify" },
    draft: { label: "起草中", cls: "is-draft" },
    extend: { label: "延伸中", cls: "is-extend" },
    final: { label: "已收束", cls: "is-final" },
  } as const;
  const m = phase ? map[phase] : { label: "待命", cls: "" };
  return <span className={`tld-phase ${m.cls}`}>{m.label}</span>;
}

function initSessionMap(): { map: Record<string, SessionRuntime>; activeId: string } {
  const map: Record<string, SessionRuntime> = {};
  for (const p of DEMO_SESSION_PRESETS) {
    map[p.id] = runtimeFromPreset(p);
  }
  return { map, activeId: DEMO_SESSION_PRESETS[0].id };
}

export function ThinkLogicReplayDemo() {
  const boot = useMemo(() => initSessionMap(), []);
  const [sessions, setSessions] = useState<Record<string, SessionRuntime>>(boot.map);
  const [activeId, setActiveId] = useState(boot.activeId);

  const active = sessions[activeId] || boot.map[boot.activeId];

  const [chat, setChat] = useState<VisibleChat[]>(active.chat);
  const [nodes, setNodes] = useState<DemoNode[]>(active.nodes);
  const [edges, setEdges] = useState<DemoEdge[]>(active.edges);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [canvasHint, setCanvasHint] = useState(active.canvasHint);
  const [phase, setPhase] = useState<DemoStep["phase"] | undefined>(active.phase);
  const [stepIndex, setStepIndex] = useState(active.stepIndex);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [webSearchOn, setWebSearchOn] = useState(active.webSearchOn);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(active.agentSessionId);
  const [sending, setSending] = useState(false);
  const [leftTab, setLeftTab] = useState<"messages" | "thinking">("messages");
  const [pan, setPan] = useState(active.pan);
  const [scale, setScale] = useState(active.scale);
  const [drawerNote, setDrawerNote] = useState<DemoNoteCard | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWeb, setDrawerWeb] = useState<DemoNode | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [hoverNote, setHoverNote] = useState<{
    note: DemoNoteCard;
    x: number;
    y: number;
  } | null>(null);
  const hoverLeaveTimer = useRef<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pauseGate = useRef<{ wait: Promise<void>; release: () => void } | null>(null);
  const dragNode = useRef<{ id: string; ox: number; oy: number; px: number; py: number } | null>(
    null,
  );
  const nodeDragMoved = useRef(false);
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const positionsOverride = useRef<Record<string, Pos>>(active.positions);
  const activeIdRef = useRef(activeId);
  const scriptRef = useRef(active.script);
  const sessionsRef = useRef(sessions);
  const newSessionCounter = useRef(0);
  const liveMessageCounter = useRef(0);
  const liveRef = useRef({
    chat: active.chat,
    nodes: active.nodes,
    edges: active.edges,
    phase: active.phase,
    canvasHint: active.canvasHint,
    stepIndex: active.stepIndex,
    pan: active.pan,
    scale: active.scale,
    webSearchOn: active.webSearchOn,
    agentSessionId: active.agentSessionId,
  });

  useEffect(() => {
    activeIdRef.current = activeId;
    scriptRef.current = sessions[activeId]?.script || active.script;
    sessionsRef.current = sessions;
  }, [activeId, active.script, sessions]);

  useEffect(() => {
    liveRef.current = {
      chat,
      nodes,
      edges,
      phase,
      canvasHint,
      stepIndex,
      pan,
      scale,
      webSearchOn,
      agentSessionId,
    };
  }, [
    chat,
    nodes,
    edges,
    phase,
    canvasHint,
    stepIndex,
    pan,
    scale,
    webSearchOn,
    agentSessionId,
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, playing]);

  const applyGraph = useCallback((graph: { nodes: DemoNode[]; edges: DemoEdge[] }, hi?: string[]) => {
    const laidOut = layoutDemoGraph(graph.nodes, graph.edges);
    positionsOverride.current = Object.fromEntries(
      laidOut.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );
    setNodes(laidOut.nodes);
    setEdges(laidOut.edges);
    setHighlightIds(hi || []);
    if (hi?.length) {
      window.setTimeout(() => setHighlightIds([]), 2200);
    }
    window.requestAnimationFrame(() => fitViewForNodes(laidOut.nodes));
  }, []);

  const snapshotInto = useCallback((map: Record<string, SessionRuntime>, id: string) => {
    const prev = map[id];
    const live = liveRef.current;
    return {
      ...map,
      [id]: {
        ...(prev || emptyRuntime()),
        chat: live.chat,
        nodes: live.nodes,
        edges: live.edges,
        phase: live.phase,
        canvasHint: live.canvasHint,
        stepIndex: live.stepIndex,
        pan: live.pan,
        scale: live.scale,
        webSearchOn: live.webSearchOn,
        agentSessionId: live.agentSessionId,
        positions: { ...positionsOverride.current },
        when: prev?.when || "现在",
      } satisfies SessionRuntime,
    };
  }, []);

  const hydrateSession = useCallback((rt: SessionRuntime) => {
    abortRef.current?.abort();
    abortRef.current = null;
    pauseGate.current = null;
    setPlaying(false);
    setPaused(false);
    positionsOverride.current = { ...rt.positions };
    setChat(rt.chat);
    setNodes(rt.nodes);
    setEdges(rt.edges);
    setPhase(rt.phase);
    setCanvasHint(rt.canvasHint);
    setStepIndex(rt.stepIndex);
    setPan(rt.pan);
    setScale(rt.scale);
    setWebSearchOn(rt.webSearchOn);
    setAgentSessionId(rt.agentSessionId);
    setSending(false);
    setHighlightIds([]);
    setSelectedId(null);
    setLeftTab("messages");
    setComposer("");
    setDrawerOpen(false);
    setDrawerNote(null);
    setDrawerWeb(null);
    setReportOpen(false);
    setHoverNote(null);
  }, []);

  function openNoteDrawer(note: DemoNoteCard) {
    setHoverNote(null);
    setReportOpen(false);
    setDrawerWeb(null);
    // 再次点击同一引用 → 收起侧栏
    if (drawerOpen && drawerNote?.id === note.id) {
      setDrawerOpen(false);
      return;
    }
    setDrawerNote(note);
    setDrawerOpen(true);
  }

  function closeNoteDrawer() {
    setDrawerOpen(false);
  }

  function openWebDrawer(node: DemoNode) {
    setHoverNote(null);
    setReportOpen(false);
    setDrawerNote(null);
    setDrawerWeb((current) => (current?.id === node.id ? null : node));
    setDrawerOpen(false);
  }

  function closeWebDrawer() {
    setDrawerWeb(null);
  }

  function scheduleCiteHover(note: DemoNoteCard, clientX: number, clientY: number) {
    if (hoverLeaveTimer.current) {
      window.clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    }
    setHoverNote({
      note,
      x: clientX + 14,
      y: Math.max(12, clientY - 72),
    });
  }

  function scheduleCiteLeave() {
    if (hoverLeaveTimer.current) window.clearTimeout(hoverLeaveTimer.current);
    hoverLeaveTimer.current = window.setTimeout(() => setHoverNote(null), 120);
  }

  /** 鼠标进入左半（历史栏+对话）自动收起笔记侧栏 */
  function onLeftZoneEnter() {
    if (drawerOpen) closeNoteDrawer();
    if (drawerWeb) closeWebDrawer();
    if (reportOpen) setReportOpen(false);
  }

  function switchSession(id: string) {
    if (id === activeIdRef.current) return;
    const fromId = activeIdRef.current;
    const next = snapshotInto(sessionsRef.current, fromId);
    const target = next[id];
    if (!target) return;
    sessionsRef.current = next;
    setSessions(next);
    setActiveId(id);
    hydrateSession(target);
  }

  function createSession() {
    const fromId = activeIdRef.current;
    const base = snapshotInto(sessionsRef.current, fromId);
    newSessionCounter.current += 1;
    const id = `ws-new-${Object.keys(base).length}-${newSessionCounter.current}`;
    const fresh = emptyRuntime({
      title: `对话 ${Object.keys(base).length}`,
      when: "现在",
    });
    const next = { ...base, [id]: fresh };
    sessionsRef.current = next;
    setSessions(next);
    setActiveId(id);
    hydrateSession(fresh);
  }

  const resetDemo = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    positionsOverride.current = {};
    setChat([]);
    setNodes([]);
    setEdges([]);
    setHighlightIds([]);
    setCanvasHint("点击「回忆」自动播放完整梳链");
    setPhase(undefined);
    setStepIndex(-1);
    setPlaying(false);
    setPaused(false);
    setSelectedId(null);
    setPan({ x: 40, y: 28 });
    setScale(0.92);
    setAgentSessionId(null);
    setSending(false);
    setReportOpen(false);
    pauseGate.current = null;
  }, []);

  async function waitWhilePaused(signal: AbortSignal) {
    while (pauseGate.current) {
      await Promise.race([
        pauseGate.current.wait,
        new Promise<void>((_, rej) => {
          signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), {
            once: true,
          });
        }),
      ]);
    }
  }

  async function playReplay() {
    const script = scriptRef.current;
    if (!script.length) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const sessionAtStart = activeIdRef.current;
    positionsOverride.current = {};
    setChat([]);
    setNodes([]);
    setEdges([]);
    setHighlightIds([]);
    setPlaying(true);
    setPaused(false);
    pauseGate.current = null;
    setPan({ x: 40, y: 28 });
    setScale(0.92);
    setLeftTab("messages");

    try {
      for (let i = 0; i < script.length; i++) {
        if (ac.signal.aborted) break;
        if (activeIdRef.current !== sessionAtStart) break;
        await waitWhilePaused(ac.signal);
        const step = script[i];
        setStepIndex(i);
        setPhase(step.phase);
        if (step.canvasHint) setCanvasHint(step.canvasHint);

        await sleep(step.holdMs, ac.signal);
        await waitWhilePaused(ac.signal);

        for (const item of step.chat) {
          if (ac.signal.aborted || activeIdRef.current !== sessionAtStart) break;
          await waitWhilePaused(ac.signal);

          if (item.role === "thinking") {
            setLeftTab("thinking");
            setChat((prev) => [...prev, item]);
            await sleep(700, ac.signal);
            continue;
          }

          setLeftTab("messages");

          if (item.role === "user") {
            setChat((prev) => [...prev, item]);
            await sleep(520, ac.signal);
            continue;
          }

          const withOpts: VisibleChat = {
            ...item,
            revealOptions: Boolean(item.options?.length),
            picked: [],
          };
          setChat((prev) => [...prev, withOpts]);
          await sleep(640, ac.signal);

          if (item.options?.length && item.autoPick?.length) {
            await sleep(900, ac.signal);
            await waitWhilePaused(ac.signal);
            for (const oid of item.autoPick) {
              setChat((prev) =>
                prev.map((c) =>
                  c.id === item.id && c.role === "assistant"
                    ? { ...c, picked: [...(c.picked || []), oid] }
                    : c,
                ),
              );
              await sleep(380, ac.signal);
            }
          }
        }

        if (step.graph && activeIdRef.current === sessionAtStart) {
          applyGraph(step.graph, step.highlightIds);
          await sleep(500, ac.signal);
        }
      }
      setPlaying(false);
      if (activeIdRef.current === sessionAtStart) {
        setCanvasHint("回忆播放完成 · 可拖拽微调，或切换左侧历史会话");
        // 回写当前会话摘要
        setSessions((prev) => {
          const cur = prev[sessionAtStart];
          if (!cur) return prev;
          const live = liveRef.current;
          const next = {
            ...prev,
            [sessionAtStart]: {
              ...cur,
              chat: live.chat,
              nodes: live.nodes,
              edges: live.edges,
              phase: live.phase,
              canvasHint: "回忆播放完成 · 画布已记忆",
              stepIndex: live.stepIndex,
              pan: live.pan,
              scale: live.scale,
              positions: { ...positionsOverride.current },
              when: "刚刚",
              subtitle:
                live.nodes.length > 0
                  ? `${live.nodes.length} 节点 · 已记忆`
                  : cur.subtitle,
            },
          };
          sessionsRef.current = next;
          return next;
        });
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") console.error(err);
      setPlaying(false);
    }
  }

  const playReplayRef = useRef(playReplay);

  useEffect(() => {
    playReplayRef.current = playReplay;
  });

  useEffect(() => {
    return onTourCmd((cmd) => {
      if (cmd.type === "web.playThinkReplay") {
        void playReplayRef.current();
      }
    });
  }, []);

  function togglePause() {
    if (!playing) return;
    if (!paused) {
      setPaused(true);
      let release!: () => void;
      const wait = new Promise<void>((r) => {
        release = r;
      });
      pauseGate.current = { wait, release };
    } else {
      setPaused(false);
      pauseGate.current?.release();
      pauseGate.current = null;
    }
  }

  function onPickOption(msgId: string, opt: ClarifyOption) {
    if (playing) return;
    setChat((prev) =>
      prev.map((c) => {
        if (c.id !== msgId || c.role !== "assistant") return c;
        const picked = c.picked || [];
        const next = picked.includes(opt.id)
          ? picked.filter((x) => x !== opt.id)
          : [...picked, opt.id];
        return { ...c, picked: next };
      }),
    );
  }

  function createSummaryReport(requestText = "帮我总结一下") {
    if (!nodes.length || playing || sending) return;

    const runSessionId = activeIdRef.current;
    const result = appendSummaryReportNode(nodes, edges);
    if (!result.reportNode) return;

    if (nodes.some((node) => node.reportAction)) {
      setDrawerOpen(false);
      setDrawerWeb(null);
      setReportOpen(true);
      setSelectedId(result.reportNode.id);
      return;
    }

    liveMessageCounter.current += 1;
    const turnId = `${runSessionId}-report-${liveMessageCounter.current}`;
    const nextChat: VisibleChat[] = [
      ...chat,
      { id: `report-user-${turnId}`, role: "user", text: requestText },
      {
        id: `report-assistant-${turnId}`,
        role: "assistant",
        text:
          "已将这段对话收束为一份可视化报告：保留完整逻辑图、证据来源、关键要点与下一步。点击右侧黑色的「生成完整报告」卡片查看。",
      },
    ];
    const laidOut = layoutDemoGraph(result.nodes, result.edges);
    const positions = Object.fromEntries(
      laidOut.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );

    positionsOverride.current = positions;
    setComposer("");
    setDrawerWeb(null);
    setChat(nextChat);
    setNodes(laidOut.nodes);
    setEdges(laidOut.edges);
    setPhase("final");
    setCanvasHint("已收束 · 点击黑色报告卡片查看完整总结");
    setHighlightIds([result.reportNode.id]);
    setSelectedId(result.reportNode.id);
    window.requestAnimationFrame(() => fitViewForNodes(laidOut.nodes));
    window.setTimeout(() => setHighlightIds([]), 2200);

    setSessions((prev) => {
      const current = prev[runSessionId];
      if (!current) return prev;
      const next = {
        ...prev,
        [runSessionId]: {
          ...current,
          chat: nextChat,
          nodes: laidOut.nodes,
          edges: laidOut.edges,
          phase: "final" as const,
          canvasHint: "已生成可视化总结报告",
          positions,
          subtitle: `${laidOut.nodes.length - 1} 节点 · 已收束`,
          when: "刚刚",
        },
      };
      sessionsRef.current = next;
      return next;
    });
  }

  async function submitComposer() {
    const message = composer.trim();
    if (!message || playing || sending) return;
    if (nodes.length && SUMMARY_REQUEST_PATTERN.test(message)) {
      createSummaryReport(message);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let requestTimedOut = false;
    const requestTimer = window.setTimeout(() => {
      requestTimedOut = true;
      ac.abort();
    }, THINK_REQUEST_TIMEOUT_MS);
    const runSessionId = activeIdRef.current;
    const runSession = sessionsRef.current[runSessionId];
    const history = chat
      .filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.text,
      }));

    liveMessageCounter.current += 1;
    const turnId = `${runSessionId}-${liveMessageCounter.current}`;
    const userItem: VisibleChat = { id: `live-user-${turnId}`, role: "user", text: message };
    const thinkingItem: VisibleChat = {
      id: `live-thinking-${turnId}`,
      role: "thinking",
      text: webSearchOn
        ? "正在同时召回本库笔记并搜索公开网页…"
        : "正在召回本库笔记并梳理逻辑…",
    };

    setComposer("");
    setSending(true);
    setLeftTab("messages");
    setPhase("draft");
    setCanvasHint(webSearchOn ? "本库召回 + 联网搜索中…" : "本库召回中…");
    setChat((prev) => [...prev, userItem, thinkingItem]);

    try {
      const response = await fetch("/api/mingxi/think", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          message,
          history,
          mode: "agent",
          agentMode: "agent",
          thinkLevel: "balanced",
          webSearch: webSearchOn,
          sessionId: agentSessionId || undefined,
          workspaceId: runSessionId,
          workspaceTitle: runSession?.title,
          workspaceSubtitle: runSession?.subtitle,
          demo: Boolean(runSession?.isSample),
        }),
      });
      const data = (await response.json()) as ThinkApiResponse;
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || data.clarifyingQuestion || "梳理请求失败");
      }
      if (activeIdRef.current !== runSessionId) return;

      const graph = layoutThinkGraph(
        data.logicLine?.nodes || [],
        data.logicLine?.edges || [],
        data.citations || [],
      );
      const laidOutGraph = layoutDemoGraph(graph.nodes, graph.edges);
      const assistantItem: VisibleChat = {
        id: `live-assistant-${turnId}`,
        role: "assistant",
        text: data.answer?.trim() || "已完成梳理，结果已放入右侧画布。",
      };
      const nextChat = [...chat, userItem, assistantItem];
      const webNodeCount = laidOutGraph.nodes.filter((node) => node.sourceKind === "web").length;
      const libraryNodeCount = laidOutGraph.nodes.filter((node) => node.sourceKind === "library").length;
      const nextHint = laidOutGraph.nodes.length
        ? webNodeCount
          ? `已连入 ${libraryNodeCount} 个本库节点、${webNodeCount} 个网页节点`
          : `已连入 ${libraryNodeCount} 个本库节点`
        : "已返回回答，本轮未生成新的画布节点";

      setChat(nextChat);
      setAgentSessionId(data.sessionId || null);
      setPhase(graph.nodes.length ? "final" : "clarify");
      setCanvasHint(nextHint);
      setStepIndex(0);
      if (laidOutGraph.nodes.length) {
        positionsOverride.current = Object.fromEntries(
          laidOutGraph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
        );
        setNodes(laidOutGraph.nodes);
        setEdges(laidOutGraph.edges);
        setHighlightIds(
          graph.nodes
            .filter((node) => node.sourceKind === "web")
            .map((node) => node.id),
        );
        window.setTimeout(() => setHighlightIds([]), 2200);
        setPan({ x: 24, y: 20 });
        setScale(laidOutGraph.nodes.length > 14 ? 0.68 : 0.82);
        window.requestAnimationFrame(() => fitViewForNodes(laidOutGraph.nodes));
      }

      setSessions((prev) => {
        const current = prev[runSessionId];
        if (!current) return prev;
        const next = {
          ...prev,
          [runSessionId]: {
            ...current,
            chat: nextChat,
            nodes: laidOutGraph.nodes.length ? laidOutGraph.nodes : current.nodes,
            edges: laidOutGraph.nodes.length ? laidOutGraph.edges : current.edges,
            phase: laidOutGraph.nodes.length ? ("final" as const) : ("clarify" as const),
            canvasHint: nextHint,
            stepIndex: 0,
            pan: laidOutGraph.nodes.length ? { x: 24, y: 20 } : current.pan,
            scale: laidOutGraph.nodes.length ? (laidOutGraph.nodes.length > 14 ? 0.68 : 0.82) : current.scale,
            positions: laidOutGraph.nodes.length
              ? Object.fromEntries(laidOutGraph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
              : current.positions,
            subtitle: laidOutGraph.nodes.length ? `${laidOutGraph.nodes.length} 节点 · 已记忆` : current.subtitle,
            when: "刚刚",
            webSearchOn,
            agentSessionId: data.sessionId || null,
          },
        };
        sessionsRef.current = next;
        return next;
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && !requestTimedOut) return;
      if (activeIdRef.current !== runSessionId) return;
      const text = requestTimedOut
        ? "外部搜索 90 秒内未返回，已停止等待"
        : error instanceof Error
          ? error.message
          : "请求失败，请稍后重试";
      setChat((prev) => [
        ...prev.filter((item) => item.id !== thinkingItem.id),
        { id: `live-error-${turnId}`, role: "assistant", text: `这次没有梳成：${text}` },
      ]);
      setPhase("clarify");
      setCanvasHint(webSearchOn ? "联网搜索未完成 · 可关闭联网后重试" : "本次梳理未完成");
    } finally {
      window.clearTimeout(requestTimer);
      if (activeIdRef.current === runSessionId) setSending(false);
      if (abortRef.current === ac) abortRef.current = null;
    }
  }

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    nodeDragMoved.current = false;
    dragNode.current = { id, ox: e.clientX, oy: e.clientY, px: n.x, py: n.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSelectedId(id);
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).closest?.("[data-tld-node]")) return;
    panDrag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSelectedId(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragNode.current) {
      const d = dragNode.current;
      const dx = (e.clientX - d.ox) / scale;
      const dy = (e.clientY - d.oy) / scale;
      if (Math.hypot(dx, dy) > 3) nodeDragMoved.current = true;
      const nx = d.px + dx;
      const ny = d.py + dy;
      positionsOverride.current[d.id] = { x: nx, y: ny };
      setNodes((prev) => prev.map((n) => (n.id === d.id ? { ...n, x: nx, y: ny } : n)));
      return;
    }
    if (panDrag.current) {
      const d = panDrag.current;
      setPan({
        x: d.panX + (e.clientX - d.x),
        y: d.panY + (e.clientY - d.y),
      });
    }
  }

  function onPointerUp() {
    dragNode.current = null;
    panDrag.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    if (!(e.metaKey || e.ctrlKey || e.altKey)) {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      return;
    }
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setScale((s) => Math.min(1.8, Math.max(0.45, s * factor)));
  }

  function fitViewForNodes(graphNodes: DemoNode[]) {
    if (!graphNodes.length || !canvasRef.current) {
      setPan({ x: 40, y: 28 });
      setScale(0.92);
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of graphNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W[n.kind]);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
    const pad = 80;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const s = Math.min(1.2, Math.max(0.5, Math.min(rect.width / w, rect.height / h)));
    setScale(s);
    setPan({
      x: (rect.width - w * s) / 2 - (minX - pad) * s,
      y: (rect.height - h * s) / 2 - (minY - pad) * s,
    });
  }

  function fitView() {
    fitViewForNodes(nodes);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const scriptLen = active.script.length || 1;
  const progress = stepIndex < 0 ? 0 : Math.round(((stepIndex + 1) / scriptLen) * 100);
  const thinkingItems = chat.filter((c) => c.role === "thinking");
  const messageItems = chat.filter((c) => c.role !== "thinking");

  const sessionList = useMemo(() => {
    const sampleIds = DEMO_SESSION_PRESETS.map((p) => p.id);
    const sampleEntries = sampleIds
      .map((id) => (sessions[id] ? { id, s: sessions[id] } : null))
      .filter(Boolean) as { id: string; s: SessionRuntime }[];
    const otherEntries = Object.entries(sessions)
      .filter(([id]) => !sampleIds.includes(id))
      .map(([id, s]) => ({ id, s }));
    return { sampleEntries, otherEntries };
  }, [sessions]);

  const meta = sessions[activeId] || active;

  return (
    <section className="tld-root" aria-label="梳理逻辑高保真演示">
      <header className="tld-topbar" data-tour="think-toolbar">
        <div className="tld-brand">
          <span className="tld-mark" aria-hidden />
          <div>
            <strong>梳理逻辑</strong>
            <em>人主导意图 · 每段对话绑定独立画布 · 可回忆回放</em>
          </div>
        </div>
        <div className="tld-top-actions">
          <PhasePill phase={phase} />
          <div className="tld-progress" title={`${progress}%`}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <button
            type="button"
            className={`tld-btn primary ${playing ? "is-live" : ""}`}
            disabled={sending}
            onClick={() => {
              if (playing) {
                abortRef.current?.abort();
                setPlaying(false);
                setPaused(false);
                pauseGate.current?.release();
                pauseGate.current = null;
                return;
              }
              void playReplay();
            }}
          >
            {playing ? "停止" : "回忆"}
          </button>
          <button type="button" className="tld-btn" disabled={!playing} onClick={togglePause}>
            {paused ? "继续" : "暂停"}
          </button>
          <button type="button" className="tld-btn ghost" onClick={resetDemo}>
            重置
          </button>
        </div>
      </header>

      <div className="tld-split tld-split-3">
        {/* —— 历史会话栏 —— */}
        <aside
          className="tld-history"
          aria-label="历史对话"
          data-tour="think-history"
          onMouseEnter={onLeftZoneEnter}
        >
          <div className="tld-history-head">
            <strong>历史对话</strong>
            <button type="button" className="tld-history-new" title="新建对话" onClick={createSession}>
              +
            </button>
          </div>
          <div className="tld-history-sec">样例会话</div>
          {sessionList.sampleEntries.map(({ id, s }) => {
            const nodeCount = id === activeId ? nodes.length : s.nodes.length;
            const msgCount = id === activeId ? chat.length : s.chat.length;
            return (
              <button
                key={id}
                type="button"
                className={`tld-history-item${id === activeId ? " is-on" : ""}`}
                onClick={() => switchSession(id)}
              >
                <span className="tld-history-badge">样例</span>
                {nodeCount > 0 ? <span className="tld-history-mem">画布</span> : null}
                <strong>{s.title}</strong>
                <span>
                  {nodeCount > 0
                    ? `${nodeCount} 节点 · ${s.when}`
                    : msgCount > 0
                      ? `${msgCount} 条消息 · ${s.when}`
                      : `${s.subtitle}`}
                </span>
              </button>
            );
          })}
          <div className="tld-history-sec">我的对话</div>
          {sessionList.otherEntries.length === 0 ? (
            <p className="tld-history-empty">点 + 新建空白对话</p>
          ) : (
            sessionList.otherEntries.map(({ id, s }) => {
              const nodeCount = id === activeId ? nodes.length : s.nodes.length;
              return (
                <button
                  key={id}
                  type="button"
                  className={`tld-history-item${id === activeId ? " is-on" : ""}`}
                  onClick={() => switchSession(id)}
                >
                  {nodeCount > 0 ? <span className="tld-history-mem">画布</span> : null}
                  <strong>{s.title}</strong>
                  <span>
                    {nodeCount > 0 ? `${nodeCount} 节点 · ${s.when}` : s.subtitle}
                  </span>
                </button>
              );
            })
          )}
        </aside>

        {/* —— 对话 —— */}
        <aside className="tld-left" data-tour="think-chat" onMouseEnter={onLeftZoneEnter}>
          <div className="tld-left-head">
            <div>
              <span className="tld-branch-label">Current branch</span>
              <h2>{meta.branch}</h2>
            </div>
            <PhasePill phase={phase} />
          </div>

          <div className="tld-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={leftTab === "messages" ? "is-on" : ""}
              onClick={() => setLeftTab("messages")}
            >
              Messages
            </button>
            <button
              type="button"
              role="tab"
              className={leftTab === "thinking" ? "is-on" : ""}
              onClick={() => setLeftTab("thinking")}
            >
              Thinking
              {thinkingItems.length ? <i>{thinkingItems.length}</i> : null}
            </button>
          </div>

          <div className="tld-stream">
            {leftTab === "thinking" ? (
              thinkingItems.length === 0 ? (
                <div className="tld-empty">
                  <p>回忆播放时，这里会显示 AI 的内部推理摘要。</p>
                </div>
              ) : (
                thinkingItems.map((m) => (
                  <div key={m.id} className="tld-think-card">
                    <span>Thinking</span>
                    <p>{m.text}</p>
                  </div>
                ))
              )
            ) : messageItems.length === 0 ? (
              <div className="tld-empty">
                <h3>主推：Skill 膨胀 · 双环对照</h3>
                <p>
                  选左侧 <strong>Skill膨胀闭环</strong>，点<strong>回忆</strong>：从「不稳↔加包」短假说起步，
                  经产品/路由视角把<strong>负闭环画死</strong>，再长出外侧<strong>破局环</strong>与提示词死胡同。
                </p>
                <ul>
                  <li>珊瑚回流 = 负闭环；绿色 = 破局环；虚线 = 警告支路</li>
                  <li>同一机制多视角深挖，不是再铺概念清单</li>
                  <li>「对比辨析·深」可切换对照（拆概念 vs 拆机制）</li>
                </ul>
              </div>
            ) : (
              messageItems.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="tld-row user">
                      <div className="tld-bubble user">{m.text}</div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="tld-row assistant">
                    <div className="tld-avatar" aria-hidden>
                      明
                    </div>
                    <div className="tld-bubble assistant">
                      <RichAssistantText
                        text={m.text}
                        activeNoteId={drawerOpen ? drawerNote?.id : null}
                        onCiteHover={scheduleCiteHover}
                        onCiteLeave={scheduleCiteLeave}
                        onCiteClick={openNoteDrawer}
                      />
                      {m.revealOptions && m.options ? (
                        <div className="tld-options" role="group" aria-label="澄清选项">
                          {Array.from(new Set(m.options.map((o) => o.level))).map((level) => {
                            const opts = m.options!.filter((o) => o.level === level);
                            if (!opts.length) return null;
                            return (
                              <div key={level} className="tld-opt-group">
                                <header>{level}</header>
                                <div className="tld-opt-grid">
                                  {opts.map((o) => {
                                    const on = m.picked?.includes(o.id);
                                    return (
                                      <button
                                        key={o.id}
                                        type="button"
                                        className={`tld-opt ${on ? "is-on" : ""}`}
                                        onClick={() => onPickOption(m.id, o)}
                                      >
                                        <strong>{o.label}</strong>
                                        <span>{o.desc}</span>
                                        {on ? <em>✓</em> : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="tld-composer" data-tour="think-composer">
            <div className="tld-composer-shell">
              <textarea
                rows={2}
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitComposer();
                  }
                }}
                placeholder="输入你想梳理的问题…"
                aria-label="继续对话"
                disabled={playing || sending}
              />
              <div className="tld-composer-bar">
                <div className="tld-composer-tools">
                  <button
                    type="button"
                    className={`tld-web-toggle${webSearchOn ? " is-on" : ""}`}
                    aria-pressed={webSearchOn}
                    disabled={playing || sending}
                    title={
                      webSearchOn
                        ? "已开启：本库笔记与公开网页一起建图"
                        : "开启后会搜索并阅读公开网页"
                    }
                    onClick={() => setWebSearchOn((value) => !value)}
                  >
                    <span className="tld-web-dot" aria-hidden />
                    联网搜索
                  </button>
                  <span className="tld-hint-mini">
                    {webSearchOn ? "本库 + 公开网页" : "仅本库笔记"}
                  </span>
                  <button
                    type="button"
                    className={`tld-report-trigger${nodes.some((node) => node.reportAction) ? " is-ready" : ""}`}
                    disabled={!nodes.length || playing || sending}
                    title={nodes.length ? "用户主动收束本次梳理" : "画布上有逻辑节点后可生成"}
                    onClick={() => createSummaryReport()}
                  >
                    <span aria-hidden>✦</span>
                    {nodes.some((node) => node.reportAction) ? "查看报告" : "收束成报告"}
                  </button>
                </div>
                <button
                  type="button"
                  className="tld-send"
                  disabled={!composer.trim() || playing || sending}
                  title={sending ? "正在梳理" : "发送"}
                  onClick={() => void submitComposer()}
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* —— 画布 —— */}
        <aside className="tld-right" data-tour="think-canvas">
          <div className="tld-canvas-toolbar">
            <div className="tld-tool-pills">
              <span>Logic canvas</span>
              <strong>{meta.canvasTitle}</strong>
            </div>
            <div className="tld-source-legend" aria-label="节点来源颜色">
              <span><i className="is-library" />本库笔记</span>
              <span><i className="is-web" />网页结果</span>
            </div>
            <div className="tld-tool-actions" data-tour="think-canvas-controls">
              <button type="button" className="tld-btn ghost sm" onClick={fitView}>
                适应画布
              </button>
              <button
                type="button"
                className="tld-btn ghost sm"
                onClick={() => setScale((s) => Math.min(1.8, s * 1.1))}
              >
                +
              </button>
              <button
                type="button"
                className="tld-btn ghost sm"
                onClick={() => setScale((s) => Math.max(0.45, s * 0.9))}
              >
                −
              </button>
            </div>
          </div>

          <div className="tld-right-stage">
          <div
            className="tld-canvas"
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            <div className="tld-grid" aria-hidden />
            <div
              className="tld-world"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              }}
            >
              <svg className="tld-edges" width={1800} height={1400}>
                <defs>
                  <marker
                    id={`tld-arrow-${activeId}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="rgba(60,55,48,0.45)" />
                  </marker>
                  <marker
                    id={`tld-arrow-${activeId}-loop`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="rgba(197, 122, 98, 0.9)" />
                  </marker>
                  <marker
                    id={`tld-arrow-${activeId}-break`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="rgba(61, 122, 95, 0.95)" />
                  </marker>
                  <marker
                    id={`tld-arrow-${activeId}-warn`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="rgba(180, 130, 40, 0.9)" />
                  </marker>
                </defs>
                {edges.map((e) => {
                  const a = byId.get(e.from);
                  const b = byId.get(e.to);
                  if (!a || !b) return null;
                  const ac = { x: a.x + NODE_W[a.kind] / 2, y: a.y + NODE_H / 2 };
                  const bc = { x: b.x + NODE_W[b.kind] / 2, y: b.y + NODE_H / 2 };
                  const p1 = nodeAnchor(a, bc);
                  const p2 = nodeAnchor(b, ac);
                  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                  const hi = highlightIds.includes(e.from) || highlightIds.includes(e.to);
                  return (
                    <g
                      key={e.id}
                      className={`${hi ? "is-hi" : ""}${e.tone ? ` tone-${e.tone}` : ""}`}
                    >
                      <path
                        d={curvePath(p1, p2)}
                        className={`tld-edge${e.tone ? ` is-${e.tone}` : ""}`}
                        markerEnd={`url(#tld-arrow-${activeId}${e.tone ? `-${e.tone}` : ""})`}
                      />
                      {e.label ? (
                        <text
                          x={mid.x}
                          y={mid.y - 6}
                          className={`tld-edge-label${e.tone ? ` is-${e.tone}` : ""}`}
                        >
                          {e.label}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              {nodes.map((n) => {
                const linked =
                  n.kind === "note" && n.noteId ? DEMO_NOTES_BY_ID[n.noteId] : undefined;
                const displaySourceKind = n.sourceKind || (linked ? "library" : undefined);
                return (
                  <button
                    key={n.id}
                    type="button"
                    data-tld-node
                    className={`tld-node kind-${n.kind}${
                      highlightIds.includes(n.id) ? " is-enter" : ""
                    }${selectedId === n.id ? " is-sel" : ""}${n.done ? " is-done" : ""}${
                      linked ? " is-note-card" : ""
                    }${displaySourceKind ? ` source-${displaySourceKind}` : ""}${
                      n.sourceUrl ? " is-web-link" : ""
                    }${n.reportAction ? " is-report-action" : ""}`}
                    style={{
                      left: n.x,
                      top: n.y,
                      width: NODE_W[n.kind],
                    }}
                    onPointerDown={(ev) => onNodePointerDown(ev, n.id)}
                    onMouseEnter={(ev) => {
                      if (linked) scheduleCiteHover(linked, ev.clientX, ev.clientY);
                    }}
                    onMouseMove={(ev) => {
                      if (linked) scheduleCiteHover(linked, ev.clientX, ev.clientY);
                    }}
                    onMouseLeave={() => {
                      if (linked) scheduleCiteLeave();
                    }}
                    onClick={(ev) => {
                      if (nodeDragMoved.current) return;
                      if (n.reportAction) {
                        ev.stopPropagation();
                        setDrawerWeb(null);
                        setDrawerOpen(false);
                        setReportOpen(true);
                        return;
                      }
                      if (n.sourceKind === "web") {
                        ev.stopPropagation();
                        openWebDrawer(n);
                        return;
                      }
                      if (!linked) return;
                      ev.stopPropagation();
                      openNoteDrawer(linked);
                    }}
                    onDoubleClick={(ev) => {
                      if (n.reportAction) {
                        ev.stopPropagation();
                        setDrawerWeb(null);
                        setDrawerOpen(false);
                        setReportOpen(true);
                        return;
                      }
                      if (n.sourceKind === "web") {
                        ev.stopPropagation();
                        openWebDrawer(n);
                        return;
                      }
                      if (!linked) return;
                      ev.stopPropagation();
                      openNoteDrawer(linked);
                    }}
                  >
                    <span className="tld-node-badge">{n.badge}</span>
                    <strong>{n.label}</strong>
                    {n.sub ? <em>{n.sub}</em> : null}
                    {n.sourceUrl ? <span className="tld-web-open" aria-hidden>↗</span> : null}
                    {n.done ? <i className="tld-check" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>

            {!nodes.length ? (
              <div className="tld-canvas-empty">
                <p>本会话画布为空</p>
                <span>在左侧输入问题建图，开启「联网搜索」可把网页一起连入</span>
              </div>
            ) : null}

            <div className="tld-canvas-hint">{canvasHint}</div>
            <div className="tld-zoom-fab">
              <button type="button" onClick={() => setScale((s) => Math.min(1.8, s * 1.12))}>
                +
              </button>
              <button type="button" onClick={() => setScale((s) => Math.max(0.45, s * 0.88))}>
                −
              </button>
              <button type="button" onClick={fitView} title="适应">
                ⌊⌉
              </button>
            </div>
          </div>

          <NoteDetailDrawer
            note={drawerNote}
            open={drawerOpen}
            onClose={closeNoteDrawer}
          />
          <WebDetailDrawer
            node={drawerWeb}
            open={Boolean(drawerWeb)}
            onClose={closeWebDrawer}
          />
          <ThinkLogicReportDrawer
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            title={meta.title}
            branch={meta.branch}
            chat={chat}
            nodes={nodes}
            edges={edges}
          />
          </div>
        </aside>
      </div>

      {hoverNote ? (
        <NoteHoverCard note={hoverNote.note} x={hoverNote.x} y={hoverNote.y} />
      ) : null}
    </section>
  );
}
