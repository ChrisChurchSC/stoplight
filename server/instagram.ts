/**
 * Read an Instagram Business/Creator account's recent media captions via the
 * Meta Graph API. Gated on INSTAGRAM_ACCESS_TOKEN; returns null when unset, so
 * onboarding skips Instagram until the client's account is connected.
 *
 * Dev/manual path: a single token from env. If INSTAGRAM_BUSINESS_ID is set it is
 * used directly; otherwise the linked IG Business account is discovered from the
 * token's Pages. The production path is per-client OAuth (Facebook Login with
 * instagram_basic + pages_show_list, the IG account linked to a Page the client
 * admins), token stored per client. See docs/social-oauth.md.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

export async function readInstagram(): Promise<{ text: string; count: number } | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!token) return null
  const t = encodeURIComponent(token)
  try {
    let igId = process.env.INSTAGRAM_BUSINESS_ID
    if (!igId) {
      const accRes = await fetch(`${GRAPH}/me/accounts?fields=instagram_business_account{id}&access_token=${t}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!accRes.ok) return null
      const acc = (await accRes.json()) as { data?: { instagram_business_account?: { id?: string } }[] }
      igId = acc.data?.find((p) => p.instagram_business_account?.id)?.instagram_business_account?.id
    }
    if (!igId) return null

    const mRes = await fetch(`${GRAPH}/${igId}/media?fields=caption,media_type,permalink,timestamp&limit=15&access_token=${t}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!mRes.ok) return null
    const media = (await mRes.json()) as { data?: { caption?: string }[] }
    const caps = (media.data ?? [])
      .map((d) => d.caption?.trim())
      .filter((x): x is string => !!x)
    return { text: caps.slice(0, 15).map((c) => `- ${c.slice(0, 300)}`).join('\n').slice(0, 6000), count: caps.length }
  } catch {
    return null
  }
}
