/**
 * Load a Noto Serif SC TTF subset covering exactly the glyphs in `text`,
 * for next/og ImageResponse (which cannot use next/font and rejects woff2).
 * Uses Google's China mirror (prod runs in CN where fonts.googleapis.com is blocked).
 * Returns null on any failure so the OG route can fall back to a title-less brand card.
 */
export async function loadNotoSerifSCSubset(
  text: string,
): Promise<ArrayBuffer | null> {
  const chars = Array.from(new Set(text)).join("");
  if (!chars) return null;
  const cssUrl =
    `https://fonts.googleapis.cn/css2?family=Noto+Serif+SC:wght@500` +
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
