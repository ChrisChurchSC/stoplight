import type { DraftOrigin } from './draftAudiences'
/**
 * Asks the server /api/draft-messages endpoint (Claude) to draft reusable messages (angles) for a
 * brand, with a heuristic fallback when the backend is absent, has no key (501), or errors.
 */
export interface DraftedMessage {
  name: string
  angle: string
  audience: string
  pillar: string
  stage: string
}

export interface DraftMessagesInput {
  brand: string
  oneLiner?: string
  positioning?: string
  descriptor?: string
  differentiator?: string
  businessObjective?: string
  industry?: string
  audiences?: string[]
  existing?: string[]
  count?: number
  /** The brand's real published copy + measured reach. When present, message angles are drawn from the
   *  themes and hooks the brand ACTUALLY uses, not just its description. */
  samples?: { text: string; channel?: string; reach?: number }[]
}

function heuristicMessages(input: DraftMessagesInput): DraftedMessage[] {
  const aud = input.audiences?.[0] || 'All'
  const what = input.oneLiner || input.positioning || 'what it does'
  return [
    { name: `The problem, stated plainly`, angle: `Name the pain this audience feels before you pitch anything.`, audience: aud, pillar: 'Relevance', stage: 'awareness' },
    { name: `Why ${input.brand || 'this'} is different`, angle: `Lead with the one thing only you do: ${what}.`, audience: aud, pillar: 'Differentiation', stage: 'consideration' },
    { name: `The reason to act now`, angle: `Make the cost of waiting concrete and the next step easy.`, audience: aud, pillar: 'Urgency', stage: 'conversion' },
  ]
}

export interface DraftedMessageResult { items: DraftedMessage[]; origin: DraftOrigin; status?: number }

export async function draftMessages(input: DraftMessagesInput): Promise<DraftedMessageResult> {
  try {
    const res = await fetch('/api/draft-messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`draft-messages ${res.status}`)
    const data = (await res.json()) as { messages?: DraftedMessage[] }
    const msgs = (data.messages ?? []).filter((m) => m?.name)
    if (!msgs.length) throw new Error('empty')
    return { items: msgs, origin: 'model' }
  } catch {
    return { items: heuristicMessages(input), origin: 'fallback' }
  }
}
