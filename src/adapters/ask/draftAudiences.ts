/**
 * Asks the server /api/draft-audiences endpoint (which calls Claude) to define target audiences for
 * a brand, and falls back to a small heuristic set when the backend is absent, has no key (501), or
 * errors, so the chat's "add audiences" action always produces something.
 */
export interface DraftedAudience {
  name: string
  definition: string
  role: string
  pains: string[]
  messageAngle: string
  outcome: string
}

export interface DraftAudiencesInput {
  brand: string
  oneLiner?: string
  positioning?: string
  descriptor?: string
  differentiator?: string
  businessObjective?: string
  industry?: string
  existing?: string[]
  count?: number
}

function heuristicAudiences(input: DraftAudiencesInput): DraftedAudience[] {
  const what = input.oneLiner || input.positioning || 'what it does'
  return [
    { name: 'Team leads', definition: `The people who own the outcome ${what.toLowerCase()} drives and feel the pain when it's slow.`, role: 'Team lead', pains: ['Too much manual work', 'Slow to show results'], messageAngle: `Get to the outcome faster with less manual effort.`, outcome: 'Adopt and expand' },
    { name: 'Operations owners', definition: `The people responsible for the tooling and process behind the work.`, role: 'Operations', pains: ['Tool sprawl', 'Fragmented data'], messageAngle: `Consolidate the stack and remove the busywork.`, outcome: 'Consolidate and standardize' },
    { name: 'Executive sponsors', definition: `The leaders who care about the business impact and consistency at scale.`, role: 'VP / Director', pains: ['Inconsistent output', 'Hard to prove ROI'], messageAngle: `Scale results without losing consistency or control.`, outcome: 'Justify the investment' },
  ]
}

export async function draftAudiences(input: DraftAudiencesInput): Promise<DraftedAudience[]> {
  try {
    const res = await fetch('/api/draft-audiences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-audiences ${res.status}`)
    const data = (await res.json()) as { audiences?: DraftedAudience[] }
    const auds = (data.audiences ?? []).filter((a) => a?.name && a?.definition)
    if (!auds.length) throw new Error('empty')
    return auds
  } catch {
    return heuristicAudiences(input)
  }
}
