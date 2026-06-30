import type { FunnelStage } from './funnel'
import type { ChannelId, TrafficRow } from './types'

/**
 * Import real content into a canvas. A brand's actual posts (Buffer / social), site
 * pages and case studies (scrape), or a pasted content audit become first-class assets
 * sitting beside generated drafts — so a canvas can finally look like the real brand.
 *
 * This module is the PURE mapping: a loosely-shaped imported item (whatever the source
 * handed us) normalized to the fields a TrafficRow needs, plus the platform→channel map.
 * The store builds the rows + dedups; the bridge accepts the batch.
 */

export type AssetSource = NonNullable<TrafficRow['source']>

const PLATFORM_CHANNEL: Record<string, ChannelId> = {
  instagram: 'instagram', ig: 'instagram', insta: 'instagram',
  facebook: 'facebook', fb: 'facebook', meta: 'facebook',
  linkedin: 'linkedin', li: 'linkedin', 'linkedin post': 'linkedin',
  x: 'x', twitter: 'x', 'x (twitter)': 'x', tweet: 'x',
  tiktok: 'tiktok', 'tik tok': 'tiktok', tt: 'tiktok',
  youtube: 'youtube', yt: 'youtube', 'youtube short': 'youtube',
  pinterest: 'pinterest', pin: 'pinterest',
  website: 'website', web: 'website', site: 'website', page: 'website',
  blog: 'blog', article: 'blog', 'blog article': 'blog', 'case study': 'blog',
  'landing page': 'landing-page', 'landing-page': 'landing-page', lp: 'landing-page',
  email: 'email', newsletter: 'email', broadcast: 'email',
}

/** Resolve a platform / channel string to a ChannelId (undefined if unknown). */
export function platformToChannel(p?: string): ChannelId | undefined {
  if (!p) return undefined
  return PLATFORM_CHANNEL[p.trim().toLowerCase()]
}

/** The channel an import defaults to when the item doesn't name one. */
export function defaultChannelFor(source: AssetSource): ChannelId {
  if (source === 'site') return 'website'
  if (source === 'imported') return 'website'
  return 'instagram' // social-live / authored default to a feed post
}

const STAGES: FunnelStage[] = ['awareness', 'consideration', 'conversion', 'retention']

export interface NormalizedImport {
  headline?: string
  primaryText?: string
  description?: string
  cta?: string
  sourceUrl?: string
  publishedAt?: string
  channel: ChannelId
  assetType?: string
  stage?: FunnelStage
  audience?: string
  mediaRefs?: string[]
  metrics?: Record<string, number>
  /** Freshness of the metrics (ms epoch), if the source stamps it. */
  metricsUpdatedAt?: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? [str(v)] : []
/** Keep only the numeric entries of an object (impressions / reach / shares / …). */
function numericMetrics(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof val === 'number' ? val : typeof val === 'string' ? Number(val.replace(/[, ]/g, '')) : NaN
    if (Number.isFinite(n)) out[k] = n
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Normalize a loosely-shaped imported item (a Buffer post, a scraped page, a CSV row)
 * to the fields a row needs. Accepts the many names a source might use for the same
 * thing (caption/copy/body/text → primaryText; url/permalink/link → sourceUrl; …).
 */
export function normalizeImportItem(item: Record<string, unknown>, source: AssetSource): NormalizedImport {
  const headline = str(item.headline) || str(item.title) || str(item.subject)
  const primaryText =
    str(item.primaryText) || str(item.caption) || str(item.copy) || str(item.body) || str(item.text) || str(item.content)
  const description = str(item.description) || str(item.preview) || str(item.excerpt)
  const cta = str(item.cta) || str(item.callToAction)
  const sourceUrl = str(item.sourceUrl) || str(item.url) || str(item.permalink) || str(item.link)
  const publishedAt =
    str(item.publishedAt) || str(item.published) || str(item.date) || str(item.sentAt) || str(item.createdAt)
  const channel = platformToChannel(str(item.channel) || str(item.platform)) ?? defaultChannelFor(source)
  const mediaRefs = strList(item.mediaRefs ?? item.media ?? item.mediaUrl ?? item.image ?? item.thumbnail)
  const metrics = numericMetrics(item.metrics) ?? numericMetrics(item)
  const muRaw = item.metricsUpdatedAt
  const metricsUpdatedAt =
    typeof muRaw === 'number' ? muRaw : typeof muRaw === 'string' && muRaw ? Date.parse(muRaw) || undefined : undefined
  const stageRaw = str(item.stage).toLowerCase()
  const stage = STAGES.includes(stageRaw as FunnelStage) ? (stageRaw as FunnelStage) : undefined
  const audience = str(item.audience) || str(item.segment) || undefined
  const assetType = str(item.type) || str(item.assetType) || undefined
  return {
    headline: headline || undefined,
    primaryText: primaryText || undefined,
    description: description || undefined,
    cta: cta || undefined,
    sourceUrl: sourceUrl || undefined,
    publishedAt: publishedAt || undefined,
    channel,
    assetType,
    stage,
    audience,
    mediaRefs: mediaRefs.length ? mediaRefs : undefined,
    metrics,
    metricsUpdatedAt,
  }
}

/** Likes/comments extracted from a metrics map (for the row's engagement block). */
export function engagementFromMetrics(metrics?: Record<string, number>): { likes: number; comments: number } | undefined {
  if (!metrics) return undefined
  const pick = (...keys: string[]) => keys.map((k) => metrics[k]).find((n) => typeof n === 'number') ?? 0
  const likes = pick('likes', 'like', 'favorites', 'reactions')
  const comments = pick('comments', 'comment', 'replies')
  return likes || comments ? { likes, comments } : undefined
}

/** Whether real content was pasted in as a login / challenge / error page rather than a
 *  post — never store these as content (per the robustness bar). */
export function looksLikeBlockedPage(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /just a moment|checking your browser|enable javascript|log in to|sign in to see|create an account|attention required|access denied|are you a robot|captcha/.test(
      t,
    ) && t.length < 400
  )
}
