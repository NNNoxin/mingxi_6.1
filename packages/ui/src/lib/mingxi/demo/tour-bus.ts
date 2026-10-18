/** 完整产品自动导览 · 跨路由事件总线 */

export const TOUR_STORAGE_KEY = "mingxi-product-tour-v1";
export const TOUR_SPEED_STORAGE_KEY = "mingxi-product-tour-speed-v1";
export const TOUR_CMD_EVENT = "mingxi:tour-cmd";
export const TOUR_UI_EVENT = "mingxi:tour-ui";

export type TourMode = "auto" | "guided";
export const TOUR_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type TourSpeed = (typeof TOUR_SPEEDS)[number];
export const DEFAULT_TOUR_SPEED: TourSpeed = 1.25;

export type TourRoute = "/demo" | "/demo/phone" | "/mingxi/web" | "/mingxi/phone";

export type TourCommand =
  | { type: "phone.home" }
  | { type: "phone.goto"; screens: string[] }
  | { type: "phone.selectText"; text: string | null }
  | { type: "phone.openFan" }
  | { type: "phone.closeFan" }
  | { type: "phone.capture"; purposeId: string; themeBasket?: string }
  | { type: "phone.pulseBall"; on?: boolean }
  | { type: "phone.openInbox"; on?: boolean }
  | { type: "phone.startVoice" }
  | { type: "web.setView"; view: "library" | "atlas" | "think" | "extend" }
  | { type: "web.setPurpose"; purpose: string }
  | { type: "web.setDomainViz"; viz: "heat" | "icicle" }
  | { type: "web.setDomainFilter"; path: string[] | null }
  | { type: "web.openNote"; index?: number; purpose?: string }
  | { type: "web.closeNote" }
  | { type: "web.setCapture"; on: boolean }
  | { type: "web.setEval"; on: boolean }
  | { type: "web.setThinkSurface"; surface: "replay" | "live" }
  | { type: "web.playThinkReplay" }
  | {
      type: "web.clickTourTarget";
      target:
        | "atlas-rotate-right"
        | "atlas-zoom-in"
        | "atlas-fit"
        | "completion-play";
    }
  | { type: "web.focusAsk" }
  | { type: "noop" };

export type TourPersisted = {
  active: boolean;
  step: number;
  paused: boolean;
  mode?: TourMode;
  speed?: TourSpeed;
  startedAt: string;
};

export function normalizeTourSpeed(value: unknown): TourSpeed {
  const numeric = Number(value);
  return TOUR_SPEEDS.find((speed) => speed === numeric) ?? DEFAULT_TOUR_SPEED;
}

export function loadTourSpeed(): TourSpeed {
  if (typeof window === "undefined") return DEFAULT_TOUR_SPEED;
  try {
    return normalizeTourSpeed(localStorage.getItem(TOUR_SPEED_STORAGE_KEY));
  } catch {
    return DEFAULT_TOUR_SPEED;
  }
}

export function saveTourSpeed(speed: TourSpeed) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOUR_SPEED_STORAGE_KEY, String(speed));
  } catch {
    /* quota */
  }
}

export function loadTourState(): TourPersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TourPersisted;
  } catch {
    return null;
  }
}

export function saveTourState(state: TourPersisted | null) {
  if (typeof window === "undefined") return;
  try {
    if (!state) sessionStorage.removeItem(TOUR_STORAGE_KEY);
    else sessionStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function dispatchTourCmd(cmd: TourCommand) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOUR_CMD_EVENT, { detail: cmd }));
}

export function onTourCmd(handler: (cmd: TourCommand) => void) {
  const fn = (e: Event) => {
    const ce = e as CustomEvent<TourCommand>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(TOUR_CMD_EVENT, fn);
  return () => window.removeEventListener(TOUR_CMD_EVENT, fn);
}

export type TourUiMsg =
  | { type: "start"; step?: number; mode?: TourMode; speed?: TourSpeed }
  | { type: "stop" }
  | { type: "pause"; paused: boolean }
  | { type: "goto"; step: number };

export function dispatchTourUi(msg: TourUiMsg) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOUR_UI_EVENT, { detail: msg }));
}

export async function runTourCommands(cmds: TourCommand[] | undefined, gapMs = 280) {
  if (!cmds?.length) return;
  for (const cmd of cmds) {
    dispatchTourCmd(cmd);
    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
  }
}
