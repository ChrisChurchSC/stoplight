import type { ChannelId, TrafficRow } from '../../domain/types'

export interface PublishResult {
  ok: boolean
  /** Platform-side id of the created post/draft, when available. */
  externalId?: string
  /** Where the staged/posted item lives, if the platform returns a URL. */
  url?: string
  error?: string
}

/**
 * Option-B seam: the thing that actually pushes a row to a platform.
 *
 * In v1 every channel uses MockPublisher (no network). Phase 2 swaps in real
 * clients — MetaPublisher, TikTokPublisher, LinkedInPublisher, EspPublisher,
 * CmsPublisher — each implementing this same interface with real OAuth, media
 * upload, and platform specs. The store/UI never change.
 *
 * Note: in v1 the approval gate stages rows in the sheet and does NOT call
 * publish() automatically. publish() exists so the staged → posted step is a
 * single, well-defined call when real integrations land.
 */
export interface Publisher {
  channel: ChannelId
  /** Validate a row against platform constraints before staging/posting. */
  validate(row: TrafficRow): { ok: boolean; warnings: string[] }
  /** Push the row to the platform (or its review queue). */
  publish(row: TrafficRow): Promise<PublishResult>
}

export type PublisherRegistry = Partial<Record<ChannelId, Publisher>>
