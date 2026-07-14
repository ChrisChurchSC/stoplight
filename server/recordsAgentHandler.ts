import Anthropic from '@anthropic-ai/sdk'

/**
 * Server-side records-table agent. Runs ONLY on the dev server / a serverless function so the
 * Anthropic key stays private. Throws NO_KEY when ANTHROPIC_API_KEY is unset so the client falls
 * back to the offline (advice-only) heuristic. Mirrors server/flowAgentHandler.ts.
 *
 * Claude reads the record snapshot (the type's fields + the current rows for the brand) and the
 * user's message, then returns a short reply AND a list of structured commands. The app validates
 * and applies them, so the model decides intent but never mutates state directly.
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
          op: { type: 'string', enum: ['add', 'update', 'delete', 'bulkSet'] },
          fields: { type: 'object', additionalProperties: { type: 'string' } },
          match: { type: 'string' },
          set: { type: 'object', additionalProperties: { type: 'string' } },
          where: {
            type: ['object', 'null'],
            additionalProperties: false,
            properties: {
              field: { type: 'string' },
              equals: { type: 'string' },
              empty: { type: 'boolean' },
            },
          },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'commands'],
} as const

const SYSTEM = `You are the AI assistant inside Hyperfocus, a marketing tool, embedded on a Records table (a lightweight CRM/database of companies, people, messages, objectives, segments, or proof points). You are given the record type in view, its editable fields, the current rows for the active brand, and the user's message.

Do two things:
1. Write a short, friendly "reply" in light Markdown. Lead with what you did (or a question if the request is ambiguous). Keep it tight. When you take actions, summarize them as a bullet list with check marks, e.g. "- ✓ Added company Salt Strong".
2. Return a "commands" array the app will apply, in order. Use ONLY these ops:
   - add {fields}: create a new record. "fields" is a map of field-key to value; always include "name". Only use field keys from the provided fields list. For status/ref fields, use one of the listed options.
   - update {match, set}: edit one record. "match" is the record name (exact, else a contained substring). "set" is a map of field-key to new value.
   - delete {match}: delete the record whose name matches.
   - bulkSet {where, set}: set fields on many records at once. "where" narrows the set: {field, equals} matches rows whose field equals a value, {field, empty:true} matches rows where that field is blank, or null for ALL rows. "set" is the field-key to value map to apply.

Rules:
- The context has an "intent". When intent is "analyze", you are READ-ONLY: answer the user's question about the records with insight (counts, gaps, summaries, suggestions) and return an EMPTY commands array. When intent is "build", you may return edit commands.
- Only use field keys that appear in the provided "fields" list, and for status/ref fields only their listed options. Never invent field keys or values.
- Match records only by names that appear in the provided rows. If the user references a record you can't find, say so and make no edit for it.
- Prefer bulkSet for "set X on all/every/these rows" requests instead of many update commands.
- If a request is destructive and broad (e.g. "delete everything"), ask for confirmation and return no commands.
- If a request is unclear, ask a brief question and return no commands.
- Do not use em dashes anywhere.
Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runRecordsAgent(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { context } = (body ?? {}) as { context?: unknown }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: COMMAND_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Record type + rows + fields (the only fields/rows you may use):\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
