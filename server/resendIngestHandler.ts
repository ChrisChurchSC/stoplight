import Anthropic from '@anthropic-ai/sdk'
import { NoKeyError } from './siteMapHandler'

/**
 * Ingest a brand's email copy from Resend. The brand's broadcasts are the email
 * channel's live messaging — subject lines, body copy, CTAs — so we list the
 * broadcasts, pull each one's content, and have Claude map it into the current
 * state under the email channel. Read-only (list + get). Dev/server only; NO_KEY
 * (501) when ANTHROPIC_API_KEY is unset, RESEND_ERROR when the key is rejected.
 */

export interface ResendMessage {
  label: string
  headline: string
  body?: string
  cta?: string
  type: string
  audience: string
  source?: string
}
export interface ResendIngestResult {
  voice?: string
  proofPoints: { label: string; detail: string }[]
  messages: ResendMessage[]
  broadcastsRead: number
}

class ResendError extends Error {
  code = 'RESEND_ERROR'
}

const API = 'https://api.resend.com'

/** Strip an email's HTML down to readable copy. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Broadcast {
  id: string
  name?: string
  subject?: string
  html?: string
  text?: string
}

/** List recent broadcasts, then pull each one's subject + body copy. */
async function fetchBroadcasts(apiKey: string): Promise<{ subject: string; text: string; name?: string }[]> {
  const headers = { Authorization: `Bearer ${apiKey}` }
  let listRes: Response
  try {
    listRes = await fetch(`${API}/broadcasts`, { headers, signal: AbortSignal.timeout(10000) })
  } catch {
    throw new ResendError('Could not reach Resend.')
  }
  if (listRes.status === 401 || listRes.status === 403) {
    throw new ResendError('Resend rejected the API key. Use a key with read access to broadcasts.')
  }
  if (!listRes.ok) throw new ResendError(`Resend list failed (${listRes.status}).`)

  const list = (await listRes.json()) as { data?: { id: string }[] }
  const ids = (list.data ?? []).map((b) => b.id).slice(0, 40)

  const out: { subject: string; text: string; name?: string }[] = []
  for (const id of ids) {
    try {
      const r = await fetch(`${API}/broadcasts/${id}`, { headers, signal: AbortSignal.timeout(10000) })
      if (!r.ok) continue
      const b = (await r.json()) as Broadcast
      const body = (b.text?.trim() || stripHtml(b.html ?? '')).slice(0, 1500)
      const subject = (b.subject ?? '').trim()
      if (subject || body) out.push({ subject, text: body, name: b.name })
    } catch {
      /* skip this broadcast */
    }
  }
  return out
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
          source: { type: 'string' },
        },
        required: ['label', 'headline', 'type', 'audience'],
      },
    },
  },
  required: ['messages'],
} as const

const SYSTEM = `You are mapping a brand's EMAIL messaging for an agency onboarding them. You are given their recent email broadcasts — each block is one email with its subject line and body copy.

Extract their live email messaging:
- messages: every distinct value prop, claim, offer, subject-line hook, or CTA worth mapping. For each give a short label, the headline (use the subject line or the lead line), optional body and cta, its type, the audience it speaks to, and a source note (the broadcast name).
- proofPoints: their real reasons-to-believe (label + one-line detail), quoted from the copy.
- voice: a one-to-two sentence read on how their email copy actually reads.

Ground everything in the provided copy and quote their real words. Do not invent a future campaign and do not pad with generic marketing. Do not use em dashes. Return ONLY the structured object.`

type Progress = (e: { stage: string; detail: string }) => void

export async function runResendIngest(body: unknown, onProgress?: Progress): Promise<ResendIngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const { apiKey: resendKey } = (body ?? {}) as { apiKey?: string }
  const key = (resendKey ?? '').trim()
  if (!key) throw new ResendError('A Resend API key is required.')

  onProgress?.({ stage: 'reading', detail: 'Listing Resend broadcasts' })
  const broadcasts = await fetchBroadcasts(key)
  onProgress?.({
    stage: 'broadcasts',
    detail: broadcasts.length ? `Read ${broadcasts.length} broadcasts` : 'No broadcasts found',
  })
  if (!broadcasts.length) return { voice: undefined, proofPoints: [], messages: [], broadcastsRead: 0 }

  onProgress?.({ stage: 'extracting', detail: 'Mapping the email messaging' })
  const corpus = broadcasts
    .map((b) => `Subject: ${b.subject || b.name || '(no subject)'}\n${b.text}`)
    .join('\n\n---\n\n')
    .slice(0, 24000)

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Recent email broadcasts (${broadcasts.length}):\n\n${corpus}\n\nMap their email messaging.` }],
  })
  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const parsed = JSON.parse(block && block.type === 'text' ? block.text : '{}') as Partial<ResendIngestResult>

  onProgress?.({ stage: 'mapped', detail: `Mapped ${parsed.messages?.length ?? 0} messages from ${broadcasts.length} broadcasts` })
  return {
    voice: parsed.voice,
    proofPoints: parsed.proofPoints ?? [],
    messages: parsed.messages ?? [],
    broadcastsRead: broadcasts.length,
  }
}
