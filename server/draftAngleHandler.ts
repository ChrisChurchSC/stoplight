import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'
import { OUTCOMES } from '../src/domain/outcomes.js'

/**
 * Server-side "recommend audience angle" — for each audience, returns the three interpretive fields
 * a user shouldn't have to author from a blank sheet: a message angle, a funnel stage, and a
 * conversion outcome, each with a one-line rationale + a confidence. It infers these from OBSERVABLE
 * facts (role, definition, pains, triggers, demographics) plus the brand's business objective. The
 * client fills only empty fields, so a recommendation never clobbers a user-authored value. 'copy' tier.
 */

const FUNNEL_KEYS = ['awareness', 'consideration', 'conversion', 'retention'] as const

const ANGLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    angles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          audience: { type: 'string' },
          messageAngle: { type: 'string' },
          funnelStage: { type: 'string', enum: FUNNEL_KEYS },
          outcome: { type: 'string' },
          rationale: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          signalsUsed: { type: 'array', items: { type: 'string' } },
        },
        required: ['audience', 'messageAngle', 'funnelStage', 'outcome', 'rationale', 'confidence', 'signalsUsed'],
      },
    },
  },
  required: ['angles'],
} as const

const SYSTEM = `You recommend, FOR EACH audience, the three interpretive fields a marketer would otherwise struggle to fill from a blank sheet:
- messageAngle: how to speak to this audience — the through-line that connects the brand's value to what this audience cares about. One or two sentences, concrete, no fluff.
- funnelStage: exactly one of awareness, consideration, conversion, retention. Choose where this audience most needs to be met right now given their pains and the business objective (new/cold -> awareness; evaluating -> consideration; ready to act -> conversion; existing/renewing -> retention).
- outcome: the single conversion action you want this audience to take. Prefer a value from the SUGGESTED OUTCOMES list, but adapt to the brand's org type when none fit (a nonprofit converts to Donate/Volunteer, a SaaS to Sign up/Buy, media to Subscribe/Listen).

Derive every pick from the OBSERVABLE facts given (role, definition, pains, triggers, demographics) and the brand's business objective. The brand NAME may be evocative; never infer the product from it. Give a one-line "rationale" a human can trust or correct, and a "confidence" (low/medium/high) that reflects how much real signal you had — low when facts are sparse or the objective is missing.

List the exact signals you used in "signalsUsed" (e.g. "pains: slow onboarding", "objective: grow trials").

Rules:
- funnelStage MUST be one of the four keys, lowercase.
- Do NOT invent facts about the audience beyond what you were given.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

interface AudienceIn {
  name?: string
  role?: string
  definition?: string
  pains?: string[]
  goalTags?: string[]
  triggers?: string[]
  demographics?: string
}

export async function runDraftAngle(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, businessObjective, oneLiner, positioning, industry, audiences } = (body ?? {}) as {
    brand?: string
    businessObjective?: string
    oneLiner?: string
    positioning?: string
    industry?: string
    audiences?: AudienceIn[]
  }

  const auds = (audiences ?? []).filter((a) => a && a.name)
  const audBlock = auds
    .map((a) => {
      const facts = [
        a.role ? `role: ${a.role}` : '',
        a.definition ? `who they are: ${a.definition}` : '',
        a.demographics ? `demographics: ${a.demographics}` : '',
        a.pains?.length ? `pains: ${a.pains.join('; ')}` : '',
        a.triggers?.length ? `buying triggers: ${a.triggers.join('; ')}` : '',
        a.goalTags?.length ? `goals: ${a.goalTags.join('; ')}` : '',
      ].filter(Boolean)
      return `- ${a.name}\n${facts.length ? facts.map((f) => `    ${f}`).join('\n') : '    (no facts given — infer conservatively, confidence low)'}`
    })
    .join('\n')

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Brand description:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Business objective: ${businessObjective || '(none — treat outcome/stage as low confidence)'}
Industry: ${industry || '(none)'}

Suggested outcomes (prefer these, adapt to the brand's org type when none fit): ${OUTCOMES.join(', ')}

Audiences to recommend for:
${audBlock || '(none given)'}

For EACH audience above, return one recommendation object with messageAngle, funnelStage, outcome, rationale, confidence, and signalsUsed. Match "audience" to the audience name verbatim.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: ANGLE_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as {
    angles?: { audience: string; messageAngle: string; funnelStage: string; outcome: string; rationale: string; confidence: string; signalsUsed: string[] }[]
  }
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const a of parsed.angles ?? []) {
    a.messageAngle = strip(a.messageAngle)
    a.rationale = strip(a.rationale)
    a.outcome = strip(a.outcome)
  }
  return parsed
}
