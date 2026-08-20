import { fieldCoverage } from './assetFields'
import { danglingCtas, handoffWhere, uncoveredHandoffs } from './assetCtas'
import { directionCoverage, identityCoverage } from './objectFields'
import type { CanvasObject } from './flowBoard'
import type { TrafficRow } from './types'

/**
 * ONE READ OF A WHOLE CAMPAIGN, IN THE ORDER SOMEBODY SHOULD ACT ON IT.
 *
 * The coherence check reads the campaign's COPY: it finds a claim with no proof, a weak CTA, two
 * assets saying the same thing. What it has never looked at is whether the campaign is finished —
 * an asset card with six of its nine components blank reads as a perfectly coherent asset, because
 * every word it does contain is fine. So does an Audience card that names a segment and instructs
 * the writer to do nothing with it, and a CTA button pointed at an asset somebody deleted.
 *
 * Those are the findings an agent could not reach. Each one is already computable from something in
 * this codebase; nothing here detects anything new. What it adds is the pass that asks all of them
 * at once, about one campaign, and returns them RANKED with the call that fixes each — because a
 * review an agent has to translate into actions itself is a review it will act on inconsistently.
 *
 * Pure, and separate from the store, so the ranking can be tested against a hand-built campaign
 * rather than by wiring one up.
 */

export type ReviewSeverity = 'high' | 'medium' | 'low'

export type SuggestionKind =
  | 'empty-campaign'
  | 'unfinished-asset'
  | 'silent-object-card'
  | 'dangling-cta'
  | 'uncovered-handoff'
  | 'no-direction'
  | 'unnamed-object-card'

export interface Suggestion {
  kind: SuggestionKind
  severity: ReviewSeverity
  /** The finding, in one line. */
  what: string
  /** Why it costs something — never omitted, because a finding nobody understands gets ignored. */
  why: string
  /** What it is about: an asset, a card, a channel. */
  where: { assetId?: string; assetName?: string; objectId?: string; channel?: string }
  /** The call that fixes it, named exactly, so acting on the review needs no translation. */
  fix: string
  /**
   * The question to put to the PERSON, on findings whose fix cannot be chosen from what the
   * workspace holds.
   *
   * A review that answers itself is the failure worth naming here. "This audience card carries no
   * pain" has an obvious-looking repair — write a pain — and a model with the brand profile in front
   * of it will write a fluent, plausible one that nobody has ever said out loud, then everything
   * downstream argues from it. Present only where a guess would be invisible in the output: a
   * dangling CTA can be repointed, removed, or have its target built, and the copy reads the same
   * whichever was wrong. Absent on findings that are simply work — filling a component the format
   * already names is not a decision, and asking about it would teach the reader to skim the ones
   * that are.
   */
  ask?: string
}

const RANK: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 }

/**
 * Rank a finished list. Severity first, then the kind's own order, so a run over the same campaign
 * twice reads the same way round — an unstable review looks like the campaign changed.
 */
const KIND_ORDER: SuggestionKind[] = [
  'empty-campaign', 'no-direction', 'unfinished-asset', 'dangling-cta', 'uncovered-handoff', 'unnamed-object-card', 'silent-object-card',
]

export function rankSuggestions(list: Suggestion[]): Suggestion[] {
  return [...list].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.where.assetName ?? a.where.objectId ?? '').localeCompare(b.where.assetName ?? b.where.objectId ?? ''),
  )
}

export interface CampaignReviewInput {
  campaign: string
  /** The campaign's assets, already scoped. */
  rows: TrafficRow[]
  /** The object cards on its flow board. */
  objects: CanvasObject[]
}

export interface CampaignReview {
  campaign: string
  assetCount: number
  objectCardCount: number
  suggestions: Suggestion[]
  counts: Record<SuggestionKind, number>
}

/** Half or more of a card's components blank is a draft, not a near-miss — worth saying louder. */
const severityForGaps = (missing: number, total: number): ReviewSeverity =>
  missing === total ? 'high' : missing * 2 >= total ? 'medium' : 'low'

export function reviewCampaign({ campaign, rows, objects }: CampaignReviewInput): CampaignReview {
  const out: Suggestion[] = []

  if (!rows.length) {
    out.push({
      kind: 'empty-campaign',
      severity: 'high',
      what: `"${campaign}" has no assets.`,
      why: 'Nothing to review, ship or schedule — the campaign exists only as a name.',
      where: {},
      fix: `generate_assets(campaign: "${campaign}") to seed the strategy's deliverables, or add_asset for a one-off.`,
      ask: `What is this campaign announcing, and should it be the motion's full deliverable set or a few specific pieces?`,
    })
  }

  // A card that renders blank components. The coherence check cannot see these: every word the
  // asset DOES contain is fine, so it reads as a healthy asset that happens to be mostly empty.
  for (const r of rows) {
    const coverage = fieldCoverage(r.channel, r.assetType, r.messaging, r)
    const total = coverage.filled.length + coverage.missing.length
    if (!coverage.missing.length || !total) continue
    out.push({
      kind: 'unfinished-asset',
      severity: severityForGaps(coverage.missing.length, total),
      what: `"${r.assetName}" has ${coverage.missing.length} of ${total} components empty: ${coverage.missing.join(', ')}.`,
      why: 'Every empty component renders blank on the card and ships blank.',
      where: { assetId: r.id, assetName: r.assetName, channel: r.channel },
      fix: `edit_asset(assetId: "${r.id}", fields: { ${coverage.missing.join(', ')} })`,
    })
  }

  // A CTA button pointed at an asset that is no longer in the campaign, and a handoff the journey
  // implies but no button covers. Both are the reader hitting a dead end.
  for (const r of rows) {
    for (const c of danglingCtas(r, rows)) {
      out.push({
        kind: 'dangling-cta',
        severity: 'high',
        what: `"${r.assetName}" has a CTA pointed at "${c.target}", which is not in the campaign.`,
        why: 'The button leads nowhere — the one action the asset asks for is broken.',
        where: { assetId: r.id, assetName: r.assetName },
        fix: `Repoint or remove it with edit_asset(assetId: "${r.id}"), or add the missing asset.`,
        ask: `"${r.assetName}" asks the reader to go to "${c.target}", which is not here. Should that asset be built, should the CTA point somewhere else, or should it come out?`,
      })
    }
    for (const h of uncoveredHandoffs(r, rows)) {
      out.push({
        kind: 'uncovered-handoff',
        severity: 'medium',
        what: `"${r.assetName}" hands to ${h.row.assetName} (${handoffWhere(h.row)}) with no CTA covering it.`,
        why: 'The journey expects the reader to travel, and nothing on the asset takes them.',
        where: { assetId: r.id, assetName: r.assetName },
        fix: `Give it the CTA with edit_asset(assetId: "${r.id}", fields: { cta: … }).`,
      })
    }
  }

  // A card nobody can identify, or that never says what it is. Distinct from a silent card: this
  // one may instruct the writer perfectly well and still leave a board nobody can read.
  for (const o of objects) {
    const id = identityCoverage(o)
    if (!id.missing.length) continue
    out.push({
      kind: 'unnamed-object-card',
      severity: id.missing.includes('name') ? 'medium' : 'low',
      what: `The ${o.kind} card ${o.name ? `"${o.name}"` : '(unnamed)'} has no ${id.missing.join(' and no ')}.`,
      why: id.missing.includes('name')
        ? 'An unnamed card is listed everywhere as its bare kind, so three of them read alike and none says which is which.'
        : 'A description is the document standing as "what this thing is", and it is what reaches the writer — the team note does not.',
      where: { objectId: o.id },
      fix: `edit_object_card(objectId: "${o.id}", ${id.missing.map((m) => (m === 'name' ? 'name: …' : 'description: …')).join(', ')})`,
    })
  }

  // A card on the board instructing the writer to do nothing. It still LOOKS like context.
  const silent = objects.filter((o) => {
    const c = directionCoverage(o.kind, o.direction)
    return !c.asksNothing && !c.filled.length
  })
  for (const o of silent) {
    const c = directionCoverage(o.kind, o.direction)
    out.push({
      kind: 'silent-object-card',
      severity: 'medium',
      what: `The ${o.kind} card "${o.name || o.text.split('\n')[0] || o.kind}" answers none of its questions (${c.missing.join(', ')}).`,
      why: 'Direction is what a card contributes to the copy; with none it adds a name and nothing else.',
      where: { objectId: o.id },
      fix: `edit_object_card(objectId: "${o.id}", fields: { ${c.missing.join(', ')} })`,
      ask: `What should the ${o.kind} card "${o.name || o.text.split('\n')[0] || o.kind}" tell the writer — its ${c.missing.join(', ')}? These are things about real people and real claims; a plausible invented one is worse than a blank.`,
    })
  }

  // A board with cards but no instruction anywhere: the copy is being written from the brief alone
  // while the board suggests otherwise.
  const asking = objects.filter((o) => !directionCoverage(o.kind, o.direction).asksNothing)
  if (asking.length && asking.length === silent.length) {
    out.push({
      kind: 'no-direction',
      severity: 'high',
      what: `No card on "${campaign}" carries any direction.`,
      why: 'The copy is written from the brief alone — the board looks like context and contributes none.',
      where: {},
      fix: `list_object_cards(campaign: "${campaign}"), then edit_object_card on each.`,
      ask: `What should "${campaign}" lean on — the pain it argues from, the objection it has to beat, the claim it asserts?`,
    })
  }

  const suggestions = rankSuggestions(out)
  const counts = suggestions.reduce(
    (acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }),
    {} as Record<SuggestionKind, number>,
  )
  return { campaign, assetCount: rows.length, objectCardCount: objects.length, suggestions, counts }
}
