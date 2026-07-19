/**
 * Resolve a brand's Google sources from the workspace's STORED connection (per-workspace token +
 * auto-matched property/site/channel). This is what makes a *connected* workspace's data flow into
 * ITS panels: the brand's website domain picks its Search Console site, and the brand name picks its
 * GA4 property + YouTube channel out of what the connected account can see. Null when the workspace
 * has no stored google connection, so the caller falls back to the env maps.
 */
import { getConnection } from './connections.js'
import type { GoogleOverride } from './ga4Actuals.js'

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''

async function accessTokenFromRefresh(refresh: string): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { access_token?: string }
    return j.access_token ?? null
  } catch {
    return null
  }
}

const domainOf = (url: string): string => {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}
const norm = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

interface GoogleConfig {
  gsc_sites?: { url: string; permission?: string }[]
  yt_channels?: { id: string; title: string }[]
  ga4_properties?: { id: string; name: string; domains?: string[] }[]
}

/** Resolve a brand's Google override from the workspace's stored connection. Null if none stored. */
export async function resolveGoogle(workspaceId: string, brand: string, website?: string): Promise<GoogleOverride | null> {
  const conn = await getConnection(workspaceId, 'google')
  const refresh = (conn?.credentials as { refresh_token?: string } | undefined)?.refresh_token
  if (!refresh) return null
  const token = await accessTokenFromRefresh(refresh)
  if (!token) return null
  const cfg = (conn?.config ?? {}) as GoogleConfig
  const dom = website ? domainOf(website) : ''
  const bn = norm(brand)
  const nameMatches = (n: string): boolean => {
    const x = norm(n)
    return !!x && !!bn && (x.includes(bn) || bn.includes(x))
  }
  const domainMatches = (d: string): boolean => !!d && !!dom && (d === dom || d.includes(dom) || dom.includes(d))
  // GA4: prefer a property whose web stream domain matches the brand's site (robust); fall back to a
  // display-name match only when no domain lines up (older connections stored before domain enrichment).
  const ga4 =
    (dom ? (cfg.ga4_properties ?? []).find((p) => (p.domains ?? []).some(domainMatches))?.id : undefined) ??
    (cfg.ga4_properties ?? []).find((p) => nameMatches(p.name))?.id
  return {
    token,
    gsc: dom ? (cfg.gsc_sites ?? []).map((s) => s.url).find((u) => u.toLowerCase().includes(dom)) : undefined,
    ga4,
    yt: (cfg.yt_channels ?? []).find((c) => nameMatches(c.title))?.id,
  }
}
