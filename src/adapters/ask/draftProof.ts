import type { DraftOrigin } from './draftAudiences'
/**
 * Asks the server /api/draft-proof endpoint (which calls Claude) to draft proof points for a brand,
 * and falls back to a small heuristic set when the backend is absent, has no key (501), or errors —
 * so the chat's "draft proof points" action always produces something to work from.
 */
export interface DraftedProof {
  label: string
  detail: string
}

export interface DraftProofInput {
  brand: string
  oneLiner?: string
  industry?: string
  positioning?: string
  descriptor?: string
  keyMessage?: string
  differentiator?: string
  businessObjective?: string
  audiences?: string[]
  /** Labels of proof points that already exist, so the AI writes new, distinct ones. */
  existing?: string[]
  count?: number
  /** The brand's real published copy + measured reach. When present, proof points are grounded in
   *  the brand's actual work and may cite the real reach figures provided (never invented ones). */
  samples?: { text: string; channel?: string; reach?: number }[]
}

function heuristicProof(input: DraftProofInput): DraftedProof[] {
  // Ground the fallback in the DESCRIPTION, never the brand name.
  const what = input.oneLiner || input.positioning || input.descriptor || 'what it does'
  const b = input.brand || 'The brand'
  const aud = (input.audiences ?? []).filter(Boolean).join(' and ') || 'its core audience'
  return [
    { label: 'Built for the outcome', detail: `${b} is designed around the results ${what.toLowerCase().startsWith(b.toLowerCase()) ? 'it delivers' : `of ${what}`}, not a list of features.` },
    { label: 'Fast to value', detail: `Customers get value quickly, without a long or painful setup.` },
    { label: 'Made for its audience', detail: `Built for ${aud} and their real needs.` },
  ]
}

export interface DraftedProofResult { items: DraftedProof[]; origin: DraftOrigin; status?: number }

export async function draftProof(input: DraftProofInput): Promise<DraftedProofResult> {
  try {
    const res = await fetch('/api/draft-proof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-proof ${res.status}`)
    const data = (await res.json()) as { proofPoints?: DraftedProof[] }
    const proof = (data.proofPoints ?? []).filter((p) => p?.label && p?.detail)
    if (!proof.length) throw new Error('empty')
    return { items: proof, origin: 'model' }
  } catch {
    return { items: heuristicProof(input), origin: 'fallback' }
  }
}
