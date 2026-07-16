import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side "Ask Claude". Runs ONLY on the dev server / a serverless function,
 * never in the browser, so the Anthropic key stays private. Throws NO_KEY when
 * ANTHROPIC_API_KEY is unset so the client falls back to the heuristic answerer.
 * Mirrors server/icpReviewHandler.ts.
 *
 * Claude classifies the question and narrates an answer, but ONLY from the
 * precomputed findings handed to it: the app owns the math, so the numbers are
 * always real and identical key-or-not.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['connection', 'what-worked', 'help'] },
    answer: { type: 'string' },
  },
  required: ['intent', 'answer'],
} as const

const SYSTEM = `You are Claude, the marketing assistant inside Breadcrumbs, a marketing infrastructure and automation platform that turns one brand strategy into on-brand, personalized campaigns for every audience and channel. Act like a sharp marketing partner who knows the user's brand and helps them think, plan, and get things done.

You are given the user's question plus CONTEXT about their workspace:
- brand: the brand's name, one-liner, positioning, industry, its audiences, and its foundation (messages, voices, proof points). This may be sparse or empty early on.
- connection: a coherence check on the campaign in scope (breaks in the thread, by axis) — only meaningful once there are assets.
- performance: an attributed-revenue rollup (by proof point, channel, stage) — only meaningful once campaigns are live.

How to answer:
- Be genuinely useful. Answer the actual question with concrete, specific marketing guidance, drawing on the brand context AND your own marketing expertise. Do NOT refuse or stall just because there's no campaign data yet.
- Use the context when it helps: ground brand-specific advice in their positioning, audiences, and proof points; cite real performance numbers when they exist.
- When the workspace is early or empty, move them forward: give a real answer, then suggest the best next step (define audiences, draft messages, add proof points, draft a flow) instead of listing what's missing.
- If they ask you to DO something the chat can actually take action on, answer briefly and tell them the exact phrase, then STOP suggesting it once done:
  - add or build out audiences/personas -> say "add audiences"
  - add or write proof points -> say "draft proof points"
  - build a campaign -> say "draft a flow"
  - set up a brand-new brand from scratch -> say "get started"
  Do not tell them to "get started" for adding audiences or proof points (that restarts brand setup); use the specific phrase above.
- Classify intent as "connection" (coherence/on-brand/what's broken), "what-worked" (performance/revenue/ROAS), or "help" (everything else, including strategy, setup, and how-to). Most general questions are "help".
- Format in Markdown: lead with a one-line answer, then short sections (## Header) or bullets only if they earn their place. Match length to the question; a simple question gets a sentence or two.
- One hard rule: never invent, round, or estimate a specific METRIC (revenue, ROAS, counts, dates) that isn't in the context. Qualitative marketing advice from your expertise is welcome; fabricated numbers are not.
- Do not use em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runAsk(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey && !process.env.OPENROUTER_API_KEY) throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { context, model } = (body ?? {}) as { context?: { question?: string }; model?: string }
  // The app's model selector can override the tier default; 'auto'/empty keeps the env-based default.
  const client = makeModelClient('agent', typeof model === 'string' && model && model !== 'auto' ? model : undefined)

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2400,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `The user asked:\n${context?.question ?? ''}\n\nContext about their workspace (use where relevant; the brand/foundation may be sparse early on, and connection/performance are only meaningful once there are live campaigns). Do not fabricate any metric that isn't here:\n${JSON.stringify(context, null, 2)}\n\nAnswer helpfully, per your instructions.`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { intent?: string; answer?: string }
  // Guarantee the no-em-dashes house style even if the model slips: swap em/en dashes for a comma.
  if (typeof parsed.answer === 'string') parsed.answer = parsed.answer.replace(/\s*[—–]\s*/g, ', ')
  return parsed
}
