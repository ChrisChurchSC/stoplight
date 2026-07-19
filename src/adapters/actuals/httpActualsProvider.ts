import type { BrandActuals } from '../../domain/actuals'
import type { ActualsProvider } from './types'

/**
 * The real seam. Points at a deployed proxy that holds the Summer / Forward token and
 * runs the per-channel query (see the mock for the shape it returns). Contract:
 *   GET {baseUrl}?brand=<name>  ->  BrandActuals JSON (200), or 204/404 when no data.
 * Enable by setting VITE_ACTUALS_URL; until then the app uses the mock provider.
 */
export function httpActualsProvider(baseUrl: string): ActualsProvider {
  return {
    source: 'Summer · Forward API',
    async fetch(brand, opts) {
      const q = new URLSearchParams({ brand })
      if (opts?.workspaceId) q.set('workspace', opts.workspaceId)
      if (opts?.website) q.set('website', opts.website)
      const res = await fetch(`${baseUrl}?${q.toString()}`, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok || res.status === 204) return null
      const data = (await res.json()) as BrandActuals | null
      return data && Array.isArray(data.channels) ? data : null
    },
  }
}
