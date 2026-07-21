import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side flow-canvas agent. Runs ONLY on the dev server / a serverless function so
 * the Anthropic key stays private. Throws NO_KEY when ANTHROPIC_API_KEY is unset so the
 * client falls back to the offline (advice-only) heuristic. Mirrors server/mediaMixHandler.ts.
 *
 * Claude reads the flow snapshot + the available deliverable presets and records, then
 * returns a short reply AND a list of structured commands. The app validates and applies
 * the commands, so the model decides intent but never mutates state directly.
 */

const COMMAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: ['setName', 'setSubject', 'setBudget', 'setFlight', 'addDeliverable', 'removeDeliverable', 'setRecordTags', 'createAudience', 'build', 'regenerate'] },
          value: { type: 'string' },
          weeks: { type: 'number' },
          preset: { type: 'string' },
          perMonth: { type: 'number' },
          labels: { type: 'array', items: { type: 'string' } },
          name: { type: 'string' },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'commands'],
} as const

const SYSTEM = `You are the AI builder inside Hyperfocus, a marketing flow tool. A "flow" is a campaign made of deliverables (posts, emails, ebooks, etc.), tagged to records (companies, people, segments, media mixes), with a budget and a flight length. You are given the current flow snapshot, the deliverable presets you may add, the records you may tag, and the user's message.

Do two things:
1. Write a short, friendly "reply" in light Markdown. Lead with what you did (or a question if the request is ambiguous). Keep it tight. When you take actions, summarize them as a bullet list with check marks, e.g. "- ✓ Added Newsletter (4/month)".
2. Return a "commands" array the app will apply, in order. Use ONLY these ops:
   - setName {value}: rename the campaign (build mode only).
   - setSubject {value}: set the campaign theme/goal (what every asset's copy is written to).
   - setBudget {value}: set the total budget in dollars (a number).
   - setFlight {weeks}: set flight length in weeks.
   - addDeliverable {preset, perMonth?}: add a deliverable. "preset" MUST be one of the provided preset keys. Include perMonth for recurring deliverables.
   - removeDeliverable {preset}: remove a deliverable by preset key.
   - setRecordTags {labels}: replace the flow's record tags. Each label MUST exactly match a provided record label.
   - createAudience {name}: create a NEW placeholder audience and tag the flow to it. Use this ONLY when the campaign needs an audience that is NOT already in the provided records.segments list (for example a cold-start brand with no audiences yet). It makes a labeled placeholder the user fills in later, so pick a clear, specific name (e.g. "New homeowners", "Enterprise IT buyers") but NEVER invent persona details, ages, or demographics. Prefer tagging an existing audience via setRecordTags when a suitable one exists.
   - build: build the campaign and write copy for every asset (build mode only; do this when the user asks to build/create/generate it, after adding deliverables).
   - regenerate: rewrite the flow's asset copy (view mode only; use when the user asks to redo/refresh the copy).

Rules:
- The context has an "intent". When intent is "analyze", you are in READ-ONLY mode: answer the user's question about the flow with insight and suggestions, and return an EMPTY commands array (make no edits). When intent is "build", you may return edit commands.
- Only use preset keys and existing record labels that appear in the provided lists. Never invent preset keys or setRecordTags labels. The ONE exception is createAudience, which is how you introduce an audience that does not exist yet, use it rather than tagging an unrelated record or leaving a campaign with no audience.
- In "build" mode you are shaping a NEW flow; in "view" mode you are editing an existing one (do not setName/setFlight/build there; use regenerate to refresh copy).
- If the user asks to build a themed campaign (e.g. "a 2-week Giving Tuesday push"), set the subject, set the flight, add a sensible set of deliverables, tag the relevant records, then build.
- If a request is unclear, ask a brief question and return no commands.
- Do not use em dashes anywhere.

Adapt to the user (read these context fields; when absent or null, use your default balance):
- skillLevel: "simple" means do more of the work and ask less. From a short request, propose a COMPLETE campaign in one turn (set the subject, add a sensible set of deliverables, tag or createAudience a fitting audience, then build), pick reasonable defaults instead of asking, and keep the reply short and plain (avoid jargon like "flight" or "deliverable" unless the user used it). "advanced" means be terse and precise: propose exactly what was asked and no more, lead with the plan, and ask fewer clarifying questions. The user approves every change either way, so higher autonomy only changes what you PROPOSE, never that it auto-applies.
- marketerRole and roleStrategy: lean your vocabulary, default channels, and what you propose toward this discipline (email/lifecycle, brand/content and SEO, product/product-led growth, growth/demand-gen). This is a lean, never a lock.
Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runFlowAgent(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey && !process.env.OPENROUTER_API_KEY) throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const client = makeModelClient('agent')
  const { context } = (body ?? {}) as { context?: { message?: string; history?: unknown } }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: COMMAND_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Flow + options (the only presets/records you may use):\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
