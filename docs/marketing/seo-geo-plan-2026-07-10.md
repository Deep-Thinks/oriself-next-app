# OriSelf SEO × GEO 最大化方案

> 2026-07-10 · 基于对 next.oriself.com 线上实测 + web/ 源码走读。
> GEO = Generative Engine Optimization（让 ChatGPT / Perplexity / Kimi / 豆包 / 文心在回答"有什么好的 MBTI 测试"时引用并推荐本站）。

---

## 一、体检结论（全部实测取证）

### 已经做对的（底子不差）

| 项 | 现状 |
|---|---|
| SSR | 首页/画廊/issue 壳全是 Server Component，爬虫拿到完整 HTML |
| robots.txt | `app/robots.ts` 存在，`*` 全放行（含所有 AI 爬虫），/letters/、/api/ 已屏蔽 |
| sitemap.xml | `app/sitemap.ts` 存在，ISR 1h，公开 issue 会自动进 sitemap |
| 隐私模型 | 私有 issue noindex（capability URL），公开后才放开——设计正确，方案不动它 |
| 基础 meta | title / description / canonical / og:locale / lang=zh-CN 都在 |
| 性能 | 首页 HTML 仅 15.8KB，字体 preload，TTFB 0.19s——CWV 不构成瓶颈 |

### 核心病灶（按杀伤力排序）

1. **全站可收录内容 ≈ 400 字、2 个 URL**。sitemap 只有首页 + `/issues`；画廊自 D-1 转私有后是空的（正文 43 字："还没有公开的信"），种子集 runbook §4 至今未执行。**搜索引擎没有东西可收录，这是一切 SEO/GEO 的天花板**——其余优化都是在 400 字上做功。
2. **域名分裂**：`oriself.com` 根域挂着老版应用（title「AI对话式人格测试 | 原自我 OriSelf」），`next.oriself.com` 挂新版，双 200、无跳转、无 canonical 关系。权重对半稀释，且全网唯一一条外链（locdd 帖）指向的是**老站**。
3. **外部足迹≈0**：全网搜 "oriself" 只有一篇 locdd 论坛帖；品牌词被 Oris 手表完全淹没。没有第三方语料，GEO 无从谈起（AI 引擎引用一个站的前提是训练/检索语料里有人提过它）。
4. **关键词错位**：title「对话式人格画像」、h1「OriSelf」——真实搜索需求是「mbti测试 免费」「16型人格测试」「ai 人格测试」，全站正文只出现过一次 "MBTI"。「人格画像」是自造词，没有搜索量。
5. **首页无 og:image**：`twitter:card=summary_large_image` 却没给图 → 社交/微信转发首页无图（issue 页有竖版分享图，首页反而裸奔）。
6. **零结构化数据**：全站 0 个 JSON-LD。
7. **无 llms.txt**：404。
8. 小病：sitemap 的首页/画廊 `lastmod` 每次再生成都是 `new Date()`（假时间戳，Google 会学会不信任）；首页 `Cache-Control: no-store`（爬虫抓取无缓存红利）；无 apple-touch-icon。

### 关于百度

老站/新站均未见 ICP 备案信息，服务器 101.33.32.162（腾讯云）。无备案的站百度**能收录但慢且权重受限**，百度站长平台部分功能也要备案。→ 百度生态列为 P2 观察项，不做主战场；主战场是 Google + Bing（Bing 索引 = ChatGPT 检索源，GEO 关键渠道）。

---

## 二、目标关键词 / 需求面

| 层 | 词 | 承接页 |
|---|---|---|
| 头部（竞争激烈，先埋种子） | mbti测试 免费 / 16型人格测试 / 人格测试 | 首页 |
| **差异化（本站真正能赢的）** | ai人格测试 / 对话式mbti / 聊天测mbti / 不做选择题的mbti测试 | 首页 + 方法论页 |
| 长尾（流量大头） | infp特点 / intj适合的工作 / enfp和infp区别……×16 | 16 型人格页（P1 新建） |
| major 域 | 选专业测试 / 我适合学什么专业 / 高考选科 | 首页 major 区 + 未来专属页 |
| GEO 提问式 | "有没有不用做题的MBTI测试" / "AI 聊天测 MBTI 推荐" | llms.txt + FAQ + 第三方语料 |

---

## 三、方案红线（先立规矩）

1. **私有 issue 的 noindex / capability-URL 模型一个字不动**；只有用户主动公开的才进收录面。
2. **不牺牲 6/23 刚上线的首屏转化设计**：h1「OriSelf」是招牌级视觉，不改视觉——关键词进 `<title>`、description 和新增的 SSR 文本区（h2/页脚/新页面），不进 hero。
3. 涉及 skill 文本零改动（本方案纯 web/ + 运维 + 站外）。

---

## 四、施工方案

### P0 · 技术底座补齐（纯 web/ 改动，合计约 1 天，一次发版）

| # | 事项 | 落点 | 说明 |
|---|---|---|---|
| P0-1 | Title/描述关键词化 | `web/app/layout.tsx` | title 改为 `OriSelf · 用对话测 MBTI 的 AI 人格测试｜免费 · 无需注册`（≤30 汉字）；description 写成直接回答式："OriSelf 是一个对话式 MBTI / 16 型人格测试：不做选择题，和 AI 像写信一样聊 10 分钟，收到一封写给你的人格画像。免费、无需注册。" |
| P0-2 | 首页 og:image | 新建 `web/app/opengraph-image.tsx` | 复用 issue 页竖版分享图的 ImageResponse 管线，出一张 1200×630 横版刊头图；顺手补 twitter:image |
| P0-3 | JSON-LD | `web/app/page.tsx`（WebSite + WebApplication，offers.price=0、inLanguage=zh-CN）；`/issues` 加 CollectionPage；公开 issue 的 `generateMetadata` 旁加 Article（仅 is_public 时输出） | AI 引擎和 Google 共同消费；免费+无注册是 schema 里最值钱的两个事实 |
| P0-4 | llms.txt | 新建 `web/app/llms.txt/route.ts` | 内容见 §五；同时输出 `llms-full.txt`（含方法论全文） |
| P0-5 | sitemap 修真 | `web/app/sitemap.ts` | 首页/画廊去掉假 `lastmod`（或用部署时间常量）；issue 已用 generated_at，正确 |
| P0-6 | 首页转 ISR | `web/app/page.tsx` 加 `export const revalidate = 3600` | 首页无个性化 SSR 数据（最近信件是 localStorage 客户端渲染），转 ISR 安全，爬虫抓取成本降一个量级。**改前需确认页面确无 per-request 数据** |
| P0-7 | 搜索引擎登记 | 运维，非代码 | Google Search Console + **Bing Webmaster**（ChatGPT 检索走 Bing 索引，GEO 意义上比 Google 还急）双双提交 sitemap；百度站长先注册占位 |

### P1 · 内容面建设（SEO/GEO 主战场，核心杠杆，约 3–4 天 + 一项待批运维）

| # | 事项 | 落点 | 说明 |
|---|---|---|---|
| P1-1 | **执行种子画廊**（`docs/ops/2026-06-seed-gallery-runbook.md` §4，待 sign-off） | 运维 | 10–20 封带 excerpt 的公开信 → 画廊从 43 字空页变成真目录，sitemap 立即 +N 个 URL，每个都有 excerpt description + Article schema。**这是花半天撬动最大的一项** |
| P1-2 | **16 型人格页** `/types/[type]` ×16 | 新建 `web/app/types/[type]/page.tsx` + 内容文件 | 每页结构：首段直接定义该类型（可被 AI 整段引用）→「OriSelf 会怎么聊出这个类型」→ 复用 landing-hero 已有的范例卡文案 → 该类型公开信互链 → CTA「写一封自己的」。承接 "infp特点" 级长尾（全站最大搜索量所在）。内容生产建议：skill/LLM 起草 + 逐篇人工审（品味关是这个产品的命根子，见决策点 3） |
| P1-3 | 方法论/FAQ 页 `/about`（或 `/why-conversation`） | 新建页面 + FAQPage JSON-LD | 回答：为什么对话比选择题准（社会期许偏差、量表天花板）/ 6–30 轮怎么收敛 / 隐私模型（无账号、slug 即凭证、不公开就没人看得到）/ 免费与开源（Apache 2.0、skill 仓库）。这一页是 GEO 的**首要引用面**——AI 引擎最爱引用"解释原理的 Q&A" |
| P1-4 | 站内互链闭环 | 首页页脚 ↔ /types/* ↔ /issues ↔ /about | 每个公开 issue 页脚按 mbti_type 链回对应 /types 页（仅 is_public 时渲染，私有页不加） |

### P2 · 站外 + GEO 分发（持续经营，决定 GEO 上限）

| # | 事项 | 说明 |
|---|---|---|
| P2-1 | **两个 GitHub README 重写** | app 仓 + skill 仓的 README 是目前最容易建的高权重外链与 AI 语料源（GitHub 被所有 AI 引擎重度抓取/训练）。首段用一句可引用的定义句 + 截图 + 线上地址；补 About 栏 topics（mbti, personality-test, llm, nextjs, fastapi） |
| P2-2 | 首发潮 | 少数派 / 即刻 / V2EX / 小红书（MBTI 内容主阵地）各一篇；英文面走 Show HN（角度：open-source conversational MBTI, "product-as-skill"）+ Product Hunt。目标：3–5 条真实第三方语料 + 外链。locdd 已有一帖，可回帖更新新版地址 |
| P2-3 | awesome-list PR | awesome-mbti / awesome-llm-apps / awesome-chatgpt 类清单——AI 检索与训练的高频语料源，一条 PR 长期有效 |
| P2-4 | GEO 引用监测 | 每月固定 10 问（"推荐一个不做题的MBTI测试"等）分别问 ChatGPT/Perplexity/Kimi/豆包/文心，记录是否提及 OriSelf；同时 grep nginx 日志统计 GPTBot / ClaudeBot / PerplexityBot / Bytespider 抓取量作为先行指标 |
| P2-5 | 百度（观察项） | 无备案则不重投入；只做站长平台提交 + 保持可抓。若未来备案，再上主动推送 API |

---

## 五、GEO 专项要点（贯穿上面各项的原则）

1. **GEO ≈ SEO 的超集**：可爬、SSR、结构化这些两者共用；增量在于——
2. **每个页面首段 = 一句可独立引用的直接回答**。AI 引擎按段落抽取，"OriSelf 是一个免费、无需注册的对话式 MBTI 测试：不做选择题，通过 6–30 轮 AI 对话生成人格画像" 这种句子要在首页、about、llms.txt、GitHub README 里以近似措辞反复出现（跨源一致性提升被引用概率）。
3. **事实句 > 形容词**："免费 / 无需注册 / 10 分钟 / 16 型 / 开源 Apache 2.0 / 中文" 是 AI 会转述的内容；"温柔、有品味"不是。
4. **Bing 是 GEO 的隐藏主线**：ChatGPT 检索用 Bing 索引，Bing Webmaster 提交的优先级不低于 GSC。
5. **第三方语料是权重来源**：AI 推荐工具时极度依赖"别人怎么说"（论坛、清单、README）。P2 的每一条外部提及对 GEO 的边际价值高于站内再多一页。
6. AI 爬虫已全放行（robots `*` allow），无需额外开门；注意 Bytespider（豆包）抓取凶猛，若日志里量异常再单独限速。
7. llms.txt 骨架：

```
# OriSelf（原自我）
> 免费、无需注册的对话式 MBTI / 16 型人格测试。不做选择题：
> 和 AI 像写信一样聊约 10 分钟（6–30 轮），收到一封写给你的人格画像。
> 中文 · 开源（Apache 2.0）。

## 主要页面
- [开始测试](https://next.oriself.com/letters/new)
- [公开画廊](https://next.oriself.com/issues)：用户主动公开的画像范例
- [方法论](https://next.oriself.com/about)：为什么对话比选择题准
- [16 型人格](https://next.oriself.com/types/infp)：各类型详解（16 页）

## 事实
- 免费，无账号体系；报告链接即凭证，不公开则他人不可见
- 支持 MBTI 人格与专业方向两个命题
- 源码：github.com/…（app 与 skill 两仓）
```

---

## 六、需要你拍板的 3 个决策点

1. **域名归一（结构性最大杠杆）**。三选一：
   - **A（推荐，最终态）**：新版迁 `oriself.com` 根域，`next.` 301 过去。根域权重不再稀释，品牌词干净；成本是一次域名迁移（nginx + `web/lib/site.ts` SITE_URL + OG/分享链接全链路回归）。
   - **B（快速止血）**：老站若已弃维护，`oriself.com` 301 → `next.oriself.com`，保住唯一外链与既有收录。
   - C（最弱）：双站并存 + 互相 canonical 声明，仅在老站还要独立运营时选。
   *若老站仍有活跃用户，先 B 缓不了，需告诉我老站的定位。*
2. **种子画廊 sign-off**（P1-1，runbook 已备好一个月）：批不批、种子内容用什么口径。
3. **16 型内容页的生产方式与节奏**：LLM 起草+人审（快，但要你审品味）vs 纯手写（慢）；以及是否第一期就做满 16 页还是先做 4 个大类型（INFP/INFJ/INTJ/ENFP 搜索量最高）试水。

## 七、验收指标

| 时间 | 指标 |
|---|---|
| 2 周 | GSC+Bing 收录数 ≥ 20 URL（种子画廊+新页面）；首页 og:image 微信/Twitter 转发出图 |
| 1 月 | "对话式mbti" "ai mbti测试" 进 Google 前 3 页；AI 爬虫日志有稳定抓取 |
| 3 月 | 任一 /types 页有自然流量进信漏斗；每月 GEO 抽查 10 问中 ≥1 个引擎提及 OriSelf |

---

*取证明细：首页 HTML 快照与解析脚本见会话 scratchpad；关键数字——首页可见文本 365 字、h1×1/h2×0、JSON-LD×0、llms.txt 404、sitemap 2 URL、画廊正文 43 字、根域与 next 子域双 200 无关联。*
