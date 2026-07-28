import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * DESCRIBE A CARD IN A SENTENCE AND HAVE ITS FIELDS FILLED IN.
 *
 * The sibling of scan-site: same job, different source. A URL works when the thing already exists on
 * the web; a prompt works for the audience you have in your head, the persona you are inventing, or
 * the product that has not shipped. Between them they cover how a card actually gets started, which
 * until now was a dozen empty dropdowns.
 *
 * THE ENUM PROBLEM, which is the whole reason this is not just a free-text call. Half these fields
 * are closed pick-lists, and a value that is nearly right is worse than nothing: "35-44" against a
 * list holding "35–44" leaves the field looking filled while matching no option, and the next reader
 * cannot tell why. So the CLIENT sends its real option lists and this builds them into the schema as
 * enums. The model cannot return a value the dropdown does not have.
 *
 * Everything else follows scan-site's rules: propose only what the description supports, omit rather
 * than invent, and the client fills empty fields only so nothing a person wrote is overwritten.
 */

/** A field the model may fill: free text, a list, or a closed choice. */
interface FieldSpec {
  key: string
  /** What it means, in the model's terms. */
  brief: string
  kind?: 'text' | 'list'
  /** When present the value MUST be one of these, verbatim. */
  options?: string[]
}

const SYSTEM = `You fill in one card from a short description a marketer typed.

WHAT YOU ARE DOING. Turning "a busy dentist who works weekends" into the fields a card holds, staying inside what the description supports and what you can reasonably say about that kind of subject. You are not researching a real company or a real person.

RULES
- Fill only fields the description gives you something for. OMIT the rest. An empty field is honest; a plausible invention is not, because everything you return is treated from here on as something the user asserted.
- For a field with allowed values, return one of them EXACTLY as given. Never a near miss, never your own wording.
- Write in the voice each field asks for. A pain is the person's own complaint, not a benefit.
- Keep values short: a phrase or one sentence.
- Where the description implies a person or an audience, write as they would talk, not as a marketer would describe them.
- Never invent a statistic, a price, a named competitor, or a claim about a real organisation.
- No em dashes.

Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runFillCard(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { kind, prompt, fields, brandContext } = (body ?? {}) as {
    kind?: string
    prompt?: string
    fields?: FieldSpec[]
    brandContext?: Record<string, unknown>
  }
  const said = String(prompt ?? '').trim()
  if (!said) throw new Error('Nothing to go on')
  const specs = (fields ?? []).filter((f) => f && typeof f.key === 'string' && typeof f.brief === 'string').slice(0, 30)
  if (!specs.length) throw new Error('No fields to fill')

  // The schema is built from the CLIENT's real option lists, so a closed field can only come back
  // holding a value the dropdown actually offers.
  const properties: Record<string, unknown> = {}
  for (const f of specs) {
    if (f.options?.length) {
      const opts = f.options.filter((o) => typeof o === 'string').slice(0, 80)
      properties[f.key] = f.kind === 'list'
        ? { type: 'array', items: { type: 'string', enum: opts }, description: f.brief }
        : { type: 'string', enum: opts, description: f.brief }
    } else {
      properties[f.key] = f.kind === 'list'
        ? { type: 'array', items: { type: 'string' }, description: f.brief }
        : { type: 'string', description: f.brief }
    }
  }
  const schema = { type: 'object', additionalProperties: false, properties, required: [] as string[] }

  const fieldBlock = specs
    .map((f) => `- ${f.key}: ${f.brief}${f.options?.length ? `\n    ALLOWED VALUES (use one verbatim): ${f.options.join(' | ')}` : ''}`)
    .join('\n')

  const ctx = Object.entries(brandContext ?? {})
    .filter(([, v]) => (Array.isArray(v) ? v.length : String(v ?? '').trim()))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : v}`)
    .join('\n')

  const userContent = `CARD TYPE: ${kind ?? 'record'}

WHAT THE USER TYPED:
${said.slice(0, 1200)}

${ctx ? `THE BRAND THIS SITS UNDER (context only, do not contradict it):\n${ctx}\n` : ''}
FIELDS YOU MAY FILL:
${fieldBlock}

Fill only what the description supports. Omit the rest.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    max_tokens: 1500,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const parsed = JSON.parse(block && block.type === 'text' ? block.text : '{}') as Record<string, unknown>

  // Belt and braces on the enums: a schema violation should be dropped rather than written to a
  // record, since a value no dropdown holds is invisible to every later reader.
  const byKey = new Map(specs.map((f) => [f.key, f]))
  const out: Record<string, unknown> = {}
  /**
   * Em dashes are forbidden in this app's PROSE, and the model reaches for them. But an enum value
   * is not prose: AGE_RANGES holds "35–44" with an en dash, and rewriting that to "35, 44" made the
   * value fail its own allow-list and get dropped. So the strip applies to free text only, and a
   * closed field is passed through exactly as the list defines it.
   */
  const strip = (v: string) => v.replace(/\s*[—–]\s*/g, ', ').trim()
  for (const [k, v] of Object.entries(parsed)) {
    const spec = byKey.get(k)
    if (!spec) continue
    const closed = !!spec.options?.length
    const norm = (x: string) => (closed ? x.trim() : strip(x))
    if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === 'string').map(norm)
        .filter((x) => (closed ? spec.options!.includes(x) : x.length > 1))
      if (list.length) out[k] = list
    } else if (typeof v === 'string') {
      const s = norm(v)
      if (!s) continue
      if (closed && !spec.options!.includes(s)) continue
      out[k] = s
    }
  }
  return { fields: out, filled: Object.keys(out).length }
}
