"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { onTourCmd } from "../../lib/mingxi/demo/tour-bus";

export type PurposeId =
  | "concept"
  | "resource"
  | "counter"
  | "teardown"
  | "quote"
  | "park"
  | "new_basket";

export type CapturedNote = {
  id: string;
  title: string;
  app: string;
  purposeId: PurposeId;
  purposeLabel: string;
  declaredBy: "human" | null;
  parked: boolean;
  domainPath: string[];
  domainStatus: "pending" | "ok";
  capturedAt: string;
  /** 自定义 C2 用途名（语音/新建；已取消独立 C3） */
  themeBasket?: string | null;
  /** screenshot=整屏；text_selection=划词；pdf=文档收藏 */
  modality?: "screenshot" | "text_selection" | "pdf";
  excerpt?: string | null;
};

const FAN_ITEMS: Array<{
  id: PurposeId;
  label: string;
  muted?: boolean;
  voice?: boolean;
}> = [
  { id: "concept", label: "学习理论" },
  { id: "resource", label: "资料收藏" },
  { id: "counter", label: "反例避坑" },
  { id: "teardown", label: "对标拆解" },
  { id: "quote", label: "素材金句" },
  { id: "park", label: "待定", muted: true },
  { id: "new_basket", label: "新建用途", muted: true, voice: true },
];

const LABEL: Record<PurposeId, string> = Object.fromEntries(
  FAN_ITEMS.map((x) => [x.id, x.label]),
) as Record<PurposeId, string>;

type VoicePhase = "idle" | "listening" | "recognizing" | "stamping" | "done";

type FloatBallProps = {
  visible: boolean;
  contextTitle: string;
  contextApp: string;
  suggestDomain: string[];
  /** 当前画面选中的文字；有值时点球优先存选区 */
  selectedText?: string | null;
  /** 无选区时的默认捕获模态（如 PDF 阅读器） */
  captureModality?: "screenshot" | "pdf";
  onCapture: (note: CapturedNote) => void;
  onToast: (msg: string) => void;
  onClearSelection?: () => void;
};

function suggestBasketName(app: string, title: string): string {
  if (/Claude|大模型|提示词|AI/i.test(title)) return "大模型提示词";
  if (/Pinterest|设计|玻璃/i.test(title)) return "交互设计灵感";
  if (/漫威|电影|宇宙/i.test(title)) return "漫威宇宙笔记";
  if (app.includes("小红书")) return "今日灵感";
  if (app.includes("哔哩")) return "视频拆解";
  return "自定义用途";
}

function PurposeGlyph({ id }: { id: PurposeId }) {
  const common = { width: 15, height: 15, viewBox: "0 0 20 20", "aria-hidden": true as const };
  switch (id) {
    case "concept":
      return (
        <svg {...common} fill="none">
          <path d="M4 4.2c2.2-.5 4.1 0 6 1.5v10c-1.9-1.5-3.8-2-6-1.5v-10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M16 4.2c-2.2-.5-4.1 0-6 1.5v10c1.9-1.5 3.8-2 6-1.5v-10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case "resource":
      return (
        <svg {...common} fill="none">
          <path d="M5 3.5h10v13l-5-3-5 3v-13Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M7.5 7h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "counter":
      return (
        <svg {...common} fill="none">
          <path d="M10 2.8 17 16H3L10 2.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 7v4.2M10 14v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "teardown":
      return (
        <svg {...common} fill="none">
          <path d="m10 3 7 3.7-7 3.7-7-3.7L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="m4 10 6 3.2 6-3.2M4 13.5l6 3 6-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "quote":
      return (
        <svg {...common} fill="currentColor">
          <path d="M3.2 5.2h5.6v5.2c0 3-1.4 4.7-4.4 5.3l-.7-1.7c1.7-.5 2.4-1.3 2.5-2.5h-3V5.2Zm8 0h5.6v5.2c0 3-1.4 4.7-4.4 5.3l-.7-1.7c1.7-.5 2.4-1.3 2.5-2.5h-3V5.2Z" />
        </svg>
      );
    case "park":
      return (
        <svg {...common} fill="none">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v4.3l3 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "new_basket":
      return (
        <svg {...common} fill="currentColor">
          <path d="M10 11.7a2.7 2.7 0 0 0 2.7-2.7V5.5a2.7 2.7 0 1 0-5.4 0V9a2.7 2.7 0 0 0 2.7 2.7Zm4.3-2.8a4.3 4.3 0 0 1-8.6 0H4.2a5.8 5.8 0 0 0 5 5.7V17H7.5v1.5h5V17h-1.7v-2.4a5.8 5.8 0 0 0 5-5.7h-1.5Z" />
        </svg>
      );
  }
}

export function FloatBall({
  visible,
  contextTitle,
  contextApp,
  suggestDomain,
  selectedText = null,
  captureModality = "screenshot",
  onCapture,
  onToast,
  onClearSelection,
}: FloatBallProps) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<"shot" | "text" | "pdf" | null>(null);
  const [pressing, setPressing] = useState(false);
  const [topPct, setTopPct] = useState(58);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceText, setVoiceText] = useState("");
  const [stampLabel, setStampLabel] = useState("");
  const [waveKey, setWaveKey] = useState(0);
  const [tourPulse, setTourPulse] = useState(false);

  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const dragRef = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  const ballRef = useRef<HTMLButtonElement>(null);
  const voiceLongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceActive = useRef(false);
  const voiceHoldStarted = useRef(false);
  const voiceTimers = useRef<number[]>([]);
  const pendingBasket = useRef("");

  const clearVoiceTimers = () => {
    voiceTimers.current.forEach((id) => window.clearTimeout(id));
    voiceTimers.current = [];
  };

  const resetVoice = useCallback(() => {
    clearVoiceTimers();
    voiceActive.current = false;
    voiceHoldStarted.current = false;
    setVoicePhase("idle");
    setVoiceText("");
    setStampLabel("");
  }, []);

  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => {
      setOpen(false);
      resetVoice();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [visible, resetVoice]);

  useEffect(() => () => clearVoiceTimers(), []);

  const doCapture = useCallback(
    (purposeId: PurposeId, themeBasket?: string | null) => {
      if (purposeId === "new_basket" && !themeBasket) {
        onToast("长按「新建用途」说话命名");
        return;
      }
      const excerpt = selectedText?.trim() || null;
      const isText = Boolean(excerpt);
      const modality = isText
        ? "text_selection"
        : captureModality === "pdf"
          ? "pdf"
          : "screenshot";
      setFlash(isText ? "text" : modality === "pdf" ? "pdf" : "shot");
      window.setTimeout(() => setFlash(null), 280);
      const parked = purposeId === "park";
      const purposeLabel = themeBasket ? themeBasket : LABEL[purposeId];
      const note: CapturedNote = {
        id: `cap_${Date.now()}`,
        title: isText ? excerpt! : contextTitle,
        app: contextApp,
        purposeId: themeBasket ? "new_basket" : purposeId,
        purposeLabel,
        declaredBy: parked ? null : "human",
        parked,
        domainPath: [],
        domainStatus: "pending",
        capturedAt: new Date().toISOString(),
        themeBasket: themeBasket ?? null,
        modality,
        excerpt,
      };
      onCapture(note);
      const short = excerpt && excerpt.length > 18 ? `${excerpt.slice(0, 18)}…` : excerpt;
      onToast(
        themeBasket
          ? `已新建用途 · ${themeBasket}`
          : isText
            ? parked
              ? `已存选中文字 · 待定`
              : `已存选中 · ${LABEL[purposeId]}${short ? `「${short}」` : ""}`
            : modality === "pdf"
              ? parked
                ? "已收藏 PDF · 待定"
                : `已收藏 PDF · ${LABEL[purposeId]}`
              : parked
                ? "已收下 · 待定"
                : `已存到 · ${LABEL[purposeId]}`,
      );
      setOpen(false);
      onClearSelection?.();

      window.setTimeout(() => {
        onCapture({
          ...note,
          domainPath: suggestDomain,
          domainStatus: "ok",
        });
      }, 900);
    },
    [
      contextApp,
      contextTitle,
      onCapture,
      onClearSelection,
      onToast,
      selectedText,
      captureModality,
      suggestDomain,
    ],
  );

  const finishVoiceSave = useCallback(() => {
    const name = pendingBasket.current || suggestBasketName(contextApp, contextTitle);
    setStampLabel(name);
    setVoicePhase("stamping");
    const t1 = window.setTimeout(() => {
      setVoicePhase("done");
      doCapture("new_basket", name);
      const t2 = window.setTimeout(() => resetVoice(), 520);
      voiceTimers.current.push(t2);
    }, 720);
    voiceTimers.current.push(t1);
  }, [contextApp, contextTitle, doCapture, resetVoice]);

  const startVoiceListen = useCallback(() => {
    clearVoiceTimers();
    voiceActive.current = true;
    const full = suggestBasketName(contextApp, contextTitle);
    pendingBasket.current = full;
    setWaveKey((k) => k + 1);
    setVoicePhase("listening");
    setVoiceText("");
    setOpen(true);

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([10, 30, 10]);
      } catch {
        /* ignore */
      }
    }

    // 逐字「听写」出现
    let i = 0;
    const typeNext = () => {
      if (!voiceActive.current) return;
      i += 1;
      setVoiceText(full.slice(0, i));
      if (i < full.length) {
        const id = window.setTimeout(typeNext, 90 + (i % 3) * 20);
        voiceTimers.current.push(id);
      }
    };
    const startType = window.setTimeout(typeNext, 280);
    voiceTimers.current.push(startType);
  }, [contextApp, contextTitle]);

  const onVoicePointerUp = useCallback(() => {
    if (voiceLongTimer.current) {
      clearTimeout(voiceLongTimer.current);
      voiceLongTimer.current = null;
    }
    if (!voiceActive.current) return;
    if (voicePhase === "recognizing" || voicePhase === "stamping" || voicePhase === "done") return;

    // 松开：进入识别 → 盖章保存
    voiceActive.current = false;
    setVoicePhase("recognizing");
    const full = pendingBasket.current || suggestBasketName(contextApp, contextTitle);
    setVoiceText(full);
    const id = window.setTimeout(() => finishVoiceSave(), 480);
    voiceTimers.current.push(id);
  }, [contextApp, contextTitle, finishVoiceSave, voicePhase]);

  // 长按进入听写后，用全局松手结束（避免浮层挡住原按钮）
  useEffect(() => {
    if (voicePhase !== "listening") return;
    const up = () => onVoicePointerUp();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [voicePhase, onVoicePointerUp]);

  useEffect(() => {
    return onTourCmd((cmd) => {
      if (cmd.type === "phone.openFan") {
        setOpen(true);
        setPressing(false);
        return;
      }
      if (cmd.type === "phone.closeFan") {
        setOpen(false);
        resetVoice();
        return;
      }
      if (cmd.type === "phone.pulseBall") {
        setTourPulse(cmd.on !== false);
        return;
      }
      if (cmd.type === "phone.capture") {
        const id = cmd.purposeId as PurposeId;
        if (id === "new_basket") {
          doCapture("new_basket", cmd.themeBasket || suggestBasketName(contextApp, contextTitle));
        } else if (FAN_ITEMS.some((x) => x.id === id)) {
          doCapture(id, cmd.themeBasket);
        }
        return;
      }
      if (cmd.type === "phone.startVoice") {
        setOpen(true);
        startVoiceListen();
        window.setTimeout(() => onVoicePointerUp(), 1600);
      }
    });
  }, [
    contextApp,
    contextTitle,
    doCapture,
    onVoicePointerUp,
    resetVoice,
    startVoiceListen,
  ]);

  const onBasketPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (voicePhase !== "idle") return;
    voiceHoldStarted.current = false;
    voiceLongTimer.current = setTimeout(() => {
      voiceHoldStarted.current = true;
      startVoiceListen();
    }, 380);
  };

  const onBasketClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (voicePhase !== "idle" || voiceHoldStarted.current) return;
    onToast("按住说话 · 松手保存用途");
  };

  const clearLong = () => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (voicePhase !== "idle") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    longFired.current = false;
    setPressing(true);
    dragRef.current = { startY: e.clientY, startTop: topPct, moved: false };
    clearLong();
    longTimer.current = setTimeout(() => {
      longFired.current = true;
      setPressing(false);
      setOpen(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(12);
        } catch {
          /* ignore */
        }
      }
    }, 420);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || open || voicePhase !== "idle") return;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dy) > 6) {
      dragRef.current.moved = true;
      clearLong();
      const shell = ballRef.current?.closest(".opd-screen");
      const h = shell?.clientHeight ?? 640;
      const deltaPct = (dy / h) * 100;
      setTopPct(Math.min(82, Math.max(18, dragRef.current.startTop + deltaPct)));
    }
  };

  const onPointerUp = () => {
    setPressing(false);
    clearLong();
    const dragged = dragRef.current?.moved;
    dragRef.current = null;
    if (voicePhase !== "idle") return;
    if (longFired.current || dragged) return;
    if (open) {
      setOpen(false);
      return;
    }
    doCapture("park");
  };

  if (!visible) return null;

  const arcItems = FAN_ITEMS;
  const n = arcItems.length;
  // 严格向左半扇：0°=正左，正负不超过 ~70°，绝不过竖直线（±90°）以免被右缘裁切
  const halfSpan = Math.min(70, Math.max(48, (n - 1) * 10.3));
  let startDeg = -halfSpan;
  let endDeg = halfSpan;
  // 球靠边时把扇区整体拨进屏幕：靠上则扇口略下偏，靠下则略上偏
  if (topPct < 32) {
    const shift = (32 - topPct) * 1.1;
    startDeg = Math.min(-18, -halfSpan + shift);
    endDeg = Math.min(72, halfSpan + shift);
  } else if (topPct > 70) {
    const shift = (topPct - 70) * 1.1;
    startDeg = Math.max(-72, -halfSpan - shift);
    endDeg = Math.max(18, halfSpan - shift);
  }
  // 同一圆弧半径；选项多只收紧角度与字号，不交错内外圈
  const radius = n >= 8 ? 130 : n >= 6 ? 136 : 140;
  const voiceOpen = voicePhase !== "idle";

  return (
    <>
      {flash ? <div className={`fb-flash is-${flash}`} aria-hidden="true" /> : null}
      {selectedText && !voiceOpen && visible ? (
        <div className="fb-sel-banner" aria-live="polite">
          <span>已选中文字</span>
          <b>{selectedText.length > 28 ? `${selectedText.slice(0, 28)}…` : selectedText}</b>
          <em>点悬浮球保存</em>
        </div>
      ) : null}
      {open || voiceOpen ? (
        <button
          type="button"
          className={`fb-scrim${voiceOpen ? " is-voice" : ""}`}
          aria-label="关闭用途扇区"
          onClick={() => {
            if (voiceOpen) return;
            setOpen(false);
          }}
        />
      ) : null}

      {/* 语音命名全屏层 */}
      {voiceOpen ? (
        <div className={`fb-voice fb-voice-${voicePhase}`} aria-live="polite">
          <div className="fb-voice-card">
            <p className="fb-voice-eyebrow">
              {voicePhase === "listening"
                ? "松手保存 · 正在听…"
                : voicePhase === "recognizing"
                  ? "识别中…"
                  : voicePhase === "stamping" || voicePhase === "done"
                    ? "已识别用途"
                    : ""}
            </p>

            <div className="fb-voice-wave" key={waveKey} aria-hidden="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="fb-voice-bar"
                  style={{ "--fb-bar-i": String(i) } as CSSProperties}
                />
              ))}
            </div>

            <div className={`fb-voice-text${voiceText ? " has-text" : ""}`}>
              {voiceText || (voicePhase === "listening" ? "说出用途名称" : "…")}
              {voicePhase === "listening" ? <i className="fb-voice-caret" /> : null}
            </div>

            {(voicePhase === "stamping" || voicePhase === "done") && stampLabel ? (
              <div className={`fb-stamp${voicePhase === "done" ? " is-done" : ""}`}>
                <span className="fb-stamp-chip">#{stampLabel}</span>
                <span className="fb-stamp-ok">已新建用途并保存</span>
              </div>
            ) : null}

            {voicePhase === "listening" ? (
              <p className="fb-voice-hold-hint">松手即识别并保存用途</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={`fb-root${open ? " is-open" : ""}`} style={{ top: `${topPct}%` }}>
        {open ? (
          <div
            className={`fb-fan${voiceOpen ? " is-dimmed" : ""}`}
            role="menu"
            aria-label="用途选择"
            aria-hidden={voiceOpen || undefined}
            data-tour="purpose-fan"
          >
            <div className="fb-fan-glow" aria-hidden="true" />
            {arcItems.map((item, i) => {
              const t = n === 1 ? 0.5 : i / (n - 1);
              const deg = startDeg + (endDeg - startDeg) * t;
              const tip = 0.42 + Math.abs(t - 0.5) * 0.7;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`fb-ray is-${item.id}${item.muted ? " is-muted" : ""}${item.voice ? " is-voice" : ""}${
                    item.voice && voicePhase === "listening" ? " is-listening" : ""
                  }${n >= 7 ? " is-dense" : ""}`}
                  style={
                    {
                      "--fb-angle": `${deg}deg`,
                      "--fb-r": `${radius}px`,
                      "--fb-delay": `${i * 24}ms`,
                      "--fb-tip": String(tip),
                    } as CSSProperties
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.voice) {
                      onBasketClick(e);
                      return;
                    }
                    if (voiceOpen) return;
                    doCapture(item.id);
                  }}
                  onPointerDown={item.voice ? onBasketPointerDown : undefined}
                  onPointerUp={
                    item.voice
                      ? (e) => {
                          e.stopPropagation();
                          if (voiceLongTimer.current) {
                            clearTimeout(voiceLongTimer.current);
                            voiceLongTimer.current = null;
                          }
                        }
                      : undefined
                  }
                  onPointerCancel={
                    item.voice
                      ? () => {
                          if (voiceLongTimer.current) {
                            clearTimeout(voiceLongTimer.current);
                            voiceLongTimer.current = null;
                          }
                        }
                      : undefined
                  }
                >
                  <span className="fb-ray-pill">
                    <span className="fb-ray-glyph">
                      <PurposeGlyph id={item.id} />
                    </span>
                    <span className="fb-ray-label">{item.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <button
          ref={ballRef}
          type="button"
          className={`fb-ball${pressing ? " is-press" : ""}${open || voiceOpen ? " is-open" : ""}${
            selectedText ? " has-sel" : ""
          }${tourPulse ? " is-tour-pulse" : ""}`}
          data-tour="float-ball"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={
            selectedText
              ? "短按保存选中文字，长按选用途"
              : open
                ? "关闭悬浮球菜单"
                : "短按截屏，长按选用途"
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            setOpen((value) => !value);
          }}
        >
          <span className="fb-ball-aurora" aria-hidden="true" />
          <span className="fb-ball-icon" aria-hidden="true">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.2c.5 4.8 2.5 7 7.3 7.6-4.8.5-6.8 2.7-7.3 7.5-.6-4.8-2.6-7-7.4-7.5 4.8-.6 6.8-2.8 7.4-7.6Z"
                fill="currentColor"
                opacity="0.96"
              />
              <circle cx="18.7" cy="5.3" r="1.35" fill="currentColor" opacity="0.52" />
              <circle cx="5.1" cy="18.2" r="1" fill="currentColor" opacity="0.42" />
            </svg>
          </span>
          <span className="fb-ball-hold-ring" aria-hidden="true" />
        </button>
        {pressing && !open ? <span className="fb-hold-label">继续按住</span> : null}
      </div>
    </>
  );
}

export function captureContext(screenId: string): {
  title: string;
  app: string;
  domain: string[];
  modality?: "screenshot" | "pdf";
} {
  switch (screenId) {
    case "xhs-post":
      return {
        title: "Claude Opus 5 系统提示词遭完整泄露",
        app: "小红书",
        domain: ["工学", "计算机科学与技术", "人工智能", "大模型"],
      };
    case "xhs-post-design":
      return {
        title: "Pinterest PC 端工作台 · 磨砂玻璃设计",
        app: "小红书",
        domain: ["艺术学", "设计学", "交互设计", "玻璃拟态"],
      };
    case "xhs-feed":
      return {
        title: "小红书 · 发现流截屏",
        app: "小红书",
        domain: ["人文社科", "媒介传播", "内容社区"],
      };
    case "bili-video":
      return {
        title: "对话漫威总裁｜宇宙的崛起和转身",
        app: "哔哩哔哩",
        domain: ["艺术学", "电影学", "商业访谈"],
      };
    case "bili-hot":
      return {
        title: "哔哩哔哩 · 热门列表截屏",
        app: "哔哩哔哩",
        domain: ["人文社科", "媒介传播", "视频社区"],
      };
    case "wx-chats":
      return {
        title: "微信 · 聊天列表",
        app: "微信",
        domain: ["人文社科", "沟通协作"],
      };
    case "wx-group":
      return {
        title: "AI 产品协作群 · 聊天截屏",
        app: "微信",
        domain: ["工学", "计算机科学与技术", "人工智能"],
      };
    case "wx-dm":
      return {
        title: "与同事林晓的聊天",
        app: "微信",
        domain: ["人文社科", "沟通协作"],
      };
    case "wx-pdf":
      return {
        title: "Attention Is All You Need (arXiv:1706.03762)",
        app: "微信 · 文件",
        domain: ["工学", "计算机科学与技术", "人工智能", "Transformer"],
        modality: "pdf",
      };
    default:
      return {
        title: "屏幕截图",
        app: "系统",
        domain: ["未分类", "截屏"],
      };
  }
}
