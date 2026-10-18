import { describe, expect, it } from "vitest";
import { diffDomSnapshots, type DomSnapshot } from "./dom-snapshot";

function snapshot(nodes: DomSnapshot["nodes"], scroll: [number, number] = [0, 0]): DomSnapshot {
  return { title: "明晰", scroll, nodes };
}

const card = { d: 0, t: "div", c: "card", r: [0, 0, 100, 40] as [number, number, number, number] };

describe("diffDomSnapshots", () => {
  it("完全相同返回 null", () => {
    expect(diffDomSnapshots(snapshot([card]), snapshot([{ ...card }]))).toBeNull();
  });

  it("文字、位置、节点数、滚动位置任一不同都报出", () => {
    expect(diffDomSnapshots(snapshot([card]), snapshot([{ ...card, x: "新文字" }]))?.differingNodes).toBe(1);
    expect(
      diffDomSnapshots(snapshot([card]), snapshot([{ ...card, r: [0, 0.01, 100, 40] }]))?.differingNodes,
    ).toBe(1);
    const extra = diffDomSnapshots(snapshot([card]), snapshot([card, { ...card, d: 1 }]));
    expect(extra).toMatchObject({ expectedCount: 1, actualCount: 2, differingNodes: 1 });
    expect(extra?.samples[0]).toMatchObject({ index: 1, expected: null });
    expect(diffDomSnapshots(snapshot([card]), snapshot([card], [0, 13]))?.scrollDiffers).toBe(true);
  });
});
