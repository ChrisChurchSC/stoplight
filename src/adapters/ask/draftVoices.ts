import type { DraftOrigin } from './draftAudiences'
/**
 * Asks the server /api/draft-voices endpoint (Claude) to draft brand voice profiles, with a
 * heuristic fallback when the backend is absent, has no key (501), or errors.
 */
export interface DraftedVoice {
  name: string
  summary: string
  tone: string
  dos: string
  donts: string
  sample: string
  useFor: string
}

export interface DraftVoicesInput {
  brand: string
  oneLiner?: string
  positioning?: string
  descriptor?: string
  differentiator?: string
  businessObjective?: string
  industry?: string
  existing?: string[]
  count?: number
  /** The brand's real published copy + measured reach. When present, the voice is derived from how
   *  the brand ACTUALLY writes (analyzed from its real work), not just its description. */
  samples?: { text: string; channel?: string; reach?: number }[]
}

function heuristicVoices(input: DraftVoicesInput): DraftedVoice[] {
  const b = input.brand || 'the brand'
  return [
    {
      name: 'Confident and plain-spoken',
      summary: `The primary voice: clear, direct, and credible, for most of ${b}'s marketing.`,
      tone: 'Confident, clear, direct, warm',
      dos: 'Lead with the point; use plain words; back claims with specifics',
      donts: 'Hype; jargon; hedging',
      sample: `${b} does the busywork so you can focus on the work that matters.`,
      useFor: 'Website, email, landing pages',
    },
  ]
}

export interface DraftedVoiceResult { items: DraftedVoice[]; origin: DraftOrigin; status?: number }

export async function draftVoices(input: DraftVoicesInput): Promise<DraftedVoiceResult> {
  try {
    const res = await fetch('/api/draft-voices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-voices ${res.status}`)
    const data = (await res.json()) as { voices?: DraftedVoice[] }
    const voices = (data.voices ?? []).filter((v) => v?.name)
    if (!voices.length) throw new Error('empty')
    return { items: voices, origin: 'model' }
  } catch {
    return { items: heuristicVoices(input), origin: 'fallback' }
  }
}
