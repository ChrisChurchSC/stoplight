import type { ChannelId } from './types'

/**
 * Email pattern library — reusable structures for email/newsletter deliverables. A
 * blueprint codifies a campaign type's recommended shape: a sequence of emails (or, for a
 * newsletter, one email's content blocks), each with a message-arc label, timing, a subject
 * formula, a copy framework, one dominant CTA, and the persuasion levers that are honest to
 * use. Applying a blueprint to a deliverable seeds its per-slot briefs, which the copy
 * writer already turns into distinct, on-arc copy.
 *
 * Grounded in the marketing-email research brief (welcome + newsletter first).
 */

export type CopyFramework = 'AIDA' | 'PAS' | 'BAB' | 'FAB' | '4Ps' | 'Scannable'
export type PersuasionLever = 'social-proof' | 'time-scarcity' | 'quantity-scarcity' | 'exclusivity' | 'none'

export interface EmailStep {
  /** Message-arc label, e.g. "Welcome + value" or "Hero feature". */
  label: string
  /** When it sends (sequence) or where it sits (newsletter block). */
  timing: string
  /** Fill-in-the-blank subject formula with {slots}. */
  subjectFormula: string
  framework: CopyFramework
  /** The single dominant CTA to lead with. */
  cta: string
  levers: PersuasionLever[]
  /** The focus line seeded into the deliverable's per-slot briefs. */
  brief: string
}

export interface EmailBlueprint {
  key: string
  name: string
  channel: ChannelId
  assetType: string
  /** 'sequence' = each step is its own email; 'single' = steps are blocks inside one email. */
  kind: 'sequence' | 'single'
  summary: string
  /** Human cadence note, e.g. "3-5 emails over 7-14 days". */
  cadence: string
  steps: EmailStep[]
  /** Best-practice constraints to surface as the blueprint's guardrails. */
  guardrails: string[]
}

const WELCOME: EmailBlueprint = {
  key: 'welcome',
  name: 'Welcome series',
  channel: 'email',
  assetType: 'welcome',
  kind: 'sequence',
  summary: 'Convert a fresh, high-intent subscriber into a first purchase and set expectations. The highest open rates of any email type.',
  cadence: '5 emails over 7-14 days',
  steps: [
    {
      label: 'Welcome + value',
      timing: 'Immediately',
      subjectFormula: 'Welcome to {brand} — here’s {offer}',
      framework: 'AIDA',
      cta: 'Shop now',
      levers: ['none'],
      brief: 'Immediate welcome. Deliver the promised value or discount up front, set expectations for what’s coming, and lead with one clear CTA. Use the subscriber’s name.',
    },
    {
      label: 'Brand story',
      timing: 'Day 2-3',
      subjectFormula: 'The story behind {brand}',
      framework: 'BAB',
      cta: 'Discover our story',
      levers: ['none'],
      brief: 'Brand story and mission. Why we exist and what we stand for. Build affinity, keep it low-pressure, no hard sell.',
    },
    {
      label: 'Social proof',
      timing: 'Day 5-7',
      subjectFormula: 'What everyone’s loving right now',
      framework: '4Ps',
      cta: 'Shop bestsellers',
      levers: ['social-proof'],
      brief: 'Social proof and bestsellers. Lead with reviews, ratings, and most-loved products to validate quality and build desire.',
    },
    {
      label: 'Product education',
      timing: 'Day 7-10',
      subjectFormula: '{first_name}, find your perfect fit',
      framework: 'FAB',
      cta: 'Find your fit',
      levers: ['none'],
      brief: 'Product education or preference capture. Help them find the right product for them (a quiz, a guide, or a fit finder). Features → advantages → why it matters to them.',
    },
    {
      label: 'Final offer reminder',
      timing: 'Day 10-14',
      subjectFormula: 'Last chance: your {offer} expires soon',
      framework: 'PAS',
      cta: 'Redeem before it’s gone',
      levers: ['time-scarcity'],
      brief: 'Final reminder that the welcome offer is about to expire. One genuine deadline, one CTA. Only use if the offer really has an end date.',
    },
  ],
  guardrails: [
    'Deliver value before asking for anything.',
    'Use the subscriber’s name in the subject and first line.',
    'One dominant CTA per email.',
    'Never send daily — space emails 2-3 days apart.',
    'Only use the expiry urgency if the welcome offer really expires.',
  ],
}

const NEWSLETTER: EmailBlueprint = {
  key: 'newsletter',
  name: 'Newsletter',
  channel: 'email',
  assetType: 'newsletter',
  kind: 'single',
  summary: 'Sustain engagement and keep the brand top-of-mind. Single-column and scannable: one hero feature plus a few short blocks.',
  cadence: 'Weekly or bi-weekly',
  steps: [
    {
      label: 'Hero feature',
      timing: 'Top',
      subjectFormula: 'This week at {brand}: {hook}',
      framework: 'Scannable',
      cta: 'Read more',
      levers: ['none'],
      brief: 'The lead story. One hero feature with a short, curiosity-led intro and a single link. This is the reason to open.',
    },
    {
      label: 'Content block',
      timing: 'Middle',
      subjectFormula: '{number} things worth your time',
      framework: 'Scannable',
      cta: 'Read more',
      levers: ['none'],
      brief: 'A secondary block: a heading, one or two sentences, and a link. Skimmable and self-contained.',
    },
    {
      label: 'Content block',
      timing: 'Middle',
      subjectFormula: 'Question that names the reader’s interest',
      framework: 'Scannable',
      cta: 'Read more',
      levers: ['none'],
      brief: 'Another short block: heading, a sentence, a link. Vary the topic from the block above.',
    },
    {
      label: 'Primary CTA',
      timing: 'Bottom',
      subjectFormula: '—',
      framework: 'Scannable',
      cta: 'See what’s new',
      levers: ['none'],
      brief: 'One primary call to action for the whole issue, after the content blocks.',
    },
  ],
  guardrails: [
    'Single-column, scannable layout.',
    'One hero feature, then 2-3 short content blocks (heading + a sentence + a link each).',
    'Newsletters are the CTA exception: each block gets its own text link, plus one primary CTA.',
    'Keep a consistent template issue to issue.',
    'Cadence weekly or bi-weekly, not daily.',
  ],
}

const ABANDONED_CART: EmailBlueprint = {
  key: 'abandoned-cart',
  name: 'Abandoned cart',
  channel: 'email',
  assetType: 'nurture',
  kind: 'sequence',
  summary: 'Recover the ~70% of carts abandoned before checkout. The highest revenue-per-recipient of any flow.',
  cadence: '3 emails over 72 hours',
  steps: [
    { label: 'Reminder', timing: '1 hour', subjectFormula: 'You forgot something', framework: 'AIDA', cta: 'Return to cart', levers: ['none'], brief: 'Pure cart reminder within an hour. Show the product and what they left behind. No discount yet.' },
    { label: 'Objection + proof', timing: '24 hours', subjectFormula: 'Still thinking it over?', framework: 'PAS', cta: 'Complete your order', levers: ['social-proof'], brief: 'Address objections and add social proof (reviews, guarantees, free returns). Still no discount; reinforce value.' },
    { label: 'Incentive', timing: '72 hours', subjectFormula: 'Here’s {discount} off — but hurry', framework: '4Ps', cta: 'Claim your discount', levers: ['time-scarcity'], brief: 'Now offer a time-limited incentive (free shipping or a small discount). One genuine deadline.' },
  ],
  guardrails: [
    'Send the first email within an hour.',
    'Reserve the discount for the last email so you don’t train abandonment.',
    'Stop the flow by day 6.',
    'One dominant CTA per email.',
    'Exclude anyone who completed checkout.',
  ],
}

const BROWSE_ABANDONMENT: EmailBlueprint = {
  key: 'browse-abandonment',
  name: 'Browse abandonment',
  channel: 'email',
  assetType: 'nurture',
  kind: 'sequence',
  summary: 'Re-engage visitors who viewed products but didn’t add to cart. Higher in the funnel than cart, so a lighter touch.',
  cadence: '3 emails over ~5 days',
  steps: [
    { label: 'Reminder', timing: '1-4 hours', subjectFormula: 'See something you liked?', framework: 'AIDA', cta: 'Keep browsing', levers: ['none'], brief: 'Friendly reminder showing the products they viewed. No incentive; light touch.' },
    { label: 'Social proof', timing: '24-48 hours', subjectFormula: 'Others are loving these too', framework: '4Ps', cta: 'Take another look', levers: ['social-proof'], brief: 'Add social proof and optionally free shipping. Nudge without pressure.' },
    { label: 'Urgency', timing: '3-5 days', subjectFormula: 'Selling fast — don’t miss out', framework: 'PAS', cta: 'Shop before it’s gone', levers: ['quantity-scarcity'], brief: 'Light urgency (low stock or selling fast) with an optional small incentive.' },
  ],
  guardrails: [
    'Exclude anyone who added to cart or purchased.',
    'Lighter touch than cart — they only browsed.',
    'One CTA per email.',
    'Optional incentive only in the last email.',
  ],
}

const BACK_IN_STOCK: EmailBlueprint = {
  key: 'back-in-stock',
  name: 'Back in stock',
  channel: 'email',
  assetType: 'announcement',
  kind: 'single',
  summary: 'Convert waitlisted demand the moment inventory returns. Among the highest-converting triggered flows.',
  cadence: 'Fire within minutes of restock',
  steps: [
    { label: 'Restock alert', timing: 'On restock', subjectFormula: 'They’re back: {product}', framework: 'AIDA', cta: 'Shop now', levers: ['quantity-scarcity'], brief: 'Fire within minutes of restock — first to inbox wins. Name the product, one hero image, one urgency line (stock count or sell-out history), single CTA. Under ~100 words.' },
  ],
  guardrails: [
    'Send within minutes of restock.',
    'Keep it under ~100 words — get to the point.',
    'One honest urgency line: stock count or sell-out history.',
    'Single CTA.',
  ],
}

const PRODUCT_LAUNCH: EmailBlueprint = {
  key: 'product-launch',
  name: 'Product launch',
  channel: 'email',
  assetType: 'announcement',
  kind: 'sequence',
  summary: 'Build anticipation and drive launch-day plus follow-up sales. Curiosity → clarity → desire → urgency.',
  cadence: '4-8 emails over 7-14 days',
  steps: [
    { label: 'Teaser', timing: '7-14 days out', subjectFormula: 'Coming soon…', framework: 'AIDA', cta: 'Join the waitlist', levers: ['none'], brief: 'Teaser. Hint at what’s coming, build curiosity, link a waitlist.' },
    { label: 'Problem framing', timing: '5-6 days out', subjectFormula: 'The problem with {category}', framework: 'PAS', cta: 'See how we fixed it', levers: ['none'], brief: 'Frame the problem the new product solves. Agitate the pain of the status quo.' },
    { label: 'Solution preview', timing: '3-4 days out', subjectFormula: 'A first look', framework: 'BAB', cta: 'Get the first look', levers: ['none'], brief: 'Preview the solution and the story behind it. Before → after → the product is the bridge.' },
    { label: 'Early access', timing: '3-5 days out', subjectFormula: 'Early access, just for you', framework: '4Ps', cta: 'Shop early', levers: ['exclusivity'], brief: 'Give subscribers early / VIP access before the public launch.' },
    { label: 'Launch day', timing: 'Day of', subjectFormula: 'It’s here: {product}', framework: 'AIDA', cta: 'Shop the launch', levers: ['none'], brief: 'Launch day. Single clear CTA. It’s live.' },
    { label: 'Social proof', timing: '+1-2 days', subjectFormula: 'See what people are saying', framework: '4Ps', cta: 'Shop now', levers: ['social-proof'], brief: 'Follow up with early reviews and social proof.' },
    { label: 'Last chance', timing: 'Before offer ends', subjectFormula: 'Last chance on the launch offer', framework: 'PAS', cta: 'Shop before it’s gone', levers: ['time-scarcity'], brief: 'Final reminder if there’s a launch offer with an end date.' },
  ],
  guardrails: [
    'Move curiosity → clarity → desire → urgency across the arc.',
    'Cap at ~3 emails if you’re launching multiple products in a quarter.',
    'One CTA per email.',
    'Only use the last-chance urgency if the offer really expires.',
  ],
}

const FLASH_SALE: EmailBlueprint = {
  key: 'flash-sale',
  name: 'Sale / flash',
  channel: 'email',
  assetType: 'promotional',
  kind: 'sequence',
  summary: 'Drive immediate volume via a time-boxed discount. One offer, one deadline, one CTA.',
  cadence: '3 emails over 24-48 hours',
  steps: [
    { label: 'Announce', timing: 'Start', subjectFormula: '{discount} off starts now', framework: 'AIDA', cta: 'Shop the sale', levers: ['none'], brief: 'Announce the sale with the offer front and center. One offer, one deadline.' },
    { label: 'Reminder', timing: 'Mid', subjectFormula: 'Don’t miss {discount} off', framework: '4Ps', cta: 'Shop now', levers: ['time-scarcity'], brief: 'Mid-sale reminder. Restate the offer and the deadline.' },
    { label: 'Last chance', timing: 'Final hours', subjectFormula: 'Ends tonight: {discount} off', framework: 'PAS', cta: 'Shop before midnight', levers: ['time-scarcity'], brief: 'Final hours. Hard deadline, countdown, last call.' },
  ],
  guardrails: [
    'One offer, one deadline, one CTA.',
    'Use a real deadline — “ends tonight” or a countdown.',
    'A 24-48h window keeps the urgency honest.',
    'Cap last-chance to ~3 sends.',
  ],
}

const BFCM: EmailBlueprint = {
  key: 'bfcm',
  name: 'Seasonal / BFCM',
  channel: 'email',
  assetType: 'promotional',
  kind: 'sequence',
  summary: 'Capture a peak-intent shopping window. Teaser → early access → launch → reminder → last chance.',
  cadence: '5+ emails across the event',
  steps: [
    { label: 'Teaser', timing: '10-14 days out', subjectFormula: 'Black Friday is coming…', framework: 'AIDA', cta: 'Get notified', levers: ['none'], brief: 'Teaser. Build anticipation with a neutral hook, no offer details yet.' },
    { label: 'Early access', timing: '~6am', subjectFormula: 'Early access starts now', framework: '4Ps', cta: 'Shop early', levers: ['exclusivity'], brief: 'VIP early access before the public. Members-only framing.' },
    { label: 'Main announcement', timing: '~8am', subjectFormula: 'Up to {discount} off sitewide starts now', framework: 'AIDA', cta: 'Shop the sale', levers: ['none'], brief: 'The main event. Lead with the number. Bold and clear.' },
    { label: 'Reminder / resend', timing: '2-4pm', subjectFormula: 'Still going: {discount} off', framework: '4Ps', cta: 'Shop now', levers: ['social-proof'], brief: 'Reminder and non-opener resend, with a DIFFERENT subject line.' },
    { label: 'Last chance', timing: '6-8pm', subjectFormula: 'Ends tonight: {discount} off, free returns', framework: 'PAS', cta: 'Shop final hours', levers: ['time-scarcity'], brief: 'Final-hours crescendo. Urgency-led close.' },
  ],
  guardrails: [
    'Subject crescendo: neutral teaser → specific launch → urgency close.',
    'Lead with the number; most opens are on mobile.',
    'Resend to non-openers with a different subject line.',
    'One sale extension is strategic; two or more trains distrust.',
  ],
}

const POST_PURCHASE: EmailBlueprint = {
  key: 'post-purchase',
  name: 'Post-purchase',
  channel: 'email',
  assetType: 'nurture',
  kind: 'sequence',
  summary: 'Confirm, reassure, and drive the second purchase. Reduce buyer’s remorse and build LTV.',
  cadence: '5 emails over ~30 days',
  steps: [
    { label: 'Order confirmation', timing: 'Immediately', subjectFormula: 'Your order is confirmed', framework: 'FAB', cta: 'View your order', levers: ['none'], brief: 'Confirm the order, reassure, and set delivery expectations. Reduce buyer’s remorse.' },
    { label: 'Shipping / tracking', timing: 'On dispatch', subjectFormula: 'Your order is on the way', framework: 'FAB', cta: 'Track your order', levers: ['none'], brief: 'Shipping and tracking update.' },
    { label: 'Product education', timing: '+3-7 days', subjectFormula: 'Getting the most from your {product}', framework: 'FAB', cta: 'See how', levers: ['none'], brief: 'How to use and get the most from the product. Build satisfaction and retention.' },
    { label: 'Review request', timing: '+7-14 days', subjectFormula: 'How’s your {product}?', framework: 'BAB', cta: 'Leave a review', levers: ['none'], brief: 'Ask for a review once they’ve had time to use it.' },
    { label: 'Replenish / cross-sell', timing: '+14-30 days', subjectFormula: 'Time to restock?', framework: '4Ps', cta: 'Reorder now', levers: ['none'], brief: 'Replenishment reminder (consumables) or a relevant cross-sell. Drive the second purchase.' },
  ],
  guardrails: [
    'Reduce buyer’s remorse first, sell second.',
    'Space the education and review asks.',
    'One CTA per email.',
    'Post-purchase suppresses win-back and sunset flows.',
  ],
}

const WIN_BACK: EmailBlueprint = {
  key: 'win-back',
  name: 'Win-back',
  channel: 'email',
  assetType: 'nurture',
  kind: 'sequence',
  summary: 'Reactivate inactive subscribers and protect deliverability. Apologetic, curious, sometimes humorous.',
  cadence: '5 emails over ~17 days',
  steps: [
    { label: 'Soft check-in', timing: 'Day 0', subjectFormula: 'We miss you', framework: 'BAB', cta: 'Come back', levers: ['none'], brief: 'Soft “we miss you” check-in. Curious, low pressure.' },
    { label: 'What they’ve missed', timing: 'Day 3-5', subjectFormula: 'Here’s what you’ve missed', framework: '4Ps', cta: 'See what’s new', levers: ['social-proof'], brief: 'Show what’s new and what they’ve missed. Remind them of the value.' },
    { label: 'Incentive', timing: 'Day 8-10', subjectFormula: 'We miss you — here’s {offer}', framework: 'PAS', cta: 'Claim your offer', levers: ['none'], brief: 'A stronger-than-usual incentive (about your regular promo plus 10%).' },
    { label: 'Final warning', timing: 'Day 13-15', subjectFormula: 'Is this goodbye?', framework: 'PAS', cta: 'Stay subscribed', levers: ['time-scarcity'], brief: 'Final warning before sunset. One-click stay-subscribed.' },
    { label: 'Sunset', timing: 'Day 17', subjectFormula: 'You’ve been unsubscribed', framework: 'BAB', cta: 'Resubscribe', levers: ['none'], brief: 'Sunset confirmation with a one-click resubscribe. Protects deliverability.' },
  ],
  guardrails: [
    'Trigger at 60-90 days inactive (earlier converts better).',
    'Win-back discount ≈ your regular promo plus 10%.',
    'Space emails 3-5 days apart.',
    'Suppress from active-buyer and post-purchase flows.',
  ],
}

const VIP_LOYALTY: EmailBlueprint = {
  key: 'vip-loyalty',
  name: 'VIP / loyalty',
  channel: 'email',
  assetType: 'promotional',
  kind: 'sequence',
  summary: 'Reward and retain top customers and drive tier progression. Status and exclusivity over discount.',
  cadence: 'Ongoing, triggered by tier and events',
  steps: [
    { label: 'Early access', timing: 'On launch/sale', subjectFormula: 'Your early access is open', framework: '4Ps', cta: 'Shop early', levers: ['exclusivity'], brief: 'Early access to a launch or sale, before the public. Lead with status.' },
    { label: 'Members-only offer', timing: 'Periodic', subjectFormula: 'Members-only: {perk}', framework: 'AIDA', cta: 'Unlock your perk', levers: ['exclusivity'], brief: 'A members-only offer or perk. Status and exclusivity over discount.' },
    { label: 'Tier-progress nudge', timing: 'Triggered', subjectFormula: 'You’re {points} away from {tier}', framework: 'BAB', cta: 'See your status', levers: ['none'], brief: 'Nudge them toward the next tier. Progress and aspiration.' },
  ],
  guardrails: [
    'Lead with status and exclusivity, not discount.',
    'Use “early access”, “members-only”, “your {tier} status”.',
    'Reserve the best perks for the top tier.',
    'One CTA per email.',
  ],
}

const BIRTHDAY: EmailBlueprint = {
  key: 'birthday',
  name: 'Birthday / anniversary',
  channel: 'email',
  assetType: 'promotional',
  kind: 'sequence',
  summary: 'A personalized surprise-and-delight with a time-boxed gift. Warm, not salesy.',
  cadence: '1-2 emails around the date',
  steps: [
    { label: 'Heads-up', timing: 'A few days before', subjectFormula: 'Something special is coming, {first_name}', framework: 'AIDA', cta: 'Stay tuned', levers: ['none'], brief: 'Optional heads-up before the date. Build anticipation for their gift.' },
    { label: 'Day-of gift', timing: 'On the day', subjectFormula: 'Happy birthday, {first_name}! Here’s your gift', framework: 'AIDA', cta: 'Claim your gift', levers: ['time-scarcity'], brief: 'The day-of email with an exclusive, time-boxed gift. Warm and personal.' },
  ],
  guardrails: [
    'Personalize with their name.',
    'Time-box the gift with a clear expiry.',
    'Surprise and delight — keep it warm, not salesy.',
    'One CTA.',
  ],
}

export const EMAIL_BLUEPRINTS: EmailBlueprint[] = [
  WELCOME,
  NEWSLETTER,
  ABANDONED_CART,
  BROWSE_ABANDONMENT,
  BACK_IN_STOCK,
  PRODUCT_LAUNCH,
  FLASH_SALE,
  BFCM,
  POST_PURCHASE,
  WIN_BACK,
  VIP_LOYALTY,
  BIRTHDAY,
]

/** Blueprints available for a given channel + assetType (email welcome / newsletter for now). */
export function blueprintsFor(channel: ChannelId, assetType?: string): EmailBlueprint[] {
  if (channel !== 'email') return []
  return EMAIL_BLUEPRINTS.filter((b) => !assetType || b.assetType === assetType)
}

export function blueprintByKey(key: string): EmailBlueprint | undefined {
  return EMAIL_BLUEPRINTS.find((b) => b.key === key)
}

/** The blueprint step for slot `i` (rotates for a single-email blueprint). */
export function stepAt(bp: EmailBlueprint, i: number): EmailStep {
  return bp.kind === 'sequence' ? bp.steps[i % bp.steps.length] : bp.steps[0]
}

/** Lineage fields to seed on an email so it carries its blueprint step. `bp*` keys are
 *  display-only (excluded from the copy context); framework/subjectFormula/levers shape copy. */
export function stepLineage(bp: EmailBlueprint, i: number): Record<string, string> {
  const st = stepAt(bp, i)
  const out: Record<string, string> = { framework: st.framework, bpKey: bp.key, bpStep: st.label, bpTiming: st.timing }
  if (st.subjectFormula && st.subjectFormula !== '—') out.subjectFormula = st.subjectFormula
  const levers = st.levers.filter((l) => l !== 'none')
  if (levers.length) out.levers = levers.join(', ')
  return out
}

/** Lineage keys that are display-only and must NOT be fed into the copy context. */
export const BLUEPRINT_META_KEYS = ['bpKey', 'bpStep', 'bpTiming'] as const

/** Resolve a row's lineage back to its blueprint + step, for display. */
export function stepFromLineage(lineage?: Record<string, string>): { blueprint: EmailBlueprint; step: EmailStep } | null {
  const key = lineage?.bpKey
  const label = lineage?.bpStep
  if (!key) return null
  const bp = blueprintByKey(key)
  if (!bp) return null
  const step = bp.steps.find((s) => s.label === label) ?? bp.steps[0]
  return { blueprint: bp, step }
}
