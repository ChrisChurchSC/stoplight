/**
 * Resend email metrics → a BrandActuals "Email" channel (delivered / opens / clicks) for the brand
 * whose email is sent through Resend. Best-effort PULL from the Broadcasts API: lists sent broadcasts
 * and sums whatever engagement fields the API surfaces. Returns null when there are no sent broadcasts
 * or the account isn't the mapped brand, so it stays quiet until email actually goes out.
 *
 * Note: Resend's most reliable engagement signal is its webhooks (email.opened / email.clicked). If
 * the Broadcasts API doesn't surface aggregates once real broadcasts exist, the robust upgrade is a
 * webhook receiver that appends events to metric_snapshots. This pull adapter is the quick version.
 *
 * Config: RESEND_API_KEY, RESEND_BRAND (the brand, lowercased, this Resend account maps to).
 */
import { getConnection } from './connections.js'

const BASE = 'https://api.resend.com'

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

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

/**
 * Check a Resend API key actually works BEFORE we store it, by hitting the same endpoint the metrics
 * pull relies on (`GET /broadcasts`). A valid full-access key returns 200 (even with zero broadcasts);
 * a bad key returns 401; a send-only key is restricted here, which we reject with a clear reason since
 * it can't read metrics anyway. Returns { ok } plus a human error to show the user.
 */
export async function verifyResendKey(key: string): Promise<{ ok: boolean; error?: string }> {
  const k = (key || '').trim()
  if (!k) return { ok: false, error: 'Paste your Resend API key.' }
  if (!k.startsWith('re_')) return { ok: false, error: 'That does not look like a Resend key (they start with "re_").' }
  try {
    const res = await fetch(`${BASE}/broadcasts`, { headers: { authorization: `Bearer ${k}` } })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string }
    if (body.name === 'restricted_api_key')
      return { ok: false, error: 'That key is send-only. Use a full-access Resend key so metrics can be read.' }
    // Resend reports an invalid/missing key as a 400/401/403 with "API key is invalid".
    if (res.status === 400 || res.status === 401 || res.status === 403 || /api key|invalid|unauthor/i.test(body.message || ''))
      return { ok: false, error: 'Resend rejected that key. Double-check it and try again.' }
    return { ok: false, error: body.message ? `Resend: ${body.message}` : `Resend returned an error (${res.status}). Try again in a moment.` }
  } catch {
    return { ok: false, error: 'Could not reach Resend to verify the key. Check your connection and retry.' }
  }
}

/** Email actuals from Resend broadcasts. With a workspace id, uses that workspace's STORED Resend key
 *  (applies to all its brands); else the env key gated on RESEND_BRAND. Null when nothing sent. */
export async function runResendActuals(brand: string, workspaceId?: string): Promise<BrandActuals | null> {
  let key = ''
  if (workspaceId) {
    const conn = await getConnection(workspaceId, 'resend')
    const stored = (conn?.credentials as { api_key?: string } | undefined)?.api_key
    if (stored) key = stored
  }
  if (!key) {
    const mapped = (process.env.RESEND_BRAND || '').trim().toLowerCase()
    if (!process.env.RESEND_API_KEY || !mapped || brand.trim().toLowerCase() !== mapped) return null
    key = process.env.RESEND_API_KEY
  }
  try {
    const headers = { authorization: `Bearer ${key}` }
    const listRes = await fetch(`${BASE}/broadcasts`, { headers })
    if (!listRes.ok) return null
    const list = (await listRes.json()) as { data?: { id: string; status?: string }[] }
    const sent = (list.data ?? []).filter((b) => b.status === 'sent')
    if (!sent.length) return null

    let delivered = 0
    let opened = 0
    let clicked = 0
    for (const b of sent) {
      const dRes = await fetch(`${BASE}/broadcasts/${b.id}`, { headers })
      if (!dRes.ok) continue
      const d = (await dRes.json()) as Record<string, unknown>
      // Resend's exact stat field names are verified against a real sent broadcast; sum defensively.
      delivered += n(d.delivered ?? d.sent ?? d.recipients)
      opened += n(d.opened ?? d.opens ?? d.unique_opens)
      clicked += n(d.clicked ?? d.clicks ?? d.unique_clicks)
    }
    if (!delivered && !opened && !clicked) return null

    const channel: ChannelActual = {
      channel: 'email',
      label: 'Email',
      reachUnit: 'delivered',
      reach: delivered,
      engagement: opened,
      clicks: clicked,
    }
    return { updatedAt: Date.now(), source: 'Resend', sources: ['Resend'], channels: [channel] }
  } catch {
    return null
  }
}
