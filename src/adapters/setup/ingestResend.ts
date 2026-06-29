import { IngestError, type IngestProgress } from './ingestChannel'

/**
 * Client for the Resend ingest: pull a brand's email copy from their broadcasts
 * into the Foundation's email channel. Streams stage progress over SSE, then
 * returns the mapped messaging. Mirrors ingestSanityStream; list + map run
 * server-side (/api/ingest-resend).
 */

export interface ResendMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  source?: string
}

export interface ResendIngestResult {
  voice?: string
  proofPoints: { label: string; detail: string }[]
  messages: ResendMessage[]
  broadcastsRead: number
}

export async function ingestResendStream(
  input: { apiKey: string },
  onProgress: (e: IngestProgress) => void,
): Promise<ResendIngestResult> {
  const res = await fetch('/api/ingest-resend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok || !res.body) throw new IngestError(`ingest-resend ${res.status}`, null)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result: ResendIngestResult | null = null
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
      else if (ev === 'result') result = data as ResendIngestResult
      else if (ev === 'error') error = data as { code: string | null; message: string }
    }
  }

  if (error) throw new IngestError(error.message, error.code)
  if (!result) throw new IngestError('empty Resend ingest', null)
  return result
}
