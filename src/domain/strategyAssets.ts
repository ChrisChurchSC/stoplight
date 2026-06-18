import type { ChannelId, MediaType } from './types'

/**
 * The assets a campaign needs to run each GTM strategy, mapped to Rushhour's
 * channel + asset-type taxonomy. Selecting a strategy in the new-client wizard
 * pre-checks these; whatever stays checked is seeded into the spreadsheet.
 * `perMonth` + `runtime` come from the workbook's "Cadence / mo" guidance:
 * how many of each are needed per month, and how long each should run.
 */
export type Runtime = 'always-on' | 'flight' | 'one-off'

export interface Deliverable {
  label: string
  channel: ChannelId
  assetType: string
  media: MediaType
  /** How many of this piece are needed per month (1 = single/one-off). */
  perMonth: number
  /** How long it should run: ongoing, for the campaign flight, or once. */
  runtime: Runtime
}

export const RUNTIME_LABEL: Record<Runtime, string> = {
  'always-on': 'always-on',
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
): Deliverable => ({ label, channel, assetType, media, perMonth, runtime })

export const STRATEGY_ASSETS: Record<string, Deliverable[]> = {
  'demand-gen': [
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link', 1, 'always-on'),
    d('Lead magnet (guide)', 'lead-magnet', 'ebook', 'link', 1, 'one-off'),
    d('Search ad', 'google-search', 'rsa', 'text', 1, 'always-on'),
    d('Meta prospecting ad', 'meta-ads', 'single-image', 'image', 2, 'always-on'),
    d('Nurture email sequence', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Weekly newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('SEO blog article', 'blog', 'article', 'text', 4, 'always-on'),
    d('Case study', 'blog', 'case-study', 'text', 1, 'one-off'),
  ],
  plg: [
    d('Welcome / onboarding email', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Trial → paid upgrade email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Pricing page', 'landing-page', 'sales', 'link', 1, 'always-on'),
    d('Feature announcement email', 'email', 'announcement', 'text', 2, 'always-on'),
    d('Product launch blog post', 'blog', 'article', 'text', 1, 'one-off'),
    d('Referral landing page', 'landing-page', 'sales', 'link', 1, 'always-on'),
  ],
  'sales-led': [
    d('Outbound nurture email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Webinar registration page', 'landing-page', 'webinar-reg', 'link', 1, 'flight'),
    d('Thought-leadership LinkedIn post', 'linkedin', 'text', 'text', 4, 'always-on'),
    d('Demo / explainer video', 'youtube', 'long-form', 'video', 1, 'one-off'),
    d('Case study', 'blog', 'case-study', 'text', 1, 'one-off'),
    d('Whitepaper', 'lead-magnet', 'whitepaper', 'link', 1, 'one-off'),
  ],
  lifecycle: [
    d('Onboarding email series', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Product update newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('How-to tutorial article', 'blog', 'article', 'text', 4, 'always-on'),
    d('Adoption webinar', 'lead-magnet', 'webinar', 'link', 1, 'flight'),
    d('Renewal reminder email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Win-back / re-engagement email', 'email', 're-engagement', 'text', 1, 'always-on'),
  ],
  aarrr: [
    d('Acquisition ad', 'meta-ads', 'single-image', 'image', 2, 'always-on'),
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link', 1, 'always-on'),
    d('Onboarding email', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('Referral landing page', 'landing-page', 'sales', 'link', 1, 'always-on'),
    d('Pricing page', 'landing-page', 'sales', 'link', 1, 'always-on'),
  ],
  bowtie: [
    d('Acquisition ad', 'meta-ads', 'single-image', 'image', 2, 'always-on'),
    d('Sales / landing page', 'landing-page', 'sales', 'link', 1, 'always-on'),
    d('Onboarding email series', 'email', 'welcome', 'text', 1, 'always-on'),
    d('Adoption webinar', 'lead-magnet', 'webinar', 'link', 1, 'flight'),
    d('Upsell / expansion email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Renewal reminder email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('Win-back email', 'email', 're-engagement', 'text', 1, 'always-on'),
  ],
  abm: [
    d('LinkedIn account-targeted ad', 'linkedin-ads', 'single-image', 'image', 2, 'always-on'),
    d('Display ad set', 'google-demand', 'image', 'image', 2, 'always-on'),
    d('Vertical landing page', 'landing-page', 'lead-capture', 'link', 1, 'flight'),
    d('Personalized 1:1 email', 'email', 'nurture', 'text', 2, 'always-on'),
    d('Vertical case study', 'blog', 'case-study', 'text', 1, 'one-off'),
    d('Custom demo video', 'youtube', 'long-form', 'video', 1, 'one-off'),
  ],
  'content-seo': [
    d('Pillar guide', 'blog', 'pillar', 'text', 1, 'one-off'),
    d('SEO article', 'blog', 'article', 'text', 4, 'always-on'),
    d('Comparison / BOFU listicle', 'blog', 'listicle', 'text', 2, 'always-on'),
    d('Gated ebook', 'lead-magnet', 'ebook', 'link', 1, 'one-off'),
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link', 1, 'always-on'),
    d('Newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
  ],
  outbound: [
    d('Cold email sequence', 'email', 'nurture', 'text', 1, 'always-on'),
    d('LinkedIn outreach post', 'linkedin', 'text', 'text', 4, 'always-on'),
    d('Booking / demo landing page', 'landing-page', 'lead-capture', 'link', 1, 'always-on'),
    d('Follow-up email', 'email', 'nurture', 'text', 1, 'always-on'),
    d('One-pager (lead magnet)', 'lead-magnet', 'whitepaper', 'link', 1, 'one-off'),
  ],
  community: [
    d('Event promo (social)', 'instagram', 'feed', 'image', 2, 'always-on'),
    d('AMA / event landing page', 'landing-page', 'webinar-reg', 'link', 1, 'flight'),
    d('Member newsletter', 'email', 'newsletter', 'text', 4, 'always-on'),
    d('UGC / testimonial post', 'instagram', 'feed', 'image', 2, 'always-on'),
    d('Member spotlight article', 'blog', 'article', 'text', 2, 'always-on'),
  ],
}
