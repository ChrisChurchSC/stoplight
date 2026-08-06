import { CHANNELS } from './channels'
import type { TrafficRow } from './types'

/**
 * WHAT HAS TO BE BUILT INTO AN ASSET FOR THE JOURNEY TO WORK.
 *
 * A journey on the canvas is a set of lines: this ad leads to that page, that page leads to this
 * email. Every one of those lines is a promise that somebody has to build something. The ad needs a
 * button. The page needs a form, because you cannot send an email to a person who has never given
 * you an address. The checkout needs a way to take money. Until now the board drew the line and
 * nothing anywhere said what the line costs, so the handoff was discovered by the person building
 * the asset, one asset at a time, usually late.
 *
 * A CTA here is NOT the CTA copy. `messaging.cta` is the words ("Book a demo"); this is the
 * mechanism those words sit on and whether it exists yet. They are separate on purpose: an asset can
 * carry three buttons and one line of CTA copy, and a form with no fields decided is a build task
 * whether or not anyone has written its label.
 *
 * THE LIST IS THE PERSON'S, THE SUGGESTIONS ARE OURS. Nothing here writes to a row. The journey can
 * only ever propose — it knows that this asset hands to a nurture email and therefore needs a
 * capture, but it cannot know that capture already lives in the site header. So a handoff with no
 * CTA against it is reported as uncovered and the person decides, rather than the row quietly
 * growing entries it did not ask for.
 */

/**
 * The kinds of thing an asset can need built into it. Deliberately about MECHANISM rather than
 * intent: "Sign up" is a label, and the thing the developer has to build is a form.
 */
export type CtaKind =
  | 'button'
  | 'form'
  | 'input'
  | 'download'
  | 'booking'
  | 'payment'
  | 'account'
  | 'share'
  | 'other'

export const CTA_KINDS: CtaKind[] = ['button', 'form', 'input', 'download', 'booking', 'payment', 'account', 'share', 'other']

/** Label and a one-line "what this actually is", used by the picker. */
export const CTA_KIND_META: Record<CtaKind, { label: string; blurb: string }> = {
  button: { label: 'Button or link', blurb: 'Something they press to move on to the next step.' },
  form: { label: 'Form', blurb: 'Fields they fill and submit. The only way to get an address, a number or a name.' },
  input: { label: 'Input or control', blurb: 'A field or toggle that changes what they see: search, quantity, plan, promo code.' },
  download: { label: 'Download', blurb: 'A file they take away with them.' },
  booking: { label: 'Booking', blurb: 'A calendar or scheduler that puts time in somebody’s diary.' },
  payment: { label: 'Payment', blurb: 'Taking money: card fields, a wallet button, a plan.' },
  account: { label: 'Account', blurb: 'Sign in, or create an account.' },
  share: { label: 'Share or refer', blurb: 'Passing it on: share, forward, invite a friend.' },
  other: { label: 'Other', blurb: 'Anything else that has to be built for this to work.' },
}

/**
 * One thing that has to exist in the asset.
 *
 * `target` is an assetName rather than a row id, matching `linksTo` and `branchOf`. Those two are
 * the journey's own vocabulary and they are names, so a CTA keyed by id would go stale the moment a
 * card was regenerated while the journey link beside it survived.
 */
export interface AssetCta {
  id: string
  kind: CtaKind
  /** The words on it, when there are words. A search input has none. */
  label: string
  /** The asset this hands off to, by assetName. Absent when it goes nowhere in this campaign. */
  target?: string
  /** What has to be built, in a sentence: which fields, where it posts, what it needs. */
  note?: string
  /** Does it exist in the asset yet? The difference between a spec and a checklist. */
  built?: boolean
}

export const freshCtaId = (): string => `cta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

/** A link out of this asset, and how the journey states it. */
export interface Handoff {
  row: TrafficRow
  /**
   * `branchOf` is a deliberate next step somebody drew on the canvas; `linksTo` is the mechanical
   * destination an ad points at. Both need a control in the source asset, and both are shown, but
   * the wording differs because one was a decision and the other is plumbing.
   */
  via: 'branchOf' | 'linksTo'
}

const name = (s?: string): string => (s ?? '').trim()

/**
 * The assets this one hands to, within the rows handed in (its campaign).
 *
 * Deduped by asset name and by row: a deliverable with four posts all carrying `branchOf` pointing
 * here is ONE next step drawn once on the canvas, and listing it four times would ask for four
 * buttons. Self-links are dropped — a row whose branchOf is its own name is a migration artefact,
 * not a journey, and it would otherwise demand a button to nowhere.
 */
export function handoffsFrom(row: TrafficRow, rows: readonly TrafficRow[]): Handoff[] {
  const mine = name(row.assetName)
  const out: Handoff[] = []
  const seen = new Set<string>([mine])

  // Explicit destination first: an ad naming its landing page is the clearest statement of intent
  // there is, so it leads the list even though the canvas draws branchOf more prominently.
  const to = name(row.linksTo)
  if (to && to !== mine) {
    const target = rows.find((r) => name(r.assetName) === to)
    if (target) {
      seen.add(to)
      out.push({ row: target, via: 'linksTo' })
    }
  }

  for (const r of rows) {
    const parent = name(r.branchOf)
    const child = name(r.assetName)
    if (parent !== mine || !child || seen.has(child)) continue
    seen.add(child)
    out.push({ row: r, via: 'branchOf' })
  }

  return out
}

/** The assets that hand TO this one. Context only: the control belongs in the asset upstream. */
export function handoffsInto(row: TrafficRow, rows: readonly TrafficRow[]): Handoff[] {
  const mine = name(row.assetName)
  const out: Handoff[] = []
  const seen = new Set<string>([mine])
  for (const r of rows) {
    const from = name(r.assetName)
    if (!from || seen.has(from)) continue
    if (name(r.linksTo) === mine) { seen.add(from); out.push({ row: r, via: 'linksTo' }) }
    else if (name(row.branchOf) === from) { seen.add(from); out.push({ row: r, via: 'branchOf' }) }
  }
  return out
}

/**
 * WHAT THE HANDOFF COSTS THE ASSET AT THIS END OF IT.
 *
 * Read off the destination, but always answering for the SOURCE: what does this asset have to carry
 * for somebody to get from here to there. The rule is one sentence — the source owes whatever the
 * destination cannot be reached by a link alone:
 *
 *   a place you can link to      → a button. The form on the landing page is the PAGE's build item,
 *                                  not the ad's, and suggesting a form here would put the same form
 *                                  on both ends of the line.
 *   a message sent to a person   → a capture. There is no link to an inbox: an asset that hands to
 *                                  a nurture sequence has to take the address and the consent, and
 *                                  nothing downstream of it can run until it does.
 *   a person                     → a booking or a hand-raise that reaches them.
 *   a file                       → the download, and the gate you are trading it for.
 *   a seat at something          → a registration, which is a form however the invitation looks.
 *
 * The last four are the whole point. They are the handoffs a line on a canvas hides completely, and
 * they are the ones that get found late by whoever is building the asset.
 */
export function ctaForHandoff(target: TrafficRow): { kind: CtaKind; label: string; note: string } {
  const key = `${target.channel}:${target.assetType ?? ''}`
  const byType = TYPE_HANDOFF[key]
  if (byType) return byType(target)
  const byChannel = CHANNEL_HANDOFF[target.channel]
  if (byChannel) return byChannel(target)
  return {
    kind: 'button',
    label: `Go to ${target.assetName}`,
    note: `Somewhere to press that takes them to ${target.assetName}, carrying the tracking through so it can be attributed back to here.`,
  }
}

type HandoffRule = (target: TrafficRow) => { kind: CtaKind; label: string; note: string }

/**
 * Channel rules. The `owned` lifecycle channels are the interesting ones: reaching somebody's inbox
 * or phone is a permission you have to be GIVEN, so the asset upstream owes a capture and a consent
 * rather than a link. Every channel that is simply a page you can link to falls through to the
 * button default below and is deliberately absent from this table.
 */
const CHANNEL_HANDOFF: Partial<Record<string, HandoffRule>> = {
  email: () => ({
    kind: 'form',
    label: 'Email capture',
    note: 'Email address and a consent checkbox, posting to the list this sequence sends from. Nothing downstream can run until this asset takes the address.',
  }),
  sms: () => ({
    kind: 'form',
    label: 'Phone capture',
    note: 'Phone number with an explicit SMS opt-in. A number captured without one is not a number you can text.',
  }),
  push: () => ({
    kind: 'other',
    label: 'Push opt-in prompt',
    note: 'The permission prompt, and the moment you choose to ask for it. Asking on arrival is how you get denied once and for good.',
  }),
  'lead-magnet': (t) => ({
    kind: 'form',
    label: 'Get the download',
    note: `The gate in front of ${t.assetName}: the fields you are trading it for, then the file itself or a link that does not expire.`,
  }),
  'sales-outreach': () => ({
    kind: 'booking',
    label: 'Book a call',
    note: 'A scheduler, or a hand-raise that reaches the person who follows it up. A journey that hands to a human needs a way to reach the human.',
  }),
  'sales-collateral': (t) => ({
    kind: 'download',
    label: 'Get the deck',
    note: `${t.assetName} has to be somewhere they can take it away from: a file, or a link that outlives the conversation.`,
  }),
  proposal: () => ({
    kind: 'button',
    label: 'Request pricing',
    note: 'A request that reaches a person, carrying enough with it to price the thing without a second email.',
  }),
  events: (t) => ({
    kind: 'form',
    label: 'Save a place',
    note: `Registration for ${t.assetName}: who is coming, the confirmation, and the reminder before it runs.`,
  }),
  checkout: (t) => ({
    kind: 'button',
    label: 'Buy',
    note: `Into ${t.assetName} with the item and any promo carried through, so nothing is chosen twice.`,
  }),
  blog: (t) => ({ kind: 'button', label: 'Read it', note: `A link to ${t.assetName}.` }),
}

/**
 * Type rules, which win over the channel's. Only where the TYPE changes what this end owes: a
 * landing page is a button whatever flavour it is, but a webinar is a seat and a referral page is a
 * share. Anything that just needs better words than "Go to X" is here for the label alone.
 */
const TYPE_HANDOFF: Record<string, HandoffRule> = {
  // The events channel hands off to a registration form, which is right for anything with a room
  // to save a place in. A press release has none: what it owes is somewhere to verify the story
  // and someone to ask, so it is a link to the newsroom rather than a seat.
  'events:press-release': (t) => ({
    kind: 'button',
    label: 'Read the release',
    note: `Where ${t.assetName} lives once it is out: the newsroom post, the assets an editor needs, and the contact who answers.`,
  }),
  'landing-page:lead-capture': (t) => ({ kind: 'button', label: 'Sign up', note: `A button to ${t.assetName}, carrying the tracking through. The fields themselves are that page's build item, not this one's.` }),
  'landing-page:webinar-reg': (t) => ({ kind: 'button', label: 'Register', note: `A button to ${t.assetName}. Registration lives on the page it goes to.` }),
  'landing-page:waitlist': (t) => ({ kind: 'button', label: 'Join the waitlist', note: `A button to ${t.assetName}.` }),
  'landing-page:sales': (t) => ({ kind: 'button', label: 'See the offer', note: `A button to ${t.assetName}. If the offer is chosen here, carry the choice through.` }),
  'website:login': () => ({ kind: 'account', label: 'Sign in', note: 'A way in from this asset: sign in, create an account, and the reset path. A journey that hands to a login needs all three doors, not one.' }),
  'website:pricing': (t) => ({ kind: 'button', label: 'See pricing', note: `A button to ${t.assetName}. If the plan is chosen here, carry the choice through so they do not pick it twice.` }),
  'checkout:cart': () => ({ kind: 'button', label: 'Add to cart', note: 'Adds the item and shows it went in. The count in the header is part of the build.' }),
  'post-purchase:referral': () => ({ kind: 'share', label: 'Refer a friend', note: 'A share or an invite with a code on it that survives being pasted into a message.' }),
  'lead-magnet:webinar': () => ({ kind: 'form', label: 'Save my seat', note: 'Registration, the calendar invite, and the reminder. A webinar signup that sends no invite loses most of the room.' }),
}

/**
 * The handoffs no CTA on this row accounts for.
 *
 * Matched on target name, so a CTA the person retargeted at a different asset stops covering the old
 * one and the gap comes back. A CTA with no target covers nothing on purpose: a search box is real
 * functionality and it is not how anybody gets to the next step.
 */
export function uncoveredHandoffs(row: TrafficRow, rows: readonly TrafficRow[]): Handoff[] {
  const covered = new Set((row.ctas ?? []).map((c) => name(c.target)).filter(Boolean))
  return handoffsFrom(row, rows).filter((h) => !covered.has(name(h.row.assetName)))
}

/** CTAs on this row pointed at an asset that is no longer in the campaign, so the button leads nowhere. */
export function danglingCtas(row: TrafficRow, rows: readonly TrafficRow[]): AssetCta[] {
  const live = new Set(rows.map((r) => name(r.assetName)))
  return (row.ctas ?? []).filter((c) => name(c.target) && !live.has(name(c.target)))
}

/** Everything specced but not built yet, which is the list a build ticket is written from. */
export const unbuiltCtas = (row: TrafficRow): AssetCta[] => (row.ctas ?? []).filter((c) => !c.built)

/** A short "Meta Ads · Landing page" for a handoff row, so the suggestion says what it hands to. */
export const handoffWhere = (r: TrafficRow): string => CHANNELS[r.channel]?.label ?? r.channel
