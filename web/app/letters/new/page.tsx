import { redirect } from 'next/navigation';
import { createLetter } from '@/lib/api';

/**
 * /letters/new · creates a letter on the server, then redirects to /letters/:id.
 *
 * This is a Server Component — the create call happens on the server, so no
 * API URL leaks to the client and the redirect is zero-flash.
 */
export const dynamic = 'force-dynamic';

export default async function NewLetterPage(
  { searchParams }: { searchParams: Promise<{ domain?: string; from?: string }> }
) {
  const { domain, from } = await searchParams;
  const safeDomain = domain === 'major' ? 'major' : 'mbti'; // 白名单兜底
  try {
    const letter = await createLetter(undefined, safeDomain);
    // ?from= 来源透传 · slug 白名单防注入 / 超长值；不合规直接丢弃
    const qs =
      from && /^[a-z0-9-]{1,64}$/i.test(from)
        ? `?from=${encodeURIComponent(from)}`
        : '';
    redirect(`/letters/${letter.letter_id}${qs}`);
  } catch (err) {
    // If backend is unreachable, fall back to landing with an error state
    // Actual redirect keeps working via throw.
    if (err instanceof Error && err.message.startsWith('NEXT_REDIRECT')) throw err;
    throw err;
  }
}
