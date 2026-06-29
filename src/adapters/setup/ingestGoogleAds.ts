import { IngestError, type IngestProgress } from './ingestChannel'

/**
 * Client for the Google Ads ingest: pull a brand's live ad copy via the Google
 * Ads API into the paid Google channels. Streams stage progress over SSE, then
 * returns the mapped messaging. Mirrors ingestSanityStream; OAuth + GAQL run
 * server-side (/api/ingest-google-ads).
 */

export interface GoogleAdsCreds {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  customerId: string
  loginCustomerId?: string
}

export interface GoogleAdsMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  /** Paid Google surface (google-search/google-demand/pmax). */
  channel?: string
  source?: string
}

export interface GoogleAdsIngestResult {
  voice?: string
  proofPoints: { label: string; detail: string }[]
  messages: GoogleAdsMessage[]
  adsRead: number
}

export async function ingestGoogleAdsStream(
  input: GoogleAdsCreds,
  onProgress: (e: IngestProgress) => void,
): Promise<GoogleAdsIngestResult> {
  const res = await fetch('/api/ingest-google-ads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok || !res.body) throw new IngestError(`ingest-google-ads ${res.status}`, null)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result: GoogleAdsIngestResult | null = null
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
      else if (ev === 'result') result = data as GoogleAdsIngestResult
      else if (ev === 'error') error = data as { code: string | null; message: string }
    }
  }

  if (error) throw new IngestError(error.message, error.code)
  if (!result) throw new IngestError('empty Google Ads ingest', null)
  return result
}
