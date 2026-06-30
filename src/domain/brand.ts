import { UNASSIGNED } from './clients'
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
