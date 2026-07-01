import Anthropic from '@anthropic-ai/sdk'
import { NoKeyError } from './siteMapHandler'

/**
 * Ingest a brand's OWNED content straight from their Sanity CMS. Unlike the
 * social channels (scraped + vision), Sanity is the source of record: we query
 * the dataset over GROQ, pull the human-readable copy out of every content
 * document (strings + portable text), and have Claude map it into the brand's
 * current-state messaging. No scraping, no login — just the API + a read token
 * for private datasets. Dev/server only; NO_KEY (501) when ANTHROPIC_API_KEY is
 * unset, SANITY_ERROR when the dataset can't be read.
 */

export interface SanityMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  /** Which owned surface this copy belongs to (website/blog/landing-page…). */
  channel?: string
  source?: string
}
export interface SanityIngestResult {
  voice?: string
  proofPoints: { label: string; detail: string }[]
  messages: SanityMessage[]
  docsRead: number
}

class SanityError extends Error {
  code = 'SANITY_ERROR'
}

// Keys that never carry brand copy — skip them when harvesting text so the
// corpus is messaging, not ids/slugs/refs.
const SKIP_KEYS = new Set([
  '_id', '_type', '_rev', '_key', '_ref', '_weak', '_createdAt', '_updatedAt',
  'slug', 'url', 'href', 'asset', 'hotspot', 'crop', 'lqip', 'palette', 'dimensions',
])

/** Recursively harvest human-readable strings (incl. portable-text spans). */
function harvestText(node: unknown, out: string[], depth = 0): void {
  if (depth > 8 || out.length > 4000) return
  if (typeof node === 'string') {
    const s = node.trim()
    // Drop ids/refs/urls and single tokens that aren't prose.
    if (s.length >= 2 && !/^https?:\/\//.test(s) && !/^[a-z0-9._-]{16,}$/i.test(s)) out.push(s)
    return
  }
  if (Array.isArray(node)) {
    for (const v of node) harvestText(v, out, depth + 1)
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (SKIP_KEYS.has(k)) continue
      harvestText(v, out, depth + 1)
    }
  }
}

/** Pull recent content documents from the dataset and reduce each to its copy. */
async function fetchSanityDocs(
  projectId: string,
  dataset: string,
  token: string | undefined,
): Promise<{ type: string; text: string }[]> {
  // Recent, non-system, non-draft documents. Bounded so a big dataset stays sane.
  const groq = `*[!(_type match "sanity.*") && !(_id in path("drafts.**"))] | order(_updatedAt desc) [0...60]`
  const host = token ? `${projectId}.api.sanity.io` : `${projectId}.apicdn.sanity.io`
  const url = `https://${host}/v2021-10-21/data/query/${encodeURIComponent(dataset)}?query=${encodeURIComponent(groq)}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw new SanityError('Could not reach Sanity. Check the project id and network.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new SanityError('Sanity refused the read. The dataset is private — add a read token.')
  }
  if (!res.ok) throw new SanityError(`Sanity query failed (${res.status}). Check the project id and dataset.`)
  const data = (await res.json()) as { result?: Record<string, unknown>[] }
  const docs = data.result ?? []
  return docs
    .map((d) => {
      const out: string[] = []
      harvestText(d, out)
      const text = [...new Set(out)].join(' · ').slice(0, 1200)
      return { type: String((d as { _type?: string })._type ?? 'document'), text }
    })
    .filter((d) => d.text.length > 20)
}

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
          channel: { type: 'string', enum: ['website', 'blog', 'landing-page', 'lead-magnet', 'email'] },
          source: { type: 'string' },
        },
        required: ['label', 'headline', 'type', 'audience'],
      },
    },
  },
  required: ['messages'],
} as const

const SYSTEM = `You are mapping a brand's OWNED content for an agency onboarding them. You are given the human-readable copy from their Sanity CMS — each block is one document with its type and its text.

Extract the brand's current live messaging:
- messages: every distinct value prop, claim, offer, headline, or CTA worth mapping. For each give a short label, the headline (the actual line), optional body and cta, its type, the audience it speaks to, the owned surface it belongs to (website for site pages, blog for articles, landing-page for campaign pages, etc.), and a source note (the document type).
- proofPoints: their real reasons-to-believe (label + one-line detail), quoted from the copy.
- voice: a one-to-two sentence read on how their copy actually reads.

Ground everything in the provided copy and quote their real words. Do not invent a future campaign and do not pad with generic marketing. Do not use em dashes. Return ONLY the structured object.`

type Progress = (e: { stage: string; detail: string }) => void

export async function runSanityIngest(body: unknown, onProgress?: Progress): Promise<SanityIngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const { projectId, dataset, token } = (body ?? {}) as {
    projectId?: string
    dataset?: string
    token?: string
  }
  const pid = (projectId ?? '').trim()
  const ds = (dataset ?? 'production').trim() || 'production'
  if (!pid) throw new SanityError('A Sanity project id is required.')

  onProgress?.({ stage: 'reading', detail: `Querying Sanity project ${pid} / ${ds}` })
  const docs = await fetchSanityDocs(pid, ds, token?.trim() || undefined)
  onProgress?.({ stage: 'docs', detail: docs.length ? `Read ${docs.length} content documents` : 'No content documents found' })
  if (!docs.length) {
    return { voice: undefined, proofPoints: [], messages: [], docsRead: 0 }
  }

  onProgress?.({ stage: 'extracting', detail: 'Mapping the messaging' })
  const corpus = docs.map((d) => `[${d.type}] ${d.text}`).join('\n\n').slice(0, 24000)
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Content from their Sanity CMS (${docs.length} documents):\n\n${corpus}\n\nMap their owned messaging.` }],
  })
  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const parsed = JSON.parse(block && block.type === 'text' ? block.text : '{}') as Partial<SanityIngestResult>

  onProgress?.({ stage: 'mapped', detail: `Mapped ${parsed.messages?.length ?? 0} messages from ${docs.length} documents` })
  return {
    voice: parsed.voice,
    proofPoints: parsed.proofPoints ?? [],
    messages: parsed.messages ?? [],
    docsRead: docs.length,
  }
}
