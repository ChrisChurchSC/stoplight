import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "draft messages" — given a brand's description and audiences, returns a few reusable
 * messages (angles), each tied to an audience and funnel stage. Runs only on the dev server / a
 * serverless function so the key stays private. 'copy' tier. Throws NO_KEY so the client falls back.
 */

const MESSAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          angle: { type: 'string' },
          audience: { type: 'string' },
          pillar: { type: 'string' },
          stage: { type: 'string', enum: ['awareness', 'consideration', 'conversion'] },
        },
        required: ['name', 'angle', 'audience', 'pillar', 'stage'],
      },
    },
  },
  required: ['messages'],
} as const

const SYSTEM = `You draft MESSAGES (reusable angles) for a brand, the specific ways it makes its case to a given audience at a given stage.

Derive the messages from the description (one-liner, positioning, descriptor, differentiator, objective, industry) AND, when provided, the brand's REAL published copy below. The brand NAME may be evocative or metaphorical; never infer the product from the name.

When real published copy is provided, draw the message angles and hooks from the themes the brand ACTUALLY talks about (its recurring ideas, framings, and language), not generic templates.

Write the requested number of messages. Each has:
- name: the message itself, a short punchy line (a headline you would actually run).
- angle: one sentence on the angle, how this frames the brand's value.
- audience: which of the brand's audiences this is for (use one of the audience names provided; if none given, write "All").
- pillar: the theme or value it ladders to (2 to 4 words).
- stage: one of awareness, consideration, conversion.

Rules:
- Spread across the audiences provided and across stages; do not write five versions of one idea.
- Ground every message in what the DESCRIPTION says the brand does.
- If EXISTING messages are listed, write new, distinct ones.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftMessages(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, positioning, descriptor, differentiator, businessObjective, industry, audiences, existing, count, samples } =
    (body ?? {}) as {
      brand?: string
      oneLiner?: string
      positioning?: string
      descriptor?: string
      differentiator?: string
      businessObjective?: string
      industry?: string
      audiences?: string[]
      existing?: string[]
      count?: number
      samples?: { text?: string; channel?: string; reach?: number }[]
    }

  const n = typeof count === 'number' && count > 0 && count <= 8 ? count : 4
  const existingList = (existing ?? []).filter(Boolean)
  const samps = (samples ?? []).filter((s) => s && s.text)
  const samplesBlock = samps.length
    ? `\nThe brand's REAL published copy (draw message angles from the themes and hooks it actually uses):\n${samps
        .map((s, i) => `${i + 1}. ${s.text}`)
        .join('\n')}`
    : ''

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description of what the brand does, ground the messages in this:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Descriptor: ${descriptor || '(none)'}
Differentiator: ${differentiator || '(none)'}
Business objective: ${businessObjective || '(none)'}
Industry: ${industry || '(none)'}

Audiences to write for: ${(audiences ?? []).join(', ') || '(none given, use "All")'}
${samplesBlock}
${existingList.length ? `\nEXISTING messages (do NOT repeat these):\n${existingList.map((e) => `- ${e}`).join('\n')}` : ''}

Draft ${n} messages. When real copy is provided above, draw the angles from the themes the brand actually uses; otherwise ground them in the description (never the brand name).`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1600,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: MESSAGE_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { messages?: { name: string; angle: string; audience: string; pillar: string; stage: string }[] }
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const m of parsed.messages ?? []) {
    m.name = strip(m.name)
    m.angle = strip(m.angle)
    m.pillar = strip(m.pillar)
  }
  return parsed
}
