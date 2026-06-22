import Anthropic from '@anthropic-ai/sdk'
import { readLiveAds } from './adScraper'
import { crawlSite } from './siteCrawler'

/**
 * Server-side workspace setup generation. Reads the team's site (best-effort)
 * and asks Claude to propose a complete, editable workspace config. Runs ONLY
 * on the dev server / a serverless function so the key stays private. Throws
 * NO_KEY when ANTHROPIC_API_KEY is unset → client falls back to the heuristic.
 */

const CHANNEL_IDS = [
  'meta-ads', 'tiktok-ads', 'linkedin-ads', 'x-ads', 'pinterest-ads', 'snapchat-ads', 'reddit-ads',
  'youtube-ads', 'google-search', 'google-demand', 'pmax', 'instagram', 'facebook', 'linkedin', 'x',
  'tiktok', 'youtube', 'pinterest', 'email', 'sms', 'push', 'website', 'blog', 'landing-page', 'lead-magnet',
]
const STRATEGY_KEYS = ['demand-gen', 'plg', 'sales-led', 'lifecycle', 'aarrr', 'bowtie', 'abm', 'content-seo', 'outbound', 'community']

const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    brand: {
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' }, website: { type: 'string' }, industry: { type: 'string' }, voice: { type: 'string' } },
      required: ['name', 'website', 'industry', 'voice'],
    },
    icp: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        segment: { type: 'string' },
        summary: { type: 'string' },
        firmographics: {
          type: 'array',
          items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] },
        },
        pains: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'segment', 'summary', 'firmographics', 'pains'],
    },
    rtbs: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' } }, required: ['id', 'label', 'detail'] },
    },
    channelMix: { type: 'array', items: { type: 'string' } },
    strategy: { type: 'string' },
    campaign: {
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' }, durationWeeks: { type: 'number' }, monthlyVolume: { type: 'number' }, overallBudget: { type: 'number' } },
      required: ['name', 'durationWeeks', 'monthlyVolume', 'overallBudget'],
    },
  },
  required: ['brand', 'icp', 'rtbs', 'channelMix', 'strategy', 'campaign'],
} as const

const SYSTEM = `You are a senior GTM strategist standing up a new marketing workspace for a team.
From the company's website copy, their current live ads (when available), and any notes, propose a complete, ready-to-edit setup. Infer brand voice from how their existing copy actually reads, and infer channelMix from where they actually run ads and publish:
- brand: company name, website domain, industry, and a one-to-two sentence brand voice (how their copy should sound).
- icp: the ideal customer profile — buyer/segment name, a "segment" fit tag, a 2-3 sentence summary, 4-6 firmographic fields (label + value), and 3-5 short pain phrases.
- rtbs: 3-4 reasons to believe (proof points) — short label + one-line detail. Use placeholder detail if the site gives no hard proof.
- channelMix: the channels this team realistically uses. Pick ONLY from these ids: ${CHANNEL_IDS.join(', ')}.
- strategy: the best-fit GTM motion. Pick ONE key from: ${STRATEGY_KEYS.join(', ')}.
- campaign: a sensible first campaign — name, durationWeeks (e.g. 8), monthlyVolume (one of 15, 30, 45), overallBudget in USD.
Infer as much as possible from the site; be concrete and specific to this company, not generic. Do not use em dashes. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

/** A best-effort brand search term from the URL (host minus www + TLD), used for
 *  the ad-library lookup. e.g. "deep-dive.studio" -> "deep dive". */
function brandFromUrl(url: string): string {
  try {
    const host = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
    return (host.split('.')[0] ?? '').replace(/[-_]+/g, ' ').trim()
  } catch {
    return ''
  }
}

export async function runSetup(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { url, notes } = (body ?? {}) as { url?: string; notes?: string }
  // Crawl the site and scrape live ads in parallel (the ad scrape spins up a
  // headless browser, so overlap it with the fetch-based crawl).
  const [crawl, live] = await Promise.all([
    url ? crawlSite(url) : Promise.resolve({ text: '', pages: [] as string[] }),
    url ? readLiveAds(brandFromUrl(url)) : Promise.resolve({ text: '', sources: [] as string[] }),
  ])

  const content =
    `Company URL: ${String(url ?? '')}\n` +
    (notes ? `Notes from the team: ${notes}\n` : '') +
    `\nWebsite copy (crawled ${crawl.pages.length} page(s): ${crawl.pages.join(', ') || 'none'}):\n` +
    `${crawl.text || '(could not fetch, infer from the URL)'}\n` +
    (live.text
      ? `\nCurrent live ads, rendered from the public ad libraries (${live.sources.join(', ')}). Extract the ad copy and use it to infer messaging, offers, and channel mix:\n${live.text}\n`
      : '') +
    `\nReturn the proposed workspace setup.`

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SETUP_SCHEMA } },
    messages: [{ role: 'user', content }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
