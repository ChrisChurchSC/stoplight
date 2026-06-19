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

// ---------------------------------------------------------------------------
// Per-channel tracking infrastructure: the full setup stack a channel needs to
// measure conversions properly (not just a pixel) — client pixel/tag,
// server-side conversions API, the conversion event, web analytics, a tag
// manager, domain verification, ESP link tracking, UTM tagging, compliance.
// Surfaced on the Connectors page so you can see what's set up vs. still needed.
// ---------------------------------------------------------------------------

export type TrackingKind =
  | 'pixel'
  | 'server'
  | 'event'
  | 'analytics'
  | 'tagmanager'
  | 'verification'
  | 'utm'
  | 'esp'
  | 'compliance'

export interface TrackingItem {
  label: string
  kind: TrackingKind
}

/** Human label for each infrastructure kind (shown in the tracking drawer). */
export const TRACKING_KIND_LABEL: Record<TrackingKind, string> = {
  pixel: 'Client pixel / tag',
  server: 'Server-side conversions',
  event: 'Conversion event',
  analytics: 'Web analytics',
  tagmanager: 'Tag manager',
  verification: 'Verification',
  utm: 'UTM tagging',
  esp: 'Link tracking',
  compliance: 'Compliance',
}

const ti = (label: string, kind: TrackingKind): TrackingItem => ({ label, kind })
/** UTM tagging is universal — Rushhour builds it for every row. */
const UTM = ti('UTM tagging', 'utm')

export const CHANNEL_TRACKING: Record<ChannelId, TrackingItem[]> = {
  // paid — social
  'meta-ads': [ti('Meta Pixel', 'pixel'), ti('Conversions API', 'server'), ti('Lead event', 'event'), ti('Domain verification', 'verification'), UTM],
  'tiktok-ads': [ti('TikTok Pixel', 'pixel'), ti('Events API', 'server'), ti('Registration event', 'event'), UTM],
  'linkedin-ads': [ti('LinkedIn Insight Tag', 'pixel'), ti('Conversions API', 'server'), ti('Lead event', 'event'), UTM],
  'x-ads': [ti('X Pixel', 'pixel'), ti('Sign-up event', 'event'), UTM],
  'pinterest-ads': [ti('Pinterest Tag', 'pixel'), ti('Conversions API', 'server'), ti('Lead event', 'event'), UTM],
  'snapchat-ads': [ti('Snap Pixel', 'pixel'), ti('Sign-up event', 'event'), UTM],
  'reddit-ads': [ti('Reddit Pixel', 'pixel'), ti('Lead event', 'event'), UTM],
  'youtube-ads': [ti('Google Ads tag', 'pixel'), ti('GA4', 'analytics'), ti('Conversion action', 'event'), UTM],
  // paid — search / shopping
  'google-search': [ti('Google Ads tag', 'pixel'), ti('GA4', 'analytics'), ti('Conversion action', 'event'), ti('Enhanced conversions', 'server'), UTM],
  'google-demand': [ti('Google Ads tag', 'pixel'), ti('GA4', 'analytics'), ti('Conversion action', 'event'), UTM],
  pmax: [ti('Google Ads tag', 'pixel'), ti('GA4', 'analytics'), ti('Conversion action', 'event'), ti('Enhanced conversions', 'server'), UTM],
  // organic — social (pixel for retargeting + attribution, plus UTM)
  instagram: [ti('Meta Pixel', 'pixel'), UTM],
  facebook: [ti('Meta Pixel', 'pixel'), UTM],
  linkedin: [ti('LinkedIn Insight Tag', 'pixel'), UTM],
  x: [ti('X Pixel', 'pixel'), UTM],
  tiktok: [ti('TikTok Pixel', 'pixel'), UTM],
  youtube: [ti('GA4', 'analytics'), UTM],
  pinterest: [ti('Pinterest Tag', 'pixel'), UTM],
  // owned / lifecycle
  email: [ti('ESP link tracking', 'esp'), UTM, ti('Suppression / unsubscribe', 'compliance')],
  sms: [ti('Link tracking', 'esp'), UTM, ti('Opt-out compliance', 'compliance')],
  push: [ti('Delivery + click tracking', 'analytics'), UTM],
  blog: [ti('GA4', 'analytics'), UTM],
  'landing-page': [ti('GA4', 'analytics'), ti('GTM container', 'tagmanager'), ti('Conversion event', 'event'), UTM],
  'lead-magnet': [ti('GA4', 'analytics'), ti('Form conversion event', 'event'), UTM],
}

/**
 * What's actually set up in the workspace (mock stand-in). Swap for a real
 * adapter that confirms each piece is live (pixel firing, API receiving, event
 * mapped). The gaps are the "still needed" items in the Connectors view.
 */
export const INSTALLED_TRACKING = new Set<string>([
  'UTM tagging',
  'Meta Pixel', 'TikTok Pixel', 'Pinterest Tag', 'GA4', 'Google Ads tag', 'LinkedIn Insight Tag',
  'Lead event', 'Conversion action', 'Registration event', 'Sign-up event', 'Conversion event', 'Form conversion event',
  'ESP link tracking', 'Link tracking', 'Delivery + click tracking',
  // not yet set up: Conversions API, Events API, Enhanced conversions, Domain
  // verification, GTM container, X Pixel, Snap Pixel, Reddit Pixel, Suppression
  // / unsubscribe, Opt-out compliance.
])

export interface ChannelTrackingStatus {
  items: { item: TrackingItem; installed: boolean }[]
  ready: number
  total: number
}

/** Tracking infrastructure + per-item setup status for a channel. */
export function channelTracking(channel: ChannelId): ChannelTrackingStatus {
  const items = (CHANNEL_TRACKING[channel] ?? [UTM]).map((item) => ({
    item,
    installed: INSTALLED_TRACKING.has(item.label),
  }))
  return { items, ready: items.filter((x) => x.installed).length, total: items.length }
}
