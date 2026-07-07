import { freshRecordId } from './records'
import type { Runtime } from './strategyAssets'
import type { ChannelId, MediaType } from './types'

/**
 * The Flows builder is a visual CAMPAIGN builder: you compose a campaign on a canvas
 * (its brief + audiences, then the deliverables that get made) and "Build campaign"
 * materializes it into real draft assets in the store. This file is the deliverable
 * palette the picker draws from; each preset maps to a real Deliverable the seeder
 * understands (channel + asset type + media + cadence).
 */
export type BlockTone = 'blue' | 'green' | 'purple' | 'gold' | 'teal'

export const TONE_HEX: Record<BlockTone, string> = {
  blue: '#6fb3ff',
  green: '#33b579',
  purple: '#9b7bff',
  gold: '#eab308',
  teal: '#4bb3c4',
}

export interface DeliverablePreset {
  key: string
  label: string
  channel: ChannelId
  assetType: string
  media: MediaType
  runtime: Runtime
  perMonth: number
  group: string
  tone: BlockTone
  brand?: boolean
}

// A deliverable node placed on the canvas: a preset, its per-month cadence, and one mini
// creative brief per monthly slot (a 4/month deliverable carries 4 briefs that rotate
// across the flight). Each brief drives its asset's copy.
export interface FlowDeliverable {
  id: string
  presetKey: string
  perMonth: number
  /** One focus line per monthly slot (index i = post i+1). Rotates across the flight. */
  briefs?: string[]
  /** Free-text brief: what this deliverable is about overall. */
  description?: string
  /** Target a single audience for this deliverable; empty = the campaign's audiences. */
  audience?: string
}

export const DELIVERABLE_PRESETS: DeliverablePreset[] = [
  // Social (organic)
  { key: 'ig-feed', label: 'Instagram feed post', channel: 'instagram', assetType: 'feed', media: 'image', runtime: 'always-on', perMonth: 4, group: 'Social', tone: 'blue' },
  { key: 'ig-reel', label: 'Instagram reel', channel: 'instagram', assetType: 'reel', media: 'video', runtime: 'always-on', perMonth: 4, group: 'Social', tone: 'blue' },
  { key: 'ig-carousel', label: 'Instagram carousel', channel: 'instagram', assetType: 'carousel', media: 'image', runtime: 'always-on', perMonth: 2, group: 'Social', tone: 'blue' },
  { key: 'ig-story', label: 'Instagram story', channel: 'instagram', assetType: 'story', media: 'image', runtime: 'always-on', perMonth: 8, group: 'Social', tone: 'blue' },
  { key: 'fb-post', label: 'Facebook post', channel: 'facebook', assetType: 'image', media: 'image', runtime: 'always-on', perMonth: 3, group: 'Social', tone: 'blue' },
  { key: 'li-text', label: 'LinkedIn post', channel: 'linkedin', assetType: 'text', media: 'text', runtime: 'always-on', perMonth: 4, group: 'Social', tone: 'blue' },
  { key: 'li-image', label: 'LinkedIn image post', channel: 'linkedin', assetType: 'single-image', media: 'image', runtime: 'always-on', perMonth: 2, group: 'Social', tone: 'blue' },
  { key: 'li-doc', label: 'LinkedIn document', channel: 'linkedin', assetType: 'document', media: 'image', runtime: 'always-on', perMonth: 1, group: 'Social', tone: 'blue' },
  { key: 'li-poll', label: 'LinkedIn poll', channel: 'linkedin', assetType: 'poll', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Social', tone: 'blue' },
  { key: 'x-post', label: 'X post', channel: 'x', assetType: 'text', media: 'text', runtime: 'always-on', perMonth: 8, group: 'Social', tone: 'blue' },
  { key: 'x-thread', label: 'X thread', channel: 'x', assetType: 'thread', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Social', tone: 'blue' },
  { key: 'tiktok', label: 'TikTok video', channel: 'tiktok', assetType: 'video', media: 'video', runtime: 'always-on', perMonth: 4, group: 'Social', tone: 'blue' },
  { key: 'tiktok-photo', label: 'TikTok photo carousel', channel: 'tiktok', assetType: 'photo', media: 'image', runtime: 'always-on', perMonth: 2, group: 'Social', tone: 'blue' },
  { key: 'pin-standard', label: 'Pinterest pin', channel: 'pinterest', assetType: 'standard', media: 'image', runtime: 'always-on', perMonth: 4, group: 'Social', tone: 'blue' },
  { key: 'yt-community', label: 'YouTube community post', channel: 'youtube', assetType: 'community', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Social', tone: 'blue' },
  // Video
  { key: 'yt-long', label: 'YouTube long-form', channel: 'youtube', assetType: 'long-form', media: 'video', runtime: 'always-on', perMonth: 1, group: 'Video', tone: 'purple' },
  { key: 'yt-short', label: 'YouTube Short', channel: 'youtube', assetType: 'short', media: 'video', runtime: 'always-on', perMonth: 4, group: 'Video', tone: 'purple' },
  { key: 'fb-video', label: 'Facebook video', channel: 'facebook', assetType: 'video', media: 'video', runtime: 'always-on', perMonth: 2, group: 'Video', tone: 'purple' },
  // Paid (a flight, not a monthly cadence)
  { key: 'meta-image', label: 'Meta single-image ad', channel: 'meta-ads', assetType: 'single-image', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'meta-video', label: 'Meta video ad', channel: 'meta-ads', assetType: 'video', media: 'video', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'meta-carousel', label: 'Meta carousel ad', channel: 'meta-ads', assetType: 'carousel', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'li-ad', label: 'LinkedIn sponsored ad', channel: 'linkedin-ads', assetType: 'single-image', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'google-search-ad', label: 'Google search ad', channel: 'google-search', assetType: 'rsa', media: 'text', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'pmax', label: 'Performance Max', channel: 'pmax', assetType: 'image-group', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'yt-skippable', label: 'YouTube skippable ad', channel: 'youtube-ads', assetType: 'skippable', media: 'video', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'tiktok-ad', label: 'TikTok in-feed ad', channel: 'tiktok-ads', assetType: 'in-feed', media: 'video', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  { key: 'spotify-ad', label: 'Spotify audio ad', channel: 'spotify-ads', assetType: 'audio', media: 'text', runtime: 'flight', perMonth: 1, group: 'Paid', tone: 'gold' },
  // Email & lifecycle
  { key: 'newsletter', label: 'Newsletter', channel: 'email', assetType: 'newsletter', media: 'text', runtime: 'always-on', perMonth: 4, group: 'Email & lifecycle', tone: 'teal' },
  { key: 'nurture', label: 'Nurture email', channel: 'email', assetType: 'nurture', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Email & lifecycle', tone: 'teal' },
  { key: 'promo-email', label: 'Promotional email', channel: 'email', assetType: 'promotional', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Email & lifecycle', tone: 'teal' },
  { key: 'welcome-email', label: 'Welcome email', channel: 'email', assetType: 'welcome', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Email & lifecycle', tone: 'teal' },
  { key: 'announcement', label: 'Announcement email', channel: 'email', assetType: 'announcement', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Email & lifecycle', tone: 'teal' },
  { key: 'sms', label: 'SMS campaign', channel: 'sms', assetType: 'promotional', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Email & lifecycle', tone: 'teal' },
  // Content & SEO
  { key: 'blog', label: 'Blog article', channel: 'blog', assetType: 'article', media: 'text', runtime: 'always-on', perMonth: 4, group: 'Content & SEO', tone: 'green' },
  { key: 'pillar', label: 'Pillar guide', channel: 'blog', assetType: 'pillar', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Content & SEO', tone: 'green' },
  { key: 'listicle', label: 'Listicle', channel: 'blog', assetType: 'listicle', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Content & SEO', tone: 'green' },
  // Lead magnets (built once)
  { key: 'ebook', label: 'Ebook', channel: 'lead-magnet', assetType: 'ebook', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', tone: 'green', brand: true },
  { key: 'webinar', label: 'Webinar', channel: 'lead-magnet', assetType: 'webinar', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', tone: 'green', brand: true },
  { key: 'checklist', label: 'Checklist', channel: 'lead-magnet', assetType: 'checklist', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', tone: 'green', brand: true },
  { key: 'whitepaper', label: 'Whitepaper', channel: 'lead-magnet', assetType: 'whitepaper', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', tone: 'green', brand: true },
  // Web (built once)
  { key: 'landing', label: 'Landing page', channel: 'landing-page', assetType: 'lead-capture', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', tone: 'gold', brand: true },
  { key: 'sales-page', label: 'Sales / offer page', channel: 'landing-page', assetType: 'sales', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', tone: 'gold', brand: true },
  { key: 'case-study', label: 'Case study', channel: 'blog', assetType: 'case-study', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Web', tone: 'gold', brand: true },
  // Events (built once)
  { key: 'screening', label: 'Screening', channel: 'events', assetType: 'screening', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', tone: 'purple', brand: true },
  { key: 'panel', label: 'Panel / talk', channel: 'events', assetType: 'panel', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', tone: 'purple', brand: true },
  { key: 'workshop', label: 'Workshop', channel: 'events', assetType: 'workshop', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', tone: 'purple', brand: true },
]

export const presetByKey = (key: string): DeliverablePreset | undefined => DELIVERABLE_PRESETS.find((p) => p.key === key)

export function freshNodeId(): string {
  return freshRecordId('dl')
}

/** How many draft assets a deliverable node yields over the flight (mirrors the seeder). */
export function nodeAssetCount(preset: DeliverablePreset, perMonth: number, flightWeeks: number): number {
  if (preset.brand || preset.runtime === 'one-off' || preset.runtime === 'flight') return 1
  const months = Math.max(1, Math.round(flightWeeks / 4))
  return Math.max(1, perMonth) * months
}
