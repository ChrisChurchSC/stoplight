/**
 * Audience types: the named personas under a client's ICP. Each carries its own
 * message angle, RTB emphasis (which proof points resonate), and a tied campaign
 * strategy — so personalization is structured, not improvised. Assets that
 * target an audience inherit its angle + proof emphasis (see the messaging
 * column); the cross-variant coherence check reads this as the "audience" axis.
 *
 * Grounded in the ICP and refined by closed-won data over time. Kept to a small
 * named set per client (3-5) so each audience stays meaningfully distinct.
 */
export interface AudienceType {
  id: string
  name: string
  /** How the promise is framed for this buyer's pains, language, and context. */
  messageAngle: string
  /** RTB ids this audience leans on (emphasis) — a subset of the campaign RTBs. */
  rtbEmphasis: string[]
  /** GTM strategy key tied to this audience (its reach + convert playbook). */
  strategy: string
}

export function freshAudienceId(): string {
  return `aud_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
}
