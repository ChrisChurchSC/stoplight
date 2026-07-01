import { IngestError, type IngestProgress } from './ingestChannel'

/**
 * Client for the Sanity CMS ingest: pull a brand's owned content (the copy in
 * their dataset) into the Foundation. Streams stage progress over SSE, then
 * returns the mapped messaging. Mirrors ingestChannelStream; the query + mapping
 * run server-side (/api/ingest-sanity).
 */

export interface SanityMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  /** Owned surface the copy belongs to (website/blog/landing-page…). */
  channel?: string
  source?: string
}

export interface SanityIngestResult {
  voice?: string
  proofPoints: { label: string; detail: string }[]
  messages: SanityMessage[]
  docsRead: number
}

export interface SanityInput {
  projectId: string
  dataset: string
  token?: string
}

export async function ingestSanityStream(
  input: SanityInput,
  onProgress: (e: IngestProgress) => void,
): Promise<SanityIngestResult> {
  const res = await fetch('/api/ingest-sanity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok || !res.body) throw new IngestError(`ingest-sanity ${res.status}`, null)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result: SanityIngestResult | null = null
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
      if (ev === 'progress') onProgress(data as IngestProgress)
      else if (ev === 'result') result = data as SanityIngestResult
      else if (ev === 'error') error = data as { code: string | null; message: string }
    }
  }

  if (error) throw new IngestError(error.message, error.code)
  if (!result) throw new IngestError('empty Sanity ingest', null)
  return result
}
