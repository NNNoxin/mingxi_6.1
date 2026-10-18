"use client";

import { useCallback, useEffect, useState } from "react";
import { FloatBall, captureContext, type CapturedNote } from "./FloatBall";
import { onTourCmd } from "../../lib/mingxi/demo/tour-bus";
import "./oppo-phone-demo.css";

type ScreenId =
  | "library"
  | "xhs-feed"
  | "xhs-post"
  | "xhs-post-design"
  | "bili-hot"
  | "bili-video"
  | "wx-chats"
  | "wx-group"
  | "wx-dm"
  | "wx-pdf";

type NavAnim = "forward" | "back" | "zoom";

type AppItem = {
  name: string;
  kind: string;
  open?: "xhs-feed" | "bili-hot" | "wx-chats";
  badge?: string;
};

const HOME_APPS: AppItem[] = [
  { name: "美团", kind: "meituan" },
  { name: "携程", kind: "ctrip" },
  { name: "微信", kind: "wechat", open: "wx-chats", badge: "3" },
  { name: "小红书", kind: "xhs", open: "xhs-feed" },
  { name: "哔哩哔哩", kind: "bili", open: "bili-hot" },
  { name: "抖音", kind: "douyin" },
  { name: "淘宝", kind: "taobao" },
  { name: "拼多多", kind: "pdd" },
  { name: "支付宝", kind: "alipay" },
  { name: "闲鱼", kind: "xianyu" },
  { name: "知乎", kind: "zhihu" },
  { name: "豆瓣", kind: "douban" },
  { name: "QQ", kind: "qq" },
  { name: "相机", kind: "camera" },
  { name: "设置", kind: "settings" },
  { name: "电话", kind: "phone" },
];

const XHS_POSTS = [
  {
    id: "xhs-post" as const,
    cover: "claude",
    title: "刚刚，Claude Opus 5 系统提示词遭完整泄露",
    user: "AI圈刚刚",
    avatar: "AI",
    likes: "1.2万",
  },
  {
    id: "xhs-post-design" as const,
    cover: "glass",
    title: "Pinterest PC 端工作台 · 磨砂玻璃设计分享",
    user: "咖啡麻将",
    avatar: "咖",
    likes: "209",
  },
  {
    id: null,
    cover: "city",
    title: "原来我已经走到这里，配得上各种选择",
    user: "Cia",
    avatar: "C",
    likes: "5076",
  },
  {
    id: null,
    cover: "job",
    title: "主包最近找了 5 个远程工作，真实体验",
    user: "阿加西",
    avatar: "阿",
    likes: "4385",
  },
];

const BILI_HOT = [
  {
    id: "bili-video" as const,
    title: "#热搜 对话漫威总裁｜宇宙的崛起和转身，下一个爆点在哪里？",
    up: "小Lin说",
    views: "8.7万观看 · 2小时前",
    tag: "人气飙升",
    dur: "15:55",
    thumb: "lin",
  },
  {
    id: null,
    title: "吴聊：面对变化的世界，我们如何重新理解中国与全球化",
    up: "吴聊",
    views: "182.6万观看 · 1天前",
    tag: "1万分享",
    dur: "48:12",
    thumb: "wu",
  },
  {
    id: null,
    title: "复联4后漫威口碑波动一览：哪些还能撑住？",
    up: "片场速记",
    views: "56.2万观看 · 3天前",
    tag: "",
    dur: "12:08",
    thumb: "marvel",
  },
];

/** 简易品牌色图标（SVG），比纯文字字标更接近真机 */
function AppGlyph({ kind }: { kind: string }) {
  const common = { width: 28, height: 28, viewBox: "0 0 48 48", "aria-hidden": true as const };
  switch (kind) {
    case "xhs":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#FF2442" />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800" fontFamily="system-ui">
            红
          </text>
        </svg>
      );
    case "bili":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#FB7299" />
          <rect x="10" y="16" width="28" height="18" rx="4" fill="#fff" />
          <circle cx="18" cy="25" r="2.5" fill="#FB7299" />
          <circle cx="30" cy="25" r="2.5" fill="#FB7299" />
          <path d="M16 12 L20 16 M32 12 L28 16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "wechat":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#1AAD19" />
          <ellipse cx="20" cy="22" rx="11" ry="9" fill="#fff" opacity="0.95" />
          <ellipse cx="30" cy="28" rx="10" ry="8" fill="#C9F0C7" />
          <circle cx="16" cy="21" r="1.4" fill="#1AAD19" />
          <circle cx="22" cy="21" r="1.4" fill="#1AAD19" />
        </svg>
      );
    case "douyin":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#111" />
          <path d="M28 12v16a7 7 0 1 1-5-6.7V18c2.2 1.4 4.2 2 7 2V12z" fill="#25F4EE" />
          <path d="M30 14v16a7 7 0 1 1-5-6.7V20c2.2 1.4 4.2 2 7 2V14z" fill="#FE2C55" opacity="0.9" />
        </svg>
      );
    case "taobao":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#FF5000" />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800">
            淘
          </text>
        </svg>
      );
    case "meituan":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#FFC300" />
          <text x="24" y="31" textAnchor="middle" fill="#222" fontSize="18" fontWeight="800">
            美
          </text>
        </svg>
      );
    case "alipay":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#1677FF" />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">
            支
          </text>
        </svg>
      );
    case "pdd":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#E02E24" />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">
            拼
          </text>
        </svg>
      );
    case "ctrip":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="ctrip-g" x1="4" y1="3" x2="42" y2="45">
              <stop stopColor="#35B8FF" />
              <stop offset="1" stopColor="#1668E8" />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#ctrip-g)" />
          <path d="M8 27c7-9 18-13 32-10-6 1-10 4-13 8 5-2 9-2 13-1-7 1-13 4-18 10-4-3-9-5-14-7z" fill="#fff" />
          <circle cx="29" cy="17" r="2" fill="#FFD43B" />
        </svg>
      );
    case "xianyu":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#FFE64B" />
          <path d="M10 25c5-7 16-9 24-4l5-4-1 8 1 8-6-4c-8 5-18 2-23-4z" fill="#243040" />
          <circle cx="28" cy="23" r="1.8" fill="#FFE64B" />
          <path d="M13 26h9" stroke="#FFE64B" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "zhihu":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#1479F8" />
          <text x="24" y="32" textAnchor="middle" fill="#fff" fontSize="19" fontWeight="800">
            知
          </text>
        </svg>
      );
    case "douban":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#22A65A" />
          <text x="24" y="32" textAnchor="middle" fill="#fff" fontSize="19" fontWeight="800">
            豆
          </text>
        </svg>
      );
    case "qq":
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#EEF7FF" />
          <ellipse cx="24" cy="25" rx="10" ry="13" fill="#1A2530" />
          <ellipse cx="20.5" cy="20" rx="2.2" ry="3" fill="#fff" />
          <ellipse cx="27.5" cy="20" rx="2.2" ry="3" fill="#fff" />
          <path d="M20 25h8l-4 4z" fill="#FFB400" />
          <path d="M14 31c5 3 15 3 20 0" stroke="#E94252" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="camera-g" x1="6" y1="4" x2="42" y2="44">
              <stop stopColor="#F8FAFD" />
              <stop offset="1" stopColor="#DCE4EB" />
            </linearGradient>
            <radialGradient id="lens-g" cx="35%" cy="30%">
              <stop stopColor="#67D8FF" />
              <stop offset=".45" stopColor="#5068D8" />
              <stop offset="1" stopColor="#171B34" />
            </radialGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#camera-g)" />
          <circle cx="24" cy="24" r="11" fill="#AFBBC8" />
          <circle cx="24" cy="24" r="8.5" fill="url(#lens-g)" />
          <circle cx="21" cy="21" r="2.4" fill="#fff" opacity=".62" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="settings-g" x1="6" y1="4" x2="42" y2="44">
              <stop stopColor="#97A4B2" />
              <stop offset="1" stopColor="#566270" />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#settings-g)" />
          <circle cx="24" cy="24" r="10" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="5 3" />
          <circle cx="24" cy="24" r="4.5" fill="#fff" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="phone-g" x1="5" y1="4" x2="43" y2="44">
              <stop stopColor="#60E48A" />
              <stop offset="1" stopColor="#16A852" />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#phone-g)" />
          <path d="M16 13c2-1 5 5 5 7 0 1-2 2-3 3 2 4 4 6 8 8 1-1 2-3 3-3 2 0 8 3 7 5-1 3-4 5-7 4-9-3-15-9-18-18-1-3 2-5 5-6z" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="48" height="48" rx="12" fill="#5B6B7A" />
          <text x="24" y="30" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">
            {kind.slice(0, 1).toUpperCase()}
          </text>
        </svg>
      );
  }
}

function StatusBar({ dark }: { dark?: boolean }) {
  return (
    <div className={`sim-status${dark ? " is-dark" : ""}`}>
      <span className="sim-status-time">20:58</span>
      <span className="sim-status-right" aria-label="5G，电量 34%">
        <span className="sim-signal" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <b>5G</b>
        <span className="sim-battery" aria-hidden>
          <i />
        </span>
        <em>34</em>
      </span>
    </div>
  );
}

function LibraryScreen({
  onOpen,
}: {
  onOpen: (id: "xhs-feed" | "bili-hot" | "wx-chats") => void;
}) {
  return (
    <div className="sim-screen sim-home">
      <StatusBar dark />
      <div className="sim-home-head">
        <p className="sim-home-date">8月4日 周二</p>
        <h2 className="sim-home-clock">20:58</h2>
      </div>
      <div className="sim-app-grid">
        {HOME_APPS.map((app) => {
          const clickable = Boolean(app.open);
          const inner = (
            <>
              <span className={`sim-app-icon sim-app-icon-${app.kind}`}>
                <AppGlyph kind={app.kind} />
                {app.badge ? <i className="sim-badge">{app.badge}</i> : null}
              </span>
              <span className="sim-app-name">{app.name}</span>
            </>
          );
          return clickable ? (
            <button
              key={app.name}
              type="button"
              className="sim-app-cell is-hit"
              onClick={() => app.open && onOpen(app.open)}
              aria-label={`打开${app.name}`}
            >
              {inner}
            </button>
          ) : (
            <div key={app.name} className="sim-app-cell" aria-hidden="true">
              {inner}
            </div>
          );
        })}
      </div>
      <div className="sim-dock">
        {[
          { name: "电话", kind: "phone" },
          { name: "微信", kind: "wechat", open: "wx-chats" as const },
          { name: "小红书", kind: "xhs", open: "xhs-feed" as const },
          { name: "哔哩哔哩", kind: "bili", open: "bili-hot" as const },
        ].map((app) =>
          app.open ? (
            <button
              key={`dock-${app.name}`}
              type="button"
              className="sim-app-cell is-hit"
              onClick={() => onOpen(app.open!)}
              aria-label={`打开${app.name}`}
            >
              <span className={`sim-app-icon sim-app-icon-${app.kind}`}>
                <AppGlyph kind={app.kind} />
              </span>
              <span className="sim-app-name">{app.name}</span>
            </button>
          ) : (
            <div key={`dock-${app.name}`} className="sim-app-cell">
              <span className={`sim-app-icon sim-app-icon-${app.kind}`}>
                <AppGlyph kind={app.kind} />
              </span>
              <span className="sim-app-name">{app.name}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function XhsFeedScreen({
  onOpen,
  onHome,
}: {
  onOpen: (id: "xhs-post" | "xhs-post-design") => void;
  onHome: () => void;
}) {
  return (
    <div className="sim-screen sim-xhs">
      <StatusBar />
      <header className="xhs-top">
        <button type="button" className="xhs-exit" onClick={onHome} aria-label="回到桌面">
          ⌂
        </button>
        <nav className="xhs-tabs">
          <span>关注</span>
          <span className="is-on">发现</span>
          <span>上海</span>
        </nav>
        <button type="button" className="xhs-icon-btn" aria-label="搜索">
          ⌕
        </button>
      </header>
      <div className="xhs-sub">
        <span className="is-on">推荐</span>
        <span>RED</span>
        <span>直播</span>
        <span>短剧</span>
      </div>
      <div className="xhs-masonry">
        {XHS_POSTS.map((p) => (
          <button
            key={p.title}
            type="button"
            className="xhs-card"
            disabled={!p.id}
            onClick={() => p.id && onOpen(p.id)}
          >
            <div className={`xhs-cover xhs-cover-${p.cover}`}>
              {p.cover === "claude" && (
                <>
                  <em>Just Now</em>
                  <strong>Claude Opus 5</strong>
                  <span>系统提示词被扒光</span>
                </>
              )}
              {p.cover === "glass" && <span className="glass-ui">Inventory</span>}
              {p.cover === "city" && <span className="city-cap">都市漫游</span>}
              {p.cover === "job" && <span className="job-cap">Remote ×5</span>}
            </div>
            <p className="xhs-card-title">{p.title}</p>
            <div className="xhs-card-meta">
              <span className="xhs-av">{p.avatar}</span>
              <span>{p.user}</span>
              <span className="xhs-like">♥ {p.likes}</span>
            </div>
          </button>
        ))}
      </div>
      <nav className="xhs-tabbar">
        <button type="button" className="is-on" onClick={onHome}>
          首页
          <small>回桌面</small>
        </button>
        <span>市集</span>
        <span className="xhs-plus">+</span>
        <span>消息</span>
        <span>我</span>
      </nav>
    </div>
  );
}

/** 点选一段可捕获文字（仿真划词） */
function Sel({
  text,
  selected,
  onSelect,
}: {
  text: string;
  selected: string | null;
  onSelect: (text: string | null) => void;
}) {
  const on = selected === text;
  return (
    <button
      type="button"
      className={`sim-sel${on ? " is-on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(on ? null : text);
      }}
    >
      {text}
    </button>
  );
}

function XhsPostScreen({
  kind,
  onBack,
  selectedText,
  onSelectText,
}: {
  kind: "opus" | "design";
  onBack: () => void;
  selectedText: string | null;
  onSelectText: (text: string | null) => void;
}) {
  const opus = kind === "opus";
  return (
    <div className="sim-screen sim-xhs-post">
      <StatusBar />
      <header className="xhs-post-head">
        <button type="button" onClick={onBack} aria-label="返回发现页">
          ‹
        </button>
        <div className="xhs-post-user">
          <span className="xhs-av">{opus ? "AI" : "咖"}</span>
          <strong>{opus ? "AI圈刚刚" : "咖啡麻将"}</strong>
        </div>
        <button type="button" className="xhs-follow">
          关注
        </button>
      </header>
      <div className="xhs-post-body">
        <div className={`xhs-post-hero xhs-cover-${opus ? "claude" : "glass"}`}>
          {opus ? (
            <>
              <em>Just Now</em>
              <strong>Claude Opus 5 系统提示词遭完整泄露</strong>
              <span>64 章 · 约 13.5 万字符规则曝光</span>
              <i>2/5</i>
            </>
          ) : (
            <>
              <span className="glass-ui big">MTM Workbench</span>
              <strong>磨砂玻璃工作台</strong>
              <i>2/12</i>
            </>
          )}
        </div>
        <div className="xhs-dots" aria-hidden="true">
          <i className="is-on" />
          <i />
          <i />
          <i />
          <i />
        </div>
        <h1>
          {opus
            ? "Claude Opus 5 系统提示词遭完整泄露，64章总计 135027 个字符的规则曝光"
            : "Pinterest PC 端工作台 磨砂玻璃设计分享 2"}
        </h1>
        {opus ? (
          <>
            <p className="xhs-subline">
              开发者已将提示词整理上传公开仓库，社区正在拆解
              <Sel
                text="工具协议与安全边界"
                selected={selectedText}
                onSelect={onSelectText}
              />
              。
            </p>
            <h2>
              <b />
              1️⃣ 产品说明书
            </h2>
            <p>
              泄露文本描述了约 30 个工具能力（终端、抓取、文件等），并附带完整
              <Sel
                text="JSON Schema"
                selected={selectedText}
                onSelect={onSelectText}
              />
              ，社区讨论焦点集中在工具权限和安全边界。
            </p>
            <p>
              <Sel
                text="先存关键规则原文，再对照自家 Agent 工具权限做差分。"
                selected={selectedText}
                onSelect={onSelectText}
              />
            </p>
          </>
        ) : (
          <>
            <p className="xhs-tags">#设计分享 #磨砂玻璃 #PC工作台 #灵感</p>
            <p>
              <Sel
                text="半透明层级 + 圆角卡片 + 低对比描边"
                selected={selectedText}
                onSelect={onSelectText}
              />
              ，适合信息密度高的 CRM / 投资台。本页为仿真样例。
            </p>
            <p>
              <Sel
                text="磨砂玻璃适合做次级面板，不要抢主内容对比度。"
                selected={selectedText}
                onSelect={onSelectText}
              />
            </p>
            <div className="xhs-search-chip">猜你想搜 磨砂玻璃工作台</div>
          </>
        )}
      </div>
      <footer className="xhs-post-foot">
        <span className="xhs-input">说点什么…</span>
        <span>♥ {opus ? "1.2万" : "209"}</span>
        <span>☆ {opus ? "6910" : "240"}</span>
        <span>💬 {opus ? "334" : "7"}</span>
      </footer>
    </div>
  );
}

function BiliHotScreen({ onOpen, onHome }: { onOpen: () => void; onHome: () => void }) {
  return (
    <div className="sim-screen sim-bili">
      <StatusBar />
      <header className="bili-pink">
        <button type="button" className="bili-exit" onClick={onHome} aria-label="回到桌面">
          ⌂
        </button>
        <div className="bili-search">大冰 恭喜你拥有百万家…</div>
        <span className="bili-mail">41</span>
      </header>
      <nav className="bili-tabs">
        <span>直播</span>
        <span>推荐</span>
        <span className="is-on">热门</span>
        <span>动画</span>
        <span>影视</span>
      </nav>
      <div className="bili-quick">
        <span>排行榜</span>
        <span>每周必看</span>
        <span>入站必刷</span>
        <span>每日有料</span>
      </div>
      <div className="bili-list">
        {BILI_HOT.map((v) => (
          <button
            key={v.title}
            type="button"
            className="bili-row"
            disabled={!v.id}
            onClick={() => v.id && onOpen()}
          >
            <div className={`bili-thumb bili-thumb-${v.thumb}`}>
              <em>{v.dur}</em>
            </div>
            <div className="bili-meta">
              <p>{v.title}</p>
              {v.tag ? <span className="bili-tag">{v.tag}</span> : null}
              <small>
                UP {v.up} · {v.views}
              </small>
            </div>
          </button>
        ))}
      </div>
      <nav className="bili-tabbar">
        <button type="button" className="is-on" onClick={onHome}>
          首页
          <small>回桌面</small>
        </button>
        <span>关注</span>
        <span className="bili-plus">+</span>
        <span>会员购</span>
        <span>我的</span>
      </nav>
    </div>
  );
}

function BiliVideoScreen({
  onBack,
  selectedText,
  onSelectText,
}: {
  onBack: () => void;
  selectedText: string | null;
  onSelectText: (text: string | null) => void;
}) {
  return (
    <div className="sim-screen sim-bili-video">
      <StatusBar dark />
      <div className="bili-player">
        <button type="button" className="bili-back" onClick={onBack} aria-label="返回热门">
          ‹
        </button>
        <div className="bili-danmaku">这漫威也是有排面了</div>
        <div className="bili-danmaku d2">第一第一</div>
        <div className="bili-host">小Lin说 · 奶茶会客厅</div>
        <span className="bili-logo">bilibili</span>
      </div>
      <div className="bili-v-tabs">
        <span className="is-on">简介</span>
        <span>评论 561</span>
        <em>点我发弹幕</em>
      </div>
      <div className="bili-v-body">
        <div className="bili-crew">
          <span className="xhs-av">Lin</span>
          <div>
            <strong>小Lin说</strong>
            <small>策划 · 迪士尼影业</small>
          </div>
          <button type="button" className="bili-follow">
            + 关注
          </button>
        </div>
        <h1>#热搜 对话漫威总裁｜漫威宇宙的崛起和转身，下一个爆点在哪里？</h1>
        <p className="bili-stats">8.7万播放 · 271弹幕 · 2026-08-04 18:00 · 1000+人在看</p>
        <p>
          访谈里反复提到：
          <Sel
            text="下一个爆点不在超英本身，而在跨媒介叙事的工业化。"
            selected={selectedText}
            onSelect={onSelectText}
          />
        </p>
        <p>
          <Sel
            text="先拆分发节奏，再看角色宇宙的资产复用。"
            selected={selectedText}
            onSelect={onSelectText}
          />
        </p>
        <div className="bili-chips">
          <span>漫威</span>
          <span>商业</span>
          <span>凯文·费奇</span>
        </div>
        <div className="bili-acts">
          <span>赞 6622</span>
          <span>不喜欢</span>
          <span>投币 1226</span>
          <span>收藏 2097</span>
          <span>分享 403</span>
        </div>
        <div className="bili-hot-banner">🔥 热搜第5名 · 小Lin说对话漫威总裁</div>
        <h3>相关推荐</h3>
        <div className="bili-related">
          <div className="bili-thumb bili-thumb-wu" />
          <p>吴聊：第1集 面对变化的世界…</p>
        </div>
      </div>
    </div>
  );
}

function WxChatsScreen({
  onHome,
  onOpenGroup,
  onOpenDm,
}: {
  onHome: () => void;
  onOpenGroup: () => void;
  onOpenDm: () => void;
}) {
  const chats = [
    {
      id: "group",
      name: "AI 产品协作群",
      preview: "[文件] Attention Is All You Need.pdf",
      time: "刚刚",
      unread: 2,
      av: "群",
      tone: "group" as const,
      open: onOpenGroup,
    },
    {
      id: "dm",
      name: "林晓",
      preview: "那篇 Transformer 论文你看了吗？",
      time: "10:21",
      unread: 1,
      av: "林",
      tone: "dm" as const,
      open: onOpenDm,
    },
    {
      id: "boss",
      name: "周经理",
      preview: "明天评审把材料发我",
      time: "昨天",
      unread: 0,
      av: "周",
      tone: "dm" as const,
      open: null,
    },
    {
      id: "hr",
      name: "公司全体通知",
      preview: "本周五下午团建报名截止",
      time: "周一",
      unread: 0,
      av: "通",
      tone: "notice" as const,
      open: null,
    },
  ];

  return (
    <div className="sim-screen sim-wx">
      <StatusBar />
      <header className="wx-top">
        <button type="button" className="wx-exit" onClick={onHome} aria-label="回到桌面">
          ⌂
        </button>
        <strong>微信</strong>
        <span className="wx-plus">＋</span>
      </header>
      <div className="wx-search">搜索</div>
      <div className="wx-chat-list">
        {chats.map((c) => {
          const inner = (
            <>
              <span className={`wx-av wx-av-${c.tone}`}>{c.av}</span>
              <div className="wx-chat-meta">
                <div className="wx-chat-row1">
                  <b>{c.name}</b>
                  <small>{c.time}</small>
                </div>
                <div className="wx-chat-row2">
                  <span>{c.preview}</span>
                  {c.unread > 0 ? <i>{c.unread}</i> : null}
                </div>
              </div>
            </>
          );
          return c.open ? (
            <button key={c.id} type="button" className="wx-chat-item is-hit" onClick={c.open}>
              {inner}
            </button>
          ) : (
            <div key={c.id} className="wx-chat-item" aria-hidden="true">
              {inner}
            </div>
          );
        })}
      </div>
      <nav className="wx-tabbar">
        <button type="button" className="is-on" onClick={onHome}>
          微信
          <small>回桌面</small>
        </button>
        <span>通讯录</span>
        <span>发现</span>
        <span>我</span>
      </nav>
    </div>
  );
}

function WxGroupScreen({ onBack, onOpenPdf }: { onBack: () => void; onOpenPdf: () => void }) {
  return (
    <div className="sim-screen sim-wx-chat">
      <StatusBar />
      <header className="wx-chat-head">
        <button type="button" onClick={onBack} aria-label="返回聊天列表">
          ‹
        </button>
        <div>
          <strong>AI 产品协作群</strong>
          <small>12人</small>
        </div>
        <span>···</span>
      </header>
      <div className="wx-msgs">
        <p className="wx-day">今天 10:18</p>
        <div className="wx-msg">
          <span className="wx-av wx-av-dm">陈</span>
          <div>
            <em>陈可</em>
            <div className="wx-bubble">评审前大家先同步一下材料～</div>
          </div>
        </div>
        <div className="wx-msg">
          <span className="wx-av wx-av-dm">林</span>
          <div>
            <em>林晓</em>
            <div className="wx-bubble">我把经典论文丢群里，做 Transformer 基线对照用</div>
          </div>
        </div>
        <div className="wx-msg">
          <span className="wx-av wx-av-dm">林</span>
          <div>
            <em>林晓</em>
            <button type="button" className="wx-file" onClick={onOpenPdf}>
              <span className="wx-file-icon">PDF</span>
              <span className="wx-file-meta">
                <b>Attention Is All You Need.pdf</b>
                <small>arXiv:1706.03762 · 2.1 MB</small>
              </span>
            </button>
          </div>
        </div>
        <div className="wx-msg is-me">
          <div>
            <div className="wx-bubble">收到，我打开收进明晰笔记</div>
          </div>
          <span className="wx-av wx-av-me">我</span>
        </div>
      </div>
      <footer className="wx-inputbar">
        <span>○</span>
        <span className="wx-input">发送消息</span>
        <span>＋</span>
      </footer>
    </div>
  );
}

function WxDmScreen({ onBack, onOpenPdf }: { onBack: () => void; onOpenPdf: () => void }) {
  return (
    <div className="sim-screen sim-wx-chat">
      <StatusBar />
      <header className="wx-chat-head">
        <button type="button" onClick={onBack} aria-label="返回聊天列表">
          ‹
        </button>
        <div>
          <strong>林晓</strong>
          <small>产品同事</small>
        </div>
        <span>···</span>
      </header>
      <div className="wx-msgs">
        <p className="wx-day">今天 10:21</p>
        <div className="wx-msg">
          <span className="wx-av wx-av-dm">林</span>
          <div>
            <div className="wx-bubble">那篇 Transformer 论文你看了吗？我刚也丢群里了</div>
          </div>
        </div>
        <div className="wx-msg">
          <span className="wx-av wx-av-dm">林</span>
          <div>
            <button type="button" className="wx-file" onClick={onOpenPdf}>
              <span className="wx-file-icon">PDF</span>
              <span className="wx-file-meta">
                <b>Attention Is All You Need.pdf</b>
                <small>arXiv:1706.03762 · 2.1 MB</small>
              </span>
            </button>
          </div>
        </div>
        <div className="wx-msg is-me">
          <div>
            <div className="wx-bubble">正好，我存进笔记库</div>
          </div>
          <span className="wx-av wx-av-me">我</span>
        </div>
      </div>
      <footer className="wx-inputbar">
        <span>○</span>
        <span className="wx-input">发送消息</span>
        <span>＋</span>
      </footer>
    </div>
  );
}

function WxPdfScreen({
  onBack,
  selectedText,
  onSelectText,
}: {
  onBack: () => void;
  selectedText: string | null;
  onSelectText: (text: string | null) => void;
}) {
  return (
    <div className="sim-screen sim-wx-pdf">
      <StatusBar dark />
      <header className="wx-pdf-head">
        <button type="button" onClick={onBack} aria-label="返回聊天">
          ‹
        </button>
        <div>
          <strong>Attention Is All You Need</strong>
          <small>微信文件 · PDF</small>
        </div>
        <a
          className="wx-pdf-open"
          href="/demo-phone/attention-is-all-you-need.pdf"
          target="_blank"
          rel="noreferrer"
        >
          原件
        </a>
      </header>
      <div className="wx-pdf-scroll">
        <article className="wx-pdf-page">
          <p className="wx-pdf-arxiv">arXiv:1706.03762v7 [cs.CL] 2 Aug 2023</p>
          <h1>Attention Is All You Need</h1>
          <p className="wx-pdf-authors">
            Ashish Vaswani · Noam Shazeer · Niki Parmar · Jakob Uszkoreit · Llion Jones · Aidan N.
            Gomez · Łukasz Kaiser · Illia Polosukhin
          </p>
          <p className="wx-pdf-aff">Google Brain / Google Research / University of Toronto</p>
          <h2>Abstract</h2>
          <p>
            The dominant sequence transduction models are based on complex recurrent or convolutional
            neural networks that include an encoder and a decoder. The best performing models also
            connect the encoder and decoder through an attention mechanism. We propose a new simple
            network architecture, the{" "}
            <Sel
              text="Transformer, based solely on attention mechanisms"
              selected={selectedText}
              onSelect={onSelectText}
            />
            , dispensing with recurrence and convolutions entirely.
          </p>
          <p>
            Experiments on two machine translation tasks show these models to be superior in quality
            while being more parallelizable and requiring significantly less time to train. Our model
            achieves{" "}
            <Sel
              text="28.4 BLEU on the WMT 2014 English-to-German translation task"
              selected={selectedText}
              onSelect={onSelectText}
            />
            , improving over the existing best results, including ensembles, by over 2 BLEU.
          </p>
        </article>
        <article className="wx-pdf-page">
          <h2>1 Introduction</h2>
          <p>
            Recurrent neural networks, long short-term memory and gated recurrent neural networks in
            particular, have been firmly established as state of the art approaches in sequence
            modeling and transduction problems such as language modeling and machine translation.
          </p>
          <p>
            <Sel
              text="In this work we propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism"
              selected={selectedText}
              onSelect={onSelectText}
            />{" "}
            to draw global dependencies between input and output.
          </p>
          <p className="wx-pdf-foot">仿真页 · 正文摘自本地语料 pdf_attention（真实 arXiv 论文）</p>
        </article>
      </div>
      <footer className="wx-pdf-bar">
        <span>1 / 15</span>
      </footer>
    </div>
  );
}

function ScreenView({
  id,
  go,
  goHome,
  selectedText,
  onSelectText,
}: {
  id: ScreenId;
  go: (to: ScreenId | "back") => void;
  goHome: () => void;
  selectedText: string | null;
  onSelectText: (text: string | null) => void;
}) {
  const back = () => go("back");
  switch (id) {
    case "library":
      return <LibraryScreen onOpen={(s) => go(s)} />;
    case "xhs-feed":
      return <XhsFeedScreen onHome={goHome} onOpen={(s) => go(s)} />;
    case "xhs-post":
      return (
        <XhsPostScreen
          kind="opus"
          onBack={back}
          selectedText={selectedText}
          onSelectText={onSelectText}
        />
      );
    case "xhs-post-design":
      return (
        <XhsPostScreen
          kind="design"
          onBack={back}
          selectedText={selectedText}
          onSelectText={onSelectText}
        />
      );
    case "bili-hot":
      return <BiliHotScreen onHome={goHome} onOpen={() => go("bili-video")} />;
    case "bili-video":
      return (
        <BiliVideoScreen
          onBack={back}
          selectedText={selectedText}
          onSelectText={onSelectText}
        />
      );
    case "wx-chats":
      return (
        <WxChatsScreen
          onHome={goHome}
          onOpenGroup={() => go("wx-group")}
          onOpenDm={() => go("wx-dm")}
        />
      );
    case "wx-group":
      return <WxGroupScreen onBack={back} onOpenPdf={() => go("wx-pdf")} />;
    case "wx-dm":
      return <WxDmScreen onBack={back} onOpenPdf={() => go("wx-pdf")} />;
    case "wx-pdf":
      return (
        <WxPdfScreen onBack={back} selectedText={selectedText} onSelectText={onSelectText} />
      );
    default:
      return null;
  }
}

const TITLES: Record<ScreenId, string> = {
  library: "桌面",
  "xhs-feed": "小红书 · 发现",
  "xhs-post": "小红书 · 图文帖",
  "xhs-post-design": "小红书 · 设计帖",
  "bili-hot": "哔哩哔哩 · 热门",
  "bili-video": "哔哩哔哩 · 视频",
  "wx-chats": "微信 · 聊天",
  "wx-group": "微信 · 协作群",
  "wx-dm": "微信 · 林晓",
  "wx-pdf": "微信 · PDF",
};

function modalityLabel(m?: CapturedNote["modality"]) {
  if (m === "text_selection") return "划词";
  if (m === "pdf") return "PDF";
  return "截屏";
}

export function OppoPhoneDemo() {
  const [stack, setStack] = useState<ScreenId[]>(["library"]);
  const [dir, setDir] = useState<NavAnim>("forward");
  const [animKey, setAnimKey] = useState(0);
  const [notes, setNotes] = useState<CapturedNote[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showInbox, setShowInbox] = useState(false);
  const [selectedText, setSelectedText] = useState<string | null>(null);

  const current = stack[stack.length - 1];
  const inApp = current !== "library";
  const ctx = captureContext(current);

  const goHome = useCallback(() => {
    if (stack.length <= 1) return;
    setDir("back");
    setAnimKey((k) => k + 1);
    setStack(["library"]);
    setSelectedText(null);
  }, [stack.length]);

  const go = useCallback(
    (to: ScreenId | "back") => {
      if (to === "back") {
        if (stack.length <= 1) return;
        setDir("back");
        setAnimKey((k) => k + 1);
        setStack((s) => s.slice(0, -1));
        setSelectedText(null);
        return;
      }
      const fromLibrary = stack[stack.length - 1] === "library";
      setDir(fromLibrary ? "zoom" : "forward");
      setAnimKey((k) => k + 1);
      setStack((s) => [...s, to]);
      setSelectedText(null);
    },
    [stack],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const onCapture = useCallback((note: CapturedNote) => {
    setNotes((prev) => {
      const i = prev.findIndex((n) => n.id === note.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = note;
        return next;
      }
      return [note, ...prev];
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        go("back");
      }
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        goHome();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goHome]);

  useEffect(() => {
    return onTourCmd((cmd) => {
      if (cmd.type === "phone.home") {
        setDir("back");
        setAnimKey((k) => k + 1);
        setStack(["library"]);
        setSelectedText(null);
        setShowInbox(false);
        return;
      }
      if (cmd.type === "phone.goto") {
        const screens = cmd.screens.filter(Boolean) as ScreenId[];
        if (!screens.length) return;
        setDir(screens.length > 1 ? "forward" : "zoom");
        setAnimKey((k) => k + 1);
        setStack(screens);
        setSelectedText(null);
        return;
      }
      if (cmd.type === "phone.selectText") {
        setSelectedText(cmd.text);
        return;
      }
      if (cmd.type === "phone.openInbox") {
        setShowInbox(cmd.on !== false);
      }
    });
  }, []);

  return (
    <div className="opd">
      <div className="opd-stage">
        <p className="opd-brand" data-tour="phone-brand">
          OPPO · ColorOS 仿真
        </p>
        <h1 className="opd-title">悬浮球捕获 Demo</h1>
        <div className="opd-shell" aria-label="OPPO 手机仿真" data-tour="phone-shell">
          <div className="opd-shell-bezel">
            <div className="opd-punch" aria-hidden="true" />
            <div className="opd-side-btn opd-side-btn-l" aria-hidden="true" />
            <div className="opd-side-btn opd-side-btn-r1" aria-hidden="true" />
            <div className="opd-side-btn opd-side-btn-r2" aria-hidden="true" />

            <div className="opd-screen">
              <div key={animKey} className={`opd-layer opd-layer-${dir}`}>
                <ScreenView
                  id={current}
                  go={go}
                  goHome={goHome}
                  selectedText={selectedText}
                  onSelectText={setSelectedText}
                />
              </div>
              {stack.length > 1 ? (
                <button
                  type="button"
                  className="opd-edge-back"
                  aria-label="侧滑返回上一级"
                  onClick={() => go("back")}
                />
              ) : null}

              <FloatBall
                visible={inApp}
                contextTitle={ctx.title}
                contextApp={ctx.app}
                suggestDomain={ctx.domain}
                selectedText={selectedText}
                captureModality={ctx.modality === "pdf" ? "pdf" : "screenshot"}
                onCapture={onCapture}
                onToast={showToast}
                onClearSelection={() => setSelectedText(null)}
              />

              {toast ? <div className="fb-toast">{toast}</div> : null}

              {showInbox ? (
                <div className="fb-inbox" data-tour="phone-inbox">
                  <div className="fb-inbox-head">
                    <strong>已捕获 {notes.length}</strong>
                    <button type="button" onClick={() => setShowInbox(false)}>
                      关闭
                    </button>
                  </div>
                  <ul>
                    {notes.length === 0 ? (
                      <li className="fb-inbox-empty">还没有笔记。</li>
                    ) : (
                      notes.map((n) => (
                        <li key={n.id}>
                          <b>{n.title}</b>
                          <span>
                            {n.app} · {modalityLabel(n.modality)} ·{" "}
                            {n.parked ? "待定" : n.purposeLabel}
                            {n.declaredBy === "human" ? " · 人声明" : ""}
                          </span>
                          {n.themeBasket ? (
                            <span className="fb-inbox-tag">#{n.themeBasket}</span>
                          ) : null}
                          <em>
                            {n.domainStatus === "pending"
                              ? "领域识别中…"
                              : n.domainPath.join(" / ")}
                          </em>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}

              <button
                type="button"
                className="opd-home-bar is-btn"
                aria-label="回到手机桌面"
                title="回到桌面"
                onClick={goHome}
              />
            </div>
          </div>
        </div>

        <div className="opd-chrome">
          <div className="opd-path">
            {stack.map((id, i) => (
              <span key={`${id}-${i}`}>
                {i > 0 ? " › " : ""}
                {TITLES[id]}
              </span>
            ))}
          </div>
          <div className="opd-actions">
            <button type="button" className="opd-btn" onClick={() => go("back")} disabled={stack.length <= 1}>
              返回上一级
            </button>
            <button type="button" className="opd-btn" onClick={goHome} disabled={stack.length <= 1}>
              回桌面
            </button>
            <button
              type="button"
              className={`opd-btn${showInbox ? " is-on" : ""}`}
              data-tour="phone-inbox-btn"
              onClick={() => setShowInbox((v) => !v)}
            >
              笔记库 {notes.length > 0 ? `(${notes.length})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
