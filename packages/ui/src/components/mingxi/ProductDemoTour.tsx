"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DEFAULT_TOUR_SPEED,
  dispatchTourCmd,
  loadTourSpeed,
  loadTourState,
  runTourCommands,
  saveTourSpeed,
  saveTourState,
  TOUR_SPEEDS,
  TOUR_UI_EVENT,
  type TourMode,
  type TourPersisted,
  type TourSpeed,
  type TourUiMsg,
} from "../../lib/mingxi/demo/tour-bus";
import { PRODUCT_TOUR_STEPS } from "../../lib/mingxi/demo/product-tour-script";
import "./product-demo-tour.css";

type Spot = { top: number; left: number; width: number; height: number } | null;

const TOUR_CARD_COPY: Record<string, { title: string; description: string }> = {
  "hub-loop": { title: "产品闭环", description: "解决收藏后找不到、用不上的问题：从捕获到整理，再把笔记梳成可执行判断。" },
  "principle-c1c2": { title: "分类原则", description: "领域交给 AI 自动判断，用途保留给人确认，兼顾效率与准确性。" },
  "phone-home": { title: "场景内捕获", description: "不用离开正在阅读的 App，悬浮球直接收下当前内容，减少操作打断。" },
  "phone-xhs-feed": { title: "信息流入口", description: "捕获能力贴着信息流出现，让灵感在产生的位置立即进入知识库。" },
  "phone-xhs-post": { title: "内容上下文", description: "保存正文时一并保留标题、来源与场景，避免只剩一段失去语境的摘录。" },
  "phone-tap-park": { title: "直接截图", description: "没有文字选区时，短按悬浮球直接保存当前页面，来不及细选也不会丢失内容。" },
  "phone-select": { title: "手动划词", description: "帖子默认没有高亮；用户主动选中一段文字后，黄色选区动画才会出现。" },
  "phone-save-selection": { title: "保存选区", description: "选中后再点击悬浮球，只保存关键句并保留来源上下文，减少整页截图噪声。" },
  "phone-fan": { title: "用途扇区", description: "有明确目的时长按选择用途，让同一条内容从入库开始就能按需求调用。" },
  "phone-capture-purpose": { title: "带用途入库", description: "内容与“反例避坑”等用途一起保存，后续网页端可直接按使用目的筛选。" },
  "phone-voice": { title: "语音新用途", description: "现有标签不够时直接说出新用途，减少键盘输入和分类规则限制。" },
  "phone-wechat-pdf": { title: "跨应用捕获", description: "微信群文件也能直接进入同一知识库，解决资料散落在多个 App 的问题。" },
  "phone-pdf-capture": { title: "PDF 整篇入库", description: "整篇论文连同学习用途一起收藏，保留后续理解和引用所需的完整材料。" },
  "phone-inbox": { title: "待定回流", description: "暂时未分类的内容不会被遗忘，会集中回流到待确认入口供用户补充决定。" },
  "web-enter": { title: "网页知识库", description: "手机里的碎片在网页端统一整理、检索和阅读，形成可持续使用的知识资产。" },
  "web-navigation": { title: "四大工作区", description: "笔记库、领域旭日、梳逻辑和扩展分别解决查找、观察、推理与补全需求。" },
  "web-ask": { title: "问明晰", description: "从一个真实问题进入梳逻辑流程，不必先理解复杂的知识库目录。" },
  "web-search": { title: "全库搜索", description: "一次搜索同时覆盖标题、摘要和领域，快速找回记得内容却忘记位置的笔记。" },
  "web-purpose": { title: "用途切片", description: "按“这条内容对我有什么用”筛选，比按来源 App 分类更贴近实际任务。" },
  "web-purpose-manage": { title: "用途管理", description: "用途标签可以新增、排序和移除，让分类体系随个人需求持续调整。" },
  "web-heat": { title: "领域热力", description: "用数量分布看见知识集中区与空白区，快速判断积累是否失衡。" },
  "web-icicle": { title: "层级占比", description: "用层级面积呈现领域结构，帮助用户理解每一层知识所占比例。" },
  "web-domain-filter": { title: "领域下钻", description: "点击领域后笔记列表同步收窄，从全局结构快速进入具体内容。" },
  "web-card-anatomy": { title: "结构化卡片", description: "一张卡片同时保留来源、判断、用途和领域，减少反复打开正文确认。" },
  "web-note": { title: "完整笔记", description: "摘要用于浏览，点开后仍可阅读完整正文并追溯原始材料。" },
  "web-atlas": { title: "领域旭日", description: "把整个知识库展开为可探索地图，解决列表难以呈现整体结构的问题。" },
  "web-atlas-controls": { title: "图谱控制", description: "围绕中心自由旋转、平移和缩放，大图浏览不再受固定方框限制。" },
  "web-atlas-canvas": { title: "图谱下钻", description: "领域节点负责继续探索，终端笔记节点才打开正文，避免误操作。" },
  "web-purpose-confirm": { title: "待定确认", description: "AI 先给出用途建议；推荐不准时由用户改选，最终决定权始终在人。" },
  "web-capture-drawer": { title: "网页捕获", description: "桌面阅读链接或文本时也能直接入库，补齐手机之外的捕获入口。" },
  "web-completion-enter": { title: "知识补全", description: "从一篇真实笔记出发寻找相邻知识，避免无目标地扩大搜索范围。" },
  "web-completion-metrics": { title: "扩展边界", description: "粒度决定看多细，跳数决定走多远，让知识扩展范围始终可控。" },
  "web-completion-map": { title: "缺口路径", description: "每个缺口都保留从起点到当前位置的关系路径，推荐结果可以解释。" },
  "web-completion-loop": { title: "补全闭环", description: "灰色缺口经过检索、阅读和人工确认后才保存，避免低质量结果自动污染知识库。" },
  "web-think-enter": { title: "梳逻辑线", description: "把分散笔记组织成一条可讨论、可修改的判断链，解决收藏多但不会用的问题。" },
  "web-think-history": { title: "会话记忆", description: "每个问题保留独立对话与逻辑画布，回来时可以从上次状态继续。" },
  "web-think-composer": { title: "人控输入", description: "是否联网、何时继续追问和何时收束报告都由用户主动决定。" },
  "web-think-play": { title: "回忆播放", description: "对话、节点和引用同步生长，直观展示一条结论如何由证据形成。" },
  "web-think-canvas": { title: "逻辑画布", description: "节点表达判断、连线表达关系、颜色区分来源，让推理过程可追溯。" },
  "web-eval": { title: "产品评测", description: "用固定任务检查捕获、意图和 Agent 能力，避免产品只凭主观感觉迭代。" },
  "close-loop": { title: "完整闭环", description: "收下、对齐、确认、切片、梳链形成闭环，让收藏真正转化为可用知识。" },
};

const AUTO_ANIMATION_MS: Record<string, number> = {
  "phone-tap-park": 1800,
  "phone-select": 900,
  "phone-save-selection": 1800,
  "phone-capture-purpose": 1800,
  "phone-voice": 3400,
  "phone-pdf-capture": 1800,
  "web-atlas-canvas": 1500,
  "web-completion-loop": 900,
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function waitForFinitePageAnimations(maxMs = 2200) {
  await sleep(80);
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const running = document.getAnimations().filter((animation) => {
      if (animation.playState !== "running") return false;
      const timing = animation.effect?.getComputedTiming();
      return timing ? Number.isFinite(Number(timing.endTime)) : true;
    });
    if (!running.length) return;
    await sleep(100);
  }
}

async function waitForStepAnimation(stepId: string) {
  if (stepId === "web-think-play") {
    const deadline = Date.now() + 60000;
    await sleep(200);
    while (Date.now() < deadline) {
      const replayButton = document.querySelector("[data-tour=think-toolbar] .tld-btn.primary");
      if (replayButton?.textContent?.trim() !== "停止") return;
      await sleep(160);
    }
    return;
  }

  await Promise.all([
    sleep(AUTO_ANIMATION_MS[stepId] ?? 420),
    waitForFinitePageAnimations(),
  ]);
}

function autoLingerMs(index: number) {
  return 800 + (index % 6) * 100;
}

function scaledMs(ms: number, speed: TourSpeed, minimum = 80) {
  return Math.max(minimum, Math.round(ms / speed));
}

function reduceMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function waitForRouteReady(route: string) {
  const selector =
    route === "/mingxi/web"
      ? "[data-tour=web-tabs]"
      : route === "/demo/phone"
        ? "[data-tour=phone-shell]"
        : route === "/demo"
          ? "[data-tour=hub-hero]"
          : "main";
  const deadline = Date.now() + 5000;
  while (!document.querySelector(selector) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function placeCard(
  rect: { top: number; left: number; right: number; bottom: number },
  cardEl: HTMLElement | null,
) {
  if (!cardEl) return { left: 24, top: 24 };
  const pad = 16;
  const cw = cardEl.offsetWidth || 380;
  const ch = cardEl.offsetHeight || 260;
  let left = rect.right + 18;
  let top = rect.top;
  if (left + cw > window.innerWidth - pad) left = rect.left - cw - 18;
  if (left < pad) left = pad;
  if (top + ch > window.innerHeight - pad) top = window.innerHeight - ch - pad;
  if (top < pad) top = pad;
  return { left, top };
}

export function startProductTour(
  step = 0,
  mode: TourMode = "auto",
  speed: TourSpeed = loadTourSpeed(),
) {
  const state: TourPersisted = {
    active: true,
    step,
    paused: false,
    mode,
    speed,
    startedAt: new Date().toISOString(),
  };
  saveTourSpeed(speed);
  saveTourState(state);
  window.dispatchEvent(
    new CustomEvent(TOUR_UI_EVENT, {
      detail: { type: "start", step, mode, speed } satisfies TourUiMsg,
    }),
  );
}

export function ProductDemoTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<TourMode>("auto");
  const [speed, setSpeed] = useState<TourSpeed>(DEFAULT_TOUR_SPEED);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [spot, setSpot] = useState<Spot>(null);
  const [cardPos, setCardPos] = useState({ left: 24, top: 80 });
  const [cursor, setCursor] = useState<{ x: number; y: number; click: boolean } | null>(null);
  const [veil, setVeil] = useState(false);

  const cardRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const pausedRef = useRef(false);
  const modeRef = useRef<TourMode>("auto");
  const speedRef = useRef<TourSpeed>(DEFAULT_TOUR_SPEED);
  const pathnameRef = useRef(pathname);
  const pendingNavRef = useRef<number | null>(null);
  const applyGenRef = useRef(0);
  const goToStepRef = useRef<(index: number) => Promise<void>>(async () => {});

  useEffect(() => {
    stepRef.current = step;
    pausedRef.current = paused;
    modeRef.current = mode;
    speedRef.current = speed;
    pathnameRef.current = pathname;
  }, [step, paused, mode, speed, pathname]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persist = useCallback((next: Partial<TourPersisted> & { active: boolean }) => {
    const cur = loadTourState();
    const state: TourPersisted = {
      active: next.active,
      step: next.step ?? cur?.step ?? 0,
      paused: next.paused ?? cur?.paused ?? false,
      mode: next.mode ?? cur?.mode ?? modeRef.current,
      speed: next.speed ?? cur?.speed ?? speedRef.current,
      startedAt: cur?.startedAt || new Date().toISOString(),
    };
    saveTourState(next.active ? state : null);
  }, []);

  const highlight = useCallback((sel?: string) => {
    if (!sel) {
      setSpot(null);
      setCursor(null);
      setCardPos({ left: Math.max(24, window.innerWidth / 2 - 190), top: 72 });
      return;
    }
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) {
      setSpot(null);
      setCardPos({ left: Math.max(24, window.innerWidth / 2 - 190), top: 72 });
      return;
    }
    el.scrollIntoView({
      behavior: reduceMotion() ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
    const r = el.getBoundingClientRect();
    const m = 10;
    setSpot({
      top: Math.max(0, r.top - m),
      left: Math.max(0, r.left - m),
      width: Math.min(window.innerWidth, r.width + m * 2),
      height: Math.min(window.innerHeight, r.height + m * 2),
    });
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setCursor({ x: cx, y: cy, click: false });
    if (modeRef.current === "auto") {
      window.setTimeout(() => setCursor({ x: cx, y: cy, click: true }), reduceMotion() ? 0 : 420);
      window.setTimeout(
        () => setCursor((c) => (c ? { ...c, click: false } : c)),
        reduceMotion() ? 0 : 780,
      );
    }
    requestAnimationFrame(() => {
      setCardPos(
        placeCard(
          { top: r.top, left: r.left, right: r.right, bottom: r.bottom },
          cardRef.current,
        ),
      );
    });
  }, []);

  const stopTour = useCallback(() => {
    clearTimers();
    applyGenRef.current += 1;
    pendingNavRef.current = null;
    setActive(false);
    setPaused(false);
    setSpot(null);
    setCursor(null);
    setVeil(false);
    saveTourState(null);
    dispatchTourCmd({ type: "phone.pulseBall", on: false });
    dispatchTourCmd({ type: "phone.closeFan" });
    dispatchTourCmd({ type: "web.setCapture", on: false });
    dispatchTourCmd({ type: "web.setEval", on: false });
  }, [clearTimers]);

  const applyStepLocal = useCallback(
    async (index: number) => {
      const gen = ++applyGenRef.current;
      const s = PRODUCT_TOUR_STEPS[index];
      if (!s) {
        stopTour();
        return;
      }
      clearTimers();
      setVeil(false);
      await waitForRouteReady(s.route);
      if (gen !== applyGenRef.current) return;
      if (s.settleMs) {
        await new Promise((r) => setTimeout(r, scaledMs(s.settleMs!, speedRef.current, 120)));
      }
      if (gen !== applyGenRef.current) return;
      await runTourCommands(s.enter, scaledMs(320, speedRef.current, 100));
      if (gen !== applyGenRef.current) return;
      await new Promise((r) => setTimeout(r, scaledMs(200, speedRef.current, 70)));
      if (gen !== applyGenRef.current) return;
      highlight(s.target);
      if (modeRef.current === "guided") return;
      await waitForStepAnimation(s.id);
      if (gen !== applyGenRef.current || pausedRef.current) return;
      timerRef.current = window.setTimeout(() => {
        if (pausedRef.current) return;
        void goToStepRef.current(index + 1);
      }, scaledMs(autoLingerMs(index), speedRef.current, 350));
    },
    [clearTimers, highlight, stopTour],
  );

  const goToStep = useCallback(
    async (index: number) => {
      if (index < 0 || index >= PRODUCT_TOUR_STEPS.length) {
        stopTour();
        return;
      }
      clearTimers();
      const prev = PRODUCT_TOUR_STEPS[stepRef.current];
      if (prev?.leave && index !== stepRef.current) {
        await runTourCommands(prev.leave, 100);
      }

      const s = PRODUCT_TOUR_STEPS[index];
      setStep(index);
      stepRef.current = index;
      persist({ active: true, step: index, paused: pausedRef.current });

      if (s.route !== pathnameRef.current) {
        pendingNavRef.current = index;
        setVeil(true);
        router.push(s.route);
        return;
      }
      pendingNavRef.current = null;
      await applyStepLocal(index);
    },
    [applyStepLocal, clearTimers, persist, router, stopTour],
  );

  useEffect(() => {
    goToStepRef.current = goToStep;
  }, [goToStep]);

  // 路由落地后继续 pending 步骤
  useEffect(() => {
    if (!active) return;
    const pending = pendingNavRef.current;
    if (pending == null) return;
    const s = PRODUCT_TOUR_STEPS[pending];
    if (!s || s.route !== pathname) return;
    pendingNavRef.current = null;
    void applyStepLocal(pending);
  }, [pathname, active, applyStepLocal]);

  // UI 事件 + 自动启动
  useEffect(() => {
    let autoStartTimer: number | null = null;
    const restoreTimer = window.setTimeout(() => {
      const st = loadTourState();
      const restoredSpeed = st?.speed ?? loadTourSpeed();
      setSpeed(restoredSpeed);
      speedRef.current = restoredSpeed;
      if (st?.active) {
        setActive(true);
        setStep(st.step);
        stepRef.current = st.step;
        setPaused(st.paused);
        pausedRef.current = st.paused;
        const restoredMode = st.mode ?? "auto";
        setMode(restoredMode);
        modeRef.current = restoredMode;
        const s = PRODUCT_TOUR_STEPS[st.step];
        if (s && s.route === window.location.pathname) {
          void applyStepLocal(st.step);
        } else if (s) {
          pendingNavRef.current = st.step;
          setVeil(true);
          router.push(s.route);
        }
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get("autotour") === "1" || params.get("tour") === "1") {
        // 稍晚启动，避免与恢复冲突
        autoStartTimer = window.setTimeout(() => startProductTour(0, "auto"), 200);
      } else if (params.get("guidedtour") === "1") {
        autoStartTimer = window.setTimeout(() => startProductTour(0, "guided"), 200);
      }
    }, 0);

    const onUi = (e: Event) => {
      const msg = (e as CustomEvent<TourUiMsg>).detail;
      if (!msg) return;
      if (msg.type === "start") {
        clearTimers();
        setChooserOpen(false);
        setActive(true);
        setPaused(false);
        pausedRef.current = false;
        const nextMode = msg.mode ?? "auto";
        setMode(nextMode);
        modeRef.current = nextMode;
        const nextSpeed = msg.speed ?? loadTourSpeed();
        setSpeed(nextSpeed);
        speedRef.current = nextSpeed;
        saveTourSpeed(nextSpeed);
        const i = msg.step ?? 0;
        setStep(i);
        stepRef.current = i;
        persist({ active: true, step: i, paused: false, mode: nextMode, speed: nextSpeed });
        void goToStep(i);
      } else if (msg.type === "stop") {
        stopTour();
      } else if (msg.type === "pause") {
        setPaused(msg.paused);
        pausedRef.current = msg.paused;
        persist({ active: true, paused: msg.paused, step: stepRef.current });
        if (msg.paused) clearTimers();
        else if (modeRef.current === "auto") {
          clearTimers();
          timerRef.current = window.setTimeout(
            () => void goToStep(stepRef.current + 1),
            scaledMs(800, speedRef.current, 350),
          );
        }
      } else if (msg.type === "goto") {
        void goToStep(msg.step);
      }
    };
    window.addEventListener(TOUR_UI_EVENT, onUi);
    return () => {
      window.clearTimeout(restoreTimer);
      if (autoStartTimer) window.clearTimeout(autoStartTimer);
      window.removeEventListener(TOUR_UI_EVENT, onUi);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    const onResize = () => highlight(PRODUCT_TOUR_STEPS[step]?.target);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, step, highlight]);

  useEffect(() => {
    if (!active && !chooserOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (active) stopTour();
      else setChooserOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, chooserOpen, stopTour]);

  const changeSpeed = (nextSpeed: TourSpeed) => {
    setSpeed(nextSpeed);
    speedRef.current = nextSpeed;
    saveTourSpeed(nextSpeed);
    if (!active) return;
    persist({ active: true, step: stepRef.current, paused: pausedRef.current, speed: nextSpeed });
    if (modeRef.current !== "auto" || pausedRef.current || !timerRef.current) return;
    clearTimers();
    timerRef.current = window.setTimeout(
      () => void goToStepRef.current(stepRef.current + 1),
      scaledMs(autoLingerMs(stepRef.current), nextSpeed, 350),
    );
  };

  if (!active) {
    const showLauncher = pathname !== "/demo";
    return (
      <>
        {showLauncher ? (
          <button
            type="button"
            className="mx-tour-help-launcher"
            onClick={() => setChooserOpen(true)}
            aria-label="打开新手指引"
          >
            <span>?</span> 新手指引
          </button>
        ) : null}
        {chooserOpen ? (
          <div className="mx-tour-chooser-backdrop" role="presentation">
            <section
              className="mx-tour-chooser"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mx-tour-chooser-title"
            >
              <button
                type="button"
                className="mx-tour-chooser-close"
                onClick={() => setChooserOpen(false)}
                aria-label="关闭新手指引"
              >
                ×
              </button>
              <p className="mx-tour-chooser-eyebrow">MINGXI · PRODUCT TOUR</p>
              <h2 id="mx-tour-chooser-title">选择你的新手指引方式</h2>
              <p className="mx-tour-chooser-copy">
                共 {PRODUCT_TOUR_STEPS.length} 步，覆盖手机捕获、网页整理、旭日图、知识补全与梳逻辑。两种模式都可随时跳过或退出。
              </p>
              <div className="mx-tour-speed-picker" role="group" aria-label="全自动演示速度">
                <span className="mx-tour-speed-label">自动演示速度</span>
                <div className="mx-tour-speed-options">
                  {TOUR_SPEEDS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={speed === option ? "is-on" : ""}
                      onClick={() => changeSpeed(option)}
                      aria-pressed={speed === option}
                    >
                      {option}×
                    </button>
                  ))}
                </div>
              </div>
              <div className="mx-tour-chooser-grid">
                <button type="button" onClick={() => startProductTour(0, "auto", speed)}>
                  <b>▶ 全自动演示</b>
                  <span>自动切页、聚光并播放功能，适合先完整看一遍。</span>
                </button>
                <button type="button" onClick={() => startProductTour(0, "guided", speed)}>
                  <b>☝ 交互式逐步体验</b>
                  <span>页面保持可操作；每一步亲手点击，再确认进入下一步。</span>
                </button>
              </div>
              <button type="button" className="mx-tour-chooser-later" onClick={() => setChooserOpen(false)}>
                暂时跳过
              </button>
            </section>
          </div>
        ) : null}
      </>
    );
  }

  const s = PRODUCT_TOUR_STEPS[step] || PRODUCT_TOUR_STEPS[0];
  const cardCopy = TOUR_CARD_COPY[s.id] || { title: s.title, description: s.feature || s.say };
  const phaseLabels = ["开场", "手机", "网页", "扩展", "梳逻辑", "收束"];
  const activePhase = phaseLabels.findIndex((phase) => {
    if (phase === "开场") return s.phase.includes("开场") || s.phase.includes("原则");
    if (phase === "网页") return s.phase.includes("网页") || s.phase.includes("待定");
    return s.phase.includes(phase);
  });
  return (
    <>
      <div className={`mx-tour-veil${veil ? " on" : ""}`} aria-hidden="true">
        <span>切换完整 Demo 场景…</span>
      </div>
      {spot ? (
        <div
          className="mx-tour-spot"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
        >
          <i className="mx-tour-spot-ring" />
        </div>
      ) : null}
      {cursor ? (
        <div
          className={`mx-tour-cursor${cursor.click ? " is-click" : ""}`}
          style={{ left: cursor.x, top: cursor.y }}
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 3l14 8.5-6.2 1.6L10 21 5 3z"
              fill="#1c1a17"
              stroke="#fff"
              strokeWidth="1.2"
            />
          </svg>
          <span className="mx-tour-ripple" />
        </div>
      ) : null}

      <aside
        ref={(node) => {
          cardRef.current = node;
        }}
        className={`mx-tour-card is-${mode}`}
        style={{ left: cardPos.left, top: cardPos.top }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="mx-tour-title"
      >
        <div className="mx-tour-kicker">
          <b>{mode === "auto" ? "自动演示" : "逐步体验"}</b>
          <span>
            {step + 1} / {PRODUCT_TOUR_STEPS.length}
          </span>
        </div>
        <h3 id="mx-tour-title">{cardCopy.title}</h3>
        <p className="mx-tour-brief">{cardCopy.description}</p>
        {mode === "auto" ? (
          <label className="mx-tour-speed-inline">
            <span>速度</span>
            <select
              value={speed}
              onChange={(event) => changeSpeed(Number(event.target.value) as TourSpeed)}
              aria-label="切换全自动演示速度"
            >
              {TOUR_SPEEDS.map((option) => (
                <option key={option} value={option}>
                  {option}×
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mx-tour-phases" aria-label="演示模块进度">
          {phaseLabels.map((p, index) => {
            const on = index === activePhase;
            const done = index < activePhase;
            return (
              <span key={p} className={on ? "is-on" : done ? "is-done" : ""}>
                {p}
              </span>
            );
          })}
        </div>
        <div className="mx-tour-btns">
          <button type="button" disabled={step === 0} onClick={() => void goToStep(step - 1)}>
            上一步
          </button>
          {mode === "auto" ? (
            <button
              type="button"
              onClick={() => {
                const next = !paused;
                setPaused(next);
                pausedRef.current = next;
                persist({ active: true, paused: next, step, mode });
                if (next) clearTimers();
                else {
                  clearTimers();
                  timerRef.current = window.setTimeout(
                    () => void goToStep(step + 1),
                    scaledMs(700, speedRef.current, 350),
                  );
                }
              }}
            >
              {paused ? "继续播放" : "暂停"}
            </button>
          ) : null}
          <button
            type="button"
            className="skip"
            onClick={() => {
              if (step >= PRODUCT_TOUR_STEPS.length - 1) stopTour();
              else void goToStep(step + 1);
            }}
          >
            跳过
          </button>
          <button
            type="button"
            className="go"
            onClick={() => {
              if (step >= PRODUCT_TOUR_STEPS.length - 1) stopTour();
              else void goToStep(step + 1);
            }}
          >
            {step >= PRODUCT_TOUR_STEPS.length - 1
              ? "完成导览"
              : mode === "guided"
                ? "完成这步"
                : "下一步"}
          </button>
          <button type="button" onClick={stopTour}>
            退出
          </button>
        </div>
      </aside>
    </>
  );
}
