import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "draft voices" — given a brand's description, returns brand voice / tone-of-voice
 * profiles (tone, do's, don'ts, a sample). Runs only on the dev server / a serverless function so
 * the key stays private. 'copy' tier. Throws NO_KEY so the client falls back.
 */

const VOICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    voices: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          summary: { type: 'string' },
          tone: { type: 'string' },
          dos: { type: 'string' },
          donts: { type: 'string' },
          sample: { type: 'string' },
          useFor: { type: 'string' },
        },
        required: ['name', 'summary', 'tone', 'dos', 'donts', 'sample', 'useFor'],
      },
    },
  },
  required: ['voices'],
} as const

const SYSTEM = `You define brand VOICES (tone-of-voice profiles) for a brand, the distinct voices its copy can be written in.

CRITICAL, derive everything ONLY from the description provided (one-liner, positioning, descriptor, differentiator, objective, industry). The brand NAME may be evocative or metaphorical; never infer the product from the name.

Write the requested number of voices. Each has:
- name: a short voice name (e.g. "Confident expert" or "Warm and plain-spoken").
- summary: one sentence on what this voice is and when to reach for it.
- tone: 3 to 5 tone adjectives, comma separated.
- dos: a short list (one line, semicolon separated) of what to do in this voice.
- donts: a short list (one line, semicolon separated) of what to avoid.
- sample: one short sentence written IN this voice, about the brand.
- useFor: where this voice fits (channels, contexts).

Rules:
- If asked for more than one, make them genuinely distinct voices (a primary voice plus alternates for different contexts), not restatements.
- Fit the voices to the brand's positioning and industry.
- If EXISTING voices are listed, write new, distinct ones.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftVoices(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, positioning, descriptor, differentiator, businessObjective, industry, existing, count } =
    (body ?? {}) as {
      brand?: string
      oneLiner?: string
      positioning?: string
      descriptor?: string
      differentiator?: string
      businessObjective?: string
      industry?: string
      existing?: string[]
      count?: number
    }

  const n = typeof count === 'number' && count > 0 && count <= 5 ? count : 2
  const existingList = (existing ?? []).filter(Boolean)

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description of what the brand does, fit the voices to this:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Descriptor: ${descriptor || '(none)'}
Differentiator: ${differentiator || '(none)'}
Business objective: ${businessObjective || '(none)'}
Industry: ${industry || '(none)'}
${existingList.length ? `\nEXISTING voices (do NOT repeat these):\n${existingList.map((e) => `- ${e}`).join('\n')}` : ''}

Define ${n} brand ${n === 1 ? 'voice' : 'voices'}, grounded in the description above (not the brand name).`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1600,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: VOICE_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { voices?: Record<string, string>[] }
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const v of parsed.voices ?? []) for (const k of Object.keys(v)) v[k] = strip(v[k])
  return parsed
}
