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

  // 鼠标横向拖拽拨卡（窄屏才有横向滚动；宽屏十六张一次排开，不需要拨）
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
          return (
            <div
              key={code}
              className="arc-card arc-feat"
              role="listitem"
              style={style}
            >
              {/* 卡面：抽起来的是它。卡面上的东西都得长在它里面——挂在外壳上的话，
                  卡面抽走了它还留在原地，被抽屉木板挡得死死的。 */}
              <span className="arc-face">
                {/* 书脊：叠压时唯一露在外面的部分，十六张连成一排书签 */}
                <span className="arc-tab" aria-hidden>
                  {t.code}
                  <span className="arc-tab-no">№ {t.no}</span>
                </span>
                <span className="arc-code">档案 № {t.no}</span>
                <span className="arc-type">{t.code}</span>
                <span className="arc-alias">{t.alias}</span>
                <span className="arc-line">{t.epithetLines.join("")}</span>
                <span className="arc-quote">{t.cardQuote}</span>
                <span className="arc-stamp" aria-hidden>
                  已收录
                </span>
                <span className="arc-hole" aria-hidden />
                {/* 卡面上的调阅提示。真正的点击面是下面那条覆盖书脊的 Link——
                    鼠标从书脊挪到这个小链接上时容易擦过卡面边缘丢一帧 hover，
                    卡片一回落它就跑了，所以它只当指示牌，不承担点击。 */}
                <span className="arc-go" aria-hidden>
                  调出这一篇 →
                </span>
              </span>
              <Link
                href={`/types/${id}`}
                className="arc-hit"
                aria-label={`调出 ${t.code}（${t.alias}）的档案`}
              />
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

      <p className="arc-hint">
        <span className="arc-hint-wide">划过书脊 · 卡片弹出</span>
        <span className="arc-hint-narrow">拨动抽屉 · 点卡抽出</span>
      </p>
    </div>
  );
}
