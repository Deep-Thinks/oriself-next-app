# Major 域 · Plan 1 · 可插拔管道（垂直切片）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `domain="major"` 在现有 oriself skill 架构里端到端跑通——一个 major 会话能加载 **major 专属、且与 mbti 隔离** 的 skill 文件、对话、并生成一份**无四字母 MBTI**的 major 报告落库——全部配 **stub 文案**（真实 D1-D14 文案在 Plan 2）。

**Architecture:** Arch-1 可插拔域（不碰 mbti 的 phases/CONVERGE/compose 路径）。核心是把 on-demand Pass-1 的 **catalogue 按 `session.domain` 过滤**（否则 LLM 同时看到两套 phase），并给 converge / compose / schema / DB 各开一条 major 分支。domain 已是真实字段（`models.py:45`），无需新建概念。

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy 2 · Pydantic 2 · pytest（`asyncio_mode=auto`，`testpaths=["tests"]`）。测试根：`server/`，命令 `cd server && pytest`。

**关键设计决策（可在 review 时推翻）：**
- **DB**：mbti_type 列对 major 写占位 `"MAJOR"`（≤8 字符，满足 `NOT NULL String(8)`，零迁移）；新增 `result_label String(64) nullable` 存真实"大方向名"，通过 `init_db` 一次性 `ALTER TABLE ADD COLUMN`（复用仓库 one-shot 迁移范式，不引 Alembic）。mbti 路径完全不动。
- **phase 命名**：major phase 文件用**独立名** `major-onboarding … major-soft-closing`（带 `domain: major` frontmatter），与 mbti 的 `phase-*` 不冲突；catalogue 按 domain 过滤后，read_skill 的 enum 里**只有当前域的 phase**，LLM 物理上选不到跨域 phase。
- **边界**："不预测分数/不主动说 AI 干掉你爱的"走 **prompt（软）**，不进 guardrails（无法正则可靠判定，硬拦会重蹈 v2.0-2.3 覆辙）。Plan 1 只搭管道，这些软边界文案在 Plan 2。

---

## File Structure

**新增（skill-repo，本计划只放 stub，真实文案在 Plan 2）：**
- `skill-repo/skills/oriself/domains/major.md` — major 域透镜（stub）
- `skill-repo/skills/oriself/phases/major-onboarding.md` … `major-soft-closing.md` — 6 个 major phase（stub，`domain: major`）
- `skill-repo/skills/oriself/CONVERGE-major.md` — major 报告生成指引（stub，`name: converge-major`）

**修改（server）：**
- `server/oriself_server/skill_loader.py` — 加载 `CONVERGE-major.md`；`list_all_names(domain)` / `build_skill_index_block(domain)` 域过滤；`converge_md_for(domain)` + `compose_converge_prompt` 域分支
- `server/oriself_server/skill_runner.py` — Pass-1 catalogue 传 `session.domain`；`choose_phase_key` 域分支；`ReportRunner.compose` major 分支（跳四字母）
- `server/oriself_server/schemas.py` — `MajorConvergeOutput`
- `server/oriself_server/models.py` — `TestResult.result_label` 列
- `server/oriself_server/database.py` — `init_db` 一次性 ALTER 加列
- `server/oriself_server/routes/letters.py` — `compose_result` major 分支（slug 前缀 / 占位 mbti_type / result_label）

**测试：**
- `server/tests/test_major_domain.py` — 本计划所有新行为的单测（新文件，集中放，便于一处看全）

---

## Task 1: Major skill stub 文件 + 加载断言

**Files:**
- Create: `skill-repo/skills/oriself/domains/major.md`
- Create: `skill-repo/skills/oriself/phases/major-onboarding.md`,`major-warmup.md`,`major-exploring.md`,`major-midpoint.md`,`major-deep.md`,`major-soft-closing.md`
- Create: `skill-repo/skills/oriself/CONVERGE-major.md`
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**

`server/tests/test_major_domain.py`（新文件）：
```python
"""major 域 · Plan 1 管道测试。"""
from pathlib import Path

from oriself_server.skill_loader import clear_cache, load_skill_bundle

SKILL_ROOT = (
    Path(__file__).resolve().parent.parent.parent
    / "skill-repo" / "skills" / "oriself"
)


def setup_function(_):
    clear_cache()


def test_major_stub_files_loaded():
    bundle = load_skill_bundle(SKILL_ROOT)
    # major 域透镜进了 domain_md
    assert "major" in bundle.domain_md
    # 6 个 major phase 都在 refs，body 非空
    for key in (
        "major-onboarding", "major-warmup", "major-exploring",
        "major-midpoint", "major-deep", "major-soft-closing",
    ):
        assert key in bundle.refs, f"missing {key}"
        assert bundle.refs[key].body.strip(), f"{key} body empty"
        assert bundle.refs[key].meta.get("domain") == "major"
    # major converge 进了 refs（name: converge-major）
    assert "converge-major" in bundle.refs
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_major_stub_files_loaded -v`
Expected: FAIL（`"major" not in bundle.domain_md` / `missing major-onboarding` / `CONVERGE-major.md` 不会被 loader 读，见 Task 2）

- [ ] **Step 3: 建 stub 文件**

`skill-repo/skills/oriself/domains/major.md`：
```markdown
---
name: major
domain: major
display_name: 专业方向
description: major 域透镜（stub · 真实文案见 Plan 2）
---

# Domain · major（stub）

（Plan 2 在此写入 D1-D14：意义三问框架 / 赝品检测器 / 内核-外壳 / 外部约束翻译 / 2030 可见度梯度 / 最小 distress 拦截 / 读 MBTI 报告护栏。）
```

6 个 phase 文件，以 `major-onboarding.md` 为模板（其余把 `name`/正文标题换成对应阶段名）：
```markdown
---
name: major-onboarding
domain: major
description: major 开场（stub）
needs: []
---

# major · 开场（stub · Plan 2 写真实文案）
```
> 其余 5 个：`major-warmup`/`major-exploring`/`major-midpoint`/`major-deep`/`major-soft-closing`，frontmatter 的 `name`/`description` 与正文标题相应替换，`domain: major` 不变，`needs: []`。

`skill-repo/skills/oriself/CONVERGE-major.md`：
```markdown
---
name: converge-major
description: major 报告生成指引（stub · 真实文案见 Plan 2）
---

# CONVERGE · 专业方向报告（stub）

输出一份完整自包含 HTML（`<!doctype html>` 到 `</html>`），不含 `<script>`/`<iframe>`/事件处理器。
（Plan 2 在此写入：内核-外壳剥离 → C 式翻译法命名 + 命名诚实约束 → 低成本试探 → 2030 梯度 + 软边界。）
```

- [ ] **Step 4: 跑测试**（此时仍会因 CONVERGE-major 未加载而部分失败——见 Task 2，本步只确认 domain + phases 部分通过）

Run: `cd server && pytest tests/test_major_domain.py::test_major_stub_files_loaded -v`
Expected: 仍 FAIL，但失败原因收窄到 `"converge-major" not in bundle.refs`（domain/phases 断言已过）。Task 2 修复。

- [ ] **Step 5: Commit**

```bash
git add skill-repo/skills/oriself/domains/major.md skill-repo/skills/oriself/phases/major-*.md skill-repo/skills/oriself/CONVERGE-major.md server/tests/test_major_domain.py
git commit -m "feat(major): add major-domain stub skill files + load test"
```

---

## Task 2: loader 加载 CONVERGE-major.md + converge 域分支

**Files:**
- Modify: `server/oriself_server/skill_loader.py:418-458`（`load_skill_bundle`）、`:374-397`（`compose_converge_prompt`）、`:117-120`（`converge_md` property 附近加 `converge_md_for`）
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**

追加到 `test_major_domain.py`：
```python
def test_converge_major_selected_by_domain():
    bundle = load_skill_bundle(SKILL_ROOT)
    p_major = bundle.compose_converge_prompt(domain="major")
    p_mbti = bundle.compose_converge_prompt(domain="mbti")
    # major 用的是 CONVERGE-major.md（含 stub 特征词），且不混入 mbti converge 的四字母指令
    assert "专业方向报告" in p_major
    assert "Domain · major" in p_major
    # mbti 路径不受影响（回归）
    assert "专业方向报告" not in p_mbti
    assert "Domain · mbti" in p_mbti
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_converge_major_selected_by_domain -v`
Expected: FAIL（`CONVERGE-major.md` 未被 loader 读入 refs，`compose_converge_prompt` 仍硬取 `converge`）

- [ ] **Step 3: 改 loader 读取 CONVERGE-major.md**

`skill_loader.py:439`，把根级文件 tuple 加一项：
```python
    for filename in ("ETHOS.md", "CONVERGE.md", "CONVERGE-major.md"):
        p = root / filename
        if p.exists():
            r = _build_ref(p)
            refs[r.name] = r
```

- [ ] **Step 4: 加 `converge_md_for` 并改 `compose_converge_prompt`**

在 `converge_md` property（`skill_loader.py:119-120`）下方加：
```python
    def converge_md_for(self, domain: str) -> str:
        """按 domain 选 converge body：major → converge-major，否则 converge。"""
        ref_name = "converge-major" if domain == "major" else "converge"
        ref = self.refs.get(ref_name) or self.refs.get("converge")
        return ref.body if ref else ""
```
`compose_converge_prompt`（`skill_loader.py:382-385`），把写死的 `self.converge_md` 换成域感知：
```python
        parts: List[str] = []

        converge_body = self.converge_md_for(domain)
        if converge_body:
            parts.append(converge_body)
        else:
            parts.append("# CONVERGE 指引缺失，请检查 skill-repo")
```
（`domain in self.domain_md` 追加段、ETHOS 段保持不变。）

- [ ] **Step 5: 跑测试 + 回归**

Run: `cd server && pytest tests/test_major_domain.py::test_converge_major_selected_by_domain tests/test_skill_loader.py -v`
Expected: 新测试 PASS；`test_skill_loader.py` 全绿（尤其 `test_converge_prompt_composition` 不受影响）。
另：Task 1 的 `test_major_stub_files_loaded` 现在应整体 PASS。

- [ ] **Step 6: Commit**

```bash
git add server/oriself_server/skill_loader.py server/tests/test_major_domain.py
git commit -m "feat(major): loader reads CONVERGE-major.md + domain-aware converge prompt"
```

---

## Task 3: catalogue 按 domain 过滤（治"LLM 看到两套 phase"陷阱）

**Files:**
- Modify: `server/oriself_server/skill_loader.py:235-241`（`list_all_names`）、`:277-308`（`build_skill_index_block`）
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**

追加：
```python
def test_catalogue_domain_scoped():
    bundle = load_skill_bundle(SKILL_ROOT)
    major_names = bundle.list_all_names("major")
    mbti_names = bundle.list_all_names("mbti")

    # major 会话只看到 major phase，看不到 mbti phase
    assert "major-deep" in major_names
    assert "phase-deep" not in major_names
    assert "major" in major_names           # major 域透镜
    assert "mbti" not in major_names         # 不漏 mbti 域透镜
    # 共享的 techniques/examples 两域都在
    assert "situational-questions" in major_names

    # mbti 会话只看到 mbti phase（回归）
    assert "phase-deep" in mbti_names
    assert "major-deep" not in mbti_names
    assert "mbti" in mbti_names
    assert "major" not in mbti_names

    # 不传 domain → 全集（向后兼容，现有调用不破）
    all_names = bundle.list_all_names()
    assert "phase-deep" in all_names and "major-deep" in all_names

    # Skill Index 同样按 domain 过滤
    idx_major = bundle.build_skill_index_block("major")
    assert "major-deep" in idx_major and "phase-deep" not in idx_major
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_catalogue_domain_scoped -v`
Expected: FAIL（`list_all_names` 不接受 domain 参数 → TypeError）

- [ ] **Step 3: 改 `list_all_names` 接受可选 domain 过滤**

`skill_loader.py:235-241` 替换为：
```python
    def list_all_names(self, domain: Optional[str] = None) -> List[str]:
        """枚举 catalogue 名字，稳定排序，供 read_skill schema enum 注入。

        传 domain 时按域过滤：phases 只留 frontmatter `domain` 匹配的
        （无 `domain` 字段默认 "mbti"，向后兼容）；domains 只留该域透镜；
        techniques / examples 共享，不过滤。不传 domain → 全集。
        """
        out: List[str] = []
        for r in self.refs.values():
            if r.parent_dir not in self._CATALOGUE_DIRS:
                continue
            if domain is not None:
                if r.parent_dir == "phases":
                    if (r.meta.get("domain") or "mbti") != domain:
                        continue
                elif r.parent_dir == "domains":
                    if (r.meta.get("domain") or r.path.stem) != domain:
                        continue
            out.append(r.name)
        return sorted(set(out))
```

- [ ] **Step 4: 改 `build_skill_index_block` 透传 domain**

`skill_loader.py:277` 签名 + `:289` 循环：
```python
    def build_skill_index_block(self, domain: Optional[str] = None) -> str:
        ...
        for name in self.list_all_names(domain):
            ref = self.refs[name]
            ...
```
（其余函数体不变。）

- [ ] **Step 5: 跑测试 + 回归**

Run: `cd server && pytest tests/test_major_domain.py::test_catalogue_domain_scoped tests/test_skill_loader.py -v`
Expected: 新测试 PASS；`test_skill_loader.py` 全绿（`list_all_names()` 无参调用仍返全集）。

- [ ] **Step 6: Commit**

```bash
git add server/oriself_server/skill_loader.py server/tests/test_major_domain.py
git commit -m "feat(major): domain-scoped catalogue + skill index (no cross-domain phase leak)"
```

---

## Task 4: skill_runner Pass-1 传 session.domain + choose_phase_key 域分支

**Files:**
- Modify: `server/oriself_server/skill_runner.py:557`（Pass1 catalogue）、`:553-556` 附近（skill_index）、`:142-170`（`choose_phase_key`）
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**（choose_phase_key 域分支，可纯单测）

追加（构造最小 `SessionState`；按 `skill_runner.py:88` 的 dataclass 字段填）：
```python
from oriself_server.skill_runner import choose_phase_key, SessionState
from oriself_server.schemas import UserPreferences


def _mk_state(domain: str) -> SessionState:
    return SessionState(
        session_id="t", provider="mock", domain=domain,
        user_preferences=UserPreferences(), conversations=[],
    )


def test_choose_phase_key_domain_aware():
    mbti = _mk_state("mbti")
    major = _mk_state("major")
    assert choose_phase_key(mbti, 1) == "phase-onboarding"
    assert choose_phase_key(major, 1) == "major-onboarding"
    assert choose_phase_key(major, 12) == "major-deep"      # R12 > midpoint
    assert choose_phase_key(major, 2) == "major-warmup"
```
> 注：若 `SessionState` 的实际字段名/必填项与上面不符，先 `Read server/oriself_server/skill_runner.py:85-100` 校对再改造这个 fixture（dataclass，必填字段需补全）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_choose_phase_key_domain_aware -v`
Expected: FAIL（`choose_phase_key` 对 major 仍返 `phase-onboarding`）

- [ ] **Step 3: 改 `choose_phase_key` 加域前缀**

`skill_runner.py:142-170`，在函数末尾返回前，把现有逻辑算出的 base key 按域改名。最小改法：抽出内部 base 计算，外层包域分支：
```python
def choose_phase_key(session: SessionState, current_round: int) -> str:
    base = _choose_phase_base(session, current_round)
    if session.domain == "major":
        return base.replace("phase-", "major-")
    return base


def _choose_phase_base(session: SessionState, current_round: int) -> str:
    # —— 原 choose_phase_key 的函数体，原样搬进来 ——
    if current_round == ONBOARDING_ROUND:
        return "phase-onboarding"
    target = effective_target_rounds(session.user_preferences)
    mid = _midpoint_round(target)
    near = _near_end_round(target)
    did_midpoint = current_round > mid
    did_soft_closing = current_round > near
    if current_round == mid and not did_midpoint:
        return "phase-midpoint"
    if current_round == near and not did_soft_closing:
        return "phase-soft-closing"
    if current_round > mid:
        return "phase-deep"
    if current_round <= 3:
        return "phase-warmup"
    return "phase-exploring"
```
> 4 个调用点（`skill_runner.py:127,389,458,638`）签名不变（仍传 `session`），无需改。

- [ ] **Step 4: 改 Pass-1 catalogue / skill_index 传 domain**

`skill_runner.py:553-557` 区域，把两处无参调用加上 `session.domain`：
```python
        skill_index = self.bundle.build_skill_index_block(session.domain)
        ...
        catalogue = self.bundle.list_all_names(session.domain)
```
> 这样 major 会话的 read_skill enum 与 Skill Index 只含 major phase + 共享 technique/example + major 域透镜，LLM 物理上选不到 mbti phase。

- [ ] **Step 5: 跑测试 + 回归**

Run: `cd server && pytest tests/test_major_domain.py -v && pytest tests/test_skill_loader.py tests/test_v24_smoke.py -v`
Expected: major 测试 PASS；现有两套测试全绿。

- [ ] **Step 6: Commit**

```bash
git add server/oriself_server/skill_runner.py server/tests/test_major_domain.py
git commit -m "feat(major): domain-aware phase key + Pass-1 catalogue scoping"
```

---

## Task 5: MajorConvergeOutput schema

**Files:**
- Modify: `server/oriself_server/schemas.py:70-86`（`ConvergeOutput` 下方加 `MajorConvergeOutput`）
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**

追加：
```python
from oriself_server.schemas import MajorConvergeOutput
import pytest
from pydantic import ValidationError


def test_major_converge_output_no_mbti_pattern():
    html = "<!doctype html><html><head><title>方向</title></head><body>" + ("x" * 1100) + "</body></html>"
    out = MajorConvergeOutput(direction_label="认知科学这一类", card_title="给爱追问的你", report_html=html)
    assert out.direction_label == "认知科学这一类"
    # 空 html 仍被拒（保留通用约束）
    with pytest.raises(ValidationError):
        MajorConvergeOutput(direction_label="x", report_html="")
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_major_converge_output_no_mbti_pattern -v`
Expected: FAIL（`MajorConvergeOutput` 不存在 → ImportError）

- [ ] **Step 3: 加 schema**

`schemas.py`，`ConvergeOutput` 类下方：
```python
class MajorConvergeOutput(BaseModel):
    """major 域报告输出：无四字母 MBTI，改用自由文本的方向标签。"""
    direction_label: str = Field(min_length=1, max_length=60)
    card_title: Optional[str] = Field(default=None, max_length=200)
    report_html: str = Field(
        min_length=1000,
        max_length=80000,
        description="完整自包含 HTML 页面字符串，<!DOCTYPE html> 到 </html>",
    )
```

- [ ] **Step 4: 跑测试**

Run: `cd server && pytest tests/test_major_domain.py::test_major_converge_output_no_mbti_pattern -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/oriself_server/schemas.py server/tests/test_major_domain.py
git commit -m "feat(major): MajorConvergeOutput schema (no 4-letter pattern)"
```

---

## Task 6: TestResult.result_label 列 + 一次性迁移

**Files:**
- Modify: `server/oriself_server/models.py:120-146`（`TestResult` 加列）
- Modify: `server/oriself_server/database.py`（`init_db` 内加一次性 ALTER）
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**

追加（用项目测试用 DB 重置入口；若名称不同，先 `Read server/oriself_server/database.py` 找 `reset_for_tests` / `init_db`）：
```python
from sqlalchemy import inspect as _sa_inspect
from oriself_server import database as _db


def test_test_results_has_result_label_column():
    _db.reset_for_tests()           # 建表 + 跑 init_db 迁移
    cols = {c["name"] for c in _sa_inspect(_db.engine).get_columns("test_results")}
    assert "result_label" in cols
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_test_results_has_result_label_column -v`
Expected: FAIL（列不存在）

- [ ] **Step 3: 加 ORM 列**

`models.py`，`TestResult` 里 `mbti_type` 列下方加：
```python
    result_label = Column(String(64), nullable=True)   # major 域的方向标签；mbti 域为 None
```

- [ ] **Step 4: 加一次性迁移（老库 in-place 加列）**

`database.py::init_db` 里、`create_all` 之后，仿已有 `DROP INDEX IF EXISTS` 范式加（SQLite ALTER ADD COLUMN 幂等保护）：
```python
    # 一次性迁移：老库 test_results 加 result_label（无 Alembic，create_all 不改老表）
    with engine.connect() as conn:
        cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(test_results)").fetchall()]
        if "result_label" not in cols:
            conn.exec_driver_sql("ALTER TABLE test_results ADD COLUMN result_label VARCHAR(64)")
            conn.commit()
```
> 若 `init_db` 用的是 `with engine.begin() as conn:` 风格，则去掉显式 `conn.commit()` 并复用该事务块的 conn。先 `Read database.py::init_db` 对齐连接风格再落笔。

- [ ] **Step 5: 跑测试 + 回归**

Run: `cd server && pytest tests/test_major_domain.py::test_test_results_has_result_label_column tests/test_v24_smoke.py -v`
Expected: PASS；smoke 不破。

- [ ] **Step 6: Commit**

```bash
git add server/oriself_server/models.py server/oriself_server/database.py server/tests/test_major_domain.py
git commit -m "feat(major): add TestResult.result_label column + one-shot migration"
```

---

## Task 7: ReportRunner.compose major 分支（跳四字母）

**Files:**
- Modify: `server/oriself_server/skill_runner.py:904-1003`（`ReportRunner.compose`）
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**（用本地 FakeBackend 返已知 major HTML，避开 MockBackend 内部细节）

追加：
```python
import asyncio
from oriself_server.skill_runner import ReportRunner

_MAJOR_HTML = (
    "<!doctype html><html><head><title>给爱追问的你</title>"
    "<meta name='oriself-direction' content='认知科学这一类'></head><body>"
    + ("这是一份专业方向报告。" * 80) + "</body></html>"
)


class _FakeBackend:
    async def complete_text(self, messages, timeout=None):
        return _MAJOR_HTML
    # 对话轮接口本测试用不到，留空占位
    async def stream_text(self, messages):
        if False:
            yield ""
    async def call_tools_only(self, messages, tools):
        raise NotImplementedError


def test_compose_major_skips_mbti_checks():
    bundle = load_skill_bundle(SKILL_ROOT)
    runner = ReportRunner(backend=_FakeBackend(), bundle=bundle)
    state = _mk_state("major")
    # compose 是 async
    result = asyncio.get_event_loop().run_until_complete(runner.compose(state))
    assert result.output is not None, result.error_reasons
    # major 输出是 MajorConvergeOutput，带 direction_label，不要求四字母
    assert getattr(result.output, "direction_label", None)
    assert "<html" in result.output.report_html
```
> 若 `compose` 内部还需 `state.conversations` 有内容才走完整路径，按 `skill_runner.py` 实际读取的字段在 `_mk_state` 里补几轮假对话（`Read skill_runner.py:846-1003` 看 `_build_converge_messages` 读了哪些字段）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_compose_major_skips_mbti_checks -v`
Expected: FAIL（compose 对所有域都跑 `resolve_mbti_or_fail`，major HTML 无四字母 → `result.output is None`）

- [ ] **Step 3: 在 compose 里按域分支**

`skill_runner.py:904-1003`，`compose` 的校验链里，通用 shape/parseable 之后、mbti 专属段之前，加 major 短路。把 `mbti_type/confidence/ConvergeOutput` 那段包进 `if session.domain != "major":`，并补 major 分支构造 `MajorConvergeOutput`：
```python
            # —— 通用安全（保留，两域都跑）——
            shape = verify_report_html_shape(html)
            if not shape.passed:
                last_reasons = shape.reasons; continue
            parseable = verify_report_html_parseable(html)
            if not parseable.passed:
                last_reasons = parseable.reasons; continue

            card_title = extract_card_title_from_html(html)

            if session.domain == "major":
                # major：跳过四字母 + confidence；用方向标签
                direction = _extract_major_direction(html) or (card_title or "未命名方向")
                try:
                    output = MajorConvergeOutput(
                        direction_label=direction,
                        card_title=card_title,
                        report_html=html,
                    )
                except Exception as exc:
                    last_reasons = [f"MajorConvergeOutput validate: {exc}"]; continue
                return ReportResult(output=output, retries=attempt, error_reasons=[], confidence_per_dim={})

            # —— 以下为 mbti 专属（原逻辑，原样保留）——
            mbti_type, mbti_result = resolve_mbti_or_fail(html)
            ...
```
在 `skill_runner.py` 顶部 import 区加 `from .schemas import MajorConvergeOutput`（与现有 `ConvergeOutput` import 同处），并加一个轻量抽取器（放 `ReportRunner` 上方模块级）：
```python
import re as _re_major

def _extract_major_direction(html: str) -> Optional[str]:
    """从 <meta name="oriself-direction" content="..."> 抽方向标签（major 用）。"""
    m = _re_major.search(
        r'<meta\s+name=["\']oriself-direction["\']\s+content=["\']([^"\']{1,60})["\']',
        html, _re_major.IGNORECASE,
    )
    return m.group(1).strip() if m else None
```

- [ ] **Step 4: 跑测试 + 回归**

Run: `cd server && pytest tests/test_major_domain.py::test_compose_major_skips_mbti_checks tests/test_v24_smoke.py -v`
Expected: major 测试 PASS；mbti smoke（含 compose mbti 路径）不破。

- [ ] **Step 5: Commit**

```bash
git add server/oriself_server/skill_runner.py server/tests/test_major_domain.py
git commit -m "feat(major): ReportRunner.compose major branch (skip 4-letter, emit direction_label)"
```

---

## Task 8: compose_result 落库 major 分支

**Files:**
- Modify: `server/oriself_server/routes/letters.py:71-73`（slug）、`:678-788`（`compose_result`）
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试**（直接测落库分支的纯逻辑：slug 前缀 + 占位 mbti_type + result_label）

追加一个针对 slug 生成 + 落库字段映射的单测。先抽一个纯函数便于测（见 Step 3）：
```python
from oriself_server.routes.letters import _major_result_fields


def test_major_result_fields_mapping():
    fields = _major_result_fields(direction_label="认知科学这一类", card_title="给爱追问的你")
    assert fields["mbti_type"] == "MAJOR"          # 占位，满足 NOT NULL String(8)
    assert fields["result_label"] == "认知科学这一类"
    assert fields["issue_title"] == "给爱追问的你"
    assert fields["slug_prefix"] == "major"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_domain.py::test_major_result_fields_mapping -v`
Expected: FAIL（`_major_result_fields` 不存在）

- [ ] **Step 3: 加纯函数 + 在 compose_result 里按域分支**

`routes/letters.py`，模块级加：
```python
def _major_result_fields(direction_label: str, card_title: Optional[str]) -> dict:
    """major 报告落库字段映射：mbti_type 写占位 'MAJOR'，真实方向进 result_label。"""
    return {
        "mbti_type": "MAJOR",
        "result_label": direction_label,
        "issue_title": card_title or direction_label,
        "slug_prefix": "major",
    }
```
`compose_result`（`letters.py:735-788`）里，按 `state.domain` 分支组装落库字段。major 分支：用 `result.output.direction_label` 走 `_major_result_fields`，`slug = f"{fields['slug_prefix']}-{secrets.token_hex(8)}"`，`TestResult(... mbti_type=fields["mbti_type"], result_label=fields["result_label"], issue_title=fields["issue_title"], ...)`，`ResultResponse(... mbti_type=fields["mbti_type"], card_title=fields["issue_title"], ...)`。mbti 分支保持原样（`result_label=None`）。
> 注：`TestResult(...)` 构造现在多传一个 `result_label=`；mbti 分支传 `result_label=None`。`ResultResponse` 字段不变（major 复用 `mbti_type` 字段返 `"MAJOR"`；前端 Plan 3 再决定要不要显式读 `result_label`）。

- [ ] **Step 4: 跑测试 + 回归**

Run: `cd server && pytest tests/test_major_domain.py tests/test_v24_smoke.py tests/test_skill_loader.py -v`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add server/oriself_server/routes/letters.py server/tests/test_major_domain.py
git commit -m "feat(major): compose_result persists major report (placeholder mbti_type + result_label)"
```

---

## Task 9: 端到端 smoke（mock provider 跑一封 major 信）

**Files:**
- Test: `server/tests/test_major_domain.py`

- [ ] **Step 1: 写 smoke 测试**（FastAPI TestClient 建 domain=major 信封 → 拿 state，确认 domain 真的落库且对话轮能跑；用 mock provider）

```python
from fastapi.testclient import TestClient
from oriself_server.main import create_app


def test_major_letter_e2e_smoke():
    app = create_app()
    client = TestClient(app)
    r = client.post("/letters", json={"provider": "mock", "domain": "major"})
    assert r.status_code == 200, r.text
    letter_id = r.json()["letter_id"]
    # state 能取且 domain 已落库（经 /state 或直接查 DB）
    s = client.get(f"/letters/{letter_id}/state")
    assert s.status_code == 200, s.text
```
> 若 mock provider 的对话轮脚本只覆盖 mbti，major 会话跑 turn 可能拿到 mbti 风格 mock 文本——本 smoke **只验管道连通**（建信封 + domain 落库 + state 可取），不验文案质量（那是 Plan 2 的 eval）。若 `create_app`/路由前缀与此不符，先 `Read server/oriself_server/main.py` 校对。

- [ ] **Step 2: 跑测试**

Run: `cd server && pytest tests/test_major_domain.py::test_major_letter_e2e_smoke -v`
Expected: PASS（若失败，按报错定位是 domain 落库还是路由前缀问题）

- [ ] **Step 3: 全量回归 + 覆盖率**

Run: `cd server && pytest --cov=oriself_server -v`
Expected: 全绿；major 管道全测通过；mbti 现有测试零回归。

- [ ] **Step 4: Commit**

```bash
git add server/tests/test_major_domain.py
git commit -m "test(major): end-to-end smoke for major letter via mock provider"
```

---

## Self-Review（写完计划后自查）

- **Spec coverage（对 §4.1 artifact 表）**：管道层全覆盖——loader CONVERGE-major（T2）/ catalogue 域过滤（T3）/ Pass-1 域感知 + choose_phase_key（T4）/ schema（T5）/ DB（T6）/ compose 分支（T7）/ 落库（T8）/ e2e（T9）。**未覆盖（属 Plan 2/3，不在本计划）**：真实 D1-D14 文案、每轮决策闸门、赝品 4 拍、命名诚实约束、2030 梯度、distress 拦截、12 条 eval（全 Plan 2）；首页 toggle / intake / 文案（Plan 3）。
- **Placeholder scan**：无 TBD；stub 文件是**有意的**最小可加载内容，已标注 Plan 2 填实，不算占位失败。
- **Type consistency**：`MajorConvergeOutput.direction_label`（T5）↔ compose 构造（T7）↔ `_major_result_fields(direction_label=...)`（T8）一致；`result_label` 列（T6）↔ 落库（T8）一致；major phase 名 `major-*`（T1）↔ `choose_phase_key` 的 `.replace("phase-","major-")`（T4）↔ catalogue 过滤（T3）一致。
- **已知需现场校对点（计划里已标注）**：`SessionState` 真实字段（T4/T7 fixture）、`database.init_db` 连接风格（T6）、`_build_converge_messages` 读取字段（T7）、`main.create_app` 路由前缀（T9）——这些都给了"先 Read 再落笔"的指引，不是占位。

---

## 后续计划（不在本文件）
- **Plan 2 · skill 文案**：把 D1-D14 写进 `domains/major.md` / 6 个 major phase / `CONVERGE-major.md`，替掉 stub；加每轮决策闸门、赝品 4 拍、命名诚实约束、2030 梯度、distress 拦截；建 P3 的 12 条 transcript eval（赝品降级 / 继续追证据 / 不主动恐吓 AI / 不编正式专业名 / 不过早收敛 五个二元项）。
- **Plan 3 · web**：首页 toggle → `domain=major`、近零 intake、入口文案。
