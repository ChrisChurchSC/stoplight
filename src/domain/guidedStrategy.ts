import { GTM_STRATEGIES } from './strategies'
import type { CampaignTiming } from './timing'

/**
 * Guided strategy selection for onboarding. The client answers plain-language
 * questions (what they want + their budget); the product translates that into the
 * strategy model (a GTM strategy + timing + concentration), recommends a smart
 * default, and they confirm. Budget actively narrows the menu: a small budget
 * steers toward concentration (acquisition/promo, one or two channels) over thin,
 * broad awareness. The client never sees the machinery.
 */

export type Objective = 'acquisition' | 'retention' | 'promo' | 'awareness'

export const OBJECTIVES: { key: Objective; label: string; sub: string }[] = [
  { key: 'acquisition', label: 'Get new customers', sub: 'Bring in people who have never bought from you.' },
  { key: 'retention', label: 'Bring back existing customers', sub: 'Re-engage, nurture, and grow people you already have.' },
  { key: 'promo', label: 'Promote something specific', sub: 'A launch, sale, or event with a clear moment.' },
  { key: 'awareness', label: 'Build broad awareness', sub: 'Get known by a wide audience over time.' },
]

export type BudgetTier = 'small' | 'modest' | 'mid' | 'large'

export const BUDGET_TIERS: { key: BudgetTier; label: string; concentrated: boolean }[] = [
  { key: 'small', label: 'Under $2k / mo', concentrated: true },
  { key: 'modest', label: '$2k – $10k / mo', concentrated: true },
  { key: 'mid', label: '$10k – $50k / mo', concentrated: false },
  { key: 'large', label: '$50k+ / mo', concentrated: false },
]

export interface StrategyRec {
  /** A GTM_STRATEGIES key. */
  strategyKey: string
  strategyName: string
  timing: CampaignTiming
  /** Plain-language scope / concentration. */
  scope: string
  /** Plain-language "why this". */
  rationale: string
  /** Set when budget overrode the stated objective (e.g. awareness on a small budget). */
  steer?: string
}

const nameFor = (key: string) => GTM_STRATEGIES.find((s) => s.key === key)?.name ?? key

const OBJ_LABEL: Record<Objective, string> = {
  acquisition: 'get new customers',
  retention: 'bring back existing customers',
  promo: 'promote something specific',
  awareness: 'build broad awareness',
}

/** Translate the plain-language answers into a recommended strategy. */
export function recommendStrategy(input: {
  objective: Objective
  budgetTier: BudgetTier
  businessModel?: string
}): StrategyRec {
  const tier = BUDGET_TIERS.find((t) => t.key === input.budgetTier)
  const concentrated = tier?.concentrated ?? true
  const isB2C = /B2C|D2C/i.test(input.businessModel ?? '')
  const budgetLabel = tier?.label ?? 'your'

  let strategyKey = 'demand-gen'
  let timing: CampaignTiming = 'always-on'
  let steer: string | undefined

  switch (input.objective) {
    case 'acquisition':
      strategyKey = isB2C ? (concentrated ? 'local-takeover' : 'demand-gen') : concentrated ? 'outbound' : 'demand-gen'
      timing = 'always-on'
      break
    case 'retention':
      strategyKey = 'lifecycle'
      timing = 'always-on'
      break
    case 'promo':
      strategyKey = 'demand-gen'
      timing = 'seasonal'
      break
    case 'awareness':
      if (concentrated) {
        // Broad awareness needs scale + patience — steer a tight budget to acquisition.
        strategyKey = isB2C ? 'local-takeover' : 'demand-gen'
        timing = 'always-on'
        steer =
          'Broad awareness needs scale and patience. On this budget a concentrated acquisition push shows results faster. You can layer awareness in once it is working.'
      } else {
        strategyKey = isB2C ? 'community' : 'content-seo'
        timing = 'always-on'
      }
      break
  }

  const scope = concentrated
    ? 'one audience, one or two channels done well'
    : 'a few audiences and channels, with room to test and scale'

  const strategyName = nameFor(strategyKey)
  const rationale = `Based on your ${budgetLabel} budget and goal to ${OBJ_LABEL[input.objective]}, we recommend starting with ${strategyName}: ${scope}.`

  return { strategyKey, strategyName, timing, scope, rationale, steer }
}
