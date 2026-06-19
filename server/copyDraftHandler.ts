import Anthropic from '@anthropic-ai/sdk'

/**
 * Server-side starter-copy drafting. Runs ONLY on the dev server / a serverless
 * function — never in the browser — so the Anthropic API key stays private.
 * Throws NO_KEY when ANTHROPIC_API_KEY is unset, so the client falls back to the
 * heuristic writer. Mirrors server/icpReviewHandler.ts.
 */

// JSON Schema for the structured output — mirrors DraftResult in adapters/copy/draftWriter.ts.
const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rtbs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['id', 'label', 'detail'],
      },
    },
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rowId: { type: 'string' },
          components: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { key: { type: 'string' }, value: { type: 'string' } },
              required: ['key', 'value'],
            },
          },
          rtbIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['rowId', 'components', 'rtbIds'],
      },
    },
  },
  required: ['rtbs', 'drafts'],
} as const

const SYSTEM = `You are a senior B2B copywriter drafting starter copy for an entire campaign at once.
You are given an ICP (ideal customer profile) and the campaign's assets, each broken into the exact messaging components (with character limits) that asset type needs.
Write copy for EVERY component of EVERY asset:
- Ground every line in the ICP's buyer, segment, and pains. Be specific, concrete, and skimmable. No fluff, no clichés, no hype.
- Respect each component's character limit. Headlines are tight; primary text and body copy can breathe.
- CTAs are short action labels (e.g. "Get the guide"), not sentences.
- Hold ONE voice and ONE core promise across the whole campaign so the assets tell a single story to one buyer.
Also author 3 to 4 campaign RTBs (reasons to believe / proof points) grounded in the ICP. For each asset, choose which RTB ids it leans on (1 to 2 per asset; a landing page may carry all). Choose proof so that an asset and the page it drives to SHARE at least one RTB.
If a brand profile is provided, write in its voice and reflect its industry.
Use the exact component "key" values given for each asset. Do not use em dashes anywhere in the copy. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runCopyDraft(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { icp, campaign, brand, assets } = (body ?? {}) as {
    icp?: unknown
    campaign?: unknown
    brand?: unknown
    assets?: unknown
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `ICP:\n${JSON.stringify(icp, null, 2)}\n\nBrand profile:\n${JSON.stringify(brand ?? {}, null, 2)}\n\nCampaign: ${String(campaign)}\n\nAssets to write (each with its components + char limits):\n${JSON.stringify(assets, null, 2)}\n\nReturn the drafted copy and the campaign RTBs.`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
