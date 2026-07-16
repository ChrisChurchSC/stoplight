import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "recommend channels" — given a brand's description and the list of channels the app
 * supports, returns the subset that fits the brand and its audiences, each with a one-line reason.
 * It only PICKS from the provided options (never invents channels or benchmark numbers). The client
 * resolves the picks to channel ids and assigns them to the brand's audiences. 'copy' tier.
 */

const CHANNEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    channels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['name', 'why'],
      },
    },
  },
  required: ['channels'],
} as const

const SYSTEM = `You recommend the marketing CHANNELS a brand should focus on.

CRITICAL, derive your picks ONLY from the description provided (one-liner, positioning, business objective, industry) and its audiences. The brand NAME may be evocative; never infer the product from it.

You are given the exact list of channels the platform supports. PICK ONLY from that list, using the channel's label verbatim in "name". Choose the 4 to 6 channels that best fit this brand and how its audiences discover and buy. For each, give a one-line "why" tied to the brand and audience.

Rules:
- Do NOT invent channels that are not in the provided list. Do NOT invent metrics or benchmark numbers.
- Prefer a focused mix over listing everything; quality of fit over quantity.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftChannels(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, positioning, businessObjective, industry, audiences, channelOptions } =
    (body ?? {}) as {
      brand?: string
      oneLiner?: string
      positioning?: string
      businessObjective?: string
      industry?: string
      audiences?: string[]
      channelOptions?: string[]
    }

  const options = (channelOptions ?? []).filter(Boolean)

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Business objective: ${businessObjective || '(none)'}
Industry: ${industry || '(none)'}
Audiences: ${(audiences ?? []).join(', ') || '(none given)'}

Channels you may pick from (use the label verbatim in "name"):
${options.map((o) => `- ${o}`).join('\n')}

Recommend the 4 to 6 best-fit channels for this brand.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: CHANNEL_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { channels?: { name: string; why: string }[] }
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const c of parsed.channels ?? []) c.why = strip(c.why)
  return parsed
}
