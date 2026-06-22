import Anthropic from '@anthropic-ai/sdk'
import { readLiveAds } from './adScraper'
import { crawlSite } from './siteCrawler'
import { readYouTube } from './youtube'
import { readInstagram } from './instagram'
import { readLinkedIn } from './linkedin'
import { gatherWithSession } from './connectChannel'
import { hasSession } from './sessionStore'

/**
 * Current-state messaging map. Given a brand's public site (rendered) + their
 * live ads, Claude extracts the messaging they ALREADY have live, their real
 * headlines, value props, claims, CTAs, audiences, and proof, as structured
 * objects. Hyperfocus then stores this as the connected map you can see. This is
 * the front door to onboarding-as-diagnosis: map what they have, then show where
 * it does not connect. Dev/server only; NO_KEY (501) when the key is unset.
 */

const CHANNEL_IDS = [
  'meta-ads', 'tiktok-ads', 'linkedin-ads', 'x-ads', 'pinterest-ads', 'snapchat-ads', 'reddit-ads',
  'youtube-ads', 'google-search', 'google-demand', 'pmax', 'instagram', 'facebook', 'linkedin', 'x',
  'tiktok', 'youtube', 'pinterest', 'email', 'sms', 'push', 'website', 'blog', 'landing-page', 'lead-magnet',
]

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    brand: {
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' }, website: { type: 'string' }, industry: { type: 'string' }, voice: { type: 'string' } },
      required: ['name', 'website', 'industry', 'voice'],
    },
    audiences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, description: { type: 'string' } },
        required: ['name', 'description'],
      },
    },
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
          type: { type: 'string', enum: ['headline', 'value-prop', 'claim', 'cta', 'offer', 'proof'] },
          audience: { type: 'string' },
          channel: { type: 'string', enum: CHANNEL_IDS },
          source: { type: 'string' },
        },
        required: ['label', 'headline', 'type', 'audience', 'channel'],
      },
    },
  },
  required: ['brand', 'audiences', 'proofPoints', 'messages'],
} as const

const SYSTEM = `You are mapping a brand's CURRENT live messaging for an agency onboarding them. You are given their rendered website copy and (when available) their currently-running ads. Capture what is LIVE NOW, do not invent a future campaign.

Extract:
- brand: name, website domain, industry, and a one-to-two sentence read on their actual brand voice (how their copy reads).
- audiences: the distinct audiences their live messaging speaks to (name + one-line description). Infer from how the copy segments.
- proofPoints: their real proof / reasons-to-believe (label + one-line detail), quoted or closely paraphrased from the copy (e.g. "Millions sold", "Lifetime guarantee", "37 case studies").
- messages: every distinct live message, value prop, claim, offer, or CTA worth mapping. For each: a short label, the headline (the actual line, verbatim or lightly tightened), optional body and cta, its type, the audience it speaks to (use one of the audience names above), the channel it lives on (pick from the allowed channel ids: a homepage hero is "website", a campaign page is "landing-page", a Meta ad is "meta-ads", etc.), and the source (page URL or "Meta ad").

Ground everything in the provided copy. Quote their real words. Do not pad with generic marketing. Do not use em dashes. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

function brandFromUrl(url: string): string {
  try {
    const host = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
    return (host.split('.')[0] ?? '').replace(/[-_]+/g, ' ').trim()
  } catch {
    return ''
  }
}

export type ProgressFn = (e: { stage: string; detail: string }) => void

export async function runSiteMap(body: unknown, onProgress?: ProgressFn): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { url, notes } = (body ?? {}) as { url?: string; notes?: string }

  // Show the work: emit a stage as the crawl and the ad scrape each resolve.
  onProgress?.({ stage: 'reading', detail: `Reading ${url || 'the site'}` })
  const crawlP = (url ? crawlSite(url) : Promise.resolve({ text: '', pages: [] as string[], socials: {} as Record<string, string> })).then((c) => {
    onProgress?.({ stage: 'pages', detail: c.pages.length ? `Read ${c.pages.length} page${c.pages.length === 1 ? '' : 's'}` : 'Site could not be read' })
    return c
  })
  const adsP = (url ? readLiveAds(brandFromUrl(url)) : Promise.resolve({ text: '', sources: [] as string[] })).then((a) => {
    onProgress?.({ stage: 'ads', detail: a.sources.length ? `Found live ads on ${a.sources.join(', ')}` : 'No live ads found' })
    return a
  })
  const [crawl, live] = await Promise.all([crawlP, adsP])

  // Discovered social profiles.
  const socials = crawl.socials
  if (Object.keys(socials).length) {
    onProgress?.({ stage: 'socials', detail: `Found their ${Object.keys(socials).filter((p) => p !== 'facebook').join(', ')}` })
  }

  const socialText: string[] = []
  // 1) Connected channels: read each logged-in session profile (the primary path
  //    for login-walled channels — this is "Claude reads it the way you would").
  for (const [platform, profileUrl] of Object.entries(socials)) {
    if (platform === 'facebook' || !hasSession(profileUrl)) continue
    const g = await gatherWithSession(profileUrl)
    if (g?.text) {
      socialText.push(`Recent ${platform} content (connected account):\n${g.text}`)
      onProgress?.({ stage: platform, detail: `Read connected ${platform}` })
    }
  }
  // 2) Fallbacks for channels NOT connected: YouTube Data API, IG/LinkedIn env tokens.
  if (socials.youtube && !hasSession(socials.youtube)) {
    const yt = await readYouTube(socials.youtube)
    if (yt?.count) {
      socialText.push(`Recent YouTube videos (${yt.title}):\n${yt.text}`)
      onProgress?.({ stage: 'youtube', detail: `Read ${yt.count} YouTube videos` })
    }
  }
  if (!socials.instagram || !hasSession(socials.instagram)) {
    const ig = await readInstagram()
    if (ig?.count) {
      socialText.push(`Recent Instagram posts:\n${ig.text}`)
      onProgress?.({ stage: 'instagram', detail: `Read ${ig.count} Instagram posts` })
    }
  }
  if (!socials.linkedin || !hasSession(socials.linkedin)) {
    const li = await readLinkedIn()
    if (li?.count) {
      socialText.push(`Recent LinkedIn posts:\n${li.text}`)
      onProgress?.({ stage: 'linkedin', detail: `Read ${li.count} LinkedIn posts` })
    }
  }
  onProgress?.({ stage: 'extracting', detail: 'Extracting the messaging' })

  const content =
    `Company URL: ${String(url ?? '')}\n` +
    (notes ? `Notes from the team: ${notes}\n` : '') +
    `\nWebsite copy (rendered, crawled ${crawl.pages.length} page(s): ${crawl.pages.join(', ') || 'none'}):\n` +
    `${crawl.text || '(could not fetch, infer from the URL)'}\n` +
    (live.text ? `\nCurrent live ads (${live.sources.join(', ')}):\n${live.text}\n` : '') +
    (socialText.length ? `\n${socialText.join('\n\n')}\n` : '') +
    `\nMap their current live messaging.`

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { audiences?: unknown[]; messages?: unknown[] }
  onProgress?.({
    stage: 'mapped',
    detail: `Mapped ${parsed.audiences?.length ?? 0} audiences, ${parsed.messages?.length ?? 0} messages`,
  })
  // Attach discovered socials (for the review UI + the later connect step).
  return { ...parsed, socials }
}
