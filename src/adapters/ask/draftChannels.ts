/**
 * Asks the server /api/draft-channels endpoint (Claude) to recommend which of the supported channels
 * fit a brand, with a heuristic fallback when the backend is absent, has no key (501), or errors.
 * The AI only picks from `channelOptions`; the caller resolves the picks to channel ids.
 */
export interface RecommendedChannel {
  name: string
  why: string
}

export interface DraftChannelsInput {
  brand: string
  oneLiner?: string
  positioning?: string
  businessObjective?: string
  industry?: string
  audiences?: string[]
  /** The exact channel labels the app supports; the AI must pick from these. */
  channelOptions: string[]
  /** Live traffic mix from connected analytics (GA4 / Search Console): how audiences reach this brand
   *  today. When present, the recommender weights toward proven sources and flags underused ones. */
  performance?: { label: string; reach: number; reachUnit: string; engagement?: number }[]
  /** Anonymized cross-customer learning (floor-gated): channels proven to drive outcomes for a given
   *  persona archetype, each backed by N distinct customers. Empty until the pool clears the floor. */
  patterns?: { attribute: string; archetype: string; customers: number; outcomePerVariant: number }[]
}

function heuristicChannels(input: DraftChannelsInput): RecommendedChannel[] {
  // A sensible default owned + earned + paid mix, restricted to what the app offers.
  const prefer = ['Email', 'Website', 'Blog', 'Organic LinkedIn', 'Google Search Ads', 'LinkedIn Ads']
  const picks = prefer.filter((p) => input.channelOptions.some((o) => o.toLowerCase() === p.toLowerCase()))
  const use = (picks.length ? picks : input.channelOptions.slice(0, 5))
  return use.slice(0, 5).map((name) => ({ name, why: 'A default fit for reaching this brand\'s audiences.' }))
}

export async function draftChannels(input: DraftChannelsInput): Promise<RecommendedChannel[]> {
  try {
    const res = await fetch('/api/draft-channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-channels ${res.status}`)
    const data = (await res.json()) as { channels?: RecommendedChannel[] }
    const chans = (data.channels ?? []).filter((c) => c?.name)
    if (!chans.length) throw new Error('empty')
    return chans
  } catch {
    return heuristicChannels(input)
  }
}
