import Anthropic from '@anthropic-ai/sdk'

/**
 * Server-side copy generation for ONE personalization-matrix cell — a single
 * audience, at one journey stage, on one channel. Runs only on the dev server /
 * a serverless function so the Anthropic key stays private. Throws NO_KEY when
 * unset (→ 501) so the client falls back to the deterministic composer. Mirrors
 * server/copyDraftHandler.ts.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    components: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
      },
    },
  },
  required: ['components'],
} as const

const SYSTEM = `You are a senior copywriter producing ONE personalized asset: a single audience, at one journey stage, on one channel.
Write copy for EVERY component you are given, using the EXACT "key" values.
- Ground every line in THIS audience: their angle, what they care about, and their outcome. Speak to this one buyer, not a generic reader. A different audience would get different copy.
- Lead with the proof point you are given; turn it into a concrete, specific claim. If no proof is given, make no claim you cannot back up.
- Ladder toward the CTA: the primary copy should make the reader want to take it, and the CTA field should match the promise the copy makes.
- Respect each component's character limit. Headlines and short fields are tight; primary text and body can breathe. CTA fields are short action labels, not sentences.
- Write in the brand voice if one is given. Never use em dashes.
This asset will be run through a coherence check (claims must be backed by the proof, the CTA must cash the promise, the voice must hold), so write copy that already passes it. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runDraftCell(body: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new NoKeyError('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { client: brand, audience, stage, channel, components, proof, cta, voice } = (body ?? {}) as {
    client?: string
    audience?: unknown
    stage?: { label?: string; intent?: string }
    channel?: { label?: string; format?: string }
    components?: unknown
    proof?: { label?: string; detail?: string } | null
    cta?: string
    voice?: string
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Brand: ${String(brand ?? '')}\nBrand voice: ${voice ? String(voice) : '(none given — write clean, specific, on-message)'}\n\nAudience:\n${JSON.stringify(audience, null, 2)}\n\nJourney stage: ${stage?.label ?? ''} — ${stage?.intent ?? ''}\nChannel: ${channel?.label ?? ''} (${channel?.format ?? ''})\nCTA to drive to: ${String(cta ?? '')}\nLead proof point: ${proof ? `${proof.label} — ${proof.detail}` : '(none — make no unbacked claim)'}\n\nComponents to write (use these exact keys, respect the limits):\n${JSON.stringify(components, null, 2)}\n\nReturn the components.`,
      },
    ],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
