import { afterEach, describe, expect, it, vi } from 'vitest'
import { googleCoverage } from '../channelPull.js'

/**
 * WHAT A GOOGLE PULL SAYS IT COVERS.
 *
 * Three APIs, three date shapes, one answer. These replay the response shapes rather than reaching
 * the socket, which is the only kind of test this file can have: no Google credentials exist in this
 * environment and none should be needed to know that GA4 hands back 20260512 where Search Console
 * hands back 2026-05-12.
 *
 * The refusals matter more than the happy path. Coverage decides staleness, and staleness decides
 * whether a figure reaches published copy, so a probe that guesses a date is worse than one that
 * returns nothing.
 */

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response

/** Capture what was actually requested, since the shape of the ask is half of what is being tested. */
let sent: { url: string; init?: RequestInit }[] = []
const stub = (body: unknown) => {
  sent = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), init })
    return Promise.resolve(ok(body))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('googleCoverage', () => {
  it('reads Search Console dates straight out of the row keys', async () => {
    stub({ rows: [{ keys: ['2026-05-12'] }, { keys: ['2026-08-09'] }, { keys: ['2026-06-01'] }] })
    const cov = await googleCoverage('gsc', 'https://acme.example/', 'tok', 90)
    // Sorted, not taken in the order the API happened to return them.
    expect(cov).toEqual({ from: '2026-05-12', to: '2026-08-09' })
    // Dimensioned by date and nothing else: a second dimension would multiply rows by the window.
    expect(JSON.parse(String(sent[0].init?.body))).toMatchObject({ dimensions: ['date'] })
  })

  it('converts GA4 dates, which arrive with no separators', async () => {
    stub({
      rows: [
        { dimensionValues: [{ value: '20260512' }] },
        { dimensionValues: [{ value: '20260809' }] },
      ],
    })
    const cov = await googleCoverage('ga4', 'properties/12345', 'tok', 90)
    expect(cov).toEqual({ from: '2026-05-12', to: '2026-08-09' })
    // The properties/ prefix is stripped rather than doubled into the path.
    expect(sent[0].url).toContain('/properties/12345:runReport')
  })

  it('finds the YouTube day column by name rather than by position', async () => {
    stub({
      columnHeaders: [{ name: 'views' }, { name: 'day' }],
      rows: [
        [10, '2026-07-01'],
        [40, '2026-07-31'],
      ],
    })
    const cov = await googleCoverage('yt', 'UC123', 'tok', 30)
    expect(cov).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('returns nothing when the day column is not where it was expected', async () => {
    // Reading position blind is what once produced coverage {from: "world with", to: "443"}.
    stub({ columnHeaders: [{ name: 'views' }, { name: 'subscribers' }], rows: [[10, 4]] })
    expect(await googleCoverage('yt', 'UC123', 'tok', 30)).toBeUndefined()
  })

  it('refuses anything that is not a date, rather than passing it on', async () => {
    stub({ rows: [{ keys: ['world with'] }, { keys: ['443'] }, { keys: ['2026-13-45'] }] })
    expect(await googleCoverage('gsc', 'https://acme.example/', 'tok', 90)).toBeUndefined()
  })

  it('keeps the real dates and drops the junk when a response carries both', async () => {
    stub({ rows: [{ keys: ['2026-05-12'] }, { keys: [''] }, { keys: ['2026-06-30'] }] })
    expect(await googleCoverage('gsc', 'https://acme.example/', 'tok', 90)).toEqual({
      from: '2026-05-12',
      to: '2026-06-30',
    })
  })

  it('returns nothing for an empty window instead of inventing one', async () => {
    stub({ rows: [] })
    expect(await googleCoverage('ga4', '12345', 'tok', 30)).toBeUndefined()
  })

  it('throws on a failed request, so the caller decides whether to keep the table', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 403 } as Response))
    await expect(googleCoverage('gsc', 'https://acme.example/', 'tok', 90)).rejects.toThrow('403')
  })
})
