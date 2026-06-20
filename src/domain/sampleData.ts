import type { ChannelId, MediaType, RowStatus, TrafficRow } from './types'
import { primaryTypeKey } from './channelAssetTypes'

interface Seed {
  asset: string
  mediaType: MediaType
  channel: ChannelId
  campaign: string
  audience?: string
  status: RowStatus
  /** Hours from "now" for scheduledAt (negative = already in the past). */
  at: number
  error?: string
  /** Messaging components, keyed to the channel's primary asset-type schema. */
  messaging: Record<string, string>
  /** Proof mapping: messaging component key → RTB ids (from the campaign's set). */
  rtbs?: Record<string, string[]>
  /** Copy baked into the creative (image/video overlays, VO). */
  extracted?: string
  copyReviewed?: boolean
  /** Destination asset this unit drives to (asset name of the next step). */
  links?: string
}

// A believable cross-channel content plan across three campaigns, fully mapped:
// every asset broken into its messaging components, with proof (RTBs) tied to
// the specific claims. A few deliberate gaps (an unmapped instagram caption, an
// off-message linkedin-ad headline, a bare email subject) so the flags and
// coverage bars have something to show.
const SEEDS: Seed[] = [
  // ---- Spring Launch 2026 (RTBs: speed, rollback, redesign) ----
  {
    asset: 'spring-hero-30s.mp4', mediaType: 'video', channel: 'meta-ads', campaign: 'Spring Launch 2026',
    audience: 'Lookalike – Customers', status: 'posted', at: -48, extracted: 'SPRING 2026\nBuilt for speed\nShip 2x faster →', copyReviewed: true, links: 'spring-launch-lp',
    // description leans on the "redesigned dashboard" proof — fine for a broad lookalike.
    messaging: { primary: 'Spring is here. Ship 2x faster and cut the busywork your team hates.', headline: 'Build 2x faster', description: 'A redesigned dashboard', cta: 'Shop now' },
    rtbs: { primary: ['speed'], headline: ['speed'], description: ['redesign'] },
  },
  {
    asset: 'spring-promo-9x16.jpg', mediaType: 'image', channel: 'tiktok-ads', campaign: 'Spring Launch 2026',
    audience: 'Interest – Productivity', status: 'posted', at: -36, links: 'spring-launch-lp',
    messaging: { caption: 'POV: your workflow just got 2x faster ⚡ no more manual busywork', cta: 'Learn more' },
    rtbs: { caption: ['speed'] },
  },
  {
    asset: 'spring-promo-1x1.jpg', mediaType: 'image', channel: 'instagram', campaign: 'Spring Launch 2026',
    status: 'scheduled', at: 6, links: 'spring-launch-lp',
    messaging: { caption: 'Spring 2026 is here — ship faster, leave the busywork behind. Tap to see what’s new.' },
    rtbs: { caption: ['speed'] },
  },
  {
    asset: 'launch-announcement.md', mediaType: 'text', channel: 'email', campaign: 'Spring Launch 2026',
    status: 'approved', at: 18, links: 'spring-launch-lp',
    messaging: {
      subject: 'The Spring release is live',
      preview: '2x faster builds, one-click rollback, redesigned dashboard',
      body: 'Everything you told us slowed you down — manual steps, slow tools — is gone. Builds are 2x faster, rollback is one click, and the dashboard is redesigned for faster time-to-value.',
      // SEEDED BREAK #4 (weak CTA): a soft "Learn more" that doesn't cash the
      // "2x faster" promise the email just made into a conversion action.
      cta: 'Learn more',
    },
    rtbs: { preview: ['speed', 'rollback', 'redesign'], body: ['speed', 'rollback', 'redesign'] }, // subject left unmapped → drift flag
  },
  {
    asset: 'spring-hero-30s.mp4', mediaType: 'video', channel: 'youtube-ads', campaign: 'Spring Launch 2026',
    audience: 'Retargeting – Site Visitors', status: 'approved', at: 26, links: 'spring-launch-lp',
    // SEEDED BREAK #3 (proof gap): the CTA claims "live now" with no RTB backing it.
    messaging: { headline: 'Ship 2x faster', description: 'One-click rollback', cta: 'Watch — live now' },
    rtbs: { headline: ['speed'], description: ['rollback'] },
  },
  {
    asset: 'launch-story.md', mediaType: 'text', channel: 'linkedin', campaign: 'Spring Launch 2026',
    status: 'scheduled', at: 8, links: 'spring-launch-lp',
    messaging: { body: 'We just shipped our biggest release yet. Builds run 2x faster and rollback is one click — less busywork, faster time-to-value for ops teams. Here’s the story 🧵' },
    rtbs: { body: ['speed', 'rollback'] },
  },
  {
    asset: 'spring-launch-lp', mediaType: 'link', channel: 'landing-page', campaign: 'Spring Launch 2026',
    status: 'approved', at: 4,
    messaging: {
      // SEEDED BREAK #1 (journey handoff): the Meta ad promises "Build 2x faster",
      // but this hero drops the number — "faster than ever" — snapping the thread.
      headline: 'Ship faster than ever',
      subhead: 'Cut the manual busywork. Roll back any deploy in one click.',
      body: 'Spring 2026 brings 2x faster builds, one-click rollback, and a redesigned dashboard — built for faster time-to-value for mid-market ops teams.',
      cta: 'Explore the launch',
    },
    rtbs: { headline: ['speed'], subhead: ['rollback'], body: ['speed', 'rollback', 'redesign'] },
  },
  {
    asset: 'spring-promo-1x1.jpg', mediaType: 'image', channel: 'linkedin-ads', campaign: 'Spring Launch 2026',
    audience: 'ABM – Enterprise', status: 'draft', at: 30, links: 'spring-launch-lp',
    // SEEDED BREAK #2 (audience drift): reuses the SAME "redesigned dashboard" proof
    // as the Lookalike variant — but Enterprise intent is "workflow automation", so
    // dashboard polish is off-ICP for this audience.
    messaging: { intro: 'Enterprise-ready and now 2x faster.', headline: 'Built for ops at scale', description: 'A redesigned dashboard', cta: 'Request a demo' },
    rtbs: { intro: ['speed'], description: ['redesign'] },
  },

  // ---- Q2 Demand Gen (RTBs: acme, integrations, ttv) ----
  {
    asset: 'acme-case-study.pdf', mediaType: 'link', channel: 'lead-magnet', campaign: 'Q2 Demand Gen',
    status: 'posted', at: -12, links: 'may-digest.md',
    messaging: {
      title: 'How Acme cut ops time 40%',
      subtitle: 'A mid-market ops playbook',
      description: 'See how Acme killed manual busywork and hit time-to-value in a week with 200+ integrations.',
      cta: 'Get the case study',
    },
    rtbs: { title: ['acme'], description: ['acme', 'integrations', 'ttv'] },
  },
  {
    asset: 'founder-story-60s.mp4', mediaType: 'video', channel: 'meta-ads', campaign: 'Q2 Demand Gen',
    audience: 'Lookalike – Newsletter', status: 'draft', at: 40, extracted: 'We were tired of slow tools.\nSo we built our own.', links: 'acme-case-study.pdf',
    messaging: { primary: 'Why we started — we were tired of slow tools and manual busywork.', headline: 'Founder story', description: 'Live in a week', cta: 'Watch' },
    rtbs: { description: ['ttv'] }, // primary on-message but unbacked; headline drift
  },
  {
    asset: 'productivity-tips.jpg', mediaType: 'image', channel: 'instagram', campaign: 'Q2 Demand Gen',
    status: 'scheduled', at: 12, links: 'acme-case-study.pdf',
    messaging: { caption: '5 ways to cut manual busywork and ship faster this quarter (save this).' },
    // rtbs intentionally omitted → unsupported claim in the column + coverage
  },
  {
    asset: 'demand-gen-rsa', mediaType: 'text', channel: 'google-search', campaign: 'Q2 Demand Gen',
    audience: 'In-market – Ops Software', status: 'approved', at: 2, links: 'acme-case-study.pdf',
    messaging: {
      h1: 'Faster ops software', h2: 'Cut manual busywork', h3: 'Live in a week',
      d1: 'Ship 2x faster with 200+ integrations. Start free.', d2: 'Mid-market ops teams hit time-to-value in days, not months.', path: 'ops/free-trial',
    },
    rtbs: { h3: ['ttv'], d1: ['integrations', 'ttv'] },
  },
  {
    asset: 'may-digest.md', mediaType: 'text', channel: 'email', campaign: 'Q2 Demand Gen',
    status: 'approved', at: 50,
    messaging: {
      subject: 'May digest: 3 plays to ship faster',
      preview: 'Cut busywork, speed up your stack',
      body: 'This month: how Acme cut ops time 40%, the integrations that remove manual steps, and a faster path to time-to-value.',
      cta: 'Read the digest',
    },
    rtbs: { body: ['acme', 'integrations', 'ttv'] },
  },

  // ---- Webinar: Scaling Ops (RTBs: panel, playbook) ----
  {
    asset: 'webinar-invite.md', mediaType: 'text', channel: 'linkedin', campaign: 'Webinar: Scaling Ops',
    status: 'scheduled', at: 20,
    messaging: { body: 'Join us live: scaling ops without scaling headcount or busywork. Ops leaders from Series B+ SaaS share the playbook.' },
    rtbs: { body: ['panel', 'playbook'] },
  },
  {
    asset: 'webinar-invite.md', mediaType: 'text', channel: 'email', campaign: 'Webinar: Scaling Ops',
    status: 'approved', at: 22,
    messaging: {
      subject: 'You’re invited: Scaling Ops live',
      preview: 'VPs of Ops share their playbook',
      body: 'Join VPs of Ops from Series B+ companies live next Thursday. Walk away with the scaling-ops playbook — less busywork, faster time-to-value.',
      cta: 'Save your seat',
    },
    rtbs: { preview: ['panel'], body: ['panel', 'playbook'] },
  },
  {
    asset: 'webinar-promo.jpg', mediaType: 'image', channel: 'x-ads', campaign: 'Webinar: Scaling Ops',
    audience: 'Followers – Lookalike', status: 'failed', error: 'Media ratio rejected (needs 1.91:1)', at: -6, links: 'webinar-invite.md',
    messaging: { post: 'Free live session: scaling ops without the busywork. Save your seat.', cta: 'Register' },
    rtbs: { post: ['playbook'] },
  },
]

/** Build a fresh set of sample rows scheduled relative to `now`. */
export function sampleRows(now: number = Date.now()): TrafficRow[] {
  // Spread upcoming content across a ~6-week horizon so the week / month / 3-month
  // views are meaningful; posted & failed keep their recent-past time (`s.at`).
  const UPCOMING_DAYS = [2, 10, 16, 5, 22, 30, 13, 1, 42, 21, 24, 3, 7, 18, 35, 9]
  let up = 0
  return SEEDS.map((s, i) => {
    const past = s.status === 'posted' || s.status === 'failed'
    const offsetHours = past ? s.at : UPCOMING_DAYS[up++ % UPCOMING_DAYS.length] * 24
    const scheduledMs = now + offsetHours * 3_600_000
    const posted = s.status === 'posted'
    const approved = posted || s.status === 'approved' || s.status === 'scheduled'
    return {
      id: `sample_${i + 1}`,
      assetId: `sample_asset_${i + 1}`,
      assetName: s.asset,
      mediaType: s.mediaType,
      channel: s.channel,
      assetType: primaryTypeKey(s.channel),
      messaging: s.messaging,
      rtbMap: s.rtbs,
      linksTo: s.links,
      extractedCopy: s.extracted,
      copyReviewed: s.copyReviewed,
      campaign: s.campaign,
      audience: s.audience ?? '',
      scheduledAt: new Date(scheduledMs).toISOString(),
      status: s.status,
      error: s.error,
      createdAt: now,
      approvedAt: approved ? now : undefined,
      postedAt: posted ? scheduledMs : undefined,
    }
  })
}
