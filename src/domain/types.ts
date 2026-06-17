// Core domain model for Rushhour.
//
// The "sheet" is the source of truth. Each ingested asset, targeted at one
// channel, becomes one TrafficRow. The schema here is what the (mock) sheet
// adapter persists and what a downstream publisher reads.

/** Kind of media an asset carries. Detected on ingest, drives channel fit. */
export type MediaType = 'image' | 'video' | 'text' | 'link'

/** Channels we can traffic to. Display + scheduling config lives in channels.ts. */
export type ChannelId =
  // paid — social ads
  | 'meta-ads'
  | 'tiktok-ads'
  | 'linkedin-ads'
  | 'x-ads'
  | 'pinterest-ads'
  | 'snapchat-ads'
  | 'reddit-ads'
  | 'youtube-ads'
  // paid — search / shopping
  | 'google-search'
  | 'google-demand'
  | 'pmax'
  // organic — social
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'tiktok'
  | 'youtube'
  | 'pinterest'
  // owned / lifecycle
  | 'email'
  | 'sms'
  | 'push'
  | 'blog'
  | 'landing-page'
  | 'lead-magnet'

/**
 * Lifecycle of a single trafficked row. The approval gate sits between
 * `draft` and `approved` — nothing past `approved` happens without the user.
 *
 *  draft      -> just ingested, schedule proposed, awaiting review
 *  approved   -> user approved; staged in the sheet, not yet pushed
 *  scheduled  -> a publisher has accepted it and queued it for `scheduledAt`
 *  posted     -> confirmed live on the platform
 *  failed     -> a publish attempt errored (see `error`)
 */
export type RowStatus = 'draft' | 'approved' | 'scheduled' | 'posted' | 'failed'

/** A raw asset the user dropped in, before it's split across channels. */
export interface Asset {
  id: string
  name: string
  mediaType: MediaType
  /** Bytes for files; undefined for links. */
  size?: number
  /** Object URL (images/video) or the href (links). Local-only in v1. */
  previewUrl?: string
  /** Inline body for text/markdown assets. */
  body?: string
  /** Channels the user wants this asset trafficked to. */
  channels: ChannelId[]
  /** Per-channel caption/copy override; falls back to a shared default. */
  caption: string
  createdAt: number
}

/**
 * One row in the sheet: a single asset destined for a single channel at a
 * single time. This is the unit the downstream system traffics.
 */
export interface TrafficRow {
  id: string
  assetId: string
  assetName: string
  mediaType: MediaType
  channel: ChannelId
  /** Channel-specific asset-type category (see channelAssetTypes.ts). */
  assetType?: string
  /** All messaging components, keyed by field (see messaging.ts). The full copy
   *  for the asset — headline, primary text, description, CTA, etc. */
  messaging: Record<string, string>
  /**
   * Campaign this row rolls up to. The CRM attribution key: content → campaign
   * → contact → pipeline. Maps to a HubSpot/Salesforce campaign object.
   */
  campaign?: string
  /**
   * Audience / segment for targeting. For paid channels this is the CRM-synced
   * segment (Meta Custom Audience, LinkedIn Matched Audience, etc.).
   */
  audience?: string
  /** Full text body (for text/markdown assets and landing copy). */
  body?: string
  /** Copy found INSIDE the creative — image/video text overlays, VO, page copy.
   *  Populated by the copy extractor so reviewers can read every word. */
  extractedCopy?: string
  /** Reviewer has read & signed off on all copy for this row. */
  copyReviewed?: boolean
  /** RTBs (proof points) backing each messaging component: componentKey → rtb ids. */
  rtbMap?: Record<string, string[]>
  /** Auto-generated tracking parameters, written back to the sheet so they
   *  carry through to the platforms (see tracking.ts). */
  utm?: { source: string; medium: string; campaign: string; content: string }
  /** Paid-channel budget (planning side). Flight start = scheduledAt. */
  budget?: { amount: number; type: 'daily' | 'lifetime'; endDate?: string }
  /** Actual spend pulled back from the platform (read-only, daily sync). */
  spend?: { toDate: number; updatedAt: number }
  /** ISO timestamp the post should go out. Proposed, then user-adjustable. */
  scheduledAt: string
  status: RowStatus
  /** Local reference to the media (object URL / href). A real backend would
   *  hold a durable URL after upload. */
  mediaRef?: string
  error?: string
  createdAt: number
  approvedAt?: number
  postedAt?: number
}

/** Shape the mock sheet persists. Assets are kept so previews survive reloads
 *  within a session (object URLs do not, but metadata does). */
export interface SheetSnapshot {
  rows: TrafficRow[]
}
