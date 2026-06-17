import type { ChannelId, TrafficRow } from './types'
import { slotsFor } from './channelAssets'

/**
 * One component of an asset's messaging — a named copy field with optional
 * recommended / hard char limits. The set per asset is defined explicitly
 * (a per-type schema), so the breakdown is predictable and maps to what each
 * platform expects.
 */
export interface MessagingField {
  key: string
  label: string
  recommended?: number
  hardLimit?: number
  multiline?: boolean
}

const isMultiline = (key: string) =>
  /body|description|primary|caption|post|message|intro|long|subhead/.test(key)

const f = (
  key: string,
  label: string,
  recommended?: number,
  hardLimit?: number,
  multiline = isMultiline(key),
): MessagingField => ({ key, label, recommended, hardLimit, multiline })

// Per-channel default = the verified copy fields from channelAssets (so the
// researched char limits drive the messaging breakdown).
function channelDefault(channel: ChannelId): MessagingField[] {
  const copy = slotsFor(channel)
    .filter((s) => s.kind === 'copy')
    .map((s) => f(s.key, s.label, s.recommended, s.hardLimit))
  return copy.length ? copy : [f('headline', 'Headline', undefined, 80), f('body', 'Body'), f('cta', 'CTA button', undefined, 30)]
}

// Explicit per-type overrides where an asset type's components differ from the
// channel default. Keyed `${channel}:${assetType}`; unspecified types inherit
// the channel default.
const OVERRIDES: Record<string, MessagingField[]> = {
  'meta-ads:carousel': [f('primary', 'Primary text', 125, 2200), f('card1', 'Card 1 headline', 40), f('card2', 'Card 2 headline', 40), f('card3', 'Card 3 headline', 40), f('description', 'Description', 30)],
  'meta-ads:collection': [f('primary', 'Primary text', 125, 2200), f('headline', 'Headline', 40), f('description', 'Description', 30), f('cta', 'CTA button', undefined, 30)],
  'meta-ads:video': [f('primary', 'Primary text', 125, 2200), f('headline', 'Headline', 40), f('description', 'Description', 30)],
  'google-search:rsa': [f('h1', 'Headline 1', undefined, 30), f('h2', 'Headline 2', undefined, 30), f('h3', 'Headline 3', undefined, 30), f('d1', 'Description 1', undefined, 90), f('d2', 'Description 2', undefined, 90)],
  'landing-page:lead-capture': [f('headline', 'Headline', undefined, 60), f('subhead', 'Subhead', undefined, 120), f('body', 'Body'), f('cta', 'CTA button', undefined, 30)],
  'landing-page:sales': [f('headline', 'Headline', undefined, 60), f('subhead', 'Subhead', undefined, 120), f('body', 'Body'), f('proof', 'Social proof', undefined, 200), f('cta', 'CTA button', undefined, 30)],
  'email:newsletter': [f('subject', 'Subject line', 60), f('preview', 'Preview text', 100), f('body', 'Body'), f('cta', 'CTA', undefined, 30)],
  'email:promotional': [f('subject', 'Subject line', 60), f('preview', 'Preview text', 100), f('headline', 'Hero headline', undefined, 60), f('body', 'Body'), f('cta', 'CTA', undefined, 30)],
  'lead-magnet:ebook': [f('title', 'Title', 80), f('subtitle', 'Subtitle', undefined, 120), f('description', 'Description', 300)],
  'tiktok:video': [f('caption', 'Caption', undefined, 2200), f('hook', 'On-screen hook', undefined, 60)],
}

/** The messaging component fields for an asset, by its channel + type. */
export function messagingFields(channel: ChannelId, assetType?: string): MessagingField[] {
  if (assetType) {
    const override = OVERRIDES[`${channel}:${assetType}`]
    if (override) return override
  }
  return channelDefault(channel)
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
  // fall back to anything present (e.g. a component not in the current schema)
  return Object.values(m).find((v) => v.trim()) ?? ''
}

export const primaryFieldKey = (channel: ChannelId, assetType?: string): string =>
  messagingFields(channel, assetType)[0]?.key ?? 'body'
