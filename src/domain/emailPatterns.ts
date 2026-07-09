import type { ChannelId } from './types'

/**
 * Content pattern library — reusable structures for email and web-page deliverables. A
 * blueprint codifies a type's recommended shape: an email SEQUENCE (welcome, cart, launch,
 * …), a SINGLE email's blocks (newsletter), or a web PAGE's ordered sections (sales /
 * lead-gen landing page). Each step carries a label, timing/position, a fill-in-the-blank
 * subject or value-prop formula, a copy framework, one dominant CTA, and the persuasion
 * levers that are honest to use. Applying a blueprint seeds a deliverable's per-slot briefs,
 * which the copy writer turns into distinct, on-structure copy.
 *
 * Grounded in the marketing-email and tech-website research briefs.
 */

export type CopyFramework = 'AIDA' | 'PAS' | 'BAB' | 'FAB' | '4Ps' | 'Scannable' | 'JTBD' | 'Category'
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
  /** 'sequence' = each step is its own email; 'single' = blocks inside one email;
   *  'page' = ordered sections inside one web page (the whole page is one deliverable). */
  kind: 'sequence' | 'single' | 'page'
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

// ---- Web page blueprints (the tech-website pattern library) ----
// A page is ONE deliverable; its steps are the ordered sections of the page.

const SALES_PAGE: EmailBlueprint = {
  key: 'sales-page',
  name: 'Product / sales page',
  channel: 'landing-page',
  assetType: 'sales',
  kind: 'page',
  summary: 'A benefit-led product page: promise → proof → action, top to bottom. The hero carries most of the load.',
  cadence: 'One page, section by section',
  steps: [
    { label: 'Hero', timing: 'Above the fold', subjectFormula: 'For {audience} who {need}, {brand} is the {category} that {benefit}', framework: 'Category', cta: 'Get started free', levers: ['none'], brief: 'The hero. One outcome-led headline that passes the 5-second what/who/do test, a subheadline that clarifies the mechanism or names the audience, a dominant primary CTA plus a low-commitment secondary, and a real product visual.' },
    { label: 'Social proof bar', timing: 'Below hero', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['social-proof'], brief: 'A logo strip or a hard stat ("Trusted by…", "Join 5,000+ teams") right under the hero to kill the credibility objection before it forms.' },
    { label: 'Problem / value', timing: 'Section 2', subjectFormula: '—', framework: 'PAS', cta: '—', levers: ['none'], brief: 'Name the pain or the outcome and set up why the product exists. Problem-led for pain-aware buyers.' },
    { label: 'Features as benefits', timing: 'Section 3', subjectFormula: '—', framework: 'FAB', cta: '—', levers: ['none'], brief: 'Translate each capability into an outcome (pain → feature → quantified result). Two to three sentences per block, scannable.' },
    { label: 'How it works', timing: 'Section 4', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['none'], brief: 'A 3-step sequence that reduces perceived effort ("Sign up → Connect → Ship").' },
    { label: 'Deeper proof', timing: 'Section 5', subjectFormula: '—', framework: '4Ps', cta: '—', levers: ['social-proof'], brief: 'Testimonials with a name, title, photo and a specific outcome, plus case-study metrics or ratings. Place it next to a CTA.' },
    { label: 'Offer / pricing', timing: 'Section 6', subjectFormula: '—', framework: 'Scannable', cta: 'See pricing', levers: ['none'], brief: 'The offer or a pricing summary. Three tiers, a highlighted middle, annual default, and a "starting at" anchor for enterprise.' },
    { label: 'FAQ', timing: 'Section 7', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['none'], brief: 'Handle the top objections. Doubles as SEO / schema real estate.' },
    { label: 'Final CTA', timing: 'Bottom', subjectFormula: '—', framework: 'AIDA', cta: 'Get started free', levers: ['none'], brief: 'A sharper restatement of the primary ask with a fresh angle, not a verbatim repeat of the hero button.' },
  ],
  guardrails: [
    'One dominant primary CTA plus a low-commitment secondary.',
    'Keep the hero headline to 2 lines on mobile so the CTA stays above the fold.',
    'Put the strongest proof near CTAs, never only at the bottom.',
    'Benefit before feature; 2-3 sentence paragraphs.',
    'Repeat the same primary CTA at hero, mid-page, and footer.',
  ],
}

const LEADGEN_PAGE: EmailBlueprint = {
  key: 'leadgen-page',
  name: 'Campaign / lead-gen page',
  channel: 'landing-page',
  assetType: 'lead-capture',
  kind: 'page',
  summary: 'A single-offer PPC landing page: navigation stripped, message-matched to the ad, one conversion goal.',
  cadence: 'One page, section by section',
  steps: [
    { label: 'Hero + form', timing: 'Above the fold', subjectFormula: 'We help {audience} {outcome} by {mechanism}', framework: 'JTBD', cta: 'Get the {offer}', levers: ['none'], brief: 'A message-matched hero that mirrors the ad that drove the click. Outcome headline, a short subheadline, and the form in the hero (keep it to ~3 fields).' },
    { label: 'Social proof', timing: 'Below hero', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['social-proof'], brief: 'A logo strip or a stat to reduce risk right at the decision moment.' },
    { label: 'Benefits', timing: 'Section 2', subjectFormula: '—', framework: 'BAB', cta: '—', levers: ['none'], brief: 'Three to four benefit blocks, each a from → to transformation tied to the offer. Benefit before feature.' },
    { label: 'Objection handling', timing: 'Section 3', subjectFormula: '—', framework: 'PAS', cta: '—', levers: ['none'], brief: 'Address the top one or two objections to converting on this specific offer.' },
    { label: 'Final CTA', timing: 'Bottom', subjectFormula: '—', framework: 'AIDA', cta: 'Get the {offer}', levers: ['none'], brief: 'Repeat the single conversion action with risk-reducer microcopy under the button.' },
  ],
  guardrails: [
    'Strip the nav to remove exits — one conversion goal only.',
    'Message-match the hero to the ad that drove the click.',
    'Keep the form to ~3 fields; short forms convert far better than long ones.',
    'Repeat the same single CTA; add a sticky CTA on mobile.',
    'Risk-reducer microcopy under every CTA ("No credit card required").',
  ],
}

const HOMEPAGE: EmailBlueprint = {
  key: 'homepage',
  name: 'Corporate homepage',
  channel: 'website',
  assetType: 'homepage',
  kind: 'page',
  summary: 'A brand-led homepage that commits to ONE outcome above the fold, then proves it, with multiple entry points below.',
  cadence: 'One page, section by section',
  steps: [
    { label: 'Hero', timing: 'Above the fold', subjectFormula: 'The {category} for {audience}', framework: 'Category', cta: 'Get started', levers: ['none'], brief: 'Commit to ONE outcome above the fold (do not cram every ICP). A bold category-led headline, a subheadline that names the audience, a dominant primary CTA plus a low-commitment secondary, and a real product visual.' },
    { label: 'Social proof bar', timing: 'Below hero', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['social-proof'], brief: 'A recognizable customer logo strip within the first scroll to establish credibility immediately.' },
    { label: 'Value proposition', timing: 'Section 2', subjectFormula: '—', framework: 'JTBD', cta: '—', levers: ['none'], brief: 'What the company does and the job it gets done for the customer, in plain language.' },
    { label: 'Products / features', timing: 'Section 3', subjectFormula: '—', framework: 'FAB', cta: '—', levers: ['none'], brief: 'The product areas as benefits (a bento or grid). Multiple entry points are fine, but keep one clear primary path.' },
    { label: 'Use cases', timing: 'Section 4', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['none'], brief: 'How different audiences use it, each addressed specifically rather than genericized.' },
    { label: 'Deeper proof', timing: 'Section 5', subjectFormula: '—', framework: '4Ps', cta: '—', levers: ['social-proof'], brief: 'Testimonials with names and outcomes, case-study metrics, ratings, or press. Near a CTA.' },
    { label: 'Differentiation', timing: 'Section 6', subjectFormula: '—', framework: 'BAB', cta: '—', levers: ['none'], brief: 'Why us over the old way — one differentiator angle (price, better solution, values, or innovation).' },
    { label: 'Final CTA', timing: 'Bottom', subjectFormula: '—', framework: 'AIDA', cta: 'Get started', levers: ['none'], brief: 'A sharp restatement of the primary ask with a fresh angle.' },
  ],
  guardrails: [
    'Commit to ONE outcome above the fold; do not cram every ICP.',
    'Full nav, but one dominant hero CTA.',
    'Logo bar within the first scroll.',
    'Multiple product entry points are fine, but keep one clear primary path.',
  ],
}

export const PAGE_BLUEPRINTS: EmailBlueprint[] = [HOMEPAGE, SALES_PAGE, LEADGEN_PAGE]

// ---- Blog / content blueprints ----
// A content piece is ONE deliverable; its steps are the ordered sections of the article.

const SEO_ARTICLE: EmailBlueprint = {
  key: 'seo-article',
  name: 'SEO article',
  channel: 'blog',
  assetType: 'article',
  kind: 'page',
  summary: 'A search-intent article that leads with value: hook, context, substantive body, takeaways, a soft CTA.',
  cadence: 'One article, section by section',
  steps: [
    { label: 'Hook / intro', timing: 'Opening', subjectFormula: 'How to {outcome} (without {pain})', framework: 'AIDA', cta: '—', levers: ['none'], brief: 'Open with a hook that names the reader’s problem or the promise, and say what the article delivers. Front-load the value; don’t bury the answer.' },
    { label: 'Context / problem', timing: 'Section 1', subjectFormula: '—', framework: 'PAS', cta: '—', levers: ['none'], brief: 'Frame the problem and why it matters now, so the rest of the piece earns its attention.' },
    { label: 'Main body', timing: 'Sections 2-4', subjectFormula: '—', framework: 'FAB', cta: '—', levers: ['none'], brief: 'The substance: 3-5 H2 sections, each one clear point backed by an example or data. One idea per section, scannable.' },
    { label: 'Practical takeaways', timing: 'Section 5', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['none'], brief: 'Actionable takeaways the reader can apply today, as a short list.' },
    { label: 'CTA', timing: 'Close', subjectFormula: '—', framework: 'AIDA', cta: 'Learn more', levers: ['none'], brief: 'A relevant, soft in-article CTA tied to the topic, not a hard sell.' },
  ],
  guardrails: [
    'Write for the search intent behind the target keyword.',
    'One idea per section, scannable H2s.',
    'Lead with value; don’t bury the answer.',
    'A soft, relevant CTA, not a hard pitch.',
  ],
}

const PILLAR_GUIDE: EmailBlueprint = {
  key: 'pillar-guide',
  name: 'Pillar guide',
  channel: 'blog',
  assetType: 'pillar',
  kind: 'page',
  summary: 'A comprehensive, authority-building guide that covers the whole topic and links to supporting content.',
  cadence: 'One guide, section by section',
  steps: [
    { label: 'Overview + TOC', timing: 'Opening', subjectFormula: 'The complete guide to {topic}', framework: 'Category', cta: '—', levers: ['none'], brief: 'A short overview of what the guide covers and who it’s for, with a clear table of contents.' },
    { label: 'What & why', timing: 'Section 1', subjectFormula: '—', framework: 'JTBD', cta: '—', levers: ['none'], brief: 'Define the topic in plain language and why it matters. Set the foundation.' },
    { label: 'Core sub-topics', timing: 'Sections 2-5', subjectFormula: '—', framework: 'FAB', cta: '—', levers: ['none'], brief: 'The main sub-topics, each an H2 section that can link out to cluster / supporting content.' },
    { label: 'Step-by-step', timing: 'Section 6', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['none'], brief: 'A practical how-to walkthrough the reader can follow.' },
    { label: 'Mistakes + resources', timing: 'Section 7', subjectFormula: '—', framework: 'Scannable', cta: '—', levers: ['none'], brief: 'Common mistakes to avoid and a short list of tools / resources.' },
    { label: 'Conclusion + CTA', timing: 'Close', subjectFormula: '—', framework: 'AIDA', cta: 'Get started', levers: ['none'], brief: 'Wrap up the throughline and point to the natural next step.' },
  ],
  guardrails: [
    'Be comprehensive — cover the whole topic so it ranks as the authority.',
    'Link out to cluster / supporting content.',
    'Use a clear TOC and scannable H2/H3.',
    'Long-form but skimmable.',
  ],
}

const LISTICLE: EmailBlueprint = {
  key: 'listicle',
  name: 'Listicle',
  channel: 'blog',
  assetType: 'listicle',
  kind: 'page',
  summary: 'A skimmable numbered list that delivers on the number in the title, each item self-contained.',
  cadence: 'One listicle, section by section',
  steps: [
    { label: 'Intro', timing: 'Opening', subjectFormula: '{number} {things} to {outcome}', framework: 'AIDA', cta: '—', levers: ['none'], brief: 'A short intro framing why this list is worth the reader’s time.' },
    { label: 'List items', timing: 'Body', subjectFormula: '—', framework: 'FAB', cta: '—', levers: ['none'], brief: 'Each item: a clear name / heading, why it matters in a sentence, and a bit of detail. Consistent structure per item, skimmable.' },
    { label: 'Wrap-up + CTA', timing: 'Close', subjectFormula: '—', framework: 'AIDA', cta: 'Learn more', levers: ['none'], brief: 'A brief wrap-up and a relevant next step.' },
  ],
  guardrails: [
    'Deliver on the number in the title.',
    'Each item is self-contained and skimmable.',
    'Odd numbers under 10 tend to perform.',
    'Keep a consistent structure per item.',
  ],
}

const CASE_STUDY: EmailBlueprint = {
  key: 'case-study',
  name: 'Case study',
  channel: 'blog',
  assetType: 'case-study',
  kind: 'page',
  summary: 'A results-led proof story a champion can forward: challenge → approach → solution → quantified results.',
  cadence: 'One case study, section by section',
  steps: [
    { label: 'Snapshot', timing: 'Opening', subjectFormula: 'How {customer} {achieved result} with {brand}', framework: '4Ps', cta: '—', levers: ['social-proof'], brief: 'The customer and the headline result up top, so the payoff is clear before any detail.' },
    { label: 'Challenge', timing: 'Section 1', subjectFormula: '—', framework: 'PAS', cta: '—', levers: ['none'], brief: 'The problem the customer faced and why it mattered.' },
    { label: 'Approach', timing: 'Section 2', subjectFormula: '—', framework: 'BAB', cta: '—', levers: ['none'], brief: 'What you did and why — the plan and the reasoning.' },
    { label: 'Solution', timing: 'Section 3', subjectFormula: '—', framework: 'FAB', cta: '—', levers: ['none'], brief: 'The specific solution in action, tied to the customer’s situation.' },
    { label: 'Results', timing: 'Section 4', subjectFormula: '—', framework: '4Ps', cta: '—', levers: ['social-proof'], brief: 'Quantified outcomes with real metrics, plus a customer quote with name and title.' },
    { label: 'CTA', timing: 'Close', subjectFormula: '—', framework: 'AIDA', cta: 'Book a demo', levers: ['none'], brief: 'A clear next step for a reader who wants the same result.' },
  ],
  guardrails: [
    'Lead with the headline result.',
    'Quantify the outcome with real metrics.',
    'Include a customer quote with name and title.',
    'Make it forwardable — a champion shares it internally.',
  ],
}

export const BLOG_BLUEPRINTS: EmailBlueprint[] = [SEO_ARTICLE, PILLAR_GUIDE, LISTICLE, CASE_STUDY]

// ---- LinkedIn ad blueprints (the LinkedIn Ads pattern library) ----
// B2B-native: organized by funnel stage. The cardinal rule is match the ask to the stage —
// never a hard demo CTA at a cold audience. Each is one ad (hook → body → CTA).

const LI_TOFU_THOUGHT: EmailBlueprint = {
  key: 'li-tofu-thought',
  name: 'TOFU: Thought leadership',
  channel: 'linkedin-ads',
  assetType: 'single-image',
  kind: 'single',
  summary: 'Cold-audience trust play. Authentic exec/employee insight, give before ask, no hard CTA. The efficiency leader on LinkedIn.',
  cadence: 'Cold audience · thought-leadership angle',
  steps: [
    { label: 'Hook', timing: 'First 150 chars', subjectFormula: '{belief} is wrong. Here’s what actually {outcome}.', framework: 'BAB', cta: 'Learn More', levers: ['none'], brief: 'The opening line is the whole game (mobile truncates at ~150 chars). Lead with a contrarian take, a specific stat, or a first-person confession. One persona, one pain.' },
    { label: 'Body', timing: 'After the fold', subjectFormula: '—', framework: 'BAB', cta: '—', levers: ['none'], brief: 'An educational, give-before-ask insight. Before → after → bridge, in the voice of a real person. Break every 2-3 lines for mobile.' },
    { label: 'CTA', timing: 'Close + button', subjectFormula: '—', framework: 'BAB', cta: 'Learn More', levers: ['none'], brief: 'A soft, ungated ask — read the framework, see the report. No demo or contact-sales for a cold audience.' },
  ],
  guardrails: [
    'Never run a hard-conversion CTA (demo / contact sales) to a cold audience.',
    'The first ~150 characters carry the whole ad; make the opening line the sharpest.',
    'One persona, one pain, one use case per ad.',
    'Feature real people; boost an individual’s post (needs their permission).',
  ],
}

const LI_TOFU_CONTRARIAN: EmailBlueprint = {
  key: 'li-tofu-contrarian',
  name: 'TOFU: Contrarian insight',
  channel: 'linkedin-ads',
  assetType: 'single-image',
  kind: 'single',
  summary: 'A scroll-stopping myth-bust for a cold audience. Challenge a common belief, then deliver the real insight.',
  cadence: 'Cold audience · contrarian angle',
  steps: [
    { label: 'Hook', timing: 'First 150 chars', subjectFormula: 'Your {metric} looks fine. Your {hidden problem} isn’t.', framework: 'PAS', cta: 'Learn More', levers: ['none'], brief: 'A blunt, specific myth-bust in the first line. Name the hidden problem the reader doesn’t know they have.' },
    { label: 'Body', timing: 'After the fold', subjectFormula: '—', framework: 'PAS', cta: '—', levers: ['none'], brief: 'Insight → implication. Show why the common belief costs them, then the better way. Specific over clever.' },
    { label: 'CTA', timing: 'Close + button', subjectFormula: '—', framework: 'PAS', cta: 'Learn More', levers: ['none'], brief: 'A soft ask to see the full thinking. Ungated.' },
  ],
  guardrails: [
    'Specificity beats cleverness — a real number in the first line raises stop-rate.',
    'No hard CTA on a cold audience.',
    'One pain, one persona.',
    'Break every 2-3 lines for mobile.',
  ],
}

const LI_MOFU_REPORT: EmailBlueprint = {
  key: 'li-mofu-report',
  name: 'MOFU: Gated report',
  channel: 'linkedin-ads',
  assetType: 'single-image',
  kind: 'single',
  summary: 'A named research asset for an engaged audience, gated behind a Lead Gen Form. Authority plus lead capture.',
  cadence: 'Engaged audience · gated report',
  steps: [
    { label: 'Hook', timing: 'First 150 chars', subjectFormula: 'We analyzed {number} {things}. {surprising finding}.', framework: 'PAS', cta: 'Download', levers: ['none'], brief: 'A data/benchmark tease in the first line. Lead with the surprising finding, not the methodology.' },
    { label: 'Body', timing: 'After the fold', subjectFormula: '—', framework: 'PAS', cta: '—', levers: ['none'], brief: 'Name the exact deliverable ("The 2026 {industry} Benchmark Report"), and one reason it’s worth the reader’s email. Specific offers convert far better than generic.' },
    { label: 'CTA', timing: 'Lead Gen Form', subjectFormula: '—', framework: 'PAS', cta: 'Download', levers: ['none'], brief: 'Download via a native Lead Gen Form (3-4 fields). Match the CTA to the named asset.' },
  ],
  guardrails: [
    'Name the exact deliverable, not "a free resource".',
    'Use a native Lead Gen Form (3-4 fields) — it converts ~3-4x a landing page.',
    'The asset itself is the conversion driver; make the cover/first line the hook.',
    'One persona, one pain.',
  ],
}

const LI_MOFU_WEBINAR: EmailBlueprint = {
  key: 'li-mofu-webinar',
  name: 'MOFU: Webinar / guide',
  channel: 'linkedin-ads',
  assetType: 'single-image',
  kind: 'single',
  summary: 'A gated guide or webinar for an engaged, qualifying audience. Call out the ICP and name the deliverable.',
  cadence: 'Engaged audience · gated guide / webinar',
  steps: [
    { label: 'Hook', timing: 'First 150 chars', subjectFormula: 'If you’re a {role} at a {company_type} dealing with {pain}, read this.', framework: 'FAB', cta: 'Register', levers: ['none'], brief: 'A callout hook that qualifies the exact ICP in the first line, so the right person self-selects.' },
    { label: 'Body', timing: 'After the fold', subjectFormula: '—', framework: 'FAB', cta: '—', levers: ['none'], brief: 'What they’ll get and why it’s worth the time. Features → advantages → the benefit to them.' },
    { label: 'CTA', timing: 'Lead Gen Form', subjectFormula: '—', framework: 'FAB', cta: 'Register', levers: ['time-scarcity'], brief: 'Register / save your seat via a Lead Gen Form. A real date makes it deadline-driven.' },
  ],
  guardrails: [
    'Call out one ICP in the first line.',
    'Name the exact guide / webinar.',
    'Lead Gen Form, 3-4 fields.',
    'Only use the deadline lever if the webinar has a real date.',
  ],
}

const LI_BOFU_CASESTUDY: EmailBlueprint = {
  key: 'li-bofu-casestudy',
  name: 'BOFU: Case study / demo',
  channel: 'linkedin-ads',
  assetType: 'single-image',
  kind: 'single',
  summary: 'A warm, retargeted audience only. Named proof and a hard CTA — the demo/pricing ask is finally allowed.',
  cadence: 'Warm / retargeted audience · proof-led',
  steps: [
    { label: 'Hook', timing: 'First 150 chars', subjectFormula: 'How {customer} {achieved result} with {brand}.', framework: '4Ps', cta: 'Request Demo', levers: ['social-proof'], brief: 'Lead with named social proof and a specific metric in the first line. Warm audiences only (retargeting / Matched Audiences).' },
    { label: 'Body', timing: 'After the fold', subjectFormula: '—', framework: '4Ps', cta: '—', levers: ['social-proof'], brief: 'Picture → promise → proof → push. The customer’s situation, the outcome with real numbers, then the ask.' },
    { label: 'CTA', timing: 'Close + button', subjectFormula: '—', framework: '4Ps', cta: 'Request Demo', levers: ['none'], brief: 'The hard CTA is allowed here: request a demo, see pricing, or get the ROI case study.' },
  ],
  guardrails: [
    'Warm / retargeted audiences only — exclude cold prospecting.',
    'Lead with a named customer and a specific metric.',
    'The hard CTA (demo / pricing) is allowed at this stage, not before.',
    'Optimize on cost-per-SAL / opportunity, not CTR.',
  ],
}

export const LINKEDIN_AD_BLUEPRINTS: EmailBlueprint[] = [LI_TOFU_THOUGHT, LI_TOFU_CONTRARIAN, LI_MOFU_REPORT, LI_MOFU_WEBINAR, LI_BOFU_CASESTUDY]

const ALL_BLUEPRINTS: EmailBlueprint[] = [...EMAIL_BLUEPRINTS, ...PAGE_BLUEPRINTS, ...BLOG_BLUEPRINTS, ...LINKEDIN_AD_BLUEPRINTS]

/** Blueprints available for a given channel + assetType (email + landing-page). */
export function blueprintsFor(channel: ChannelId, assetType?: string): EmailBlueprint[] {
  return ALL_BLUEPRINTS.filter((b) => b.channel === channel && (!assetType || b.assetType === assetType))
}

export function blueprintByKey(key: string): EmailBlueprint | undefined {
  return ALL_BLUEPRINTS.find((b) => b.key === key)
}

/**
 * Compose a whole-page brief from a page blueprint's sections. When the deliverable's real
 * messaging field keys are provided, it maps each section to its EXACT field (hero → the
 * headline field, social proof → the proof-logos field, FAQ → the faq field, and the
 * narrative sections into the body field), so the copy writer fills each field from its
 * section rather than blending everything into one blob.
 */
export function composePageBrief(bp: EmailBlueprint, fieldKeys?: string[]): string {
  const numbered = () => bp.steps.map((s, i) => `${i + 1}. ${s.label}${s.timing && s.timing !== '—' ? ` (${s.timing})` : ''}: ${s.brief}`).join('\n')
  if (!fieldKeys || !fieldKeys.length) return `Write a ${bp.name.toLowerCase()} with these sections, in order:\n${numbered()}`

  const has = (re: RegExp) => fieldKeys.find((k) => re.test(k))
  const headlineKey = has(/headline|^title$/)
  const subheadKey = has(/subhead|subtitle/)
  const socialKey = has(/social|logo/)
  const statKey = has(/stat/)
  const proofKey = has(/^proof$/)
  const faqKey = has(/faq/)
  const takeawayKey = has(/takeaway/)
  const bodyKey = has(/^body$|content|primary/)
  const ctaKeys = fieldKeys.filter((k) => /cta|^link$/.test(k))

  const find = (re: RegExp) => bp.steps.find((s) => re.test(s.label))
  const hero = find(/hero/i) ?? bp.steps[0]
  const social = find(/social proof|logo/i)
  const proofSec = find(/deeper proof|results/i)
  const faqSec = find(/faq|objection/i)
  const takeawaySec = find(/takeaway|mistakes|resources/i)
  const finalCta = find(/final cta/i) ?? bp.steps[bp.steps.length - 1]
  const claimed = new Set([hero, social, proofSec, faqSec, takeawaySec, finalCta].filter(Boolean))
  const narrative = bp.steps.filter((s) => !claimed.has(s))

  const lines: string[] = []
  if (headlineKey) lines.push(`- ${headlineKey}: the hero. Write to the value-prop formula "${hero.subjectFormula}", filling every {slot} with a real specific (never leave a literal {slot}).`)
  if (subheadKey) lines.push(`- ${subheadKey}: a subheadline that clarifies the mechanism or names the audience.`)
  if (socialKey && social) lines.push(`- ${socialKey}: ${social.brief}`)
  if (statKey && proofSec) lines.push(`- ${statKey}: ${proofSec.brief}`)
  else if (statKey && social) lines.push(`- ${statKey}: a quantified proof point or stat.`)
  if (proofKey && proofSec) lines.push(`- ${proofKey}: ${proofSec.brief}`)
  if (faqKey && faqSec) lines.push(`- ${faqKey}: ${faqSec.brief}`)
  if (takeawayKey && takeawaySec) lines.push(`- ${takeawayKey}: ${takeawaySec.brief}`)
  if (ctaKeys.length) lines.push(`- ${ctaKeys.join(' / ')}: the primary call to action (${finalCta.cta}), repeated. ${finalCta.brief}`)
  if (bodyKey && narrative.length) lines.push(`- ${bodyKey}: the narrative, in this order — ${narrative.map((s) => `${s.label} (${s.brief})`).join('; ')}`)

  return `Write a ${bp.name.toLowerCase()}. Fill each field from its section:\n${lines.join('\n')}`
}

/** The per-slot briefs a blueprint seeds onto a deliverable's slots. `fieldKeys` (the
 *  deliverable's messaging field keys) lets a page brief map sections to exact fields. */
export function blueprintBriefs(bp: EmailBlueprint, fieldKeys?: string[]): string[] {
  if (bp.kind === 'sequence') return bp.steps.map((s) => s.brief)
  if (bp.kind === 'page') return [composePageBrief(bp, fieldKeys)]
  // 'single' — one asset composed from its parts (newsletter blocks, ad hook/body/CTA).
  if (bp.steps.length <= 1) return [bp.steps[0].brief]
  return [`Write one ${bp.name.toLowerCase()}:\n${bp.steps.map((s) => `- ${s.label}: ${s.brief}`).join('\n')}`]
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
