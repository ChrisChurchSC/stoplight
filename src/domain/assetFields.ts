import { clampToLimit, messagingFields, type MessagingField } from './messaging'
import type { ChannelId, MediaType } from './types'

/**
 * WHAT AN AGENT IS ALLOWED TO WRITE ONTO A CARD, AND WHETHER IT WROTE ALL OF IT.
 *
 * A card renders every component its format defines — nine of them for a website, five for an email
 * or a proposal. The MCP could only ever say four things: headline, primaryText, description, cta.
 * Those four were then squeezed through a regex into whatever keys happened to match, so the agent
 * had no way to reach `subhead`, `proof-stat`, `faq` or `cta-footer` at all, and no way to LEARN
 * that they existed — every hand-authored asset arrived a half-built card and read as finished.
 *
 * Three things fix that and they all live here, out of the bridge, because they are rules about the
 * schema rather than about the transport:
 *
 *  - `describeAssetFields` hands the agent the actual key list, so it can ask before it writes.
 *  - `applyCopyFields` takes a `fields` map addressed by real key, keeps the four aliases working,
 *    and REPORTS how each alias resolved and which ones went nowhere instead of dropping them.
 *  - `fieldCoverage` answers "is this card finished", which every write path echoes back.
 */

/** One field as an agent sees it: the key to write, what the card calls it, and what it must fit. */
export interface AssetFieldSpec {
  key: string
  label: string
  /** Aim for this length; longer still saves. Absent when the field has no guidance. */
  recommended?: number
  /** Hard cap. Values written over it are clamped on the way in, never rejected. */
  hardLimit?: number
  /** True for fields that hold more than a line — bodies, captions, scripts. */
  multiline?: boolean
}

/**
 * The exact components a card of this channel + type renders, in the order it renders them.
 *
 * `mediaType` is what decides whether the in-creative row is one of them, so it is only appended
 * when a caller says what the asset is made of — passing nothing describes the messaging components
 * alone. The bridge always passes it, because an agent asking "what does this card render" needs
 * the honest answer for the card it is about to create.
 */
export function describeAssetFields(channel: ChannelId, assetType?: string, mediaType?: MediaType): AssetFieldSpec[] {
  const out: AssetFieldSpec[] = messagingFields(channel, assetType).map((f) => ({
    key: f.key,
    label: f.label,
    ...(f.recommended === undefined ? {} : { recommended: f.recommended }),
    ...(f.hardLimit === undefined ? {} : { hardLimit: f.hardLimit }),
    ...(f.multiline ? { multiline: true } : {}),
  }))
  if (mediaType && rendersInCreative(mediaType)) {
    out.push({ key: IN_CREATIVE_KEY, label: 'In-creative copy', multiline: true })
  }
  return out
}

/**
 * The CTA key every card can carry, whatever its format says.
 *
 * A card ALWAYS renders a CTA row — `assetCta` reads the format's own CTA component where there is
 * one and falls back to this generic key where there isn't, which is how an organic post (Instagram
 * defines nothing but `caption`) still shows a CTA. So it is writable everywhere: rejecting it as
 * "not in the schema" would refuse copy the card is sitting there waiting to display.
 */
export const GENERIC_CTA_KEY = 'cta'

/**
 * The copy written INSIDE the creative — image and video overlays, voiceover, the words on a linked
 * page. A card renders it as its own row, but it is not a messaging component: it lives on the row
 * as `extractedCopy`, because it describes what the artwork already says rather than what the post
 * says around it. The copy extractor fills it from real creative and a person can edit it on the
 * card; addressing it by this key is how an agent reaches the same row.
 */
export const IN_CREATIVE_KEY = 'in-creative-copy'

/** The media types whose cards render an in-creative row. Text posts have no creative to read. */
const IN_CREATIVE_MEDIA: MediaType[] = ['image', 'video', 'link']

/**
 * Whether this card renders an in-creative row.
 *
 * Defaults to image, which is what the store gives an authored asset that names no media type — so
 * the default answer matches the card the agent will actually get.
 */
export const rendersInCreative = (mediaType?: MediaType): boolean =>
  IN_CREATIVE_MEDIA.includes(mediaType ?? 'image')

/** The four friendly names the MCP has always taken, in the order they are resolved. */
export const COPY_ALIASES = ['headline', 'primaryText', 'description', 'cta'] as const
export type CopyAlias = (typeof COPY_ALIASES)[number]

/** Exact key an alias means when the format happens to define it — checked before any pattern. */
const EXACT: Record<CopyAlias, string> = {
  headline: 'headline',
  primaryText: 'primary',
  description: 'description',
  cta: 'cta',
}

/** Fallback patterns, tried in schema order, when the format has no exactly-named field. */
const PATTERN: Record<CopyAlias, RegExp> = {
  headline: /headline|subject|title|subhead|^h\d/i,
  primaryText: /primary|body|caption|intro|post|message|script/i,
  description: /desc|preview/i,
  cta: /cta|^link$|^ask$/i,
}

/**
 * Which real key each alias writes to, or undefined where the format has nothing of that kind.
 *
 * Resolved in one pass with claims, because the old version resolved each alias independently and
 * they collided. `primaryText` in particular fell back to `fields[0]` whenever a format had no
 * body-ish component, so on a proposal, a Google search ad, a YouTube ad, a Snapchat ad and an
 * events card it landed on the SAME key `headline` had just written and silently replaced it — the
 * agent sent two fields and the card kept one. Nothing falls back to fields[0] now: an alias with
 * no home resolves to undefined and is reported, which is the honest answer and the one that tells
 * the agent to address the field by key instead.
 */
export function messagingKeys(channel: ChannelId, assetType?: string): Partial<Record<CopyAlias, string>> {
  const fields = messagingFields(channel, assetType)
  const keys = new Set(fields.map((f) => f.key))
  const claimed = new Set<string>()
  const out: Partial<Record<CopyAlias, string>> = {}
  // Exact names first and for every alias, so one alias's pattern can never take a key that another
  // alias owns outright: on an email, `subject` no longer swallows `headline`.
  for (const alias of COPY_ALIASES) {
    const exact = EXACT[alias]
    if (keys.has(exact)) {
      out[alias] = exact
      claimed.add(exact)
    }
  }
  for (const alias of COPY_ALIASES) {
    if (out[alias]) continue
    const hit = fields.find((f) => !claimed.has(f.key) && PATTERN[alias].test(f.key))
    if (hit) {
      out[alias] = hit.key
      claimed.add(hit.key)
    }
  }
  // Organic formats define no CTA component, but the card renders one regardless — so the alias
  // always has somewhere to go.
  if (!out.cta) out.cta = GENERIC_CTA_KEY
  return out
}

/** What a write asked for: the four aliases, plus an explicit key-addressed map that beats them. */
export interface CopyInput {
  headline?: unknown
  primaryText?: unknown
  description?: unknown
  cta?: unknown
  /** Real schema keys → copy. The only way to reach a field no alias names. */
  fields?: unknown
}

export interface AppliedCopy {
  /** The messaging map to store: `base` with everything this write resolved laid over it. */
  messaging: Record<string, string>
  /**
   * The in-creative copy this write set, when it set any. Kept OUT of `messaging` deliberately —
   * it belongs on the row as `extractedCopy`, and folding it in would store it under a key no card
   * reads and no format defines.
   */
  inCreativeCopy?: string
  /** Alias → the key it was written to. Echoed back so a surprising resolution is visible. */
  mapped: Partial<Record<CopyAlias, string>>
  /** Aliases this format has no field for. Their copy was NOT stored — say so, never swallow it. */
  unmapped: CopyAlias[]
  /** Keys whose value was longer than the field's hard limit and was trimmed to fit. */
  clamped: string[]
}

/** Thrown when `fields` names a key this card does not render, listing the ones it does. */
export class UnknownAssetFieldError extends Error {
  constructor(readonly unknownKeys: string[], readonly validKeys: string[]) {
    super(
      `unknown field key(s): ${unknownKeys.join(', ')}. This asset renders: ${validKeys.join(', ')}. ` +
        `Call describe_asset_fields for the full schema.`,
    )
    this.name = 'UnknownAssetFieldError'
  }
}

/**
 * Lay a write over an existing messaging map. Untouched fields keep their value.
 *
 * `fields` is applied AFTER the aliases so an explicit key always wins over a fuzzy one, and an
 * unknown key is an error rather than a silent store: writing copy to a key the card does not
 * render would look exactly like success and show up nowhere, which is the failure this whole
 * module exists to end.
 */
export function applyCopyFields(
  channel: ChannelId,
  assetType: string | undefined,
  base: Record<string, string>,
  input: CopyInput,
  mediaType?: MediaType,
): AppliedCopy {
  const specs = messagingFields(channel, assetType)
  const byKey = new Map(specs.map((f) => [f.key, f]))
  const resolved = messagingKeys(channel, assetType)
  const messaging = { ...base }
  const mapped: Partial<Record<CopyAlias, string>> = {}
  const unmapped: CopyAlias[] = []
  const clamped: string[] = []

  const put = (key: string, raw: string, field?: MessagingField) => {
    const value = clampToLimit(raw, field)
    if (value !== raw) clamped.push(key)
    messaging[key] = value
  }

  for (const alias of COPY_ALIASES) {
    const raw = input[alias]
    if (typeof raw !== 'string') continue
    const key = resolved[alias]
    if (!key) {
      unmapped.push(alias)
      continue
    }
    mapped[alias] = key
    put(key, raw, byKey.get(key))
  }

  let inCreativeCopy: string | undefined
  const fields = input.fields
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    const entries = Object.entries(fields as Record<string, unknown>).filter(([, v]) => typeof v === 'string')
    // The in-creative row is only on the card when there is a creative to read, so on a text asset
    // the key is refused rather than stored somewhere nothing renders.
    const allowsInCreative = rendersInCreative(mediaType)
    const valid = [...specs.map((f) => f.key), GENERIC_CTA_KEY, ...(allowsInCreative ? [IN_CREATIVE_KEY] : [])]
    const unknown = entries.map(([k]) => k).filter((k) => !valid.includes(k))
    if (unknown.length) throw new UnknownAssetFieldError(unknown, valid)
    for (const [key, value] of entries) {
      if (key === IN_CREATIVE_KEY) inCreativeCopy = value as string
      else put(key, value as string, byKey.get(key))
    }
  }

  return { messaging, inCreativeCopy, mapped, unmapped, clamped }
}

/**
 * Which of the card's components carry text and which are still blank.
 *
 * Measured against the FORMAT's schema, not against whatever keys the map happens to hold — the
 * same reading `filledFields` uses for the canvas, so "complete" here means the card looks complete
 * to a person. Every write path returns this, which is what lets an agent notice it left six of a
 * website's nine fields empty and go back for them.
 */
export function fieldCoverage(
  channel: ChannelId,
  assetType: string | undefined,
  messaging: Record<string, string> | undefined,
  row?: { mediaType?: MediaType; extractedCopy?: string },
): { filled: string[]; missing: string[]; complete: boolean } {
  const m = messaging ?? {}
  const filled: string[] = []
  const missing: string[] = []
  for (const f of messagingFields(channel, assetType)) {
    if ((m[f.key] ?? '').trim()) filled.push(f.key)
    else missing.push(f.key)
  }
  // Counted only when asked about a real row, so a bare schema question still answers about the
  // messaging components alone.
  if (row && rendersInCreative(row.mediaType)) {
    if ((row.extractedCopy ?? '').trim()) filled.push(IN_CREATIVE_KEY)
    else missing.push(IN_CREATIVE_KEY)
  }
  return { filled, missing, complete: missing.length === 0 }
}
