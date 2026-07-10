/**
 * JSON-LD 结构化数据注入。
 *
 * `<` 转义成 <：防止数据里出现 "</script>" 提前闭合标签（XSS 边界，
 * 与 utils/html_sanitize 同一思路）。数据本身由各页面拼装，这里只负责安全落地。
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
