import { describe, expect, it } from 'vitest'
import { assetMode, copyDiff, copyDiffStat, effectiveMessaging, isLiveAsset, isPlannedAsset } from '../assetMode'
import type { MessagingField } from '../messaging'
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
 * THE DIFF IS THE FEATURE. "We planned to lead with the guarantee and shipped the discount" is a
 * sentence nothing in here could produce while the live copy was being written over the plan.
 */
const FIELDS: MessagingField[] = [
  { key: 'headline', label: 'Headline' },
  { key: 'body', label: 'Body' },
  { key: 'cta', label: 'CTA' },
]

describe('the plan against what actually ran', () => {
  it('marks the components that changed and leaves the rest alone', () => {
    const r = row({
      messaging: { headline: 'Built for storms', body: 'Same body', cta: 'Book a demo' },
      live: { copy: { headline: 'Made for rough water', body: 'Same body', cta: 'Book a demo' } },
    })
    const lines = copyDiff(r, FIELDS)
    expect(lines.map((l) => [l.key, l.changed])).toEqual([
      ['headline', true],
      ['body', false],
      ['cta', false],
    ])
    expect(copyDiffStat(lines)).toEqual({ compared: 3, changed: 1 })
  })

  /** Planned and not shipped is a real finding, so the line is reported rather than dropped. */
  it('reports a component that was planned and never ran', () => {
    const r = row({ messaging: { cta: 'Book a demo' }, live: { copy: {} } })
    const cta = copyDiff(r, FIELDS).find((l) => l.key === 'cta')
    expect(cta).toMatchObject({ planned: 'Book a demo', live: '', changed: true, empty: false })
  })

  /** Neither side has anything: not a change, and the caller is told so rather than shown a row. */
  it('does not call an empty component a change', () => {
    const lines = copyDiff(row(), FIELDS)
    expect(lines.every((l) => l.empty && !l.changed)).toBe(true)
    expect(copyDiffStat(lines)).toEqual({ compared: 0, changed: 0 })
  })

  /** Case is a real change (a headline in title case IS a different headline); whitespace is not. */
  it('ignores whitespace and respects case', () => {
    const r = row({
      messaging: { headline: 'Built for storms  ' },
      live: { copy: { headline: 'Built for storms' } },
    })
    expect(copyDiff(r, FIELDS)[0].changed).toBe(false)
    const cased = row({ messaging: { headline: 'built for storms' }, live: { copy: { headline: 'Built For Storms' } } })
    expect(copyDiff(cased, FIELDS)[0].changed).toBe(true)
  })

  /** With nothing read back, every planned component reads as changed, which is the honest answer. */
  it('treats a post nothing has been read back from as all-changed', () => {
    const r = row({ messaging: { headline: 'Built for storms' } })
    expect(copyDiffStat(copyDiff(r, FIELDS))).toEqual({ compared: 1, changed: 1 })
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

  /**
   * THE DIFFERENCE FROM copyDiff, stated. The same unrecorded CTA is a gap in the record and the
   * plan's text: the diff reports completeness, this reports the best available words, and neither
   * should answer the other's question.
   */
  it('reads an unrecorded component as the plan, where the diff reads it as a gap', () => {
    const r = row({ status: 'posted', messaging: { cta: 'Book a demo' }, live: { copy: {} } })
    expect(effectiveMessaging(r).cta).toBe('Book a demo')
    const line = copyDiff(r, [{ key: 'cta', label: 'CTA' }])[0]
    expect(line).toMatchObject({ live: '', changed: true })
  })

  /** A draft carrying live copy from somewhere is not a record of anything. */
  it('ignores live copy on an asset that has not gone out', () => {
    const r = row({ messaging: planned, live: { copy: { headline: 'Never ran' } } })
    expect(effectiveMessaging(r)).toEqual(planned)
  })
})
