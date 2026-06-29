import Anthropic from '@anthropic-ai/sdk'
import { readLiveAds } from './adScraper'
import { crawlSite } from './siteCrawler'
import { GTM_STRATEGIES, inferStrategy } from '../src/domain/strategies'

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
const STRATEGY_KEYS = ['demand-gen', 'plg', 'sales-led', 'lifecycle', 'aarrr', 'bowtie', 'abm', 'content-seo', 'outbound', 'community', 'local-takeover']

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
    secondaryStrategy: { type: 'string' },
    strategyRationale: { type: 'string' },
    strategyConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    signalsUsed: { type: 'array', items: { type: 'string' } },
    businessModel: { type: 'string' },
    campaign: {
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' }, durationWeeks: { type: 'number' }, monthlyVolume: { type: 'number' }, overallBudget: { type: 'number' } },
      required: ['name', 'durationWeeks', 'monthlyVolume', 'overallBudget'],
    },
  },
  required: ['brand', 'icp', 'rtbs', 'channelMix', 'strategy', 'strategyRationale', 'strategyConfidence', 'signalsUsed', 'campaign'],
} as const

const SYSTEM = `You are a senior GTM strategist standing up a new marketing workspace for a team.
From the company's website copy, their current live ads (when available), and any notes, propose a complete, ready-to-edit setup. Infer everything from THIS company's actual signals, not a template. Two different companies must not get the same answer.
- brand: company name, website domain, industry, and a one-to-two sentence brand voice (how their copy should sound).
- icp: the ideal customer profile — buyer/segment name, a "segment" fit tag, a 2-3 sentence summary, 4-6 firmographic fields (label + value), and 3-5 short pain phrases. Match the ACTUAL audience (a consumer app's buyer is the end user, not a "Head of Ops").

STRATEGY INFERENCE (the important part). First read the business model from the site, then pick the motion that fits it. Weigh these signals:
- Audience: B2C / consumer vs B2B. (A free app "for anglers" is B2C, not B2B SaaS.)
- Monetization: free / freemium / subscription / ad-supported / one-time. Is there a free tier? What is the price point?
- Self-serve vs sales-assisted: is the primary path "sign up / download / start free", or "contact sales / request a demo / get a quote"?
- Virality / network effects: does the product spread through use, or not?
- Deal size / ACV: low-ticket self-serve vs high-ACV enterprise.
Map signals to a motion:
- product-led growth (plg): free/freemium, self-serve, the product is the funnel, in-app upgrade. Signals: free tier + low-friction signup + standalone value.
- demand-gen: paid/search/content demand capture. Signals: high-intent search category, low virality, B2C or SMB with a considered purchase.
- sales-led / abm: high ACV, "contact sales", long cycle, enterprise ICP, no self-serve pricing. (Use abm when it is a small set of named enterprise accounts.)
- community / content-seo: audience-first, organic, creator/community brand with a content engine.
Motions can combine: set a primary "strategy" and, when a clear feeder exists, a "secondaryStrategy" (e.g. plg core + demand-gen capture).
Output for strategy:
- strategy: ONE key from: ${STRATEGY_KEYS.join(', ')}.
- secondaryStrategy: optional, another key from the same list, or omit.
- strategyRationale: one or two sentences a CMO would accept, citing the specific signals you saw.
- strategyConfidence: low | medium | high.
- signalsUsed: the concrete signals you grounded the choice in (e.g. "free app on the App Store", "no contact-sales path", "AdSense / ad-supported", "audience: anglers").
- businessModel: a short tag, e.g. "B2C freemium app", "B2B enterprise SaaS".

- rtbs: 3-4 reasons to believe (proof points) — short label + one-line detail. Use placeholder detail if the site gives no hard proof.
- channelMix: the channels this team realistically uses, consistent with the motion. Pick ONLY from these ids: ${CHANNEL_IDS.join(', ')}.
- campaign: a sensible first campaign — name, durationWeeks (e.g. 8), monthlyVolume (one of 15, 30, 45), overallBudget in USD.
Be concrete and specific to this company, not generic. Do not use em dashes. Return ONLY the structured object.`

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

/** A title-case brand name from the URL host. */
function brandNameFromUrl(url: string): string {
  const t = brandFromUrl(url)
  return t ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Your Company'
}

/** Fetch the raw HTML (no headless browser) and pull the meta that survives
 *  client-side rendering: title, description, OG, keywords. For JS-heavy apps the
 *  body is thin but these tags carry the real positioning + audience signals. */
async function fetchMeta(url: string): Promise<{ title: string; description: string; siteName: string; text: string }> {
  try {
    const u = /^https?:\/\//.test(url) ? url : `https://${url}`
    const res = await fetch(u, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    const attr = (re: RegExp) => (html.match(re)?.[1] ?? '').replace(/&amp;/g, '&').trim()
    const metaContent = (key: string) =>
      attr(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i')) ||
      attr(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${key}["']`, 'i'))
    const title = attr(/<title[^>]*>([^<]*)<\/title>/i)
    const description = [metaContent('description'), metaContent('og:description'), metaContent('twitter:description')]
      .filter(Boolean)
      .join(' ')
    const keywords = metaContent('keywords')
    const siteName = metaContent('og:site_name')
    return { title, description, siteName, text: [title, description, keywords].filter(Boolean).join('. ') }
  } catch {
    return { title: '', description: '', siteName: '', text: '' }
  }
}

/** Motion-aligned starting profiles, so a fallback setup is internally consistent
 *  (a consumer/PLG product is not described as a mid-market B2B SaaS). */
interface MotionProfile {
  industry: string
  voice: string
  businessModel: string
  icpName: string
  segment: string
  summary: string
  firmographics: { label: string; value: string }[]
  pains: string[]
  channelMix: string[]
}
const SERVER_MOTION: Record<string, MotionProfile> = {
  plg: {
    industry: 'Consumer software / app',
    voice: 'Plain, helpful, fast. Lead with the value the user gets in the first screen.',
    businessModel: 'B2C / self-serve (product-led)',
    icpName: 'Self-serve users',
    segment: 'Activated users with upgrade intent',
    summary: 'people who find it themselves, get value fast, and upgrade in-app when they want more.',
    firmographics: [
      { label: 'Audience', value: 'Individual consumers / enthusiasts' },
      { label: 'Adoption', value: 'Self-serve, bottoms-up' },
      { label: 'Buyer', value: 'The end user' },
      { label: 'Pricing', value: 'Free tier + paid upgrade' },
    ],
    pains: ['time to value', 'tool friction', 'doing it manually', 'cost of the next tier'],
    channelMix: ['meta-ads', 'youtube', 'blog', 'email', 'landing-page', 'instagram'],
  },
  'sales-led': {
    industry: 'B2B SaaS',
    voice: 'Clear, direct, credible. Lead with proof, skip the hype.',
    businessModel: 'B2B (sales-assisted)',
    icpName: 'Mid-market operators',
    segment: 'Tier 1, best-fit accounts',
    summary: 'teams with a budget and a considered buying process who need proof and a guided path.',
    firmographics: [
      { label: 'Industry', value: 'B2B SaaS' },
      { label: 'Company size', value: '200-2,000 employees' },
      { label: 'Buyer', value: 'VP / Director with a committee' },
      { label: 'Motion', value: 'Sales-assisted, demo-led' },
    ],
    pains: ['fragmented stack', 'slow cycles', 'proof before purchase', 'change management'],
    channelMix: ['linkedin-ads', 'linkedin', 'google-search', 'email', 'blog', 'landing-page'],
  },
  abm: {
    industry: 'Enterprise B2B',
    voice: 'Authoritative and specific. Speak to the named account, not the market.',
    businessModel: 'B2B (enterprise / named accounts)',
    icpName: 'Enterprise buying committees',
    segment: 'Named target accounts',
    summary: 'a small set of high-value enterprise accounts with long cycles and many stakeholders.',
    firmographics: [
      { label: 'Industry', value: 'Enterprise' },
      { label: 'Company size', value: '2,000+ employees' },
      { label: 'Buyer', value: 'Multi-stakeholder committee' },
      { label: 'Deal size', value: 'High ACV' },
    ],
    pains: ['stakeholder alignment', 'risk / compliance', 'long procurement', 'integration scope'],
    channelMix: ['linkedin-ads', 'linkedin', 'email', 'landing-page', 'blog'],
  },
  community: {
    industry: 'Media / community',
    voice: 'Warm, in-the-know, a little playful. Talk like a member, not a brand.',
    businessModel: 'B2C / audience-first',
    icpName: 'Engaged community members',
    segment: 'Active audience and contributors',
    summary: 'an audience that shows up for the content and the people, and spreads it by word of mouth.',
    firmographics: [
      { label: 'Audience', value: 'Enthusiasts / creators' },
      { label: 'Channel', value: 'Organic + community' },
      { label: 'Buyer', value: 'The community member' },
      { label: 'Spread', value: 'Word of mouth' },
    ],
    pains: ['finding their people', 'signal vs noise', 'staying in the loop', 'getting recognized'],
    channelMix: ['instagram', 'youtube', 'tiktok', 'email', 'blog', 'x'],
  },
  'demand-gen': {
    industry: 'B2B SaaS',
    voice: 'Clear, direct, credible. Lead with proof, skip the hype.',
    businessModel: 'B2B / SMB (demand capture)',
    icpName: 'Mid-market operators',
    segment: 'Tier 1, best-fit accounts',
    summary: 'teams drowning in manual, fragmented work who want fast time-to-value and proof over promises.',
    firmographics: [
      { label: 'Industry', value: 'B2B SaaS' },
      { label: 'Company size', value: '50-1,000 employees' },
      { label: 'Buyer', value: 'Head of Ops / Growth' },
      { label: 'Region', value: 'North America' },
    ],
    pains: ['manual workflows', 'slow tools', 'fragmented stack', 'time to value'],
    channelMix: ['google-search', 'meta-ads', 'linkedin', 'email', 'blog', 'landing-page'],
  },
}

/** Infer a full workspace setup from the site signals WITHOUT Claude — used when
 *  there's no key or the API call fails (e.g. no credit balance). Grounds the GTM
 *  motion in the meta + crawl + ads, so setup is signal-driven, not hardcoded. */
function heuristicSetupFromCrawl(opts: {
  url?: string
  notes?: string
  meta: { title: string; description: string; siteName: string; text: string }
  crawl: { text: string }
  live: { text: string }
}): unknown {
  const { url, notes, meta, crawl, live } = opts
  const name = (meta.siteName || meta.title.split(/[|\-–—:]/)[0] || brandNameFromUrl(url ?? '')).trim() || brandNameFromUrl(url ?? '')
  const host = brandFromUrl(url ?? '').replace(/\s+/g, '') ? (url ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : 'yourcompany.com'
  const signalText = [meta.text, crawl.text, live.text, notes].filter(Boolean).join('\n')
  const inf = inferStrategy(signalText)
  const p = SERVER_MOTION[inf.strategy] ?? SERVER_MOTION['demand-gen']
  const motionName = GTM_STRATEGIES.find((s) => s.key === inf.strategy)?.name ?? 'Demand Gen'
  return {
    brand: { name, website: host, industry: p.industry, voice: p.voice },
    icp: {
      name: p.icpName,
      segment: p.segment,
      summary: `Likely buyers for ${name}: ${p.summary}`,
      firmographics: p.firmographics,
      pains: p.pains,
    },
    rtbs: [
      { id: 'proof-1', label: 'Built for the job', detail: meta.description ? meta.description.slice(0, 120) : 'Add a real customer outcome here.' },
      { id: 'proof-2', label: 'Fast time to value', detail: 'Useful from the first session.' },
      { id: 'proof-3', label: 'Proven results', detail: 'Add a real customer outcome here.' },
    ],
    channelMix: p.channelMix,
    strategy: inf.strategy,
    secondaryStrategy: inf.secondaryStrategy,
    strategyRationale: inf.rationale,
    strategyConfidence: inf.confidence,
    signalsUsed: inf.signalsUsed,
    businessModel: p.businessModel,
    campaign: { name: `${name} — ${motionName}`, durationWeeks: 8, monthlyVolume: 30, overallBudget: 20000 },
  }
}

export async function runSetup(body: unknown): Promise<unknown> {
  const { url, notes } = (body ?? {}) as { url?: string; notes?: string }
  // Always read the site first (so inference is signal-driven even without Claude):
  // a fetch-based meta read (survives client-side rendering), the headless crawl,
  // and live ads, in parallel.
  const [crawl, live, meta] = await Promise.all([
    url ? crawlSite(url) : Promise.resolve({ text: '', pages: [] as string[] }),
    url ? readLiveAds(brandFromUrl(url)) : Promise.resolve({ text: '', sources: [] as string[] }),
    url ? fetchMeta(url) : Promise.resolve({ title: '', description: '', siteName: '', text: '' }),
  ])

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey })
      const content =
        `Company URL: ${String(url ?? '')}\n` +
        (notes ? `Notes from the team: ${notes}\n` : '') +
        `\nPage meta (title, description, OG, keywords — survives client-side rendering, carries positioning + audience):\n${meta.text || '(none)'}\n` +
        `\nWebsite copy (crawled ${crawl.pages.length} page(s): ${crawl.pages.join(', ') || 'none'}):\n` +
        `${crawl.text || '(could not render, infer from the meta + URL)'}\n` +
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
      const parsed = JSON.parse(text) as { brand?: { name?: string } }
      if (parsed?.brand?.name) return parsed
    } catch {
      // Claude unavailable (no key / billing / error): fall through to the
      // signal-driven heuristic below instead of failing the setup.
    }
  }
  return heuristicSetupFromCrawl({ url, notes, meta, crawl, live })
}
