"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  /**
   * 草稿持久化 key — 通常传 letterId。每封信独立草稿；不传则不暂存。
   */
  draftKey?: string;
  /**
   * 外部预填 · 用 token 触发（而不是内容）——父组件点"话题种子"按钮时，
   * 传 `{ text, token: Date.now() }` 把文本塞进 textarea 并自动 focus。
   * 即便 text 相同也能再次触发（例如用户清空了再点同一个种子）。
   */
  prefill?: { text: string; token: number } | null;
  /**
   * A-3 · 空态情境 chips · textarea 上方一排小按钮。点击直接填进 textarea。
   * 通常只在 `turns.length === 0` 时传；非空态传 undefined / [] 不渲染。
   * Probe 反馈 #18/#21：首页对话框位置不显眼。把种子 chip 紧贴输入框，
   * 让"我该从哪儿写"的视觉答案直接落在 composer 上。
   */
  chips?: string[];
}

const DRAFT_PREFIX = "oriself:draft:";
const DRAFT_DEBOUNCE_MS = 400;

function readDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(DRAFT_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(DRAFT_PREFIX + key, value);
    else window.localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    /* quota exceeded etc. — silent */
  }
}

/**
 * Composer · it's a line, not a box.
 *
 * The underline IS the input. On focus the underline turns oxblood.
 * Enter 发送；Shift+Enter 换行；Cmd/Ctrl+Enter 仍兼容（老习惯）。
 *
 * 草稿（ESC 暂存）：
 *  - 输入随时持久化到 localStorage（debounced），下次进同一封信自动恢复。
 *  - ESC = 主动暂存 + 失焦：刷新视觉反馈「刚刚已存」。
 *  - 发送成功后清空草稿。
 */
export function Composer({
  onSend,
  disabled,
  draftKey,
  prefill,
  chips,
}: Props) {
  const [text, setText] = useState("");
  const [savedHint, setSavedHint] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<number | null>(null);

  // A-3 · 点 chip 直接填进 textarea + focus；不走 prefill token 那套外部触发机制
  const handleChipClick = useCallback((chipText: string) => {
    setText(chipText);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      const end = chipText.length;
      try {
        ta.setSelectionRange(end, end);
      } catch {
        /* 部分受控 textarea 抛错，忽略 */
      }
    });
  }, []);

  // 进入时恢复草稿
  useEffect(() => {
    if (!draftKey) return;
    const draft = readDraft(draftKey);
    if (draft) setText(draft);
  }, [draftKey]);

  // 外部预填 · 点话题种子时由父组件触发
  useEffect(() => {
    if (!prefill || !prefill.text) return;
    setText(prefill.text);
    // focus + 光标移到末尾，方便用户继续编辑
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      const end = prefill.text.length;
      try {
        ta.setSelectionRange(end, end);
      } catch {
        /* 某些受控 textarea 可能抛错，忽略 */
      }
    });
    // 依赖 token 而非 text，让同一个种子可以被重复点击
  }, [prefill?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动增高
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  // 草稿 debounced 持久化
  useEffect(() => {
    if (!draftKey) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      writeDraft(draftKey, text);
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [text, draftKey]);

  const handleSend = useCallback(() => {
    // 兜底：如果外部用代码（测试 / 浏览器扩展 / 输入法）把 textarea.value 写进来
    // 但没触发 React 的 onChange，就退而用 DOM 的 value，避免按钮判断空的错觉。
    const raw = text || taRef.current?.value || "";
    const trimmed = raw.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (draftKey) writeDraft(draftKey, "");
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.style.height = "auto";
        taRef.current.value = "";
      }
    });
  }, [text, disabled, onSend, draftKey]);

  const handleStashDraft = useCallback(() => {
    if (!draftKey) {
      // 没有 draftKey 时 ESC 仅失焦
      taRef.current?.blur();
      return;
    }
    writeDraft(draftKey, text);
    taRef.current?.blur();
    setSavedHint(true);
    window.setTimeout(() => setSavedHint(false), 1600);
  }, [text, draftKey]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // IME 输入法组词中按 Enter 是确认候选，不发送（中文拼音/日文/韩文等）。
      // e.nativeEvent.isComposing 是标准；keyCode 229 兼容部分浏览器/输入法的占位 keycode。
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      // Enter 发送 · Shift+Enter 换行 · Cmd/Ctrl+Enter 兼容老习惯
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleStashDraft();
      }
    },
    [handleSend, handleStashDraft],
  );

  return (
    <footer
      // z-20 > main 的 z-10 —— 第 2 轮之后 main 内容撑到视口底部时，
      // main 的 pb-[260px] padding 区域会堆在 composer 上面抢走点击
      // （composer 自己 pointer-events-none，但内层 textarea 的 pointer-events-auto
      // 区域需要比 main 高才能稳定接收点击）。
      // 移动端把 pt 砍半、渐变收紧，避免最新一段答复被吞进雾里。
      className="fixed left-0 right-0 bottom-0 z-20 px-6 sm:px-8 pt-10 sm:pt-20 pb-[max(16px,env(safe-area-inset-bottom))] sm:pb-9 pointer-events-none"
      style={{
        background:
          "linear-gradient(to top, var(--paper) 70%, rgba(245, 240, 230, 0.92) 88%, rgba(245, 240, 230, 0))",
      }}
    >
      <div className="max-w-[620px] mx-auto pointer-events-auto">
        {/* A-3 · 空态情境 chips · 紧贴 textarea 上方。点击直接填进输入框。
            移动端：basis-full 让标签独占首行避免挤压（Codex P2）；
            chip 触控区 min-h-[40px] + px-4 满足 ≥40px 触控规范（Codex P1）。 */}
        {chips && chips.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 sm:gap-3 items-center">
            <span className="font-mono text-[10px] tracking-widest uppercase text-ink-muted basis-full sm:basis-auto sm:mr-2">
              想不到从哪起 ·
            </span>
            {chips.map((chip, idx) => (
              <button
                key={`${chip}-${idx}`}
                type="button"
                onClick={() => handleChipClick(chip)}
                disabled={disabled}
                className="fraunces-body italic text-[15px] text-accent hover:text-accent-soft border border-accent/30 hover:border-accent rounded-full px-4 min-h-[40px] bg-transparent transition-colors disabled:opacity-40 cursor-pointer inline-flex items-center"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled ? "正在听……" : "写下你想到的第一件事，不必修饰……"
          }
          disabled={disabled}
          className="no-scrollbar w-full bg-transparent fraunces-body-soft text-[20px] leading-[1.55] text-ink resize-none outline-none pt-[6px] pb-[10px] border-b border-rule-strong focus:border-accent transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-60 placeholder:italic placeholder:text-ink-muted placeholder:opacity-70"
          style={{
            caretColor: "var(--accent)",
            // 超过 200px 自动滚动但无可见条 · 配合 .no-scrollbar 全平台统一
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        />

        <div className="flex justify-between items-center mt-[14px] font-mono text-[10px] tracking-wide uppercase text-ink-muted">
          {/* 移动端没有 Enter / ESC，只保留「暂存」一行状态；桌面保留完整快捷键提示。 */}
          <span aria-live="polite" className="hidden sm:inline">
            {savedHint
              ? "已暂存 · 下次回来还在"
              : "↵ 发送 · Shift+↵ 换行 · ESC 暂存"}
          </span>
          <span aria-live="polite" className="sm:hidden">
            {savedHint ? "已暂存" : "轻点 → 发送"}
          </span>
          <button
            onClick={handleSend}
            // 同时看 React state + DOM value，两处有一处非空就允许点；避免 state
            // 与 textarea.value 暂时不同步（例如外部 fill）导致按钮误 disabled。
            disabled={
              disabled || (!text.trim() && !(taRef.current?.value || "").trim())
            }
            className="fraunces-body italic text-[15px] text-accent hover:text-accent-soft transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-40 disabled:hover:text-accent bg-transparent border-0 cursor-pointer normal-case tracking-normal"
          >
            发 送 <span className="font-mono not-italic">→</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
