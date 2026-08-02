import { type AudienceType } from './audiences'
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

export type LibraryKind = 'ctas' | 'rtbs' | 'audiences' | 'strategies' | 'subjects' | 'hooks'
