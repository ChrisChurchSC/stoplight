import { describe, expect, it, vi } from 'vitest'
import type { AggregatorPullResult } from '../../src/domain/aggregator.js'

/**
 * COVERAGE SURVIVES THE HANDLER.
 *
 * The fault this pins was not a wrong value, it was a missing key: the Google branch built its
 * result as {columns, rows, truncated} and the coverage the pull had already worked out fell on the
 * floor, silently, with no error and no failing test. Every table pulled straight from Search
 * Console, GA4 or YouTube then had no coverage, so it could not say what it spanned and its
 * staleness counted from the moment of the request instead of the end of the data.
 *
 * A field dropped from an object literal is invisible to the type checker when the field is
 * optional, which is why this is asserted at the handler's boundary rather than trusted.
 */

vi.mock('../channelPull.js', () => ({
  googleConfigured: () => true,
  googleServices: async () => ['google_search_console'],
  runGooglePull: async () => ({
    columns: ['Page', 'Clicks'],
    rows: [['/a', '10']],
    truncated: false,
    coverage: { from: '2026-05-12', to: '2026-08-06' },
  }),
}))

const { runAggregator } = await import('../aggregatorHandler.js')

describe('a Google pull through the handler', () => {
  it('carries the coverage the pull worked out', async () => {
    const r = (await runAggregator({
      op: 'pull',
      provider: 'google',
      pull: 'gsc-pages',
      days: 90,
      brand: 'Acme',
    })) as AggregatorPullResult

    expect(r.rows).toEqual([['/a', '10']])
    // The point of the test. Coverage ends three days before today, the way Search Console reports,
    // and that gap is exactly what the request date cannot tell anyone.
    expect(r.coverage).toEqual({ from: '2026-05-12', to: '2026-08-06' })
  })
})
