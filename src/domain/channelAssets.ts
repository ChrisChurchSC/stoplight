import type { ChannelId, MediaType } from './types'

/**
 * One asset a channel requires — either a media placement (with an aspect
 * ratio) or a copy field (with a char limit). The set per channel is what you
 * actually have to produce to ship a complete creative; it also feeds spec
 * validation and completeness tracking.
 */
export interface AssetSlot {
  key: string
  label: string
  kind: 'media' | 'copy'
  /** media slots: which media types are valid, and the target ratio. */
  mediaTypes?: MediaType[]
  ratio?: string
  /** copy slots: max characters (undefined = no limit, e.g. body). */
  charLimit?: number
}

const med = (
  key: string,
  label: string,
  ratio: string,
  mediaTypes: MediaType[] = ['image', 'video'],
): AssetSlot => ({ key, label, kind: 'media', ratio, mediaTypes })

const cpy = (key: string, label: string, charLimit?: number): AssetSlot => ({
  key,
  label,
  kind: 'copy',
  charLimit,
})

// The required asset set per channel. Media slots double as the variants you'd
// export per placement; copy slots are first-class (and reviewable) text assets.
export const CHANNEL_ASSETS: Record<ChannelId, AssetSlot[]> = {
  // paid — social
  'meta-ads': [med('feed-1x1', 'Feed 1:1', '1:1'), med('feed-4x5', 'Feed 4:5', '4:5'), med('story-9x16', 'Story/Reel 9:16', '9:16'), cpy('primary', 'Primary text', 125), cpy('headline', 'Headline', 40), cpy('description', 'Description', 30)],
  'tiktok-ads': [med('video-9x16', 'Video 9:16', '9:16', ['video']), cpy('caption', 'Caption', 100)],
  'linkedin-ads': [med('image-1x1', 'Image 1:1', '1:1'), cpy('intro', 'Intro text', 150), cpy('headline', 'Headline', 70)],
  'x-ads': [med('media-16x9', 'Media 16:9', '16:9'), cpy('body', 'Post text', 280)],
  'pinterest-ads': [med('pin-2x3', 'Pin 2:3', '2:3'), cpy('title', 'Title', 100), cpy('description', 'Description', 500)],
  'snapchat-ads': [med('video-9x16', 'Video 9:16', '9:16', ['video']), cpy('headline', 'Headline', 34)],
  'reddit-ads': [med('media-1x1', 'Media 1:1', '1:1'), cpy('title', 'Title', 300)],
  'youtube-ads': [med('video-16x9', 'Video 16:9', '16:9', ['video']), med('thumbnail', 'Thumbnail 16:9', '16:9', ['image']), cpy('headline', 'Headline', 15), cpy('description', 'Description', 35)],
  // paid — search / shopping
  'google-search': [cpy('headline-1', 'Headline 1', 30), cpy('headline-2', 'Headline 2', 30), cpy('headline-3', 'Headline 3', 30), cpy('desc-1', 'Description 1', 90), cpy('desc-2', 'Description 2', 90)],
  'google-demand': [med('image-1x1', 'Image 1:1', '1:1'), med('image-16x9', 'Image 16:9', '16:9'), cpy('headline', 'Headline', 40), cpy('description', 'Description', 90)],
  pmax: [med('image-1x1', 'Image 1:1', '1:1'), med('image-16x9', 'Image 16:9', '16:9'), med('logo', 'Logo 1:1', '1:1', ['image']), cpy('headline', 'Headline', 30), cpy('long-headline', 'Long headline', 90), cpy('description', 'Description', 90)],
  // organic — social
  instagram: [med('post-1x1', 'Post 1:1', '1:1'), med('story-9x16', 'Story 9:16', '9:16'), cpy('caption', 'Caption', 2200)],
  facebook: [med('post', 'Post 1.91:1', '1.91:1'), cpy('body', 'Body', 2000)],
  linkedin: [med('image', 'Image 1.91:1', '1.91:1'), cpy('body', 'Body', 3000)],
  x: [med('media', 'Media 16:9', '16:9'), cpy('post', 'Post', 280)],
  tiktok: [med('video-9x16', 'Video 9:16', '9:16', ['video']), cpy('caption', 'Caption', 2200)],
  youtube: [med('video-16x9', 'Video 16:9', '16:9', ['video']), med('thumbnail', 'Thumbnail 16:9', '16:9', ['image']), cpy('title', 'Title', 100), cpy('description', 'Description', 5000)],
  pinterest: [med('pin-2x3', 'Pin 2:3', '2:3'), cpy('title', 'Title', 100), cpy('description', 'Description', 500)],
  // owned / lifecycle
  email: [cpy('subject', 'Subject line', 60), cpy('preview', 'Preview text', 100), med('hero', 'Hero image', '16:9', ['image']), cpy('body', 'Body')],
  sms: [cpy('message', 'Message', 160)],
  push: [cpy('title', 'Title', 50), cpy('body', 'Body', 120), med('icon', 'Icon 1:1', '1:1', ['image'])],
  blog: [cpy('title', 'Title', 70), med('featured', 'Featured image', '16:9', ['image']), cpy('body', 'Body'), cpy('meta-description', 'Meta description', 160)],
  'landing-page': [med('hero', 'Hero image', '16:9', ['image']), med('og-image', 'OG image 1.91:1', '1.91:1', ['image']), cpy('headline', 'Headline', 60), cpy('body', 'Body')],
  'lead-magnet': [cpy('title', 'Title', 80), med('cover', 'Cover image', '1:1', ['image']), cpy('description', 'Description', 300)],
}

const FALLBACK: AssetSlot[] = [med('media', 'Media', '1:1'), cpy('caption', 'Caption')]

export const slotsFor = (channel: ChannelId): AssetSlot[] => CHANNEL_ASSETS[channel] ?? FALLBACK

export const primarySlotKey = (channel: ChannelId): string => slotsFor(channel)[0]?.key ?? 'media'

export const slotLabel = (channel: ChannelId, key?: string): string =>
  slotsFor(channel).find((s) => s.key === key)?.label ?? key ?? '—'
