/**
 * Client for the per-channel ingest: link one channel and pull all of its copy,
 * including the copy baked into the art. Streams stage progress (reading →
 * pulling images → reading the copy in the art → mapped) over SSE so the drawer
 * can show the work, then returns the channel's mapped messaging. Mirrors
 * mapSiteStream; the real extraction runs server-side (/api/ingest-channel).
 */

export interface IngestedMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  /** Verbatim copy lifted out of the creative; empty when caption-only. */
  extractedCopy?: string
  source?: string
}

export interface ChannelIngestResult {
  channel: string
  voice?: string
  proofPoints: { label: string; detail: string }[]
  messages: IngestedMessage[]
  imagesSeen: number
  imagesTranscribed: number
}

export interface IngestProgress {
  stage: string
  detail: string
}

export interface IngestInput {
  channel: string
  /** Social profile URL to read (required for social channels). */
  profileUrl?: string
  /** Brand website (used for owned surfaces: website/blog/landing-page). */
  website?: string
  /** The brand's existing audience names. Messages are mapped to the closest of
   *  these instead of inventing a new audience per post. */
  audiences?: string[]
}

/** Error carrying the server's code (e.g. LOGIN_REQUIRED, NO_KEY) for the UI. */
export class IngestError extends Error {
  code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

export async function ingestChannelStream(
  input: IngestInput,
  onProgress: (e: IngestProgress) => void,
): Promise<ChannelIngestResult> {
  const res = await fetch('/api/ingest-channel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok || !res.body) throw new IngestError(`ingest-channel ${res.status}`, null)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result: ChannelIngestResult | null = null
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
      else if (ev === 'result') result = data as ChannelIngestResult
      else if (ev === 'error') error = data as { code: string | null; message: string }
    }
  }

  if (error) throw new IngestError(error.message, error.code)
  if (!result) throw new IngestError('empty ingest', null)
  return result
}
