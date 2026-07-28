import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "draft audiences" — given a brand's description, returns a few distinct target
 * audiences (personas) with the fields the app's audience records use. Runs only on the dev server /
 * a serverless function so the model key stays private. Routes through the shared model client
 * ('copy' tier). Throws NO_KEY when neither key is set, so the client falls back to a heuristic set.
 */

const AUDIENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    audiences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          definition: { type: 'string' },
          role: { type: 'string' },
          pains: { type: 'array', items: { type: 'string' } },
          messageAngle: { type: 'string' },
          outcome: { type: 'string' },
        },
        required: ['name', 'definition', 'role', 'pains', 'messageAngle', 'outcome'],
      },
    },
  },
  required: ['audiences'],
} as const

const SYSTEM = `You define TARGET AUDIENCES (buyer personas) for a brand — the distinct groups it markets to.

Derive the audiences from the description (one-liner, positioning, descriptor, differentiator, objective, industry) AND, when provided, the brand's REAL published copy below. The brand NAME may be evocative or metaphorical; never infer the product from the name.

When real published copy is provided, infer the audiences from who the content is actually written for, the people, roles, and needs it addresses, not just abstract personas.

Write the requested number of audiences. Each has:
- name: a short persona name (2 to 4 words), e.g. "RevOps leaders" or "Demand gen managers".
- definition: one sentence on who they are (role, context, what they own).
- role: their job title or function.
- pains: 2 to 3 specific pains this brand relieves for them.
- messageAngle: the one-line angle that lands with THIS persona (how the brand's value maps to their pain).
- outcome: the conversion outcome they move toward.

Rules:
- Make the audiences genuinely distinct: different roles, priorities, and buying motivations, not variations of one persona.
- If EXISTING audiences are listed, your new ones must be different personas (do not repeat or reword them).
- Ground everything in what the description says the brand does; do not invent specific numbers or company names.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftAudiences(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, positioning, descriptor, differentiator, businessObjective, industry, existing, count, samples } =
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
      samples?: { text?: string; channel?: string; reach?: number }[]
    }

  const n = typeof count === 'number' && count > 0 && count <= 6 ? count : 3
  const existingList = (existing ?? []).filter(Boolean)
  const samps = (samples ?? []).filter((s) => s && s.text)
  const samplesBlock = samps.length
    ? `\nThe brand's REAL published copy (infer audiences from who this is written for, the roles and needs it addresses):\n${samps
        .map((s, i) => `${i + 1}. ${s.text}`)
        .join('\n')}`
    : ''

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description of what the brand does, ground the audiences in this:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Descriptor: ${descriptor || '(none)'}
Differentiator: ${differentiator || '(none)'}
Business objective: ${businessObjective || '(none)'}
Industry: ${industry || '(none)'}
${samplesBlock}
${existingList.length ? `\nEXISTING audiences (do NOT repeat these; write new, distinct personas):\n${existingList.map((e) => `- ${e}`).join('\n')}` : ''}

Define ${n} distinct target audiences. When real copy is provided above, infer them from who the content is written for; otherwise ground them in the description (never the brand name).`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    max_tokens: 1600,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: AUDIENCE_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { audiences?: { name: string; definition: string; role: string; pains: string[]; messageAngle: string; outcome: string }[] }
  // Guarantee the no-em-dashes house style even if the model slips.
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const a of parsed.audiences ?? []) {
    a.name = strip(a.name)
    a.definition = strip(a.definition)
    a.messageAngle = strip(a.messageAngle)
    a.outcome = strip(a.outcome)
    a.pains = (a.pains ?? []).map(strip)
  }
  return parsed
}
