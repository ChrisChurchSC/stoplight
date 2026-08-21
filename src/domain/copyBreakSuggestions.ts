import type { Suggestion } from './campaignReview'

/**
 * TURNING COPY BREAKS INTO REVIEW FINDINGS, AND KEEPING THEM APART WHILE YOU DO IT.
 *
 * A coherence break carries a stable id. The review used to throw it away and match findings to
 * their fixes by HEADLINE TEXT, which is not an identity: VOICE_RULES emits static strings, so every
 * em-dash finding in a campaign says "This copy uses an em dash." — the same nineteen times across
 * nineteen assets. A Map keyed on that keeps the last one written.
 *
 * The result was eighteen findings printing a breakId that belonged to a different asset, and naming
 * that asset as the place to look. Acting on the review then rewrote copy on an asset the person had
 * never selected, with no undo behind it.
 *
 * Not only voice rules. The proof-gap and weak-CTA headlines template on the COPY ("Learn more"),
 * not on the asset, so two assets sharing a CTA collided in exactly the same way.
 *
 * Pure, because the collision is a property of a SET — one finding cannot demonstrate it, and the
 * check that produces these runs a model and a whole store behind it.
 */

export interface CheckBreak {
  id: string
  axis: string
  severity: string
  headline: string
  /** The asset this break is about, carried on the break itself. */
  asset: string
  field: string
}

export interface CheckFix {
  id: string
  asset: string
}

const SEVERITIES = ['high', 'medium', 'low'] as const

export function copyBreakSuggestions(breaks: CheckBreak[], fixable: CheckFix[]): Suggestion[] {
  const fixableById = new Map(fixable.map((f) => [f.id, f]))
  return breaks.map((b) => ({
    kind: 'copy-break' as never,
    severity: ((SEVERITIES as readonly string[]).includes(b.severity) ? b.severity : 'medium') as 'high' | 'medium' | 'low',
    what: b.headline,
    why: `A ${b.axis} break in the campaign's copy.`,
    /**
     * The break's OWN asset, not the matched fix's. Reading it off the fix meant a break with no
     * mechanical fix reported no location at all — and a mis-matched one confidently reported
     * somebody else's asset.
     */
    where: b.asset ? { assetName: b.asset } : {},
    /**
     * A break with a mechanical fix says so; the rest need a real edit, and offering apply_fix for
     * those would be promising a button that does nothing.
     */
    fix: fixableById.has(b.id)
      ? `apply_fix(breakId: "${b.id}")`
      : 'Edit, reject or delete the asset — no mechanical fix for this one.',
  }))
}
