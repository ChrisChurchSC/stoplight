import type { ChannelId, TrafficRow } from './types'

export interface Utm {
  source: string
  medium: string
  campaign: string
  content: string
}

/**
 * The single naming convention — the source of truth for UTMs. One canonical
 * source + medium per channel, so values are uniform (no facebook/FB/meta
 * drift). Config-driven and keyed off the channel taxonomy.
 */
export const TRACKING_CONVENTION: Record<ChannelId, { source: string; medium: string }> = {
  'meta-ads': { source: 'meta', medium: 'paid_social' },
  'tiktok-ads': { source: 'tiktok', medium: 'paid_social' },
  'linkedin-ads': { source: 'linkedin', medium: 'paid_social' },
  'x-ads': { source: 'x', medium: 'paid_social' },
  'pinterest-ads': { source: 'pinterest', medium: 'paid_social' },
  'snapchat-ads': { source: 'snapchat', medium: 'paid_social' },
  'reddit-ads': { source: 'reddit', medium: 'paid_social' },
  'youtube-ads': { source: 'youtube', medium: 'paid_video' },
  'google-search': { source: 'google', medium: 'cpc' },
  'google-demand': { source: 'google', medium: 'paid_demand' },
  pmax: { source: 'google', medium: 'pmax' },
  instagram: { source: 'instagram', medium: 'social' },
  facebook: { source: 'facebook', medium: 'social' },
  linkedin: { source: 'linkedin', medium: 'social' },
  x: { source: 'x', medium: 'social' },
  tiktok: { source: 'tiktok', medium: 'social' },
  youtube: { source: 'youtube', medium: 'social' },
  pinterest: { source: 'pinterest', medium: 'social' },
  email: { source: 'email', medium: 'email' },
  sms: { source: 'sms', medium: 'sms' },
  push: { source: 'push', medium: 'push' },
  blog: { source: 'blog', medium: 'organic' },
  'landing-page': { source: 'site', medium: 'web' },
  'lead-magnet': { source: 'leadmagnet', medium: 'content' },
}

/** Expected tracking per channel: the pixel/tag and the conversion event. */
export interface TrackingRequirement {
  pixel?: string
  event?: string
}

export const TRACKING_REQUIREMENTS: Partial<Record<ChannelId, TrackingRequirement>> = {
  'meta-ads': { pixel: 'Meta Pixel', event: 'Lead' },
  facebook: { pixel: 'Meta Pixel', event: 'Lead' },
  instagram: { pixel: 'Meta Pixel', event: 'Lead' },
  'tiktok-ads': { pixel: 'TikTok Pixel', event: 'CompleteRegistration' },
  tiktok: { pixel: 'TikTok Pixel', event: 'CompleteRegistration' },
  'linkedin-ads': { pixel: 'LinkedIn Insight Tag', event: 'Lead' },
  linkedin: { pixel: 'LinkedIn Insight Tag', event: 'Lead' },
  'x-ads': { pixel: 'X Pixel', event: 'SignUp' },
  'pinterest-ads': { pixel: 'Pinterest Tag', event: 'Lead' },
  'snapchat-ads': { pixel: 'Snap Pixel', event: 'SignUp' },
  'reddit-ads': { pixel: 'Reddit Pixel', event: 'Lead' },
  'youtube-ads': { pixel: 'GA4', event: 'conversion' },
  'google-search': { pixel: 'Google Ads tag', event: 'conversion' },
  'google-demand': { pixel: 'Google Ads tag', event: 'conversion' },
  pmax: { pixel: 'Google Ads tag', event: 'conversion' },
  'landing-page': { pixel: 'GA4', event: 'Lead' },
  // email / sms / push / blog / lead-magnet: UTM-tracked, no pixel required.
}

/**
 * What's actually installed/mapped in the workspace (generate-only stand-in for
 * reading destination pages / platform APIs). Swap for a real adapter that
 * confirms a pixel is firing / an event is live (confirm-firing).
 */
export const INSTALLED = {
  pixels: new Set(['Meta Pixel', 'GA4', 'TikTok Pixel', 'Google Ads tag', 'Pinterest Tag']),
  events: new Set(['Lead', 'conversion', 'SignUp', 'CompleteRegistration']),
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'untitled'
}

/** Build UTMs for a row from its own metadata — consistent, never hand-typed. */
export function buildUtm(row: TrafficRow): Utm {
  const conv = TRACKING_CONVENTION[row.channel]
  return {
    source: conv.source,
    medium: conv.medium,
    campaign: slugify(row.campaign ?? ''),
    content: row.assetType ? slugify(row.assetType) : 'asset',
  }
}

export function utmQuery(utm: Utm): string {
  return `utm_source=${utm.source}&utm_medium=${utm.medium}&utm_campaign=${utm.campaign}&utm_content=${utm.content}`
}

export interface TrackingCheck {
  label: string
  ok: boolean
}

/** Per-asset tracking checklist: UTMs built, pixel present, event mapped. */
export function trackingChecks(row: TrafficRow): TrackingCheck[] {
  const checks: TrackingCheck[] = [{ label: 'UTMs built', ok: !!row.utm }]
  const req = TRACKING_REQUIREMENTS[row.channel]
  if (req?.pixel) {
    checks.push({ label: `${req.pixel} present`, ok: INSTALLED.pixels.has(req.pixel) })
  }
  if (req?.event) {
    checks.push({ label: `Event "${req.event}" mapped`, ok: INSTALLED.events.has(req.event) })
  }
  return checks
}

export const isTrackingClean = (row: TrafficRow): boolean => trackingChecks(row).every((c) => c.ok)
