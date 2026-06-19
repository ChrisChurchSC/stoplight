import type { ChannelId, TrafficRow } from './types'

/**
 * One component of an asset's messaging — a named copy field with optional
 * recommended / hard char limits. The set per asset is defined explicitly
 * (a per-type schema), so the breakdown matches what each asset type actually
 * needs: headline, primary text, description, CTA, etc.
 */
export interface MessagingField {
  key: string
  label: string
  recommended?: number
  hardLimit?: number
  multiline?: boolean
}

const f = (
  key: string,
  label: string,
  recommended?: number,
  hardLimit?: number,
  multiline = false,
): MessagingField => ({ key, label, recommended, hardLimit, multiline })

// Common component shorthands (keeps the schema below readable + consistent).
const cta = (max = 30) => f('cta', 'CTA', undefined, max)
const primary = (rec = 125, max = 2200) => f('primary', 'Primary text', rec, max, true)
const headline = (max = 40, rec?: number) => f('headline', 'Headline', rec, max)
const description = (max = 90) => f('description', 'Description', undefined, max, true)
const caption = (max = 2200) => f('caption', 'Caption', undefined, max, true)
const title = (rec?: number, max?: number) => f('title', 'Title', rec, max)
const body = (max?: number) => f('body', 'Body', undefined, max, true)
const subject = () => f('subject', 'Subject line', 60)
const preview = () => f('preview', 'Preview text', undefined, 100)
const subhead = () => f('subhead', 'Subhead', undefined, 120, true)

// Per-channel base component set — what most of that channel's asset types use.
// Paid/conversion channels carry a CTA; ad channels carry a description.
const BASE: Record<ChannelId, MessagingField[]> = {
  // paid — social
  'meta-ads': [primary(), headline(255, 40), description(30), cta(20)],
  'tiktok-ads': [f('caption', 'Caption', undefined, 100, true), cta(20)],
  'linkedin-ads': [f('intro', 'Intro text', 150, 600, true), headline(200, 70), description(100), cta(20)],
  'x-ads': [f('post', 'Post text', undefined, 280, true), cta(20)],
  'pinterest-ads': [title(40, 100), description(500), cta(20)],
  'snapchat-ads': [f('brand', 'Brand name', undefined, 25), headline(34), cta(20)],
  'reddit-ads': [title(80, 300), body(), cta(20)],
  'youtube-ads': [headline(15), description(35), cta(15)],
  // paid — search / shopping
  'google-search': [f('headline', 'Headline', undefined, 30), description(90), f('path', 'Display path', undefined, 15)],
  'google-demand': [headline(40), f('long-headline', 'Long headline', undefined, 90), description(90), f('business', 'Business name', undefined, 25), cta(15)],
  pmax: [headline(30), f('long-headline', 'Long headline', undefined, 90), description(90), f('business', 'Business name', undefined, 25), cta(15)],
  // organic — social (CTA lives in the caption; no separate field)
  instagram: [caption(2200)],
  facebook: [body(63206)],
  linkedin: [body(3000)],
  x: [f('post', 'Post', undefined, 280, true)],
  tiktok: [caption(2200)],
  youtube: [title(60, 100), description(5000)],
  pinterest: [title(40, 100), description(500)],
  // owned / lifecycle
  email: [subject(), preview(), headline(60), body(), cta(30)],
  sms: [f('message', 'Message', 160, 160, true), f('link', 'Link / CTA', undefined, 60)],
  push: [f('title', 'Title', 50, 65), f('body', 'Body', 150, 240, true), cta(25)],
  website: [f('headline', 'Headline', undefined, 60), subhead(), body(), cta(30)],
  blog: [f('title', 'SEO title', 60, 70), f('meta-description', 'Meta description', 155, 160, true), body()],
  'landing-page': [f('headline', 'Headline', undefined, 60), subhead(), body(), cta(30)],
  'lead-magnet': [title(80), f('description', 'Description', 300, undefined, true), cta(30)],
}

// Per-type overrides where a type's components differ from its channel base.
// Keyed `${channel}:${assetType}`; unspecified types inherit the channel base.
const OVERRIDES: Record<string, MessagingField[]> = {
  // Meta
  'meta-ads:carousel': [primary(), f('card1', 'Card 1 headline', undefined, 40), f('card2', 'Card 2 headline', undefined, 40), f('card3', 'Card 3 headline', undefined, 40), description(30), cta(20)],
  'meta-ads:collection': [primary(), f('collection-title', 'Collection title', undefined, 40), headline(40), description(30), cta(20)],
  'meta-ads:story': [f('primary', 'Primary text', 72, 125, true), cta(20)],
  'meta-ads:reel': [f('primary', 'Primary text', 72, 125, true), cta(20)],
  // LinkedIn ads
  'linkedin-ads:conversation': [f('message', 'Message text', undefined, 8000, true), f('cta1', 'CTA button 1', undefined, 25), f('cta2', 'CTA button 2', undefined, 25)],
  'linkedin-ads:document': [f('intro', 'Intro text', 150, 600, true), f('doc-title', 'Document title', undefined, 70), cta(20)],
  'linkedin-ads:thought-leader': [f('intro', 'Member intro', 150, 600, true), cta(20)],
  // Google search variants
  'google-search:rsa': [f('h1', 'Headline 1', undefined, 30), f('h2', 'Headline 2', undefined, 30), f('h3', 'Headline 3', undefined, 30), f('d1', 'Description 1', undefined, 90, true), f('d2', 'Description 2', undefined, 90, true), f('path', 'Display path', undefined, 15)],
  'google-search:call': [f('business', 'Business name', undefined, 25), f('h1', 'Headline 1', undefined, 30), f('h2', 'Headline 2', undefined, 30), f('d1', 'Description 1', undefined, 90, true)],
  'google-search:dsa': [f('d1', 'Description 1', undefined, 90, true), f('d2', 'Description 2', undefined, 90, true)],
  // Landing pages
  'landing-page:sales': [f('headline', 'Headline', undefined, 60), subhead(), body(), f('proof', 'Social proof', undefined, 200, true), cta(30)],
  'landing-page:webinar-reg': [f('headline', 'Headline', undefined, 60), f('when', 'Date / time', undefined, 60), body(), cta(30)],
  // Email
  'email:newsletter': [subject(), preview(), body(), cta(30)],
  'email:promotional': [subject(), preview(), f('headline', 'Hero headline', undefined, 60), body(), cta(30)],
  'email:welcome': [subject(), preview(), f('headline', 'Hero headline', undefined, 60), body(), cta(30)],
  // Lead magnets
  'lead-magnet:ebook': [title(80), f('subtitle', 'Subtitle', undefined, 120), f('description', 'Description', 300, undefined, true), cta(30)],
  'lead-magnet:webinar': [title(80), f('when', 'Date / time', undefined, 60), f('description', 'Description', 300, undefined, true), cta(30)],
  // TikTok organic
  'tiktok:video': [caption(2200), f('hook', 'On-screen hook', undefined, 60)],
  // YouTube organic
  'youtube:short': [title(60, 100), description(5000)],
}

const FALLBACK: MessagingField[] = [headline(80), body(), cta(30)]

/** The messaging component fields for an asset, by its channel + type. */
export function messagingFields(channel: ChannelId, assetType?: string): MessagingField[] {
  if (assetType) {
    const override = OVERRIDES[`${channel}:${assetType}`]
    if (override) return override
  }
  return BASE[channel] ?? FALLBACK
}

export const messagingMap = (row: TrafficRow): Record<string, string> => row.messaging ?? {}

/** All messaging text joined — for search and ICP evaluation. */
export const messagingAllText = (row: TrafficRow): string =>
  Object.values(messagingMap(row)).join(' ')

/** First non-empty component (or the first field) — for the collapsed summary. */
export function messagingSummary(row: TrafficRow): string {
  const fields = messagingFields(row.channel, row.assetType)
  const m = messagingMap(row)
  for (const fl of fields) {
    if (m[fl.key]?.trim()) return m[fl.key]
  }
  return Object.values(m).find((v) => v.trim()) ?? ''
}

export const primaryFieldKey = (channel: ChannelId, assetType?: string): string =>
  messagingFields(channel, assetType)[0]?.key ?? 'body'
