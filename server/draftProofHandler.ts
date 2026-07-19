import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "draft proof points" — given a brand's one-liner, industry, positioning, and audiences,
 * returns a few proof points (reasons to believe). Runs only on the dev server / a serverless function
 * so the model key stays private. Routes through the shared model client ('copy' tier). Throws NO_KEY
 * when neither key is set, so the client falls back to a small heuristic set.
 */

const PROOF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proofPoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['label', 'detail'],
      },
    },
  },
  required: ['proofPoints'],
} as const

const SYSTEM = `You draft PROOF POINTS (reasons to believe) for a brand — the credible, specific claims that make its marketing believable to a skeptical buyer.

CRITICAL — derive what the brand does from the description fields provided (one-liner, positioning, descriptor, key message, differentiator, objective, industry) and, when given, the brand's REAL published work below. The brand NAME is often evocative or metaphorical, so NEVER infer the product from the name. If the description says the brand does X, every proof point must be about X even when the name suggests something else. Example: a brand named "Breadcrumbs" whose description says it does personalization must get proof points about personalization, NOT about navigation trails or analytics.

Write the requested number of proof points. Each has:
- label: a short handle (2 to 5 words), e.g. "Deploys in a day" or "One message, every segment".
- detail: one sentence that substantiates it, concrete and specific to THIS brand (per its description) and its audiences.

Rules:
- Ground every proof point in what the brand does and, when its REAL published work is provided below, in that work and its measured reach. You MAY cite the real reach figures shown (for example a video's views, or the brand's total reach) as proof. NEVER invent specific numbers, logos, awards, or customer names you were not given; when there is no real metric, make a qualitative but still specific claim.
- For a brand whose value is its audience and reach (media, creators, content), the measured reach IS a proof point, so use it.
- Make them distinct from each other: cover different angles (outcome, speed, trust, ease, scale, expertise), not versions of one idea.
- If EXISTING proof points are listed, your new ones must be genuinely different from them — different angles, no repeats or rewordings.
- Write to the audiences' pains where possible.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftProof(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, industry, positioning, descriptor, keyMessage, differentiator, businessObjective, audiences, existing, count, samples } =
    (body ?? {}) as {
      brand?: string
      oneLiner?: string
      industry?: string
      positioning?: string
      descriptor?: string
      keyMessage?: string
      differentiator?: string
      businessObjective?: string
      audiences?: string[]
      existing?: string[]
      count?: number
      samples?: { text?: string; channel?: string; reach?: number }[]
    }

  const n = typeof count === 'number' && count > 0 && count <= 8 ? count : 4
  const existingList = (existing ?? []).filter(Boolean)
  const samps = (samples ?? []).filter((s) => s && s.text)
  const samplesBlock = samps.length
    ? `\nThe brand's REAL published work (ground proof in this; you MAY cite the reach shown, never invent numbers):\n${samps
        .map((s, i) => `${i + 1}. ${s.text}${s.reach ? ` [${s.channel || 'reach'}: ${s.reach}]` : ''}`)
        .join('\n')}`
    : ''

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description of what the brand actually does, ground every proof point in this:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Descriptor: ${descriptor || '(none)'}
Key message: ${keyMessage || '(none)'}
Differentiator: ${differentiator || '(none)'}
Business objective: ${businessObjective || '(none)'}
Industry: ${industry || '(none)'}

Audiences: ${(audiences ?? []).join(', ') || '(none given)'}
${samplesBlock}
${existingList.length ? `\nEXISTING proof points (do NOT repeat or reword these; write new, distinct ones):\n${existingList.map((e) => `- ${e}`).join('\n')}` : ''}

Draft ${n} proof points. When real published work is provided above, ground them in it and its measured reach; otherwise ground them strictly in the description (never the brand name).`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1200,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: PROOF_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { proofPoints?: { label: string; detail: string }[] }
  // Guarantee the no-em-dashes house style even if the model slips.
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const p of parsed.proofPoints ?? []) {
    p.label = strip(p.label)
    p.detail = strip(p.detail)
  }
  return parsed
}
