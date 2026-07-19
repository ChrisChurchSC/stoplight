/**
 * Asks the server /api/draft-brand-profile endpoint (Claude) to fill a brand's strategy record
 * (positioning, objectives, audience, differentiator, ...) from its real published content. Returns
 * null on any failure so the caller can skip it cleanly.
 */
export interface BrandProfileDraft {
  oneLiner: string
  descriptor: string
  industry: string
  positioning: string
  businessObjective: string
  commsObjective: string
  primaryAudience: string
  audienceInsight: string
  competitiveContext: string
  differentiator: string
}

export interface DraftBrandProfileInput {
  brand: string
  oneLiner?: string
  industry?: string
  positioning?: string
  /** The brand's real published copy + measured reach, the material the profile is derived from. */
  samples?: { text: string; channel?: string; reach?: number }[]
}

export async function draftBrandProfile(input: DraftBrandProfileInput): Promise<Partial<BrandProfileDraft> | null> {
  try {
    const res = await fetch('/api/draft-brand-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<BrandProfileDraft>
    return data && typeof data === 'object' && data.positioning ? data : null
  } catch {
    return null
  }
}
