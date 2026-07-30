/**
 * Asks the server /api/draft-angle endpoint (Claude) to RECOMMEND, for each audience, the three
 * interpretive fields a user shouldn't have to author from a blank sheet: a message angle, a funnel
 * stage, and a conversion outcome, each with a visible rationale. Falls back to a rule-based
 * heuristic when the backend is absent, has no key (501), or errors — so the recommend action is
 * never a dead button. Mirrors the draftChannels contract.
 */
import { FUNNEL_STAGES, type FunnelStage } from '../../domain/funnel'
import { apiFetch } from '../../lib/apiFetch'

export interface DraftedAngle {
  /** The audience this recommendation is for (matched by name). */
  audience: string
  messageAngle: string
  /** A funnel stage KEY (lowercase), not a label — the caller maps key -> label for display. */
  funnelStage: FunnelStage
  /** The conversion outcome (free string, biased toward the shared OUTCOMES vocabulary). */
  outcome: string
  /** Why this pick — shown to the user so they can trust or edit it. */
  rationale: string
  confidence: 'low' | 'medium' | 'high'
  /** The signals the call was grounded in. */
  signalsUsed: string[]
}

export interface DraftAngleInput {
  brand: string
  /** The brand's business objective — the primary signal for stage + outcome. */
  businessObjective?: string
  oneLiner?: string
  positioning?: string
  industry?: string
  /** Observable facts per audience; the recommender infers the interpretive fields from these. */
  audiences: {
    name: string
    role?: string
    definition?: string
    pains?: string[]
    goalTags?: string[]
    triggers?: string[]
    /** A one-line demographic/psychographic summary (age / income / geo / gender), if known. */
    demographics?: string
  }[]
  samples?: { text: string; channel?: string; reach?: number }[]
}

const STAGE_KEYS = FUNNEL_STAGES.map((s) => s.stage)

/** Coerce any value (a lowercase key, a capitalized FUNNEL_STAGES label, or junk) to a valid
 *  FunnelStage key. Used both to normalize the model's output and to reconcile audiences that
 *  historically persisted a capitalized label. */
export function normFunnelStage(v: string | undefined): FunnelStage {
  const s = (v || '').trim().toLowerCase()
  if ((STAGE_KEYS as string[]).includes(s)) return s as FunnelStage
  const byLabel = FUNNEL_STAGES.find((f) => f.label.toLowerCase() === s)
  return byLabel ? byLabel.stage : 'consideration'
}

function pickOutcome(objective: string, pains: string[]): string {
  const t = `${objective} ${pains.join(' ')}`.toLowerCase()
  const map: [RegExp, string][] = [
    [/donat|fundrais|charit/, 'Donate'],
    [/subscrib|newsletter|member/, 'Subscribe'],
    [/invest|raise|capital/, 'Invest'],
    [/podcast|listen|episode/, 'Listen to the podcast'],
    [/screen|film|premiere/, 'Attend a screening'],
    [/volunteer/, 'Volunteer'],
    [/partner|reseller|affiliate/, 'Partner'],
    [/buy|purchase|pricing|checkout|shop|ecommerce/, 'Buy'],
    [/refer|word of mouth|advocate/, 'Share'],
  ]
  for (const [re, out] of map) if (re.test(t)) return out
  return 'Sign up'
}

function pickStage(pains: string[], triggers: string[], objective: string): FunnelStage {
  const t = `${pains.join(' ')} ${triggers.join(' ')} ${objective}`.toLowerCase()
  if (/renew|retain|churn|loyal|upsell|existing customer|repeat/.test(t)) return 'retention'
  if (/pricing|buy|purchase|demo|trial|quote|checkout|convert|sign up/.test(t)) return 'conversion'
  if (/aware|discover|new to|never heard|introduce|reach|top of funnel/.test(t)) return 'awareness'
  return 'consideration'
}

function heuristicAngle(input: DraftAngleInput): DraftedAngle[] {
  const obj = input.businessObjective || ''
  return input.audiences.map((a) => {
    const pains = a.pains ?? []
    const triggers = a.triggers ?? []
    const funnelStage = pickStage(pains, triggers, obj)
    const outcome = pickOutcome(obj, pains)
    const who = a.role || a.definition || a.name
    const lead = pains[0] ? `lead with ${pains[0].toLowerCase()}` : 'lead with the core value'
    const messageAngle = `For ${who}: ${lead}, then point them to ${outcome.toLowerCase()}.`
    const signalsUsed = [
      a.role ? `role: ${a.role}` : null,
      pains.length ? `pains: ${pains.slice(0, 2).join(', ')}` : null,
      a.demographics ? `who: ${a.demographics}` : null,
      obj ? `objective: ${obj}` : null,
    ].filter((x): x is string => !!x)
    return {
      audience: a.name,
      messageAngle,
      funnelStage,
      outcome,
      rationale: `Inferred from ${signalsUsed.length ? signalsUsed.join('; ') : 'the audience name'}. Heuristic pick (no AI key) — edit as needed.`,
      confidence: 'low',
      signalsUsed,
    }
  })
}

export async function draftAngle(input: DraftAngleInput): Promise<DraftedAngle[]> {
  try {
    const res = await apiFetch('/api/draft-angle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-angle ${res.status}`)
    const data = (await res.json()) as { angles?: DraftedAngle[] }
    const angles = (data.angles ?? []).filter((a) => a?.audience && a?.messageAngle)
    if (!angles.length) throw new Error('empty')
    // Normalize the model's funnelStage to a valid key even if it returned a label.
    return angles.map((a) => ({ ...a, funnelStage: normFunnelStage(a.funnelStage as unknown as string) }))
  } catch {
    return heuristicAngle(input)
  }
}
