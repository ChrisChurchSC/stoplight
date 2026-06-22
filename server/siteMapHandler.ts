import Anthropic from '@anthropic-ai/sdk'
import { readLiveAds } from './adScraper'
import { crawlSite } from './siteCrawler'

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

export async function runSiteMap(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { url, notes } = (body ?? {}) as { url?: string; notes?: string }
  const [crawl, live] = await Promise.all([
    url ? crawlSite(url) : Promise.resolve({ text: '', pages: [] as string[] }),
    url ? readLiveAds(brandFromUrl(url)) : Promise.resolve({ text: '', sources: [] as string[] }),
  ])

  const content =
    `Company URL: ${String(url ?? '')}\n` +
    (notes ? `Notes from the team: ${notes}\n` : '') +
    `\nWebsite copy (rendered, crawled ${crawl.pages.length} page(s): ${crawl.pages.join(', ') || 'none'}):\n` +
    `${crawl.text || '(could not fetch, infer from the URL)'}\n` +
    (live.text ? `\nCurrent live ads (${live.sources.join(', ')}):\n${live.text}\n` : '') +
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
  return JSON.parse(text)
}
