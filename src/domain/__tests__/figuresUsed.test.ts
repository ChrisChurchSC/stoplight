import { describe, expect, it } from 'vitest'
import { figuresUsedIn } from '../datasetRead'
import type { CitableFigure } from '../datasetRead'

/**
 * The audit trail has to be computed, not asked for. These assert it reflects the text and only the
 * text, because a provenance line that is wrong is worse than none: somebody will trust it.
 */

const fig = (id: string, value: string): CitableFigure => ({
  id, value, label: `figure ${id}`, basis: 'cell', source: 'Search Console', partial: false, datasetId: 'ds_1',
})

const FIGS = [fig('f1', '1,240'), fig('f2', '62%'), fig('f3', '443')]

describe('figuresUsedIn', () => {
  it('finds a figure written with its separator', () => {
    expect(figuresUsedIn(['We saw 1,240 clicks last quarter.'], FIGS)).toEqual(['f1'])
  })

  it('finds the same figure written without one', () => {
    // The one variation a writer legitimately makes to a number it was told to reproduce.
    expect(figuresUsedIn(['We saw 1240 clicks last quarter.'], FIGS)).toEqual(['f1'])
  })

  it('finds a percentage', () => {
    expect(figuresUsedIn(['62% of clicks came from ten queries.'], FIGS)).toEqual(['f2'])
  })

  it('returns nothing when the copy carries no figure', () => {
    expect(figuresUsedIn(['Search is working better than it was.'], FIGS)).toEqual([])
  })

  it('finds several across several components', () => {
    expect(figuresUsedIn(['1,240 clicks', 'and 62% of them from ten queries'], FIGS).sort()).toEqual(['f1', 'f2'])
  })

  it('does not match a number that merely contains the figure', () => {
    // 4430 contains 443, and claiming the figure landed would be a false audit trail.
    const only443 = [fig('f3', '443')]
    expect(figuresUsedIn(['We counted 4430 sessions.'], only443)).toEqual([])
  })
})
