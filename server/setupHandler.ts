import Anthropic from '@anthropic-ai/sdk'

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
From the company's website copy, their current live posts (when provided), and any notes, propose a complete, ready-to-edit setup. Infer brand voice from how their existing copy actually reads, and infer channelMix from the channels they are actually posting on:
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

// Highest-signal pages to pull beyond the homepage, ranked.
const PRIORITY_PATHS = [
  'product', 'pricing', 'features', 'solutions', 'platform', 'use-case',
  'customers', 'about', 'how-it-works', 'services', 'case-stud', 'blog',
]

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPage(href: string): Promise<{ html: string; text: string } | null> {
  try {
    const res = await fetch(href, { signal: AbortSignal.timeout(8000), redirect: 'follow' })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return null
    const html = await res.text()
    return { html, text: stripHtml(html).slice(0, 4000) }
  } catch {
    return null
  }
}

function rankPath(url: string): number {
  const p = url.toLowerCase()
  let s = 0
  PRIORITY_PATHS.forEach((kw, i) => {
    if (p.includes(kw)) s += PRIORITY_PATHS.length - i
  })
  return s
}

function internalLinks(html: string, origin: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], origin)
      if (u.origin !== origin) continue
      const path = u.pathname.replace(/\/$/, '')
      if (!path) continue
      if (/\.(png|jpe?g|gif|svg|webp|avif|pdf|zip|css|js|ico|woff2?|mp4|mov)$/i.test(path)) continue
      found.add(u.origin + u.pathname)
    } catch {
      /* skip malformed href */
    }
  }
  return [...found].sort((a, b) => rankPath(b) - rankPath(a)).slice(0, 6)
}

/** Crawl the homepage plus the highest-signal internal pages and return the
 *  combined copy. Server-side fetch, so no CORS limits; best-effort per page. */
async function crawlSite(url: string): Promise<{ text: string; pages: string[] }> {
  const href = /^https?:\/\//.test(url) ? url : `https://${url}`
  let origin: string
  try {
    origin = new URL(href).origin
  } catch {
    return { text: '', pages: [] }
  }
  const home = await fetchPage(href)
  if (!home) return { text: '', pages: [] }
  const parts = [`# ${origin}\n${home.text}`]
  const pages = [origin]
  for (const link of internalLinks(home.html, origin)) {
    const page = await fetchPage(link)
    if (page?.text) {
      parts.push(`# ${link}\n${page.text}`)
      pages.push(link)
    }
  }
  return { text: parts.join('\n\n---\n\n').slice(0, 16000), pages }
}

interface BufferProfile {
  id?: string
  service?: string
  formatted_username?: string
}
interface BufferUpdate {
  text?: string
}

/** Best-effort read of the client's currently-published posts from connected
 *  accounts (Buffer). Gated on BUFFER_ACCESS_TOKEN: returns empty when unset, so
 *  setup runs website-only until the client's channels are connected. Supermetrics
 *  (metrics) and per-platform APIs plug in here the same way. */
async function readConnectedPosts(): Promise<{ text: string; channels: string[] }> {
  const token = process.env.BUFFER_ACCESS_TOKEN
  if (!token) return { text: '', channels: [] }
  const t = encodeURIComponent(token)
  try {
    const pres = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${t}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!pres.ok) return { text: '', channels: [] }
    const profiles = (await pres.json()) as BufferProfile[]
    const blocks: string[] = []
    const channels: string[] = []
    for (const p of (profiles ?? []).slice(0, 10)) {
      if (!p.id) continue
      const ures = await fetch(
        `https://api.bufferapp.com/1/profiles/${p.id}/updates/sent.json?access_token=${t}&count=10`,
        { signal: AbortSignal.timeout(8000) },
      )
      if (!ures.ok) continue
      const data = (await ures.json()) as { updates?: BufferUpdate[] }
      const posts = (data.updates ?? []).map((u) => u.text?.trim()).filter((x): x is string => !!x)
      if (posts.length) {
        const label = `${p.service ?? 'channel'}${p.formatted_username ? ` (${p.formatted_username})` : ''}`
        channels.push(label)
        blocks.push(`## ${label}\n${posts.slice(0, 10).map((x) => `- ${x}`).join('\n')}`)
      }
    }
    return { text: blocks.join('\n\n').slice(0, 8000), channels }
  } catch {
    return { text: '', channels: [] }
  }
}

export async function runSetup(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { url, notes } = (body ?? {}) as { url?: string; notes?: string }
  const crawl = url ? await crawlSite(url) : { text: '', pages: [] }
  const live = await readConnectedPosts()

  const content =
    `Company URL: ${String(url ?? '')}\n` +
    (notes ? `Notes from the team: ${notes}\n` : '') +
    `\nWebsite copy (crawled ${crawl.pages.length} page(s): ${crawl.pages.join(', ') || 'none'}):\n` +
    `${crawl.text || '(could not fetch, infer from the URL)'}\n` +
    (live.text
      ? `\nCurrent live posts from the client's connected accounts (${live.channels.join(', ')}):\n${live.text}\n`
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
