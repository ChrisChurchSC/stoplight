/**
 * Current-state messaging map: the client's EXISTING live messaging, extracted
 * from their rendered site + live ads by Claude (server-side, /api/map-site) and
 * stored by Hyperfocus as the connected map. The onboarding front door, map what
 * they have, then show where it does not connect.
 */
export interface SiteMapMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  channel: string
  source?: string
}

export interface SiteMap {
  brand: { name: string; website: string; industry: string; voice: string }
  audiences: { name: string; description: string }[]
  proofPoints: { label: string; detail: string }[]
  messages: SiteMapMessage[]
}

/** Extract the current-state map from a URL. Requires the real engine (Claude);
 *  there is no heuristic fallback because the value is the real extraction. */
export async function mapSite(input: { url: string; notes?: string }): Promise<SiteMap> {
  const res = await fetch('/api/map-site', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`map-site ${res.status}`)
  const out = (await res.json()) as SiteMap
  if (!out?.brand?.name || !Array.isArray(out.messages)) throw new Error('empty map')
  return out
}
