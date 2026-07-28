import { archetypeLabel, proofTypeFor } from './archetypes'
import type { OutcomeRow } from './outcomeMap'

/**
 * The anonymized unit a workspace contributes to the cross-customer pool. Deliberately carries NO
 * brand, client, asset, or copy — only a normalized (dimension × archetype × attribute) key, the
 * variant count, and a summed outcome, tagged with an opaque `contributor` (a hash of the
 * workspace, for distinct-customer floor counting, never reversible to a name). One row per pattern
 * per workspace; the pool re-identifies nothing because reads are floor-gated + aggregated.
 */
export interface AggregateContribution {
  contributor: string
  dimension: 'rtb' | 'channel' | 'stage' | 'strategy'
  archetype: string
  attribute: string
  variants: number
  outcome: number
}

/** The normalized attribute value(s) a row contributes for a dimension. */
const attrsFor = (row: OutcomeRow, dim: AggregateContribution['dimension']): string[] => {
  switch (dim) {
    case 'rtb':
      return [...new Set(row.attributes.rtbs.map((r) => archetypeLabel(proofTypeFor(r.label))))]
    case 'channel':
      return [String(row.attributes.channel)]
    case 'stage':
      return [row.attributes.stage]
    case 'strategy':
      return row.attributes.strategy ? [row.attributes.strategy] : []
  }
}

const DIMS: AggregateContribution['dimension'][] = ['rtb', 'channel', 'stage', 'strategy']

/** Roll a workspace's outcome rows into anonymized contributions, keyed by archetype + attribute. */
export function buildContributions(rows: OutcomeRow[], contributor: string): AggregateContribution[] {
  const acc = new Map<string, AggregateContribution>()
  for (const row of rows) {
    const archetype = row.attributes.archetype
    const outcome = row.outcomes.revenue || row.outcomes.leads || row.outcomes.clicks || 0
    for (const dim of DIMS) {
      for (const attribute of attrsFor(row, dim)) {
        const key = `${dim}::${archetype}::${attribute}`
        const cur = acc.get(key) ?? { contributor, dimension: dim, archetype, attribute, variants: 0, outcome: 0 }
        cur.variants += 1
        cur.outcome += outcome
        acc.set(key, cur)
      }
    }
  }
  return [...acc.values()]
}
