import type { TrafficRow } from '../../domain/types'

export type Sentiment = 'positive' | 'neutral' | 'negative'

export interface Comment {
  id: string
  author: string
  text: string
  ts: number
  likes: number
  replies: number
  sentiment: Sentiment
  /** Likely needs a reply — a question, a complaint, or high engagement. */
  needsResponse: boolean
  /** Shows buying intent — a candidate to route to Attio. */
  intent: boolean
  /** Has been routed to Attio as a contact. */
  routed?: boolean
}

/** Read-only ingest from a platform. Mock; swap for Meta/TikTok/LinkedIn APIs. */
export interface CommentSource {
  fetch(row: TrafficRow): Promise<Comment[]>
}

const NAMES = ['Dana Reyes', 'Sam Ito', 'Priya Shah', 'Marco Diaz', 'Lee Park', 'Ana Costa', 'Tom Vance', 'Riya Nair']

const POOL: { text: string; sentiment: Sentiment; intent: boolean; needsResponse: boolean }[] = [
  { text: 'This looks great — exactly what our ops team has been missing.', sentiment: 'positive', intent: false, needsResponse: false },
  { text: 'How much is this for a 500-person team? Looking for pricing.', sentiment: 'neutral', intent: true, needsResponse: true },
  { text: 'Can we get a demo? Evaluating tools this quarter.', sentiment: 'positive', intent: true, needsResponse: true },
  { text: 'Tried it and it kept crashing for me. Not impressed.', sentiment: 'negative', intent: false, needsResponse: true },
  { text: 'Does this integrate with Salesforce?', sentiment: 'neutral', intent: false, needsResponse: true },
  { text: 'Sharing this with my whole team 🙌', sentiment: 'positive', intent: false, needsResponse: false },
  { text: 'Meh. Seen better.', sentiment: 'negative', intent: false, needsResponse: false },
  { text: 'Is there a free trial? Keen to test with my team.', sentiment: 'positive', intent: true, needsResponse: true },
]

const hash = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0)

/** Top/recent comments for a published asset (capped). Deterministic per row. */
export function mockComments(row: TrafficRow, now: number): Comment[] {
  if (row.status !== 'posted') return []
  const seed = hash(row.id)
  const count = 3 + (seed % 2) // 3–4 (cap)
  const out: Comment[] = []
  for (let i = 0; i < count; i++) {
    const t = POOL[(seed + i * 3) % POOL.length]
    out.push({
      id: `${row.id}_c${i}`,
      author: NAMES[(seed + i) % NAMES.length],
      text: t.text,
      ts: now - (i + 1) * 3_600_000 * (1 + (seed % 5)),
      likes: (seed * 7 + i * 5) % 42,
      replies: (seed + i) % 4,
      sentiment: t.sentiment,
      intent: t.intent,
      needsResponse: t.needsResponse,
    })
  }
  return out
}

export class MockCommentSource implements CommentSource {
  async fetch(row: TrafficRow): Promise<Comment[]> {
    return mockComments(row, Date.now())
  }
}

export const mockCommentSource = new MockCommentSource()
