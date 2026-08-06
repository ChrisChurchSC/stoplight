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
  // The hook lives in the video and the companion is a 300x60 image, neither is text —
  // the only copy YouTube takes is the headline (15), description (90), and CTA (10).
  'youtube-ads': [headline(15), description(90), cta(10)],
  'spotify-ads': [f('script', 'Audio script', undefined, 600, true), f('tagline', 'Companion tagline', undefined, 60), cta(25)],
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
  // The hook is in the video — the copy you actually enter to post is the title,
  // description, and (optionally) a pinned comment.
  youtube: [title(60, 100), description(5000), f('pinned', 'Pinned comment', undefined, 200, true)],
  pinterest: [title(40, 100), description(500)],
  // owned / lifecycle
  email: [subject(), preview(), headline(60), body(), cta(30)],
  sms: [f('message', 'Message', 160, 160, true), f('link', 'Link / CTA', undefined, 60)],
  push: [f('title', 'Title', 50, 65), f('body', 'Body', 150, 240, true), cta(25)],
  website: [
    f('headline', 'Hero headline', undefined, 60),
    subhead(),
    f('cta', 'Hero CTA', undefined, 30),
    body(),
    f('proof-social', 'Social proof', undefined, 200, true),
    f('proof-stat', 'Proof / stat', undefined, 120, true),
    f('cta-mid', 'Mid-page CTA', undefined, 30),
    f('faq', 'FAQ / objection', undefined, 300, true),
    f('cta-footer', 'Footer CTA', undefined, 30),
  ],
  blog: [f('title', 'SEO title', 60, 70), f('meta-description', 'Meta description', 155, 160, true), body(), f('key-takeaway', 'Key takeaway', undefined, 200, true), f('cta', 'In-article CTA', undefined, 30)],
  'landing-page': [
    f('headline', 'Hero headline', undefined, 60),
    subhead(),
    f('cta', 'Hero CTA', undefined, 30),
    body(),
    f('proof-social', 'Social proof', undefined, 200, true),
    f('proof-stat', 'Proof / stat', undefined, 120, true),
    f('cta-footer', 'Footer CTA', undefined, 30),
  ],
  'lead-magnet': [title(80), f('description', 'Description', 300, undefined, true), cta(30)],
  events: [f('name', 'Event name', undefined, 80), f('details', 'Details / RSVP copy', undefined, 300, true), cta(30)],
  // sales & commerce — closing copy: the ask, the terms, the reassurance.
  'sales-outreach': [
    subject(),
    f('opener', 'Opener / relevance', undefined, 200, true),
    f('body', 'Body', 400, 900, true),
    f('proof-stat', 'Proof / stat', undefined, 120, true),
    f('ask', 'Ask / CTA', undefined, 120),
  ],
  'sales-collateral': [
    title(undefined, 80),
    subhead(),
    body(),
    f('proof-social', 'Social proof', undefined, 200, true),
    f('proof-stat', 'Proof / stat', undefined, 120, true),
    cta(40),
  ],
  proposal: [
    title(undefined, 80),
    f('summary', 'Executive summary', undefined, 600, true),
    f('scope', 'Scope / deliverables', undefined, 900, true),
    f('price', 'Price / terms', undefined, 300, true),
    f('next', 'Next step', undefined, 120),
  ],
  checkout: [
    f('headline', 'Headline', undefined, 60),
    f('value', 'Value reassurance', undefined, 120, true),
    f('cta', 'Button label', undefined, 25),
    f('trust', 'Trust / guarantee', undefined, 160, true),
    f('objection', 'Objection handler', undefined, 200, true),
  ],
  'post-purchase': [
    f('headline', 'Headline', undefined, 60),
    body(),
    f('next', 'Next step', undefined, 120),
    cta(30),
  ],
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
  'landing-page:sales': [
    f('headline', 'Hero headline', undefined, 60),
    subhead(),
    f('cta', 'Hero CTA', undefined, 30),
    body(),
    f('proof', 'Social proof', undefined, 200, true),
    f('proof-logos', 'Customer logos / count', undefined, 80),
    f('proof-stat', 'Headline stat', undefined, 120, true),
    f('cta-mid', 'Mid-page CTA', undefined, 30),
    f('faq', 'FAQ / objection handling', undefined, 300, true),
    f('cta-footer', 'Footer CTA', undefined, 30),
  ],
  'landing-page:webinar-reg': [f('headline', 'Headline', undefined, 60), f('when', 'Date / time', undefined, 60), body(), cta(30)],
  // Website pages (persistent site pages, like the homepage)
  'website:product': [
    f('headline', 'Hero headline', undefined, 60),
    subhead(),
    f('cta', 'Hero CTA', undefined, 30),
    f('proof-social', 'Social proof', undefined, 200, true),
    f('body', 'Feature / how-it-works copy', undefined, undefined, true),
    f('proof-stat', 'Proof / stat', undefined, 120, true),
    f('cta-mid', 'Mid-page CTA', undefined, 30),
    f('faq', 'FAQ / objection', undefined, 300, true),
    f('cta-footer', 'Footer CTA', undefined, 30),
  ],
  'website:pricing': [
    f('headline', 'Hero headline', undefined, 60),
    subhead(),
    f('cta', 'Hero CTA', undefined, 30),
    f('proof-social', 'Social proof', undefined, 200, true),
    f('body', 'Tiers / what’s included / comparison', undefined, undefined, true),
    f('proof-stat', 'Guarantee / stat', undefined, 120, true),
    f('faq', 'Billing FAQ', undefined, 400, true),
    f('cta-footer', 'Footer CTA', undefined, 30),
  ],
  'website:solutions': [
    f('headline', 'Hero headline', undefined, 60),
    subhead(),
    f('cta', 'Hero CTA', undefined, 30),
    f('proof-social', 'Social proof', undefined, 200, true),
    f('body', 'Problem / solution / use-case copy', undefined, undefined, true),
    f('proof-stat', 'Outcome / stat', undefined, 120, true),
    f('cta-mid', 'Mid-page CTA', undefined, 30),
    f('faq', 'FAQ / objection', undefined, 300, true),
    f('cta-footer', 'Footer CTA', undefined, 30),
  ],
  'website:comparison': [
    f('headline', 'Hero headline', undefined, 60),
    subhead(),
    f('cta', 'Hero CTA', undefined, 30),
    f('proof-social', 'Social proof', undefined, 200, true),
    f('body', 'Comparison narrative / table intro', undefined, undefined, true),
    f('proof-stat', 'Proof / stat', undefined, 120, true),
    f('faq', 'FAQ', undefined, 300, true),
    f('cta-footer', 'Footer CTA', undefined, 30),
  ],
  // A login page is a door, not a pitch. Everything the website base carries — social proof,
  // mid-page CTA, objection handling — is noise between someone and their account, so the set
  // is the door itself plus the two ways through it that fail most often: a forgotten password
  // and a visitor who does not have an account yet.
  'website:login': [
    f('headline', 'Page title', undefined, 40),
    f('subhead', 'Supporting line', undefined, 90, true),
    f('cta', 'Sign-in button', undefined, 20),
    f('recovery', 'Forgot-password link', undefined, 30),
    f('signup', 'No account yet / sign-up prompt', undefined, 60),
    f('error', 'Failed sign-in message', undefined, 120, true),
    f('support', 'Help / contact line', undefined, 90, true),
  ],
  // Email
  'email:newsletter': [subject(), preview(), body(), cta(30)],
  'email:promotional': [subject(), preview(), f('headline', 'Hero headline', undefined, 60), body(), cta(30)],
  'email:welcome': [subject(), preview(), f('headline', 'Hero headline', undefined, 60), body(), cta(30)],
  // Lead magnets
  'lead-magnet:ebook': [title(80), f('subtitle', 'Subtitle', undefined, 120), f('description', 'Description', 300, undefined, true), cta(30)],
  'lead-magnet:webinar': [title(80), f('when', 'Date / time', undefined, 60), f('description', 'Description', 300, undefined, true), cta(30)],
  // Events whose copy is not an invitation. The events base is name + RSVP copy + CTA, which is
  // right for anything the audience opts into. These three are not that: at a booth and a talk the
  // room is already assembled and somebody else invited it, and a private dinner is invited by
  // name rather than announced. Left on the base, all three would be briefed to write RSVP copy
  // for an event nobody can RSVP to.
  'events:booth': [
    f('headline', 'Stand headline', undefined, 60),
    f('demo', 'What you show / demo', undefined, 200, true),
    f('offer', 'Offer at the stand', undefined, 120),
    f('qualifier', 'Qualifying question', undefined, 120),
    f('follow-up', 'Badge-scan follow-up', undefined, 300, true),
    f('cta', 'Stand CTA', undefined, 30),
  ],
  'events:conference-talk': [
    f('title', 'Talk title', undefined, 120),
    f('abstract', 'Abstract / session description', 300, 600, true),
    f('takeaways', 'Audience takeaways', undefined, 300, true),
    f('bio', 'Speaker bio', undefined, 300, true),
    f('slot', 'Track / session slot', undefined, 60),
    f('cta', 'Closing-slide CTA', undefined, 30),
  ],
  'events:dinner': [
    f('headline', 'Invitation line', undefined, 80),
    f('topic', 'Question on the table', undefined, 160),
    f('guests', 'Who else is at the table', undefined, 200, true),
    f('logistics', 'Date, venue, run of night', undefined, 200, true),
    f('cta', 'RSVP ask', undefined, 30),
  ],
  // A press release is not written to the audience, it is written to whoever might carry it, so
  // none of the base fields survive. The quote and the boilerplate are here because they are the
  // two parts an editor lifts verbatim, and the contact because a release with nobody to call
  // does not get followed up.
  'events:press-release': [
    f('headline', 'Headline', undefined, 100),
    f('dateline', 'Dateline (city, date)', undefined, 60),
    f('lead', 'Lead: what happened, and why now', 250, 400, true),
    f('quote', 'Quote and attribution', undefined, 300, true),
    f('details', 'Supporting detail', undefined, 600, true),
    f('boilerplate', 'Boilerplate: about the brand', undefined, 300, true),
    f('contact', 'Media contact', undefined, 120, true),
  ],
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

/**
 * Trim a component's copy to its field's hard limit, at a word boundary when one is
 * reasonably close to the cap (else a clean hard cut), dropping any trailing
 * punctuation. A safety net so a model overrun never yields an over-length field —
 * headlines and SEO titles especially, where "really long" reads as broken. No-op when
 * the field has no hard limit or the value already fits.
 */
export function clampToLimit(value: string, field?: MessagingField): string {
  const max = field?.hardLimit
  if (!max || value.length <= max) return value
  const cut = value.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return trimmed.replace(/[\s,;:.!?-]+$/, '').trim()
}

export const messagingMap = (row: TrafficRow): Record<string, string> => row.messaging ?? {}

/** All messaging text joined — for search and ICP evaluation. */
export const messagingAllText = (row: TrafficRow): string =>
  Object.values(messagingMap(row)).join(' ')

/**
 * The components this row's FORMAT defines that actually carry text, and whether there are any.
 *
 * Distinct from messagingAllText, which joins EVERY stored key whether or not the current format
 * has one. Both readings are right for something — a search should find copy sitting under a key
 * the format dropped, and so should an ICP read — but "does this row have its copy yet" must be
 * asked of the components the row is actually supposed to have.
 *
 * It was asked three ways at once. The Messaging cell filtered by schema and said "Add messaging…";
 * the coverage bar above it and the ✦ Draft count joined every key and called the same row filled.
 * So an imported post whose text sits under `caption` on a format that defines title/description
 * read as empty in its own cell, counted as complete in the bar, and was never offered to Draft.
 */
export const filledFields = (row: TrafficRow) =>
  messagingFields(row.channel, row.assetType).filter((f) => (messagingMap(row)[f.key] ?? '').trim())

export const hasCopy = (row: TrafficRow): boolean => filledFields(row).length > 0

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

/** An asset's CTA value, if it carries one as its own field (organic posts fold
 *  the CTA into the body, so they return ''). Used by the sidebar CTA filter. */
/** True for any component that reads as a CTA — covers multi-CTA pages
 *  (cta, cta-hero, cta-mid, cta-footer, cta1/cta2) and the SMS link. */
export const isCtaField = (key: string): boolean => /cta/i.test(key) || key === 'link'

export function assetCta(row: TrafficRow): string {
  const m = messagingMap(row)
  // First CTA-ish component in schema order — the asset's primary CTA.
  for (const fld of messagingFields(row.channel, row.assetType)) {
    if (isCtaField(fld.key) && m[fld.key]?.trim()) return m[fld.key].trim()
  }
  // Channels with no dedicated CTA slot (organic posts fold it into the caption)
  // store a hand-added CTA on a generic `cta` key.
  return m.cta?.trim() ?? ''
}
