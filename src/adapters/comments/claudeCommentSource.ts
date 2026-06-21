import type { TrafficRow } from '../../domain/types'
import { claudeAgent } from '../agent/claudeAgent'
import { commentPlatform, type Comment, type Platform, type Sentiment } from './mockComments'

/**
 * Ingest comments "via Claude": the engine calls ingest_comments once per posted
 * asset (the tool wraps the platform's comments API), and we collect the results
 * into the inbox shape. Returns live:false when the engine is unavailable (no
 * Anthropic key) so the caller falls back to the mock source. This is what makes
 * "Claude reads the comments" a literal tool call into each channel.
 */

interface RawComment {
  id?: string
  author?: string
  text?: string
  platform?: string
  likes?: number
  replies?: number
  sentiment?: string
  intent?: boolean
  needsResponse?: boolean
}

export async function ingestCommentsViaClaude(
  rows: TrafficRow[],
): Promise<{ map: Record<string, Comment[]>; live: boolean }> {
  if (rows.length === 0) return { map: {}, live: false }

  const postedAssets = rows.map((r) => ({
    assetId: r.id,
    assetName: r.assetName,
    channel: r.channel,
    platform: commentPlatform(r.channel),
  }))

  const { actions, live } = await claudeAgent(
    'Ingest the latest comments for each posted asset by calling ingest_comments once per asset. Do not publish anything. Then summarize what you pulled.',
    { postedAssets },
  )
  if (!live) return { map: {}, live: false }

  const map: Record<string, Comment[]> = {}
  const now = Date.now()
  for (const a of actions) {
    if (a.tool !== 'ingest_comments') continue
    const out = a.output as { assetId?: string; platform?: string; comments?: RawComment[] }
    if (!out?.assetId || !Array.isArray(out.comments)) continue
    map[out.assetId] = out.comments.map((c, i) => ({
      id: c.id ?? `${out.assetId}_c${i}`,
      author: c.author ?? 'Someone',
      text: c.text ?? '',
      ts: now - (i + 1) * 3_600_000,
      likes: c.likes ?? 0,
      replies: c.replies ?? 0,
      sentiment: (c.sentiment as Sentiment) ?? 'neutral',
      platform: (c.platform ?? out.platform ?? 'Other') as Platform,
      needsResponse: !!c.needsResponse,
      intent: !!c.intent,
    }))
  }
  return { map, live: true }
}
