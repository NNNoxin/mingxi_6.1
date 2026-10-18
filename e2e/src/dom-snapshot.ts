import type { Page } from "playwright-core";

/**
 * 每一步截图时同时记录页面结构：按文档顺序列出 body 下每个元素的标签、class、data-tour、自身文字、
 * 内联样式、位置尺寸、滚动位置（SVG 元素再加全部属性，例如连线的 d）。
 * 像素对比对个别步骤需要按原版自身的光栅化波动放宽，这份快照要求原版与新版逐项完全相同，
 * 保证放宽的只是光栅化噪声，不会放过文字、结构、布局上的任何差异。
 * 框架自己插入、与界面无关的节点不计入：脚本、样式、路由播报器，以及 Next App Router 在 body 开头插入的
 * 元数据占位 `<div hidden><!--$--><!--/$--></div>`（只认 body 直接子级、带 hidden、没有子元素也没有文字的 div）。
 */
export interface DomNode {
  /** 层级深度 */
  d: number;
  /** 标签名 */
  t: string;
  /** class 属性 */
  c: string;
  /** 位置与尺寸 [x, y, width, height]，保留两位小数 */
  r: [number, number, number, number];
  tour?: string;
  /** 元素自身的文字（不含子元素），空白折叠 */
  x?: string;
  /** style 属性 */
  s?: string;
  /** 表单控件的当前值 */
  v?: string;
  /** 滚动位置 [scrollLeft, scrollTop]，非零时才记录 */
  sc?: [number, number];
  /** SVG 元素的其余属性 */
  a?: string;
}

export interface DomSnapshot {
  title: string;
  scroll: [number, number];
  nodes: DomNode[];
}

// 以字符串形式注入页面：tsx 编译函数时会插入辅助函数调用，直接传函数到页面里执行会找不到这些辅助函数。
const SNAPSHOT_SCRIPT = `(() => {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "NEXT-ROUTE-ANNOUNCER", "NEXTJS-PORTAL"]);
  const round = (value) => Math.round(value * 100) / 100;
  const nodes = [];
  const walk = (parent, depth) => {
    for (const element of parent.children) {
      if (SKIP.has(element.tagName.toUpperCase())) continue;
      if (
        parent === document.body &&
        element.tagName === "DIV" &&
        element.hasAttribute("hidden") &&
        element.childElementCount === 0 &&
        !(element.textContent ?? "").trim()
      ) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const node = {
        d: depth,
        t: element.tagName.toLowerCase(),
        c: element.getAttribute("class") ?? "",
        r: [round(rect.x), round(rect.y), round(rect.width), round(rect.height)],
      };
      const tour = element.getAttribute("data-tour");
      if (tour) node.tour = tour;
      const text = Array.from(element.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent ?? "")
        .join("")
        .replace(/\\s+/g, " ")
        .trim();
      if (text) node.x = text;
      const style = element.getAttribute("style");
      if (style) node.s = style;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        node.v = element.value;
      }
      if (element.scrollLeft || element.scrollTop) node.sc = [round(element.scrollLeft), round(element.scrollTop)];
      if (element instanceof SVGElement) {
        const attrs = Array.from(element.attributes)
          .filter((attr) => attr.name !== "class" && attr.name !== "style")
          .map((attr) => attr.name + "=" + attr.value)
          .join(" ");
        if (attrs) node.a = attrs;
      }
      nodes.push(node);
      walk(element, depth + 1);
    }
  };
  walk(document.body, 0);
  return { title: document.title, scroll: [round(window.scrollX), round(window.scrollY)], nodes };
})()`;

export async function captureDomSnapshot(page: Page): Promise<DomSnapshot> {
  return page.evaluate<DomSnapshot>(SNAPSHOT_SCRIPT);
}

export interface DomDifference {
  /** 两边节点数 */
  expectedCount: number;
  actualCount: number;
  /** 不同的位置总数（按下标逐项比较） */
  differingNodes: number;
  /** 前几处不同，便于定位 */
  samples: { index: number; expected: DomNode | null; actual: DomNode | null }[];
  titleDiffers: boolean;
  scrollDiffers: boolean;
}

function sameNode(a: DomNode, b: DomNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 完全一致时返回 null。 */
export function diffDomSnapshots(
  expected: DomSnapshot,
  actual: DomSnapshot,
  sampleLimit = 5,
): DomDifference | null {
  const length = Math.max(expected.nodes.length, actual.nodes.length);
  const samples: DomDifference["samples"] = [];
  let differingNodes = 0;
  for (let index = 0; index < length; index += 1) {
    const a = expected.nodes[index] ?? null;
    const b = actual.nodes[index] ?? null;
    if (a && b && sameNode(a, b)) continue;
    differingNodes += 1;
    if (samples.length < sampleLimit) samples.push({ index, expected: a, actual: b });
  }
  const titleDiffers = expected.title !== actual.title;
  const scrollDiffers = expected.scroll[0] !== actual.scroll[0] || expected.scroll[1] !== actual.scroll[1];
  if (!differingNodes && !titleDiffers && !scrollDiffers) return null;
  return {
    expectedCount: expected.nodes.length,
    actualCount: actual.nodes.length,
    differingNodes,
    samples,
    titleDiffers,
    scrollDiffers,
  };
}
