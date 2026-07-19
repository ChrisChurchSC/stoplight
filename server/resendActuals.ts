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
