import { IngestError, type IngestProgress } from './ingestChannel'
import { apiFetch } from '../../lib/apiFetch'

/**
 * Client for the Neon ingest: pull a brand's published assets (fundraising
 * campaign pages, event pages) from NeonCRM into the Library. Streams stage
 * progress over SSE, then returns the mapped items ready for importAssets. The
 * Neon key lives server-side (.env); this only triggers the pull. Mirrors
 * ingestResendStream. Throws IngestError with code 'NO_KEY' when Neon isn't
 * configured, so the Library skips it cleanly.
 */

export interface NeonAsset {
  platform: string
  title: string
  copy?: string
  url?: string
  date?: string
}
export interface NeonIngestResult {
  items: NeonAsset[]
  campaignsRead: number
  eventsRead: number
}

export async function ingestNeonStream(
  input: { brand?: string },
  onProgress?: (e: IngestProgress) => void,
): Promise<NeonIngestResult> {
  const res = await apiFetch('/api/ingest-neon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok || !res.body) throw new IngestError(`ingest-neon ${res.status}`, res.status === 501 ? 'NO_KEY' : null)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result: NeonIngestResult | null = null
  let error: { code: string | null; message: string } | null = null

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
      if (ev === 'progress') onProgress?.(data as IngestProgress)
      else if (ev === 'result') result = data as NeonIngestResult
      else if (ev === 'error') error = data as { code: string | null; message: string }
    }
  }

  if (error) throw new IngestError(error.message, error.code)
  if (!result) throw new IngestError('empty Neon ingest', null)
  return result
}
