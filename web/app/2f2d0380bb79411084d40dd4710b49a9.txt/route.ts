/**
 * IndexNow 站点验证 key 文件（https://www.indexnow.org/）。
 *
 * Bing / 必应系（含 ChatGPT 检索所用的 Bing 索引）支持 IndexNow 即时推送收录，
 * 无需站长账号：部署后对 api.indexnow.org 发 POST 即可（见 docs/marketing/
 * seo-geo-plan-2026-07-10.md 的收录提交节）。key 即文件名与内容，改 key 需同步改两处。
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response("2f2d0380bb79411084d40dd4710b49a9", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
