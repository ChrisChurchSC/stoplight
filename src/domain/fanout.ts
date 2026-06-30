import type { ClientProfile } from './clients'
import { FUNNEL_STAGES, type FunnelStage } from './funnel'
import type { MessagingLibrary } from './library'
import type { TrafficRow } from './types'

/**
 * Personalization fan-out: a dimension "card" fans a base message into one variant
 * per value of that dimension, with values pulled from the brand's library. Stacked
 * cards multiply (Audience x Location x Journey). Every variant records its lineage
 * (the composition) so outcomes attribute to the exact combination.
 *
 * Dimensions are modeled as flexible context attributes, not hard-coded features —
 * so a brand can personalize across whatever its data supports. A few have a known
 * library source (audience, journey, location); any other dimension fans across the
 * values the caller passes in.
 */

export interface FanoutDimensionMeta {
  key: string
  label: string
  /** Where its values come from, for the UI. */
  source: string
}
export const FANOUT_DIMENSIONS: FanoutDimensionMeta[] = [
  { key: 'audience', label: 'Audience', source: 'Library audiences' },
  { key: 'location', label: 'Location', source: 'Library locations' },
  { key: 'journey', label: 'Journey stage', source: 'Funnel stages' },
  { key: 'channel', label: 'Channel', source: 'Channel list' },
  { key: 'behavior', label: 'Behavior', source: 'Event/behavior data' },
  { key: 'time', label: 'Time / season', source: 'Calendar / season' },
  { key: 'device', label: 'Device / context', source: 'Context' },
  { key: 'lifecycle', label: 'Lifecycle / recency', source: 'CRM state' },
  { key: 'language', label: 'Language / culture', source: 'Locale list' },
  { key: 'intent', label: 'Intent / source', source: 'Source / UTM' },
  { key: 'tier', label: 'Value tier', source: 'Tier data' },
  { key: 'account', label: 'Account (B2B)', source: 'Account list' },
]

const JOURNEY_LABELS = FUNNEL_STAGES.map((s) => s.label)
const labelToStage = new Map(FUNNEL_STAGES.map((s) => [s.label.toLowerCase(), s.stage] as const))
/** The funnel stage a journey-dimension value maps to (so a journey card can pin the band). */
export const journeyStageFor = (value: string): FunnelStage | undefined => labelToStage.get(value.trim().toLowerCase())

/** The library values a dimension fans across (empty when the dimension has no stored
 *  source for this brand — the caller then supplies explicit values). */
export function dimensionValues(
  dimension: string,
  sys: MessagingLibrary | undefined,
  profile: ClientProfile | undefined,
): string[] {
  switch (dimension) {
    case 'audience':
      return (sys?.audiences ?? []).map((a) => a.name).filter(Boolean)
    case 'journey':
      return JOURNEY_LABELS
    case 'location':
      return profile?.locations ?? []
    default:
      return []
  }
}

/** A field on the row that a dimension maps to structurally (so the variant is real,
 *  not only lineage). Other dimensions live in lineage and condition the copy only. */
export function dimensionField(dimension: string, value: string): Partial<TrafficRow> | null {
  if (dimension === 'audience') return { audience: value }
  if (dimension === 'journey') {
    const stage = journeyStageFor(value)
    return stage ? { funnelStage: stage } : null
  }
  return null
}

/** True if a variant's lineage matches a prune pattern (every key in the pattern
 *  equals the variant's value), i.e. this combination should be turned off. */
export function isPruned(lineage: Record<string, string>, exclude: Record<string, string>[]): boolean {
  return exclude.some((pat) => Object.entries(pat).every(([k, v]) => (lineage[k] ?? '').toLowerCase() === v.toLowerCase()))
}

export interface FanoutPlan {
  dimension: string
  values: string[]
  baseCount: number
  /** baseCount * values, minus pruned combinations. */
  variantCount: number
  pruned: number
}

/** Plan a fan-out without committing: the values, the base size, and the resulting
 *  variant count (count-before-commit). */
export function planFanout(
  base: TrafficRow[],
  dimension: string,
  values: string[],
  exclude: Record<string, string>[] = [],
): FanoutPlan {
  let variantCount = 0
  let pruned = 0
  for (const row of base) {
    for (const value of values) {
      const lineage = { ...(row.lineage ?? {}), [dimension]: value }
      if (isPruned(lineage, exclude)) pruned += 1
      else variantCount += 1
    }
  }
  return { dimension, values, baseCount: base.length, variantCount, pruned }
}
