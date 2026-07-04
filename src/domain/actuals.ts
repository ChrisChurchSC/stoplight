import type { ChannelId } from './types'

/**
 * Measured actuals — a brand's REAL performance pulled from a connected analytics
 * source (read-only), sat beside the projected plan in the Metrics tab. This is how
 * the plan → measure loop closes.
 *
 * The app has no backend, so it can't call the analytics API itself. The pull runs
 * out of band (Claude → Summer / Forward API), normalizes per channel, and writes
 * the result here via `setBrandActuals`. `updatedAt` is the freshness stamp.
 */

/** One channel's measured performance. `reach` is the channel's native top-line
 *  count (video views, impressions, sessions), so it compares within a channel, not
 *  across them — hence `reachUnit`. Optional metrics are omitted when the source
 *  doesn't expose them. */
export interface ChannelActual {
  /** Channel id for the icon + label (youtube, linkedin, website, …). */
  channel: ChannelId | string
  /** Display label, e.g. "YouTube" or "Search (GSC)". */
  label: string
  /** What `reach` counts, e.g. "views", "impressions", "sessions". */
  reachUnit: string
  reach: number
  /** Distinct assets (videos / posts / pages) behind `reach` in the window. */
  assets?: number
  /** Average reach one asset earns on this channel — the projection-calibration base
   *  (and a truer per-post line than the raw total). */
  reachPerAsset?: number
  engagement?: number
  clicks?: number
  conversions?: number
  revenue?: number
  /** Reach in the latest 7 days vs the 7 before, for week-over-week alerts. */
  trend?: { cur: number; prior: number }
  /** ISO date window this measurement covers. */
  from: string
  to: string
}

export interface BrandActuals {
  /** ms epoch of the last refresh. */
  updatedAt: number
  /** Human source label, e.g. "Summer · Forward API". */
  source: string
  channels: ChannelActual[]
}

export interface ActualTotals {
  reach: number
  engagement: number
  clicks: number
  conversions: number
  revenue: number
}

/** Per-channel average reach per asset, keyed by channel id — used to calibrate
 *  projected reach to the brand's real history. Only channels with a measured
 *  per-asset average are included; every other channel keeps the generic plan model. */
export function reachByChannelFromActuals(a: BrandActuals | undefined | null): Record<string, number> {
  const out: Record<string, number> = {}
  if (!a) return out
  for (const c of a.channels) {
    if (c.reachPerAsset && c.reachPerAsset > 0) out[String(c.channel)] = c.reachPerAsset
  }
  return out
}

/** Sum the measurable metrics across channels. Reach mixes units (views +
 *  impressions + sessions), so it's a loose top-line, not a precise total. */
export function actualTotals(a: BrandActuals | undefined | null): ActualTotals {
  const t: ActualTotals = { reach: 0, engagement: 0, clicks: 0, conversions: 0, revenue: 0 }
  if (!a) return t
  for (const c of a.channels) {
    t.reach += c.reach || 0
    t.engagement += c.engagement || 0
    t.clicks += c.clicks || 0
    t.conversions += c.conversions || 0
    t.revenue += c.revenue || 0
  }
  return t
}
