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

const SYSTEM = `You are a senior B2B copywriter composing copy for an entire campaign at once. Each asset is a DISTINCT unit: write net-new copy for it, never a template with the audience label swapped.

Each asset arrives with four inputs that MUST shape its copy:
- stage: the funnel stage (awareness | consideration | conversion | retention). Match its intent and register. Awareness frames the problem and earns attention. Consideration educates and builds the case. Conversion is decisive and proof-forward. Retention drives adoption and expansion. An awareness unit and a conversion unit must NOT read the same.
- audience: who this asset speaks to (name, role, angle, pains). Write to THIS segment's pains and language, not a generic buyer. Different audiences must get genuinely different copy, not the same line with the name changed.
- ctaSeed: the action this asset drives toward. Build the body toward this specific action and write a CTA that names it (you may sharpen the wording).
- proof: the proof point (RTB) this asset substantiates. Name or lean on it. Proof is a SHARED pool reused across many assets by design.
- context (optional): personalization the variant was fanned to (location, time/season, lifecycle, …). When present, LOCALIZE the copy to it so each variant is distinct and speaks to that context (a Belmar variant must not read identically to an Asbury one).

Write copy for EVERY component of EVERY asset, respecting each component's character limit. Headlines are tight; primary text can breathe; CTAs are short action labels, not sentences.

UNIQUENESS is a hard requirement. Across the whole campaign: no two assets may share the same headline, no two may share the same primary text, and CTAs must not repeat. Vary the opening, structure, and angle, not just the noun that names the audience. If an AVOID list is provided, do not reuse any string in it.

Proof handling: a shared proof pool is provided. Reuse its ids; do NOT invent new proof ids when the pool is non-empty. For each asset set rtbIds to the 1 to 2 pool ids it leans on (a landing page may carry all), chosen so an asset and the page it drives to share at least one. Echo the provided pool back in rtbs (same ids and labels). Only if the pool is empty, author 3 to 4 RTBs grounded in the ICP.

Hold ONE brand voice across the whole set so it still tells a single story to one buyer. If a brand profile is provided, reflect its industry and voice. If a BRAND GUIDE is provided, treat it as the contract: follow every "do", never break a "don't"; the copy must already pass a brand-coherence check.

Use the exact component "key" values given for each asset. Do not use em dashes anywhere in the copy. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runCopyDraft(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { icp, campaign, brand, brandGuide, proofPool, avoid, assets } = (body ?? {}) as {
    icp?: unknown
    campaign?: unknown
    brand?: unknown
    brandGuide?: unknown
    proofPool?: unknown
    avoid?: unknown
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
        content: `ICP:\n${JSON.stringify(icp, null, 2)}\n\nBrand profile:\n${JSON.stringify(brand ?? {}, null, 2)}\n\nBrand guide (the contract, write in this voice, never break a don't):\n${JSON.stringify(brandGuide ?? {}, null, 2)}\n\nCampaign: ${String(campaign)}\n\nShared proof pool (reuse these ids; do not invent new proof when this is non-empty):\n${JSON.stringify(proofPool ?? [], null, 2)}\n\nAVOID (strings already used in this campaign, do not reuse any of them):\n${JSON.stringify(avoid ?? {}, null, 2)}\n\nAssets to write (each carries its stage, audience, ctaSeed, proof, and components + char limits):\n${JSON.stringify(assets, null, 2)}\n\nWrite distinct copy for every asset and return it with the proof pool as rtbs.`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
