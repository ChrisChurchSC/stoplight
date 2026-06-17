import type { ChannelId, MediaType } from './types'

/** How a channel is funded/owned — drives the sidebar grouping. */
export type ChannelKind = 'paid' | 'organic' | 'owned'

/**
 * Per-channel configuration: labeling, the platform it belongs to, accepted
 * media, and v1 "best time" defaults used by the scheduler. Times are local 24h
 * slots — deliberately simple defaults; predictive timing is a phase-2 item.
 */
export interface ChannelConfig {
  id: ChannelId
  label: string
  /** Short tag for compact pills. */
  short: string
  /** paid / organic / owned — sidebar section. */
  kind: ChannelKind
  /** Platform family (e.g. Meta, TikTok) — a future home for placements. */
  platform: string
  /** Accent color for the channel dot/chip. */
  color: string
  /** Media types that make sense on this channel (used for fit warnings). */
  accepts: MediaType[]
  /** Preferred posting slots; the scheduler spreads a batch across them. */
  bestTimes: { hour: number; minute: number }[]
}

const t = (hour: number, minute = 0) => ({ hour, minute })

export const CHANNELS: Record<ChannelId, ChannelConfig> = {
  // ---------------- Paid — social ads ----------------
  'meta-ads': {
    id: 'meta-ads', label: 'Meta Ads', short: 'META', kind: 'paid', platform: 'Meta',
    color: '#1877f2', accepts: ['image', 'video', 'text'], bestTimes: [t(12), t(19)],
  },
  'tiktok-ads': {
    id: 'tiktok-ads', label: 'TikTok Ads', short: 'TT-AD', kind: 'paid', platform: 'TikTok',
    color: '#ff0050', accepts: ['video', 'image'], bestTimes: [t(18), t(21)],
  },
  'linkedin-ads': {
    id: 'linkedin-ads', label: 'LinkedIn Ads', short: 'LI-AD', kind: 'paid', platform: 'LinkedIn',
    color: '#1d4ed8', accepts: ['image', 'video', 'text'], bestTimes: [t(9), t(12)],
  },
  'x-ads': {
    id: 'x-ads', label: 'X Ads', short: 'X-AD', kind: 'paid', platform: 'X',
    color: '#374151', accepts: ['image', 'video', 'text'], bestTimes: [t(12), t(17)],
  },
  'pinterest-ads': {
    id: 'pinterest-ads', label: 'Pinterest Ads', short: 'PIN-AD', kind: 'paid', platform: 'Pinterest',
    color: '#b8001c', accepts: ['image', 'video'], bestTimes: [t(20)],
  },
  'snapchat-ads': {
    id: 'snapchat-ads', label: 'Snapchat Ads', short: 'SNAP', kind: 'paid', platform: 'Snapchat',
    color: '#e3b800', accepts: ['video', 'image'], bestTimes: [t(16), t(20)],
  },
  'reddit-ads': {
    id: 'reddit-ads', label: 'Reddit Ads', short: 'RDT-AD', kind: 'paid', platform: 'Reddit',
    color: '#ff4500', accepts: ['image', 'text', 'link'], bestTimes: [t(11), t(20)],
  },
  'youtube-ads': {
    id: 'youtube-ads', label: 'YouTube Ads', short: 'YT-AD', kind: 'paid', platform: 'YouTube',
    color: '#cc0000', accepts: ['video'], bestTimes: [t(17), t(20)],
  },

  // ---------------- Paid — search / shopping ----------------
  'google-search': {
    id: 'google-search', label: 'Google Search', short: 'GSEM', kind: 'paid', platform: 'Google',
    color: '#4285f4', accepts: ['text'], bestTimes: [t(9)],
  },
  'google-demand': {
    id: 'google-demand', label: 'Google Demand Gen', short: 'GDG', kind: 'paid', platform: 'Google',
    color: '#34a853', accepts: ['image', 'video', 'text'], bestTimes: [t(12)],
  },
  pmax: {
    id: 'pmax', label: 'Performance Max', short: 'PMAX', kind: 'paid', platform: 'Google',
    color: '#ea4335', accepts: ['image', 'video', 'text'], bestTimes: [t(10)],
  },

  // ---------------- Organic — social ----------------
  instagram: {
    id: 'instagram', label: 'Instagram', short: 'IG', kind: 'organic', platform: 'Instagram',
    color: '#e1306c', accepts: ['image', 'video'], bestTimes: [t(11), t(19)],
  },
  facebook: {
    id: 'facebook', label: 'Facebook', short: 'FB', kind: 'organic', platform: 'Facebook',
    color: '#1877f2', accepts: ['text', 'image', 'video', 'link'], bestTimes: [t(13)],
  },
  linkedin: {
    id: 'linkedin', label: 'LinkedIn post', short: 'LI', kind: 'organic', platform: 'LinkedIn',
    color: '#0a66c2', accepts: ['text', 'image', 'link', 'video'], bestTimes: [t(8, 30), t(12)],
  },
  x: {
    id: 'x', label: 'X (Twitter)', short: 'X', kind: 'organic', platform: 'X',
    color: '#111827', accepts: ['text', 'image', 'video', 'link'], bestTimes: [t(9), t(15)],
  },
  tiktok: {
    id: 'tiktok', label: 'TikTok', short: 'TT', kind: 'organic', platform: 'TikTok',
    color: '#08b9c4', accepts: ['video'], bestTimes: [t(18), t(21)],
  },
  youtube: {
    id: 'youtube', label: 'YouTube', short: 'YT', kind: 'organic', platform: 'YouTube',
    color: '#ff0000', accepts: ['video'], bestTimes: [t(15), t(18)],
  },
  pinterest: {
    id: 'pinterest', label: 'Pinterest', short: 'PIN', kind: 'organic', platform: 'Pinterest',
    color: '#e60023', accepts: ['image', 'video'], bestTimes: [t(20), t(21)],
  },

  // ---------------- Owned / lifecycle ----------------
  email: {
    id: 'email', label: 'Email', short: 'EMAIL', kind: 'owned', platform: 'Email',
    color: '#3b82f6', accepts: ['text', 'image', 'link'], bestTimes: [t(9, 30), t(13)],
  },
  sms: {
    id: 'sms', label: 'SMS', short: 'SMS', kind: 'owned', platform: 'SMS',
    color: '#22c55e', accepts: ['text', 'link'], bestTimes: [t(12)],
  },
  push: {
    id: 'push', label: 'Push', short: 'PUSH', kind: 'owned', platform: 'Push',
    color: '#7c3aed', accepts: ['text', 'image', 'link'], bestTimes: [t(10), t(18)],
  },
  blog: {
    id: 'blog', label: 'Blog article', short: 'BLOG', kind: 'owned', platform: 'Web',
    color: '#8b5cf6', accepts: ['text', 'image', 'link'], bestTimes: [t(8), t(11)],
  },
  'landing-page': {
    id: 'landing-page', label: 'Landing page', short: 'LP', kind: 'owned', platform: 'Web',
    color: '#0ea5e9', accepts: ['text', 'image', 'link', 'video'], bestTimes: [t(10)],
  },
  'lead-magnet': {
    id: 'lead-magnet', label: 'Lead magnet', short: 'LEAD', kind: 'owned', platform: 'Web',
    color: '#10b981', accepts: ['link', 'text', 'image'], bestTimes: [t(10, 30)],
  },
}

export const CHANNEL_LIST: ChannelConfig[] = Object.values(CHANNELS)

/** Sidebar sections, in display order. */
export const KIND_ORDER: { kind: ChannelKind; label: string }[] = [
  { kind: 'paid', label: 'Paid' },
  { kind: 'organic', label: 'Organic' },
  { kind: 'owned', label: 'Owned' },
]

export const channelsByKind = (kind: ChannelKind): ChannelConfig[] =>
  CHANNEL_LIST.filter((c) => c.kind === kind)

/** True when a media type is a sensible fit for a channel. */
export function channelAccepts(channel: ChannelId, media: MediaType): boolean {
  return CHANNELS[channel].accepts.includes(media)
}
