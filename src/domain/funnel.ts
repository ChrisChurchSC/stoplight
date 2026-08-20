import type { ChannelId } from './types'

/**
 * The user flow (customer journey) an asset drives, derived from its channel.
 * The flow view lays these out left to right so you can see where a campaign's
 * content lands across the journey — and where it's thin.
 */
export type FunnelStage = 'awareness' | 'consideration' | 'conversion' | 'retention'

export const FUNNEL_STAGES: { stage: FunnelStage; label: string; hint: string }[] = [
  { stage: 'awareness', label: 'Awareness', hint: 'Reach new audiences' },
  { stage: 'consideration', label: 'Consideration', hint: 'Educate & nurture interest' },
  { stage: 'conversion', label: 'Conversion', hint: 'Capture intent & convert' },
  { stage: 'retention', label: 'Retention', hint: 'Keep & grow customers' },
]

const STAGE_BY_CHANNEL: Record<ChannelId, FunnelStage> = {
  // Top of funnel — broad reach, prospecting.
  'meta-ads': 'awareness',
  'tiktok-ads': 'awareness',
  'x-ads': 'awareness',
  'pinterest-ads': 'awareness',
  'snapchat-ads': 'awareness',
  'reddit-ads': 'awareness',
  'youtube-ads': 'awareness',
  'spotify-ads': 'awareness',
  instagram: 'awareness',
  facebook: 'awareness',
  x: 'awareness',
  tiktok: 'awareness',
  youtube: 'awareness',
  pinterest: 'awareness',
  // A cold email is a first touch like any other: the channel's primary type is
  // 'cold-email', so the channel reaches. Its follow-ups nurture (see the
  // type-aware override below).
  'sales-outreach': 'awareness',
  // Mid funnel — education, nurture, demand gen.
  'linkedin-ads': 'consideration',
  'google-demand': 'consideration',
  linkedin: 'consideration',
  blog: 'consideration',
  website: 'consideration',
  'lead-magnet': 'consideration',
  events: 'consideration',
  // Bottom funnel — high intent, conversion. The sales + commerce surfaces are
  // what actually closes a flow: the collateral worked in a live deal, the
  // proposal that asks for the signature, the checkout that takes the money.
  'google-search': 'conversion',
  pmax: 'conversion',
  'landing-page': 'conversion',
  'sales-collateral': 'conversion',
  proposal: 'conversion',
  checkout: 'conversion',
  // Post-conversion — lifecycle, retention.
  email: 'retention',
  sms: 'retention',
  push: 'retention',
  'post-purchase': 'retention',
}

/**
 * The funnel stage an asset sits in. Mostly channel-driven, with a few
 * type-aware overrides where the same channel spans stages — a YouTube demo /
 * explainer educates (consideration) rather than reaches (awareness), and a blog
 * case study is conversion proof rather than top-of-funnel content.
 */
export const funnelStageFor = (channel: ChannelId, assetType?: string): FunnelStage => {
  if (channel === 'youtube')
    return assetType === 'short' || assetType === 'community' ? 'awareness' : 'consideration'
  if (channel === 'blog' && assetType === 'case-study') return 'conversion'
  // A login page is the one website page that talks to people who already bought. Left on the
  // channel default it would sit in consideration and be briefed like a page that has to
  // persuade, which is how it ends up carrying social proof and objection handling.
  if (channel === 'website' && assetType === 'login') return 'retention'
  // A first touch is a first touch even when a rep sends it: cold outreach reaches
  // (the channel default), and everything that comes after it nurtures.
  if (channel === 'sales-outreach')
    return assetType === 'follow-up' ||
      assetType === 'call-script' ||
      assetType === 'voicemail' ||
      assetType === 'break-up'
      ? 'consideration'
      : 'awareness'
  // A pricing page is a decision surface, not education. A contact page is the same call one step
  // further on: nobody fills in a contact form to learn something, so it closes rather than educates.
  if (channel === 'website' && (assetType === 'pricing' || assetType === 'comparison' || assetType === 'contact'))
    return 'conversion'
  // Events span the funnel far more widely than one channel default can hold. A premiere, a booth
  // and a conference talk all put you in front of a room that was never your list, so they reach
  // rather than educate. A private dinner is eight people who came to decide, which is a close.
  // Meetup is deliberately left on the channel default: a community night both recruits and keeps
  // people, and consideration is the honest middle rather than a guess in either direction.
  if (channel === 'events') {
    // Awareness is the band for an event whose room somebody else assembled. A press release is
    // the limit case: there is no room, and the audience it reaches belongs to whoever runs it.
    if (
      assetType === 'premiere' ||
      assetType === 'booth' ||
      assetType === 'conference-talk' ||
      assetType === 'press-release'
    )
      return 'awareness'
    if (assetType === 'dinner') return 'conversion'
  }
  if (channel === 'email') {
    // Lifecycle emails (onboarding, win-back) are post-conversion; nurture /
    // newsletter / announcement drive prospects to content + offers, so they sit
    // in the funnel and tie forward to the assets they promote.
    if (assetType === 'welcome' || assetType === 're-engagement') return 'retention'
    if (assetType === 'promotional') return 'conversion'
    return 'consideration'
  }
  return STAGE_BY_CHANNEL[channel] ?? 'awareness'
}
