import type { BrandActuals } from '../../domain/actuals'
import type { ActualsProvider } from './types'

/**
 * Deliberately empty.
 *
 * This held one real client's measured pull: their YouTube, Search, GA4 and LinkedIn numbers, and
 * six real video titles naming real third parties. None of it was fictional, and because this is the
 * DEFAULT provider whenever VITE_ACTUALS_URL is unset (see ./index.ts), every one of those strings
 * was compiled into the shipped bundle and served to anyone who loaded the app.
 *
 * Do not repopulate it with another brand's real figures. If a stand-in is ever wanted here it has
 * to be unmistakably invented, because whatever goes in this object ships to every visitor.
 *
 * With no entry, fetch returns null for every brand, which is the same answer a real provider gives
 * when nothing is connected: the Metrics panel shows its empty state and prompts you to connect a
 * source, rather than presenting a frozen snapshot as a live pull.
 */
const SNAPSHOTS: Record<string, Omit<BrandActuals, 'updatedAt'>> = {}

export const mockActualsProvider: ActualsProvider = {
  source: 'Summer · Forward API',
  async fetch(brand) {
    // Simulate the round trip so the UI's loading state is honest.
    await new Promise((r) => setTimeout(r, 450))
    const snap = SNAPSHOTS[brand.trim()]
    return snap ? { ...snap, updatedAt: Date.now() } : null
  },
}
