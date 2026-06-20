import type { OutcomeRow } from './outcomeMap'

/**
 * The aggregate learning layer — the proprietary, compounding asset.
 *
 * This is the ONLY place per-customer outcome rows turn into shareable insight,
 * and it is deliberately one-way: it emits anonymized patterns (attribute → outcome,
 * by audience type) plus the count of distinct customers behind each, and NEVER a
 * client name, asset, or raw row. A pattern is withheld until at least `floor`
 * distinct customers stand behind it, so nothing is re-identifiable — critical for
 * agencies running competing clients.
 *
 * The architectural boundary: outcomeMap.ts is the customer's operational data;
 * this module is the aggregate derived from it. They never mix identifying data.
 */

export type PatternDimension = 'rtb' | 'channel' | 'stage' | 'strategy'

export interface Pattern {
  dimension: PatternDimension
  audienceType: string
  /** The attribute value (RTB label, channel id, stage, strategy) — never a client. */
  attribute: string
  /** Distinct customers behind this pattern (the anonymity guarantee). */
  customers: number
  variants: number
  revenue: number
  revenuePerVariant: number
}

export interface AggregateResult {
  floor: number
  /** Account-wide contribution switch. Off → the account neither contributes nor reads. */
  contributing: boolean
  /** Distinct customers in the data set overall. */
  totalCustomers: number
  /** Most distinct customers behind any single pattern — how close the strongest
   *  pattern is to clearing the floor (drives the progress bar). */
  bestPatternCustomers: number
  /** Patterns that clear the floor — safe to surface, fully anonymized. */
  unlocked: Pattern[]
  /** Patterns still below the floor, summarized (count only — never their content). */
  lockedCount: number
  /** How many more distinct customers the strongest pattern needs to unlock. */
  customersNeeded: number
}

const dimensionOf = (row: OutcomeRow, dim: PatternDimension): string[] => {
  switch (dim) {
    case 'rtb':
      return row.attributes.rtbs.map((r) => r.label)
    case 'channel':
      return [row.attributes.channel]
    case 'stage':
      return [row.attributes.stage]
    case 'strategy':
      return row.attributes.strategy ? [row.attributes.strategy] : []
  }
}

const DIMENSIONS: PatternDimension[] = ['rtb', 'channel', 'stage', 'strategy']

/**
 * Aggregate outcome rows (drawn from across customers) into anonymized patterns.
 * Pass the full multi-customer set; grouping is by (audience type × attribute),
 * and the customer set behind each group is what the floor is measured against.
 */
export function aggregatePatterns(
  rows: OutcomeRow[],
  opts: { floor: number; contributing: boolean },
): AggregateResult {
  const totalCustomers = new Set(rows.map((r) => r.attributes.client)).size

  if (!opts.contributing) {
    return {
      floor: opts.floor,
      contributing: false,
      totalCustomers,
      bestPatternCustomers: 0,
      unlocked: [],
      lockedCount: 0,
      customersNeeded: 0,
    }
  }

  interface Acc {
    customers: Set<string>
    variants: number
    revenue: number
  }
  const groups = new Map<string, { dim: PatternDimension; audience: string; attr: string; acc: Acc }>()
  for (const row of rows) {
    const audience = row.attributes.audienceType
    for (const dim of DIMENSIONS) {
      for (const attr of dimensionOf(row, dim)) {
        const key = `${dim}::${audience}::${attr}`
        let g = groups.get(key)
        if (!g) {
          g = { dim, audience, attr, acc: { customers: new Set(), variants: 0, revenue: 0 } }
          groups.set(key, g)
        }
        g.acc.customers.add(row.attributes.client)
        g.acc.variants += 1
        g.acc.revenue += row.outcomes.revenue
      }
    }
  }

  const unlocked: Pattern[] = []
  let lockedCount = 0
  let bestPatternCustomers = 0
  for (const { dim, audience, attr, acc } of groups.values()) {
    bestPatternCustomers = Math.max(bestPatternCustomers, acc.customers.size)
    if (acc.customers.size >= opts.floor) {
      unlocked.push({
        dimension: dim,
        audienceType: audience,
        attribute: attr,
        customers: acc.customers.size,
        variants: acc.variants,
        revenue: acc.revenue,
        revenuePerVariant: acc.variants > 0 ? acc.revenue / acc.variants : 0,
      })
    } else {
      lockedCount += 1
    }
  }
  unlocked.sort((a, b) => b.revenuePerVariant - a.revenuePerVariant)

  return {
    floor: opts.floor,
    contributing: true,
    totalCustomers,
    bestPatternCustomers,
    unlocked,
    lockedCount,
    customersNeeded: Math.max(0, opts.floor - bestPatternCustomers),
  }
}
