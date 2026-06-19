import type { ChannelId } from './types'

/**
 * Audience types: the named personas under a client's ICP. Where the ICP is the
 * account-level target, an audience is a *person* inside it, with their own role,
 * pains, goals, objections, the channels to reach them on, a message angle, the
 * RTB emphasis (which proof points resonate), and a tied campaign strategy — so
 * personalization is structured, not improvised. Assets that target an audience
 * inherit its angle + proof emphasis (see the messaging column); the cross-variant
 * coherence check reads this as the "audience" axis.
 *
 * Grounded in the ICP and refined by closed-won data over time. Kept to a small
 * named set per client (3-5) so each audience stays meaningfully distinct.
 */
export interface AudienceType {
  id: string
  name: string
  /** The specific buyer/role inside the ICP (e.g. "VP of RevOps", "Founder"). */
  role: string
  /** This persona's pains — a subset of the ICP's, plus any persona-specific ones. */
  pains: string[]
  /** What this persona is trying to achieve (the outcome they're buying). */
  goals: string
  /** What makes them hesitate — objections to disarm in the messaging. */
  objections: string
  /** How the promise is framed for this buyer's pains, language, and context. */
  messageAngle: string
  /** Channels where this persona actually pays attention (where to reach them). */
  channels: ChannelId[]
  /** RTB ids this audience leans on (emphasis) — a subset of the campaign RTBs. */
  rtbEmphasis: string[]
  /** GTM strategy key tied to this audience (its reach + convert playbook). */
  strategy: string
}

/** A blank audience with every field defaulted — the one place defaults live. */
export function newAudience(patch: Partial<AudienceType> = {}): AudienceType {
  return {
    id: freshAudienceId(),
    name: '',
    role: '',
    pains: [],
    goals: '',
    objections: '',
    messageAngle: '',
    channels: [],
    rtbEmphasis: [],
    strategy: '',
    ...patch,
  }
}

/** Backfill missing fields on an audience loaded from storage (older shape). */
export function normalizeAudience(a: Partial<AudienceType> & { id: string; name: string }): AudienceType {
  return newAudience(a)
}

export function freshAudienceId(): string {
  return `aud_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
}
