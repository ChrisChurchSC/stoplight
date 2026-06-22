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
  /** Social profiles found on their site (platform -> URL). YouTube is pulled
   *  when a key is set; the rest are discovered for the connect step. */
  socials?: Record<string, string>
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

export interface MapProgress {
  stage: string
  detail: string
}

/** Same as mapSite, but streams stage progress (reading, pages, ads, extracting,
 *  mapped) over SSE so the onboarding UI can show the work as it happens. */
export async function mapSiteStream(
  input: { url: string; notes?: string },
  onProgress: (e: MapProgress) => void,
): Promise<SiteMap> {
  const res = await fetch('/api/map-site-stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok || !res.body) throw new Error(`map-site-stream ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result: SiteMap | null = null
  let error: string | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const ev = /^event: (.*)$/m.exec(frame)?.[1]
      const dataLine = /^data: (.*)$/m.exec(frame)?.[1]
      if (!ev || !dataLine) continue
      const data = JSON.parse(dataLine) as unknown
      if (ev === 'progress') onProgress(data as MapProgress)
      else if (ev === 'result') result = data as SiteMap
      else if (ev === 'error') error = (data as { message?: string })?.message ?? 'failed'
    }
  }
  if (error) throw new Error(error)
  if (!result?.brand?.name) throw new Error('empty map')
  return result
}
