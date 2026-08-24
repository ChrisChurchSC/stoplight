import { describe, expect, it } from 'vitest'
import { buildCampaignReport, type ReportInput } from '../report'
import type { Suggestion } from '../campaignReview'
import type { TrafficRow } from '../types'

/**
 * WHAT A REPORT IS ALLOWED TO SAY.
 *
 * Most of these are about the line between measured and projected, because that is the line a
 * report cannot be trusted across. The rest are about the promise: a report that cannot say what
 * the campaign was FOR is a dashboard with prose around it.
 */

let n = 0
const row = (patch: Partial<TrafficRow> = {}): TrafficRow =>
  ({
    id: `row_${++n}`,
    assetId: '',
    assetName: `Asset ${n}`,
    channel: 'linkedin',
    assetType: 'post',
    mediaType: 'image',
    messaging: {},
    campaign: 'Launch',
    audience: 'Founders',
    status: 'draft',
    scheduledAt: '2026-09-03T09:00:00.000Z',
    createdAt: 1_756_000_000_000,
    ...patch,
  }) as TrafficRow

const input = (patch: Partial<ReportInput> = {}): ReportInput => ({
  brand: 'Enid Blythe',
  campaign: 'Launch',
  rows: [row()],
  strategy: 'demand-gen',
  goal: { message: 'Land the new line', kpi: 'Qualified leads', target: 40 },
  proofPoints: [{ id: 'rtb_1', label: '92% reorder rate' }],
  attributionIsSample: true,
  suggestions: [],
  ...patch,
})

describe('money, which is withheld rather than zeroed', () => {
  it('reports no money at all when the figures would be sample data', () => {
    const r = buildCampaignReport(input({ attributionIsSample: true }))
    expect(r.money.shown).toBe(false)
    if (r.money.shown) throw new Error('unreachable')
    expect(r.money.reason).toMatch(/No CRM is connected/)
    // The point of suppressing: there is no number here to be misread as a result.
    expect(JSON.stringify(r.money)).not.toMatch(/"revenue"/)
  })

  it('still withholds when a CRM is attached but no figures arrived', () => {
    const r = buildCampaignReport(input({ attributionIsSample: false, attribution: undefined }))
    expect(r.money.shown).toBe(false)
    if (r.money.shown) throw new Error('unreachable')
    expect(r.money.reason).toMatch(/no attribution figures were supplied/)
  })

  it('reports money only when a CRM supplied it, naming the CRM', () => {
    const r = buildCampaignReport(
      input({
        attributionIsSample: false,
        crm: 'Attio',
        attribution: { revenue: 40_000, pipeline: 12_000, leads: 25 },
        rows: [row({ spend: { toDate: 10_000, updatedAt: 0 } })],
      }),
    )
    expect(r.money.shown).toBe(true)
    if (!r.money.shown) throw new Error('unreachable')
    expect(r.money.crm).toBe('Attio')
    expect(r.money.revenue).toBe(40_000)
    expect(r.money.roas).toBe(4)
  })

  it('gives no ratio when there is no spend to divide by', () => {
    const r = buildCampaignReport(
      input({ attributionIsSample: false, attribution: { revenue: 40_000, pipeline: 0, leads: 1 } }),
    )
    if (!r.money.shown) throw new Error('unreachable')
    // A partial denominator flatters whatever was left out of it.
    expect(r.money.roas).toBeNull()
  })
})

describe('measured, which is only what the channel actually said', () => {
  it('counts only assets carrying real numbers', () => {
    const r = buildCampaignReport(
      input({
        rows: [
          row({ socialMetrics: { impressions: 1000 }, engagement: { likes: 10, comments: 2 } }),
          row(), // planned, never posted
        ],
      }),
    )
    expect(r.measured.assets).toBe(1)
    expect(r.measured.impressions).toBe(1000)
    expect(r.measured.engagement).toBe(12)
    expect(r.measured.source).toBe('channel')
  })

  it('says measurement has not started rather than reporting zeroes as a result', () => {
    const r = buildCampaignReport(input({ rows: [row(), row()] }))
    expect(r.measured.assets).toBe(0)
    expect(r.measured.source).toBe('none')
  })

  it('never lets a projection into the measured section', () => {
    // A row with spend but no platform numbers has a forecast, not a result.
    const r = buildCampaignReport(input({ rows: [row({ spend: { toDate: 5000, updatedAt: 0 } })] }))
    expect(r.measured.impressions).toBe(0)
    expect(r.measured.source).toBe('none')
  })
})

describe('the promise, which the report is accountable to', () => {
  it('opens with the motion, goal, audience and proof', () => {
    const r = buildCampaignReport(input())
    expect(r.promise.motion).toBe('demand-gen')
    expect(r.promise.goal?.kpi).toBe('Qualified leads')
    expect(r.promise.audiences).toEqual(['Founders'])
    expect(r.promise.proofPoints).toHaveLength(1)
    expect(r.promise.unanswered).toEqual([])
  })

  it('names an unanswered motion instead of reporting against a guess', () => {
    const r = buildCampaignReport(input({ strategy: undefined }))
    expect(r.promise.motion).toBeNull()
    expect(r.promise.unanswered.join(' ')).toMatch(/GTM motion/)
  })

  it('names every rung nobody answered', () => {
    const r = buildCampaignReport(
      input({ strategy: undefined, goal: undefined, proofPoints: [], rows: [row({ audience: '' })] }),
    )
    expect(r.promise.unanswered).toHaveLength(4)
    expect(r.promise.unanswered.join(' ')).toMatch(/backs its claims/)
  })
})

describe('what shipped, the section owed to nothing but the rows', () => {
  it('counts assets by stage and channel, and what is live', () => {
    const r = buildCampaignReport(
      input({
        rows: [
          row({ channel: 'linkedin', status: 'posted' }),
          row({ channel: 'linkedin' }),
          row({ channel: 'email', assetType: 'email' }),
        ],
      }),
    )
    expect(r.shipped.total).toBe(3)
    expect(r.shipped.live).toBe(1)
    expect(r.shipped.byChannel[0].assets).toBe(2)
    expect(r.shipped.byStage.reduce((a, s) => a + s.assets, 0)).toBe(3)
  })

  it('leaves archived assets out entirely', () => {
    const r = buildCampaignReport(input({ rows: [row(), row({ archivedAt: Date.now() })] }))
    expect(r.shipped.total).toBe(1)
  })

  it('reports journey gaps as a finding, not an omission', () => {
    const gap: Suggestion = {
      kind: 'uncovered-handoff',
      severity: 'high',
      what: 'The ad leads to the landing page with no CTA.',
      why: 'A line nobody can walk.',
      where: {},
      fix: 'edit_asset …',
    }
    const r = buildCampaignReport(input({ rows: [row({ linksTo: 'Landing page' })], suggestions: [gap] }))
    expect(r.shipped.journey.links).toBe(1)
    expect(r.shipped.journey.gaps).toBe(1)
  })
})

describe('which proof earned the attention', () => {
  it('ranks proof points by measured engagement, and says that is the basis', () => {
    const r = buildCampaignReport(
      input({
        proofPoints: [
          { id: 'rtb_1', label: '92% reorder rate' },
          { id: 'rtb_2', label: 'Ships in 24h' },
        ],
        rows: [
          row({ rtbMap: { primary: ['rtb_1'] }, engagement: { likes: 5, comments: 0 } }),
          row({ rtbMap: { primary: ['rtb_2'] }, engagement: { likes: 90, comments: 10 } }),
        ],
      }),
    )
    expect(r.proofPerformance[0].label).toBe('Ships in 24h')
    expect(r.proofPerformance[0].engagement).toBe(100)
    // Never implied to be money — the money section is withheld in this very report.
    expect(r.proofPerformance[0].basis).toBe('engagement')
  })

  it('keys on the proof id, so two proofs worded alike do not merge', () => {
    const r = buildCampaignReport(
      input({
        proofPoints: [
          { id: 'rtb_1', label: 'Fast' },
          { id: 'rtb_2', label: 'Fast' },
        ],
        rows: [
          row({ rtbMap: { primary: ['rtb_1'] }, engagement: { likes: 1, comments: 0 } }),
          row({ rtbMap: { primary: ['rtb_2'] }, engagement: { likes: 2, comments: 0 } }),
        ],
      }),
    )
    expect(r.proofPerformance).toHaveLength(2)
  })
})

describe('planned versus actual', () => {
  it('counts whole days late, not hours', () => {
    const r = buildCampaignReport(
      input({
        rows: [
          row({ scheduledAt: '2026-09-03T09:00:00.000Z', publishedAt: '2026-09-03T13:00:00.000Z' }),
          row({ scheduledAt: '2026-09-03T09:00:00.000Z', publishedAt: '2026-09-05T09:00:00.000Z' }),
        ],
      }),
    )
    expect(r.timing.compared).toBe(2)
    expect(r.timing.onTime).toBe(1)
    expect(r.timing.lateDays).toBe(2)
  })

  it('excludes imported posts, whose intent equals their fact by construction', () => {
    // Import writes scheduledAt = publishedAt, so counting these reports a perfect zero slip for
    // exactly the assets that came from the real world.
    const r = buildCampaignReport(
      input({
        rows: [
          row({ source: 'social-live', scheduledAt: '2026-09-03T09:00:00.000Z', publishedAt: '2026-09-03T09:00:00.000Z' }),
          row({ source: 'imported', scheduledAt: '2026-09-03T09:00:00.000Z', publishedAt: '2026-09-03T09:00:00.000Z' }),
        ],
      }),
    )
    expect(r.timing.compared).toBe(0)
    expect(r.timing.note).toMatch(/no slip to report/)
  })

  it('says there is nothing to compare rather than claiming everything was on time', () => {
    const r = buildCampaignReport(input({ rows: [row()] }))
    expect(r.timing.compared).toBe(0)
    expect(r.timing.onTime).toBe(0)
    expect(r.timing.note).toBeTruthy()
  })
})

describe('purity', () => {
  it('reports the same thing twice for the same input', () => {
    const a = buildCampaignReport(input())
    const b = buildCampaignReport(input())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('does not mutate the rows it was given', () => {
    const rows = [row(), row({ archivedAt: Date.now() })]
    const before = JSON.stringify(rows)
    buildCampaignReport(input({ rows }))
    expect(JSON.stringify(rows)).toBe(before)
  })
})
