import type { ChannelId, MediaType } from './types'

/**
 * The assets a campaign needs to run each GTM strategy, mapped to Rushhour's
 * channel + asset-type taxonomy. Three kinds:
 *  - PAID (channel kind 'paid') → a flight that runs the whole campaign (a span
 *    on the calendar).
 *  - BRAND assets (`brand: true`) → built once, not monthly (landing pages,
 *    lead magnets, case studies, pillar guides, demo videos).
 *  - CONTENT (everything else) → produced on a monthly cadence (`perMonth`),
 *    repeating each month of the flight.
 * `perMonth` + `runtime` come from the workbook's "Cadence / mo" guidance.
 */
export type Runtime = 'always-on' | 'flight' | 'one-off'

export interface Deliverable {
  label: string
  channel: ChannelId
  assetType: string
  media: MediaType
  /** Monthly production cadence for CONTENT (1 = once a month). */
  perMonth: number
  runtime: Runtime
  /** Built once, not on a monthly cadence (landing pages, lead magnets, etc.). */
  brand?: boolean
}

export const RUNTIME_LABEL: Record<Runtime, string> = {
  'always-on': 'monthly',
  flight: 'for the flight',
  'one-off': 'one-off',
}

const d = (
  label: string,
  channel: ChannelId,
  assetType: string,
  media: MediaType,
  perMonth: number,
  runtime: Runtime,
  brand = false,
): Deliverable => ({ label, channel, assetType, media, perMonth, runtime, brand })

export const STRATEGY_ASSETS: Record<string, Deliverable[]> = {
  'demand-gen': [
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link', 1, 'one-off', true),
    d('Lead magnet (guide)', 'lead-magnet', 'ebook', 'link', 1, 'one-off', true),
    d('Search ad', 'google-search', 'rsa', 'text', 1, 'flight'),
    d('Meta prospecting ad', 'meta-ads', 'single-image', 'image', 1, 'flight'),
    d('Nurture email sequence', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Weekly newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('SEO blog article', 'blog', 'article', 'text', 4, 'always-on'),
    d('Case study', 'blog', 'case-study', 'text', 1, 'one-off', true),
  ],
  plg: [
    d('Welcome / onboarding email', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Trial → paid upgrade email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Pricing page', 'landing-page', 'sales', 'link', 1, 'one-off', true),
    d('Feature announcement email', 'email', 'announcement', 'text', 2, 'always-on'),
    d('Product launch blog post', 'blog', 'article', 'text', 1, 'always-on'),
    d('Referral landing page', 'landing-page', 'sales', 'link', 1, 'one-off', true),
  ],
  'sales-led': [
    d('Outbound nurture email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Webinar registration page', 'landing-page', 'webinar-reg', 'link', 1, 'one-off', true),
    d('Thought-leadership LinkedIn post', 'linkedin', 'text', 'text', 4, 'always-on'),
    d('Demo / explainer video', 'youtube', 'long-form', 'video', 1, 'one-off', true),
    d('Case study', 'blog', 'case-study', 'text', 1, 'one-off', true),
    d('Whitepaper', 'lead-magnet', 'whitepaper', 'link', 1, 'one-off', true),
  ],
  lifecycle: [
    d('Onboarding email series', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Product update newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('How-to tutorial article', 'blog', 'article', 'text', 4, 'always-on'),
    d('Adoption webinar', 'lead-magnet', 'webinar', 'link', 1, 'one-off', true),
    d('Renewal reminder email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Win-back / re-engagement email', 'email', 're-engagement', 'text', 1, 'always-on'),
  ],
  aarrr: [
    d('Acquisition ad', 'meta-ads', 'single-image', 'image', 1, 'flight'),
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link', 1, 'one-off', true),
    d('Onboarding email', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('Referral landing page', 'landing-page', 'sales', 'link', 1, 'one-off', true),
    d('Pricing page', 'landing-page', 'sales', 'link', 1, 'one-off', true),
  ],
  bowtie: [
    d('Acquisition ad', 'meta-ads', 'single-image', 'image', 1, 'flight'),
    d('Sales / landing page', 'landing-page', 'sales', 'link', 1, 'one-off', true),
    d('Onboarding email series', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Adoption webinar', 'lead-magnet', 'webinar', 'link', 1, 'one-off', true),
    d('Upsell / expansion email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Renewal reminder email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Win-back email', 'email', 're-engagement', 'text', 1, 'always-on'),
  ],
  abm: [
    d('LinkedIn account-targeted ad', 'linkedin-ads', 'single-image', 'image', 1, 'flight'),
    d('Display ad set', 'google-demand', 'image', 'image', 1, 'flight'),
    d('Vertical landing page', 'landing-page', 'lead-capture', 'link', 1, 'one-off', true),
    d('Personalized 1:1 email', 'email', 'nurture', 'text', 2, 'always-on'),
    d('Vertical case study', 'blog', 'case-study', 'text', 1, 'one-off', true),
    d('Custom demo video', 'youtube', 'long-form', 'video', 1, 'one-off', true),
  ],
  'content-seo': [
    d('Pillar guide', 'blog', 'pillar', 'text', 1, 'one-off', true),
    d('SEO article', 'blog', 'article', 'text', 4, 'always-on'),
    d('Comparison / BOFU listicle', 'blog', 'listicle', 'text', 2, 'always-on'),
    d('Gated ebook', 'lead-magnet', 'ebook', 'link', 1, 'one-off', true),
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link', 1, 'one-off', true),
    d('Newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
  ],
  outbound: [
    d('Cold email sequence', 'email', 'nurture', 'text', 1, 'always-on'),
    d('LinkedIn outreach post', 'linkedin', 'text', 'text', 4, 'always-on'),
    d('Booking / demo landing page', 'landing-page', 'lead-capture', 'link', 1, 'one-off', true),
    d('Follow-up email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('One-pager (lead magnet)', 'lead-magnet', 'whitepaper', 'link', 1, 'one-off', true),
  ],
  community: [
    d('Event promo (social)', 'instagram', 'feed', 'image', 2, 'always-on'),
    d('AMA / event landing page', 'landing-page', 'webinar-reg', 'link', 1, 'one-off', true),
    d('Member newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('UGC / testimonial post', 'instagram', 'feed', 'image', 2, 'always-on'),
    d('Member spotlight article', 'blog', 'article', 'text', 2, 'always-on'),
  ],
}
