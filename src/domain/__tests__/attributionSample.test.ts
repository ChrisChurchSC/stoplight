import { describe, expect, it } from 'vitest'
import { mockAttio } from '../../adapters/attio/mockAttio'
import { computeInsights } from '../insights'
import type { TrafficRow } from '../types'

/**
 * REVENUE, PIPELINE, LEADS AND ROAS COME FROM A MOCK, AND SAID SO NOWHERE.
 *
 * The only attribution adapter in the tree is six fictional contacts and five fictional deals —
 * Northwind, Globex, Pied Piper; $48,000, $72,000, $36,000 — matched on the SAMPLE workspace's
 * asset names. Which produces two failures, and the second is the one a customer meets:
 *
 *   In the sample workspace, invented deals render in the same type as measured engagement.
 *   In a real workspace, no asset name matches, so the KPI strip reads £0 attributed revenue with
 *   no ROAS — which does not say "no CRM is connected", it says the campaigns earned nothing.
 *
 * The flag travels out of the domain so every surface asks the same source, and so a real adapter
 * turns every mark off at once rather than leaving one screen still apologising.
 */

const row = (assetName: string, over: Partial<TrafficRow> = {}): TrafficRow =>
  ({
    id: assetName,
    assetId: assetName,
    assetName,
    channel: 'linkedin',
    assetType: 'post',
    mediaType: 'text',
    messaging: { caption: 'x' },
    campaign: 'C',
    audience: 'A',
    status: 'posted',
    scheduledAt: '2026-01-01T00:00:00.000Z',
    createdAt: 0,
    ...over,
  }) as TrafficRow

const opts = { comments: {}, flaggedRowIds: new Set<string>(), hasReview: false }

describe('the attribution source declares itself', () => {
  it('the only adapter in the tree is a sample one', () => {
    expect(mockAttio.isSample).toBe(true)
  })

  it('computeInsights carries that out to whoever renders it', () => {
    const ins = computeInsights([row('anything')], opts)
    expect(ins.attributionIsSample).toBe(true)
  })
})

describe('what a real workspace actually gets', () => {
  /**
   * The case that matters. A real asset name matches none of the mock's five deals, so every
   * attribution figure is zero — and zero rendered without a mark is a claim about the business.
   */
  it('returns zero revenue for assets the mock has never heard of', () => {
    const ins = computeInsights([row('Q4 launch — LinkedIn post'), row('Pricing page refresh')], opts)
    expect(ins.kpis.revenue).toBe(0)
    expect(ins.kpis.leads).toBe(0)
    expect(ins.kpis.pipeline).toBe(0)
    // Which is exactly why it must be marked: nothing here distinguishes "earned nothing" from
    // "nobody connected a CRM".
    expect(ins.attributionIsSample).toBe(true)
  })

  it('returns the invented figures for the sample workspace, still marked', () => {
    // 'spring-launch-lp' is one of the mock's seeded source assets: $72,000 + $36,000 closed-won.
    const ins = computeInsights([row('spring-launch-lp')], opts)
    expect(ins.kpis.revenue).toBe(108000)
    expect(ins.attributionIsSample).toBe(true)
  })
})

describe('ROAS is only as real as the revenue above it', () => {
  it('is null with no spend, rather than implying a measured zero', () => {
    const ins = computeInsights([row('spring-launch-lp')], opts)
    expect(ins.kpis.roas).toBeNull()
  })

  it('divides sample revenue by spend when spend exists, so it inherits the mark', () => {
    const ins = computeInsights([row('spring-launch-lp', { spend: { toDate: 54000, updatedAt: 0 } })], opts)
    expect(ins.kpis.roas).toBe(2)
    expect(ins.attributionIsSample).toBe(true)
  })
})
