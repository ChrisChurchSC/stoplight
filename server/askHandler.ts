import Anthropic from '@anthropic-ai/sdk'

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

const SYSTEM = `You are Claude working inside Hyperfocus, a media-trafficking tool whose core promise is campaign COHERENCE (every asset telling one story), not vanity metrics.
You are given a user's question and PRECOMPUTED findings about the campaign in scope: a connection check (breaks in the thread, by axis) and a performance rollup (attributed revenue by proof point, channel, and stage).
Do two things:
1. Classify the question into exactly one intent: "connection" (is it coherent, what's broken, off-brand, or unproven), "what-worked" (what's performing, driving revenue, ROAS), or "help" (anything else, or a request you can't answer from the findings).
2. Write a direct 2 to 4 sentence answer, grounded ONLY in the findings provided. Never invent, round, or estimate a number that isn't in the findings. If the findings are empty for what they ask, say so plainly instead of guessing.
Lead with the answer, no preamble. Be specific and quote the real numbers and labels. Do not use em dashes anywhere. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runAsk(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { context } = (body ?? {}) as { context?: { question?: string } }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1200,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Question: ${context?.question ?? ''}\n\nFindings (the only facts you may use):\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
