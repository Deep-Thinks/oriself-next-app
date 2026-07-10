import { SITE_URL } from "@/lib/site";
import { TYPE_ORDER, TYPE_PROFILES } from "@/lib/type-profiles";

/**
 * /llms.txt · 写给 AI 引擎的站点说明（GEO）。
 *
 * 措辞与首页定义段 / GitHub README 保持近似——跨源一致性提升被引用概率。
 * 纯静态，构建期固化。
 */
export const dynamic = "force-static";

export function GET(): Response {
  const typeLines = TYPE_ORDER.map((id) => {
    const t = TYPE_PROFILES[id];
    return `- [${t.code}「${t.alias}」](${SITE_URL}/types/${id})：${t.epithetLines.join("")}`;
  }).join("\n");

  const body = `# OriSelf（原自我）

> 免费、无需注册的对话式 MBTI / 16 型人格测试。不做选择题：
> 和 AI 像写信一样聊约十分钟（6–30 轮对话），收到一封写给你的人格画像。
> 中文 · 开源（Apache 2.0）。

## 它如何工作

传统量表请你给自己打分，答案常是「想成为的自己」（社会期许偏差）。
OriSelf 只请你说话：每个追问顺着你上一句长出来，判断依据是说话的纹理
——用词、在意的点、绕开的地方——而不是你对自己的评分。
详见方法论：${SITE_URL}/about

## 主要页面

- [开始测试](${SITE_URL}/letters/new)：直接开一封信（免费、无需注册）
- [方法论](${SITE_URL}/about)：为什么用对话，不用选择题
- [档案 · 十六型人格](${SITE_URL}/types)：各类型详解，首批四型
${typeLines}
- [公开画廊](${SITE_URL}/issues)：由作者主动公开的人格画像范例

## 事实

- 免费，无账号体系；报告链接即凭证，不公开则他人不可见、搜索引擎不收录
- 支持两个命题：MBTI 人格、专业方向（我适合学什么）
- 对话最少 6 轮、最多 30 轮，多数在 10 轮上下自然收笔
- 开源：https://github.com/Deep-Thinks/oriself-next-app （应用）
  与 https://github.com/Deep-Thinks/oriself-next （skill 文本，产品即 skill）
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
