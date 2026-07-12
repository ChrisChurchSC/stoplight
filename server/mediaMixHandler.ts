import Anthropic from '@anthropic-ai/sdk'

/**
 * Server-side "Generate a media mix with Claude". Runs ONLY on the dev server /
 * a serverless function so the Anthropic key stays private. Throws NO_KEY when
 * ANTHROPIC_API_KEY is unset so the client falls back to the deterministic
 * heuristic plan. Mirrors server/askHandler.ts.
 *
 * Claude reads the brand's real Summer per-channel performance and the tool's
 * deterministic baseline split, then returns a strategic plan. It only interprets
 * numbers the app computed, so the recommendation is always grounded in real data.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    goal: { type: 'string', enum: ['reach', 'engagement', 'conversions'] },
    risk: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'] },
    channels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          channel: { type: 'string' },
          label: { type: 'string' },
          sharePct: { type: 'number' },
          rationale: { type: 'string' },
        },
        required: ['channel', 'label', 'sharePct', 'rationale'],
      },
    },
  },
  required: ['summary', 'goal', 'risk', 'channels'],
} as const

const SYSTEM = `You are a media planner working inside ItsyBitsy. You are given a brand's REAL measured per-channel performance (reach, engagement rate, post count) drawn from its analytics, plus the tool's deterministic baseline budget split, a goal, a budget, and a risk appetite.
Recommend how to split the budget across channels.
Rules:
- Use ONLY the channel ids and labels present in the provided data. Never invent a channel or a number.
- Return a share (sharePct, 0-100) per recommended channel; the shares should sum to about 100. Drop channels that do not earn a place.
- Lean budget toward channels the brand already wins on organically (higher real reach / engagement), tempered by the goal and risk: conservative concentrates on proven channels, aggressive bets more on scalable paid channels.
- Give each channel a one-sentence rationale that quotes the brand's real numbers.
- Write "summary" in short Markdown: one lead sentence, then a couple of bold facts or bullets. Keep it tight.
- Do not use em dashes anywhere.
Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runMediaMix(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { context } = (body ?? {}) as { context?: unknown }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Brand data (the only facts you may use):\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
