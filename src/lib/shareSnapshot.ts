import type { Role } from '../domain/access'
import { brandFromBoard, isBrandless } from '../domain/brand'
import { DRAFTS_SPACE, clientForCampaign } from '../domain/clients'
import { decideShareView } from '../domain/shareAccess'
import { decodeShareToken } from './shareLink'
import { getActiveWorkspaceId } from './session'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Read-only share snapshots. A ?share= link carries a self-contained grant (client + role + id, and
 * optionally one campaign). So a recipient can VIEW with no account, the owner publishes a
 * point-in-time snapshot of ONLY that brand (or one flow) to a public table, keyed by the grant id
 * (see supabase/migrations/0002_share_snapshots.sql). The snapshot is localStorage-shaped: on the
 * recipient we seed those keys before the store loads (main.tsx), and the token pins client + role.
 *
 * The snapshot is built from the LIVE STORE STATE, not localStorage: with a Supabase backend the
 * rows (assets) and record lists (companies, people, messages, voices, objectives, brands, segments,
 * channels, library folders) are empty in localStorage and only live in the store after hydration.
 * Reading localStorage would drop every asset. Scoping is per-brand (and per-flow) so a semi-public
 * link never leaks the owner's other clients or flows.
 */

/** The live store slices the snapshot needs. Kept loose to avoid importing the full store type. */
export interface SnapshotState {
  rows?: unknown[]
  campaignList?: unknown[]
  flowBoards?: unknown[]
  smartObjects?: unknown[]
  clientAudiences?: Record<string, unknown>
  brandSystems?: Record<string, unknown>
  clientProfiles?: Record<string, unknown>
  brandMeta?: Record<string, unknown>
  brandActuals?: Record<string, unknown>
  brandGuides?: Record<string, unknown>
  campaignFolders?: Record<string, unknown>
  brandRecords?: unknown[]
  brandObjects?: unknown[]
  brandDatasets?: unknown[]
  products?: unknown[]
  concepts?: unknown[]
  seasons?: unknown[]
  companies?: unknown[]
  people?: unknown[]
  objectives?: unknown[]
  messages?: unknown[]
  voices?: unknown[]
  patterns?: unknown[]
  triggers?: unknown[]
  canvases?: unknown[]
  channelRecords?: unknown[]
  mediaMixes?: unknown[]
  reports?: unknown[]
  segments?: unknown[]
  targetLists?: unknown[]
  libraryFolders?: unknown[]
}

const read = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

const asArr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])

/** Object keyed by brand/client name → keep only this client's entry. */
const pick = (obj: Record<string, unknown> | undefined, client: string): Record<string, unknown> | undefined => {
  if (!obj || typeof obj !== 'object') return undefined
  const v = obj[client]
  return v === undefined ? undefined : { [client]: v }
}

/** Array of records → keep those whose `field` equals the client (strict). */
const byField = (arr: unknown, field: string, client: string): unknown[] =>
  asArr(arr).filter((x) => x[field] === client)

/** Array of records → keep this client's, plus untagged rows (the app shows untagged for all brands). */
const byBrandOrGlobal = (arr: unknown, client: string): unknown[] =>
  asArr(arr).filter((x) => {
    const b = x.brand
    return !b || b === client
  })

/**
 * The localStorage-shaped snapshot for `client`, built from the live store `state`. Only this brand's
 * slices, plus the genuinely global taxonomies (channels, segments). When `campaign` is given, the
 * flow-specific slices (rows, campaigns, canvases, reports, RTBs) are narrowed to that ONE flow.
 */
export function buildShareSnapshot(state: SnapshotState, client: string, campaign?: string): Record<string, unknown> {
  const snap: Record<string, unknown> = {}
  const set = (k: string, v: unknown) => {
    if (v !== undefined) snap[k] = v
  }
  /**
   * WHICH BRAND A CAMPAIGN BELONGS TO, by the same ladder the share dialog scopes the link with:
   * the campaign's own record, then the Brand card wired into its board.
   *
   * Both ends have to answer this the same way or the link scopes to a brand the snapshot then
   * decides that campaign is not part of. bindCampaignBrand writes the record only when a Brand card
   * is wired in, so a campaign predating that wiring reads Unassigned while its board plainly names
   * a brand — and a brand share, which selects by this answer, packed none of it.
   *
   * Reading the card rather than admitting every brandless campaign: a link scoped to one brand must
   * carry that brand's work, not every unfiled draft in the workspace.
   */
  const brandOfCampaign = (name: string): string => {
    const rec = asArr(state.campaignList).find((c) => c.name === name)?.client
    const filed = [typeof rec === 'string' ? rec.trim() : '', clientForCampaign(name)].find(
      (b) => b && !isBrandless(b) && b !== DRAFTS_SPACE,
    )
    if (filed) return filed
    const board = asArr(state.flowBoards).find((b) => b.key === name)
    return brandFromBoard(
      board as Parameters<typeof brandFromBoard>[0],
      (refId) => asArr(state.brandObjects).find((b) => b.id === refId)?.name as string | undefined,
    )
  }
  // A row/campaign belongs to this share if it's the shared flow (single-flow) or, for a brand
  // share, any campaign attributed to the client.
  const campInShare = (name: string): boolean => (campaign ? name === campaign : brandOfCampaign(name) === client)

  // Rows (assets) — no client field; attribute via the campaign→client map (the app's own rule).
  const scopedRows = asArr(state.rows).filter((r) => campInShare(String(r.campaign ?? '')))
  set('stoplight.sheet.v1', { rows: scopedRows })

  /**
   * A CAMPAIGN LINK CARRIES ITS OWN CAMPAIGN, whatever that campaign is filed under.
   *
   * These were selected by the record's `client` field first and narrowed to the flow second, which
   * silently dropped the one record the link exists to hand over: a campaign's brand can live on the
   * Brand card wired into its brief while the record still reads Unassigned (bindCampaignBrand only
   * writes that field when the wire is drawn), so a link scoped to the brand found no campaign whose
   * `client` matched and shipped an empty list. The assets travelled — they are attributed by
   * campaign NAME — and so did the board, so the recipient got a campaign with its work in it and no
   * campaign record behind it: no goal, no status, no folder, no timing. Blank.
   *
   * By name, then, for the single-flow case: the shared campaign is not a member of a set to be
   * filtered, it is the subject of the link. A brand share still selects a set, but through
   * brandOfCampaign, so it packs what the owner sees under that brand rather than only what the
   * record field happens to say.
   *
   * Canvases and reports keep the plain `client` filter for a brand share: those carry their own
   * client and are not the thing whose brand can live on a card.
   */
  const byCampaignOrClient = (arr: unknown, field: string): unknown[] =>
    campaign ? asArr(arr).filter((x) => x[field] === campaign) : byField(arr, 'client', client)
  set(
    'stoplight.campaigns.v1',
    campaign
      ? asArr(state.campaignList).filter((c) => c.name === campaign)
      : asArr(state.campaignList).filter((c) => brandOfCampaign(String(c.name ?? '')) === client),
  )
  // Campaign boards are keyed by campaign NAME, not by client, so scope them through campInShare
  // rather than byField. A share link should show the board the recipient is looking at, and only
  // that one: the builder's own '__new-flow__' slot is never a real campaign and never travels.
  const boards = asArr(state.flowBoards).filter((b) => campInShare(String((b as Record<string, unknown>).key ?? '')))
  set('stoplight.flowBoards.v1', boards)
  set('stoplight.canvases.v1', byCampaignOrClient(state.canvases, 'campaign'))
  set('stoplight.reports.v1', byCampaignOrClient(state.reports, 'campaign'))

  // Object keyed by brand/client name.
  set('stoplight.clientAudiences.v1', pick(state.clientAudiences, client))
  set('stoplight.brandSystems.v1', pick(state.brandSystems, client))
  set('stoplight.clientProfiles.v1', pick(state.clientProfiles, client))
  set('stoplight.campaignFolders.v1', pick(state.campaignFolders, client))
  set('stoplight.brandGuides.v1', pick(state.brandGuides, client))
  set('stoplight.brandMeta.v1', pick(state.brandMeta, client))
  set('stoplight.brandActuals.v1', pick(state.brandActuals, client))

  // The brand record's own `name` is the brand.
  set('stoplight.brandRecords.v1', byField(state.brandRecords, 'name', client))

  // Required `brand` field (strict).
  set('stoplight.mediaMixes.v1', byField(state.mediaMixes, 'brand', client))
  // Smart objects have to travel with the board: a placement holds only a smartObjectId, so without
  // the objects themselves pruneBoard would drop every placement on the recipient's side and the
  // shared canvas would arrive with its smart objects missing.
  //
  // Scoped, not just filtered by brand. A campaign-scoped object carries its brand too, so byField
  // alone would send the names of objects local to campaigns this link does not share.
  set(
    'stoplight.smartObjects.v1',
    byField(state.smartObjects, 'brand', client).filter((o) => {
      const scope = (o as Record<string, unknown>).scope
      // A missing scope predates the ladder and was a brand-library object.
      if (scope !== 'campaign') return true
      return campInShare(String((o as Record<string, unknown>).campaign ?? ''))
    }),
  )
  set('stoplight.targetLists.v1', byField(state.targetLists, 'brand', client))
  set('stoplight.libraryFolders.v1', byField(state.libraryFolders, 'brand', client))
  // A Data source card's refId is a data set id, so without these the card arrives naming a table
  // that is not in the snapshot.
  set('stoplight.brandDatasets.v1', byField(state.brandDatasets, 'brand', client))

  /**
   * THE RECORDS THE BOARD'S CARDS POINT AT, and the reason this list is not shorter.
   *
   * The board travels (flowBoards, above), and a card on it is a `kind` plus a `refId` into one of
   * these collections. Four of them were never packed: brand objects, products, concepts and
   * seasons. So a Brand card wired into the brief — the card that names the whole campaign's brand —
   * arrived on the recipient's side pointing at a record that was not in the snapshot. The card
   * still showed a name, because a card falls back to what it was called; it just had nothing
   * behind it. It read as "nothing picked", its own record was missing from the picker, and the
   * same went for every Product, Concept and Season card on the board.
   *
   * Scoped exactly as the campaign board scopes them (see FlowsView): this brand's, plus the
   * untagged ones the app shows under every brand.
   */
  set('stoplight.brandObjects.v1', byBrandOrGlobal(state.brandObjects, client))
  set('stoplight.products.v1', byBrandOrGlobal(state.products, client))
  set('stoplight.concepts.v1', byBrandOrGlobal(state.concepts, client))
  set('stoplight.seasons.v1', byBrandOrGlobal(state.seasons, client))

  // Optional `brand` (untagged = shown for all brands, safe to include).
  set('stoplight.companies.v1', byBrandOrGlobal(state.companies, client))
  set('stoplight.people.v1', byBrandOrGlobal(state.people, client))
  set('stoplight.objectives.v1', byBrandOrGlobal(state.objectives, client))
  set('stoplight.messages.v1', byBrandOrGlobal(state.messages, client))
  set('stoplight.voices.v1', byBrandOrGlobal(state.voices, client))
  set('stoplight.patterns.v1', byBrandOrGlobal(state.patterns, client))
  set('stoplight.triggers.v1', byBrandOrGlobal(state.triggers, client))

  // Tasks are owned by TasksView (localStorage only) — scope by brand (untagged = global).
  const tasks = asArr(read('stoplight.tasks.v1')).filter((t) => !t.brand || t.brand === client)
  set('stoplight.tasks.v1', tasks)

  // The client list, narrowed to just this brand.
  set('stoplight.clients.v1', [client])

  // Campaign-keyed RTBs (localStorage only) — keep this share's campaigns.
  const rtbs = read('stoplight.campaignRtbs.v1')
  if (rtbs && typeof rtbs === 'object' && !Array.isArray(rtbs)) {
    const out: Record<string, unknown> = {}
    for (const [camp, v] of Object.entries(rtbs as Record<string, unknown>)) {
      if (campInShare(camp)) out[camp] = v
    }
    set('stoplight.campaignRtbs.v1', out)
  }

  // Global taxonomies (no brand) — include whole so the view renders.
  set('stoplight.channelRecords.v1', asArr(state.channelRecords))
  set('stoplight.segments.v1', asArr(state.segments))

  return snap
}

/** Publish (or refresh) the public snapshot for a share grant. Fire-and-forget; no-op on localStorage. */
export async function publishShareSnapshot(
  state: SnapshotState,
  client: string,
  role: Role,
  grantId: string,
  campaign?: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  try {
    const ws = await getActiveWorkspaceId()
    if (!ws) return
    const data = buildShareSnapshot(state, client, campaign)
    await supabase
      .from('share_snapshots')
      .upsert({ id: grantId, workspace_id: ws, client, role, data, updated_at: new Date().toISOString() })
  } catch {
    /* table not migrated yet, or offline — the link still opens, with nothing in it to show */
  }
}

/**
 * SEEDED KEYS ARE BORROWED, NOT THE VIEWER'S OWN.
 *
 * Seeding writes another workspace's brand into this browser's localStorage under the same keys the
 * app's own local data uses. That is fine while the share link is open — it IS the data being
 * viewed — but it must not outlive the visit. The person who opens a share link and then signs up
 * is the ordinary case, and leaving the snapshot behind would carry someone else's brand into the
 * first session of their own account. So record what was written, and clear it on the next load
 * that is not a share view.
 */
const SEEDED_KEYS = 'stoplight.shareSeeded.v1'
const SHARE_VIEW_FLAG = 'stoplight.shareView'

function forgetSeededSnapshot(): void {
  /**
   * The flag goes first, and unconditionally.
   *
   * It is what tells the rest of the app "this tab is showing somebody else's shared work": the
   * store runs on localStorage because of it, and AuthGate waves the viewer past sign-in because of
   * it. Left behind on a load that carries no token, it would do both of those for a viewer who has
   * no grant and no seeded data — an unauthenticated window onto a live workspace, showing nothing.
   * The seeded keys are the easy half of the cleanup; this is the half that matters.
   */
  try {
    sessionStorage.removeItem(SHARE_VIEW_FLAG)
  } catch {
    /* no sessionStorage — nothing was ever flagged */
  }
  try {
    const raw = localStorage.getItem(SEEDED_KEYS)
    if (!raw) return
    const keys = JSON.parse(raw)
    if (Array.isArray(keys)) for (const k of keys) if (typeof k === 'string') localStorage.removeItem(k)
    localStorage.removeItem(SEEDED_KEYS)
  } catch {
    /* nothing to clean up, or storage is unavailable — either way the app still opens */
  }
}

/** Every workspace this viewer belongs to. Empty on any failure, which decideShareView reads as "not a member". */
async function viewerWorkspaces(): Promise<string[]> {
  if (!supabase) return []
  try {
    const { data: u } = await supabase.auth.getUser()
    const uid = u.user?.id
    if (!uid) return []
    const { data, error } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', uid)
    if (error) return []
    return (data ?? []).map((m) => m.workspace_id as string)
  } catch {
    return []
  }
}

/** The workspace that published this snapshot, or null if it cannot be determined. */
async function snapshotOwner(grantId: string): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('get_share_snapshot_owner', { share_id: grantId })
    return error || typeof data !== 'string' ? null : data
  } catch {
    // The function may not be migrated yet. Null means "unknown", which resolves to live data —
    // the same behaviour this had before the function existed.
    return null
  }
}

/**
 * For a viewer opening a ?share= link: serve the published snapshot unless they can already read
 * the shared workspace themselves. Called from main.tsx BEFORE the store module loads, because the
 * store reads localStorage at import and decides there whether to run its data layer locally.
 *
 * Note this turns on ACCESS, not on having an account — see domain/shareAccess.ts for why. A member
 * of the owning workspace gets their live backend; everyone else gets the snapshot, signed in or
 * not, because for them the snapshot is the only copy of this work they are allowed to see.
 */
export async function maybeHydrateShare(): Promise<void> {
  let token: string | null = null
  try {
    token = new URLSearchParams(window.location.search).get('share')
  } catch {
    return
  }
  // Not a share view: drop any snapshot a previous one left in this browser.
  if (!token) {
    forgetSeededSnapshot()
    return
  }
  const grant = decodeShareToken(token)
  if (!grant?.id) return
  if (!isSupabaseConfigured || !supabase) return

  let signedIn = false
  try {
    const { data: sess } = await supabase.auth.getSession()
    signedIn = !!sess.session
  } catch {
    /* treat as anonymous */
  }

  const source = decideShareView({
    signedIn,
    // Only worth two round trips when there is a session to disqualify; anonymous is always the snapshot.
    ownerWorkspaceId: signedIn ? await snapshotOwner(grant.id) : null,
    viewerWorkspaceIds: signedIn ? await viewerWorkspaces() : [],
  })

  if (source === 'live') {
    // Their own workspace already holds this work. Clear any stale share-view flag so the store
    // runs against the backend rather than localStorage.
    try {
      sessionStorage.removeItem(SHARE_VIEW_FLAG)
    } catch {
      /* ignore */
    }
    return
  }

  // Snapshot view → the store must read the seeded localStorage, not a backend scoped to a
  // workspace that does not contain any of this. This flag puts its data layer in localStorage mode.
  try {
    sessionStorage.setItem(SHARE_VIEW_FLAG, '1')
  } catch {
    /* ignore */
  }
  try {
    const { data, error } = await supabase.rpc('get_share_snapshot', { share_id: grant.id })
    if (error || !data || typeof data !== 'object') return
    const written: string[] = []
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      try {
        localStorage.setItem(k, JSON.stringify(v))
        written.push(k)
      } catch {
        /* ignore quota */
      }
    }
    try {
      localStorage.setItem(SEEDED_KEYS, JSON.stringify(written))
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore; the app still opens (empty) rather than dead-ending */
  }
}
