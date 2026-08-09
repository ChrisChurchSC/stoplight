import { describe, expect, it } from 'vitest'
import { assetTrend, sparkPath } from '../assetTrend'
import type { MetricSnapshot } from '../metricSnapshot'

/**
 * THE SHAPE A SINGLE NUMBER CANNOT SHOW.
 *
 * The store keeps every reading rather than overwriting, so an asset's numbers are a series. What is
 * worth pinning is the two judgements that turn a query result into a chart — which readings are the
 * same reading, and what counts as a change — plus the two ways a sparkline lies: spacing points by
 * index when they were taken weeks apart, and scaling to its own minimum so a rounding wobble draws
 * as a cliff.
 */

const snap = (over: Partial<MetricSnapshot> = {}): MetricSnapshot => ({
  brand: 'Big Buoy',
  scope: 'asset',
  scopeId: 'r1',
  metric: 'impressions',
  value: 100,
  capturedAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

describe('one asset’s readings over time', () => {
  it('groups by metric, oldest first, with the latest and the change since the one before', () => {
    const out = assetTrend(
      [
        snap({ value: 300, capturedAt: '2026-08-03T00:00:00.000Z' }),
        snap({ value: 100, capturedAt: '2026-08-01T00:00:00.000Z' }),
        snap({ value: 250, capturedAt: '2026-08-02T00:00:00.000Z' }),
      ],
      'r1',
    )
    expect(out).toHaveLength(1)
    expect(out[0].points.map((p) => p.value)).toEqual([100, 250, 300])
    expect(out[0]).toMatchObject({ metric: 'impressions', first: 100, latest: 300, delta: 50 })
  })

  /**
   * A first reading has nothing to be a change from, and printing "+41,000" beside it would state a
   * rise that was really an arrival.
   */
  it('reports no delta for a first reading', () => {
    expect(assetTrend([snap()], 'r1')[0].delta).toBeUndefined()
  })

  /**
   * setLiveMetrics writes every metric of a submission at one timestamp, and correcting a typo
   * writes the whole set again. Two values at one instant are one reading, corrected — not a
   * vertical line and a delta between a number and the number that replaced it.
   */
  it('treats two readings of one moment as one, last winning', () => {
    const out = assetTrend(
      [
        snap({ value: 100, capturedAt: '2026-08-01T00:00:00.000Z' }),
        snap({ value: 4100, capturedAt: '2026-08-01T00:00:00.000Z' }),
      ],
      'r1',
    )
    expect(out[0].points).toEqual([{ at: Date.parse('2026-08-01T00:00:00.000Z'), value: 4100 }])
    expect(out[0].delta).toBeUndefined()
  })

  it('keeps other assets, other scopes and unusable values out', () => {
    const out = assetTrend(
      [
        snap(),
        snap({ scopeId: 'r2', value: 999 }),
        snap({ scope: 'channel', value: 888 }),
        snap({ value: Number.NaN, capturedAt: '2026-08-04T00:00:00.000Z' }),
        snap({ capturedAt: 'not a date', value: 777 }),
      ],
      'r1',
    )
    expect(out).toHaveLength(1)
    expect(out[0].points.map((p) => p.value)).toEqual([100])
  })

  it('orders the metrics stably, so the panel does not reshuffle as readings arrive', () => {
    const out = assetTrend([snap({ metric: 'reach' }), snap({ metric: 'clicks' }), snap({ metric: 'impressions' })], 'r1')
    expect(out.map((t) => t.metric)).toEqual(['clicks', 'impressions', 'reach'])
  })

  it('has nothing to say about an asset with no readings', () => {
    expect(assetTrend([], 'r1')).toEqual([])
  })
})

describe('drawing it', () => {
  const at = (iso: string) => Date.parse(iso)

  /**
   * X IS TIME. Three readings across a month and three across an afternoon are different shapes, and
   * spacing by index draws them identically — the most common way a sparkline misleads.
   */
  it('spaces points by when they were taken, not by their order', () => {
    const d = sparkPath(
      [
        { at: at('2026-08-01T00:00:00Z'), value: 0 },
        { at: at('2026-08-02T00:00:00Z'), value: 50 },
        { at: at('2026-08-11T00:00:00Z'), value: 100 },
      ],
      100,
      20,
    )
    // Day 1 of ten sits a tenth along, not a third.
    expect(d).toContain('M0.00')
    expect(d).toContain('L10.00')
    expect(d).toContain('L100.00')
  })

  /**
   * Y IS ANCHORED TO ZERO. Scaled to its own minimum, 1000 → 1001 draws as a full-height climb.
   * Flat draws flat — and mid-box rather than on the floor, where it would read as an axis.
   */
  it('does not turn a wobble into a cliff', () => {
    const d = sparkPath(
      [
        { at: at('2026-08-01T00:00:00Z'), value: 1000 },
        { at: at('2026-08-02T00:00:00Z'), value: 1001 },
      ],
      100,
      20,
    )
    const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
    // Both near the top of the box, a hair apart — not floor to ceiling.
    expect(Math.abs(ys[0] - ys[1])).toBeLessThan(1)
  })

  it('draws a flat series flat, in the middle', () => {
    const d = sparkPath(
      [
        { at: at('2026-08-01T00:00:00Z'), value: 0 },
        { at: at('2026-08-02T00:00:00Z'), value: 0 },
      ],
      100,
      20,
    )
    expect(d).toBe('M0.00 10.00 L100.00 10.00')
  })

  /** Readings that share one timestamp cannot be spaced by time, and must not divide by zero. */
  it('falls back to even spacing when every reading shares a moment', () => {
    const t = at('2026-08-01T00:00:00Z')
    const d = sparkPath([{ at: t, value: 0 }, { at: t, value: 10 }, { at: t, value: 20 }], 100, 20)
    expect(d).toContain('M0.00')
    expect(d).toContain('L50.00')
    expect(d).toContain('L100.00')
  })

  it('puts a lone reading in the middle rather than at an edge', () => {
    expect(sparkPath([{ at: at('2026-08-01T00:00:00Z'), value: 5 }], 100, 20)).toBe('M50.00 0.00')
  })

  it('has no path for no points', () => {
    expect(sparkPath([], 100, 20)).toBe('')
  })
})
