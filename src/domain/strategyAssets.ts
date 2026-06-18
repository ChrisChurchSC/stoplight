import type { ChannelId, MediaType } from './types'

/**
 * The assets a campaign needs to run each GTM strategy, mapped to Rushhour's
 * channel + asset-type taxonomy. Selecting a strategy in the new-client wizard
 * pre-checks these; whatever stays checked is seeded into the spreadsheet as
 * draft rows. Derived from the GTM Strategy Benchmarks workbook's per-stage
 * "Assets (output)" + "Channels to build" (planning guidance, editable).
 */
export interface Deliverable {
  label: string
  channel: ChannelId
  assetType: string
  media: MediaType
}

const d = (label: string, channel: ChannelId, assetType: string, media: MediaType): Deliverable => ({
  label,
  channel,
  assetType,
  media,
})

export const STRATEGY_ASSETS: Record<string, Deliverable[]> = {
  'demand-gen': [
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link'),
    d('Lead magnet (guide)', 'lead-magnet', 'ebook', 'link'),
    d('Search ad', 'google-search', 'rsa', 'text'),
    d('Meta prospecting ad', 'meta-ads', 'single-image', 'image'),
    d('Nurture email sequence', 'email', 'nurture', 'text'),
    d('Weekly newsletter', 'email', 'newsletter', 'text'),
    d('SEO blog article', 'blog', 'article', 'text'),
    d('Case study', 'blog', 'case-study', 'text'),
  ],
  plg: [
    d('Welcome / onboarding email', 'email', 'welcome', 'text'),
    d('Trial → paid upgrade email', 'email', 'nurture', 'text'),
    d('Pricing page', 'landing-page', 'sales', 'link'),
    d('Feature announcement email', 'email', 'announcement', 'text'),
    d('Product launch blog post', 'blog', 'article', 'text'),
    d('Referral landing page', 'landing-page', 'sales', 'link'),
  ],
  'sales-led': [
    d('Outbound nurture email', 'email', 'nurture', 'text'),
    d('Webinar registration page', 'landing-page', 'webinar-reg', 'link'),
    d('Thought-leadership LinkedIn post', 'linkedin', 'text', 'text'),
    d('Demo / explainer video', 'youtube', 'long-form', 'video'),
    d('Case study', 'blog', 'case-study', 'text'),
    d('Whitepaper', 'lead-magnet', 'whitepaper', 'link'),
  ],
  lifecycle: [
    d('Onboarding email series', 'email', 'welcome', 'text'),
    d('Product update newsletter', 'email', 'newsletter', 'text'),
    d('How-to tutorial article', 'blog', 'article', 'text'),
    d('Adoption webinar', 'lead-magnet', 'webinar', 'link'),
    d('Renewal reminder email', 'email', 'nurture', 'text'),
    d('Win-back / re-engagement email', 'email', 're-engagement', 'text'),
  ],
  aarrr: [
    d('Acquisition ad', 'meta-ads', 'single-image', 'image'),
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link'),
    d('Onboarding email', 'email', 'welcome', 'text'),
    d('Newsletter', 'email', 'newsletter', 'text'),
    d('Referral landing page', 'landing-page', 'sales', 'link'),
    d('Pricing page', 'landing-page', 'sales', 'link'),
  ],
  bowtie: [
    d('Acquisition ad', 'meta-ads', 'single-image', 'image'),
    d('Sales / landing page', 'landing-page', 'sales', 'link'),
    d('Onboarding email series', 'email', 'welcome', 'text'),
    d('Adoption webinar', 'lead-magnet', 'webinar', 'link'),
    d('Upsell / expansion email', 'email', 'nurture', 'text'),
    d('Renewal reminder email', 'email', 'nurture', 'text'),
    d('Win-back email', 'email', 're-engagement', 'text'),
  ],
  abm: [
    d('LinkedIn account-targeted ad', 'linkedin-ads', 'single-image', 'image'),
    d('Display ad set', 'google-demand', 'image', 'image'),
    d('Vertical landing page', 'landing-page', 'lead-capture', 'link'),
    d('Personalized 1:1 email', 'email', 'nurture', 'text'),
    d('Vertical case study', 'blog', 'case-study', 'text'),
    d('Custom demo video', 'youtube', 'long-form', 'video'),
  ],
  'content-seo': [
    d('Pillar guide', 'blog', 'pillar', 'text'),
    d('SEO article', 'blog', 'article', 'text'),
    d('Comparison / BOFU listicle', 'blog', 'listicle', 'text'),
    d('Gated ebook', 'lead-magnet', 'ebook', 'link'),
    d('Lead-capture landing page', 'landing-page', 'lead-capture', 'link'),
    d('Newsletter', 'email', 'newsletter', 'text'),
  ],
  outbound: [
    d('Cold email sequence', 'email', 'nurture', 'text'),
    d('LinkedIn outreach post', 'linkedin', 'text', 'text'),
    d('Booking / demo landing page', 'landing-page', 'lead-capture', 'link'),
    d('Follow-up email', 'email', 'nurture', 'text'),
    d('One-pager (lead magnet)', 'lead-magnet', 'whitepaper', 'link'),
  ],
  community: [
    d('Event promo (social)', 'instagram', 'feed', 'image'),
    d('AMA / event landing page', 'landing-page', 'webinar-reg', 'link'),
    d('Member newsletter', 'email', 'newsletter', 'text'),
    d('UGC / testimonial post', 'instagram', 'feed', 'image'),
    d('Member spotlight article', 'blog', 'article', 'text'),
  ],
}
