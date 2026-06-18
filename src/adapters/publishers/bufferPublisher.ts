import { messagingAllText } from '../../domain/messaging'
import type { ChannelId, TrafficRow } from '../../domain/types'
import type { Publisher, PublishResult } from './types'

/**
 * Real organic-social publisher: POSTs the row to the server-side
 * /api/publish endpoint (which calls Buffer). Falls back to the supplied
 * publisher (the mock) when the backend is absent, has no Buffer token (501),
 * or errors — so Publish always works, configured or not. Same seam pattern as
 * ClaudeIcpReviewer.
 */
export class BufferPublisher implements Publisher {
  constructor(
    public channel: ChannelId,
    private fallback: Publisher,
  ) {}

  validate(row: TrafficRow): { ok: boolean; warnings: string[] } {
    return this.fallback.validate(row)
  }

  async publish(row: TrafficRow): Promise<PublishResult> {
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel: this.channel,
          text: messagingAllText(row),
          scheduledAt: row.scheduledAt,
          assetName: row.assetName,
          mediaType: row.mediaType,
          mediaUrl: row.mediaRef,
        }),
      })
      if (!res.ok) throw new Error(`publish ${res.status}`)
      return (await res.json()) as PublishResult
    } catch {
      // No backend / no Buffer token / error → mock keeps Publish working.
      return this.fallback.publish(row)
    }
  }
}
