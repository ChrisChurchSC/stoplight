import type { CampaignVerdict } from '../adapters/icp/types'

/**
 * Coherence decisions — the dataset only this product's mechanism can produce.
 *
 * Every time the cross-variant coherence check flags something and a human
 * accepts the batch anyway (overriding the flag) or had already resolved it, we
 * record what was flagged, the context, and the human verdict. Aggregated and
 * anonymized over time, this becomes a model of what real teams consider coherent
 * vs. off-brand — not scrapeable, not buyable, only produced by running the gate.
 */
export interface CoherenceDecision {
  id: string
  /** The variant (row) the flag concerned. */
  variantId: string
  assetName: string
  /** Campaign + resolved client for slicing (client stays out of the aggregate layer). */
  campaign: string
  client: string
  audienceType: string
  /** What the check flagged: the messaging component (if any) and the issue. */
  field?: string
  issue?: string
  /** The batch verdict at the time the human decided. */
  batchVerdict: CampaignVerdict
  /** The human's call: they let it ship despite the flag, or had already fixed it. */
  verdict: 'overridden' | 'resolved'
  /** ms timestamp, supplied by the caller (the store) so this module stays pure. */
  at: number
}

export function freshDecisionId(): string {
  return `coh_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
}
