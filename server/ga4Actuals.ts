/**
 * Free, brand-agnostic metrics: one Google service account reads real actuals for ANY brand from
 * Google Analytics 4 (website) and Search Console (organic search). No paid aggregator, no per-brand
 * OAuth, no code change to add a brand — you grant the ONE service-account email read access on each
 * brand's GA4 property + GSC site, then add an id to the config map. Server-side only; the key never ships.
 *
 * The scaling model: ONE credential, N brands. `runGoogleActuals(brand)` looks the brand up in the
 * maps below and returns null for anything unmapped, so it's inert per brand until you opt that brand
 * in. Nothing here is specific to any single brand.
 *
 * Auth is EITHER of two ways (OAuth preferred; it's keyless, so it works even where org policy
 * disables service-account key creation):
 *   - GA4_REFRESH_TOKEN + GA4_OAUTH_CLIENT_ID + GA4_OAUTH_CLIENT_SECRET  — keyless OAuth (recommended)
 *   - GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY  — service-account key (\n-escaped PEM), the fallback
 *
 * Config via env (all optional; each source activates only when its map has the brand):
 *   - GA4_PROPERTIES    — JSON map brand(lower) → GA4 numeric property id, e.g. { "world within": "498798286" }
 *   - GSC_SITES         — JSON map brand(lower) → Search Console site, e.g. { "world within": "sc-domain:worldwithin.org" }
 *   - YT_CHANNELS       — JSON map brand(lower) → YouTube channel id, e.g. { "world within": "UC..." } (token needs the yt-analytics scope + the account must manage that channel)
 *   - GA4_SINCE_DAYS    — lookback window, default 90
 */
import crypto from 'node:crypto'

interface ChannelActual {
  channel: string
  label: string
  reachUnit: string
  reach: number
  engagement?: number
  clicks?: number
  conversions?: number
  revenue?: number
}
interface BrandActuals {
  updatedAt: number
  source: string
  sources?: string[]
  channels: ChannelActual[]
}

const SINCE_DAYS = Number(process.env.GA4_SINCE_DAYS) || 90
const SCOPES = 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly'
const b64url = (s: string): string => Buffer.from(s).toString('base64url')

function mapFor(envName: string, brand: string): string | null {
  try {
    const map = JSON.parse(process.env[envName] || '{}') as Record<string, string>
    return map[brand.trim().toLowerCase()] ?? null
  } catch {
    return null
  }
}

/** Exchange a stored OAuth refresh token for an access token. Null when OAuth env isn't set.
 * This is the KEYLESS path — works even where org policy disables service-account key creation. */
async function oauthAccessToken(): Promise<string | null> {
  const refresh = process.env.GA4_REFRESH_TOKEN
  const clientId = process.env.GA4_OAUTH_CLIENT_ID
  const clientSecret = process.env.GA4_OAUTH_CLIENT_SECRET
  if (!refresh || !clientId || !clientSecret) return null
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { access_token?: string }
    return j.access_token ?? null
  } catch {
    return null
  }
}

/** Mint a short-lived read-only access token (GA4 + Search Console scopes). Prefers the keyless OAuth
 * refresh token; falls back to a service-account JWT when that's configured instead. */
async function accessToken(): Promise<string | null> {
  const oauth = await oauthAccessToken()
  if (oauth) return oauth
  const email = process.env.GA4_CLIENT_EMAIL
  const key = (process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!email || !key) return null
  try {
    const now = Math.floor(Date.now() / 1000)
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claim = b64url(
      JSON.stringify({ iss: email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
    )
    const signingInput = `${header}.${claim}`
    const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${signingInput}.${sig}`,
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { access_token?: string }
    return j.access_token ?? null
  } catch {
    return null
  }
}

const num = (v: unknown): number => Number(v) || 0
const isoDaysAgo = (days: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** GA4 website actuals by default channel grouping. Null when the brand isn't mapped / no data. */
async function ga4Channels(brand: string, token: string): Promise<ChannelActual[]> {
  const property = (mapFor('GA4_PROPERTIES', brand) || '').replace(/^properties\//, '')
  if (!property) return []
  try {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${SINCE_DAYS}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'conversions' }, { name: 'totalRevenue' }],
        limit: 250,
      }),
    })
    if (!res.ok) return []
    const j = (await res.json()) as {
      rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]
    }
    return (Array.isArray(j.rows) ? j.rows : [])
      .map((r): ChannelActual => {
        const group = r.dimensionValues?.[0]?.value || 'Unassigned'
        const m = r.metricValues
        return {
          channel: group.toLowerCase(),
          label: group,
          reachUnit: 'sessions',
          reach: num(m?.[0]?.value),
          engagement: num(m?.[1]?.value),
          conversions: num(m?.[2]?.value),
          revenue: num(m?.[3]?.value),
        }
      })
      .filter((c) => c.reach > 0)
  } catch {
    return []
  }
}

/** Search Console organic-search totals (clicks + impressions). Empty when the brand isn't mapped. */
async function gscChannel(brand: string, token: string): Promise<ChannelActual[]> {
  const site = mapFor('GSC_SITES', brand)
  if (!site) return []
  try {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: isoDaysAgo(SINCE_DAYS), endDate: isoDaysAgo(0), dimensions: [], rowLimit: 1 }),
      },
    )
    if (!res.ok) return []
    const j = (await res.json()) as { rows?: { clicks?: number; impressions?: number }[] }
    const row = j.rows?.[0]
    if (!row || !num(row.impressions)) return []
    return [
      { channel: 'search', label: 'Google Search', reachUnit: 'impressions', reach: num(row.impressions), clicks: num(row.clicks) },
    ]
  } catch {
    return []
  }
}

/** YouTube channel analytics (views, watch, subs, engagement). Empty when the brand isn't mapped. */
async function ytChannel(brand: string, token: string): Promise<ChannelActual[]> {
  const channelId = mapFor('YT_CHANNELS', brand)
  if (!channelId) return []
  try {
    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${encodeURIComponent(channelId)}` +
        `&startDate=${isoDaysAgo(SINCE_DAYS)}&endDate=${isoDaysAgo(0)}` +
        `&metrics=views,estimatedMinutesWatched,subscribersGained,likes,comments`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return []
    const j = (await res.json()) as { columnHeaders?: { name: string }[]; rows?: number[][] }
    const cols = (j.columnHeaders ?? []).map((h) => h.name)
    const row = (j.rows ?? [])[0] ?? []
    const val = (name: string): number => {
      const i = cols.indexOf(name)
      return i >= 0 ? num(row[i]) : 0
    }
    const views = val('views')
    if (!views) return []
    return [
      {
        channel: 'youtube',
        label: 'YouTube',
        reachUnit: 'views',
        reach: views,
        engagement: val('likes') + val('comments'),
        conversions: val('subscribersGained'),
      },
    ]
  } catch {
    return []
  }
}

/** Real Google actuals (GA4 + Search Console + YouTube) for any mapped brand. Null when no data. */
export async function runGoogleActuals(brand: string): Promise<BrandActuals | null> {
  if (!mapFor('GA4_PROPERTIES', brand) && !mapFor('GSC_SITES', brand) && !mapFor('YT_CHANNELS', brand)) return null
  const token = await accessToken()
  if (!token) return null
  const [ga4, gsc, yt] = await Promise.all([ga4Channels(brand, token), gscChannel(brand, token), ytChannel(brand, token)])
  const channels = [...ga4, ...gsc, ...yt]
  if (!channels.length) return null
  const sources = [
    ...(ga4.length ? ['GA4'] : []),
    ...(gsc.length ? ['Search Console'] : []),
    ...(yt.length ? ['YouTube'] : []),
  ]
  return { updatedAt: Date.now(), source: 'Google', sources, channels }
}
