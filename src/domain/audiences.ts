import type { Descriptor } from './descriptors'
import type { ObjectReference } from './objectReference'
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
  /** Other names this audience is known by — the freeform per-campaign tags on the
   *  plan that mean this canonical audience. Lets its track record tie across messy
   *  live data (see resolveAudienceId). */
  aliases?: string[]
  /** The specific buyer/role inside the ICP (e.g. "VP of RevOps", "Founder"). */
  role: string
  // ---- Demographics (matter most for B2C) ----
  ageRanges: string[]
  incomeRanges: string[]
  gender: string
  maritalStatus: string
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
  /** A one-line definition of the specific sub-segment — sharper than role. */
  definition?: string
  /** Capacity / value tier for the segment, e.g. "$25M+ deployable". */
  tier?: string
  /** What NOT to say to this audience — the anti-messaging. */
  antiMessage?: string
  /** Proof points to lead with, ranked (plain labels). */
  leadProof?: string[]
  /** Example real accounts that sit in this segment. */
  examples?: string[]
  /** Funnel stage this segment sits at (awareness…retention). */
  funnelStage?: string
  /** Reference to the account list this segment maps to (e.g. a Neon segment). */
  listRef?: string
  /** Library governance: undefined/true = an approved master; explicit false = an
   *  unvetted draft (authored, not yet blessed into the curated library). */
  approved?: boolean
  /** The document this segment is, kept whole. Not a column: see Voice.reference for why. */
  reference?: ObjectReference
}

/** Stored lowercase, because that is what funnelStage already holds everywhere else. Capitalizing
 *  these for the picker would fork the vocabulary and quietly stop matching the existing records. */
export const FUNNEL_STAGE_OPTIONS = [
  'awareness', 'consideration', 'conversion', 'retention',
] as const

/**
 * Read a list field that is TYPED as an array but is not guaranteed to be one.
 *
 * pains, triggers and goalTags are `string[]` in the type and plain JSON on disk, written by imports,
 * the agent tools and hand-edits as well as by this app. A string where an array was expected used to
 * throw inside the draft loop, which killed the whole generation for every asset in the campaign and
 * surfaced as Generate doing nothing at all: the throw happened in an un-awaited promise, so no error
 * ever reached the user.
 *
 * Splitting a bare string rather than discarding it, because the content is right and only the shape
 * is wrong.
 */
export const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
  : typeof v === 'string' ? splitLines(v)
  : []

/**
 * A free-text field that holds several items into a list. `goals` is one textarea in the UI and
 * several distinct wants in practice, and a writer handed one blob treats it as a single thought.
 *
 * Splits on newlines and semicolons only, NOT on sentence ends: a want is often a sentence, and
 * splitting "Wants to stop losing Saturdays. Will not pay for another subscription." into two
 * fragments loses that the second qualifies the first.
 */
export const splitLines = (v: string | undefined): string[] =>
  (v ?? '')
    .split(/[\n;]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2)

/** A blank audience with every field defaulted — the one place defaults live. */
export function newAudience(patch: Partial<AudienceType> = {}): AudienceType {
  return {
    id: freshAudienceId(),
    name: '',
    role: '',
    ageRanges: [],
    incomeRanges: [],
    gender: '',
    maritalStatus: '',
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
    definition: '',
    tier: '',
    antiMessage: '',
    leadProof: [],
    examples: [],
    funnelStage: '',
    listRef: '',
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

/**
 * The brand's EFFECTIVE audience set. Audiences live in two places: the brand's system library and
 * clientAudiences (what the audience selector and the canvas write to). Generation reads the merge,
 * with clientAudiences winning a name collision because it is the actively-maintained source.
 *
 * ⚠️ This lives in the domain, not the store, because the COHERENCE GATE needs the same merge. It
 * used to derive audiences from brandSystems alone, so it judged copy against a different audience
 * set than the one generation wrote from, and a clientAudiences persona read as off-segment drift.
 * The store imports coherenceChecks, so coherenceChecks cannot import the store.
 */
export function mergeAudiences(systemAuds: AudienceType[], clientAuds: AudienceType[]): AudienceType[] {
  const byName = new Map<string, AudienceType>()
  for (const a of systemAuds) byName.set(a.name, a)
  for (const a of clientAuds) byName.set(a.name, a)
  return [...byName.values()]
}
