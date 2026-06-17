import type { ChannelId } from './types'

/**
 * A channel-specific asset-type category (Single image ad, Newsletter, Ebook…).
 * `value` is the stable identifier (what the sheet stores); `label` is the
 * friendly display. `platformValue` holds a platform/ad-ops format identifier
 * when an integration needs an exact name — empty for now (labels only).
 *
 * This is the single source of truth for the Type dropdown and Type-column
 * validation. Edit here to extend the taxonomy — no code changes needed.
 */
export interface AssetType {
  value: string
  label: string
  platformValue?: string
}

const t = (value: string, label: string, platformValue?: string): AssetType => ({
  value,
  label,
  platformValue,
})

/** Always-available escape hatch so users aren't blocked by a missing format. */
export const OTHER_TYPE: AssetType = t('other', 'Other / custom')

export const CHANNEL_TYPES: Record<ChannelId, AssetType[]> = {
  // paid — social ads
  'meta-ads': [t('single-image', 'Single image ad'), t('carousel', 'Carousel ad'), t('video', 'Video ad'), t('story', 'Story ad'), t('reel', 'Reel ad'), t('collection', 'Collection ad')],
  'tiktok-ads': [t('in-feed', 'In-feed video ad'), t('spark', 'Spark ad'), t('topview', 'TopView'), t('carousel', 'Carousel ad')],
  'linkedin-ads': [t('single-image', 'Single image ad'), t('carousel', 'Carousel ad'), t('video', 'Video ad'), t('document', 'Document ad'), t('thought-leader', 'Thought leader ad'), t('conversation', 'Conversation ad')],
  'x-ads': [t('image', 'Image ad'), t('video', 'Video ad'), t('carousel', 'Carousel ad'), t('text', 'Text ad')],
  'pinterest-ads': [t('standard', 'Standard pin ad'), t('video', 'Video pin ad'), t('carousel', 'Carousel ad'), t('collection', 'Collection ad'), t('idea', 'Idea ad')],
  'snapchat-ads': [t('single', 'Single image/video ad'), t('story', 'Story ad'), t('collection', 'Collection ad'), t('dynamic', 'Dynamic ad')],
  'reddit-ads': [t('image', 'Image ad'), t('video', 'Video ad'), t('carousel', 'Carousel ad'), t('text', 'Text ad')],
  'youtube-ads': [t('skippable', 'Skippable in-stream'), t('non-skippable', 'Non-skippable in-stream'), t('bumper', 'Bumper ad'), t('in-feed', 'In-feed video ad'), t('shorts', 'Shorts ad')],
  // paid — search / shopping
  'google-search': [t('rsa', 'Responsive search ad'), t('call', 'Call ad'), t('dsa', 'Dynamic search ad')],
  'google-demand': [t('image', 'Image ad'), t('video', 'Video ad'), t('carousel', 'Carousel ad'), t('product', 'Product ad')],
  pmax: [t('image-group', 'Asset group (image)'), t('video-group', 'Asset group (video)'), t('product-feed', 'Product feed')],
  // organic — social
  instagram: [t('feed', 'Feed post'), t('carousel', 'Carousel'), t('reel', 'Reel'), t('story', 'Story')],
  facebook: [t('text', 'Text post'), t('image', 'Image post'), t('video', 'Video post'), t('link', 'Link post'), t('reel', 'Reel'), t('story', 'Story')],
  linkedin: [t('text', 'Text post'), t('single-image', 'Single image post'), t('document', 'Document/carousel post'), t('video', 'Video post'), t('poll', 'Poll'), t('event', 'Event')],
  x: [t('text', 'Text post'), t('image', 'Image post'), t('video', 'Video post'), t('poll', 'Poll'), t('thread', 'Thread')],
  tiktok: [t('video', 'Video'), t('photo', 'Photo carousel'), t('story', 'Story')],
  youtube: [t('long-form', 'Long-form video'), t('short', 'Short'), t('live', 'Live stream'), t('community', 'Community post')],
  pinterest: [t('standard', 'Standard pin'), t('video', 'Video pin'), t('idea', 'Idea pin'), t('carousel', 'Carousel pin')],
  // owned / lifecycle
  email: [t('newsletter', 'Newsletter'), t('nurture', 'Nurture/drip email'), t('promotional', 'Promotional email'), t('announcement', 'Announcement'), t('welcome', 'Welcome email'), t('re-engagement', 'Re-engagement email')],
  sms: [t('promotional', 'Promotional SMS'), t('transactional', 'Transactional SMS'), t('reminder', 'Reminder'), t('alert', 'Alert')],
  push: [t('promotional', 'Promotional push'), t('transactional', 'Transactional push'), t('reminder', 'Reminder')],
  blog: [t('article', 'Article'), t('pillar', 'Long-form guide/pillar'), t('listicle', 'Listicle'), t('case-study', 'Case study')],
  'landing-page': [t('lead-capture', 'Lead capture page'), t('sales', 'Sales/offer page'), t('webinar-reg', 'Webinar/event registration'), t('waitlist', 'Waitlist/coming soon')],
  'lead-magnet': [t('ebook', 'Ebook'), t('whitepaper', 'Whitepaper'), t('checklist', 'Checklist'), t('template', 'Template'), t('webinar', 'Webinar'), t('cheat-sheet', 'Cheat sheet')],
}

const FALLBACK: AssetType[] = [t('post', 'Post')]

/** Asset types valid for a channel, with the Other/custom escape hatch appended. */
export const typesFor = (channel: ChannelId): AssetType[] => [
  ...(CHANNEL_TYPES[channel] ?? FALLBACK),
  OTHER_TYPE,
]

export const primaryTypeKey = (channel: ChannelId): string =>
  (CHANNEL_TYPES[channel] ?? FALLBACK)[0].value

export const isValidType = (channel: ChannelId, value?: string): boolean =>
  !!value && typesFor(channel).some((x) => x.value === value)

export const typeLabel = (channel: ChannelId, value?: string): string =>
  typesFor(channel).find((x) => x.value === value)?.label ?? ''
