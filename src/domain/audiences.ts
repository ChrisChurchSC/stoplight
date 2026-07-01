import type { Descriptor } from './descriptors'
import type { Rtb } from './rtb'
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
  // ---- Demographics (matter most for B2C) ----
  ageRanges: string[]
  incomeRanges: string[]
  gender: string
  geos: string[]
  // ---- Firmographics (matter most for B2B) ----
  /** Job functions / titles this persona holds. */
  functions: string[]
  seniority: string
  industry: string
  companySize: string
  // ---- Psychographics & intent ----
  /** This persona's pains — a subset of the ICP's, plus any persona-specific ones. */
  pains: string[]
  /** Outcomes this persona wants (selected from the goal library). */
  goalTags: string[]
  /** Free-text elaboration of goals (optional). */
  goals: string
  /** What makes them hesitate — objections to disarm in the messaging. */
  objections: string
  /** Buying triggers / intent signals worth targeting. */
  triggers: string[]
  /** How the promise is framed for this buyer's pains, language, and context. */
  messageAngle: string
  /** Channels where this persona actually pays attention (where to reach them). */
  channels: ChannelId[]
  /** Proof points this audience OWNS (foundation). First-class objects that
   *  travel with the audience into campaigns and accumulate their own track
   *  record — proof belongs to the audience it persuades. */
  rtbs: Rtb[]
  /** Voice/tone descriptors for how to speak to this audience. */
  descriptors: Descriptor[]
  /** Ids of the audience's OWN rtbs to lead with (emphasis ordering). */
  rtbEmphasis: string[]
  /** GTM strategy key tied to this audience (its reach + convert playbook). */
  strategy: string
  /** The outcome we want this audience to take — the conversion goal the
   *  messaging and CTAs should drive toward (e.g. Donate, Subscribe, Invest). */
  outcome?: string
  /** Library governance: undefined/true = an approved master; explicit false = an
   *  unvetted draft (authored, not yet blessed into the curated library). */
  approved?: boolean
}

/** A blank audience with every field defaulted — the one place defaults live. */
export function newAudience(patch: Partial<AudienceType> = {}): AudienceType {
  return {
    id: freshAudienceId(),
    name: '',
    role: '',
    ageRanges: [],
    incomeRanges: [],
    gender: '',
    geos: [],
    functions: [],
    seniority: '',
    industry: '',
    companySize: '',
    pains: [],
    goalTags: [],
    goals: '',
    objections: '',
    triggers: [],
    messageAngle: '',
    channels: [],
    rtbs: [],
    descriptors: [],
    rtbEmphasis: [],
    strategy: '',
    outcome: '',
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
