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

Derive your picks from (a) the brand description (one-liner, positioning, business objective, industry) and its audiences, and (b) when provided, the brand's CURRENT TRAFFIC MIX from connected analytics, which shows how its audiences actually reach it today. The brand NAME may be evocative; never infer the product from it.

You are given the exact list of channels the platform supports. PICK ONLY from that list, using the channel's label verbatim in "name". Choose the 4 to 6 channels that best fit this brand and how its audiences discover and buy. For each, give a one-line "why".

When a current traffic mix is provided, treat it as evidence, not decoration:
- Lean into channels that map to the brand's strongest, most-engaged sources (strong Organic Search -> SEO / blog / website; strong Organic Social -> the social channels; strong Referral -> partnerships; strong Paid -> the matching paid channel).
- Call out a high-potential but underused source as an opportunity to scale.
- In each "why", when the data supports the pick, reference the real signal in plain words (e.g. "Organic Search is your second-largest and most-engaged source"). Use ONLY the numbers you were given; never invent metrics or benchmarks.

When CROSS-CUSTOMER LEARNING is provided (anonymized channels that drove outcomes for similar personas across many customers), give extra weight to channels proven to work for the matching persona, and say so plainly in the "why" (e.g. "proven channel for this persona across similar accounts"). It is aggregate evidence, not this brand's own numbers; never cite a specific customer or figure you were not given.

Rules:
- Do NOT invent channels that are not in the provided list. Do NOT invent metrics or benchmark numbers beyond what you were given.
- Prefer a focused mix over listing everything; quality of fit over quantity.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftChannels(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, positioning, businessObjective, industry, audiences, channelOptions, performance, patterns } =
    (body ?? {}) as {
      brand?: string
      oneLiner?: string
      positioning?: string
      businessObjective?: string
      industry?: string
      audiences?: string[]
      channelOptions?: string[]
      performance?: { label?: string; reach?: number; reachUnit?: string; engagement?: number }[]
      patterns?: { attribute?: string; archetype?: string; customers?: number; outcomePerVariant?: number }[]
    }

  const options = (channelOptions ?? []).filter(Boolean)
  const perf = (performance ?? []).filter((p) => p && p.label)
  const perfBlock = perf.length
    ? `Current traffic mix (connected analytics, last 90 days) — how audiences reach this brand today:\n${perf
        .map((p) => `- ${p.label}: ${p.reach ?? 0} ${p.reachUnit ?? ''}${p.engagement != null ? ` (${p.engagement} engaged)` : ''}`)
        .join('\n')}`
    : 'Current traffic mix: (no connected analytics yet — recommend from the description alone)'
  const pats = (patterns ?? []).filter((p) => p && p.attribute)
  const patternsBlock = pats.length
    ? `\nCross-customer learning (anonymized, each backed by multiple customers) — channels that drove the best outcomes for similar personas:\n${pats
        .map((p) => `- ${p.attribute} (persona: ${p.archetype ?? 'general'}) — across ${p.customers ?? 0} customers`)
        .join('\n')}`
    : ''

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Business objective: ${businessObjective || '(none)'}
Industry: ${industry || '(none)'}
Audiences: ${(audiences ?? []).join(', ') || '(none given)'}

${perfBlock}
${patternsBlock}

Channels you may pick from (use the label verbatim in "name"):
${options.map((o) => `- ${o}`).join('\n')}

Recommend the 4 to 6 best-fit channels for this brand. When the traffic mix above has data, weight your picks toward what is proven and flag any underused high-potential source. When cross-customer learning is present, favor channels proven for the matching persona.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
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
