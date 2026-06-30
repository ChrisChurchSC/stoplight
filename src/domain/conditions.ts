import type { AudienceType } from './audiences'
import type { LibraryCta, LibraryHook } from './library'
import type { Rtb } from './rtb'

/**
 * Conditional logic over personalization fan-out: "if audience = X then use proof Y",
 * "if journey = lapsed then lead win-back". Conditions make fan-out intelligent — the
 * right asset per condition, and only the sensible combinations.
 *
 * The CONTRACT (non-negotiable): the intelligence PROPOSES the if/thens and the human
 * APPROVES them. There is no manual rule-builder as the primary interface. The
 * deterministic proposer below reads the associations the brand's library already
 * encodes (an audience's owned proof, its angle, a win-back CTA) and surfaces them as
 * plain-language conditions to confirm; the Claude path proposes subtler ones on top.
 */

export type ConditionThen =
  | { kind: 'proof'; rtbId: string; label: string }
  | { kind: 'hook'; text: string }
  | { kind: 'cta'; label: string }
  | { kind: 'exclude' }

export type ConditionStatus = 'proposed' | 'approved' | 'rejected'

export interface FanCondition {
  id: string
  /** The trigger: a partial lineage match (every key must equal the variant's value). */
  when: Record<string, string>
  then: ConditionThen
  /** Plain-language reason, so a human can confirm without reading code. */
  rationale: string
  confidence: 'low' | 'medium' | 'high'
  status: ConditionStatus
}

/** A condition stated the way a human reads it: "If audience is X, lead with its angle." */
export function conditionSentence(c: FanCondition): string {
  const when = Object.entries(c.when)
    .map(([k, v]) => `${k} is ${v}`)
    .join(' and ')
  const then =
    c.then.kind === 'proof'
      ? `use the proof "${c.then.label}"`
      : c.then.kind === 'hook'
        ? `lead with "${c.then.text}"`
        : c.then.kind === 'cta'
          ? `use the CTA "${c.then.label}"`
          : `skip this combination`
  return `If ${when}, ${then}.`
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 32)
const firstClause = (s: string) => (s || '').split(/[.;\n]/)[0].trim()
const condId = (when: Record<string, string>, then: ConditionThen) =>
  `cond-${Object.entries(when).map(([k, v]) => `${k}:${slug(v)}`).join('-')}-${then.kind}${'rtbId' in then ? '-' + slug(then.rtbId) : ''}`

export interface ProposeInput {
  audiences: AudienceType[]
  rtbs: Rtb[]
  ctas: LibraryCta[]
  hooks: LibraryHook[]
  /** The dimension values actually present in the campaign (audience names, locations, …). */
  present: Record<string, string[]>
}

/**
 * Propose conditions from the library's existing associations. Deterministic floor:
 * an audience's owned proof becomes "if audience = A then proof", its angle becomes a
 * hook, a lifecycle value matched to a fitting CTA becomes a CTA rule. Every proposal
 * lands as `status: 'proposed'` for a human to approve.
 */
export function proposeConditions(input: ProposeInput): FanCondition[] {
  const { audiences, rtbs, ctas, present } = input
  const out: FanCondition[] = []
  const seen = new Set<string>()
  const push = (when: Record<string, string>, then: ConditionThen, rationale: string, confidence: FanCondition['confidence']) => {
    const id = condId(when, then)
    if (seen.has(id)) return
    seen.add(id)
    out.push({ id, when, then, rationale, confidence, status: 'proposed' })
  }

  const presentAudiences = new Set((present.audience ?? []).map((a) => a.toLowerCase()))
  for (const a of audiences) {
    if (presentAudiences.size && !presentAudiences.has(a.name.toLowerCase())) continue
    // audience -> proof: its own RTB, an RTB tagged to it, or one it emphasizes.
    const owned =
      a.rtbs?.[0] ??
      rtbs.find((r) => r.audienceId === a.name) ??
      rtbs.find((r) => a.rtbEmphasis?.includes(r.id))
    if (owned)
      push(
        { audience: a.name },
        { kind: 'proof', rtbId: owned.id, label: owned.label },
        `${a.name} respond to "${owned.label}", so lean on it for their variants.`,
        'medium',
      )
    // audience -> hook: lead with the audience's own angle.
    const angle = firstClause(a.messageAngle)
    if (angle)
      push(
        { audience: a.name },
        { kind: 'hook', text: angle },
        `Open ${a.name}'s variants on their angle: "${angle}".`,
        'medium',
      )
  }

  // lifecycle -> CTA: match a fitting CTA to a lifecycle value present in the campaign.
  const lifecycleRules: { match: RegExp; cta: RegExp; why: (v: string, cta: string) => string }[] = [
    { match: /laps|dormant|win.?back|churn|inactive/i, cta: /back|return|miss|again|renew|reactivat/i, why: (v, c) => `Lapsed contacts need a win-back, so "${c}" fits ${v}.` },
    { match: /new|prospect|cold|subscriber/i, cta: /start|try|get started|free|join|sign/i, why: (v, c) => `New contacts convert on a low-friction start, so "${c}" fits ${v}.` },
  ]
  for (const v of present.lifecycle ?? []) {
    for (const rule of lifecycleRules) {
      if (!rule.match.test(v)) continue
      const cta = ctas.find((c) => rule.cta.test(c.label))
      if (cta) push({ lifecycle: v }, { kind: 'cta', label: cta.label }, rule.why(v, cta.label), 'medium')
    }
  }

  return out
}

/** Resolve the approved conditions matching a variant's context into the overrides to
 *  apply (the right proof / hook / CTA, or pruned). Later matches win per kind. */
export function resolveConditions(
  ctx: Record<string, string>,
  conditions: FanCondition[],
): { proofId?: string; hook?: string; cta?: string; exclude?: boolean } {
  const lc = (s: string) => (s ?? '').toLowerCase()
  const matched = conditions.filter(
    (c) => c.status === 'approved' && Object.entries(c.when).every(([k, v]) => lc(ctx[k]) === lc(v)),
  )
  const out: { proofId?: string; hook?: string; cta?: string; exclude?: boolean } = {}
  for (const c of matched) {
    if (c.then.kind === 'proof') out.proofId = c.then.rtbId
    else if (c.then.kind === 'hook') out.hook = c.then.text
    else if (c.then.kind === 'cta') out.cta = c.then.label
    else if (c.then.kind === 'exclude') out.exclude = true
  }
  return out
}
