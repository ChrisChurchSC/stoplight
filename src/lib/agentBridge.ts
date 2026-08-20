import { FLOW_BOARDS_KEY, useTrafficStore } from '../store/useTrafficStore'
import { STORAGE_FULL, confirmPersisted, flushPersistedState, saveTrouble } from '../adapters/state/workspaceState'
import { SHEET_STORAGE_KEY } from '../adapters/sheet/mockSheetAdapter'
import { isSupabaseConfigured } from './supabase'
import type { FlowBoard } from '../domain/flowBoard'
import type { SheetSnapshot } from '../domain/types'
import { mapSite } from '../adapters/setup/siteMap'
import { newAudience } from '../domain/audiences'
import { newDescriptor } from '../domain/descriptors'
import { newLibraryCta } from '../domain/library'
import { DRAFTS_SPACE, UNASSIGNED, clientForCampaign, liveCampaignNames } from '../domain/clients'
import { funnelStageFor } from '../domain/funnel'
import { GENERIC_CTA_KEY, IN_CREATIVE_KEY, applyCopyFields, describeAssetFields, fieldCoverage, messagingKeys, rendersInCreative } from '../domain/assetFields'
import { isCtaField } from '../domain/messaging'
import { ctaForHandoff } from '../domain/assetCtas'
import { CHANNEL_LIST, resolveChannelId } from '../domain/channels'
import { boardFor, freshObjectId, type CanvasObject, type CanvasObjectKind } from '../domain/flowBoard'
import { OBJECT_CARD_KINDS, applyDirection, describeObjectFields, directionCoverage, identityCoverage, objectCardView, recordTypeFor } from '../domain/objectFields'
import { makeObjectReference, titleFromDoc } from '../domain/objectReference'
import { rankSuggestions, reviewCampaign, type Suggestion } from '../domain/campaignReview'
import { nextStep } from '../domain/nextStep'
import { brandPresence } from '../domain/presence'
import { breakScopeKey, coherenceContentHash, detectBreaks } from '../domain/breaks'
import { rowInScope } from './scope'
import type { MediaType, RowStatus, TrafficRow } from '../domain/types'
import { type AssetFilter, type ViewGroupBy, assetMatchesFilter, assetDate, groupKeyFor, resolveWindow } from '../domain/savedViews'
import { GTM_STRATEGIES, resolveStrategyKey } from '../domain/strategies'
import { conditionSentence } from '../domain/conditions'
import { STRATEGY_ASSETS } from '../domain/strategyAssets'
import { apiFetch } from './apiFetch'

/**
 * Browser side of the agent bridge: this tab is the executor. It listens for
 * commands from the dev-server bridge (which the Hyperfocus MCP server, and so
 * Claude Desktop, posts to) and runs the REAL store actions, so a command typed
 * in Desktop adds a client / sets one up / runs a check in this tab, with the UI
 * updating live. Dev only. See server/agentBridge.ts and mcp/hyperfocus-server.mjs.
 */

type Args = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
// A list field — accepts an array of strings, or a comma/newline-separated string.
const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => str(x).trim()).filter(Boolean)
    : str(v)
      ? str(v)
          .split(/[\n,]/)
          .map((x) => x.trim())
          .filter(Boolean)
      : []

/** The four friendly copy args the asset tools have always taken, alongside `fields`. */
const COPY_ARGS = ['headline', 'primaryText', 'description', 'cta'] as const

/** True for a `fields` arg worth applying: a plain object of key → copy. */
const isFieldMap = (v: unknown): boolean =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0

/**
 * What every asset write tells the caller about the CARD, not just the row.
 *
 * An agent cannot fill a component it does not know exists, and it could not see that it had left
 * one empty either — a hand-authored website landed with four of its nine fields written and the
 * response said nothing but "ok". So each write now answers three things: where each alias actually
 * went (a surprising resolution is visible rather than silent), which aliases this format has no
 * home for and were therefore NOT stored, and which components are still blank.
 */
function copyReport(
  channel: TrafficRow['channel'],
  assetType: string | undefined,
  messaging: Record<string, string> | undefined,
  applied: { mapped: Record<string, string | undefined>; unmapped: string[]; clamped: string[] } | null,
  row?: { mediaType?: MediaType; extractedCopy?: string },
) {
  const coverage = fieldCoverage(channel, assetType, messaging, row)
  const out: Record<string, unknown> = { fields: coverage }
  if (applied) {
    if (Object.keys(applied.mapped).length) out.wroteTo = applied.mapped
    // Copy that went NOWHERE. Loud, because the old behaviour was to drop it without a word.
    if (applied.unmapped.length) {
      out.notStored = applied.unmapped
      out.notStoredWhy =
        `This asset has no field for: ${applied.unmapped.join(', ')}. That copy was NOT saved — ` +
        `re-send it under a real key from get_asset_fields.`
    }
    if (applied.clamped.length) out.clampedToLimit = applied.clamped
  }
  if (coverage.missing.length) {
    out.fieldsNote =
      `${coverage.missing.length} of ${coverage.filled.length + coverage.missing.length} components are still empty ` +
      `(${coverage.missing.join(', ')}) and render blank on the card. Fill them with edit_asset \`fields\`.`
  }
  return out
}

/**
 * A loose channel value from an agent, resolved to the canonical id — or rejected.
 *
 * The component schema is keyed by canonical id, and an unrecognized key falls back to a generic
 * headline / body / CTA triple. So `channel: "Instagram"` (the natural capitalization, and what the
 * tools themselves defaulted to) silently authored against a three-field fallback instead of
 * Instagram's single caption — and then reported the card COMPLETE, because it was complete for the
 * schema it had wrongly resolved. Naming the channel wrong has to be an error the agent can see,
 * not a quietly different card.
 */
function channelArg(value: unknown, fallback: TrafficRow['channel'] = 'instagram'): TrafficRow['channel'] {
  const raw = str(value).trim()
  if (!raw) return fallback
  const id = resolveChannelId(raw)
  if (!id) throw new Error(`unknown channel "${raw}". Use a canonical id, e.g. ${CHANNEL_LIST.slice(0, 6).map((c) => c.id).join(', ')}…`)
  return id
}

const MEDIA_TYPES: MediaType[] = ['image', 'video', 'text', 'link']

/** The asset's media type, which decides whether its card carries an in-creative row. */
function mediaArg(value: unknown, fallback: MediaType = 'image'): MediaType {
  const raw = str(value).trim().toLowerCase()
  if (!raw) return fallback
  if (!MEDIA_TYPES.includes(raw as MediaType)) throw new Error(`unknown mediaType "${raw}". Use one of: ${MEDIA_TYPES.join(', ')}`)
  return raw as MediaType
}

/** A card kind an agent named, checked against the set the toolbar itself offers. */
function objectKindArg(value: unknown): CanvasObjectKind {
  const raw = str(value).trim().toLowerCase().replace(/\s+/g, '-')
  const hit = OBJECT_CARD_KINDS.find((k) => k === raw)
  if (!hit) throw new Error(`unknown card kind "${str(value).trim()}". Use one of: ${OBJECT_CARD_KINDS.join(', ')}`)
  return hit
}

/**
 * The document an agent supplied as this card's description, clamped to the same budget an uploaded
 * .md gets. Kept on the CARD rather than written through to a record: a card created over MCP
 * usually points at no record, and writing to a shared record would silently rewrite what every
 * other campaign generates from — the one failure a shared library cannot recover from.
 */
function referenceArg(a: Args): { reference?: ReturnType<typeof makeObjectReference> } {
  const text = str(a.description).trim()
  if (!text) return {}
  return { reference: makeObjectReference(str(a.documentName).trim() || 'Pasted text', text, Date.now()) }
}

/**
 * What to call the card. An explicit name wins; otherwise it is read off the document the way an
 * uploaded one is named — its H1, then its filename, then its opening line.
 *
 * Never guessed from the kind. A nameless card is named by whatever it points at, and a generated
 * card points at nothing, so a board of them reads "Audience, Audience, Audience" everywhere a card
 * is listed — in Layers, in the grid's Applied-to column, in every "what feeds this asset" answer.
 */
function cardNameArg(a: Args, kind: CanvasObjectKind): string {
  const explicit = str(a.name).trim()
  if (explicit) return explicit
  const text = str(a.description).trim()
  if (!text) return ''
  return titleFromDoc(str(a.documentName).trim() || 'Pasted text', text, `Untitled ${kind}`)
}

/** A free-ish spot for a new card, so a board written over MCP is readable rather than a pile. */
function nextSlot(pos: Record<string, { x: number; y: number }>): { x: number; y: number } {
  const n = Object.keys(pos ?? {}).length
  return { x: 60 + (n % 5) * 280, y: 60 + Math.floor(n / 5) * 220 }
}

/** What an object-card write reports back: what it still owes, in the card's own vocabulary. */
function objectCardReport(
  kind: CanvasObjectKind,
  direction: { key: string; value: string }[],
  clamped: string[],
  card?: CanvasObject,
) {
  const coverage = directionCoverage(kind, direction)
  const out: Record<string, unknown> = { fields: coverage }
  if (clamped.length) out.clampedToLimit = clamped
  if (coverage.missing.length) {
    out.fieldsNote =
      `${coverage.missing.join(', ')} unanswered. Direction is what this card contributes to the copy — ` +
      `without it the card adds a name and nothing else.`
  }
  if (card) {
    const identity = identityCoverage(card)
    out.identity = identity
    // Said separately from the direction note because it fails for a different reason: direction is
    // what the card tells the WRITER, this is what it tells anyone looking at the board.
    if (identity.missing.includes('description')) {
      out.identityNote =
        'No description on this card. A description is the document standing as "what this thing is", and it ' +
        'reaches the writer — the team note deliberately does not. Pass `description` as markdown.'
    }
  }
  return out
}

/** The first component carrying text, in the order the card renders them, trimmed to a name. */
function firstFilled(messaging: Record<string, string>, channel: TrafficRow['channel'], assetType?: string): string {
  const first = fieldCoverage(channel, assetType, messaging).filled[0]
  const value = (first ? messaging[first] : '')?.trim() ?? ''
  return value.length > 60 ? `${value.slice(0, 60).trimEnd()}…` : value
}

/** Resolve proofPoints (rtb ids OR labels) to rtb ids for a brand. */
function resolveProofIds(brand: string, proofPoints: string[]): string[] {
  const rtbs = useTrafficStore.getState().brandSystems[brand]?.rtbs ?? []
  const byId = new Set(rtbs.map((r) => r.id))
  const byLabel = new Map(rtbs.map((r) => [r.label.toLowerCase(), r.id]))
  return proofPoints.map((p) => (byId.has(p) ? p : byLabel.get(p.toLowerCase()) ?? p)).filter(Boolean)
}
const ASSET_STATUSES: RowStatus[] = ['draft', 'in_review', 'approved', 'rejected', 'scheduled', 'posted', 'failed']

const sourceAlias = (s: string) => (s === 'buffer' ? 'social-live' : s === 'site-map' ? 'site' : s)
/** A friendly window phrase → trailing days. "last week"/"7d"/"30"/"quarter" etc. */
function windowToDays(v: unknown): number | undefined {
  const s = str(v).trim().toLowerCase().replace(/^last\s+/, '').replace(/\s+/g, '')
  if (!s) return undefined
  const named: Record<string, number> = { today: 1, week: 7, fortnight: 14, month: 30, quarter: 90, halfyear: 182, year: 365 }
  if (named[s]) return named[s]
  const m = s.match(/^(\d+)(d|day|days|w|wk|week|weeks|m|mo|month|months|q|quarter|quarters|y|year|years)?$/)
  if (!m) return undefined
  const n = Number(m[1])
  const u = m[2] ?? 'd'
  if (/^w/.test(u)) return n * 7
  if (/^(mo|m)/.test(u) && u !== 'm') return n * 30
  if (u === 'm') return n * 30
  if (/^q/.test(u)) return n * 90
  if (/^y/.test(u)) return n * 365
  return n
}
/** Build an AssetFilter from bridge args (shared by query_assets / list_assets / canvases). */
function buildFilter(a: Args): AssetFilter {
  const arr = (v: unknown) => (list(v).length ? list(v) : undefined)
  const src = list(a.source).map(sourceAlias)
  const withinDays = Number(a.withinDays) > 0 ? Number(a.withinDays) : windowToDays(a.window)
  return {
    source: src.length ? src : undefined,
    campaign: str(a.campaign).trim() || undefined,
    channel: arr(a.channel),
    audience: arr(a.audience),
    stage: arr(a.stage),
    status: arr(a.status),
    publishedAfter: str(a.publishedAfter).trim() || undefined,
    publishedBefore: str(a.publishedBefore).trim() || undefined,
    withinDays,
    includeArchived: a.includeArchived === true,
  }
}
const rowEngagement = (r: TrafficRow) =>
  r.socialMetrics?.engagementRate ?? (r.engagement ? r.engagement.likes + r.engagement.comments : 0)
/** Sort rows by a saved-view / query sort key. */
function sortRows(rows: TrafficRow[], sort?: string): TrafficRow[] {
  const s = (sort ?? '').trim()
  if (!s) return rows
  const out = [...rows]
  if (s === 'newest') out.sort((a, b) => assetDate(b) - assetDate(a))
  else if (s === 'oldest') out.sort((a, b) => assetDate(a) - assetDate(b))
  else if (s === 'engagement') out.sort((a, b) => rowEngagement(b) - rowEngagement(a))
  else out.sort((a, b) => (b.socialMetrics?.[s] ?? 0) - (a.socialMetrics?.[s] ?? 0))
  return out
}
/** Map a row to the asset shape the connector returns (shared by list_assets + get_canvas). */
/**
 * One asset, by id or by exact name.
 *
 * Both, because the two vocabularies are already both in use: every tool that returns an asset
 * returns its id, and the journey's own fields (linksTo, branchOf, variantOf) are names. Requiring
 * ids here would mean the model reading "leads to Launch post" could not act on it without a lookup
 * it has no reason to know it needs. An ambiguous name is an error rather than a first match —
 * picking one of two assets called the same thing silently rewires the wrong journey.
 */
function resolveAsset(rows: TrafficRow[], ref: string): TrafficRow {
  const q = ref.trim()
  if (!q) throw new Error('from and to are required (an asset id or its exact name)')
  const byId = rows.find((r) => r.id === q)
  if (byId) return byId
  const named = rows.filter((r) => (r.assetName ?? '').trim().toLowerCase() === q.toLowerCase())
  if (named.length === 1) return named[0]
  if (named.length > 1) throw new Error(`"${q}" is the name of ${named.length} assets — pass the id from list_assets instead.`)
  throw new Error(`No asset "${q}". list_assets returns the ids and names in this campaign.`)
}

function assetView(r: TrafficRow, proofLabel: Map<string, string>, brandCtas: { label: string; stage?: string }[]) {
  const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s+/)[0] ?? s).trim()
  const roles = messagingKeys(r.channel, r.assetType)
  const headlineKey = roles.headline
  const ctaKey = roles.cta
  const descKey = roles.description
  const primaryKey = roles.primaryText
  const m = r.messaging ?? {}
  const stage = funnelStageFor(r.channel, r.assetType)
  const primaryText = primaryKey ? (m[primaryKey] ?? '') : ''
  const headline = (headlineKey ? (m[headlineKey] ?? '') : '').trim() || firstSentence(primaryText)
  const stageCta = brandCtas.find((c) => c.stage === stage) ?? brandCtas[0]
  const cta = (ctaKey ? (m[ctaKey] ?? '') : '').trim() || stageCta?.label || ''
  const description = (descKey ? (m[descKey] ?? '') : '').trim() || firstSentence(primaryText)
  const proofIds = [...new Set(Object.values(r.rtbMap ?? {}).flat())]
  return {
    id: r.id,
    /**
     * The journey speaks in NAMES — linksTo, branchOf and variantOf are all asset names — so a view
     * that returned those three and not the name they refer to handed back edges with nothing at
     * either end. Nothing outside could tell which asset "branches off Launch post" was about.
     */
    assetName: r.assetName,
    /** Where this one leads. The other half of branchOf, and the half nothing here could see. */
    linksTo: r.linksTo ?? '',
    stage,
    audience: r.audience ?? '',
    channel: r.channel,
    type: r.assetType,
    format: r.format ?? '',
    status: r.status,
    source: r.source ?? 'generated',
    sourceUrl: r.sourceUrl ?? '',
    mediaRef: r.mediaRef ?? '',
    mediaRefs: r.mediaRefs ?? [],
    publishedAt: r.publishedAt ?? '',
    metrics: r.socialMetrics ?? null,
    metricsUpdatedAt: r.metricsUpdatedAt ?? null,
    engagement: rowEngagement(r),
    authored: !!r.authored,
    archived: !!r.archivedAt,
    headline,
    primaryText,
    description,
    cta,
    lineage: r.lineage ?? {},
    variantOf: r.variantOf ?? '',
    branchOf: r.branchOf ?? '',
    components: m,
    inCreativeCopy: r.extractedCopy ?? '',
    /** Every component this card renders, and which of them are still blank. */
    fields: fieldCoverage(r.channel, r.assetType, m, r),
    proofPoints: proofIds.map((id) => proofLabel.get(id) ?? id),
  }
}
/** Rows for a brand matching a filter, sorted, with limit/cursor paging. */
function resolveBrandAssets(brand: string, filter: AssetFilter, opts: { sort?: string; limit?: number; cursor?: number } = {}) {
  const st = useTrafficStore.getState()
  const proofLabel = new Map<string, string>()
  for (const rtb of st.brandSystems[brand]?.rtbs ?? []) proofLabel.set(rtb.id, rtb.label)
  const brandCtas = st.brandSystems[brand]?.ctas ?? []
  // Resolve any relative window (withinDays) to an absolute cutoff NOW, so a saved view
  // stays relative: "last 30 days" recomputes its start every time it's opened.
  const f = resolveWindow(filter, Date.now())
  const matched = sortRows(
    st.rows.filter((r) => clientForCampaign(r.campaign) === brand && assetMatchesFilter(r, f)),
    opts.sort,
  )
  const total = matched.length
  const cursor = Math.max(0, opts.cursor ?? 0)
  const page = opts.limit && opts.limit > 0 ? matched.slice(cursor, cursor + opts.limit) : matched.slice(cursor)
  const nextCursor = cursor + page.length < total ? cursor + page.length : null
  return { assets: page.map((r) => assetView(r, proofLabel, brandCtas)), total, nextCursor }
}

// Business model per GTM motion, so a strategy override refreshes the brand's
// businessModel to match (instead of leaving the inferred one stale).
const BUSINESS_MODEL_BY_MOTION: Record<string, string> = {
  plg: 'B2C / self-serve (product-led)',
  'demand-gen': 'B2B / SMB (demand capture)',
  'sales-led': 'B2B (sales-assisted)',
  abm: 'B2B (enterprise / named accounts)',
  community: 'B2C / audience-first',
  'content-seo': 'Content / organic',
  lifecycle: 'Subscription / recurring',
  outbound: 'B2B (outbound)',
}

// The whitelist of actions the bridge may run. Each maps to a real store action.
/**
 * THE ACTIONS GRETEL MAY CALL, and the only door onto them.
 *
 * The handlers below already run in the browser against the real store — MCP is just a remote
 * control that pokes them from outside. Gretel runs in the same tab, so it can call them directly
 * without going near the protocol. What it must not have is the whole map.
 *
 * This list is deliberately short. It is the reads, plus the additive brand records Gretel already
 * creates through its own createAudience / createProof ops — the same class of change, reached a
 * different way. Everything destructive or wide-reaching (deleteClient, fanOut, generateAssets,
 * promoteBrand, importAssets) is absent on purpose: a model handed fifty-four app-mutating actions
 * with no canvas context is a good way to get confidently wrong commands applied to real work.
 *
 * Widening it is one line. Do that deliberately, per action, not by reaching for the map.
 */
export const GRETEL_ACTIONS = [
  // reads
  'listClients', 'getBrand', 'getStrategy', 'listAssets', 'listCanvases',
  'listAccounts', 'listConditions', 'getBrandBaseline', 'runCoherenceCheck', 'runCampaignReview', 'getNextStep', 'getAssetFields', 'getObjectFields', 'listObjectCards',
  // additive brand records
  'addAudience', 'addProofPoint', 'addSubject', 'addHook', 'addCta',
] as const

export type GretelAction = (typeof GRETEL_ACTIONS)[number]

/**
 * Run one allowlisted app action. Throws rather than returning an error shape, so the caller's
 * existing skipped-command reporting is what the user sees — a silently dropped command is the
 * failure mode applyFlowCommands was written to end.
 */
export async function runAppAction(action: string, args: Record<string, unknown> = {}): Promise<unknown> {
  if (!(GRETEL_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`"${action}" is not an action Gretel can run`)
  }
  const h = handlers[action]
  if (!h) throw new Error(`"${action}" is allowlisted but has no handler`)
  return h(args as Args)
}

/**
 * A CONNECTOR WRITE THAT DID NOT PERSIST MUST NOT REPORT SUCCESS.
 *
 * Every write here updates the store first and answers from memory, so a card or an asset that
 * never reached storage still comes back as a clean result with an id on it. In the app that is
 * survivable — the canvas is on screen, and the next reload shows the truth to someone who was
 * looking. Through the connector nobody is looking: the model is told "added", says so, moves on
 * to the next of forty calls, and the whole session's work is gone at the next load with the
 * transcript still claiming it exists.
 *
 * So the two writes big enough to fail on their own — a board and a batch of rows — are read back
 * before they are reported. WHERE they are read back from depends on where the work actually has to
 * land, and getting that wrong is how the first version of this check passed a campaign that was
 * being lost: it looked only at localStorage, and only when there was no backend. Signed in, the
 * card sits in localStorage looking perfect while the write the work depends on — the one to the
 * workspace — is refused. A deployed session added 22 object cards to a campaign and 2 of them
 * survived; every one of the 22 had been reported as added.
 */

/**
 * A board write made before the workspace has been read is DISCARDED BY DESIGN.
 *
 * saveFlowBoard keeps the in-memory slice and withholds the write while `boardsHydrated` is false,
 * because it persists the whole array under one key and a write made too early would push this
 * tab's stale copy of every board over the workspace's. Sound, and invisible to the caller: the
 * card is in the store, list_object_cards confirms it, and nothing was written. Signed in, that
 * flag starts false and only turns true when the hydrate lands, so it is exactly the opening of a
 * session — where a connector does its setting up — that silently drops work.
 */
function assertBoardsWritable(): void {
  if (useTrafficStore.getState().boardsHydrated) return
  throw new Error(
    'This tab has not finished loading the workspace, and a board written now would be kept in memory and dropped. Wait a moment and try again.',
  )
}

async function assertBoardLanded(
  campaign: string,
  cardId: string,
  revertTo: FlowBoard,
  /**
   * What the stored card has to look like. Presence alone is the right test for a card being ADDED
   * and the wrong one for a card being EDITED: the id is already in storage either way, so an edit
   * whose write was dropped would sail through a check that only asks whether the card is there.
   */
  matches: (card: CanvasObject | undefined) => boolean = (card) => !!card,
): Promise<void> {
  const revert = (message: string): never => {
    // Put the board back the way it was. Leaving it means the rest of the session reads a card out
    // of this tab's memory and keeps building on it — list_object_cards would confirm it exists.
    useTrafficStore.getState().saveFlowBoard(revertTo)
    throw new Error(message)
  }
  if (isSupabaseConfigured) {
    /**
     * The mirror is DEBOUNCED, so at this instant the write has not been attempted yet and asking
     * whether it succeeded would always say yes. Flush it, then ask. That makes a connector write
     * synchronous with the server in a way the app's own editing deliberately is not — right here,
     * because the answer is about to be reported to somebody who cannot see the board.
     */
    await flushPersistedState()
    const trouble = saveTrouble()
    if (trouble?.keys.includes(FLOW_BOARDS_KEY)) {
      return revert(
        trouble.conflict
          ? 'This board was changed somewhere else — another tab or another session — so the change was refused rather than overwrite it. Reload the app and try again.'
          : `That card did not reach your workspace: ${trouble.message}`,
      )
    }
    return
  }
  const landed = confirmPersisted<FlowBoard[]>(FLOW_BOARDS_KEY, (boards) =>
    matches(boards.find((b) => b.key === campaign)?.objects?.find((o) => o.id === cardId)),
  )
  if (!landed) revert(STORAGE_FULL)
}

/** The same check for asset rows, which go to storage through the sheet adapter rather than a slice. */
function assertRowsLanded(ids: string[]): void {
  if (isSupabaseConfigured || !ids.length) return
  const landed = confirmPersisted<SheetSnapshot>(SHEET_STORAGE_KEY, (snap) => {
    const have = new Set((snap.rows ?? []).map((r) => r.id))
    return ids.every((id) => have.has(id))
  })
  if (!landed) throw new Error(STORAGE_FULL)
}

const handlers: Record<string, (a: Args) => Promise<unknown>> = {
  async listClients() {
    return {
      clients: useTrafficStore.getState().clientList,
      note: 'These are BRANDS. Campaigns are listed by list_campaigns — including the ones in Drafts, which belong to no brand and so appear nowhere in this list.',
    }
  },

  /**
   * EVERY CAMPAIGN, INCLUDING THE ONES NO BRAND OWNS.
   *
   * clientList deliberately excludes the Drafts space, and until now nothing here listed campaigns
   * at all — get_brand named a brand's own, and that was the whole surface. So a campaign created as
   * a brand-less canvas, which is what the app's own New Canvas makes, could not be found from the
   * connector by any route except already knowing its name.
   *
   * That is not a cosmetic gap. Asked about a file called "ABM FW 2026", a session called
   * list_clients, did not see it among the brands, and concluded the connector and the app were
   * talking to two different databases — then offered to rebuild the work somewhere else. The
   * campaign was there the whole time, in Drafts, with its eight assets. A tool list with no way to
   * ask "what campaigns are there" makes absence of evidence look like evidence of absence.
   */
  async listCampaigns(a) {
    const st = useTrafficStore.getState()
    const brand = str(a.brand).trim()
    const live = liveCampaignNames(st.rows, st.campaignList)
    const counted = new Map<string, number>()
    for (const r of st.rows) {
      if (r.archivedAt) continue
      const c = (r.campaign ?? '').trim()
      if (c) counted.set(c, (counted.get(c) ?? 0) + 1)
    }
    /**
     * BOTH WAYS A CAMPAIGN EXISTS, because a listing built from only one of them is the bug again.
     *
     * The register is one way. The other is a live asset simply carrying the name — ingested assets
     * arrive that way before anything registers them, and liveCampaignNames exists precisely because
     * the Campaigns page counts those too. A tool that read campaignList alone would answer "no such
     * campaign" about a campaign with eight assets in it, which is the failure that sent a session
     * off to rebuild work that was already there.
     */
    const byName = new Map<
      string,
      { name: string; brand: string; registered: boolean; strategy: string; subject: string; parent: string }
    >()
    for (const c of st.campaignList) {
      if (c.archivedAt) continue
      byName.set(c.name, {
        name: c.name,
        brand: (c.client ?? '').trim() || DRAFTS_SPACE,
        registered: true,
        strategy: c.strategy ?? '',
        subject: c.subject ?? '',
        parent: c.parent ?? '',
      })
    }
    for (const name of live) {
      if (byName.has(name)) continue
      // Nothing registers it, so the only brand available is whatever the campaign→client map says,
      // and that map answers "Unassigned" when it has never heard of the campaign either.
      byName.set(name, { name, brand: clientForCampaign(name), registered: false, strategy: '', subject: '', parent: '' })
    }
    const campaigns = [...byName.values()]
      .filter((c) => !brand || c.brand.toLowerCase() === brand.toLowerCase())
      .map((c) => ({
        ...c,
        // Drafts and Unassigned are both real answers to "whose is it" — one deliberate, one a gap.
        unowned: c.brand === DRAFTS_SPACE || c.brand === UNASSIGNED,
        assets: counted.get(c.name) ?? 0,
        started: live.has(c.name),
      }))
    const unowned = campaigns.filter((c) => c.unowned)
    const unregistered = campaigns.filter((c) => !c.registered)
    return {
      total: campaigns.length,
      campaigns,
      note:
        `${campaigns.length} campaign(s).` +
        (unowned.length
          ? ` ${unowned.length} belong to no brand (${DRAFTS_SPACE} or ${UNASSIGNED}), so list_clients does not and cannot show them.`
          : '') +
        (unregistered.length
          ? ` ${unregistered.length} exist only as the name their assets carry — nothing registered them, which is why their brand may read ${UNASSIGNED}.`
          : ''),
    }
  },

  async addClient(a) {
    const name = str(a.name).trim()
    if (!name) throw new Error('name is required')
    useTrafficStore.getState().addClient(name)
    return { added: name, clients: useTrafficStore.getState().clientList }
  },

  async setupClient(a) {
    const url = str(a.url).trim()
    if (!url) throw new Error('url is required')
    const store = useTrafficStore.getState()
    const setup = await store.generateSetup({ url, notes: str(a.notes) || undefined })
    await useTrafficStore.getState().provisionWorkspace(setup)
    return {
      client: setup.brand.name,
      website: setup.brand.website,
      industry: setup.brand.industry,
      voice: setup.brand.voice,
      businessModel: setup.businessModel ?? null,
      icp: setup.icp?.name,
      channels: setup.channelMix,
      // The inferred GTM motion, with its reasoning — visible at setup, stored on
      // the brand, pre-selected for generation, overridable via set_strategy.
      recommendedStrategy: setup.strategy,
      secondaryStrategy: setup.secondaryStrategy ?? null,
      strategyRationale: setup.strategyRationale ?? null,
      strategyConfidence: setup.strategyConfidence ?? null,
      signalsUsed: setup.signalsUsed ?? [],
      campaign: setup.campaign?.name,
      proofPoints: setup.rtbs?.length ?? 0,
    }
  },

  async mapClient(a) {
    const url = str(a.url).trim()
    if (!url) throw new Error('url is required')
    const map = await mapSite({ url, notes: str(a.notes) || undefined })
    await useTrafficStore.getState().provisionCurrentState(map)
    return {
      client: map.brand.name,
      audiences: map.audiences.map((x) => x.name),
      proofPoints: map.proofPoints.length,
      messages: map.messages.length,
      channels: [...new Set(map.messages.map((m) => m.channel))],
    }
  },

  async runCoherenceCheck(a) {
    const client = str(a.client).trim()
    const campaign = str(a.campaign).trim()
    const store = useTrafficStore.getState()
    if (client) store.setClientFilter(client)
    store.setCampaignFilter(campaign || 'all')
    await useTrafficStore.getState().runCoherenceCheck()
    const st = useTrafficStore.getState()
    const breaks = st.claudeBreaks ?? []
    // The deterministic, FIXABLE breaks (with stable ids + suggested fixes) for the
    // assets in scope — these are what apply_fix resolves. assetName resolves the row.
    const inScope = new Set(
      st.rows
        .filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter: st.clientFilter, campaignFilter: st.campaignFilter }))
        .map((r) => r.assetName),
    )
    // Fixable = the proof/cta/journey detectors PLUS structural breaks whose fix is a
    // real rewrite (e.g. casing). Structural breaks with after === before (duplicate,
    // claim, endorsement) are NOT one-click fixable — they need edit / reject / delete.
    const fromDetect = detectBreaks(st.rows).filter((b) => inScope.has(b.from.assetName))
    const fromStructural = (st.claudeBreaks ?? []).filter((b) => b.suggestedFix && b.suggestedFix.after && b.suggestedFix.after !== b.suggestedFix.before)
    const seen = new Set<string>()
    const fixable = [...fromDetect, ...fromStructural]
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
      .map((b) => ({
        id: b.id,
        axis: b.axis,
        severity: b.severity,
        headline: b.headline,
        asset: b.from.assetName,
        field: b.suggestedFix.field,
        fix: { before: b.suggestedFix.before, after: b.suggestedFix.after, attachRtb: b.suggestedFix.attachRtb ?? null },
      }))
    return {
      client: st.clientFilter,
      campaign: campaign || 'All campaigns',
      live: st.coherenceLive,
      breakCount: breaks.length,
      // The full check result (incl. compliance/structural breaks — remediated by editing,
      // rejecting, or deleting the asset).
      breaks: breaks.map((b) => ({ axis: b.axis, severity: b.severity, headline: b.headline })),
      // The mechanically fixable subset — call apply_fix(breakId) on each.
      fixable,
    }
  },

  // ---- Set up a brand from your Claude ----

  // 1) Populate the brand's About info (profile).
  async setBrandInfo(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    const patch: Record<string, unknown> = {}
    for (const k of ['oneLiner', 'website', 'industry', 'mission', 'voice', 'founded', 'headquarters', 'traction']) {
      const v = str(a[k]).trim()
      if (v) patch[k] = v
    }
    for (const k of ['products', 'differentiators', 'values', 'locations']) {
      const l = list(a[k])
      if (l.length) patch[k] = l
    }
    // A strategy passed here is resolved to a valid motion key and overrides the
    // inferred one (same effect as set_strategy). Unknown values are a hard error.
    const stratIn = str(a.strategy).trim()
    if (stratIn) {
      const resolved = resolveStrategyKey(stratIn)
      if (!resolved) throw new Error(`unknown strategy "${stratIn}". Valid keys: ${GTM_STRATEGIES.map((s) => s.key).join(', ')}`)
      patch.strategy = resolved
    }
    store.setClientProfile(brand, patch)
    // Mirror into the Records › Brand sheet (brandRecords), which the Brand page reads —
    // otherwise the profile is set but the brand page renders empty. Map the About fields
    // onto the comms-strategy record; only write fields we actually have.
    const br: Record<string, unknown> = {}
    const oneLiner = str(a.oneLiner).trim()
    const mission = str(a.mission).trim()
    const industry = str(a.industry).trim()
    const website = str(a.website).trim()
    const diffs = list(a.differentiators)
    if (oneLiner) { br.descriptor = oneLiner; br.positioning = oneLiner; br.keyMessage = oneLiner }
    if (mission) br.businessObjective = mission
    // Brand voice is set on ClientProfile.voice above (the canonical home); no longer mirrored to the
    // dead brandRecord.toneOfVoice field (removed from the Brand sheet as part of voice consolidation).
    if (industry) br.industry = industry
    if (website) br.website = website
    if (diffs.length) { br.differentiators = diffs; br.differentiator = diffs.join('\n') }
    if (Object.keys(br).length) {
      br.status = 'active'
      const stB = useTrafficStore.getState()
      const existing = stB.brandRecords.find((b) => b.name.trim().toLowerCase() === brand.toLowerCase())
      if (existing) stB.updateBrandRecord(existing.id, br)
      else stB.addBrandRecord({ name: brand, ...br })
    }
    return { brand, set: Object.keys(patch) }
  },

  // Read the brand's active GTM motion + the reasoning behind it.
  async getStrategy(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const p = useTrafficStore.getState().clientProfiles[brand] ?? {}
    const strat = p.strategy ? GTM_STRATEGIES.find((s) => s.key === p.strategy) : undefined
    return {
      brand,
      strategy: p.strategy ?? null,
      strategyName: strat?.name ?? null,
      secondaryStrategy: p.secondaryStrategy ?? null,
      rationale: p.strategyRationale ?? null,
      confidence: p.strategyConfidence ?? null,
      signalsUsed: p.strategySignals ?? [],
      businessModel: p.businessModel ?? null,
    }
  },

  // Override the brand's GTM motion. Persists and is honored by generate_assets.
  async setStrategy(a) {
    const brand = str(a.brand).trim()
    const input = str(a.strategy).trim()
    if (!brand || !input) throw new Error('brand and strategy are required')
    const key = resolveStrategyKey(input)
    if (!key) throw new Error(`unknown strategy "${input}". Valid keys: ${GTM_STRATEGIES.map((s) => s.key).join(', ')}`)
    const strat = GTM_STRATEGIES.find((s) => s.key === key)!
    const store = useTrafficStore.getState()
    store.addClient(brand)
    // A manual override replaces the inferred motion, so refresh businessModel to the
    // new motion's model (don't leave "B2B / SMB" after a flip to plg) and clear the
    // stale inferred signals. secondaryStrategy is set only if a fresh one is provided.
    const patch: Record<string, unknown> = {
      strategy: strat.key,
      strategyConfidence: 'high',
      strategyRationale: str(a.rationale).trim() || 'Set manually.',
      secondaryStrategy: resolveStrategyKey(str(a.secondaryStrategy)) || undefined,
      businessModel: BUSINESS_MODEL_BY_MOTION[strat.key] ?? undefined,
      strategySignals: undefined,
    }
    store.setClientProfile(brand, patch)
    return { brand, strategy: strat.key, strategyName: strat.name }
  },

  // 2) Pull a brand's LIVE assets/messaging from its site + ads (alias of mapClient).
  async pullLiveAssets(a) {
    return handlers.mapClient(a)
  },

  // 3) Write the messaging components into the brand's messaging system.
  async addAudience(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    const aud = newAudience({
      name,
      role: str(a.role),
      messageAngle: str(a.angle),
      pains: list(a.pains),
      descriptors: list(a.voice).map((label) => newDescriptor({ label })),
      approved: false,
    })
    store.addLibraryItem('audiences', aud)
    // Mirror into clientAudiences[brand] — the store the Records › Segments table reads
    // (Segments IS the brand's audiences, surfaced as records). Dedup by name.
    const cur = useTrafficStore.getState().clientAudiences[brand] ?? []
    if (!cur.some((x) => (x.name ?? '').trim().toLowerCase() === name.toLowerCase())) {
      useTrafficStore.getState().setClientAudiences(brand, [...cur, { ...aud }])
    }
    return { brand, addedAudience: name }
  },

  async addProofPoint(a) {
    const brand = str(a.brand).trim()
    const claim = str(a.claim).trim()
    if (!brand || !claim) throw new Error('brand and claim are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem('rtbs', {
      id: `lrtb_${Date.now().toString(36)}`,
      label: claim,
      detail: str(a.evidence),
      metric: str(a.metric) || undefined,
      source: str(a.source) || undefined,
      approved: false,
    })
    return { brand, addedProof: claim }
  },

  async addSubject(a) {
    const brand = str(a.brand).trim()
    const text = str(a.text).trim()
    if (!brand || !text) throw new Error('brand and text are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem('subjects', {
      id: `subj_${Date.now().toString(36)}`,
      text,
      angle: str(a.angle) || undefined,
      outcome: str(a.outcome) || undefined,
      approved: false,
    })
    // Mirror into the new Records › Messages store so the Messages table renders it.
    const stMsg = useTrafficStore.getState()
    if (!stMsg.messages.some((m) => m.name.trim().toLowerCase() === text.toLowerCase())) {
      stMsg.addMessage({
        brand,
        name: text,
        angle: str(a.angle) || undefined,
        notes: str(a.outcome) || undefined,
        status: 'draft',
      })
    }
    return { brand, addedSubject: text }
  },

  async addHook(a) {
    const brand = str(a.brand).trim()
    const text = str(a.text).trim()
    if (!brand || !text) throw new Error('brand and text are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem('hooks', {
      id: `hook_${Date.now().toString(36)}`,
      text,
      kind: str(a.kind) || 'Pain',
      note: str(a.note) || undefined,
      approved: false,
    })
    // Mirror into the new Records › Messages store so the Messages table renders it.
    const stMsg = useTrafficStore.getState()
    if (!stMsg.messages.some((m) => m.name.trim().toLowerCase() === text.toLowerCase())) {
      stMsg.addMessage({
        brand,
        name: text,
        angle: str(a.kind) || undefined,
        notes: str(a.note) || undefined,
        status: 'draft',
      })
    }
    return { brand, addedHook: text }
  },

  // Clear a brand's authored messaging (CTAs, proof, audiences, subjects, hooks) so
  // a polluted system can be rebuilt clean. Keeps the standard GTM strategies.
  async resetBrandMessaging(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    useTrafficStore.getState().resetBrandMessaging(brand)
    return { brand, reset: true }
  },

  async addCta(a) {
    const brand = str(a.brand).trim()
    const label = str(a.label).trim()
    if (!brand || !label) throw new Error('brand and label are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    store.setMessagingBrand(brand)
    store.addLibraryItem(
      'ctas',
      newLibraryCta({
        // No stage default: an untagged CTA is usable at ANY stage (helps distribution).
        // Defaulting to 'awareness' wrongly clustered untagged CTAs on one stage.
        label,
        stage: str(a.stage) || undefined,
        destination: str(a.destination) || undefined,
        outcome: str(a.outcome) || undefined,
        approved: false,
      }),
    )
    return { brand, addedCta: label }
  },

  async newCampaign(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    // Always land on a real GTM strategy — resolve an explicit arg (key / name /
    // alias; unknown is a hard error), else the brand's stored motion, else
    // demand-gen. Never the "Current state" placeholder, which reads as "no strategy".
    const rawStrategy = str(a.strategy).trim()
    let key: string
    if (rawStrategy) {
      const resolved = resolveStrategyKey(rawStrategy)
      if (!resolved) {
        throw new Error(`unknown strategy "${rawStrategy}". Valid keys: ${GTM_STRATEGIES.map((s) => s.key).join(', ')}`)
      }
      key = resolved
    } else {
      const stored = store.clientProfiles[brand]?.strategy
      key = (stored && resolveStrategyKey(stored)) || 'demand-gen'
    }
    const strat = GTM_STRATEGIES.find((s) => s.key === key)
    store.addCampaign({ name, client: brand, strategy: strat?.name ?? 'Demand Gen Funnel' })
    return { brand, campaign: name, strategy: strat?.name }
  },

  // 4) Generate draft assets for a campaign from everything connected (strategy
  //    deliverables seeded, then copy drafted from the brand's profile/audiences/proof).
  async generateAssets(a) {
    const brand = str(a.brand).trim()
    const campaign = str(a.campaign).trim()
    if (!brand || !campaign) throw new Error('brand and campaign are required')
    const store = useTrafficStore.getState()
    store.addClient(brand)
    // Strategy precedence: an EXPLICIT arg is resolved (key / name / alias) and, if
    // unrecognized, is a hard error — never a silent fall back to demand-gen. With no
    // arg, use the brand's stored (inferred/overridden) motion, then demand-gen.
    const rawStrategy = str(a.strategy).trim()
    let key: string
    if (rawStrategy) {
      const resolved = resolveStrategyKey(rawStrategy)
      if (!resolved) {
        throw new Error(
          `unknown strategy "${rawStrategy}". Valid keys: ${GTM_STRATEGIES.map((s) => s.key).join(', ')}`,
        )
      }
      key = resolved
    } else {
      const stored = store.clientProfiles[brand]?.strategy
      key = (stored && resolveStrategyKey(stored)) || 'demand-gen'
    }
    const strat = GTM_STRATEGIES.find((s) => s.key === key)
    const countFor = () => useTrafficStore.getState().rows.filter((r) => (r.campaign ?? '').trim() === campaign).length
    const before = countFor()
    if (before === 0 && !store.campaignList.some((c) => c.name === campaign)) {
      store.addCampaign({ name: campaign, client: brand, strategy: strat?.name ?? 'Demand Gen' })
    }
    const deliverables = STRATEGY_ASSETS[key] ?? STRATEGY_ASSETS['demand-gen']
    // Spread the brand's audiences across the seeded assets so each is written for
    // a specific segment. An optional `audiences` arg scopes the campaign to a
    // subset (e.g. a Captains-only campaign); omit it to span all of the brand's.
    const allAudiences = (useTrafficStore.getState().brandSystems[brand]?.audiences ?? []).map((x) => x.name)
    const wanted = list(a.audiences)
    const matched = wanted.length ? allAudiences.filter((n) => wanted.some((w) => w.toLowerCase() === n.toLowerCase())) : []
    const audiences = wanted.length ? (matched.length ? matched : wanted) : allAudiences
    await useTrafficStore.getState().seedCampaignAssets(campaign, deliverables, { audiences })
    // Scope to the campaign, then draft copy from the connected brand model.
    useTrafficStore.getState().setClientFilter(brand)
    useTrafficStore.getState().setCampaignFilter(campaign)
    await useTrafficStore.getState().draftCopy()
    // ABM: when accounts (or a target list) are given, fan the seeded set into per-account
    // 1:1 variants — each carries account lineage and reads to the account's real situation.
    const accountNames = list(a.accounts)
    let accountVariants = 0
    if (accountNames.length) {
      // Ensure a target list exists + is attached, so the account dimension resolves.
      const stp = useTrafficStore.getState()
      const existing = new Map((stp.accountsByBrand[brand] ?? []).map((x) => [x.name.toLowerCase(), x]))
      const ids = accountNames.map((n) => existing.get(n.toLowerCase())?.id ?? useTrafficStore.getState().addAccount(brand, { name: n }).id)
      if (!stp.campaignTargetList[campaign]) {
        const tl = useTrafficStore.getState().createTargetList(brand, `${campaign} targets`, ids)
        useTrafficStore.getState().attachTargetList(campaign, tl.id)
      }
      const res = await useTrafficStore.getState().fanOut(campaign, 'account', accountNames, { generate: true })
      accountVariants = res.variantCount
    }
    const after = countFor()
    // The bulk path is where the most work goes missing at once — a seeded motion is the biggest
    // single write the connector makes, and so the first one that will not fit. Read the rows back
    // out of storage rather than counting what is in memory, which is what `after` counts.
    assertRowsLanded(
      useTrafficStore
        .getState()
        .rows.filter((r) => (r.campaign ?? '').trim() === campaign)
        .map((r) => r.id),
    )
    // Echo the applied strategy KEY (so result.strategy === the requested key) plus
    // its display name and the deliverable count, which differs by motion.
    return {
      brand,
      campaign,
      strategy: key,
      strategyName: strat?.name ?? 'Demand Gen',
      audiences,
      accounts: accountNames,
      accountVariants,
      deliverableSet: deliverables.length,
      assetsGenerated: Math.max(0, after - before),
      totalAssets: after,
    }
  },

  // Read back / query a brand's assets, filtered server-side so only matches return
  // (small payloads). Filters: source, campaign, channel[], audience[], stage[], status[],
  // publishedAfter/Before, plus sort + limit/cursor paging.
  async listAssets(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const { assets, total, nextCursor } = resolveBrandAssets(brand, buildFilter(a), {
      sort: str(a.sort).trim() || undefined,
      limit: Number(a.limit) || 0,
      cursor: Number(a.cursor) || 0,
    })
    return { brand, campaign: str(a.campaign).trim() || null, count: assets.length, total, nextCursor, assets }
  },

  // ---- Saved Views (smart canvases): named, re-resolving filtered boards of assets ----
  async createCanvas(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const layoutRaw = str(a.layout).trim()
    const groupRaw = str(a.groupBy).trim()
    const view = useTrafficStore.getState().createSavedView(brand, name, {
      // Normalize through buildFilter so a relative `window` ("last week"/"30d"/"quarter")
      // or `withinDays` is stored as withinDays and stays relative.
      filter: buildFilter((a.filter && typeof a.filter === 'object' ? a.filter : a) as Args),
      layout: (['board', 'calendar', 'grid', 'list'].includes(layoutRaw) ? layoutRaw : undefined) as never,
      groupBy: (['date', 'channel', 'audience', 'stage', 'none'].includes(groupRaw) ? groupRaw : undefined) as never,
      sort: str(a.sort).trim() || undefined,
    })
    return { id: view.id, brand, name: view.name, layout: view.layout, groupBy: view.groupBy, filter: view.filter }
  },

  // Open a canvas: re-resolve its filter NOW (live) and return the matched assets,
  // grouped + sorted per its config. New assets in-window appear; aged-out ones drop.
  async getCanvas(a) {
    const id = str(a.id).trim()
    if (!id) throw new Error('id is required')
    const view = useTrafficStore.getState().savedViews.find((v) => v.id === id)
    if (!view) throw new Error(`canvas not found: ${id}`)
    const { assets, total, nextCursor } = resolveBrandAssets(view.brand, view.filter, {
      sort: view.sort ?? 'newest',
      limit: Number(a.limit) || 0,
      cursor: Number(a.cursor) || 0,
    })
    // Group per the view config (board/calendar group; list/grid are flat).
    const gb = view.groupBy as ViewGroupBy
    const st = useTrafficStore.getState()
    const byId = new Map(st.rows.map((r) => [r.id, r]))
    let groups: { key: string; count: number; assetIds: string[] }[] | null = null
    if (gb && gb !== 'none') {
      const m = new Map<string, string[]>()
      for (const asset of assets) {
        const row = byId.get(asset.id)
        const k = row ? groupKeyFor(row, gb) : 'all'
        ;(m.get(k) ?? m.set(k, []).get(k)!).push(asset.id)
      }
      groups = [...m.entries()].map(([key, ids]) => ({ key, count: ids.length, assetIds: ids }))
      // Date groups newest-first; others alphabetical.
      groups.sort((x, y) => (gb === 'date' ? y.key.localeCompare(x.key) : x.key.localeCompare(y.key)))
    }
    return { id: view.id, brand: view.brand, name: view.name, layout: view.layout, groupBy: view.groupBy, sort: view.sort, filter: view.filter, count: assets.length, total, nextCursor, groups, assets }
  },

  async listCanvases(a) {
    const brand = str(a.brand).trim()
    const views = useTrafficStore.getState().savedViews.filter((v) => !brand || v.brand === brand)
    return {
      brand: brand || null,
      canvases: views.map((v) => ({ id: v.id, brand: v.brand, name: v.name, layout: v.layout, groupBy: v.groupBy, sort: v.sort, filter: v.filter })),
    }
  },

  async updateCanvas(a) {
    const id = str(a.id).trim()
    if (!id) throw new Error('id is required')
    const st = useTrafficStore.getState()
    if (!st.savedViews.some((v) => v.id === id)) throw new Error(`canvas not found: ${id}`)
    const patch: Record<string, unknown> = {}
    if (str(a.name).trim()) patch.name = str(a.name).trim()
    if (a.filter && typeof a.filter === 'object') patch.filter = buildFilter(a.filter as Args)
    const layoutRaw = str(a.layout).trim()
    if (['board', 'calendar', 'grid', 'list'].includes(layoutRaw)) patch.layout = layoutRaw
    const groupRaw = str(a.groupBy).trim()
    if (['date', 'channel', 'audience', 'stage', 'none'].includes(groupRaw)) patch.groupBy = groupRaw
    if (str(a.sort).trim()) patch.sort = str(a.sort).trim()
    st.updateSavedView(id, patch)
    return { id, updated: Object.keys(patch) }
  },

  async deleteCanvas(a) {
    const id = str(a.id).trim()
    if (!id) throw new Error('id is required')
    useTrafficStore.getState().deleteSavedView(id)
    return { id, deleted: true }
  },

  // ---- Asset lifecycle: edit / author / approve / delete ----

  // Edit an asset's copy / targeting. Editing changes the content, so the cached
  // coherence status invalidates (the next run reflects the edit).
  async editAsset(a) {
    const id = (str(a.assetId).trim() || str(a.id).trim())
    if (!id) throw new Error('assetId is required')
    const st = useTrafficStore.getState()
    const row = st.rows.find((r) => r.id === id)
    if (!row) throw new Error(`asset not found: ${id}`)
    const brand = clientForCampaign(row.campaign)
    const channel = channelArg(a.channel, row.channel)
    const assetType = str(a.assetType).trim() || row.assetType || ''
    const patch: Partial<TrafficRow> = {}
    if (str(a.channel).trim()) patch.channel = channel
    if (str(a.assetType).trim()) patch.assetType = assetType
    if (typeof a.audience === 'string') patch.audience = str(a.audience).trim()
    if (str(a.format).trim()) patch.format = str(a.format).trim()
    const stage = str(a.stage).trim().toLowerCase()
    if (['awareness', 'consideration', 'conversion', 'retention'].includes(stage)) patch.funnelStage = stage as never
    // A write is any alias OR the key-addressed `fields` map — the map is the only way to reach a
    // component no alias names (a website's subhead, proof-stat, FAQ and footer CTA among them).
    const mediaType = mediaArg(a.mediaType, row.mediaType)
    if (str(a.mediaType).trim()) patch.mediaType = mediaType
    let applied: ReturnType<typeof applyCopyFields> | null = null
    if (COPY_ARGS.some((k) => typeof a[k] === 'string') || isFieldMap(a.fields)) {
      applied = applyCopyFields(channel, assetType, row.messaging ?? {}, a, mediaType)
      patch.messaging = applied.messaging
      if (applied.inCreativeCopy !== undefined) patch.extractedCopy = applied.inCreativeCopy
    }
    const proofPoints = list(a.proofPoints)
    if (proofPoints.length) {
      const ids = resolveProofIds(brand, proofPoints)
      const pk = messagingKeys(channel, assetType).primaryText ?? 'primary'
      patch.rtbMap = { ...(row.rtbMap ?? {}), [pk]: ids }
    }
    await useTrafficStore.getState().updateRow(id, patch)
    const after = useTrafficStore.getState().rows.find((r) => r.id === id)
    return {
      id,
      updated: Object.keys(patch),
      ...copyReport(channel, assetType, after?.messaging ?? patch.messaging ?? row.messaging, applied, after ?? row),
      note: 'Re-run run_coherence_check to see the edit reflected.',
    }
  },

  /**
   * CONNECT TWO ASSETS — the line that says this one leads to that one.
   *
   * The journey was reviewable from here and not buildable. runCampaignReview reports a CTA pointed
   * at nothing and a handoff no button covers, and both are computed off `linksTo` and `branchOf` —
   * neither of which anything outside the app could set, and `linksTo` was not even readable. So a
   * campaign assembled over the connector came out a pile of assets that led nowhere, every one of
   * them individually fine, and the review's advice about it could not be acted on.
   *
   * `next` is the single explicit destination — a post naming the page it drives to, which
   * handoffsFrom treats as the clearest statement of intent there is. `branch` is for the second and
   * third destination off the same asset: that is the tree branchOf models and the one linksTo
   * cannot, because it holds one name.
   *
   * Rewiring an existing destination is an ERROR rather than a silent replacement. A journey changed
   * by accident reads exactly like one changed on purpose, and the asset that used to be next does
   * not complain about being dropped.
   */
  async linkAssets(a) {
    const rows = useTrafficStore.getState().rows.filter((r) => !r.archivedAt)
    const from = resolveAsset(rows, str(a.from))
    const to = resolveAsset(rows, str(a.to))
    if (from.id === to.id) throw new Error('An asset cannot lead to itself.')
    const fromCampaign = (from.campaign ?? '').trim()
    const toCampaign = (to.campaign ?? '').trim()
    if (fromCampaign !== toCampaign) {
      throw new Error(
        `"${from.assetName}" is in "${fromCampaign}" and "${to.assetName}" is in "${toCampaign}". A journey link cannot cross campaigns — the review reads a target outside the campaign as a CTA pointed at nothing.`,
      )
    }
    const mode = str(a.as).trim().toLowerCase() || 'next'
    if (mode !== 'next' && mode !== 'branch') throw new Error(`as must be "next" or "branch", not "${mode}".`)
    const same = (x: string | undefined, y: string | undefined) => (x ?? '').trim().toLowerCase() === (y ?? '').trim().toLowerCase()
    if (mode === 'next') {
      const current = (from.linksTo ?? '').trim()
      if (current && !same(current, to.assetName)) {
        throw new Error(
          `"${from.assetName}" already leads to "${current}". Pass as: "branch" to add "${to.assetName}" alongside it, or unlink_assets first to replace it.`,
        )
      }
      await useTrafficStore.getState().updateRow(from.id, { linksTo: to.assetName })
    } else {
      const parent = (to.branchOf ?? '').trim()
      if (parent && !same(parent, from.assetName)) {
        throw new Error(`"${to.assetName}" already branches off "${parent}". Unlink that first.`)
      }
      await useTrafficStore.getState().updateRow(to.id, { branchOf: from.assetName })
    }
    // What the line costs. A handoff is a promise that somebody builds a control at this end of it,
    // and naming it here is the difference between a journey that is drawn and one that works.
    const owed = ctaForHandoff(to)
    return {
      from: from.assetName,
      to: to.assetName,
      as: mode,
      owes: owed,
      note:
        `"${from.assetName}" now leads to "${to.assetName}". That line owes a ${owed.kind} on "${from.assetName}" ` +
        `("${owed.label}"): ${owed.note} review_campaign reports it as an uncovered handoff until it exists.`,
    }
  },

  /** Take a link back out. Clears the destination, the branch, or both, depending on what is there. */
  async unlinkAssets(a) {
    const rows = useTrafficStore.getState().rows.filter((r) => !r.archivedAt)
    const from = resolveAsset(rows, str(a.from))
    const toRef = str(a.to).trim()
    const to = toRef ? resolveAsset(rows, toRef) : null
    const same = (x: string | undefined, y: string | undefined) => (x ?? '').trim().toLowerCase() === (y ?? '').trim().toLowerCase()
    const cleared: string[] = []
    if ((from.linksTo ?? '').trim() && (!to || same(from.linksTo, to.assetName))) {
      cleared.push(`${from.assetName} → ${from.linksTo}`)
      await useTrafficStore.getState().updateRow(from.id, { linksTo: undefined })
    }
    if (to && same(to.branchOf, from.assetName)) {
      cleared.push(`${from.assetName} → ${to.assetName} (branch)`)
      await useTrafficStore.getState().updateRow(to.id, { branchOf: undefined })
    }
    if (!cleared.length) {
      throw new Error(
        to
          ? `"${from.assetName}" does not lead to "${to.assetName}".`
          : `"${from.assetName}" does not lead anywhere. Its branches, if any, are cleared by naming the branch as \`to\`.`,
      )
    }
    return { cleared, note: `${cleared.length} link(s) removed.` }
  },

  // Apply a coherence check's suggested fix to the flagged asset (the repair payoff).
  // Handles both break systems: the proof/cta/journey detectors (via applyBreakFix) and
  // the structural detectors (casing/leak) whose fix is a real rewrite. Breaks with no
  // mechanical fix (duplicate, claim, endorsement) are remediated by edit / reject / delete.
  async applyFix(a) {
    const breakId = str(a.breakId).trim() || str(a.id).trim()
    if (!breakId) throw new Error('breakId is required')
    const snapshot = () => JSON.stringify(useTrafficStore.getState().rows.map((r) => [r.id, r.messaging, r.rtbMap]))
    const before = snapshot()
    await useTrafficStore.getState().applyBreakFix(breakId)
    if (snapshot() !== before) return { breakId, applied: true, via: 'suggested-fix' }
    // Fall back to the structural break set (the coherence check's own breaks).
    const brk = (useTrafficStore.getState().claudeBreaks ?? []).find((b) => b.id === breakId)
    const fix = brk?.suggestedFix
    if (fix && fix.after && fix.after !== fix.before) {
      const row = useTrafficStore.getState().rows.find((r) => r.assetName === fix.assetName && r.channel === fix.channel)
      if (row) {
        const patch: Partial<TrafficRow> = { messaging: { ...row.messaging, [fix.field]: fix.after } }
        if (fix.attachRtb) patch.rtbMap = { ...(row.rtbMap ?? {}), [fix.field]: [fix.attachRtb] }
        await useTrafficStore.getState().updateRow(row.id, patch)
        return { breakId, applied: true, via: 'structural' }
      }
    }
    return { breakId, applied: false, note: 'No mechanical fix for this break (e.g. a duplicate or an unsubstantiated claim). Edit the asset, reject it, or delete it.' }
  },

  // Reassign an asset's proof to the one the check suggests (the proof-gap fix).
  async reassignProof(a) {
    const breakId = str(a.breakId).trim() || str(a.id).trim()
    if (!breakId) throw new Error('breakId is required')
    await useTrafficStore.getState().reassignBreakProof(breakId)
    return { breakId, reassigned: true }
  },

  // The components a card of this channel + type actually renders. The read that has to come
  // BEFORE hand-authoring: without it an agent can only guess at the keys, and every field it
  // cannot name arrives empty on a card that reads as finished.
  async getAssetFields(a) {
    const channel = channelArg(a.channel)
    const assetType = str(a.assetType).trim() || undefined
    const mediaType = mediaArg(a.mediaType)
    const fields = describeAssetFields(channel, assetType, mediaType)
    // Organic formats define no CTA component, but the card renders a CTA row regardless and reads
    // it off a generic `cta` key — so it is writable here even though it is not in the schema.
    const genericCta = fields.every((f) => !isCtaField(f.key))
    return {
      channel,
      assetType,
      mediaType,
      fields,
      keys: fields.map((f) => f.key),
      ...(genericCta ? { alsoAccepts: [GENERIC_CTA_KEY] } : {}),
      note:
        `Pass every one of these keys in add_asset/edit_asset \`fields\` to fill the card. ` +
        `A key left out renders blank.` +
        (genericCta ? ` This format folds its CTA into the copy, but the card still shows a CTA row — set \`cta\` to fill it.` : '') +
        (rendersInCreative(mediaType)
          ? ` \`${IN_CREATIVE_KEY}\` is the copy written INSIDE the artwork (overlays, voiceover, page text), not the post copy around it.`
          : ` A text asset has no creative, so it renders no in-creative row.`),
    }
  },

  /**
   * WHERE THIS WORKSPACE IS AND WHAT TO DO NEXT — the read that gives the conversation a shape.
   *
   * The connector is sixty-odd tools and no stated order, so a session starts wherever the person's
   * first sentence lands and the model fills the rest in with plausible order of its own. This
   * answers the ladder against the real workspace, so the suggestion is "this campaign's board has
   * four cards and none of them instruct the writer" rather than a generic next step.
   */
  async getNextStep(a) {
    const st = useTrafficStore.getState()
    // An explicit brand wins; otherwise the one the app is scoped to, and 'all' is not a brand.
    const brand = str(a.brand).trim() || (st.clientFilter !== 'all' ? st.clientFilter : '')
    const campaign = str(a.campaign).trim()
    const rows = campaign
      ? st.rows.filter((r) => (r.campaign ?? '').trim() === campaign && !r.archivedAt)
      : st.rows.filter((r) => (!brand || clientForCampaign(r.campaign) === brand) && !r.archivedAt)
    const board = campaign ? boardFor(st.flowBoards, campaign) : null
    const cards = board?.objects ?? []
    const asking = cards.filter((o) => !directionCoverage(o.kind, o.direction).asksNothing)
    const system = brand ? st.brandSystems[brand] : undefined
    const unfinished = rows.filter((r) => !fieldCoverage(r.channel, r.assetType, r.messaging, r).complete).length
    // Journey coverage is computed off the assets, so it is only a real answer once some exist.
    const uncovered = rows.length
      ? brandPresence(rows).journey.filter((j) => !j.covered).map((j) => ({ label: j.label, suggest: j.suggest }))
      : []
    /**
     * THE REVIEW RUNG, ANSWERED FOR THIS SCOPE — not "a check ran once, somewhere".
     *
     * The store keeps which scope its breaks were computed for and a fingerprint of the copy they
     * were computed from, and reading neither is how the ladder waves work through to approval:
     * a check run on another campaign reports THIS one as reviewed, and a check run before the
     * last edit reports its stale findings as current. Both end the same way — "reviewed, nothing
     * outstanding" about a campaign nobody has read. The scope must match exactly; a brand-wide
     * run counts findings from every other campaign, so it is not an answer about this one.
     */
    const reviewedHere = !!st.coherenceLive && st.claudeBreaksScope === breakScopeKey(brand, campaign || 'all')
    const reviewStale = reviewedHere && !!st.coherenceCheckedHash && st.coherenceCheckedHash !== coherenceContentHash(rows)
    const profile = st.clientProfiles?.[brand]
    const step = nextStep({
      brands: st.clientList ?? [],
      brand: brand || undefined,
      audiences: system?.audiences?.length ?? 0,
      proofPoints: system?.rtbs?.length ?? 0,
      strategy: profile?.strategy,
      // setStrategy clears the inferred signals when a person answers, so a motion still carrying
      // them is one setup guessed and nobody has confirmed.
      strategyInferred: (profile?.strategySignals?.length ?? 0) > 0,
      campaign: campaign || undefined,
      campaignExists: !!campaign && st.campaignList.some((c) => c.name === campaign),
      campaignCount: st.campaignList.filter((c) => !brand || c.client === brand).length,
      cardsAskingDirection: asking.length,
      cardsWithDirection: asking.filter((o) => directionCoverage(o.kind, o.direction).filled.length > 0).length,
      assetCount: rows.length,
      unfinishedAssets: unfinished,
      approvedAssets: rows.filter((r) => r.status === 'approved').length,
      uncoveredStages: uncovered,
      reviewRun: reviewedHere,
      reviewFindings: reviewedHere ? (st.claudeBreaks ?? []).length : 0,
      reviewStale,
    })
    return { brand, campaign, ...step }
  },

  /**
   * ONE READ OF A WHOLE CAMPAIGN: its copy, its completeness and its wiring, ranked, each finding
   * carrying the call that fixes it.
   *
   * run_coherence_check reads the COPY and is the sharper instrument for it — a claim with no
   * proof, a weak CTA, two assets saying the same thing. What it cannot see is whether the campaign
   * is finished: an asset with six of its nine components blank is perfectly coherent, because
   * every word it does contain is fine. This runs that check AND the completeness pass, and returns
   * them as one ordered list, because two tools reporting on the same campaign in two vocabularies
   * is how half of it goes unread.
   */
  async runCampaignReview(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    const st0 = useTrafficStore.getState()
    const rows = st0.rows.filter((r) => (r.campaign ?? '').trim() === campaign && !r.archivedAt)
    const brand = clientForCampaign(campaign)
    const board = boardFor(st0.flowBoards, campaign)
    const review = reviewCampaign({ campaign, rows, objects: board.objects })

    // The copy check, unless the caller only wants the structural pass (it calls the model, so it
    // is the slow half and worth being able to skip).
    let breaks: Suggestion[] = []
    let checked = false
    let fixable: unknown[] = []
    if (a.includeCopyCheck !== false) {
      const res = (await handlers.runCoherenceCheck({ client: brand, campaign })) as {
        breaks: { axis: string; severity: string; headline: string }[]
        fixable: { id: string; headline: string; asset: string; severity: string }[]
      }
      checked = true
      fixable = res.fixable
      const fixableByHeadline = new Map(res.fixable.map((f) => [f.headline, f]))
      breaks = res.breaks.map((b) => {
        const fix = fixableByHeadline.get(b.headline)
        return {
          kind: 'copy-break' as never,
          severity: (['high', 'medium', 'low'].includes(b.severity) ? b.severity : 'medium') as 'high' | 'medium' | 'low',
          what: b.headline,
          why: `A ${b.axis} break in the campaign's copy.`,
          where: fix?.asset ? { assetName: fix.asset } : {},
          // A break with a mechanical fix says so; the rest need a real edit, and saying "apply_fix"
          // for those would be promising a button that does nothing.
          fix: fix ? `apply_fix(breakId: "${fix.id}")` : 'Edit, reject or delete the asset — no mechanical fix for this one.',
        }
      })
    }

    const suggestions = rankSuggestions([...review.suggestions, ...breaks])
    /**
     * THE FINDINGS THAT ARE NOT THE MODEL'S TO CLOSE, pulled out of the ranked list.
     *
     * Left in among thirty findings each carrying a `fix`, a question reads as one more task, and
     * the fastest way through a task list is to do it. That is how a review of a campaign ends with
     * an invented pain on an audience card and an invented reason a CTA pointed nowhere — every
     * finding closed, the report clean, and nobody asked. Separating them makes the difference
     * structural rather than a matter of noticing.
     */
    const decisions = suggestions
      .filter((s) => s.ask)
      .map((s) => ({ ask: s.ask as string, about: s.what, where: s.where, ifAnswered: s.fix }))
    return {
      campaign,
      brand,
      assetCount: review.assetCount,
      objectCardCount: review.objectCardCount,
      copyCheckRun: checked,
      total: suggestions.length,
      decisions,
      suggestions,
      fixable,
      note: suggestions.length
        ? `${suggestions.length} finding(s), highest severity first. Each carries the call that fixes it.` +
          (decisions.length
            ? ` ${decisions.length} of them are in \`decisions\`: those are not yours to close — put each question to the person and act on the answer.`
            : '')
        : `Nothing to raise: every asset's components are filled, every card carries direction, and the copy check found no breaks.`,
    }
  },

  // ── Object cards ────────────────────────────────────────────────────────────────────────────
  // The OTHER kind of card in this app: the ones on a campaign's flow board that instruct the copy
  // writer (an Audience card carrying a pain, a Trigger carrying the ask). Gretel could put them on
  // a board from inside the app; nothing outside could, so a campaign set up over MCP arrived with
  // deliverables and no direction behind them.

  // What a card of this kind asks for. The read that comes before writing one.
  async getObjectFields(a) {
    const kind = objectKindArg(a.kind)
    const asks = describeObjectFields(kind)
    return {
      kind,
      fields: asks,
      keys: asks.map((f) => f.key),
      recordType: recordTypeFor(kind),
      note: asks.length
        ? `Pass these keys in add_object_card/edit_object_card \`fields\`. Direction is what the card ` +
          `contributes to the copy — a card with none adds a name and nothing else.`
        : `A ${kind} card asks for no direction: it contributes through the record it names. Set \`record\` or \`name\`.`,
    }
  },

  // Every object card on a campaign's board, with what each one still owes.
  async listObjectCards(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    const board = boardFor(useTrafficStore.getState().flowBoards, campaign)
    const cards = board.objects.map((o) => objectCardView(o))
    return {
      campaign,
      total: cards.length,
      cards,
      incomplete: cards.filter((c) => !c.fields.complete).map((c) => c.id),
    }
  },

  // Put a card on a campaign's board.
  async addObjectCard(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    const kind = objectKindArg(a.kind)
    const { direction, clamped } = applyDirection(kind, [], a.fields as Record<string, unknown> | undefined)
    const name = cardNameArg(a, kind)
    // Refused rather than defaulted. A board of "Untitled audience" is the state this exists to
    // prevent, and the caller is the only one who knows what this card is.
    if (!name) throw new Error("name is required (or pass description, and the name is read from its first heading)")
    const { reference } = referenceArg(a)
    const made: CanvasObject = {
      id: freshObjectId(),
      kind,
      text: str(a.note).trim(),
      name,
      ...(str(a.refId).trim() ? { refId: str(a.refId).trim() } : {}),
      ...(reference ? { reference } : {}),
      ...(direction.length ? { direction } : {}),
    }
    assertBoardsWritable()
    const board = boardFor(useTrafficStore.getState().flowBoards, campaign)
    useTrafficStore.getState().saveFlowBoard({
      ...board,
      objects: [...board.objects, made],
      // Laid out rather than stacked at the origin: a board of cards all at 0,0 is one card as far
      // as anyone looking at it is concerned.
      pos: { ...board.pos, [made.id]: nextSlot(board.pos) },
    })
    await assertBoardLanded(campaign, made.id, board)
    return {
      id: made.id,
      campaign,
      kind,
      name: made.name ?? '',
      ...objectCardReport(kind, direction, clamped, made),
    }
  },

  // Sharpen a card already on a board: its name, its note, its direction, the record it points at.
  async editObjectCard(a) {
    const id = str(a.objectId).trim() || str(a.id).trim()
    if (!id) throw new Error('objectId is required')
    const boards = useTrafficStore.getState().flowBoards
    const board = boards.find((b) => b.objects.some((o) => o.id === id))
    if (!board) throw new Error(`object card not found: ${id}`)
    const existing = board.objects.find((o) => o.id === id)!
    const { direction, clamped } = applyDirection(existing.kind, existing.direction, a.fields as Record<string, unknown> | undefined)
    const { reference } = referenceArg(a)
    const next: CanvasObject = {
      ...existing,
      ...(typeof a.name === 'string' ? { name: str(a.name).trim() } : {}),
      ...(typeof a.note === 'string' ? { text: str(a.note).trim() } : {}),
      ...(str(a.refId).trim() ? { refId: str(a.refId).trim() } : {}),
      // An empty string CLEARS the document, so a description can be taken back off a card; the
      // field being absent leaves whatever is already there.
      ...(typeof a.description === "string" ? { reference } : {}),
      ...(direction.length ? { direction } : { direction: undefined }),
    }
    assertBoardsWritable()
    useTrafficStore.getState().saveFlowBoard({
      ...board,
      objects: board.objects.map((o) => (o.id === id ? next : o)),
    })
    // The edit, not the card: compare what is in storage against what was just written.
    await assertBoardLanded(board.key, id, board, (card) => JSON.stringify(card) === JSON.stringify(next))
    return {
      id,
      campaign: board.key,
      kind: existing.kind,
      ...objectCardReport(existing.kind, direction, clamped, next),
    }
  },

  // Hand-author a first-class asset into a campaign (no generation step).
  async addAsset(a) {
    const brand = str(a.brand).trim()
    const campaign = str(a.campaign).trim()
    if (!brand || !campaign) throw new Error('brand and campaign are required')
    const channel = channelArg(a.channel)
    const assetType = str(a.assetType).trim() || undefined
    const mediaType = mediaArg(a.mediaType)
    const stage = str(a.stage).trim().toLowerCase()
    const applied = applyCopyFields(channel, assetType, {}, a, mediaType)
    const patch: Partial<TrafficRow> = {
      channel,
      // An asset addressed by `fields` need never pass `headline` — and on a format with no headline
      // component it cannot — so the name falls back to the first component that carries text
      // rather than leaving a canvas of identical "Authored asset" cards.
      assetName: str(a.assetName).trim() || str(a.headline).trim() || firstFilled(applied.messaging, channel, assetType) || 'Authored asset',
      audience: str(a.audience).trim() || undefined,
      format: str(a.format).trim() || undefined,
      mediaType,
    }
    if (applied.inCreativeCopy !== undefined) patch.extractedCopy = applied.inCreativeCopy
    if (assetType) patch.assetType = assetType
    if (['awareness', 'consideration', 'conversion', 'retention'].includes(stage)) patch.funnelStage = stage as never
    patch.messaging = applied.messaging
    const proofPoints = list(a.proofPoints)
    if (proofPoints.length) {
      const ids = resolveProofIds(brand, proofPoints)
      const pk = messagingKeys(channel, assetType).primaryText ?? 'primary'
      patch.rtbMap = { [pk]: ids }
    }
    // Provenance: a hand-written asset is 'authored'; an imported one passes source/url/media.
    const src = str(a.source).trim()
    if (['authored', 'imported', 'social-live', 'site'].includes(src)) patch.source = src as never
    if (str(a.sourceUrl).trim()) patch.sourceUrl = str(a.sourceUrl).trim()
    const mediaRefs = list(a.mediaRefs)
    if (mediaRefs.length) {
      patch.mediaRefs = mediaRefs
      patch.mediaRef = mediaRefs[0]
    }
    const row = await useTrafficStore.getState().addAsset(brand, campaign, patch)
    assertRowsLanded([row.id])
    return {
      id: row.id,
      assetName: row.assetName,
      brand,
      campaign,
      source: row.source,
      status: row.status,
      ...copyReport(channel, assetType, row.messaging, applied, row),
    }
  },

  // Bulk-import real content into a canvas as first-class assets (Buffer posts, scraped
  // site/case studies, a pasted audit). Each item is mapped to a row; re-import dedups.
  async importAssets(a) {
    const brand = str(a.brand).trim()
    const campaign = str(a.campaign).trim()
    const sourceRaw = str(a.source).trim()
    const sources = ['authored', 'imported', 'social-live', 'site', 'buffer', 'site-map']
    if (!brand || !campaign) throw new Error('brand and campaign are required')
    if (!sources.includes(sourceRaw)) throw new Error(`source must be one of: social-live (buffer), site, imported`)
    // Aliases: buffer -> social-live, site-map -> site.
    const source = (sourceRaw === 'buffer' ? 'social-live' : sourceRaw === 'site-map' ? 'site' : sourceRaw) as never
    const items = Array.isArray(a.items) ? (a.items as Record<string, unknown>[]) : []
    if (!items.length) throw new Error('items[] is required (the posts / pages / rows to import)')
    const res = await useTrafficStore.getState().importAssets(brand, campaign, items, source)
    assertRowsLanded(
      useTrafficStore
        .getState()
        .rows.filter((r) => (r.campaign ?? '').trim() === campaign)
        .map((r) => r.id),
    )
    return {
      brand,
      campaign,
      source,
      imported: res.imported,
      updated: res.updated,
      skipped: res.skipped,
      note: `${res.imported} imported, ${res.updated} refreshed (metrics updated on existing), ${res.skipped} skipped. They're live assets in the canvas — list_assets(source:"${source}") to read them; run_coherence_check to check the real content.`,
    }
  },

  // Move a single asset through the review lifecycle.
  async setAssetStatus(a) {
    const id = str(a.assetId).trim() || str(a.id).trim()
    const status = str(a.status).trim() as RowStatus
    if (!id) throw new Error('assetId is required')
    if (!ASSET_STATUSES.includes(status)) throw new Error(`status must be one of: ${ASSET_STATUSES.join(', ')}`)
    await useTrafficStore.getState().setRowStatus(id, status, str(a.note).trim() || undefined)
    return { id, status }
  },

  // Bulk-approve: every in-scope draft/in_review asset (or an explicit id list).
  async approveAssets(a) {
    const ids = list(a.assetIds)
    const st = useTrafficStore.getState()
    let targets: string[]
    if (ids.length) targets = ids
    else {
      const campaign = str(a.campaign).trim()
      targets = st.rows
        .filter((r) => !r.archivedAt && (!campaign || (r.campaign ?? '') === campaign) && (r.status === 'draft' || r.status === 'in_review'))
        .map((r) => r.id)
    }
    for (const id of targets) await useTrafficStore.getState().setRowStatus(id, 'approved')
    return { approved: targets.length }
  },

  // Soft-delete an asset (archived, recoverable). Use purge: true for a hard delete.
  async deleteAsset(a) {
    const id = str(a.assetId).trim() || str(a.id).trim()
    if (!id) throw new Error('assetId is required')
    if (a.purge === true) {
      await useTrafficStore.getState().removeRow(id)
      return { id, purged: true }
    }
    await useTrafficStore.getState().archiveRow(id)
    return { id, archived: true, note: 'Soft-deleted. restore_asset to recover.' }
  },

  async restoreAsset(a) {
    const id = str(a.assetId).trim() || str(a.id).trim()
    if (!id) throw new Error('assetId is required')
    await useTrafficStore.getState().restoreRow(id)
    return { id, restored: true }
  },

  // Bulk soft-delete (a whole fan set, or an explicit id list). variantOf names the
  // master of a fan set: archives the master's variants.
  async deleteAssets(a) {
    const st = useTrafficStore.getState()
    let ids = list(a.assetIds)
    const ofMaster = str(a.variantOf).trim()
    if (ofMaster) ids = ids.concat(st.rows.filter((r) => (r.variantOf ?? '') === ofMaster).map((r) => r.id))
    ids = [...new Set(ids)]
    if (!ids.length) throw new Error('assetIds or variantOf is required')
    await useTrafficStore.getState().archiveRows(ids)
    return { archived: ids.length }
  },

  // Soft-delete a campaign + its assets (recoverable).
  async deleteCampaign(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    await useTrafficStore.getState().deleteCampaign(campaign)
    return { campaign, archived: true, note: 'Soft-deleted with its assets. restore_campaign to recover.' }
  },

  async restoreCampaign(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    await useTrafficStore.getState().restoreCampaign(campaign)
    return { campaign, restored: true }
  },

  // Delete a client/brand and all its assets. This is a HARD delete (permanent) — use
  // it to clear setup-failure junk brands.
  async deleteClient(a) {
    const name = str(a.name).trim() || str(a.brand).trim()
    if (!name) throw new Error('name is required')
    await useTrafficStore.getState().deleteClient(name)
    return { name, deleted: true, permanent: true }
  },

  // Approve or reject a library item (audience / proof / hook / cta / subject). Reject
  // removes the unvetted draft.
  async setLibraryItemStatus(a) {
    const brand = str(a.brand).trim()
    const kind = str(a.kind).trim()
    const id = str(a.id).trim()
    const status = str(a.status).trim()
    if (!brand || !kind || !id) throw new Error('brand, kind, and id are required')
    const valid = ['ctas', 'rtbs', 'audiences', 'strategies', 'subjects', 'hooks']
    if (!valid.includes(kind)) throw new Error(`kind must be one of: ${valid.join(', ')}`)
    const store = useTrafficStore.getState()
    store.setMessagingBrand(brand)
    if (status === 'approved') store.approveLibraryItem(kind as never, id)
    else if (status === 'rejected') store.removeLibraryItem(kind as never, id)
    else throw new Error('status must be approved or rejected')
    return { brand, kind, id, status }
  },

  // ---- Personalization fan-out (Phase 1) ----

  // Count-before-commit: what a dimension card would create, without fanning.
  async fanOutPreview(a) {
    const campaign = str(a.campaign).trim()
    const dimension = str(a.dimension).trim()
    if (!campaign || !dimension) throw new Error('campaign and dimension are required')
    const values = list(a.values)
    const exclude = Array.isArray(a.exclude) ? (a.exclude as Record<string, string>[]) : []
    const plan = useTrafficStore.getState().fanOutPreview(campaign, dimension, values.length ? values : undefined, exclude)
    const base = `Adding a ${dimension} card creates ${plan.variantCount} variants (${plan.baseCount} base × ${plan.values.length} values${plan.pruned ? `, ${plan.pruned} pruned` : ''}).`
    const cap = plan.cap ?? 0
    const guidance =
      plan.verdict === 'ceiling'
        ? ` That's past the ${plan.ceiling} hard ceiling — fan a smaller dimension (try "${plan.recommendedDimension}") or a subset of values.`
        : plan.verdict === 'over'
          ? ` That's above the ~${cap} you can realistically deploy on these channels — most of these won't ship. Fan "${plan.recommendedDimension}" instead, pick a subset, or pass force:true if you mean it.`
          : plan.verdict === 'warn'
            ? ` That's near the ~${cap} cap for these channels.`
            : ` Within the ~${cap} cap for these channels.`
    return {
      ...plan,
      note: `${base}${guidance} Run the coherence check after to surface only the breaking variants.`,
    }
  },

  // Fan the base into one lineage-tagged variant per value, then generate per variant.
  async fanOut(a) {
    const campaign = str(a.campaign).trim()
    const dimension = str(a.dimension).trim()
    if (!campaign || !dimension) throw new Error('campaign and dimension are required')
    const values = list(a.values)
    const exclude = Array.isArray(a.exclude) ? (a.exclude as Record<string, string>[]) : []
    const generate = a.generate !== false
    const force = a.force === true
    const res = await useTrafficStore
      .getState()
      .fanOut(campaign, dimension, values.length ? values : undefined, { exclude, generate, force })
    const note = res.capped
      ? `Held to ${res.variantCount} — the sensible cap (~${res.cap}) for these channels over the flight. Pass force:true to fan more, up to the ${res.ceiling} ceiling.`
      : undefined
    return { campaign, dimension, ...res, ...(note ? { note } : {}) }
  },

  // Propose conditional logic ("if audience = X then proof Y") from the brand's library
  // associations. Everything lands proposed — a human approves before it shapes copy.
  async proposeConditions(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    const conditions = useTrafficStore.getState().proposeConditions(campaign)
    return {
      campaign,
      count: conditions.length,
      conditions: conditions.map((c) => ({ id: c.id, sentence: conditionSentence(c), rationale: c.rationale, confidence: c.confidence, status: c.status })),
      note: conditions.length
        ? `${conditions.length} conditions proposed. Approve the ones that fit, then fan out — approved conditions repoint each variant's proof/hook/CTA or prune the combination.`
        : 'No conditions could be inferred yet. Connect more audience proof points and CTAs, then re-propose.',
    }
  },

  // List the conditions on a campaign (so Claude can read state before approving).
  async listConditions(a) {
    const campaign = str(a.campaign).trim()
    if (!campaign) throw new Error('campaign is required')
    const conditions = useTrafficStore.getState().campaignConditions[campaign] ?? []
    return {
      campaign,
      conditions: conditions.map((c) => ({ id: c.id, sentence: conditionSentence(c), rationale: c.rationale, confidence: c.confidence, status: c.status })),
    }
  },

  // Approve / reject a proposed condition. Only approved conditions shape generation.
  async setConditionStatus(a) {
    const campaign = str(a.campaign).trim()
    const id = str(a.id).trim()
    const status = str(a.status).trim()
    if (!campaign || !id) throw new Error('campaign and id are required')
    if (status !== 'approved' && status !== 'rejected' && status !== 'proposed') throw new Error('status must be approved, rejected, or proposed')
    useTrafficStore.getState().setConditionStatus(campaign, id, status)
    const c = (useTrafficStore.getState().campaignConditions[campaign] ?? []).find((x) => x.id === id)
    return { campaign, id, status, sentence: c ? conditionSentence(c) : null }
  },

  // ---- Brand boundary: the canvas's coherence baseline + brand tree ----
  // Read a brand's effective baseline: the voice / proof in force and where it comes
  // from (self + inherited ancestors + explicitly shared). What the canvas measures against.
  async getBrandBaseline(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const b = useTrafficStore.getState().brandBaselineFor(brand)
    return {
      brand: b.brand,
      draft: b.draft,
      voice: b.voice ?? null,
      proofCount: b.proofCount,
      audienceCount: b.audienceCount,
      sources: b.sources,
      note: 'Generation and the coherence check read ONLY these sources. Nothing outside this scope can cross the brand boundary.',
    }
  },

  // Set (or clear with parent='') a brand's parent, so it inherits the parent's proof /
  // values / audiences. Cycles and self-parenting are rejected by the store.
  async setBrandParent(a) {
    const brand = str(a.brand).trim()
    const parent = str(a.parent).trim()
    if (!brand) throw new Error('brand is required')
    useTrafficStore.getState().setBrandParent(brand, parent || null)
    return { brand, parent: parent || null, baseline: useTrafficStore.getState().brandBaselineFor(brand).sources }
  },

  // Explicitly attach (on=true) or detach another brand's library as a shared source —
  // the only deliberate way assets cross between unrelated brands.
  async setBrandShare(a) {
    const brand = str(a.brand).trim()
    const share = str(a.share).trim()
    const on = a.on !== false
    if (!brand || !share) throw new Error('brand and share are required')
    useTrafficStore.getState().setBrandShare(brand, share, on)
    return { brand, share, on, baseline: useTrafficStore.getState().brandBaselineFor(brand).sources }
  },

  // Mark a brand a lightweight draft (sketch) or clear the flag. A draft brand is a real,
  // isolated binding — it can generate — and can be promoted later.
  async setBrandDraft(a) {
    const brand = str(a.brand).trim()
    const draft = a.draft !== false
    if (!brand) throw new Error('brand is required')
    useTrafficStore.getState().setBrandDraft(brand, draft)
    return { brand, draft }
  },

  // Promote a draft brand into a real brand (optionally renaming), carrying its library,
  // profile, and campaigns.
  async promoteBrand(a) {
    const draftBrand = str(a.brand).trim()
    const realName = str(a.realName).trim()
    if (!draftBrand) throw new Error('brand is required')
    useTrafficStore.getState().promoteBrand(draftBrand, realName || undefined)
    return { promoted: realName || draftBrand, from: draftBrand }
  },

  // ---- ABM: target accounts ----
  // Add a target account under a brand. `committee` is an array of { role, concern }.
  async addAccount(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const tier = str(a.tier).trim()
    const status = str(a.status).trim()
    const committee = Array.isArray(a.committee)
      ? (a.committee as Record<string, unknown>[]).map((m) => ({ role: str(m.role).trim(), concern: str(m.concern).trim() || undefined })).filter((m) => m.role)
      : undefined
    const acct = useTrafficStore.getState().addAccount(brand, {
      name,
      domain: str(a.domain).trim() || undefined,
      segment: str(a.segment).trim() || undefined,
      tier: (tier === '1:1' || tier === '1:few' || tier === '1:many' ? tier : undefined) as never,
      status: (['target', 'engaged', 'meeting', 'pipeline', 'won', 'lost'].includes(status) ? status : undefined) as never,
      notes: str(a.notes).trim() || undefined,
      committee,
    })
    // Mirror into the new Records › Companies + People stores so those tables render it.
    const stRec = useTrafficStore.getState()
    if (!stRec.companies.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      stRec.addCompany({
        brand,
        name,
        description: str(a.notes).trim() || undefined,
        website: str(a.domain).trim() || undefined,
        segment: str(a.segment).trim() || undefined,
        status: (status === 'won' ? 'client' : 'prospect') as 'client' | 'prospect',
      })
    }
    for (const m of committee ?? []) {
      const personName = m.role
      if (
        personName &&
        !stRec.people.some(
          (p) =>
            p.name.trim().toLowerCase() === personName.toLowerCase() &&
            (p.company ?? '').trim().toLowerCase() === name.toLowerCase(),
        )
      ) {
        stRec.addPerson({
          brand,
          name: personName,
          title: m.role,
          company: name,
          notes: m.concern,
          status: 'lead',
        })
      }
    }
    return { id: acct.id, name: acct.name, brand, tier: acct.tier, status: acct.status }
  },

  // Create a target list under a brand from account NAMES (creating any that don't exist
  // yet), and optionally attach it to a campaign. The ABM target list in one call.
  async createTargetList(a) {
    const brand = str(a.brand).trim()
    const name = str(a.name).trim()
    if (!brand || !name) throw new Error('brand and name are required')
    const st = useTrafficStore.getState()
    const wanted = list(a.accounts)
    const existing = new Map((st.accountsByBrand[brand] ?? []).map((x) => [x.name.toLowerCase(), x]))
    const ids = wanted.map((n) => {
      const found = existing.get(n.toLowerCase())
      return found ? found.id : useTrafficStore.getState().addAccount(brand, { name: n }).id
    })
    const list_ = useTrafficStore.getState().createTargetList(brand, name, ids)
    const campaign = str(a.campaign).trim()
    if (campaign) useTrafficStore.getState().attachTargetList(campaign, list_.id)
    return { id: list_.id, name: list_.name, brand, accounts: wanted, attachedTo: campaign || null }
  },

  // Remove a target account from a brand (also drops it from any target list).
  async removeAccount(a) {
    const brand = str(a.brand).trim()
    const id = str(a.id).trim()
    if (!brand || !id) throw new Error('brand and id are required')
    useTrafficStore.getState().removeAccount(brand, id)
    return { brand, removed: id }
  },

  // Delete a target list (and detach it from any campaign).
  async removeTargetList(a) {
    const listId = str(a.listId).trim()
    if (!listId) throw new Error('listId is required')
    useTrafficStore.getState().removeTargetList(listId)
    return { removed: listId }
  },

  // Attach (or clear with listId='') the target list a campaign targets.
  async attachTargetList(a) {
    const campaign = str(a.campaign).trim()
    const listId = str(a.listId).trim()
    if (!campaign) throw new Error('campaign is required')
    useTrafficStore.getState().attachTargetList(campaign, listId || null)
    return { campaign, listId: listId || null }
  },

  // List a brand's accounts (and which list a campaign targets) so Claude can see state.
  async listAccounts(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const st = useTrafficStore.getState()
    const accounts = (st.accountsByBrand[brand] ?? []).map((x) => ({ id: x.id, name: x.name, segment: x.segment ?? null, tier: x.tier, status: x.status }))
    const lists = st.targetLists.filter((l) => l.brand === brand).map((l) => ({ id: l.id, name: l.name, count: l.accountIds.length }))
    return { brand, accounts, targetLists: lists }
  },

  // Read back what's connected for a brand, so Claude can see before it writes.
  async getBrand(a) {
    const brand = str(a.brand).trim()
    if (!brand) throw new Error('brand is required')
    const st = useTrafficStore.getState()
    const sys = st.brandSystems[brand]
    const prof = st.clientProfiles[brand] ?? {}
    const strat = prof.strategy ? GTM_STRATEGIES.find((s) => s.key === prof.strategy) : undefined
    return {
      brand,
      profile: prof,
      strategy: prof.strategy
        ? {
            key: prof.strategy,
            name: strat?.name ?? prof.strategy,
            secondary: prof.secondaryStrategy ?? null,
            rationale: prof.strategyRationale ?? null,
            confidence: prof.strategyConfidence ?? null,
            signalsUsed: prof.strategySignals ?? [],
          }
        : null,
      system: sys
        ? {
            audiences: sys.audiences.map((x) => x.name),
            proofPoints: sys.rtbs.map((x) => x.label),
            subjects: sys.subjects.map((x) => x.text),
            hooks: sys.hooks.map((x) => x.text),
            ctas: sys.ctas.map((x) => x.label),
          }
        : null,
      campaigns: st.campaignList.filter((c) => c.client === brand && !c.archivedAt).map((c) => c.name),
      /**
       * LIVE assets, and the archived ones counted separately rather than folded in.
       *
       * This used to count every row the brand had, archived included, while list_assets excludes
       * archived by default. A brand whose assets had all been deleted therefore reported 582 here
       * and 0 there, and two separate sessions read that pair as proof they were talking to two
       * different databases — one of them offering to rebuild the work somewhere else. Both numbers
       * were right; they were answering different questions, and only one of them said so.
       */
      assets: st.rows.filter((r) => clientForCampaign(r.campaign) === brand && !r.archivedAt).length,
      archivedAssets: st.rows.filter((r) => clientForCampaign(r.campaign) === brand && !!r.archivedAt).length,
    }
  },
}

let started = false
let es: EventSource | null = null

/**
 * Run one action against this tab's store, and never throw.
 *
 * The single execution path, because there are two transports now: the dev server's SSE bridge and
 * the workspace command queue the deployed app is driven through. Two copies of "look up the
 * handler, run it, shape the error" is how one of them ends up with a slightly different idea of
 * what an unknown action does.
 */
export async function runAgentAction(action: string, args?: Args): Promise<{ result?: unknown; error?: string }> {
  try {
    const h = handlers[action]
    if (!h) throw new Error(`unknown action: ${action}`)
    return { result: await h(args ?? {}) }
  } catch (err) {
    return { error: String((err as Error)?.message ?? err) }
  }
}

function onCommand(e: Event): void {
  void (async () => {
    const cmd = JSON.parse((e as MessageEvent).data) as { id: string; action: string; args?: Args }
    const payload: Record<string, unknown> = { id: cmd.id, ...(await runAgentAction(cmd.action, cmd.args)) }
    void apiFetch('/api/agent-result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })()
}

// When the dev server restarts, the tab may hold stale modules (the cause of
// "unknown action" on newly added tools). The server stamps each start with a
// boot id; if we reconnect to a DIFFERENT one, reload to pick up fresh code.
function onReady(e: Event): void {
  try {
    const { bootId } = JSON.parse((e as MessageEvent).data) as { bootId?: string }
    if (!bootId || typeof sessionStorage === 'undefined') return
    const KEY = 'hf.bridgeBoot'
    const prev = sessionStorage.getItem(KEY)
    sessionStorage.setItem(KEY, bootId) // set first so the post-reload connect won't loop
    if (prev && prev !== bootId) location.reload()
  } catch {
    /* ignore malformed ready events */
  }
}

/** Open the bridge stream and execute commands as they arrive. Idempotent. */
export function startAgentBridge(): void {
  if (started || typeof EventSource === 'undefined') return
  started = true
  es = new EventSource('/api/agent-bridge')
  es.addEventListener('ready', onReady)
  es.addEventListener('command', onCommand)
}

// Dev only: hot-swap the bridge when this module is edited, so new handlers go
// live without a manual tab reload (and we never leave a stale listener attached
// to the old handler registry). Stripped from production builds.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    es?.close()
    es = null
    started = false
  })
  import.meta.hot.accept((mod) => {
    ;(mod as { startAgentBridge?: () => void } | undefined)?.startAgentBridge?.()
  })
}
