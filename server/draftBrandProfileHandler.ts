import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "draft brand profile" — fills a brand's STRATEGY RECORD (the communications-strategy
 * foundation shown on the Brand page: positioning, objectives, audience, differentiator, ...) from
 * what the brand has actually published. This is the upstream step the other generators read from,
 * so Build-brand fills it FIRST. 'copy' tier. Throws NO_KEY so the client falls back.
 */

const FIELDS = [
  // Overview + Strategic Foundation
  'oneLiner',
  'descriptor',
  'industry',
  'positioning',
  'businessObjective',
  'commsObjective',
  'primaryAudience',
  'audienceInsight',
  'competitiveContext',
  'differentiator',
  // Message Architecture
  'keyMessage',
  'supportingMessages',
  'proofPoints',
  'toneOfVoice',
  'languageDos',
  'languageDonts',
  // Execution
  'primaryChannels',
  'secondaryChannels',
  'contentPillars',
  'cadence',
  'budgetSplit',
  'keyMoments',
  // Measurement
  'primaryKpis',
  'headlineTargets',
  'reviewCadence',
  'risks',
] as const

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: 'string' }])),
  required: [...FIELDS],
} as const

const SYSTEM = `You fill in a brand's STRATEGY RECORD (its communications-strategy foundation) from what the brand has actually published. The brand NAME may be evocative or metaphorical; NEVER infer the product from the name.

Derive every field from the brand's REAL published copy below (and the description, if any). Each value is concrete and specific to THIS brand, grounded in its real work. Never invent numbers, logos, awards, or customer names you were not given.

Fields:
- oneLiner: one sentence on what the brand does.
- descriptor: a short phrase (3 to 6 words) naming the category / what it is.
- industry: the industry or category.
- positioning: a positioning statement (for [audience], the brand is the [category] that [distinct value]).
- businessObjective: the business goal its marketing serves.
- commsObjective: what its communications are trying to move.
- primaryAudience: the main audience it addresses (inferred from who its content is written for).
- audienceInsight: the core tension or truth about that audience the brand speaks to.
- competitiveContext: what it is an alternative to, or the landscape it stands against.
- differentiator: the one thing that makes it distinct.

Message Architecture:
- keyMessage: the single most important thing the brand needs its audience to believe.
- supportingMessages: 2 to 3 supporting messages, one line, semicolon separated.
- proofPoints: the top reasons to believe, semicolon separated; cite the real reach figures given where relevant, never invented ones.
- toneOfVoice: 3 to 5 tone adjectives that match how the brand actually writes.
- languageDos: what to do in the copy, semicolon separated.
- languageDonts: what to avoid, semicolon separated.

Execution:
- primaryChannels: the 2 to 3 main channels, comma separated, inferred from where the brand actually reaches its audience.
- secondaryChannels: supporting channels, comma separated.
- contentPillars: 3 to 4 recurring content themes the brand publishes around, comma separated.
- cadence: a sensible publishing cadence for a brand of this kind.
- budgetSplit: a directional split of effort across channels or content types (qualitative, no fabricated dollar figures).
- keyMoments: the key campaigns or moments across the year to plan around.

Measurement:
- primaryKpis: the main KPIs to track, comma separated.
- headlineTargets: directional headline targets; anchor to the real reach figures given when relevant, otherwise phrase as directional goals (never fabricate exact figures).
- reviewCadence: how often to review performance.
- risks: the key risks or watch-outs for this brand's marketing.

No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftBrandProfile(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, industry, positioning, samples } = (body ?? {}) as {
    brand?: string
    oneLiner?: string
    industry?: string
    positioning?: string
    samples?: { text?: string; channel?: string; reach?: number }[]
  }
  const samps = (samples ?? []).filter((s) => s && s.text)
  const samplesBlock = samps.length
    ? `\nThe brand's REAL published work (derive every field from this):\n${samps
        .map((s, i) => `${i + 1}. ${s.text}${s.reach ? ` [${s.channel || 'reach'}: ${s.reach}]` : ''}`)
        .join('\n')}`
    : ''

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}
Known so far (may be blank): one-liner ${oneLiner || '(none)'}; industry ${industry || '(none)'}; positioning ${positioning || '(none)'}.
${samplesBlock}

Fill in the brand's strategy record from the work above. When a field is blank, still give your best specific inference from the real copy, never from the brand name.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2800,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as Record<string, string>
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const k of Object.keys(parsed)) parsed[k] = strip(parsed[k])
  return parsed
}
