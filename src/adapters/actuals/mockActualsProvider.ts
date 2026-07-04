import type { BrandActuals } from '../../domain/actuals'
import type { ActualsProvider } from './types'

/**
 * Last-known measured snapshots per brand, pulled from the connected source
 * (Summer / Forward). Stands in until a proxy is deployed (see httpActualsProvider),
 * so "Refresh" works end to end and survives a localStorage reset. The numbers here
 * are the real World Within pull: YouTube 792k views (8.2k/video), Search 15k
 * impressions, LinkedIn 1.1k impressions (219/post), Website 4.9k sessions, each with
 * its week-over-week trend for the alert layer.
 */
const SNAPSHOTS: Record<string, Omit<BrandActuals, 'updatedAt'>> = {
  'World Within': {
    source: 'Summer · Forward API',
    channels: [
      { channel: 'youtube', label: 'YouTube', reachUnit: 'views', reach: 792271, assets: 97, reachPerAsset: 8168, engagement: 4203, trend: { cur: 277706, prior: 416314 }, from: '2026-05-31', to: '2026-06-29' },
      { channel: 'google-search', label: 'Search (GSC)', reachUnit: 'impressions', reach: 15246, clicks: 903, trend: { cur: 2848, prior: 3074 }, from: '2026-04-03', to: '2026-07-02' },
      { channel: 'website', label: 'Website (GA4)', reachUnit: 'sessions', reach: 4886, trend: { cur: 533, prior: 418 }, from: '2026-04-03', to: '2026-07-02' },
      { channel: 'linkedin', label: 'LinkedIn', reachUnit: 'impressions', reach: 1097, assets: 5, reachPerAsset: 219, engagement: 44, clicks: 50, trend: { cur: 582, prior: 129 }, from: '2026-05-01', to: '2026-05-27' },
    ],
  },
}

export const mockActualsProvider: ActualsProvider = {
  source: 'Summer · Forward API',
  async fetch(brand) {
    // Simulate the round trip so the UI's loading state is honest.
    await new Promise((r) => setTimeout(r, 450))
    const snap = SNAPSHOTS[brand.trim()]
    return snap ? { ...snap, updatedAt: Date.now() } : null
  },
}
