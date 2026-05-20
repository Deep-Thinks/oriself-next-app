"""
g3f 自测自 · 交互式被试 CLI。

跟 smoke_gemini_self_test.py 的区别：smoke 让另一个 LLM 当被试者，全自动跑完；
本脚本把「被试者」这一角色留给**人**（或驱动这个脚本的 agent）——每轮只跑一步，
oriself 的问题打到 stdout，等下一次 `say` 把回答喂进去。oriself 由 g3f
（gemini-3-flash-preview）扮演，套用 skill-repo 里的 oriself skill 来提问。

前置：先把 server 用 gemini provider + g3f 模型起好（见文件末尾用法）。
本脚本只走 HTTP，不管 server 生命周期，会话状态由 server 的 SQLite 持有。

子命令：
    start                         新建一封信 → 发开场白「嗨」→ 打印 oriself 首问
    say   <letter_id> "<回答>"    跑一轮 → 打印 oriself 下一问 + 轮数 + status
    state <letter_id>             查看当前轮数 / status / 是否可出报告
    report <letter_id>            生成 MBTI 报告，把自包含 HTML 落到 scripts/out/

用法：
    cd server
    # 1) 后台起 server（g3f）
    ORISELF_PROVIDER=gemini ORISELF_GEMINI_MODEL=gemini-3-flash-preview \\
      ORISELF_DB_PATH=/tmp/g3f_self.db \\
      python -m uvicorn oriself_server.main:app --host 127.0.0.1 --port 8771 &
    # 2) 开跑
    python scripts/g3f_self_test.py start
    python scripts/g3f_self_test.py say <letter_id> "我的回答……"
    python scripts/g3f_self_test.py report <letter_id>
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
OUT_DIR = SCRIPT_DIR / "out"
DEFAULT_BASE = "http://127.0.0.1:8771"
MIN_CONVERGE_ROUND = 6  # 与 schemas.MIN_CONVERGE_ROUND 对齐


# ---------------------------------------------------------------------------
# SSE：消费 POST /letters/{id}/turn 的流，只取 done frame
# ---------------------------------------------------------------------------


async def _stream_turn(
    base: str, letter_id: str, user_message: str, *, timeout: float = 240.0,
) -> Tuple[str, str, int]:
    """跑一轮对话，返回 (oriself_visible, status, round)。"""
    url = f"{base}/letters/{letter_id}/turn"
    visible, status, rnd = "", "CONTINUE", 0
    error_msg: Optional[str] = None

    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, read=timeout)) as c:
        async with c.stream("POST", url, json={"user_message": user_message}) as resp:
            if resp.status_code != 200:
                txt = (await resp.aread()).decode("utf-8", "replace")
                raise RuntimeError(f"turn HTTP {resp.status_code}: {txt[:400]}")
            current_event = ""
            async for line in resp.aiter_lines():
                if not line:
                    current_event = ""
                    continue
                if line.startswith("event:"):
                    current_event = line.split(":", 1)[1].strip()
                    continue
                if line.startswith("data:"):
                    raw = line.split(":", 1)[1].strip()
                    try:
                        payload = json.loads(raw)
                    except Exception:
                        continue
                    if current_event == "done":
                        visible = payload.get("visible", visible)
                        status = payload.get("status", status)
                        rnd = payload.get("round", rnd)
                    elif current_event == "error":
                        error_msg = payload.get("message", "stream error")

    if error_msg and not visible:
        raise RuntimeError(f"server SSE error: {error_msg}")
    return visible, status, rnd


# ---------------------------------------------------------------------------
# 子命令
# ---------------------------------------------------------------------------


def _print_turn(visible: str, status: str, rnd: int) -> None:
    print("\n" + "─" * 72)
    print(f"[oriself · R{rnd} · status={status}]\n")
    print(visible.strip())
    print("─" * 72)
    if status == "CONVERGE" and rnd >= MIN_CONVERGE_ROUND:
        print("→ oriself 已声明 CONVERGE，可以 `report` 出报告了。")
    elif rnd >= MIN_CONVERGE_ROUND:
        print(f"→ 已满 {MIN_CONVERGE_ROUND} 轮，随时可 `report`；或继续 `say` 深聊。")


async def cmd_start(base: str, domain: str, provider: str) -> int:
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.post(f"{base}/letters", json={"provider": provider, "domain": domain})
        r.raise_for_status()
        letter = r.json()
    letter_id = letter["letter_id"]
    print(f"[g3f] letter 已创建: {letter_id}  (provider={provider}, skill={letter.get('skill_version')})")
    print("[g3f] 发送开场白「嗨」，等 oriself 首问……")
    visible, status, rnd = await _stream_turn(base, letter_id, "嗨")
    _print_turn(visible, status, rnd)
    print(f"\n下一步:  python scripts/g3f_self_test.py say {letter_id} \"你的回答\"")
    return 0


async def cmd_say(base: str, letter_id: str, answer: str) -> int:
    if not answer.strip():
        print("[!] 回答不能为空")
        return 2
    print(f"[g3f · 被试] {answer.strip()[:120]}")
    visible, status, rnd = await _stream_turn(base, letter_id, answer)
    _print_turn(visible, status, rnd)
    return 0


async def cmd_state(base: str, letter_id: str) -> int:
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.get(f"{base}/letters/{letter_id}/state")
        r.raise_for_status()
        st = r.json()
    print(json.dumps(st, ensure_ascii=False, indent=2))
    return 0


async def cmd_report(base: str, letter_id: str) -> int:
    print(f"[g3f] POST /letters/{letter_id}/result  生成报告中（g3f 跑 CONVERGE）……")
    t0 = time.time()
    async with httpx.AsyncClient(timeout=240.0) as c:
        r = await c.post(f"{base}/letters/{letter_id}/result")
        if r.status_code != 200:
            print(f"[!] /result HTTP {r.status_code}: {r.text[:600]}")
            return 1
        result = r.json()
        slug = result.get("issue_slug") or ""
        mbti = result.get("mbti_type") or "?"
        card_title = result.get("card_title") or "?"
        if not slug:
            print(f"[!] /result 没返回 issue_slug: {result}")
            return 1
        r_html = await c.get(f"{base}/issues/{slug}/render")
        if r_html.status_code != 200:
            print(f"[!] /issues/{slug}/render HTTP {r_html.status_code}")
            return 1
        html = r_html.text

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUT_DIR / f"g3f_self_report_{mbti}_{ts}.html"
    out_path.write_text(html, encoding="utf-8")

    print(f"\n[g3f OK] MBTI = {mbti}   ({card_title})")
    print(f"[g3f OK] issue_slug = {slug}")
    print(f"[g3f OK] 报告耗时 {time.time() - t0:.1f}s · HTML {len(html)} bytes")
    print(f"[g3f OK] 已保存 → {out_path}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="g3f_self_test")
    p.add_argument("--base", default=DEFAULT_BASE, help="server base url")
    sub = p.add_subparsers(dest="cmd", required=True)
    s_start = sub.add_parser("start", help="新建一封信并取首问")
    s_start.add_argument("--domain", default="mbti")
    s_start.add_argument("--provider", default="gemini",
                         help="LLM provider（gemini / deepseek / kimi / qwen / openai）")
    s_say = sub.add_parser("say", help="跑一轮对话")
    s_say.add_argument("letter_id")
    s_say.add_argument("answer")
    s_state = sub.add_parser("state", help="查看会话状态")
    s_state.add_argument("letter_id")
    s_report = sub.add_parser("report", help="生成报告并落 HTML")
    s_report.add_argument("letter_id")
    args = p.parse_args()

    if args.cmd == "start":
        return asyncio.run(cmd_start(args.base, args.domain, args.provider))
    if args.cmd == "say":
        return asyncio.run(cmd_say(args.base, args.letter_id, args.answer))
    if args.cmd == "state":
        return asyncio.run(cmd_state(args.base, args.letter_id))
    if args.cmd == "report":
        return asyncio.run(cmd_report(args.base, args.letter_id))
    return 2


if __name__ == "__main__":
    sys.exit(main())
