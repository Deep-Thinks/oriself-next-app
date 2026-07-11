"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TYPE_PROFILES } from "@/lib/type-profiles";

/**
 * 档案抽屉 · 十六型索引卡（真能拨动、单张抽出）。
 *
 * 交互三件套：横向拖拽拨卡（鼠标 pointer / 触屏原生滚动）、点卡抽出
 * （一次只抽一张，再点推回）、抽出后浮出「调出这一篇 →」进档案页。
 * SEO：四张已刊卡的全部文字与 <Link> 常驻 DOM（SSR 可收录），
 * 显隐只由 CSS 的 .ad-pulled 控制。样式见 globals.css 的 .ad-*。
 */

/** 落位耗时：过渡 0.6s + 末张错开 15×26ms，留一点余量。
    到点后强制落终态（.ad-done），卡片可见性不押在动效引擎上。 */
const ENTER_MS = 1200;

/** 铅字架顺序：字母序，与真实卡柜的检索习惯一致。
    已刊/待刊由 TYPE_PROFILES 是否收录自动判定——新档案合入即点亮。 */
const RACK = [
  "ENFJ", "ENFP", "ENTJ", "ENTP",
  "ESFJ", "ESFP", "ESTJ", "ESTP",
  "INFJ", "INFP", "INTJ", "INTP",
  "ISFJ", "ISFP", "ISTJ", "ISTP",
] as const;

export function ArchiveDrawer() {
  const [pulled, setPulled] = useState<string | null>("infp");
  const [armed, setArmed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [done, setDone] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  // 拖拽后的 click 抑制：拨卡收手时不误触抽卡
  const dragRef = useRef({ down: false, sx: 0, sl: 0, moved: false });

  // 入场：滚进视野后卡片依次落位。
  //
  // 抽屉里必须有卡——空木盒是事故，不是动效的中间态（v3.3.2 线上：动画没推进，卡片
  // 钉死在 from 帧）。所以可见性四层兜底，每层都不依赖上一层：
  //   1. CSS 默认直出卡面；藏起来只在 .ad-armed 下生效 → JS 没跑/hydration 失败也有卡
  //   2. arm 只在「抽屉还在视野外」时打 → JS 到得太晚也不会把已在眼前的卡藏掉
  //   3. arm 之后由 IO + scroll 双路解除 → 观察器失灵/漏触发时，滚动照样把卡放出来
  //   4. 解除后 ENTER_MS 强制落终态（见下一个 effect）→ 动效引擎不跑也一定看得见
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    // 已在视野里：直接落终态，不播（否则卡片会先现身再被藏起来闪一下）
    const reached = () =>
      el.getBoundingClientRect().top <= window.innerHeight * 0.95;
    if (reached() || !("IntersectionObserver" in window)) {
      setSettled(true);
      return;
    }
    setArmed(true);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      setSettled(true);
      teardown();
    };
    const onScroll = () => {
      if (reached()) release();
    };
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) release();
      },
      { threshold: 0.05 },
    );
    const teardown = () => {
      io.disconnect();
      // capture：滚动事件不冒泡，页面若在内层容器里滚动也能听到
      window.removeEventListener("scroll", onScroll, true);
    };
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return teardown;
  }, []);

  // 落位时间一到就钉死终态：过渡跑完了它什么也不改，过渡没跑（引擎被禁/暂停/异常）
  // 它把卡片直接放出来——抽屉绝不允许停在空盒状态。
  useEffect(() => {
    if (!settled) return;
    const t = window.setTimeout(() => setDone(true), ENTER_MS);
    return () => window.clearTimeout(t);
  }, [settled]);

  // 初始把预抽出的 INFP 卡滚到抽屉中央
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const card = row.querySelector<HTMLElement>(".ad-pulled");
    if (card) {
      row.scrollLeft = Math.max(
        0,
        card.offsetLeft - (row.clientWidth - card.offsetWidth) / 2,
      );
    }
  }, []);

  // 鼠标横向拖拽拨卡（触屏走原生滚动，不接管）
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const d = dragRef.current;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      d.down = true;
      d.sx = e.clientX;
      d.sl = row.scrollLeft;
      d.moved = false;
      row.classList.add("ad-dragging");
    };
    const onMove = (e: PointerEvent) => {
      if (!d.down) return;
      const dx = e.clientX - d.sx;
      if (Math.abs(dx) > 5) d.moved = true;
      row.scrollLeft = d.sl - dx;
    };
    const onUp = () => {
      d.down = false;
      row.classList.remove("ad-dragging");
    };
    const onClick = (e: MouseEvent) => {
      if (d.moved) {
        e.preventDefault();
        e.stopPropagation();
        d.moved = false;
      }
    };
    row.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    row.addEventListener("click", onClick, true);
    return () => {
      row.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      row.removeEventListener("click", onClick, true);
    };
  }, []);

  const toggle = (id: string) =>
    setPulled((p) => (p === id ? null : id));

  return (
    <div
      ref={drawerRef}
      className={`ad-drawer${armed ? " ad-armed" : ""}${settled ? " ad-settled" : ""}${done ? " ad-done" : ""}`}
    >
      <div ref={rowRef} className="ad-row" role="list" aria-label="十六型人格索引卡抽屉">
        {RACK.map((code, i) => {
          const style = { "--i": i } as CSSProperties;
          const id = code.toLowerCase();
          const t = TYPE_PROFILES[id];
          if (!t) {
            return (
              <div key={code} className="ad-card ad-blank" role="listitem" style={style}>
                <span className="ad-in">
                  <span className="ad-code">{code} · 待刊</span>
                  <span className="ad-hole" aria-hidden />
                </span>
              </div>
            );
          }
          const isPulled = pulled === id;
          return (
            <div
              key={code}
              className={`ad-card ad-feat${isPulled ? " ad-pulled" : ""}`}
              role="listitem"
              style={style}
            >
              <span className="ad-in">
                <span className="ad-code">OS·{t.code} · 档案 № {t.no}</span>
                <span className="ad-type">{t.code}</span>
                <span className="ad-alias">{t.alias}</span>
                <span className="ad-line">{t.epithetLines.join("")}</span>
                <span className="ad-quote">{t.cardQuote}</span>
                <span className="ad-stamp" aria-hidden>
                  已收录
                </span>
                <span className="ad-hole" aria-hidden />
              </span>
              <button
                type="button"
                className="ad-hit"
                aria-expanded={isPulled}
                aria-label={isPulled ? `推回 ${t.code} 索引卡` : `抽出 ${t.code} 索引卡`}
                onClick={() => toggle(id)}
              />
              <Link
                href={`/types/${id}`}
                className="ad-go"
                tabIndex={isPulled ? 0 : -1}
                aria-hidden={!isPulled}
                onClick={(e) => e.stopPropagation()}
              >
                调出这一篇 →
              </Link>
            </div>
          );
        })}
      </div>

      {/* 抽屉面板：标签牌 + 拉手 + 待刊便签（全部刊出后自动摘掉） */}
      <div className="ad-front" aria-hidden>
        {RACK.some((c) => !TYPE_PROFILES[c.toLowerCase()]) && (
          <span className="ad-slip">
            （其余{RACK.filter((c) => !TYPE_PROFILES[c.toLowerCase()]).length === 12 ? "十二" : "几"}型，陆续刊出）
          </span>
        )}
        <span className="ad-label">
          <span className="ad-label-title">档案 · 十六型人格</span>
          <span className="ad-label-code">ORISELF ARCHIVE · 01–16</span>
        </span>
        <span className="ad-pull" />
      </div>

      <p className="ad-hint">拨动抽屉 · 点卡抽出</p>
    </div>
  );
}
