/**
 * Asks the server /api/ingest-site endpoint to fetch a brand's website and extract its content as
 * loosely-shaped items (title / primaryText / description / url / channel) ready for the store's
 * importAssets. Returns [] on any failure so the caller can report a clean "couldn't read" message.
 */
import { apiFetch } from '../../lib/apiFetch'

export async function ingestSite(
  url: string,
  ctx?: { brand?: string; workspace?: string },
): Promise<Record<string, unknown>[]> {
  try {
    const res = await apiFetch('/api/ingest-site', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, brand: ctx?.brand, workspace: ctx?.workspace }),
    })
    if (!res.ok) throw new Error(`ingest-site ${res.status}`)
    const data = (await res.json()) as { items?: Record<string, unknown>[] }
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}
