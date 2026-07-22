import type { DraftOrigin } from './draftAudiences'
/**
 * Asks the server /api/draft-ctas endpoint (which calls Claude) to draft reusable CTAs for a brand,
 * spread across the funnel, and falls back to a small heuristic set when the backend is absent, has no
 * key (501), or errors — so the brand-build flow always produces some CTAs to work from.
 */
export interface DraftedCta {
  label: string
  stage?: string
  outcome?: string
}

export interface DraftCtaInput {
  brand: string
  oneLiner?: string
  industry?: string
  positioning?: string
  descriptor?: string
  keyMessage?: string
  differentiator?: string
  businessObjective?: string
  commsObjective?: string
  audiences?: string[]
  /** Labels of CTAs that already exist, so the AI writes new, distinct ones. */
  existing?: string[]
  count?: number
  /** The brand's real published copy + measured reach, so CTAs fit its voice and offers. */
  samples?: { text: string; channel?: string; reach?: number }[]
}

function heuristicCtas(): DraftedCta[] {
  // A generic funnel spread — used only when the model is unavailable.
  return [
    { label: 'Learn more', stage: 'awareness', outcome: 'Page visit' },
    { label: 'See how it works', stage: 'consideration', outcome: 'Product understanding' },
    { label: 'Get started', stage: 'conversion', outcome: 'Signup' },
    { label: 'Book a call', stage: 'conversion', outcome: 'Booked meeting' },
    { label: 'Subscribe for updates', stage: 'awareness', outcome: 'Newsletter signup' },
  ]
}

export interface DraftedCtaResult { items: DraftedCta[]; origin: DraftOrigin; status?: number }

export async function draftCtas(input: DraftCtaInput): Promise<DraftedCtaResult> {
  try {
    const res = await fetch('/api/draft-ctas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-ctas ${res.status}`)
    const data = (await res.json()) as { ctas?: DraftedCta[] }
    const ctas = (data.ctas ?? []).filter((c) => c?.label)
    if (!ctas.length) throw new Error('empty')
    return { items: ctas, origin: 'model' }
  } catch {
    return { items: heuristicCtas(), origin: 'fallback' }
  }
}
