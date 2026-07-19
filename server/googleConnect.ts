/**
 * In-app Google connect flow (per workspace). `googleAuthUrl` starts it (the "Connect" button links
 * here); `googleCallback` finishes it: exchange the code for a refresh token, discover the account's
 * GA4 properties / Search Console sites / YouTube channels, and store it all against the workspace
 * via the service-role connection store. Uses the WEB OAuth client (hosted redirect).
 */
import { saveConnection } from './connections.js'

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
export const GOOGLE_REDIRECT = 'https://stoplight-ochre.vercel.app/api/google-callback'
const SCOPES = ['analytics.readonly', 'webmasters.readonly', 'yt-analytics.readonly', 'youtube.readonly'].map(
  (s) => `https://www.googleapis.com/auth/${s}`,
)

export function googleConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET)
}

/** The Google consent URL for a workspace. `state` carries the workspace id back to the callback. */
export function googleAuthUrl(workspaceId: string): string {
  return (
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: workspaceId,
    }).toString()
  )
}

const domainOf = (url: string): string => {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/** What this Google account can read (for later per-brand mapping). Best-effort; each part degrades. */
async function discover(accessToken: string): Promise<Record<string, unknown>> {
  const H = { authorization: `Bearer ${accessToken}` }
  const config: Record<string, unknown> = {}
  try {
    const g = (await (await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: H })).json()) as {
      siteEntry?: { siteUrl: string; permissionLevel: string }[]
    }
    config.gsc_sites = (g.siteEntry ?? []).map((s) => ({ url: s.siteUrl, permission: s.permissionLevel }))
  } catch {
    /* skip */
  }
  try {
    const y = (await (
      await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', { headers: H })
    ).json()) as { items?: { id: string; snippet: { title: string }; statistics: { subscriberCount: string } }[] }
    config.yt_channels = (y.items ?? []).map((c) => ({ id: c.id, title: c.snippet.title, subs: c.statistics.subscriberCount }))
  } catch {
    /* skip */
  }
  try {
    const a = (await (
      await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { headers: H })
    ).json()) as { accountSummaries?: { propertySummaries?: { property: string; displayName: string }[] }[] }
    const base = (a.accountSummaries ?? []).flatMap((s) =>
      (s.propertySummaries ?? []).map((p) => ({ id: p.property.replace('properties/', ''), name: p.displayName })),
    )
    // Enrich each property with the website(s) its web data streams measure, so a brand can be matched
    // by DOMAIN (robust, like Search Console) instead of guessing on the display name. Best-effort and
    // parallel; caps at 100 properties to bound connect-time latency; any per-property failure -> [].
    config.ga4_properties = await Promise.all(
      base.slice(0, 100).map(async (p) => {
        try {
          const st = (await (
            await fetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${p.id}/dataStreams`, { headers: H })
          ).json()) as { dataStreams?: { webStreamData?: { defaultUri?: string } }[] }
          const domains = (st.dataStreams ?? [])
            .map((d) => d.webStreamData?.defaultUri)
            .filter((u): u is string => !!u)
            .map(domainOf)
            .filter(Boolean)
          return { ...p, domains }
        } catch {
          return { ...p, domains: [] as string[] }
        }
      }),
    )
  } catch {
    /* skip (Admin API may not be enabled) */
  }
  return config
}

/** Finish the connect: exchange code → refresh token → discover → store against the workspace. */
export async function googleCallback(code: string, workspaceId: string): Promise<boolean> {
  if (!googleConfigured() || !workspaceId) return false
  try {
    const tRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT,
        grant_type: 'authorization_code',
      }).toString(),
    })
    const t = (await tRes.json()) as { refresh_token?: string; access_token?: string }
    if (!t.refresh_token) return false
    const config = t.access_token ? await discover(t.access_token) : {}
    return saveConnection(workspaceId, 'google', { refresh_token: t.refresh_token }, config)
  } catch {
    return false
  }
}
