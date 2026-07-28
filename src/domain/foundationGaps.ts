import type { AudienceType } from './audiences'
import type { StageCoverage } from './presence'
import { assetRtbIds, type Rtb } from './rtb'
import type { TrafficRow } from './types'

/**
 * One consolidated read of where a brand's Foundation + live messaging is thin:
 * uncovered journey stages, posts that ask for nothing, claims with no proof,
 * proof never deployed, audiences with no outcome or no content, and outcomes
 * that no CTA actually drives. Sorted worst-first so the operator sees, at a
 * glance, what to fix. This is onboarding-as-diagnosis made standing.
 */
export interface FoundationGap {
  key: string
  label: string
  detail: string
  severity: 'high' | 'medium' | 'low'
}

const ctaOf = (r: TrafficRow) => ((r.messaging ?? {}) as Record<string, string | undefined>).cta ?? ''
const textOf = (r: TrafficRow) => Object.values(r.messaging ?? {}).join(' ')

// CTA language that satisfies a desired outcome.
const OUTCOME_CTA: Record<string, RegExp> = {
  Donate: /donate|giving|wefunder|invest|\bfund|capital|match/i,
  Invest: /invest|wefunder|capital|\bfund|campaign|match/i,
  Subscribe: /subscribe|newsletter/i,
  'Listen to the podcast': /listen|spotify|apple|podcast|link in bio|episode|watch/i,
  'Attend a screening': /tickets|screening|rsvp|attend/i,
  Partner: /partner|collaborat|reach out|contact|work with/i,
  Volunteer: /volunteer|get involved|join us/i,
  'Sign up': /sign up|register/i,
  Buy: /buy|shop|order|store/i,
  Share: /share|tag|repost/i,
}

const first = (s: string) => s.split(/[\s&]/)[0]

export function foundationGaps(opts: {
  rows: TrafficRow[]
  audiences: AudienceType[]
  pool: Rtb[]
  journey: StageCoverage[]
  voiceConfirmed: boolean
}): FoundationGap[] {
  const { rows, audiences, pool, journey, voiceConfirmed } = opts
  const gaps: FoundationGap[] = []

  // Channels — journey stages with no channel at all.
  for (const s of journey) {
    if (s.covered) continue
    gaps.push({
      key: `journey-${s.stage}`,
      label: `No ${s.label.toLowerCase()} channel`,
      detail: `${s.hint}. Add ${s.suggest.join(', ')}.`,
      severity: s.stage === 'conversion' || s.stage === 'retention' ? 'high' : 'medium',
    })
  }

  // CTAs — posts that ask for nothing.
  const noCta = rows.filter((r) => !ctaOf(r).trim()).length
  if (noCta)
    gaps.push({
      key: 'cta-none',
      label: `${noCta} posts have no CTA`,
      detail: 'Dead ends — they put the brand out there but ask the audience to do nothing.',
      severity: 'medium',
    })

  // RTBs — claims with no proof attached.
  const unsupported = rows.filter((r) => textOf(r).trim() && assetRtbIds(r).length === 0).length
  if (unsupported)
    gaps.push({
      key: 'rtb-unsupported',
      label: `${unsupported} claims with no proof`,
      detail: 'Messaging that makes a claim with no RTB behind it.',
      severity: 'medium',
    })

  // RTBs — proof the brand has but never deploys.
  const used = new Set(rows.flatMap((r) => assetRtbIds(r)))
  const unused = pool.filter((p) => !used.has(p.id))
  if (unused.length)
    gaps.push({
      key: 'rtb-unused',
      label: `${unused.length} proof point${unused.length === 1 ? '' : 's'} never used`,
      detail: `Proof you have but aren't deploying: ${unused.slice(0, 3).map((p) => p.label).join(', ')}${unused.length > 3 ? '…' : ''}.`,
      severity: 'low',
    })

  // Audiences — no outcome chosen.
  const noOutcome = audiences.filter((a) => !(a.outcome ?? '').trim())
  if (noOutcome.length)
    gaps.push({
      key: 'aud-no-outcome',
      label: `${noOutcome.length} audience${noOutcome.length === 1 ? '' : 's'} with no outcome`,
      detail: `Set what each should do: ${noOutcome.slice(0, 2).map((a) => first(a.name)).join(', ')}${noOutcome.length > 2 ? '…' : ''}.`,
      severity: 'medium',
    })

  // Audiences — defined but no live content targets them.
  const perAudience = new Map<string, number>()
  for (const r of rows) {
    const a = (r.audience ?? '').trim()
    if (a) perAudience.set(a, (perAudience.get(a) ?? 0) + 1)
  }
  const noContent = audiences.filter((a) => !perAudience.get(a.name))
  if (noContent.length)
    gaps.push({
      key: 'aud-no-content',
      label: `${noContent.length} audience${noContent.length === 1 ? '' : 's'} with no live content`,
      detail: `Defined but unaddressed in-market: ${noContent.slice(0, 2).map((a) => first(a.name)).join(', ')}.`,
      severity: 'high',
    })

  // Outcomes — an outcome no CTA actually drives for that audience.
  for (const a of audiences) {
    const outcome = (a.outcome ?? '').trim()
    const re = outcome ? OUTCOME_CTA[outcome] : undefined
    if (!re) continue
    const audRows = rows.filter((r) => (r.audience ?? '').trim() === a.name)
    if (audRows.length === 0) continue
    const supported = audRows.some((r) => re.test(ctaOf(r)) || re.test(textOf(r)))
    if (!supported)
      gaps.push({
        key: `outcome-${a.id}`,
        label: `"${outcome}" not driven for ${first(a.name)}…`,
        detail: `${audRows.length} posts reach this audience, none push them to ${outcome.toLowerCase()}.`,
        severity: 'high',
      })
  }

  // Descriptors — voice not confirmed (the off-brand check needs it).
  if (!voiceConfirmed)
    gaps.push({
      key: 'voice',
      label: 'Brand voice not confirmed',
      detail: 'Confirm the descriptors so off-brand drift gets flagged.',
      severity: 'low',
    })

  const rank = { high: 0, medium: 1, low: 2 }
  return gaps.sort((a, b) => rank[a.severity] - rank[b.severity])
}
