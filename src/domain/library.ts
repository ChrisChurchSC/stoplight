import { type AudienceType, newAudience } from './audiences'
import { newDescriptor } from './descriptors'
import { GTM_STRATEGIES, type GtmStrategy } from './strategies'
import type { Rtb } from './rtb'

/**
 * The Messaging Library — a cross-project shelf of reusable building blocks:
 * CTAs, proof points (RTBs), audience types, and GTM strategies. Authored once,
 * reused on any client/campaign. This is the foundation layer made shareable:
 * pull an audience (with its proof + voice) onto a project, drop in a proven CTA,
 * back a claim with a library RTB.
 *
 * Stored globally (not per client) so every project draws from the same shelf.
 */

/** A reusable call-to-action. Stage is a hint for where it tends to fit. */
export interface LibraryCta {
  id: string
  label: string
  /** Optional funnel-stage hint (awareness…retention) and a usage note. */
  stage?: string
  note?: string
  /** Where the CTA sends people (e.g. "/demo", a landing page). */
  destination?: string
  /** The outcome it drives (e.g. "Booked meeting", "Trial started"). */
  outcome?: string
  /** Library governance: undefined/true = an approved master; explicit false = an
   *  unvetted draft (authored, not yet blessed). See {@link isApproved}. */
  approved?: boolean
}

/** A reusable campaign subject — what a campaign is *about*, authored once and
 *  pulled onto any campaign (the Subject card). Editing the master propagates the
 *  new text to every campaign carrying it (see the store's propagation). */
export interface LibrarySubject {
  id: string
  text: string
  note?: string
  /** Why this subject lands now — the angle behind it. */
  angle?: string
  /** The primary outcome the subject drives toward. */
  outcome?: string
  approved?: boolean
}

/** A reusable hook / opening angle — the first line that earns attention, kept on
 *  the shelf to reuse across briefs. */
export interface LibraryHook {
  id: string
  text: string
  note?: string
  /** Opener type — Pain / Stat / Question / Curiosity. */
  kind?: string
  approved?: boolean
}

/** A library asset is a vetted master unless explicitly marked an unapproved draft.
 *  (Mirrors isApprovedProof — the curated-shelf rule, applied to any asset type.) */
export const isApproved = (x: { approved?: boolean }): boolean => x.approved !== false

export interface MessagingLibrary {
  ctas: LibraryCta[]
  rtbs: Rtb[]
  audiences: AudienceType[]
  strategies: GtmStrategy[]
  subjects: LibrarySubject[]
  hooks: LibraryHook[]
}

/** A blank library — the standard GTM strategies (universal motions) but no authored
 *  audiences / proof / subjects / hooks / CTAs yet. The starting point for a brand's
 *  messaging system. */
export function emptyLibrary(): MessagingLibrary {
  return { ctas: [], rtbs: [], audiences: [], strategies: GTM_STRATEGIES.slice(), subjects: [], hooks: [] }
}

let ctaSeq = 0
export function newLibraryCta(patch: Partial<LibraryCta> = {}): LibraryCta {
  ctaSeq += 1
  return {
    id: patch.id ?? `lcta_${Date.now().toString(36)}_${ctaSeq}`,
    label: patch.label ?? '',
    stage: patch.stage,
    note: patch.note,
    destination: patch.destination,
    outcome: patch.outcome,
    approved: patch.approved,
  }
}

/** The shelf everyone starts with — a few proven CTAs and proof points, the ten
 *  standard GTM strategies, and a couple of example audiences carrying their own
 *  proof + voice (so "pull an audience from the library" is real from day one). */
export function defaultLibrary(): MessagingLibrary {
  const ctas: LibraryCta[] = [
    { id: 'cta_learn', label: 'Learn more', stage: 'awareness' },
    { id: 'cta_watch', label: 'Watch the film', stage: 'awareness' },
    { id: 'cta_guide', label: 'Get the guide', stage: 'consideration' },
    { id: 'cta_demo', label: 'Book a demo', stage: 'conversion' },
    { id: 'cta_start', label: 'Start free', stage: 'conversion' },
    { id: 'cta_refer', label: 'Refer a friend', stage: 'retention' },
  ]
  const rtbs: Rtb[] = [
    { id: 'lrtb_ttv', label: 'Live in a week', detail: 'Median time-to-value is 7 days from kickoff.' },
    { id: 'lrtb_integrations', label: '200+ integrations', detail: 'Connects to the tools teams already run.' },
    { id: 'lrtb_proof', label: 'Backed by results', detail: 'Customers report measurable lift in the first 90 days.' },
  ]
  const audiences: AudienceType[] = [
    newAudience({
      id: 'laud_ops',
      name: 'Mid-market Ops lead',
      role: 'VP / Director of Operations',
      messageAngle: 'Cut the busywork your team hates — get hours back every week.',
      descriptors: [newDescriptor({ label: 'Precise' }), newDescriptor({ label: 'Plainspoken' })],
      rtbs: [{ id: 'laud_ops_rtb1', label: 'Cut ops time 40%', detail: 'Case study: 40% less manual ops work in 90 days.', audienceId: 'laud_ops' }],
    }),
    newAudience({
      id: 'laud_founder',
      name: 'Early-stage founder',
      role: 'Founder / CEO',
      messageAngle: 'Move faster than you thought you could, without hiring ahead of revenue.',
      descriptors: [newDescriptor({ label: 'Bold' }), newDescriptor({ label: 'Aspirational' })],
      rtbs: [{ id: 'laud_founder_rtb1', label: 'Ship without fear', detail: 'One-click rollback on any change.', audienceId: 'laud_founder' }],
    }),
  ]
  const subjects: LibrarySubject[] = [
    { id: 'subj_launch', text: 'A faster way to ship', note: 'Product launch / speed angle' },
    { id: 'subj_save_time', text: 'Get your week back', note: 'Time-savings angle' },
    { id: 'subj_trust', text: 'Proof you can stand on', note: 'Credibility / case-study angle' },
  ]
  const hooks: LibraryHook[] = [
    { id: 'hook_tired', text: 'Tired of tools that slow you down?', note: 'Pain-first opener' },
    { id: 'hook_number', text: 'Teams cut 40% of busywork in 90 days.', note: 'Stat-led opener' },
    { id: 'hook_question', text: 'What would you ship with an extra day a week?', note: 'Question opener' },
  ]
  return { ctas, rtbs, audiences, strategies: GTM_STRATEGIES.slice(), subjects, hooks }
}

export type LibraryKind = 'ctas' | 'rtbs' | 'audiences' | 'strategies' | 'subjects' | 'hooks'
