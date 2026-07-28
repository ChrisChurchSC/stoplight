import type { ContentBatch, ContentProvider } from './types'

/**
 * The real seam. Points at a deployed proxy that holds the Summer / Forward token and
 * pulls the brand's published content per channel (see the mock for the batch shape).
 * Contract:
 *   GET {baseUrl}?brand=<name>  ->  ContentBatch[] JSON (200), or 204/404 when no data.
 * Enable by setting VITE_CONTENT_URL; until then the app uses the mock provider.
 */
export function httpContentProvider(baseUrl: string): ContentProvider {
  return {
    source: 'Summer · Forward API',
    async fetch(brand) {
      const res = await fetch(`${baseUrl}?brand=${encodeURIComponent(brand)}`, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok || res.status === 204) return null
      const data = (await res.json()) as ContentBatch[] | null
      return Array.isArray(data) ? data : null
    },
  }
}
