import { describe, expect, it } from 'vitest'
import { detectStructuralBreaks, normalizeFigure, type CoherenceVocab } from '../coherenceChecks'
import type { TrafficRow } from '../types'

/** Realistic marketing copy, to measure how often this check cries wolf. */
const CORPUS = [
  'Support is available 24/7, every day of the year.',
  'Plans start at $49 a month.',
  'Join 4,200 teams already shipping faster.',
  'Book a 30 minute call with our team.',
  'We have been building this since 2019.',
  'Version 2.0 is out today.',
  'Three ways to cut your onboarding time.',
  'The 5 questions every buyer asks.',
  'Save 2 hours a week on manual ops.',
  'Our team of 40 is here to help.',
  'Ships in 3 to 5 business days.',
  'A 14 day trial, no card needed.',
  'Rated 4.8 out of 5 by our customers.',
  'Over 1,000 integrations out of the box.',
  'Cut onboarding from 6 weeks to 2.',
  'Read the 2026 state of the industry report.',
  'Get 20% off your first year.',
  'Teams report 4.1% more replies.',
  'Ship 3x faster than before.',
  'Conversion rose 12% last quarter.',
  'We answer in under 2 minutes.',
  'Used by 9 of the top 10 agencies.',
  'A 60 second setup, start to finish.',
  'Q3 pricing is live now.',
  'Meet us at booth 214.',
]
const row = (primary: string, i: number): TrafficRow =>
  ({ id: `r${i}`, campaign: 'C', assetName: 'Post', channel: 'linkedin', messaging: { primary } }) as unknown as TrafficRow

const vocab = (values: string[]): CoherenceVocab =>
  ({ client: 'A', campaign: 'C', audiences: [], ownTerms: new Set<string>(), foreign: new Map(), proofById: new Map(),
     sources: [], targetAccounts: [], partners: [],
     citableValues: new Set(values.map(normalizeFigure)), datasetsWired: true }) as unknown as CoherenceVocab

describe('false positive rate over realistic copy', () => {
  it('flags only the genuinely unsourced percentages and multiples', () => {
    const rows = CORPUS.map(row)
    const hits = detectStructuralBreaks(rows, vocab([])).filter((b) => b.headline === 'A number with no table behind it')
    const flagged = hits.map((h) => h.from?.text ?? '')
    // The four lines that really do state a measured-looking figure with nothing behind it.
    // Exactly the three that state a measured-looking figure with nothing behind them. Everything
    // else in the corpus is a price, a count, a duration, a version, a rating or an offer.
    expect(flagged.every((t) => /%|\dx/i.test(t))).toBe(true)
    expect(hits.length).toBe(3)
    expect(flagged.join(' ')).toContain('4.1%')
    expect(flagged.join(' ')).toContain('3x')
    expect(flagged.join(' ')).toContain('12%')
    expect(flagged.join(' ')).not.toContain('20% off')
  })
})
