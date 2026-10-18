"use client";

import { useEffect, useMemo, useState } from "react";
import {
  backboneCoverage,
  buildIcicleTree,
  heatIntensity,
  layoutIcicle,
  pathKey,
  type DomainNoteLike,
} from "../../lib/mingxi/web/domain-coverage";
import { onTourCmd } from "../../lib/mingxi/demo/tour-bus";

export type DomainVizMode = "heat" | "icicle";

const VIZ_LS = "mingxi-domain-rail-viz-v1";

function loadVizMode(): DomainVizMode {
  if (typeof window === "undefined") return "heat";
  try {
    const v = window.localStorage.getItem(VIZ_LS);
    return v === "icicle" ? "icicle" : "heat";
  } catch {
    return "heat";
  }
}

function saveVizMode(mode: DomainVizMode) {
  try {
    window.localStorage.setItem(VIZ_LS, mode);
  } catch {
    /* quota */
  }
}

function pathsEqual(a: string[] | null, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((s, i) => s === b[i]);
}

export function DomainPurposeRail({
  notes,
  purposeLabel,
  domainFilter,
  onDomainFilter,
}: {
  notes: DomainNoteLike[];
  purposeLabel: string;
  domainFilter: string[] | null;
  onDomainFilter: (path: string[] | null) => void;
}) {
  const [viz, setViz] = useState<DomainVizMode>(loadVizMode);

  useEffect(() => {
    return onTourCmd((cmd) => {
      if (cmd.type === "web.setDomainViz") {
        switchViz(cmd.viz);
      }
    });
  }, []);

  const coverage = useMemo(() => backboneCoverage(notes), [notes]);
  const icicleRects = useMemo(() => {
    const tree = buildIcicleTree(notes, { maxDepth: 4 });
    return layoutIcicle(tree, { maxDepth: 3, depthCols: 3 });
  }, [notes]);

  function selectPath(path: string[]) {
    if (pathsEqual(domainFilter, path)) onDomainFilter(null);
    else onDomainFilter(path);
  }

  function switchViz(mode: DomainVizMode) {
    setViz(mode);
    saveVizMode(mode);
  }

  return (
    <aside className="mwb-domain-rail" aria-label="知识领域分布" data-tour="domain-rail">
      <header className="mwb-domain-rail-head">
        <strong>知识领域 · {purposeLabel || "全部"}</strong>
        <p>
          覆盖 {coverage.filledL2}/{coverage.totalL2} 个二级领域 · {coverage.noteCount}{" "}
          篇
        </p>
        <div className="mwb-domain-viz-toggle" role="tablist" aria-label="可视化版本">
          <button
            type="button"
            role="tab"
            aria-selected={viz === "heat"}
            className={viz === "heat" ? "is-on" : ""}
            onClick={() => switchViz("heat")}
          >
            热力
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viz === "icicle"}
            className={viz === "icicle" ? "is-on" : ""}
            onClick={() => switchViz("icicle")}
          >
            Icicle
          </button>
        </div>
        {domainFilter?.length ? (
          <button
            type="button"
            className="mwb-domain-clear"
            onClick={() => onDomainFilter(null)}
          >
            清除筛选 · {domainFilter.join(" / ")}
          </button>
        ) : null}
      </header>

      {viz === "heat" ? (
        <div className="mwb-domain-heat" key={`heat-${purposeLabel}-${coverage.noteCount}`}>
          {coverage.groups.map((g) => (
            <section key={g.l1} className="mwb-heat-group">
              <button
                type="button"
                className={`mwb-heat-l1${pathsEqual(domainFilter, g.path) ? " is-on" : ""}`}
                onClick={() => selectPath(g.path)}
                title={`${g.l1} · ${g.count} 篇`}
              >
                <span>{g.l1}</span>
                <em>{g.count}</em>
              </button>
              <div className="mwb-heat-cells">
                {g.cells.map((c) => {
                  const on = pathsEqual(domainFilter, c.path);
                  const empty = c.count <= 0;
                  const intensity = heatIntensity(c.count, coverage.maxCount);
                  return (
                    <button
                      key={pathKey(c.path)}
                      type="button"
                      className={`mwb-heat-cell${empty ? " is-empty" : ""}${on ? " is-on" : ""}`}
                      style={
                        empty
                          ? undefined
                          : {
                              ["--heat" as string]: String(intensity),
                            }
                      }
                      title={`${c.l1} / ${c.l2} · ${c.count} 篇`}
                      onClick={() => selectPath(c.path)}
                    >
                      <span className="mwb-heat-label">{c.l2}</span>
                      {!empty ? <em>{c.count}</em> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div
          className="mwb-domain-icicle"
          key={`icicle-${purposeLabel}-${coverage.noteCount}`}
        >
          {icicleRects.length === 0 ? (
            <p className="mwb-domain-empty">当前用途下暂无领域标注</p>
          ) : (
            <div className="mwb-icicle-canvas" role="img" aria-label="领域 Icicle">
              {icicleRects.map((r) => {
                const on = pathsEqual(domainFilter, r.path);
                const h = Math.max((r.y1 - r.y0) * 100, 1.2);
                const showLabel = h > 3.2;
                const tiny = h <= 3.2;
                return (
                  <button
                    key={`${r.id}-${r.depth}`}
                    type="button"
                    className={`mwb-icicle-seg depth-${r.depth}${on ? " is-on" : ""}${tiny ? " is-tiny" : ""}`}
                    style={{
                      top: `${r.y0 * 100}%`,
                      height: `${h}%`,
                      left: `${r.x0 * 100}%`,
                      width: `${(r.x1 - r.x0) * 100}%`,
                    }}
                    title={`${r.path.join(" / ")} · ${r.count} 篇`}
                    onClick={() => selectPath(r.path)}
                  >
                    {showLabel ? <span>{r.name}</span> : null}
                    <em>{r.count}</em>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
