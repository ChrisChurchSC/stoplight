import { DRAFTS_SPACE, UNASSIGNED } from './clients'
import { type MessagingLibrary, emptyLibrary } from './library'

/**
 * Brand scope — the hard boundary a canvas measures against.
 *
 * A canvas binds to exactly one brand. Generation, fan-out, the library, and the
 * coherence check resolve assets ONLY from that brand plus the brands explicitly in
 * its scope: its ancestors (inheritance) and brands it has been deliberately attached
 * to (explicit shares / co-brand). Nothing else can cross the boundary. This is the
 * structural fix for contamination — one brand's proof/voice/audiences cannot bleed
 * into another's output, because there is a single resolver and it never reaches a
 * brand outside the scope set.
 *
 * "Brand" is keyed by the same client-name key used by brandSystems / clientProfiles /
 * clientList; this module adds the tree (parent), explicit sharing, and the draft flag
 * on top without re-keying the existing stores.
 */

export interface BrandMeta {
  /** Parent brand. This node inherits the parent's proof / values / audiences; the
   *  child overrides voice and its own assets locally (self wins on id collisions). */
  parent?: string
  /** Brands this brand EXPLICITLY pulls assets from — an opt-in attachment the user
   *  can see, never ambient bleed. The only cross-tree path besides inheritance. */
  shares?: string[]
  /** A lightweight sketch brand: works end-to-end so users can experiment before
   *  committing, and can be promoted/renamed into a real brand later. NOT brand-less. */
  draft?: boolean
  /** Co-brand campaigns (rare): a genuine two-brand effort blends with these brands'
   *  shared rules. Explicit, never assumed by default flows. */
  coBrand?: string[]
}

export type BrandMetaMap = Record<string, BrandMeta>

export type BrandRelation = 'self' | 'ancestor' | 'shared' | 'co-brand'

/** A brand that contributed assets to a scope, and how it is related. */
export interface BrandSource {
  brand: string
  relation: BrandRelation
}

/** The resolved, isolated view a canvas generates and checks against. */
export interface EffectiveBrand {
  /** The bound brand (the baseline). */
  brand: string
  /** The merged library: self overrides ancestors override shares/co-brands, deduped
   *  by id (key for strategies). This is the ONLY library generation may read. */
  library: MessagingLibrary
  /** Every brand that contributed, in precedence order (self first). Drives the
   *  inspectable baseline ("which proof set / voice is in force, and from where"). */
  sources: BrandSource[]
}

/** Brand-less = the UNASSIGNED catch-all (or an empty binding). Generation and the
 *  coherence check refuse this state — a brand-less canvas is the contamination /
 *  templating failure mode, so it is not a supported place to generate from. */
export function isBrandless(brand?: string): boolean {
  return !brand || !brand.trim() || brand === UNASSIGNED
}

export function isDraftBrand(brand: string, meta: BrandMetaMap): boolean {
  return !!meta[brand]?.draft
}

/**
 * WHICH BRAND A CANVAS SCOPES ITS RECORD LISTS TO, given the workspace filter.
 *
 * Every picker on a campaign board — audiences, proof, messages, products, people, data sets — is
 * filtered to one brand, so this decides what an agency is offered while writing for a client. A
 * filter naming a brand is the answer. 'all' means no brand is bound: the builder board, or a
 * campaign whose Brand card was unwired.
 *
 * THE UNBOUND CASE MUST RESOLVE TO NOTHING, NOT TO A GUESS. Falling through to the first brand in
 * the workspace put one client's audiences and proof in the pickers of another client's campaign,
 * with nothing on screen to say the board had reached outside itself — the leak the whole scope
 * resolver above exists to make impossible.
 *
 * A workspace holding exactly one brand is the one safe shortcut: there is nothing to choose
 * between, and no second brand for anything to leak from. Two or more and the answer is none,
 * leaving the user to name one with a Brand card.
 *
 * THE BRANDLESS CATCH-ALLS ARE NOT BRANDS, and a filter naming one is a filter naming nothing.
 * openFlow points the rail at clientForCampaign(name), which is UNASSIGNED for a campaign filed
 * under nobody — and this used to pass that through as if "Unassigned" were a client. Every record
 * list on the canvas then scoped to a phantom brand: audiences authored there were filed under
 * clientAudiences['Unassigned'], invisible from the real brand's scope, and the grid — resolving
 * the same refIds against whichever bucket TODAY's scope named — showed the tag as unset with a
 * picker that did not contain it. The tags were never lost; the two surfaces were reading
 * different buckets depending on how you had navigated in.
 */
export function canvasBrandScope(clientFilter: string, brandNames: string[]): string {
  if (clientFilter && clientFilter !== 'all' && !isBrandless(clientFilter) && clientFilter !== DRAFTS_SPACE) {
    return clientFilter
  }
  return brandNames.length === 1 ? brandNames[0] ?? '' : ''
}

/**
 * THE BRAND A CAMPAIGN'S BOARD NAMES, read off the Brand card sitting on it.
 *
 * The binding written by bindCampaignBrand is a campaign's most specific answer, and this is what
 * to believe when that lookup comes back empty — the same ladder the Made from column climbs, for
 * the same reason. A campaign can carry a Brand card wired into its brief, generating every word of
 * its copy in that brand's voice, while its own record still says nobody: the card is how a campaign
 * gets a brand, and the binding is written on the wire, so any campaign that predates that wiring
 * (or that was imported, or built before the card existed) has the brand on the board and nowhere
 * else. Reading only the record calls those campaigns brandless, which is a statement about where
 * the app looked rather than about the campaign.
 *
 * WIRED INTO THE BRIEF WINS over a card left loose on the canvas. A card connected to the hub is the
 * one shaping the copy; a loose one is a card someone dropped and has not attached yet. Loose still
 * counts when it is all there is — it is the only brand named anywhere on the board — but never over
 * an attached one.
 *
 * `brandNameFor` resolves a card's refId to a brand record's name, because a domain module has no
 * business reaching into the store's collections for it (see objectName for the same split).
 */
export function brandFromBoard(
  board:
    | { objects: { id: string; kind: string; refId?: string }[]; connectors: { from: string; to: string }[] }
    | undefined,
  brandNameFor: (refId: string) => string | undefined,
): string {
  if (!board) return ''
  const named = (id: string): string => {
    const o = board.objects.find((n) => n.id === id)
    if (!o || o.kind !== 'brand' || !o.refId) return ''
    const name = brandNameFor(o.refId)?.trim() ?? ''
    return isBrandless(name) || name === DRAFTS_SPACE ? '' : name
  }
  for (const e of board.connectors) {
    if (e.to !== 'campaign') continue
    const name = named(e.from)
    if (name) return name
  }
  for (const o of board.objects) {
    const name = named(o.id)
    if (name) return name
  }
  return ''
}

/**
 * DOES THIS CAMPAIGN BELONG IN THE CAMPAIGNS LIST for the brand in scope?
 *
 * Its own brand's, yes. And the BRANDLESS ones — the campaigns filed under nobody, which is what a
 * campaign is until something binds it to a brand. Those used to be filtered out entirely, and the
 * result was a page that lied: a workspace whose only brand was "Breadcrumbs", holding eleven
 * campaigns filed as Unassigned, opened on "0 campaigns" with a folder tree above it. The campaigns
 * were not lost, or archived, or slow to load — they were scoped to a brand they had never been
 * filed under. Opening any one of them set the filter to Unassigned, and on the way back all eleven
 * appeared, which is a confusing way to learn that nothing was ever missing.
 *
 * They land in the unfiled bucket, which the Campaigns page calls DRAFTS, and that is the honest
 * description: work that has not been assigned to a brand yet.
 *
 * ANOTHER BRAND'S CAMPAIGN IS STILL NEVER IN SCOPE. That is the line this must not cross — it is the
 * same leak canvasBrandScope above refuses, and showing one client's work on another client's page
 * would be worse than the empty page this fixes. Brandless is not another brand: it is nobody's.
 */
export function campaignInBrandScope(client: string | undefined, brand: string): boolean {
  return isBrandless(client) || client === DRAFTS_SPACE || client === brand
}

/**
 * THE CAMPAIGNS INDEX SHOWS EVERYTHING UNTIL YOU PICK A BRAND.
 *
 * `brandChosen` is whether the workspace filter names a brand — NOT whether one got resolved. The
 * difference is the whole fix. clientFilter resets to 'all' on every load (it is not persisted), so
 * after a refresh no brand has been chosen, and the two ways that used to resolve were both wrong
 * for a list:
 *
 *   one brand in the workspace  → canvasBrandScope returns it, and campaigns filed under any other
 *                                 client vanished from the only page that lists them
 *   two or more                 → canvasBrandScope returns '' rather than guess, and only the
 *                                 brandless ones survived the filter
 *
 * Either way a refresh emptied the page, and opening any campaign set the filter to its own client,
 * so coming back the campaigns reappeared — then vanished on the next refresh. The list was
 * answering "which brand am I bound to", a question it has no business asking.
 *
 * AN INDEX IS NOT A PICKER, and this is the distinction the leak rule turns on. canvasBrandScope
 * refuses to guess because a picker offering one client's audiences on another client's campaign is
 * contamination. Listing your own workspace's campaigns on your own campaigns page is not: it is the
 * file browser, and an agency needs it to see every client's work in order to pick one. Once you DO
 * name a brand, the scope tightens to that brand plus the brandless — never another brand's.
 */
export function campaignInIndexScope(client: string | undefined, brand: string, brandChosen: boolean): boolean {
  return !brandChosen || campaignInBrandScope(client, brand)
}

export function parentOf(brand: string, meta: BrandMetaMap): string | undefined {
  const p = meta[brand]?.parent?.trim()
  return p && p !== brand ? p : undefined
}

/** The brand's ancestors, nearest first, cycle-safe (a malformed loop stops). */
export function ancestorsOf(brand: string, meta: BrandMetaMap): string[] {
  const out: string[] = []
  const seen = new Set<string>([brand])
  let cur = parentOf(brand, meta)
  while (cur && !seen.has(cur)) {
    out.push(cur)
    seen.add(cur)
    cur = parentOf(cur, meta)
  }
  return out
}

/**
 * The brands whose assets are IN SCOPE for `brand`, in precedence order:
 * self → ancestors (nearest first) → explicit shares → co-brands. This is the ONLY
 * set permitted to cross a brand boundary; anything outside it is isolated.
 */
export function scopeBrands(brand: string, meta: BrandMetaMap): BrandSource[] {
  const out: BrandSource[] = [{ brand, relation: 'self' }]
  const seen = new Set<string>([brand])
  const push = (b: string | undefined, relation: BrandRelation) => {
    const key = (b ?? '').trim()
    if (!key || seen.has(key) || isBrandless(key)) return
    seen.add(key)
    out.push({ brand: key, relation })
  }
  for (const a of ancestorsOf(brand, meta)) push(a, 'ancestor')
  for (const s of meta[brand]?.shares ?? []) push(s, 'shared')
  for (const c of meta[brand]?.coBrand ?? []) push(c, 'co-brand')
  return out
}

const dedupeById = <T extends { id?: string; key?: string }>(items: T[]): T[] => {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const k = (it.id ?? it.key ?? '').toString()
    if (!k) {
      out.push(it)
      continue
    }
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

/**
 * Resolve a brand into its effective, isolated library. Walks self → ancestors →
 * explicit shares → co-brands, merging each library field and deduping by id so the
 * nearer brand (self over parent over share) wins on collisions. The returned library
 * is the complete and ONLY set of assets in force for this canvas.
 */
export function resolveBrandScope(
  brand: string,
  systems: Record<string, MessagingLibrary>,
  meta: BrandMetaMap,
): EffectiveBrand {
  const sources = scopeBrands(brand, meta)
  const libs = sources.map((s) => systems[s.brand]).filter(Boolean) as MessagingLibrary[]
  const merged: MessagingLibrary = {
    ctas: dedupeById(libs.flatMap((l) => l.ctas)),
    rtbs: dedupeById(libs.flatMap((l) => l.rtbs)),
    audiences: dedupeById(libs.flatMap((l) => l.audiences)),
    // Strategies are the universal GTM shelf (keyed, identical per brand); take the
    // bound brand's own so a child can re-order without a parent merge muddying it.
    strategies: (systems[brand] ?? emptyLibrary()).strategies,
    subjects: dedupeById(libs.flatMap((l) => l.subjects)),
    hooks: dedupeById(libs.flatMap((l) => l.hooks)),
  }
  // Sources that actually contributed a library (drop scope entries with no assets).
  const contributing = sources.filter((s) => systems[s.brand])
  return { brand, library: merged, sources: contributing.length ? contributing : [{ brand, relation: 'self' }] }
}

/** The inspectable coherence baseline: which brand the check measures against, the
 *  voice in force (child-local, falling back up the tree), and the proof / audience
 *  set size, plus where those assets came from. Surfaced on the canvas and in the
 *  coherence result so the baseline is never implicit. */
export interface BrandBaseline {
  brand: string
  draft: boolean
  voice?: string
  proofCount: number
  audienceCount: number
  sources: BrandSource[]
}

/** Resolve the voice in force: the brand's own voice wins; otherwise inherit up the
 *  tree (a sub-brand with no voice falls back to its parent's). */
export function resolveBrandVoice(
  brand: string,
  voiceOf: (brand: string) => string | undefined,
  meta: BrandMetaMap,
): string | undefined {
  const own = voiceOf(brand)?.trim()
  if (own) return own
  for (const a of ancestorsOf(brand, meta)) {
    const v = voiceOf(a)?.trim()
    if (v) return v
  }
  return undefined
}

export function brandBaseline(
  effective: EffectiveBrand,
  voice: string | undefined,
  meta: BrandMetaMap,
): BrandBaseline {
  return {
    brand: effective.brand,
    draft: isDraftBrand(effective.brand, meta),
    voice: voice?.trim() || undefined,
    proofCount: effective.library.rtbs.length,
    audienceCount: effective.library.audiences.length,
    sources: effective.sources,
  }
}
