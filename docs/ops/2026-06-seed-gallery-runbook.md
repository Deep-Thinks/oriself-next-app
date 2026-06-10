# 运维 Runbook · D-1 存量转私有 + 作者自策展种子集（画廊冷启动）

> 状态：**待用户 sign-off 后择机手动执行**。本文件只描述步骤，**不随代码部署自动发生**。
> 关联：增长方案 `docs/superpowers/plans/2026-06-10-virality-retention-uplift.md` 的 **D-1** 决策点与 Batch 5.3。
> 红线（贯穿全程）：**只动作者本人 session 的行**；任何他人报告要公开，必须逐个取得明确同意。

---

## 0. 为什么要这一步

画廊（`/issues`）只列 `issue_is_public=1` 的报告。当前存量里可能残留早期默认公开（或测试）置 1 的行——既有隐私风险，也让画廊冷启动质量不可控。D-1 一次性把存量全部转私有，再由作者从**本人**报告里精挑 6–12 条优质种子重新公开，给搜索引擎和访客一个有质感的第一印象。

执行前请确认你理解三条访问语义（2026-05-17 既有决策，本方案不变）：

- **看 = slug 即凭证**：转私有**不影响**任何持 slug 者凭链接访问（元数据 + render 都照常 200）。`issue_is_public` 只控制画廊 / sitemap / robots 收录。
- **改公开状态 = 服务端 owner_token 鉴权**：`PATCH /issues/{slug}/publish` 的 `compare_digest(owner_token)` 是唯一的门。
- 转私有后，robots/画廊/sitemap 最长滞后 1h（ISR revalidate=3600，已接受）。

---

## 1. 前置（必须全部满足再继续）

1. 生产已部署**本套代码**并重启过——`init_db()` 的 in-place 迁移已跑，`test_results` 表上 **`issue_owner_token`** 与 **`issue_excerpt`** 两列都已存在。
   ```sql
   -- SQLite：确认两列存在
   PRAGMA table_info(test_results);
   -- 期望输出里能看到 issue_owner_token 与 issue_excerpt
   ```
2. 拿到生产 DB 的可写访问（生产为 SQLite，路径见 `ORISELF_DB_PATH`，默认 `oriself_v2.db`）。**操作前先备份**：
   ```bash
   cp "$ORISELF_DB_PATH" "$ORISELF_DB_PATH.bak.$(date +%Y%m%d-%H%M%S)"
   ```
3. 部署/重启流程按备忘 `deploy-scripts-broken-prod-reality` 走（生产手动 npm + ops 名 + `git submodule update`，**别用** `deploy.sh` / `ops deploy`）。

---

## 2. D-1 影响面确认（只读，先复述再动手）

```sql
SELECT count(*) AS public_rows FROM test_results WHERE issue_is_public = 1;
```

- 记录这个数字，**向用户复述**「当前有 N 行处于公开状态，即将全部转私有」，得到确认后再执行第 3 步。
- 顺带看一眼都是谁的（判断是否混入他人 session）：
  ```sql
  SELECT issue_slug, session_id, mbti_type, issue_is_public
  FROM test_results WHERE issue_is_public = 1
  ORDER BY issue_generated_at DESC;
  ```

---

## 3. D-1 转私有（事务内，可回滚）

```sql
BEGIN;
UPDATE test_results SET issue_is_public = 0;            -- 全部转私有
SELECT count(*) AS still_public FROM test_results WHERE issue_is_public = 1;  -- 必须为 0
-- 确认 still_public = 0 后再 COMMIT；若不为 0 或有疑虑：ROLLBACK;
COMMIT;
```

> 这步**只动 `issue_is_public`**，不碰 slug / html / owner_token / 访问——转私有的报告，作者与被分享者仍可凭链接照常看。

---

## 4. 作者自策展种子集（只挑本人 session 的优质报告）

目标：6–12 条，覆盖不同 MBTI 类型 + **至少 1 条 major**（专业方向）。

1. 先列出作者本人的候选报告，确认 `session_id` 清单（替换 `<作者 session 列表>` 为你自己核对过的 session_id）：
   ```sql
   SELECT issue_slug, session_id, mbti_type, result_label, issue_title
   FROM test_results
   WHERE session_id IN (<作者本人 session 列表>)
     AND issue_html IS NOT NULL
   ORDER BY issue_generated_at DESC;
   ```
2. 对每一条选中的种子，生成一个 publish 凭证并写库（`owner_token` 用 `python -c "import secrets; print(secrets.token_hex(16))"` 生成 32 hex；**WHERE 同时锁 slug 与本人 session_id**，双保险防误伤他人行）：
   ```sql
   UPDATE test_results
   SET issue_owner_token = '<token_hex(16) 生成值>'
   WHERE issue_slug = '<seed-slug>'
     AND session_id IN (<作者本人 session 列表>);
   ```
3. 用刚写入的 token 通过 API 公开（走鉴权路径，和正常用户公开同一条逻辑）：
   ```bash
   curl -X PATCH "https://next.oriself.com/api/issues/<seed-slug>/publish" \
     -H "Content-Type: application/json" \
     -d '{"is_public": true, "owner_token": "<同一个 token>"}'
   # 期望 200 + {"...","is_public":true,...}
   ```

> **红线再强调**：第 2 步的 `WHERE` 必须带 `session_id IN (<作者本人 session 列表>)`。**绝不**对他人 session 的行写 owner_token / 公开。若想公开某位用户的报告做展示，单独联系本人取得明确同意，并由对方/本人操作。

---

## 5. excerpt 存量回填（4.3 已落地；先 count、事务内、抽样核对）

新报告在 converge 时自动写 `issue_excerpt`；存量行该列为 NULL。用 `extract_excerpt` 批量回填（一次性脚本，不入应用代码）：

```bash
cd server
# 先 count 影响面
.venv/bin/python - <<'PY'
from oriself_server.database import session_scope
from oriself_server.models import TestResult as R
with session_scope() as db:
    n = db.query(R).filter(R.issue_html.isnot(None), R.issue_excerpt.is_(None)).count()
    print("待回填行数:", n)
PY
```

```bash
# 事务内回填（session_scope 自带提交/回滚）
.venv/bin/python - <<'PY'
from oriself_server.database import session_scope
from oriself_server.models import TestResult as R
from oriself_server.utils.excerpt import extract_excerpt
with session_scope() as db:
    rows = db.query(R).filter(R.issue_html.isnot(None), R.issue_excerpt.is_(None)).all()
    filled = 0
    for r in rows:
        ex = extract_excerpt(r.issue_html or "")
        if ex:
            r.issue_excerpt = ex
            filled += 1
    print(f"回填 {filled}/{len(rows)} 行")
    # session_scope 退出时提交；如要先看不提交，把上面包进 try 后 raise 触发回滚
PY
```

- 回填后**抽 3 条**人工核对 excerpt 是否是干净正文（无标签碎片、无 CSS/JS）：
  ```sql
  SELECT issue_slug, substr(issue_excerpt,1,60) FROM test_results
  WHERE issue_excerpt IS NOT NULL ORDER BY random() LIMIT 3;
  ```

---

## 6. 收尾与收录

1. 确认种子可见：
   ```bash
   curl -s "https://next.oriself.com/api/issues/public" | head -c 800   # 应列出种子 slug
   curl -sI "https://next.oriself.com/issues"                            # 200
   curl -s  "https://next.oriself.com/sitemap.xml" | grep -c "<url>"      # 种子进 sitemap（最迟 1h）
   ```
2. 浏览器打开 `https://next.oriself.com/issues` 目检画廊质感（标题 + 摘要行）。
3. 向 GSC / Bing Webmaster / 百度资源平台提交 `sitemap.xml`，并对 `/issues` 与每个种子 slug 手动 request indexing。

---

## 7. 登记

执行完成后，在根 `CLAUDE.md` 的「变更记录」补一行：日期、D-1 转私有行数、种子集条数（含 major 占比）、excerpt 回填行数。

---

## 附：回滚

- D-1 转私有写错：从第 1 步的 `.bak` 备份恢复，或对受影响 slug 反向 `UPDATE ... SET issue_is_public = 1`（仅限你确认本应公开的行）。
- 种子 token 写错：`UPDATE test_results SET issue_owner_token = NULL, issue_is_public = 0 WHERE issue_slug = '<slug>' AND session_id IN (<本人 session>);`
- excerpt 回填异常：该列可空，置回 NULL 无副作用：`UPDATE test_results SET issue_excerpt = NULL WHERE issue_slug = '<slug>';`
