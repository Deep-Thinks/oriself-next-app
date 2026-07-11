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
 * 显隐只由 CSS 的 .arc-pulled 控制。样式见 globals.css 的 .arc-*。
 */

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
  const rowRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  // 拖拽后的 click 抑制：拨卡收手时不误触抽卡
  const dragRef = useRef({ down: false, sx: 0, sl: 0, moved: false });

  // 入场：滚进视野后卡片依次落位——只是 30px 位移，卡片全程可见（见 globals.css 注释）。
  // arm 只在「抽屉还在视野外」时打，避免眼前的卡片先落一次；解除由 IO + scroll 双路负责。
  // 这里的任何一环失灵，代价都只是「卡片没做落位动作」，而不是「卡片消失」。
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
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

  // 初始把预抽出的 INFP 卡滚到抽屉中央
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const card = row.querySelector<HTMLElement>(".arc-pulled");
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
      row.classList.add("arc-dragging");
    };
    const onMove = (e: PointerEvent) => {
      if (!d.down) return;
      const dx = e.clientX - d.sx;
      if (Math.abs(dx) > 5) d.moved = true;
      row.scrollLeft = d.sl - dx;
    };
    const onUp = () => {
      d.down = false;
      row.classList.remove("arc-dragging");
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
      className={`arc-drawer${armed ? " arc-armed" : ""}${settled ? " arc-settled" : ""}`}
    >
      <div ref={rowRef} className="arc-row" role="list" aria-label="十六型人格索引卡抽屉">
        {RACK.map((code, i) => {
          const style = { "--i": i } as CSSProperties;
          const id = code.toLowerCase();
          const t = TYPE_PROFILES[id];
          if (!t) {
            return (
              <div key={code} className="arc-card arc-blank" role="listitem" style={style}>
                <span className="arc-face">
                  <span className="arc-code">{code} · 待刊</span>
                  <span className="arc-hole" aria-hidden />
                </span>
              </div>
            );
          }
          const isPulled = pulled === id;
          return (
            <div
              key={code}
              className={`arc-card arc-feat${isPulled ? " arc-pulled" : ""}`}
              role="listitem"
              style={style}
            >
              <span className="arc-face">
                <span className="arc-code">OS·{t.code} · 档案 № {t.no}</span>
                <span className="arc-type">{t.code}</span>
                <span className="arc-alias">{t.alias}</span>
                <span className="arc-line">{t.epithetLines.join("")}</span>
                <span className="arc-quote">{t.cardQuote}</span>
                <span className="arc-stamp" aria-hidden>
                  已收录
                </span>
                <span className="arc-hole" aria-hidden />
              </span>
              <button
                type="button"
                className="arc-hit"
                aria-expanded={isPulled}
                aria-label={isPulled ? `推回 ${t.code} 索引卡` : `抽出 ${t.code} 索引卡`}
                onClick={() => toggle(id)}
              />
              <Link
                href={`/types/${id}`}
                className="arc-go"
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
      <div className="arc-front" aria-hidden>
        {RACK.some((c) => !TYPE_PROFILES[c.toLowerCase()]) && (
          <span className="arc-slip">
            （其余{RACK.filter((c) => !TYPE_PROFILES[c.toLowerCase()]).length === 12 ? "十二" : "几"}型，陆续刊出）
          </span>
        )}
        <span className="arc-label">
          <span className="arc-label-title">档案 · 十六型人格</span>
          <span className="arc-label-code">ORISELF ARCHIVE · 01–16</span>
        </span>
        <span className="arc-pull" />
      </div>

      <p className="arc-hint">拨动抽屉 · 点卡抽出</p>
    </div>
  );
}
