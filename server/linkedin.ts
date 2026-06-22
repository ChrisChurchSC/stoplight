/**
 * Read an organization's recent LinkedIn posts via the Community Management
 * Posts API. The post text lives in `commentary`. Gated on LINKEDIN_ACCESS_TOKEN
 * + LINKEDIN_ORG_ID; returns null when unset, so onboarding skips LinkedIn until
 * the client's page is connected.
 *
 * This is the dev/manual path: a single token + org from env. The production path
 * is per-client OAuth (the page admin authorizes r_organization_social), with the
 * token stored per client. See docs/social-oauth.md. Endpoint shape confirmed
 * against learn.microsoft.com Posts API; LinkedIn-Version rotates (YYYYMM), so it
 * is env-configurable and must be set to a currently-supported version.
 */

export async function readLinkedIn(): Promise<{ text: string; count: number } | null> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN
  const org = process.env.LINKEDIN_ORG_ID
  if (!token || !org) return null
  const version = process.env.LINKEDIN_VERSION || '202606'
  const urn = org.startsWith('urn:') ? org : `urn:li:organization:${org}`
  try {
    const res = await fetch(
      `https://api.linkedin.com/rest/posts?author=${encodeURIComponent(urn)}&q=author&count=15&sortBy=LAST_MODIFIED`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'X-RestLi-Method': 'FINDER',
          'LinkedIn-Version': version,
        },
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { elements?: { commentary?: string }[] }
    const posts = (data.elements ?? [])
      .map((e) => e.commentary?.trim())
      .filter((x): x is string => !!x)
    return { text: posts.slice(0, 15).map((p) => `- ${p.slice(0, 300)}`).join('\n').slice(0, 6000), count: posts.length }
  } catch {
    return null
  }
}
