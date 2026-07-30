import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * DESCRIBE THE DATA YOU WISH YOU HAD, AND GET ITS SHAPE.
 *
 * The last resort of the four Data source routes, and the only one that produces numbers nobody
 * measured. It exists because planning a campaign stalls without something to point at: you cannot
 * decide what to write about "open rate by segment" until you can see what that table would even
 * look like.
 *
 * WHAT IT IS FOR: the SHAPE. Columns, granularity, the row count a real export would have, plausible
 * ranges. That is what tells you whether the metric is worth wiring in at all.
 *
 * WHAT IT IS NOT FOR: evidence. Every figure it returns is invented, and the app marks the data set
 * `source.kind === 'composite'` so nothing downstream can mistake it for measurement. This handler
 * therefore does two things people usually skip:
 *
 *   1. It returns a `caveat` in the model's own words, so the UI has something specific to show
 *      rather than a generic warning nobody reads.
 *   2. It is told to keep figures ROUND. A composite row reading "1,247 sessions" invites belief in
 *      a way "~1,200" does not, and the difference costs nothing when the point is the shape.
 *
 * Sibling of fill-card: same job of turning a sentence into structure, different output.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    columns: { type: 'array', items: { type: 'string' } },
    rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    caveat: { type: 'string' },
  },
  required: ['name', 'columns', 'rows', 'caveat'],
} as const

const SYSTEM = `You sketch the SHAPE of a data set a marketer describes, so they can decide whether it is worth wiring up real data for.

WHAT YOU RETURN
- "name": a short name a person would file this under, in sentence case with spaces. "Open rate by segment", not "email_open_rate_by_segment" and not "Sample Data". No date, no "sample", no "mock".
- "columns": the columns a real export of this would have. Put the dimension first (date, page, segment), then the measures. Between three and six columns; more than six is a report, not a data set.
- "rows": eight to twelve rows, each the same length as columns.
- "caveat": one sentence, addressed to the user, saying what is illustrative here and what they should replace with real data. Be specific about which columns are invented rather than saying "this is sample data".

RULES
- EVERY FIGURE YOU RETURN IS INVENTED, and the user will be told so. Act accordingly.
- Keep numbers ROUND. "1,200" not "1,247". "12%" not "11.8%". A precise-looking figure invites belief it has not earned, and the point here is the shape, not the value.
- Make the SHAPE right and realistic: sensible granularity, plausible ranges for the industry, dates in ISO form, a believable spread rather than every row the same.
- Any dates must fall in the period the user asked for, counted back from TODAY'S DATE as given below. A sketch dated two years ago is useless for planning next month.
- Never use an em dash or an en dash. Use a comma, a colon or a full stop.
- Never invent a named third party, a real customer, or a competitor's numbers. Use generic labels.
- If the description names a platform you know the export format of, match its real column names.
- Return values as strings, including numbers, since the grid holds text.`

export async function runComposeDataset(body: unknown): Promise<unknown> {
  const { prompt, brand } = (body ?? {}) as { prompt?: unknown; brand?: unknown }
  const said = typeof prompt === 'string' ? prompt.trim() : ''
  if (!said) return { name: '', columns: [], rows: [], caveat: '' }

  const ctx = brand && typeof brand === 'object' ? JSON.stringify(brand).slice(0, 800) : ''
  // The model has no clock, and without this it dates "the last six months" from its training data:
  // the first sketch came back covering 2024 for a request made in 2026.
  const today = new Date().toISOString().slice(0, 10)
  const userContent = `TODAY'S DATE: ${today}

THE DATA THEY WISH THEY HAD:
${said.slice(0, 1200)}

${ctx ? `THE BRAND THIS SITS UNDER (context only):\n${ctx}\n` : ''}
Sketch the shape of that table.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const parsed = JSON.parse(block && block.type === 'text' ? block.text : '{}') as {
    name?: unknown
    columns?: unknown
    rows?: unknown
    caveat?: unknown
  }

  // Normalised rather than trusted: a ragged grid renders as a broken sheet, and the model is being
  // asked for a rectangle it has to count to get right.
  const columns = Array.isArray(parsed.columns)
    ? parsed.columns.filter((c): c is string => typeof c === 'string').map((c) => c.trim().slice(0, 60)).slice(0, 8)
    : []
  if (!columns.length) return { name: '', columns: [], rows: [], caveat: '' }

  const rows = Array.isArray(parsed.rows)
    ? parsed.rows
        .filter((r): r is unknown[] => Array.isArray(r))
        .slice(0, 40)
        .map((r) =>
          Array.from({ length: columns.length }, (_, i) => {
            const v = r[i]
            return typeof v === 'string' ? v.trim().slice(0, 200) : typeof v === 'number' ? String(v) : ''
          }),
        )
    : []

  // The app forbids em dashes in prose and the model reaches for them regardless of instruction.
  // Applied to the two free-text fields only; column headers are labels, not prose.
  const noDash = (v: string) => v.replace(/\s*[—–]\s*/g, ', ').trim()

  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? noDash(parsed.name).slice(0, 80) : 'Sketched data set',
    columns,
    rows,
    caveat: typeof parsed.caveat === 'string' ? noDash(parsed.caveat).slice(0, 400) : '',
  }
}
