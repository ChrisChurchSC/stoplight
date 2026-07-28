import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'
import { fetchPage, sitemapUrls, type Page } from './ingestSiteHandler.js'

/**
 * READ A WEBSITE AND PROPOSE THE FIELDS ON A BRAND OR PRODUCT CARD.
 *
 * The fields these cards want — what it does, what it sells, what makes it different, the position
 * it owns, how it sounds — are all stated on the company's own site, usually on the homepage and an
 * about page. Retyping them into a form is the least interesting work in the app and the step most
 * likely to be skipped, which leaves the copy writer with a brand it knows nothing about.
 *
 * WHAT IT DOES NOT DO. It does not go and find things out. It reads the pages given to it and reports
 * what they SAY, which is a different claim from what is true: a site describing itself as "the
 * leading platform" yields a positioning line, not a fact about the market. Everything it returns is
 * a quotation or a close paraphrase of the site, and the prompt forbids inference beyond it — because
 * the moment a field on a brand card is invented, the copy writer treats it as something the user
 * asserted.
 *
 * The client fills only EMPTY fields with the result, so a scan can never overwrite something
 * somebody wrote. Same rule draftAngleHandler already works to.
 */

const BRAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    oneLiner: { type: 'string' },
    products: { type: 'array', items: { type: 'string' } },
    differentiators: { type: 'array', items: { type: 'string' } },
    wedge: { type: 'string' },
    mission: { type: 'string' },
    industry: { type: 'string' },
    voice: { type: 'string' },
    /** What the site does NOT sound like, which is the field nobody writes and the site shows. */
    avoidVoice: { type: 'string' },
    /** Said out loud so the user can judge how much of this is the site talking. */
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    readFrom: { type: 'array', items: { type: 'string' } },
  },
  required: ['oneLiner', 'confidence', 'readFrom'],
} as const

const PRODUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    summary: { type: 'string' },
    kind: { type: 'string' },
    forWho: { type: 'string' },
    jobToBeDone: { type: 'string' },
    replaces: { type: 'string' },
    pricing: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    readFrom: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'confidence', 'readFrom'],
} as const

const SYSTEM = `You read a company's own web pages and fill in a card describing them.

WHAT YOU ARE DOING. Reporting what the pages SAY, in the company's own words where possible. You are not researching the company, not judging whether its claims are true, and not filling gaps with what a company like this usually does.

RULES
- Every value must be traceable to the text you were given. If the pages do not say it, leave the field out entirely rather than guessing.
- Prefer the company's own phrasing over a tidier rewrite. "Same-day emergency appointments" beats "rapid access to care".
- oneLiner / summary: one sentence, what it does, for someone who has not heard of it.
- differentiators: only claims the site actually makes about itself. Not features you infer from a screenshot.
- wedge: the position it claims that a competitor could not say. Leave out if the site does not stake one.
- voice: how the writing SOUNDS (plain, technical, warm, blunt), judged from the copy you read, not from the sector.
- avoidVoice: the register that would clearly be wrong for this brand, given how it writes. This one IS a judgement, so keep it short and obvious.
- pricing: only if a price or a model is stated. Never estimate.
- Set confidence honestly: low when you had one thin page, high when several pages said the same thing.
- List the page URLs you actually used in readFrom.
- No em dashes. No marketing language of your own.

Return ONLY the structured object. Fields you cannot support: omit them.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

/** Pages worth reading for a brand: the homepage, plus anything that looks like about / product. */
function pickPages(urls: string[], limit: number): string[] {
  const score = (u: string) => {
    const l = u.toLowerCase()
    if (/\/(about|who-we-are|our-story|company|mission)/.test(l)) return 0
    if (/\/(product|products|services|what-we-do|features|solutions|pricing|plans)/.test(l)) return 1
    if (/\/(blog|news|press|careers|privacy|terms|legal|contact)/.test(l)) return 9
    return 5
  }
  return [...new Set(urls)].sort((a, b) => score(a) - score(b)).slice(0, limit)
}

export async function runScanSite(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { url, kind } = (body ?? {}) as { url?: string; kind?: string }
  const raw = String(url ?? '').trim()
  if (!raw) throw new Error('No URL given')
  const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let origin: string
  try {
    origin = new URL(target).origin
  } catch {
    throw new Error('That does not look like a web address')
  }

  const home = await fetchPage(target)
  if (!home) throw new Error('Could not read that site')
  // A homepage alone is often a slogan and a hero image. The about and product pages are where a
  // company actually says what it does, so read a few and let confidence reflect what was found.
  let pages: Page[] = [home]
  try {
    const more = pickPages(await sitemapUrls(origin), 4).filter((u) => u !== target)
    const fetched = await Promise.all(more.map((u) => fetchPage(u)))
    pages = [home, ...fetched.filter((p): p is Page => !!p)]
  } catch {
    // A missing or unreadable sitemap is normal. One page is still worth reading.
  }

  const corpus = pages
    .map((p) => `--- ${p.url}\nTITLE: ${p.title}\nDESCRIPTION: ${p.description}\nTEXT: ${p.text.slice(0, 3500)}`)
    .join('\n\n')
    .slice(0, 18000)

  const isProduct = kind === 'product'
  const client = makeModelClient('copy')
  const message = await client.messages.create({
    max_tokens: 1500,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: isProduct ? PRODUCT_SCHEMA : BRAND_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `${isProduct ? 'Fill in a PRODUCT card' : 'Fill in a BRAND card'} from these pages.\n\n${corpus}`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const parsed = JSON.parse(block && block.type === 'text' ? block.text : '{}') as Record<string, unknown>
  // Em dashes are forbidden in this app's copy and the model reaches for them.
  const clean = (v: unknown): unknown =>
    typeof v === 'string' ? v.replace(/\s*[—–]\s*/g, ', ').trim()
      : Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => (x as string).replace(/\s*[—–]\s*/g, ', ').trim())
      : v
  for (const k of Object.keys(parsed)) parsed[k] = clean(parsed[k])
  return { ...parsed, pagesRead: pages.length }
}
