import Anthropic from '@anthropic-ai/sdk'
import { NoKeyError } from './siteMapHandler'

/**
 * Read the copy baked INTO a single creative on demand. Given an image URL, fetch
 * the bytes and have Claude vision transcribe every word in the art verbatim —
 * overlay headlines, on-image claims, text on the graphic — so a reviewer can
 * read what the post actually shows, not just its caption. This is the row-level
 * twin of the per-channel ingest's vision pass; it backs the `extractCopy` action
 * (ExtractTransport). Dev/server only; NO_KEY (501) when the key is unset.
 */

const VISION_MEDIA: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
}

const SYSTEM = `You transcribe the text inside a marketing creative. Return ONLY the words that appear IN the image — overlay headlines, on-image claims, text on the graphic, burned-in captions — verbatim and in reading order. Do not describe the image, do not add commentary, do not invent text. If there is no readable text in the image, return exactly: (no copy in the creative)`

export interface ExtractCopyResult {
  text: string
  via: 'vision' | 'stub'
}

export async function runExtractCopy(body: unknown): Promise<ExtractCopyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const { mediaRef, mediaType } = (body ?? {}) as { mediaRef?: string; mediaType?: string }

  // Video and blob:/object URLs can't be transcribed server-side here; be honest.
  if (mediaType === 'video') {
    return { text: '(Video transcription not wired — vision reads still images.)', via: 'stub' }
  }
  if (!mediaRef || !/^https?:\/\//i.test(mediaRef)) {
    return { text: '(No fetchable image URL — this creative is local-only.)', via: 'stub' }
  }

  const resp = await fetch(mediaRef, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!resp.ok) return { text: '(Could not fetch the creative to read it.)', via: 'stub' }
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const media = VISION_MEDIA[ct]
  if (!media) return { text: '(Unsupported image format for transcription.)', via: 'stub' }
  const data = Buffer.from(await resp.arrayBuffer()).toString('base64')

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data } },
          { type: 'text', text: 'Transcribe the copy in this creative.' },
        ],
      },
    ],
  })
  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text.trim() : ''
  return { text: text || '(no copy in the creative)', via: 'vision' }
}
