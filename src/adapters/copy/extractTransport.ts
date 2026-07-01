import type { ExtractResult, ExtractTransport } from './extract'

/**
 * The real ExtractTransport: reads the copy inside a creative via Claude vision
 * (server-side, /api/extract-copy). Wired into the store's extractCopy action so
 * any image row can transcribe its in-art text on demand. Falls back to an honest
 * note when the endpoint is unavailable (no key, no fetchable URL).
 */
export const realExtractTransport: ExtractTransport = async (row): Promise<ExtractResult> => {
  try {
    const res = await fetch('/api/extract-copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mediaRef: row.mediaRef,
        mediaType: row.mediaType,
        assetName: row.assetName,
      }),
    })
    if (!res.ok) {
      const reason = res.status === 501 ? 'Connect Claude (set ANTHROPIC_API_KEY) to read the art.' : `error ${res.status}`
      return { text: `(Vision OCR unavailable: ${reason})`, via: 'stub' }
    }
    return (await res.json()) as ExtractResult
  } catch {
    return { text: '(Vision OCR unavailable — could not reach the extractor.)', via: 'stub' }
  }
}
