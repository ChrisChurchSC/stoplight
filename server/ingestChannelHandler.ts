import Anthropic from '@anthropic-ai/sdk'
import { NoKeyError } from './siteMapHandler'
import { gatherChannelMedia, type GatheredImage } from './channelGather'
import { crawlSite } from './siteCrawler'
import { readYouTube } from './youtube'
import { readInstagram } from './instagram'
import { readLinkedIn } from './linkedin'
import { platformOf } from './connectChannel'

/**
 * Per-channel ingest. Given ONE channel (a social profile or an owned web
 * surface), gather its live content and have Claude map the messaging it carries.
 * The differentiator vs the whole-site map: a VISION pass reads the copy baked
 * INTO the creative — overlay headlines, on-image claims, the words inside the art
 * — and returns them verbatim as `extractedCopy`, so reviewers see every word a
 * post actually puts in front of someone, not just the caption. Dev/server only;
 * NO_KEY (501) when ANTHROPIC_API_KEY is unset.
 */

export interface IngestedMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  /** Verbatim copy lifted out of the creative (image/video). Empty when caption-only. */
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

// Images per structured vision call. Keeps each request's token load sane while
// still transcribing everything the gather pulled (chunks are merged).
const CHUNK = 8

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    voice: { type: 'string' },
    proofPoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: { type: 'string' }, detail: { type: 'string' } },
        required: ['label', 'detail'],
      },
    },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          headline: { type: 'string' },
          body: { type: 'string' },
          cta: { type: 'string' },
          type: { type: 'string', enum: ['headline', 'value-prop', 'claim', 'cta', 'offer', 'proof', 'post'] },
          audience: { type: 'string' },
          extractedCopy: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['label', 'headline', 'type', 'audience'],
      },
    },
  },
  required: ['messages'],
} as const

const SYSTEM = `You are mapping the CURRENT live messaging on ONE marketing channel for an agency onboarding a client. You are given the channel's recent feed text (captions, titles, descriptions) and, when available, the post images themselves.

Two jobs:
1. READ THE COPY IN THE ART. For every image, transcribe the words baked into the creative verbatim — overlay headlines, on-image claims, quote cards, text on graphics, captions burned into the design. Put that exact text in the message's extractedCopy. Do not paraphrase it; quote it.
2. MAP THE MESSAGING. Produce one message per distinct piece of live messaging across the captions and the in-image copy. For each: a short label, the headline (the actual line), optional body and cta, its type, the audience it speaks to, and a source note (e.g. "Instagram post", "YouTube thumbnail").

Also surface the channel's real proof points (reasons to believe, quoted from the copy) and a one-line read on the brand voice as it shows up here.

Capture what is LIVE NOW. Quote their real words. Do not invent a future campaign and do not pad with generic marketing. Do not use em dashes. Return ONLY the structured object.`

function imageBlocks(images: GatheredImage[]): Anthropic.ImageBlockParam[] {
  return images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }))
}

type Progress = (e: { stage: string; detail: string }) => void

/** One structured (vision) call over a chunk of images + the gathered text. */
async function mapChunk(
  client: Anthropic,
  channel: string,
  text: string,
  images: GatheredImage[],
  audiences: string[],
): Promise<ChannelIngestResult> {
  const content: Anthropic.ContentBlockParam[] = [
    ...imageBlocks(images),
    {
      type: 'text',
      text:
        `Channel: ${channel}\n` +
        (images.length ? `Post images are attached above (${images.length}). Read the copy inside each.\n` : '') +
        (text ? `\nRecent feed text from this channel:\n${text}\n` : '') +
        (audiences.length
          ? `\nThis brand's audiences are: ${audiences.join('; ')}. Set each message's audience to the EXACT name of the closest one — do not invent new audiences.\n`
          : '') +
        `\nMap this channel's current live messaging. Transcribe any copy inside the images into extractedCopy.`,
    },
  ]

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  })
  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const raw = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(raw) as Partial<ChannelIngestResult>
  return {
    channel,
    voice: parsed.voice,
    proofPoints: parsed.proofPoints ?? [],
    messages: parsed.messages ?? [],
    imagesSeen: 0,
    imagesTranscribed: images.length,
  }
}

export async function runIngestChannel(body: unknown, onProgress?: Progress): Promise<ChannelIngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey })

  const { channel, profileUrl, website, audiences } = (body ?? {}) as {
    channel?: string
    profileUrl?: string
    website?: string
    audiences?: string[]
  }
  const ch = (channel ?? '').trim()
  if (!ch) throw new Error('channel required')
  const knownAudiences = (audiences ?? []).filter((a) => a?.trim())

  onProgress?.({ stage: 'reading', detail: `Reading ${ch}` })

  // Resolve the channel's content + images. Social profiles render through the
  // (authenticated) browser gather; owned web surfaces crawl the site.
  let text = ''
  let images: GatheredImage[] = []
  let seen = 0

  const OWNED = ['website', 'blog', 'landing-page', 'lead-magnet', 'email']
  if (profileUrl) {
    const platform = platformOf(profileUrl)
    const gathered = await gatherChannelMedia(profileUrl, (d) => onProgress?.({ stage: 'gather', detail: d }))
    if (!gathered) {
      // Hit a login wall and not connected — tell the caller to link it.
      const err = new Error('LOGIN_REQUIRED') as Error & { code?: string }
      err.code = 'LOGIN_REQUIRED'
      throw err
    }
    text = gathered.text
    images = gathered.images
    seen = gathered.seen

    // Enrich text with the platform's own API where we have one (public data).
    if (platform === 'youtube') {
      const yt = await readYouTube(profileUrl)
      if (yt?.text) text = `${yt.text}\n\n${text}`.slice(0, 8000)
    } else if (platform === 'instagram') {
      const ig = await readInstagram()
      if (ig?.text) text = `${ig.text}\n\n${text}`.slice(0, 8000)
    } else if (platform === 'linkedin') {
      const li = await readLinkedIn()
      if (li?.text) text = `${li.text}\n\n${text}`.slice(0, 8000)
    }
  } else if (OWNED.includes(ch) && website) {
    const crawl = await crawlSite(website)
    text = crawl.text
    onProgress?.({
      stage: 'pages',
      detail: crawl.pages.length ? `Read ${crawl.pages.length} of ${crawl.discovered} public pages` : 'Site read',
    })
  } else {
    throw new Error('Link this channel first (no profile to read).')
  }

  // Vision + structure, chunked so a big feed stays within one request's budget.
  const chunks: GatheredImage[][] = []
  for (let i = 0; i < images.length; i += CHUNK) chunks.push(images.slice(i, i + CHUNK))
  if (chunks.length === 0) chunks.push([]) // text-only channel (owned surface)

  const merged: ChannelIngestResult = {
    channel: ch,
    proofPoints: [],
    messages: [],
    imagesSeen: seen,
    imagesTranscribed: 0,
  }
  const seenProof = new Set<string>()
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({
      stage: 'transcribing',
      detail: chunks[i].length
        ? `Reading the copy in the art (${Math.min((i + 1) * CHUNK, images.length)}/${images.length})`
        : 'Extracting the messaging',
    })
    // Only the first chunk carries the full feed text, so captions aren't repeated.
    const res = await mapChunk(client, ch, i === 0 ? text : '', chunks[i], knownAudiences)
    if (!merged.voice && res.voice) merged.voice = res.voice
    merged.messages.push(...res.messages)
    for (const p of res.proofPoints) {
      const key = p.label.toLowerCase()
      if (!seenProof.has(key)) {
        seenProof.add(key)
        merged.proofPoints.push(p)
      }
    }
    merged.imagesTranscribed += res.imagesTranscribed
  }

  onProgress?.({
    stage: 'mapped',
    detail: `Mapped ${merged.messages.length} messages from ${ch}${
      merged.imagesTranscribed ? `, read ${merged.imagesTranscribed} images` : ''
    }`,
  })
  return merged
}
