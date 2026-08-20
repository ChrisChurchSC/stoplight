import { describe, expect, it } from 'vitest'
import { rankSuggestions, reviewCampaign, type Suggestion } from '../campaignReview'
import type { CanvasObject } from '../flowBoard'
import { makeObjectReference } from '../objectReference'
import type { ChannelId, TrafficRow } from '../types'

/**
 * WHAT A COHERENT CAMPAIGN CAN STILL BE WRONG ABOUT.
 *
 * The coherence check reads the copy, and it is good at it. Every finding here is one it cannot
 * make, because each is about something ABSENT: a component never written, a card that instructs
 * the writer to do nothing, a button pointed at an asset somebody deleted. Absent things read as
 * fine — every word actually present is correct — which is exactly why they survived.
 *
 * These tests pin the findings and their ORDER, because a review is acted on top-down and an
 * unstable one reads as the campaign having changed.
 */

const row = (over: Partial<TrafficRow> = {}): TrafficRow =>
  ({
    id: 'r1',
    assetId: 'r1',
    assetName: 'Launch post',
    mediaType: 'text',
    channel: 'instagram' as ChannelId,
    messaging: { caption: 'Something worth saying' },
    campaign: 'Q4 launch',
    scheduledAt: '2026-09-01T10:00:00.000Z',
    status: 'draft',
    createdAt: 0,
    ...over,
  }) as TrafficRow

const card = (over: Partial<CanvasObject> = {}): CanvasObject => ({ id: 'co_1', kind: 'audience', text: '', ...over })

/** A card with nothing wrong with it: named, described, and carrying its direction. */
const wholeCard = (over: Partial<CanvasObject> = {}): CanvasObject =>
  card({
    name: 'Enterprise, renewal',
    reference: makeObjectReference('persona.md', 'They own the renewal and are measured on retention.', 0),
    direction: [
      { key: 'pain', value: 'Manual handoff' },
      { key: 'objection', value: 'Too small' },
    ],
    ...over,
  })

describe('a campaign with nothing wrong', () => {
  it('raises nothing when every component is filled and every card carries direction', () => {
    const review = reviewCampaign({
      campaign: 'Q4 launch',
      rows: [row()],
      objects: [wholeCard()],
    })
    expect(review.suggestions).toEqual([])
    expect(review.assetCount).toBe(1)
  })
})

describe('what the copy check cannot see', () => {
  it('finds an asset whose components are blank, though every word in it is fine', () => {
    const review = reviewCampaign({
      campaign: 'Q4 launch',
      // A website renders nine components; this one carries a headline.
      rows: [row({ channel: 'website' as ChannelId, messaging: { headline: 'Ship faster' } })],
      objects: [],
    })
    const found = review.suggestions.find((s) => s.kind === 'unfinished-asset')!
    expect(found).toBeTruthy()
    expect(found.severity).toBe('medium')
    expect(found.what).toContain('8 of 9')
    // The fix is the literal call, not a description of one.
    expect(found.fix).toContain('edit_asset(assetId: "r1"')
    expect(found.fix).toContain('subhead')
  })

  it('calls a card with nothing on it high, and a nearly-full one low', () => {
    const bare = reviewCampaign({
      campaign: 'c',
      rows: [row({ channel: 'website' as ChannelId, messaging: {} })],
      objects: [],
    }).suggestions.find((s) => s.kind === 'unfinished-asset')!
    expect(bare.severity).toBe('high')

    const nearly = reviewCampaign({
      campaign: 'c',
      rows: [row({ channel: 'google-search' as ChannelId, messaging: { headline: 'A', description: 'B' } })],
      objects: [],
    }).suggestions.find((s) => s.kind === 'unfinished-asset')!
    expect(nearly.severity).toBe('low')
  })

  it('finds an object card that instructs the writer to do nothing', () => {
    const review = reviewCampaign({ campaign: 'c', rows: [row()], objects: [card({ name: 'Enterprise, cold' })] })
    const found = review.suggestions.find((s) => s.kind === 'silent-object-card')!
    expect(found.what).toContain('Enterprise, cold')
    expect(found.fix).toContain('edit_object_card(objectId: "co_1"')
  })

  it('does not fault a kind that asks for no direction', () => {
    // A Voice card contributes through its record. Reporting it unfinished forever would train an
    // agent to try to fill something that does not exist.
    const review = reviewCampaign({ campaign: 'c', rows: [row()], objects: [card({ kind: 'voice' })] })
    expect(review.suggestions.filter((s) => s.kind === 'silent-object-card')).toEqual([])
  })

  it('says so when no card on the board carries any direction at all', () => {
    const review = reviewCampaign({
      campaign: 'Q4 launch',
      rows: [row()],
      objects: [card(), card({ id: 'co_2', kind: 'message' })],
    })
    const found = review.suggestions.find((s) => s.kind === 'no-direction')!
    expect(found.severity).toBe('high')
    expect(found.what).toContain('Q4 launch')
  })

  it('finds a CTA pointed at an asset that is not in the campaign', () => {
    const review = reviewCampaign({
      campaign: 'c',
      rows: [row({ ctas: [{ id: 'c1', kind: 'button', label: 'Read more', target: 'Deleted page' }] } as Partial<TrafficRow>)],
      objects: [],
    })
    const found = review.suggestions.find((s) => s.kind === 'dangling-cta')!
    expect(found.severity).toBe('high')
    expect(found.what).toContain('Deleted page')
  })

  it('names an empty campaign as the one thing worth doing', () => {
    const review = reviewCampaign({ campaign: 'Q4 launch', rows: [], objects: [] })
    expect(review.suggestions).toHaveLength(1)
    expect(review.suggestions[0].kind).toBe('empty-campaign')
    expect(review.suggestions[0].fix).toContain('generate_assets')
  })
})

describe('the order it is read in', () => {
  const s = (over: Partial<Suggestion>): Suggestion => ({
    kind: 'unfinished-asset',
    severity: 'low',
    what: '',
    why: '',
    where: {},
    fix: '',
    ...over,
  })

  it('puts the worst first, and is stable for the same campaign twice', () => {
    const list = [
      s({ severity: 'low', kind: 'silent-object-card', where: { objectId: 'b' } }),
      s({ severity: 'high', kind: 'dangling-cta' }),
      s({ severity: 'medium', kind: 'unfinished-asset' }),
      s({ severity: 'low', kind: 'silent-object-card', where: { objectId: 'a' } }),
    ]
    const once = rankSuggestions(list).map((x) => `${x.severity}:${x.kind}:${x.where.objectId ?? ''}`)
    expect(once[0]).toBe('high:dangling-cta:')
    expect(once[1]).toBe('medium:unfinished-asset:')
    // Same input, same order — and ties broken by name rather than by input order.
    expect(rankSuggestions([...list].reverse()).map((x) => `${x.severity}:${x.kind}:${x.where.objectId ?? ''}`)).toEqual(once)
  })

  it('every finding carries why it matters and what to call', () => {
    const review = reviewCampaign({
      campaign: 'c',
      rows: [row({ channel: 'website' as ChannelId, messaging: {} })],
      objects: [card()],
    })
    expect(review.suggestions.length).toBeGreaterThan(0)
    for (const x of review.suggestions) {
      expect(x.why, `${x.kind} has no reason`).not.toBe('')
      expect(x.fix, `${x.kind} has no fix`).not.toBe('')
    }
  })
})


describe('a card nobody can identify', () => {
  it('is raised even when its direction is perfect', () => {
    // Distinct from a silent card: this one instructs the writer fine and still leaves a board
    // nobody can read.
    const review = reviewCampaign({
      campaign: 'c',
      rows: [row()],
      objects: [wholeCard({ name: undefined, reference: undefined })],
    })
    const found = review.suggestions.find((s) => s.kind === 'unnamed-object-card')!
    expect(found.what).toContain('no name and no description')
    expect(found.fix).toContain('edit_object_card(objectId: "co_1", name: …, description: …)')
    expect(review.suggestions.find((s) => s.kind === 'silent-object-card')).toBeUndefined()
  })

  it('calls a missing name worse than a missing description', () => {
    const noName = reviewCampaign({ campaign: 'c', rows: [row()], objects: [wholeCard({ name: undefined })] })
    expect(noName.suggestions.find((s) => s.kind === 'unnamed-object-card')!.severity).toBe('medium')

    const noDoc = reviewCampaign({ campaign: 'c', rows: [row()], objects: [wholeCard({ reference: undefined })] })
    expect(noDoc.suggestions.find((s) => s.kind === 'unnamed-object-card')!.severity).toBe('low')
  })

  it('raises nothing for a card that is named and described', () => {
    const review = reviewCampaign({ campaign: 'c', rows: [row()], objects: [wholeCard()] })
    expect(review.suggestions.filter((s) => s.kind === 'unnamed-object-card')).toEqual([])
  })
})
