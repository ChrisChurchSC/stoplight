import { funnelStageFor, type FunnelStage } from './funnel'
import type { ChannelId } from './types'

/**
 * The id the five collapse into.
 *
 * It is NOT in the registry yet, and that is deliberate rather than unfinished. Adding a channel to
 * CHANNELS is not an inert act: presetTypes.test.ts asserts every channel is reachable from the
 * picker and says why in its own note — a channel without a deliverable preset is silently absent
 * from the one screen where you choose one. It also needs its own messaging fields, and a short tag
 * that does not collide, because website already answers to "WEB".
 *
 * None of that can be separated from migrating the data and sweeping the call sites, so the registry
 * change lands with them in one piece. What CAN be settled first is the mapping itself and the proof
 * that it moves nothing, which is this file.
 */
export const WEB_CHANNEL_ID = 'web'

/**
 * WEB IS THE CHANNEL. A HOMEPAGE IS A PAGE ON IT.
 *
 * The registry had five channels for one place to publish: website, blog, landing-page, checkout
 * and post-purchase. Every one of them is a URL somebody opens in a browser, and the registry half
 * knew it already — website, blog and landing-page all carry platform: 'Web'. What separates them is
 * what the page is FOR, and that is what assetType is for. So `web` becomes the channel and each of
 * the five becomes page types under it. `homepage` did not even have to be invented: it was already
 * an asset type of `website`.
 *
 * THE PART THAT IS NOT A RENAME. funnelStageFor takes (channel, assetType) and falls back to a
 * DEFAULT PER CHANNEL — consideration for website and blog, conversion for landing-page and
 * checkout, retention for post-purchase. Five channels carry five defaults; one channel can carry
 * one. Collapse them without replacing those defaults and every asset that relied on its channel's
 * position silently moves: a thank-you page stops being retention, a cart stops being a close, and
 * the funnel on the canvas inverts. channelAssetTypes.ts warns about exactly this in its own note
 * about primaryTypeKey.
 *
 * So the stage moves from the channel onto the type, exhaustively, in WEB_TYPE_STAGE below. It is
 * not a redesign of anybody's funnel: every entry is the stage that pair resolves to TODAY, whether
 * from its channel default or from one of the four overrides funnelStageFor already spells out
 * (blog case-study, website login, website pricing/comparison/contact). The test beside this file
 * walks every legacy pair and asserts the two agree, so the merge is provably placement-preserving
 * rather than merely intended to be.
 */

/** The five channels that were always one channel. */
export const LEGACY_WEB_CHANNELS = ['website', 'blog', 'landing-page', 'checkout', 'post-purchase'] as const
export type LegacyWebChannel = (typeof LEGACY_WEB_CHANNELS)[number]

export const isLegacyWebChannel = (c: string): c is LegacyWebChannel =>
  (LEGACY_WEB_CHANNELS as readonly string[]).includes(c)

/**
 * The one key that collided. Both checkout and post-purchase called a type `upsell`, and they are
 * different offers at different moments — one raises the basket before payment, one comes after the
 * receipt. Checkout keeps the plain key because it is the earlier and more common of the two; the
 * other is qualified rather than dropped, so no asset loses what it was.
 */
export const POST_PURCHASE_UPSELL = 'post-purchase-upsell'

/**
 * What each legacy channel means when an asset never picked a type. This is primaryTypeKey's answer
 * for that channel — [0] of its list — kept deliberately rather than invented, because that is the
 * type the rest of the app already treats a bare asset on that channel as having.
 */
const PRIMARY_FOR: Record<LegacyWebChannel, string> = {
  website: 'homepage',
  blog: 'article',
  'landing-page': 'lead-capture',
  checkout: 'cart',
  'post-purchase': 'confirmation',
}

/** An old (channel, assetType) pair, as the page type it becomes on `web`. */
export function webTypeFor(channel: LegacyWebChannel, assetType?: string): string {
  const t = (assetType ?? '').trim()
  if (!t) return PRIMARY_FOR[channel]
  // The collision, resolved by which channel it arrived on — the only place the old channel still
  // carries information the type alone cannot.
  if (channel === 'post-purchase' && t === 'upsell') return POST_PURCHASE_UPSELL
  return t
}

/**
 * The funnel stage of every page type on `web`, replacing the five channel defaults it used to be
 * derived from. Grouped by where each type came from so the table can be read against the old
 * channels it stands in for.
 */
export const WEB_TYPE_STAGE: Record<string, FunnelStage> = {
  // ── was `website` (default consideration, with three conversion overrides and one retention) ──
  homepage: 'consideration',
  page: 'consideration',
  product: 'consideration',
  solutions: 'consideration',
  about: 'consideration',
  pricing: 'conversion',
  comparison: 'conversion',
  contact: 'conversion',
  login: 'retention',

  // ── was `blog` (default consideration, case-study closes) ──
  article: 'consideration',
  pillar: 'consideration',
  listicle: 'consideration',
  'case-study': 'conversion',

  // ── was `landing-page` (default conversion) ──
  'lead-capture': 'conversion',
  sales: 'conversion',
  'webinar-reg': 'conversion',
  waitlist: 'conversion',

  // ── was `checkout` (default conversion) ──
  cart: 'conversion',
  checkout: 'conversion',
  'plan-selector': 'conversion',
  'order-bump': 'conversion',
  upsell: 'conversion',
  trust: 'conversion',
  promo: 'conversion',

  // ── was `post-purchase` (default retention) ──
  confirmation: 'retention',
  onboarding: 'retention',
  'review-request': 'retention',
  referral: 'retention',
  [POST_PURCHASE_UPSELL]: 'retention',
  survey: 'retention',
}

/**
 * The channel default for `web` itself, for a type nobody has seen before — a custom `x-` type, or
 * one added later and not yet in the table. Consideration because that is what the two biggest
 * contributors defaulted to, and because it is the honest middle: a new page is more likely to
 * explain than to close, and mistaking a closer for an explainer costs less than the reverse.
 */
export const WEB_DEFAULT_STAGE: FunnelStage = 'consideration'

export const webStageFor = (assetType?: string): FunnelStage =>
  WEB_TYPE_STAGE[(assetType ?? '').trim()] ?? WEB_DEFAULT_STAGE

export interface MigratedRow {
  /** WEB_CHANNEL_ID. A string until the registry gains it — see the note at the top of this file. */
  channel: string
  assetType: string
  /**
   * Set ONLY where the table would have moved this asset. See the note below — this is the field
   * that makes the merge lossless for types the table cannot speak for.
   */
  funnelStage?: FunnelStage
}

/**
 * Rewrite one asset's channel and type onto `web`, pinning its funnel stage if the rewrite would
 * otherwise move it. Returns null for anything that was never on a web channel.
 *
 * THE TABLE CANNOT COVER EVERY TYPE, AND PRETENDING OTHERWISE WOULD MOVE WORK QUIETLY. Two kinds of
 * asset have a type WEB_TYPE_STAGE will never hold: the "Other / custom" escape hatch every channel
 * appends, and the `x-` custom types people author themselves. Both take their stage from the
 * channel default today, so an "Other" page on post-purchase is retention and an `x-` page on
 * checkout closes. Merge the channels and both fall to web's own default — consideration — and the
 * asset moves band on the canvas without anybody touching it.
 *
 * TrafficRow already has the field for this: `funnelStage` is the explicit override, set when a card
 * is dragged into a different band, and it wins over anything derived. So where the derivation
 * disagrees with today's answer, the migration writes today's answer down. A row that already
 * carries an override is left alone — it was already winning, and it still will.
 *
 * The result is that placement survives the merge for every asset, including the ones no table
 * could have anticipated, and it survives as data rather than as a rule somebody has to maintain.
 */
export function migrateRowChannel(row: {
  channel: string
  assetType?: string
  funnelStage?: FunnelStage
}): MigratedRow | null {
  if (!isLegacyWebChannel(row.channel)) return null
  const assetType = webTypeFor(row.channel, row.assetType)
  if (row.funnelStage) return { channel: WEB_CHANNEL_ID, assetType }
  const before = funnelStageFor(row.channel as ChannelId, row.assetType)
  const after = webStageFor(assetType)
  return before === after
    ? { channel: WEB_CHANNEL_ID, assetType }
    : { channel: WEB_CHANNEL_ID, assetType, funnelStage: before }
}

/** The stage an asset ends up at after migration, derived the way the app will derive it. */
export const effectiveStageAfter = (m: MigratedRow): FunnelStage =>
  m.funnelStage ?? webStageFor(m.assetType)
