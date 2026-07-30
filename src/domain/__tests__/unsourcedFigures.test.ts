import { describe, expect, it } from 'vitest'
import { detectStructuralBreaks, normalizeFigure, type CoherenceVocab } from '../coherenceChecks'
import type { TrafficRow } from '../types'

/**
 * A NUMBER IN COPY HAS TO BE ONE SOMEBODY CAN POINT AT.
 *
 * The false positive rate is what decides whether this check is usable: a gate that cries wolf on
 * every price and every "24/7" gets switched off, and then the real one goes past too. So the shape
 * is deliberately narrow, and these tests are mostly about what it must NOT flag.
 */

const vocab = (values: string[], datasetsWired = true): CoherenceVocab =>
  ({
    client: 'Acme',
    campaign: 'C',
    audiences: [],
    ownTerms: new Set<string>(),
    foreign: new Map(),
    proofById: new Map(),
    sources: [],
    targetAccounts: [],
    partners: [],
    citableValues: new Set(values.map(normalizeFigure)),
    datasetsWired,
  }) as unknown as CoherenceVocab

const row = (primary: string): TrafficRow =>
  ({ id: 'r1', campaign: 'C', assetName: 'Post', channel: 'linkedin', messaging: { primary } }) as unknown as TrafficRow

const breaks = (text: string, values: string[] = [], wired = true) =>
  detectStructuralBreaks([row(text)], vocab(values, wired)).filter((b) => b.headline === 'A number with no table behind it')

describe('unsourced figures', () => {
  it('fires on a percentage nothing can back', () => {
    expect(breaks('Teams see 4.1% more replies.').length).toBe(1)
  })

  it('does not fire when the number is citable', () => {
    expect(breaks('Teams see 4.1% more replies.', ['4.1%']).length).toBe(0)
  })

  it('matches across formatting, so 1,240 and 1240 are the same number', () => {
    expect(normalizeFigure('1,240')).toBe(normalizeFigure('1240'))
    expect(normalizeFigure(' 33.80% ')).toBe(normalizeFigure('33.8%'))
  })

  it('says something different when no table is wired at all', () => {
    const b = breaks('Teams see 4.1% more replies.', [], false)
    expect(b[0].why).toContain('came from nowhere')
  })

  it('leaves 24/7 alone', () => {
    expect(breaks('Support is available 24/7 for every plan.').length).toBe(0)
  })

  it('leaves prices and plain counts alone', () => {
    expect(breaks('Plans start at $49 a month for 12 seats.').length).toBe(0)
    expect(breaks('Join 4,200 teams already shipping faster.').length).toBe(0)
  })

  it('catches a multiple as well as a percentage', () => {
    expect(breaks('Ship 3x faster.').length).toBe(1)
    expect(breaks('Ship 3x faster.', ['3x']).length).toBe(0)
  })

  it('raises at most one per asset, so a list of numbers is one problem', () => {
    expect(breaks('Up 4.1%, down 2.2%, and 5x on the rest.').length).toBe(1)
  })

  it('does nothing at all when the campaign has no citable set computed', () => {
    // Absent rather than empty: an older caller that does not pass it must not flag everything.
    const v = vocab([])
    delete (v as { citableValues?: unknown }).citableValues
    expect(detectStructuralBreaks([row('Teams see 4.1% more replies.')], v).filter((b) => b.headline === 'A number with no table behind it').length).toBe(0)
  })

  it('no dash in what it says', () => {
    for (const b of breaks('Teams see 4.1% more replies.')) expect(/[—–]/.test(b.why)).toBe(false)
  })
})

describe('offers are not results', () => {
  it('leaves a discount alone', () => {
    expect(breaks('Get 20% off your first year.').length).toBe(0)
    expect(breaks('Save 15% when you pay annually.').length).toBe(0)
  })

  it('still catches a performance claim in the same sentence shape', () => {
    expect(breaks('Teams cut handling time 20% in the first month.').length).toBe(1)
  })
})
