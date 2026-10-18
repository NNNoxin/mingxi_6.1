"use client";

import { useEffect, useRef, useState } from "react";
import "./logic-chain-delivery-card.css";

const REPOSITORY_URL = "https://github.com/noxinsun-source/logic-chain-project-a";

export function LogicChainDeliveryCard() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="mwb-delivery-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true" />
        独立项目
      </button>

      {open ? (
        <div
          className="mwb-delivery-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            className="mwb-delivery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mwb-delivery-title"
            aria-describedby="mwb-delivery-description"
          >
            <button
              ref={closeRef}
              type="button"
              className="mwb-delivery-close"
              aria-label="关闭独立项目介绍"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            <div className="mwb-delivery-kicker">
              <span>REAL PRODUCT</span>
              已独立交付
            </div>
            <h2 id="mwb-delivery-title">逻辑链梳理项目A</h2>
            <p id="mwb-delivery-description">
              你现在看到的是「明晰」综合产品 Demo 中的梳理逻辑线页面；这项能力已经被单独打包为一个真实可运行、可下载和可部署的开源项目。
            </p>

            <div className="mwb-delivery-facts" aria-label="独立项目能力">
              <span>独立 Web App</span>
              <span>真实 AI Provider</span>
              <span>可编辑 Canvas</span>
              <span>MCP · Codex · Claude</span>
            </div>

            <p className="mwb-delivery-note">
              不配置 API 也能回放多轮样例；配置自己的模型后，可让真实回答与右侧逻辑图随对话持续演进。
            </p>

            <div className="mwb-delivery-actions">
              <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                前往 GitHub 查看项目 <span aria-hidden="true">↗</span>
              </a>
              <button type="button" onClick={() => setOpen(false)}>
                留在当前 Demo
              </button>
            </div>
            <code>{REPOSITORY_URL}</code>
          </section>
        </div>
      ) : null}
    </>
  );
}
