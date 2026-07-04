import { NoKeyError } from './siteMapHandler'

/**
 * Ingest a brand's PUBLISHED ASSETS from Neon (NeonCRM) into the Library:
 * fundraising campaign pages and event pages the brand has out in the world.
 * Read-only (list endpoints only). Runs server-side so the Neon key stays private
 * (NEON_API_KEY / NEON_ORG_ID in .env). No Claude in the loop: NeonCRM returns
 * structured records, so we map them straight into importable content items.
 *
 * Throws NO_KEY (501) when the Neon credentials aren't set, so the Library skips
 * the Neon source cleanly. Throws NEON_ERROR when Neon rejects the key or a call
 * fails. NeonCRM API v2 authenticates with HTTP Basic: username = org id,
 * password = API key. NEON_BASE overrides the base URL for a non-NeonCRM product.
 */

class NeonError extends Error {
  code = 'NEON_ERROR'
}

/** One asset shaped for normalizeImportItem (importAssets maps these to rows). */
export interface NeonAsset {
  platform: string
  title: string
  copy?: string
  url?: string
  date?: string
}
export interface NeonIngestResult {
  items: NeonAsset[]
  campaignsRead: number
  eventsRead: number
}

/** Strip HTML/entities down to readable copy (event descriptions come as HTML). */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
/** First non-empty string among a record's candidate keys. */
const pick = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const s = str(o[k])
    if (s) return s
  }
  return ''
}

/** Pull the list out of a Neon response, which is sometimes a bare array and
 *  sometimes wrapped ({ campaigns: [...] } / { events: [...] }). */
function listOf(json: unknown, key: string): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[]
  const wrapped = (json as Record<string, unknown> | null)?.[key]
  return Array.isArray(wrapped) ? (wrapped as Record<string, unknown>[]) : []
}

async function neonGet(base: string, path: string, auth: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new NeonError('Could not reach Neon.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new NeonError('Neon rejected the credentials. Check the org id and API key (NeonCRM API v2, Basic auth).')
  }
  const text = await res.text()
  if (!res.ok) {
    // A 404 or an HTML body usually means the org is on a different Neon product.
    const looksHtml = text.trimStart().startsWith('<')
    throw new NeonError(
      looksHtml
        ? `Neon returned a non-API response (${res.status}). This org may not be on NeonCRM — set NEON_BASE to the right product API.`
        : `Neon request failed (${res.status}).`,
    )
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new NeonError('Neon returned an unreadable response.')
  }
}

/** Fundraising campaigns → landing-page assets. */
async function fetchCampaigns(base: string, auth: string): Promise<NeonAsset[]> {
  const json = await neonGet(base, '/campaigns?currentPage=0&pageSize=200', auth)
  const list = listOf(json, 'campaigns')
  const out: NeonAsset[] = []
  for (const c of list) {
    const title = pick(c, 'name', 'campaignName')
    if (!title) continue
    // Only surface real, enabled campaigns (skip archived/disabled where flagged).
    if (c.enabled === false || c.status === 'DISABLED') continue
    const goal = Number(c.campaignGoal ?? c.goal ?? 0)
    out.push({
      platform: 'landing-page',
      title,
      copy: goal > 0 ? `Fundraising campaign. Goal $${goal.toLocaleString()}.` : 'Fundraising campaign.',
      date: pick(c, 'startDate', 'campaignStartDate') || undefined,
    })
  }
  return out
}

/** Events → event-page assets, with a public registration URL where Neon gives one. */
async function fetchEvents(base: string, auth: string): Promise<NeonAsset[]> {
  const json = await neonGet(base, '/events?currentPage=0&pageSize=200', auth)
  const list = listOf(json, 'events')
  const out: NeonAsset[] = []
  for (const e of list) {
    const title = pick(e, 'name', 'eventName')
    if (!title) continue
    const desc = pick(e, 'eventDescription', 'description', 'summary')
    const dates = (e.eventDates ?? {}) as Record<string, unknown>
    const date = pick(e, 'startDate') || pick(dates, 'startDate', 'eventStartDate') || undefined
    const reg = (e.registrationInfo ?? {}) as Record<string, unknown>
    const url = pick(e, 'eventUrl', 'registrationUrl', 'webRegisterUrl') || pick(reg, 'registrationUrl') || undefined
    out.push({
      platform: 'events',
      title,
      copy: desc ? stripHtml(desc).slice(0, 500) : 'Event page.',
      url,
      date,
    })
  }
  return out
}

type Progress = (e: { stage: string; detail: string }) => void

export async function runNeonIngest(_body: unknown, onProgress?: Progress): Promise<NeonIngestResult> {
  const org = (process.env.NEON_ORG_ID ?? '').trim()
  const key = (process.env.NEON_API_KEY ?? '').trim()
  if (!org || !key) throw new NoKeyError('NEON_ORG_ID / NEON_API_KEY not set')
  const base = ((process.env.NEON_BASE ?? '').trim() || 'https://api.neoncrm.com/v2').replace(/\/$/, '')
  const auth = 'Basic ' + Buffer.from(`${org}:${key}`).toString('base64')

  onProgress?.({ stage: 'campaigns', detail: 'Reading Neon fundraising campaigns' })
  const campaigns = await fetchCampaigns(base, auth)
  onProgress?.({ stage: 'campaigns', detail: `Read ${campaigns.length} campaigns` })

  let events: NeonAsset[] = []
  try {
    onProgress?.({ stage: 'events', detail: 'Reading Neon events' })
    events = await fetchEvents(base, auth)
    onProgress?.({ stage: 'events', detail: `Read ${events.length} events` })
  } catch (err) {
    // Events are optional (not every Neon account has the module) — don't fail the pull.
    onProgress?.({ stage: 'events', detail: `Events skipped (${(err as Error).message})` })
  }

  const items = [...campaigns, ...events]
  onProgress?.({ stage: 'mapped', detail: `Mapped ${items.length} Neon assets` })
  return { items, campaignsRead: campaigns.length, eventsRead: events.length }
}
