import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "draft objectives" — given a brand's description and business objective, returns a few
 * marketing objectives (goal + metric + a target framing + timeframe). Runs only on the dev server /
 * a serverless function so the key stays private. 'copy' tier. Throws NO_KEY so the client falls back.
 */

const OBJECTIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    objectives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          metric: { type: 'string' },
          target: { type: 'string' },
          timeframe: { type: 'string' },
        },
        required: ['name', 'metric', 'target', 'timeframe'],
      },
    },
    reportingCadence: { type: 'string' },
  },
  required: ['objectives', 'reportingCadence'],
} as const

const SYSTEM = `You draft marketing OBJECTIVES for a brand, what its campaigns are trying to move and how it is measured.

Derive everything from (a) the description provided (one-liner, positioning, business objective, differentiator, industry) and (b) when provided, the brand's CURRENT TRAFFIC MIX from connected analytics, which gives real per-channel baselines. The brand NAME may be evocative or metaphorical; never infer the product from the name.

Write the requested number of objectives. Each has:
- name: the objective as a clear goal (e.g. "Grow inbound-sourced pipeline").
- metric: the primary metric it is measured by (e.g. "Inbound MQLs", "Organic Search sessions", "Attributed revenue").
- target: a sensible target. When a real baseline for the relevant metric appears in the traffic mix, anchor the target to it as a from -> to over the timeframe (e.g. "Organic Search 247 -> ~350 sessions/mo"). Use ONLY the numbers you were given; never fabricate a baseline. When there is no baseline for that metric, phrase the target as a directional goal (e.g. "Up 30% QoQ"), not a fabricated exact figure.
- timeframe: a reasonable horizon (e.g. "This quarter", "6 months").

Also set reportingCadence: one short sentence recommending WHAT to review and HOW OFTEN (e.g. "Review leading indicators weekly and revenue/pipeline objectives monthly"), fitting a team of this kind.

Rules:
- Cover different objective types: acquisition, efficiency, retention/expansion, and a leading-indicator objective.
- When a traffic mix is provided, make at least one objective grow a specific strong or underused source from its real baseline.
- Ground them in the brand's business objective and what it does.
- If EXISTING objectives are listed, write new, distinct ones.
- No em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftObjectives(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { brand, oneLiner, positioning, differentiator, businessObjective, industry, existing, count, performance } =
    (body ?? {}) as {
      brand?: string
      oneLiner?: string
      positioning?: string
      differentiator?: string
      businessObjective?: string
      industry?: string
      existing?: string[]
      count?: number
      performance?: { label?: string; reach?: number; reachUnit?: string; engagement?: number }[]
    }

  const n = typeof count === 'number' && count > 0 && count <= 6 ? count : 4
  const existingList = (existing ?? []).filter(Boolean)
  const perf = (performance ?? []).filter((p) => p && p.label)
  const perfBlock = perf.length
    ? `Current traffic mix (connected analytics, last 90 days) — real baselines to anchor targets to:\n${perf
        .map((p) => `- ${p.label}: ${p.reach ?? 0} ${p.reachUnit ?? ''}${p.engagement != null ? ` (${p.engagement} engaged)` : ''}`)
        .join('\n')}`
    : 'Current traffic mix: (no connected analytics yet — use directional targets)'

  const userContent = `Brand name (do NOT infer the product from this): ${brand ?? ''}

Description of what the brand does and wants:
One-liner: ${oneLiner || '(none)'}
Positioning: ${positioning || '(none)'}
Business objective: ${businessObjective || '(none)'}
Differentiator: ${differentiator || '(none)'}
Industry: ${industry || '(none)'}

${perfBlock}
${existingList.length ? `\nEXISTING objectives (do NOT repeat these):\n${existingList.map((e) => `- ${e}`).join('\n')}` : ''}

Draft ${n} objectives, grounded in the description and (when present) the real baselines above, not the brand name.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    max_tokens: 1400,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: OBJECTIVE_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { objectives?: Record<string, string>[]; reportingCadence?: string }
  const strip = (s: string) => (typeof s === 'string' ? s.replace(/\s*[—–]\s*/g, ', ') : s)
  for (const o of parsed.objectives ?? []) for (const k of Object.keys(o)) o[k] = strip(o[k])
  if (parsed.reportingCadence) parsed.reportingCadence = strip(parsed.reportingCadence)
  return parsed
}
