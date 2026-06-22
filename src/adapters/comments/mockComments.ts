import type { ChannelId, TrafficRow } from '../../domain/types'

export type Sentiment = 'positive' | 'neutral' | 'negative'

/** The social surface a comment was ingested from. */
export type Platform =
  | 'Meta'
  | 'TikTok'
  | 'LinkedIn'
  | 'YouTube'
  | 'X'
  | 'Pinterest'
  | 'Reddit'
  | 'Snapchat'
  | 'Other'

/** What Clay returns when an intent comment is routed for enrichment. */
export interface Enrichment {
  company: string
  title: string
  fit: number
}

export interface Comment {
  id: string
  author: string
  text: string
  ts: number
  likes: number
  replies: number
  sentiment: Sentiment
  /** Which platform this was ingested from. */
  platform: Platform
  /** Likely needs a reply — a question, a complaint, or high engagement. */
  needsResponse: boolean
  /** Shows buying intent — a candidate to route to Clay, then Attio. */
  intent: boolean
  /** Enriched via Clay (company / title / fit). */
  clayRouted?: boolean
  enrichment?: Enrichment
  /** Has been routed to Attio as a contact. */
  routed?: boolean
}

/** Map a channel to the platform its comments come from. */
export function commentPlatform(channel: ChannelId): Platform {
  if (channel === 'meta-ads' || channel === 'instagram' || channel === 'facebook') return 'Meta'
  if (channel === 'tiktok-ads' || channel === 'tiktok') return 'TikTok'
  if (channel === 'linkedin-ads' || channel === 'linkedin') return 'LinkedIn'
  if (channel === 'youtube-ads' || channel === 'youtube') return 'YouTube'
  if (channel === 'x-ads' || channel === 'x') return 'X'
  if (channel === 'pinterest-ads' || channel === 'pinterest') return 'Pinterest'
  if (channel === 'reddit-ads') return 'Reddit'
  if (channel === 'snapchat-ads') return 'Snapchat'
  return 'Other'
}

const COMPANIES = [
  'Northwind Ops',
  'Vertex Labs',
  'Cedar Systems',
  'Lumen Retail',
  'Atlas Freight',
  'Bright Health Co',
  'Orbit Software',
  'Mason Industrial',
]
const TITLES = ['VP Operations', 'Head of RevOps', 'Director of Ops', 'COO', 'Ops Manager', 'Head of Growth']

/** Deterministic mock enrichment — stands in for a Clay lookup on the commenter. */
export function enrichCommenter(comment: Comment): Enrichment {
  const seed = [...comment.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return {
    company: COMPANIES[seed % COMPANIES.length],
    title: TITLES[(seed >> 2) % TITLES.length],
    fit: 60 + (seed % 40),
  }
}

/** Read-only ingest from a platform. Mock; swap for Meta/TikTok/LinkedIn APIs. */
export interface CommentSource {
  fetch(row: TrafficRow): Promise<Comment[]>
}

const NAMES = ['Dana Reyes', 'Sam Ito', 'Priya Shah', 'Marco Diaz', 'Lee Park', 'Ana Costa', 'Tom Vance', 'Riya Nair']

const POOL: { text: string; sentiment: Sentiment; intent: boolean; needsResponse: boolean }[] = [
  { text: 'This looks great, exactly what our ops team has been missing.', sentiment: 'positive', intent: false, needsResponse: false },
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
      platform: commentPlatform(row.channel),
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
