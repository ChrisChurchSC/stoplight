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
/** The nine motions a deliverable can belong to. Every preset below carries exactly one. */
export type DeliverableGroup =
  | 'Social'
  | 'Email & lifecycle'
  | 'Content & SEO'
  | 'Web'
  | 'Paid'
  | 'Video'
  | 'Lead magnets'
  | 'Events'
  | 'Sales & commerce'

/**
 * THE colour table for the nine motions, and the only one. A motion's toolbar icon, the cards
 * its deliverables become, those cards' chips, ports and selection rings all read from here, so
 * a paid ad is the same red in the palette as it is on the board.
 *
 * ⚠️ Tone is derived from `group`, never stored on a preset. An earlier per-preset `tone` field
 * held five generic hues against eight motions, so it collided (Web and Paid were both "gold",
 * Content and Lead magnets both "green") and the cards ended up saying something different from
 * the palette that made them. Add a motion here and to DeliverableGroup, and nothing can drift.
 */
export const GROUP_TONE: Record<DeliverableGroup, string> = {
  Social: '#2f6fe0',
  'Email & lifecycle': '#0e8f7d',
  'Content & SEO': '#7a52d1',
  Web: '#c2410c',
  Paid: '#c9302c',
  Video: '#8a34d6',
  'Lead magnets': '#b8860b',
  Events: '#0f766e',
  'Sales & commerce': '#4f46e5',
}

/** Social blue is the fallback: it is what an unknown channel used to get, and still should. */
export const toneForGroup = (group: string): string => GROUP_TONE[group as DeliverableGroup] ?? GROUP_TONE.Social

export const toneForPreset = (preset: DeliverablePreset): string => toneForGroup(preset.group)

export interface DeliverablePreset {
  key: string
  label: string
  channel: ChannelId
  assetType: string
  media: MediaType
  runtime: Runtime
  perMonth: number
  group: DeliverableGroup
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
  /** Applied email blueprint key (welcome / newsletter); drives the per-slot briefs. */
  blueprint?: string
}

export const DELIVERABLE_PRESETS: DeliverablePreset[] = [
  // Social (organic)
  { key: 'ig-feed', label: 'Instagram feed post', channel: 'instagram', assetType: 'feed', media: 'image', runtime: 'always-on', perMonth: 4, group: 'Social' },
  { key: 'ig-reel', label: 'Instagram reel', channel: 'instagram', assetType: 'reel', media: 'video', runtime: 'always-on', perMonth: 4, group: 'Social' },
  { key: 'ig-carousel', label: 'Instagram carousel', channel: 'instagram', assetType: 'carousel', media: 'image', runtime: 'always-on', perMonth: 2, group: 'Social' },
  { key: 'ig-story', label: 'Instagram story', channel: 'instagram', assetType: 'story', media: 'image', runtime: 'always-on', perMonth: 8, group: 'Social' },
  { key: 'fb-post', label: 'Facebook post', channel: 'facebook', assetType: 'image', media: 'image', runtime: 'always-on', perMonth: 3, group: 'Social' },
  { key: 'li-text', label: 'LinkedIn post', channel: 'linkedin', assetType: 'text', media: 'text', runtime: 'always-on', perMonth: 4, group: 'Social' },
  { key: 'li-image', label: 'LinkedIn image post', channel: 'linkedin', assetType: 'single-image', media: 'image', runtime: 'always-on', perMonth: 2, group: 'Social' },
  { key: 'li-doc', label: 'LinkedIn document', channel: 'linkedin', assetType: 'document', media: 'image', runtime: 'always-on', perMonth: 1, group: 'Social' },
  { key: 'li-poll', label: 'LinkedIn poll', channel: 'linkedin', assetType: 'poll', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Social' },
  { key: 'x-post', label: 'X post', channel: 'x', assetType: 'text', media: 'text', runtime: 'always-on', perMonth: 8, group: 'Social' },
  { key: 'x-thread', label: 'X thread', channel: 'x', assetType: 'thread', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Social' },
  { key: 'tiktok', label: 'TikTok video', channel: 'tiktok', assetType: 'video', media: 'video', runtime: 'always-on', perMonth: 4, group: 'Social' },
  { key: 'tiktok-photo', label: 'TikTok photo carousel', channel: 'tiktok', assetType: 'photo', media: 'image', runtime: 'always-on', perMonth: 2, group: 'Social' },
  { key: 'pin-standard', label: 'Pinterest pin', channel: 'pinterest', assetType: 'standard', media: 'image', runtime: 'always-on', perMonth: 4, group: 'Social' },
  { key: 'yt-community', label: 'YouTube community post', channel: 'youtube', assetType: 'community', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Social' },
  // Video
  { key: 'yt-long', label: 'YouTube long-form', channel: 'youtube', assetType: 'long-form', media: 'video', runtime: 'always-on', perMonth: 1, group: 'Video' },
  { key: 'yt-short', label: 'YouTube Short', channel: 'youtube', assetType: 'short', media: 'video', runtime: 'always-on', perMonth: 4, group: 'Video' },
  { key: 'fb-video', label: 'Facebook video', channel: 'facebook', assetType: 'video', media: 'video', runtime: 'always-on', perMonth: 2, group: 'Video' },
  // Paid (a flight, not a monthly cadence)
  { key: 'meta-image', label: 'Meta single-image ad', channel: 'meta-ads', assetType: 'single-image', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'meta-video', label: 'Meta video ad', channel: 'meta-ads', assetType: 'video', media: 'video', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'meta-carousel', label: 'Meta carousel ad', channel: 'meta-ads', assetType: 'carousel', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'li-ad', label: 'LinkedIn sponsored ad', channel: 'linkedin-ads', assetType: 'single-image', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'google-search-ad', label: 'Google search ad', channel: 'google-search', assetType: 'rsa', media: 'text', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'pmax', label: 'Performance Max', channel: 'pmax', assetType: 'image-group', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'yt-skippable', label: 'YouTube skippable ad', channel: 'youtube-ads', assetType: 'skippable', media: 'video', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'tiktok-ad', label: 'TikTok in-feed ad', channel: 'tiktok-ads', assetType: 'in-feed', media: 'video', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'spotify-ad', label: 'Spotify audio ad', channel: 'spotify-ads', assetType: 'audio', media: 'text', runtime: 'flight', perMonth: 1, group: 'Paid' },
  // The rest of the paid roster. These channels were defined in CHANNELS and had asset types in
  // channelAssetTypes, but no preset — so they existed everywhere EXCEPT the one place you pick a
  // channel from. A picker that calls itself the channel list has to be able to reach all of it.
  { key: 'x-ad', label: 'X image ad', channel: 'x-ads', assetType: 'image', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'pinterest-ad', label: 'Pinterest pin ad', channel: 'pinterest-ads', assetType: 'standard', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'snapchat-ad', label: 'Snapchat single ad', channel: 'snapchat-ads', assetType: 'single', media: 'video', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'reddit-ad', label: 'Reddit image ad', channel: 'reddit-ads', assetType: 'image', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  { key: 'google-demand-ad', label: 'Google Demand Gen ad', channel: 'google-demand', assetType: 'image', media: 'image', runtime: 'flight', perMonth: 1, group: 'Paid' },
  // Email & lifecycle
  { key: 'newsletter', label: 'Newsletter', channel: 'email', assetType: 'newsletter', media: 'text', runtime: 'always-on', perMonth: 4, group: 'Email & lifecycle' },
  { key: 'nurture', label: 'Nurture email', channel: 'email', assetType: 'nurture', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Email & lifecycle' },
  { key: 'promo-email', label: 'Promotional email', channel: 'email', assetType: 'promotional', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Email & lifecycle' },
  { key: 'welcome-email', label: 'Welcome email', channel: 'email', assetType: 'welcome', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Email & lifecycle' },
  { key: 'announcement', label: 'Announcement email', channel: 'email', assetType: 'announcement', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Email & lifecycle' },
  { key: 'sms', label: 'SMS campaign', channel: 'sms', assetType: 'promotional', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Email & lifecycle' },
  { key: 'push', label: 'Push notification', channel: 'push', assetType: 'promotional', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Email & lifecycle' },
  // Content & SEO
  { key: 'blog', label: 'Blog article', channel: 'blog', assetType: 'article', media: 'text', runtime: 'always-on', perMonth: 4, group: 'Content & SEO' },
  { key: 'pillar', label: 'Pillar guide', channel: 'blog', assetType: 'pillar', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Content & SEO' },
  { key: 'listicle', label: 'Listicle', channel: 'blog', assetType: 'listicle', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Content & SEO' },
  // Lead magnets (built once)
  { key: 'ebook', label: 'Ebook', channel: 'lead-magnet', assetType: 'ebook', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', brand: true },
  { key: 'webinar', label: 'Webinar', channel: 'lead-magnet', assetType: 'webinar', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', brand: true },
  { key: 'checklist', label: 'Checklist', channel: 'lead-magnet', assetType: 'checklist', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', brand: true },
  { key: 'whitepaper', label: 'Whitepaper', channel: 'lead-magnet', assetType: 'whitepaper', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Lead magnets', brand: true },
  // Web (built once)
  { key: 'homepage', label: 'Homepage', channel: 'website', assetType: 'homepage', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'product-page', label: 'Product / feature page', channel: 'website', assetType: 'product', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'pricing-page', label: 'Pricing page', channel: 'website', assetType: 'pricing', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'solutions-page', label: 'Solutions / use-case page', channel: 'website', assetType: 'solutions', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'comparison-page', label: 'Comparison / vs page', channel: 'website', assetType: 'comparison', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'login-page', label: 'Login page', channel: 'website', assetType: 'login', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'landing', label: 'Landing page', channel: 'landing-page', assetType: 'lead-capture', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'sales-page', label: 'Sales / offer page', channel: 'landing-page', assetType: 'sales', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  { key: 'case-study', label: 'Case study', channel: 'blog', assetType: 'case-study', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Web', brand: true },
  // Events. Mostly built once, with one standing exception: a meetup is a series, and giving it
  // 'one-off' would have priced a monthly community night as a single night's work.
  //
  // 'popup' shipped as an asset type with no preset here, so "Pop-up / activation" could be chosen
  // from the Type dropdown on an asset that already existed but could never be started from the
  // Events palette, which is drawn from this list. Its three siblings all had one; nothing
  // explained the gap. (An uncovered type is normal across the app — most ad-format variants have
  // no preset by design — so this is an inconsistency inside one group, not a missing invariant.)
  { key: 'screening', label: 'Screening', channel: 'events', assetType: 'screening', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  { key: 'panel', label: 'Panel / talk', channel: 'events', assetType: 'panel', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  { key: 'popup', label: 'Pop-up / activation', channel: 'events', assetType: 'popup', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  { key: 'workshop', label: 'Workshop', channel: 'events', assetType: 'workshop', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  { key: 'premiere', label: 'Premiere / launch night', channel: 'events', assetType: 'premiere', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  { key: 'roundtable-dinner', label: 'Roundtable / private dinner', channel: 'events', assetType: 'dinner', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  { key: 'meetup', label: 'Meetup / community night', channel: 'events', assetType: 'meetup', media: 'text', runtime: 'always-on', perMonth: 1, group: 'Events', brand: true },
  { key: 'trade-show-booth', label: 'Trade show booth / stand', channel: 'events', assetType: 'booth', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  { key: 'conference-talk', label: 'Conference talk', channel: 'events', assetType: 'conference-talk', media: 'text', runtime: 'one-off', perMonth: 1, group: 'Events', brand: true },
  // Sales & commerce — the deliverables that close a flow. Everything above hands a
  // person over to something; until these existed there was nothing to hand them to,
  // so a campaign stopped at the landing page.
  { key: 'outreach-sequence', label: 'Outreach sequence', channel: 'sales-outreach', assetType: 'sequence', media: 'text', runtime: 'always-on', perMonth: 2, group: 'Sales & commerce' },
  { key: 'cold-email', label: 'Cold email', channel: 'sales-outreach', assetType: 'cold-email', media: 'text', runtime: 'always-on', perMonth: 4, group: 'Sales & commerce' },
  { key: 'sales-deck', label: 'Sales deck', channel: 'sales-collateral', assetType: 'deck', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Sales & commerce', brand: true },
  { key: 'sales-one-pager', label: 'One-pager', channel: 'sales-collateral', assetType: 'one-pager', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Sales & commerce', brand: true },
  { key: 'proposal-doc', label: 'Proposal', channel: 'proposal', assetType: 'proposal', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Sales & commerce', brand: true },
  { key: 'checkout-page', label: 'Checkout page', channel: 'checkout', assetType: 'checkout', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Sales & commerce', brand: true },
  { key: 'cart-page', label: 'Cart page', channel: 'checkout', assetType: 'cart', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Sales & commerce', brand: true },
  { key: 'thank-you-page', label: 'Confirmation / thank-you page', channel: 'post-purchase', assetType: 'confirmation', media: 'link', runtime: 'one-off', perMonth: 1, group: 'Sales & commerce', brand: true },
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
