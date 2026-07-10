/**
 * Load a Google-font TTF subset covering exactly the glyphs in `text`,
 * for next/og ImageResponse (which cannot use next/font and rejects woff2).
 * Uses Google's China mirror (prod runs in CN where fonts.googleapis.com is blocked).
 * Returns null on any failure so OG routes can fall back gracefully.
 */
export async function loadNotoSerifSCSubset(
  text: string,
): Promise<ArrayBuffer | null> {
  return loadGoogleFontSubset("Noto+Serif+SC:wght@500", text);
}

/**
 * 通用版：按 css2 API 的 family 串（可带轴参数）取任意字体的 TTF 子集。
 * 根 og:image 用它取 Fraunces italic 出品牌字标；失败返回 null 让调用方降级。
 */
export async function loadGoogleFontSubset(
  family: string,
  text: string,
): Promise<ArrayBuffer | null> {
  const chars = Array.from(new Set(text)).join("");
  if (!chars) return null;
  const cssUrl =
    `https://fonts.googleapis.cn/css2?family=${family}` +
    `&text=${encodeURIComponent(chars)}`;
  try {
    // No modern-browser UA → Google serves `format('truetype')` (TTF), which satori accepts.
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/4.0" },
      signal: AbortSignal.timeout(4000),
    }).then((r) => (r.ok ? r.text() : ""));
    const m = css.match(
      /src:\s*url\((https:\/\/[^)]+)\)\s*format\('(?:truetype|opentype)'\)/,
    );
    if (!m) return null;
    const fontRes = await fetch(m[1], { signal: AbortSignal.timeout(4000) });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}
