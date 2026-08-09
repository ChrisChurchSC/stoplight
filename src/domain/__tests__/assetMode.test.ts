import { describe, expect, it } from 'vitest'
import { assetMode, copyDiff, copyDiffStat, isLiveAsset, isPlannedAsset } from '../assetMode'
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
