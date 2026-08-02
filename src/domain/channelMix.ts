import type { ChannelId } from './types'

/**
 * The shape of a saved media mix — a named goal/budget/risk scenario per brand.
 * `useTrafficStore` persists a list of these; nothing else here is read.
 *
 * This file also held a local recommender that scored each channel against published
 * CPM/CTR/CVR benchmarks and the brand's own organic performance. It had no callers,
 * so it was removed along with the benchmark table and the types only it used. The
 * server-side `/api/media-mix` handler still exists and does its own scoring, though
 * nothing in the client currently calls it either.
 */

export type MixGoal = 'reach' | 'engagement' | 'conversions'
export type MixRisk = 'conservative' | 'balanced' | 'aggressive'

export interface MixChannel {
  channel: ChannelId
  label: string
  kind: 'paid' | 'owned' | 'organic'
  /** $ per 1000 impressions. */
  cpm: number
  /** Click-through rate, 0..1. */
  ctr: number
  /** Conversion rate of a click, 0..1. */
  cvr: number
  /** Organic channels whose proven performance informs this channel. */
  provenFrom: ChannelId[]
}
/** Per-channel benchmark overrides (the editable spreadsheet cells). */
export type MixOverrides = Partial<Record<ChannelId, Partial<{ cpm: number; ctr: number; cvr: number }>>>

/** A saved, named media mix — a goal/budget/risk scenario per brand, selectable. */
export interface MediaMix {
  id: string
  brand: string
  name: string
  goal: MixGoal
  budget: number
  risk: MixRisk
  overrides: MixOverrides
  /** User-added channels beyond the default benchmark set. */
  extraChannels?: MixChannel[]
  /** Default benchmark channels the user removed from this mix. */
  hiddenChannels?: ChannelId[]
}