import type { Role } from '../domain/access'
import { clientForCampaign } from '../domain/clients'
import { decodeShareToken } from './shareLink'
import { getActiveWorkspaceId } from './session'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Read-only share snapshots. A ?share= link carries a self-contained grant (client + role + id).
 * So a recipient can VIEW a brand with no account, the owner publishes a point-in-time snapshot of
 * ONLY that brand's data to a public table, keyed by the grant id (see supabase/migrations/
 * 0002_share_snapshots.sql). The snapshot is localStorage-shaped: on the recipient we seed those
 * keys before the store loads (main.tsx), and the ?share= token pins the shared client + role.
 *
 * Scoping is deliberately per-brand so a semi-public link never leaks the owner's other clients.
 */

const read = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Object keyed by brand/client name → keep only this client's entry. */
const pick = (key: string, client: string): Record<string, unknown> | undefined => {
  const m = read(key)
  if (!m || typeof m !== 'object' || Array.isArray(m)) return undefined
  const v = (m as Record<string, unknown>)[client]
  return v === undefined ? undefined : { [client]: v }
}

/** Array of records → keep those whose `field` equals the client (strict). */
const byField = (key: string, field: string, client: string): unknown[] | undefined => {
  const a = read(key)
  if (!Array.isArray(a)) return undefined
  return a.filter((x) => x && typeof x === 'object' && (x as Record<string, unknown>)[field] === client)
}

/** Array of records → keep this client's, plus untagged rows (the app shows untagged for all brands). */
const byBrandOrGlobal = (key: string, client: string): unknown[] | undefined => {
  const a = read(key)
  if (!Array.isArray(a)) return undefined
  return a.filter((x) => {
    if (!x || typeof x !== 'object') return false
    const b = (x as Record<string, unknown>).brand
    return !b || b === client
  })
}

/**
 * The localStorage-shaped snapshot for `client`. Only this brand's slices, plus the genuinely global
 * taxonomies (channels, segments). When `campaign` is given, the flow-specific slices (rows,
 * campaigns, canvases, reports, RTBs) are narrowed to that ONE flow, so a single-flow link exposes
 * only that flow (the brand's foundation records it references are still included so it renders).
 */
export function buildShareSnapshot(client: string, campaign?: string): Record<string, unknown> {
  const snap: Record<string, unknown> = {}
  const set = (k: string, v: unknown) => {
    if (v !== undefined) snap[k] = v
  }
  // A row/campaign belongs to this share if it's the shared flow (single-flow) or, for a brand
  // share, any campaign attributed to the client.
  const campInShare = (name: string): boolean =>
    campaign ? name === campaign : clientForCampaign(name) === client

  // Sheet rows carry no client field — attribute via the campaign→client map (the app's own rule),
  // which is both correct and leak-safe (a row is never misattributed to this client/flow).
  const sheet = read('stoplight.sheet.v1') as { rows?: unknown[] } | unknown[] | undefined
  const rows = Array.isArray(sheet) ? sheet : (sheet?.rows ?? [])
  const scopedRows = (rows as Record<string, unknown>[]).filter((r) => campInShare(String(r.campaign ?? '')))
  set('stoplight.sheet.v1', { rows: scopedRows })

  // Direct `client` field — for a single-flow share, narrow campaigns/canvases/reports to the flow.
  const campaigns = byField('stoplight.campaigns.v1', 'client', client) as Record<string, unknown>[] | undefined
  set('stoplight.campaigns.v1', campaign ? campaigns?.filter((c) => c.name === campaign) : campaigns)
  const canvases = byField('stoplight.canvases.v1', 'client', client) as Record<string, unknown>[] | undefined
  set('stoplight.canvases.v1', campaign ? canvases?.filter((c) => c.campaign === campaign) : canvases)
  const reports = byField('stoplight.reports.v1', 'client', client) as Record<string, unknown>[] | undefined
  set('stoplight.reports.v1', campaign ? reports?.filter((r) => r.campaign === campaign) : reports)

  // Object keyed by brand/client name.
  set('stoplight.clientAudiences.v1', pick('stoplight.clientAudiences.v1', client))
  set('stoplight.brandSystems.v1', pick('stoplight.brandSystems.v1', client))
  set('stoplight.clientProfiles.v1', pick('stoplight.clientProfiles.v1', client))
  set('stoplight.campaignFolders.v1', pick('stoplight.campaignFolders.v1', client))
  set('stoplight.brandGuides.v1', pick('stoplight.brandGuides.v1', client))
  set('stoplight.brandMeta.v1', pick('stoplight.brandMeta.v1', client))
  set('stoplight.brandActuals.v1', pick('stoplight.brandActuals.v1', client))

  // The brand record's own `name` is the brand.
  set('stoplight.brandRecords.v1', byField('stoplight.brandRecords.v1', 'name', client))

  // Required `brand` field (strict).
  set('stoplight.mediaMixes.v1', byField('stoplight.mediaMixes.v1', 'brand', client))
  set('stoplight.targetLists.v1', byField('stoplight.targetLists.v1', 'brand', client))
  set('stoplight.libraryFolders.v1', byField('stoplight.libraryFolders.v1', 'brand', client))

  // Optional `brand` (untagged = shown for all brands, safe to include).
  set('stoplight.companies.v1', byBrandOrGlobal('stoplight.companies.v1', client))
  set('stoplight.people.v1', byBrandOrGlobal('stoplight.people.v1', client))
  set('stoplight.objectives.v1', byBrandOrGlobal('stoplight.objectives.v1', client))
  set('stoplight.messages.v1', byBrandOrGlobal('stoplight.messages.v1', client))
  set('stoplight.voices.v1', byBrandOrGlobal('stoplight.voices.v1', client))
  set('stoplight.tasks.v1', byBrandOrGlobal('stoplight.tasks.v1', client))

  // The client list, narrowed to just this brand.
  set('stoplight.clients.v1', [client])

  // Campaign-keyed RTBs — keep this share's campaigns (the one flow, or all the client's).
  const rtbs = read('stoplight.campaignRtbs.v1')
  if (rtbs && typeof rtbs === 'object' && !Array.isArray(rtbs)) {
    const out: Record<string, unknown> = {}
    for (const [camp, v] of Object.entries(rtbs as Record<string, unknown>)) {
      if (campInShare(camp)) out[camp] = v
    }
    set('stoplight.campaignRtbs.v1', out)
  }

  // Global taxonomies (no brand) — safe to include whole so the view renders.
  set('stoplight.channelRecords.v1', read('stoplight.channelRecords.v1'))
  set('stoplight.segments.v1', read('stoplight.segments.v1'))

  return snap
}

/** Publish (or refresh) the public snapshot for a share grant. Fire-and-forget; no-op on localStorage. */
export async function publishShareSnapshot(
  client: string,
  role: Role,
  grantId: string,
  campaign?: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  try {
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const data = buildShareSnapshot(client, campaign)
    await supabase
      .from('share_snapshots')
      .upsert({ id: grantId, workspace_id: ws, client, role, data, updated_at: new Date().toISOString() })
  } catch {
    /* table not migrated yet, or offline — the link still works for signed-in users */
  }
}

/**
 * For an anonymous viewer opening a ?share= link: fetch the brand snapshot by grant id and seed
 * localStorage so the store renders it. Signed-in users skip this and use their own live data.
 * Called from main.tsx BEFORE the store module loads. Safe to overwrite localStorage: a later
 * sign-in re-hydrates from the workspace backend.
 */
export async function maybeHydrateShare(): Promise<void> {
  let token: string | null = null
  try {
    token = new URLSearchParams(window.location.search).get('share')
  } catch {
    return
  }
  if (!token) return
  const grant = decodeShareToken(token)
  if (!grant?.id) return
  if (!isSupabaseConfigured || !supabase) return
  try {
    const { data: sess } = await supabase.auth.getSession()
    if (sess.session) return // signed in → use live data, not the snapshot
  } catch {
    /* treat as anonymous */
  }
  try {
    const { data, error } = await supabase.rpc('get_share_snapshot', { share_id: grant.id })
    if (error || !data || typeof data !== 'object') return
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      try {
        localStorage.setItem(k, JSON.stringify(v))
      } catch {
        /* ignore quota */
      }
    }
  } catch {
    /* ignore; the app still opens (empty) rather than dead-ending */
  }
}
