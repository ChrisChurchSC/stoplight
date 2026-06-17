import type { ChannelId, MediaType } from './types'

/**
 * One asset a channel requires — a media placement (with a preferred/supported
 * aspect ratio) or a copy field (with recommended + hard char limits). Specs
 * were verified against current platform docs (June 2026); see CHANNEL_SOURCE
 * for provenance. Platform specs drift — treat this as a maintained config.
 */
export interface AssetSlot {
  key: string
  label: string
  kind: 'media' | 'copy'
  // media
  preferredRatio?: string
  ratios?: string[]
  mediaTypes?: MediaType[]
  // copy
  recommended?: number
  hardLimit?: number
  /** Max number of this asset the platform accepts (RSA headlines, PMax images…). */
  count?: number
}

const med = (
  key: string,
  label: string,
  preferredRatio: string,
  ratios: string[] = [preferredRatio],
  mediaTypes: MediaType[] = ['image', 'video'],
  count?: number,
): AssetSlot => ({ key, label, kind: 'media', preferredRatio, ratios, mediaTypes, count })

const cpy = (
  key: string,
  label: string,
  recommended?: number,
  hardLimit?: number,
  count?: number,
): AssetSlot => ({ key, label, kind: 'copy', recommended, hardLimit, count })

export const CHANNEL_ASSETS: Record<ChannelId, AssetSlot[]> = {
  // ---- paid — social ----
  'meta-ads': [med('feed-1x1', 'Feed 1:1', '1:1', ['1:1', '1.91:1']), med('feed-4x5', 'Feed 4:5', '4:5'), med('story-9x16', 'Story/Reel 9:16', '9:16', ['9:16'], ['image', 'video']), cpy('primary', 'Primary text', 125, 63206), cpy('headline', 'Headline', 40, 255), cpy('description', 'Description', 30)],
  'tiktok-ads': [med('video-9x16', 'Video 9:16', '9:16', ['9:16', '1:1', '16:9'], ['video']), cpy('caption', 'Caption', 100, 100), cpy('brand', 'Brand name', 20, 20)],
  'linkedin-ads': [med('image-1.91x1', 'Image 1.91:1', '1.91:1', ['1.91:1', '1:1', '4:5']), cpy('intro', 'Intro text', 150, 255), cpy('headline', 'Headline', 70, 200)],
  'x-ads': [med('media-16x9', 'Media 16:9', '16:9', ['16:9', '1:1', '9:16']), cpy('post', 'Post text', 280, 280)],
  'pinterest-ads': [med('pin-2x3', 'Pin 2:3', '2:3', ['2:3'], ['image', 'video']), cpy('title', 'Title', 40, 100), cpy('description', 'Description', undefined, 500)],
  'snapchat-ads': [med('video-9x16', 'Video 9:16', '9:16', ['9:16'], ['video', 'image']), cpy('brand', 'Brand name', undefined, 25), cpy('headline', 'Headline', undefined, 34)],
  'reddit-ads': [med('media-1x1', 'Media 1:1', '1:1', ['1:1', '4:5', '1.91:1']), cpy('title', 'Title', 80, 100)],
  'youtube-ads': [med('video-16x9', 'Video 16:9', '16:9', ['16:9', '9:16', '1:1'], ['video']), med('thumbnail', 'Thumbnail 16:9', '16:9', ['16:9'], ['image']), cpy('headline', 'Headline', undefined, 15), cpy('description', 'Description', undefined, 35)],
  // ---- paid — search / shopping ----
  'google-search': [cpy('headline', 'Headline', undefined, 30, 15), cpy('description', 'Description', undefined, 90, 4), cpy('path', 'Display path', undefined, 15, 2)],
  'google-demand': [med('image-1x1', 'Image 1:1', '1:1', ['1:1'], ['image']), med('image-1.91x1', 'Image 1.91:1', '1.91:1', ['1.91:1'], ['image']), med('image-4x5', 'Image 4:5', '4:5', ['4:5'], ['image']), cpy('headline', 'Headline', undefined, 40, 5), cpy('long-headline', 'Long headline', undefined, 90, 5), cpy('description', 'Description', undefined, 90, 5)],
  pmax: [med('image-1x1', 'Image 1:1 (req)', '1:1', ['1:1'], ['image']), med('image-1.91x1', 'Image 1.91:1', '1.91:1', ['1.91:1'], ['image']), med('image-4x5', 'Image 4:5', '4:5', ['4:5'], ['image']), med('logo-1x1', 'Logo 1:1', '1:1', ['1:1', '4:1'], ['image']), cpy('headline', 'Headline', undefined, 30, 15), cpy('long-headline', 'Long headline', undefined, 90, 5), cpy('description', 'Description', undefined, 90, 5)],
  // ---- organic — social ----
  instagram: [med('post-1x1', 'Post 1:1', '1:1', ['1:1', '4:5']), med('story-9x16', 'Story 9:16', '9:16', ['9:16']), cpy('caption', 'Caption', 125, 2200)],
  facebook: [med('post', 'Post 1.91:1', '1.91:1', ['1.91:1', '1:1'], ['image', 'video']), cpy('body', 'Body', 80, 63206)],
  linkedin: [med('image-1.91x1', 'Image 1.91:1', '1.91:1', ['1.91:1', '1:1', '4:5']), cpy('body', 'Body', 210, 3000)],
  x: [med('media-16x9', 'Media 16:9', '16:9', ['16:9', '1:1']), cpy('post', 'Post', 280, 280)],
  tiktok: [med('video-9x16', 'Video 9:16', '9:16', ['9:16'], ['video']), cpy('caption', 'Caption', undefined, 4000)],
  youtube: [med('video-16x9', 'Video 16:9', '16:9', ['16:9', '9:16'], ['video']), med('thumbnail', 'Thumbnail 16:9', '16:9', ['16:9'], ['image']), cpy('title', 'Title', 60, 100), cpy('description', 'Description', 157, 5000)],
  pinterest: [med('pin-2x3', 'Pin 2:3', '2:3', ['2:3'], ['image', 'video']), cpy('title', 'Title', 40, 100), cpy('description', 'Description', undefined, 500)],
  // ---- owned / lifecycle ----
  email: [cpy('subject', 'Subject line', 60), cpy('preview', 'Preview text', 100), med('hero', 'Hero image 16:9', '16:9', ['16:9'], ['image']), cpy('body', 'Body')],
  sms: [cpy('message', 'Message', 160, 160)],
  push: [cpy('title', 'Title', 50, 65), cpy('body', 'Body', 150, 240), med('icon', 'Icon 1:1', '1:1', ['1:1'], ['image'])],
  blog: [cpy('title', 'SEO title', 60, 70), med('featured', 'Featured image 16:9', '16:9', ['16:9'], ['image']), cpy('body', 'Body'), cpy('meta-description', 'Meta description', 155, 160)],
  'landing-page': [med('hero', 'Hero image 16:9', '16:9', ['16:9'], ['image']), med('og-image', 'OG image 1.91:1', '1.91:1', ['1.91:1'], ['image']), cpy('headline', 'Headline', 60), cpy('body', 'Body')],
  'lead-magnet': [cpy('title', 'Title', 80), med('cover', 'Cover image 1:1', '1:1', ['1:1'], ['image']), cpy('description', 'Description', 300)],
}

/** Provenance for each channel's spec: primary source, verified date, confidence. */
export interface SpecSource {
  url: string
  verified: string
  confidence?: 'medium' | 'low'
  note?: string
}

const PLATFORM = '2026-06'
export const CHANNEL_SOURCE: Record<ChannelId, SpecSource> = {
  'meta-ads': { url: 'facebook.com/business/ads-guide', verified: PLATFORM, note: 'Primary text/headline are recommended display lengths; hard limits much higher.' },
  'tiktok-ads': { url: 'ads.tiktok.com (Help Center)', verified: PLATFORM },
  'linkedin-ads': { url: 'linkedin.com/help/lms/answer/a426534', verified: PLATFORM },
  'x-ads': { url: 'business.x.com (creative ad specs)', verified: PLATFORM },
  'pinterest-ads': { url: 'help.pinterest.com (product specs)', verified: PLATFORM },
  'snapchat-ads': { url: 'forbusiness.snapchat.com/advertising/ad-formats', verified: PLATFORM },
  'reddit-ads': { url: 'business.reddithelp.com (ad unit specs)', verified: PLATFORM },
  'youtube-ads': { url: 'support.google.com/google-ads/answer/13676244', verified: PLATFORM, note: 'Headline limit varies by format; 15 shown is in-stream.' },
  'google-search': { url: 'support.google.com/google-ads/answer/7684791', verified: PLATFORM },
  'google-demand': { url: 'support.google.com/google-ads/answer/13704860', verified: PLATFORM, confidence: 'medium', note: 'Char limits vary by surface; verify in Ads UI.' },
  pmax: { url: 'support.google.com/google-ads/answer/17091269', verified: PLATFORM },
  instagram: { url: 'meta business / IG help', verified: PLATFORM },
  facebook: { url: 'meta business / FB help', verified: PLATFORM },
  linkedin: { url: 'linkedin.com help', verified: PLATFORM },
  x: { url: 'business.x.com', verified: PLATFORM },
  tiktok: { url: 'tiktok.com (caption limit raised to 4000, 2024)', verified: PLATFORM },
  youtube: { url: 'support.google.com/youtube/answer/12340300', verified: PLATFORM },
  pinterest: { url: 'help.pinterest.com', verified: PLATFORM },
  email: { url: 'ESP best practice (Mailchimp/HubSpot)', verified: PLATFORM, confidence: 'medium', note: 'Conventions, not a platform limit.' },
  sms: { url: 'GSM-7 segment = 160 chars (70 unicode); concatenates beyond.', verified: PLATFORM },
  push: { url: 'iOS/Android push guidance', verified: PLATFORM, confidence: 'medium', note: 'Truncation varies by device/OS.' },
  blog: { url: 'SEO best practice (title ~60, meta ~155)', verified: PLATFORM, confidence: 'medium' },
  'landing-page': { url: 'OG image 1200×630 (1.91:1)', verified: PLATFORM, confidence: 'medium' },
  'lead-magnet': { url: 'convention (no platform limit)', verified: PLATFORM, confidence: 'medium' },
}

const FALLBACK: AssetSlot[] = [med('media', 'Media', '1:1'), cpy('caption', 'Caption')]

export const slotsFor = (channel: ChannelId): AssetSlot[] => CHANNEL_ASSETS[channel] ?? FALLBACK

export const primarySlotKey = (channel: ChannelId): string => slotsFor(channel)[0]?.key ?? 'media'

export const slotLabel = (channel: ChannelId, key?: string): string =>
  slotsFor(channel).find((s) => s.key === key)?.label ?? key ?? '—'

/** Short human spec string for a slot, e.g. "1:1" or "≤125 (rec), 2200 max". */
export function slotSpec(slot: AssetSlot): string {
  if (slot.kind === 'media') {
    const ratios = slot.ratios && slot.ratios.length > 1 ? slot.ratios.join(' · ') : slot.preferredRatio
    return [ratios, slot.count ? `up to ${slot.count}` : ''].filter(Boolean).join(' · ')
  }
  const parts: string[] = []
  if (slot.recommended) parts.push(`${slot.recommended} rec`)
  if (slot.hardLimit) parts.push(`${slot.hardLimit} max`)
  if (slot.count) parts.push(`up to ${slot.count}`)
  return parts.join(' · ') || 'text'
}
