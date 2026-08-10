import { describe, expect, it } from 'vitest'
import { assetMode, effectiveMessaging, isLiveAsset, isPlannedAsset } from '../assetMode'
import { reconciliationStat } from '../contentSignals'
import type { TrafficRow } from '../types'

/**
 * PLANNED OR LIVE, ONCE.
 *
 * This question had two answers in two files before the mode switch was going to add a third:
 * contentSignals' isPlannedCard treated an imported row as planned, PrioritiesView's isLibraryItem
 * treated it as live. Both were reasonable readings of a rule nobody had written down. These pin
 * the one rule, including the case the two disagreed on.
 */

const row = (over: Partial<TrafficRow> = {}): TrafficRow => ({
  id: 'r1',
  assetId: '',
  assetName: 'Storm reel',
  mediaType: 'video',
  channel: 'instagram',
  messaging: {},
  scheduledAt: '2026-09-01T10:00:00.000Z',
  status: 'draft',
  createdAt: 0,
  ...over,
}) as TrafficRow

describe('is this asset a plan or a fact', () => {
  it('a fresh draft is a plan', () => {
    expect(isLiveAsset(row())).toBe(false)
    expect(assetMode(row())).toBe('planner')
    expect(isPlannedAsset(row())).toBe(true)
  })

  it('posted through the tool is live, however it got there', () => {
    expect(isLiveAsset(row({ status: 'posted' }))).toBe(true)
    expect(isLiveAsset(row({ postedAt: 1700000000000 }))).toBe(true)
  })

  it('attached to a real post is live', () => {
    expect(isLiveAsset(row({ sourceUrl: 'https://instagram.com/p/abc', source: 'social-live' }))).toBe(true)
    expect(assetMode(row({ sourceUrl: 'https://acme.com/case', source: 'site' }))).toBe('active')
  })

  /**
   * The case the two old rules disagreed on, and the reason this one is written down. An ingested
   * row that was never posted through the tool IS a record of something real: it came off a
   * platform. contentSignals used to count it as a plan still waiting to happen.
   */
  it('counts an imported row as live, which one of the two old rules did not', () => {
    expect(isLiveAsset(row({ sourceUrl: 'https://acme.com/post', source: 'imported' }))).toBe(true)
  })

  /**
   * A generated draft carrying a reference link is NOT live. The agent hands cards links; treating
   * one as published would put a projection in the measured column, which is the one direction this
   * must never get wrong.
   */
  it('refuses a generated draft that merely has a link on it', () => {
    expect(isLiveAsset(row({ sourceUrl: 'https://instagram.com/p/abc', source: 'generated' }))).toBe(false)
    expect(isLiveAsset(row({ sourceUrl: 'https://instagram.com/p/abc' }))).toBe(false)
  })

  it('ignores a blank link', () => {
    expect(isLiveAsset(row({ sourceUrl: '   ', source: 'social-live' }))).toBe(false)
  })
})

/**
 * WHICH WORDS A READER GETS, and why it is not the same answer the diff gives.
 *
 * Two jobs read an asset's copy. "What is this going to say" is reading a plan and must keep reading
 * `messaging` — the editor, generation, the check on whether an asset is written yet. "What did this
 * say" is reading a record, and for a shipped asset the plan is the wrong answer: contentSignals
 * credits a headline with the reach it earned, so a headline rewritten before it went out was being
 * credited with numbers belonging to the one that replaced it, while the line that did the work was
 * counted as never used.
 */
describe('the copy a reader should be looking at', () => {
  const planned = { headline: 'Built for storms', body: 'Same body', cta: 'Book a demo' }

  it('gives the plan for an asset that has not run', () => {
    expect(effectiveMessaging(row({ messaging: planned }))).toEqual(planned)
  })

  it('gives what ran, where it ran', () => {
    const r = row({
      status: 'posted',
      messaging: planned,
      live: { copy: { headline: 'Made for rough water' } },
    })
    expect(effectiveMessaging(r)).toEqual({ ...planned, headline: 'Made for rough water' })
  })

  /**
   * PER FIELD. Copy is recorded where it CHANGED, so an unrecorded component almost always means
   * "that one went as written" — blanking it would delete most of a campaign from the corpus.
   */
  it('falls back to the plan for a component nobody recorded', () => {
    const r = row({ status: 'posted', messaging: planned, live: { copy: { headline: 'Made for rough water', cta: '' } } })
    expect(effectiveMessaging(r).body).toBe('Same body')
    expect(effectiveMessaging(r).cta).toBe('Book a demo')
  })

  /** An unrecorded component reads as the plan, which is what "recorded where it changed" means. */
  it('reads an unrecorded component as the plan', () => {
    const r = row({ status: 'posted', messaging: { cta: 'Book a demo' }, live: { copy: {} } })
    expect(effectiveMessaging(r).cta).toBe('Book a demo')
  })

  /** A draft carrying live copy from somewhere is not a record of anything. */
  it('ignores live copy on an asset that has not gone out', () => {
    const r = row({ messaging: planned, live: { copy: { headline: 'Never ran' } } })
    expect(effectiveMessaging(r)).toEqual(planned)
  })
})

/**
 * HOW MANY PLANS HAVE BECOME RECORDS.
 *
 * The stat filtered to planned cards and counted reconciledAt inside that set, which can only ever
 * be zero: reconciling a card is what stops it being planned. Invisible while nothing wrote
 * reconciledAt; attaching a live post writes it now, so the count would have sat at nought while the
 * work was being done, recommending forever that somebody start it.
 */
describe('how much of the plan has been reconciled', () => {
  const planned = row({ id: 'a' })
  const reconciled = row({ id: 'b', status: 'posted', sourceUrl: 'https://x.com/i/status/1', source: 'social-live', reconciledAt: 1700000000000 })

  it('counts a reconciled card, which the old reading could not', () => {
    expect(reconciliationStat([planned, reconciled])).toEqual({ planned: 2, reconciled: 1 })
  })

  it('is nought of nought with nothing to reconcile', () => {
    expect(reconciliationStat([])).toEqual({ planned: 0, reconciled: 0 })
  })

  /** A card that arrived from an import was never a plan of ours, so it is in neither number. */
  it('leaves imported content out of both halves', () => {
    const imported = row({ id: 'c', sourceUrl: 'https://acme.com/post', source: 'imported' })
    expect(reconciliationStat([planned, imported])).toEqual({ planned: 1, reconciled: 0 })
  })
})
