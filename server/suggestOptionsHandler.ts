import Anthropic from '@anthropic-ai/sdk'
import { makeModelClient } from './modelClient.js'

/**
 * OPTIONS FOR ONE FIELD, proposed for one brand.
 *
 * The shipped starter vocabularies are general by design, and general is exactly what a specific
 * brand does not need: a marine weather app and a dental practice get the same ten pains, and both
 * lists are half wrong. Rather than keep guessing at broader lists, this asks for candidates for the
 * ONE field in front of the user, given what the brand has already written down.
 *
 * WHAT MAKES THIS SAFE. The whole app works on a rule: a value that reaches the copy writer is one
 * the user asserted. So these are PROPOSALS, never values. They are returned to the picker, shown
 * under their own heading, and thrown away when it closes. Choosing one is the act of asserting it,
 * exactly as typing it would be. Nothing is written to a record on the way through, and nothing is
 * persisted server-side.
 *
 * It is also told, hard, not to invent facts. A suggestion is a plausible way of PHRASING something
 * for this kind of brand, not a claim about this brand's customers. The distinction matters because
 * a fabricated pain the user clicks past looks identical to one they researched.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'Between 6 and 10 candidate values for the field.',
    },
  },
  required: ['options'],
} as const

/** What each field is, in the model's terms. Keeps the prompt honest about what is being asked for. */
const FIELD_BRIEF: Record<string, string> = {
  pains: 'PAINS: what is wrong in this audience\'s life today, in their words. Not what the brand fixes, what they feel. Short phrases, lower case.',
  goals: 'WANTS: what good looks like to this audience. The positive counterpart to a pain, not a product benefit. Short phrases, lower case.',
  objections: 'OBJECTIONS: what this audience already believes AGAINST the brand, phrased as their own thought ("I can do this myself"), not as a category.',
  antiMessage: 'ANTI-MESSAGE: the sentence that would lose this audience. What a well-meaning marketer might say that lands badly with these particular people.',
  triggers: 'TRIGGERS: why NOW rather than eventually. The event or change that makes this audience start looking. Short phrases, lower case.',
  definition: 'DEFINITION: a one-line description of a specific sub-segment, sharper than a job title or a demographic. Each option should be a different plausible sub-segment for this brand.',
  messageAngle: 'ANGLE: how the promise is framed for this audience. One sentence, the through-line connecting what the brand does to what these people care about.',
  occupation: 'OCCUPATIONS: jobs the people this brand sells to plausibly do. Real occupation names, title case.',
  hobbies: 'INTERESTS: what these people do outside work. Short noun phrases, title case.',
  signal: 'TRIGGER SIGNAL: the event or condition that fires an automation for this brand. Concrete and observable, lower case.',
}

const SYSTEM = `You propose candidate values for ONE field on ONE record, for a specific brand, so the user has something relevant to pick from instead of a generic list.

WHAT YOU ARE NOT DOING. You are not researching this brand's customers and you are not stating facts about them. You are proposing how a marketer at this kind of brand might PHRASE this field. The user will read every option and choose, and an option they do not choose costs nothing. An option they DO choose is treated from then on as something they asserted, which is why a confident-sounding fabrication is the one thing that must not appear.

RULES
- Return 6 to 10 options. Fewer good ones beats padding to ten.
- Each option stands alone and is short: a phrase or one sentence, not a paragraph.
- Write in the voice the field asks for. A pain is the person's own complaint, not a benefit statement.
- Make them DIFFERENT from each other. Ten rewordings of one idea is one option.
- Use the brand's own vocabulary where it was given to you, and never contradict it.
- Never invent a statistic, a named competitor, a price, a claim about what the brand does, or a fact about a real person.
- The brand NAME may be evocative. Never infer the product from it.
- Do not repeat anything in "already recorded" — the user has those.
- Plain language. No marketing jargon, no em dashes anywhere.
- If you have too little to go on, return fewer options rather than generic filler. An honest three beats a padded ten.

Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runSuggestOptions(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { field, brand, oneLiner, positioning, mission, products, industry, differentiators, voice, audienceName, audienceRole, already, note } =
    (body ?? {}) as {
      field?: string
      brand?: string
      oneLiner?: string
      positioning?: string
      mission?: string
      products?: string[]
      industry?: string
      differentiators?: string[]
      voice?: string
      audienceName?: string
      audienceRole?: string
      already?: string[]
      note?: string
    }

  const key = String(field ?? '')
  const brief = FIELD_BRIEF[key]
  if (!brief) throw new Error(`Unknown field: ${key}`)

  // Sanitized rather than trusted: user-authored free text going into a prompt.

  const list = (v: unknown, cap: number): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, cap) : []

  const userContent = `FIELD TO PROPOSE VALUES FOR
${brief}

THE BRAND (do not infer the product from the name)
Name: ${brand || '(none)'}
One-liner: ${oneLiner || '(none)'}
What it sells: ${list(products, 8).join('; ') || '(none)'}
The position it owns: ${positioning || '(none)'}
Mission: ${mission || '(none)'}
Industry: ${industry || '(none)'}
What makes it different: ${list(differentiators, 8).join('; ') || '(none)'}
Voice: ${voice || '(none)'}

THE AUDIENCE THIS FIELD BELONGS TO
Name: ${audienceName || '(unnamed)'}
Role or description: ${audienceRole || '(none)'}

ALREADY RECORDED for this field (do NOT repeat these, and do not contradict them):
${list(already, 20).join('\n') || '(nothing yet)'}
${note?.trim() ? `\nTHE USER ADDED THIS INSTRUCTION, follow it:\n${note.trim().slice(0, 400)}` : ''}

Propose 6 to 10 candidate values.`

  const client = makeModelClient('copy')
  const message = await client.messages.create({
    max_tokens: 1200,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  const parsed = JSON.parse(text) as { options?: string[] }
  const seen = new Set(list(already, 50).map((a) => a.toLowerCase()))
  const options = (parsed.options ?? [])
    .filter((o): o is string => typeof o === 'string')
    // Em dashes are forbidden in this app's copy, and the model reaches for them.
    .map((o) => o.replace(/\s*[—–]\s*/g, ', ').trim())
    .filter((o) => o.length > 1 && !seen.has(o.toLowerCase()))
    .slice(0, 10)

  return { options }
}
