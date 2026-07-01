// Core domain model for Hyperfocus.
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
  | 'website'
  | 'blog'
  | 'landing-page'
  | 'lead-magnet'

/**
 * Lifecycle of a single trafficked row. The review gate (draft -> in_review ->
 * approved/rejected) sits before the publish gate — nothing past `approved` happens
 * without the user.
 *
 *  draft      -> just ingested / generated, awaiting review
 *  in_review  -> sent for review, a human is looking at it
 *  approved   -> user approved; the shippable set, staged but not yet pushed
 *  rejected   -> user rejected; kept for the record, not shippable
 *  scheduled  -> a publisher has accepted it and queued it for `scheduledAt`
 *  posted     -> confirmed live on the platform
 *  failed     -> a publish attempt errored (see `error`)
 */
export type RowStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'scheduled' | 'posted' | 'failed'

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
  /** Source MIME type (File.type, or Drive mimeType later). Drives PDF/type heuristics. */
  mimeType?: string
  /** Pixel dimensions for image/video, captured client-side on ingest. Feeds
   *  the aspect-ratio classifier; aspectRatio is derived (width/height), never stored. */
  width?: number
  height?: number
  /** Video duration in seconds (video only). */
  durationSec?: number
  /** Folder path the asset came from (Drive); a channel signal. Empty for local drops. */
  folderPath?: string
  /** Audience inferred from the folder path (matched to the brand's defined
   *  audiences), or set by hand in the ingest tray. Carries onto the row so the
   *  asset lands in the right lane on the canvas. */
  audience?: string
  /** Channels the user wants this asset trafficked to. Pre-toggled by the classifier. */
  channels: ChannelId[]
  /** Per-channel caption/copy override; falls back to a shared default. */
  caption: string
  /** Auto-suggested asset-type keyed by channel. One asset maps to many channels
   *  with different type names (a 9:16 video is a Reel on instagram, a Video on
   *  tiktok, a Short on youtube), so the suggestion is per-channel. Read by the
   *  scheduler (propose.ts) so the inferred type lands on the row. */
  suggestedTypeFor?: Partial<Record<ChannelId, string>>
  /** 0–1 confidence of the channel auto-classification (drives confirm-board bands). */
  classifyConfidence?: number
  /** Which layer produced the suggestion. */
  classifySource?: 'path' | 'heuristic' | 'ai'
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
  /** Explicit funnel-stage override — set when a card is dragged into a different
   *  band. Wins over the channel-derived stage so you can place a card by hand. */
  funnelStage?: import('./funnel').FunnelStage
  /** Carried from the classifier so the grid can flag auto-organized rows. */
  classifyConfidence?: number
  classifySource?: 'path' | 'heuristic' | 'ai'
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
  /** A persisted re-check flag raised when a frame change (brand / audience swap)
   *  moves this PRODUCED/linked asset out from under its proof. Editable copy gets
   *  redrafted automatically; produced media (a finished video, a static, a live
   *  page) can't be, so it carries this flag until someone reworks it where it
   *  lives. Reconciled on every frame change (set when it stops fitting, cleared
   *  when it fits again) and cleared by hand from the card. */
  recheckFlag?: {
    /** Why it was flagged — a short, human reason. */
    reason: string
    /** The frame change that raised it, e.g. "Audience → Reef & Wreck". */
    frame: string
    at: number
  }
  /** RTBs (proof points) backing each messaging component: componentKey → rtb ids. */
  rtbMap?: Record<string, string[]>
  /** The creative EXECUTION format this asset was written as (question, how-to,
   *  testimonial, myth-bust, story, stat, PSA, before/after, …) — so a generated
   *  set is visibly varied, not one mold. Set by generation. */
  format?: string
  /** Personalization lineage: the composition this variant was fanned from
   *  (dimension → value, e.g. { audience: 'Captains', location: 'Asbury', journey:
   *  'Convert' }). Built up as fan-out cards stack, so outcomes attribute to the exact
   *  combination and feed performance profiles. */
  lineage?: Record<string, string>
  /** Destination this unit drives to — the next asset in the journey (by asset
   *  name), e.g. an ad → its landing page, a lead magnet → its nurture email. */
  linksTo?: string
  /** The asset this one branches off — the previous step in the journey (by asset
   *  name). One parent can have many branches, so this models the tree the
   *  `linksTo` single-link can't. Set when you branch a card on the canvas. A journey
   *  link: the child flows FORWARD to a later stage and draws a connecting edge. */
  branchOf?: string
  /** The master message this is a personalization VARIANT of (by asset name). Distinct
   *  from branchOf: a variant is a sibling of its master in the SAME stage (it sits side
   *  by side, not connected by a journey edge). Set by fan-out; carries `lineage`. */
  variantOf?: string
  /** Auto-generated tracking parameters, written back to the sheet so they
   *  carry through to the platforms (see tracking.ts). */
  utm?: { source: string; medium: string; campaign: string; content: string }
  /** Paid-channel budget (planning side). Flight start = scheduledAt. */
  budget?: { amount: number; type: 'daily' | 'lifetime'; endDate?: string }
  /** Actual spend pulled back from the platform (read-only, daily sync). */
  spend?: { toDate: number; updatedAt: number }
  /** Real engagement pulled from the channel (organic performance signal). */
  engagement?: { likes: number; comments: number }
  /** Richer platform metrics for an imported live post (impressions / reach / shares /
   *  saves / views / engagementRate, whatever the source exposes). Open-ended. */
  socialMetrics?: Record<string, number>
  /** When socialMetrics were last refreshed (ms epoch). Platform metrics lag by up to
   *  ~24h, so this is the freshness stamp, not a real-time read. */
  metricsUpdatedAt?: number
  /** ISO timestamp the post should go out. Proposed, then user-adjustable. */
  scheduledAt: string
  /** For assets that run over a period (always-on ads, landing pages, nurture
   *  flows): the ISO date they stop running. Drives multi-day spans on the
   *  calendar. Omitted for point-in-time content (a post, a send). */
  endsAt?: string
  status: RowStatus
  /** Local reference to the media (object URL / href). A real backend would
   *  hold a durable URL after upload. */
  mediaRef?: string
  error?: string
  createdAt: number
  approvedAt?: number
  postedAt?: number
  /** Hand-authored by a human (vs generated) — first-class, but tagged so the lineage
   *  shows it was written, not composed. (Kept for back-compat; `source` is the richer tag.) */
  authored?: boolean
  /** Where this asset came from. Generated drafts are undefined/'generated'. Real content
   *  imported into a canvas is tagged so it sits beside drafts, distinguishable:
   *   - authored:    hand-written by a human in the tool
   *   - imported:    pasted / uploaded batch (a content audit, a CSV)
   *   - social-live: a real published social post (Buffer / platform)
   *   - site:        scraped from the brand's site (a page, a case study) */
  source?: 'generated' | 'authored' | 'imported' | 'social-live' | 'site'
  /** The external URL this asset was imported from (the post / page). Also the dedup
   *  key on re-import, so the same post is never imported twice. */
  sourceUrl?: string
  /** When the real content was published externally (ISO), distinct from createdAt. */
  publishedAt?: string
  /** Media references for an imported post (image / video / carousel urls). */
  mediaRefs?: string[]
  /** An optional note left with the last status change (why it was rejected, etc.). */
  reviewNote?: string
  /** Soft-delete: when set, the asset is archived (hidden from views/lists) but
   *  recoverable. Restore clears it; a hard purge removes the row entirely. */
  archivedAt?: number
}

/** Shape the mock sheet persists. Assets are kept so previews survive reloads
 *  within a session (object URLs do not, but metadata does). */
export interface SheetSnapshot {
  rows: TrafficRow[]
}
