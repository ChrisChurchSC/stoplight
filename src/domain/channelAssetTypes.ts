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
  'spotify-ads': [t('audio', 'Audio ad (30s)'), t('audio-15', 'Audio ad (15s)'), t('video-takeover', 'Video takeover'), t('podcast', 'Podcast placement')],
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
  // product / solutions / comparison were on the website DELIVERABLE_PRESETS and missing from here, so
  // seedCampaignAssets coerced all three to the channel's primary type and a "Product / feature page"
  // deliverable produced homepages. A test now asserts every preset's assetType exists in its channel.
  // 'login' is appended, never prepended: primaryTypeKey takes [0], and the closing-channels
  // invariant resolves a playbook band from funnelStageFor(channel, primaryType). Moving it to
  // the front would retype the channel as retention and invert the funnel on the canvas.
  website: [t('homepage', 'Homepage'), t('page', 'Web page'), t('product', 'Product / feature page'), t('pricing', 'Pricing page'), t('solutions', 'Solutions page'), t('comparison', 'Comparison page'), t('about', 'About page'), t('login', 'Login page')],
  blog: [t('article', 'Article'), t('pillar', 'Long-form guide/pillar'), t('listicle', 'Listicle'), t('case-study', 'Case study')],
  'landing-page': [t('lead-capture', 'Lead capture page'), t('sales', 'Sales/offer page'), t('webinar-reg', 'Webinar/event registration'), t('waitlist', 'Waitlist/coming soon')],
  'lead-magnet': [t('ebook', 'Ebook'), t('whitepaper', 'Whitepaper'), t('checklist', 'Checklist'), t('template', 'Template'), t('webinar', 'Webinar'), t('cheat-sheet', 'Cheat sheet')],
  events: [t('screening', 'Screening'), t('panel', 'Panel / talk'), t('popup', 'Pop-up / activation'), t('workshop', 'Workshop')],
  // sales & commerce — the assets a flow needs to actually close
  'sales-outreach': [t('cold-email', 'Cold email'), t('follow-up', 'Follow-up email'), t('linkedin-dm', 'LinkedIn DM'), t('sequence', 'Sequence / cadence'), t('call-script', 'Call script'), t('voicemail', 'Voicemail script'), t('break-up', 'Break-up email')],
  'sales-collateral': [t('deck', 'Sales deck'), t('one-pager', 'One-pager'), t('case-study', 'Case study pack'), t('battlecard', 'Battlecard'), t('roi', 'ROI / value calculator'), t('demo-script', 'Demo script'), t('objection', 'Objection / FAQ doc'), t('security', 'Security / compliance pack')],
  proposal: [t('proposal', 'Proposal'), t('quote', 'Quote / pricing sheet'), t('sow', 'Scope of work'), t('contract', 'Contract / order form'), t('action-plan', 'Mutual action plan'), t('recap', 'Deal recap email')],
  checkout: [t('cart', 'Cart page'), t('checkout', 'Checkout page'), t('plan-selector', 'Pricing / plan selector'), t('order-bump', 'Order bump'), t('upsell', 'Upsell / cross-sell'), t('trust', 'Trust & guarantee block'), t('promo', 'Promo / discount offer')],
  'post-purchase': [t('confirmation', 'Confirmation / thank-you page'), t('onboarding', 'Onboarding / setup guide'), t('review-request', 'Review request'), t('referral', 'Referral offer'), t('upsell', 'Post-purchase upsell'), t('survey', 'NPS / feedback survey')],
}

const FALLBACK: AssetType[] = [t('post', 'Post')]

/** Asset types valid for a channel, with the Other/custom escape hatch appended. */
export const typesFor = (channel: ChannelId): AssetType[] => [
  ...(CHANNEL_TYPES[channel] ?? FALLBACK),
  OTHER_TYPE,
]

export const primaryTypeKey = (channel: ChannelId): string =>
  (CHANNEL_TYPES[channel] ?? FALLBACK)[0].value

/**
 * A USER-DEFINED FORMAT, recognisable by its shape alone.
 *
 * Custom formats are stored per brand, which means recognition through the store would depend on
 * hydration order, on sync having happened, and on being the same device. The six places that decide
 * "keep this type or fall back to the channel's primary" must never get that wrong, because falling
 * back silently retypes somebody's asset. So the prefix IS the contract: x- means preserve it,
 * decided by looking at the string and nothing else.
 *
 * No colon, because messaging.ts keys its OVERRIDES map as `${channel}:${assetType}`.
 */
export const CUSTOM_TYPE_PREFIX = 'x-'
export const isCustomType = (value?: string): boolean => /^x-[a-z0-9_-]+$/i.test(value ?? '')

/**
 * Should this type survive, whatever we can and cannot name?
 *
 * Used ONLY by the sites that would otherwise coerce an unknown type to the channel's primary. It
 * deliberately does not consult anything: a custom format on a teammate's device, or before the
 * brand's slice has loaded, is still that person's format and must not be quietly rewritten.
 */
export const isPreservableType = (channel: ChannelId, value?: string): boolean =>
  isCustomType(value) || isKnownType(channel, value)

/** Can we NAME this type? Used by everything that renders a label or claims readiness. */
export const isKnownType = (channel: ChannelId, value?: string): boolean =>
  !!value && typesFor(channel).some((x) => x.value === value)

/** Kept as the old name so existing callers keep today's meaning: can we name it. */
export const isValidType = isKnownType

export const typeLabel = (channel: ChannelId, value?: string): string =>
  typesFor(channel).find((x) => x.value === value)?.label ?? (isCustomType(value) ? 'Custom format, missing' : '')


/**
 * A FORMAT SOMEBODY NAMED, stored per brand.
 *
 * Deliberately NOT read by typesFor or typeLabel, which stay pure. Making a pure function consult
 * hidden module state would give every one of its call sites a hydration-order dependency they
 * cannot see, and there are dozens. The UI merges these where it renders instead, and typeLabel's
 * honest fallback ("Custom format, missing") covers the case where it has not.
 *
 * A retired format keeps its row so posts using it can still be named. Hard deletion is only safe
 * when nothing references it, which nothing here can know.
 */
export interface OutputType {
  id: string
  brand: string
  channel: ChannelId
  /** Always x- prefixed, so isPreservableType recognises it without consulting this list. */
  value: string
  label: string
  createdAt: number
  retiredAt?: number
}

/** Turn a typed name into a stable, colon-free custom type value. */
export const customTypeValue = (label: string): string =>
  `${CUSTOM_TYPE_PREFIX}${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'format'}`
