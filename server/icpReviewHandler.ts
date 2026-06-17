import Anthropic from '@anthropic-ai/sdk'

/**
 * Server-side batch ICP review. Runs ONLY on the dev server / a serverless
 * function — never in the browser — so the Anthropic API key stays private.
 * Throws NO_KEY when ANTHROPIC_API_KEY is unset, so the client falls back to
 * the heuristic reviewer.
 */

// JSON Schema for the structured output — mirrors BatchReview in adapters/icp/types.ts.
const BATCH_REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['coherent', 'mixed', 'incoherent'] },
    oneStory: { type: 'boolean' },
    summary: { type: 'string' },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rowId: { type: 'string' },
          assetName: { type: 'string' },
          channel: { type: 'string' },
          verdict: { type: 'string', enum: ['on-message', 'drift', 'off-icp'] },
          field: {
            type: 'object',
            additionalProperties: false,
            properties: { key: { type: 'string' }, label: { type: 'string' } },
            required: ['key', 'label'],
          },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['rowId', 'assetName', 'channel', 'verdict', 'issue', 'suggestion'],
      },
    },
  },
  required: ['verdict', 'oneStory', 'summary', 'flags'],
} as const

const SYSTEM = `You are a senior B2B marketing strategist running a pre-flight messaging review.
You are given an ICP (ideal customer profile) and the full batch of campaign assets, each broken into messaging components.
Evaluate the assets TOGETHER, not one at a time:
- Consistency: do they share one core promise, voice, and buyer across channels?
- ICP fit: does each component actually speak to this buyer's pains and context?
- Drift: flag the specific components (by field key + label) that wander off-message or off-audience — wrong angle, off-voice, missing the buyer's pain, drifting from the campaign promise.
Skip action labels (CTA buttons, display paths) — they are not pain statements.
Every flag must carry a short concrete reason and an actionable fix suggestion.
Also judge whether the whole batch tells one story to one buyer (oneStory) and give a campaign verdict.
Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runIcpReview(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { icp, assets } = (body ?? {}) as { icp?: unknown; assets?: unknown }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: BATCH_REVIEW_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `ICP:\n${JSON.stringify(icp, null, 2)}\n\nAssets (the to-be-scheduled batch):\n${JSON.stringify(assets, null, 2)}\n\nReturn the batch messaging review.`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
