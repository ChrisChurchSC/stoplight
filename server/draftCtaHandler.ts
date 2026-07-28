import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "draft CTAs" — given a brand's description + audiences (and its real published work
 * when available), returns a set of reusable calls to action spread across the funnel. Mirrors
 * draftProofHandler: private model key, 'copy' tier, NO_KEY (501) when unset so the client falls back
 * to a small heuristic set. The result populates the brand's library CTAs, which generation seeds
 * asset CTAs from (draftCopy's pickCta), so copy leans on brand-authored actions, not just fallbacks.
 */

const CTA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ctas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          stage: { type: 'string', enum: ['awareness', 'consideration', 'conversion', 'retention'] },
          outcome: { type: 'string' },
        },
        required: ['label', 'stage'],
      },
    },
  },
  required: ['ctas'],
} as const

const SYSTEM = `You draft CALLS TO ACTION (CTAs) for a brand — the short action labels its marketing asks people to take, reusable across campaigns and spread across the funnel.

CRITICAL — derive what the brand does from the description fields (one-liner, positioning, descriptor, key message, differentiator, objective, industry) and, when given, the brand's REAL published work. The brand NAME is often evocative or metaphorical, so NEVER infer the product from the name. Every CTA must fit what the brand actually does and where it really sends people. Example: a brand named "Breadcrumbs" whose description says it does personalization gets CTAs like "See personalization live", NOT "Follow the trail".

Write the requested number of CTAs, spread across funnel stages so there is at least one for each stage the brand plausibly uses:
- awareness: a low-commitment next step (e.g. "Read the guide", "Watch the film").
- consideration: evaluate or learn deeper (e.g. "See how it works", "Compare plans").
- conversion: the decisive action the brand's objective implies (e.g. "Book a demo", "Start free", "Donate now").
- retention: deepen or expand for existing users (e.g. "Invite your team", "Upgrade your plan").

Each CTA has:
- label: the button text, 2 to 5 words, imperative and specific to this brand's real next step. No trailing period.
- stage: one of awareness | consideration | conversion | retention.
- outcome: the result it drives, a few words (e.g. "Booked meeting", "Newsletter signup").

Rules:
- Ground every CTA in what the brand does and where it actually sends people (its site, a demo, a signup, a subscribe, a donation). Match the conversion CTA to the brand's business objective.
- Make them distinct: no two CTAs that are rewordings of each other.
- If EXISTING CTAs are listed, your new ones must be genuinely different from them.
- Plain, human button copy, not marketing fluff. No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftCtas(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const {
    brand,
    oneLiner,
    industry,
    positioning,
    descriptor,
    keyMessage,
    differentiator,
    businessObjective,
    commsObjective,
    audiences,
    existing,
    count,
    samples,
  } = (body ?? {}) as {
    brand?: string
    oneLiner?: string
    industry?: string
    positioning?: string
    descriptor?: string
    keyMessage?: string
    differentiator?: string
    businessObjective?: string
    commsObjective?: string
    audiences?: string[]
    existing?: string[]
    count?: number
    samples?: { text?: string; channel?: string; reach?: number }[]
  }

  const n = typeof count === 'number' && count > 0 && count <= 10 ? count : 6
  const existingList = (existing ?? []).filter(Boolean)
  const samps = (samples ?? []).filter((s) => s && s.text)
  const samplesBlock = samps.length
    ? `\nThe brand's REAL published work (fit the CTAs to how this brand talks and what it offers):\n${samps
        .map((s, i) => `${i + 1}. ${s.text}${s.reach ? ` [${s.channel || 'reach'}: ${s.reach}]` : ''}`)
        .join('\n')}`
    : ''

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description of what the brand actually does, ground every CTA in this:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Descriptor: ${descriptor || '(none)'}
Key message: ${keyMessage || '(none)'}
Differentiator: ${differentiator || '(none)'}
Business objective: ${businessObjective || '(none)'}
Comms objective: ${commsObjective || '(none)'}
Industry: ${industry || '(none)'}

Audiences: ${(audiences ?? []).join(', ') || '(none given)'}
${samplesBlock}
${existingList.length ? `\nEXISTING CTAs (do NOT repeat or reword these; write new, distinct ones):\n${existingList.map((e) => `- ${e}`).join('\n')}` : ''}

Draft ${n} CTAs spread across the funnel, grounded in what the brand does and its real conversion action (from the objective).`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    max_tokens: 1200,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: CTA_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { ctas?: { label: string; stage?: string; outcome?: string }[] }
  // Guarantee the no-em-dashes house style even if the model slips.
  const strip = (s?: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const c of parsed.ctas ?? []) {
    c.label = strip(c.label) ?? c.label
    if (c.outcome) c.outcome = strip(c.outcome)
  }
  return parsed
}
