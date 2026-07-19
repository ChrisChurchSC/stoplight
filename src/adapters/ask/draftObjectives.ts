/**
 * Asks the server /api/draft-objectives endpoint (Claude) to draft marketing objectives for a brand,
 * with a heuristic fallback when the backend is absent, has no key (501), or errors.
 */
export interface DraftedObjective {
  name: string
  metric: string
  target: string
  timeframe: string
}

export interface DraftObjectivesInput {
  brand: string
  oneLiner?: string
  positioning?: string
  differentiator?: string
  businessObjective?: string
  industry?: string
  existing?: string[]
  count?: number
  /** Live traffic mix from connected analytics: real per-channel baselines. When present, targets can
   *  be anchored to actual current numbers (from -> to) instead of being purely directional. */
  performance?: { label: string; reach: number; reachUnit: string; engagement?: number }[]
}

function heuristicObjectives(input: DraftObjectivesInput): DraftedObjective[] {
  const goal = input.businessObjective || input.oneLiner || 'the business goal'
  return [
    { name: 'Grow inbound-sourced pipeline', metric: 'Inbound MQLs', target: 'Up quarter over quarter', timeframe: 'This quarter' },
    { name: 'Improve conversion of existing traffic', metric: 'Visitor-to-lead rate', target: 'Higher than baseline', timeframe: 'This quarter' },
    { name: `Advance ${goal.toLowerCase().slice(0, 40)}`, metric: 'Attributed revenue', target: 'Directional lift', timeframe: '6 months' },
  ]
}

export interface DraftedObjectives {
  objectives: DraftedObjective[]
  reportingCadence: string
}

export async function draftObjectives(input: DraftObjectivesInput): Promise<DraftedObjectives> {
  try {
    const res = await fetch('/api/draft-objectives', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-objectives ${res.status}`)
    const data = (await res.json()) as { objectives?: DraftedObjective[]; reportingCadence?: string }
    const objs = (data.objectives ?? []).filter((o) => o?.name)
    if (!objs.length) throw new Error('empty')
    return { objectives: objs, reportingCadence: data.reportingCadence || 'Review leading indicators weekly and revenue objectives monthly.' }
  } catch {
    return { objectives: heuristicObjectives(input), reportingCadence: 'Review leading indicators weekly and revenue objectives monthly.' }
  }
}
