import type { ChannelId, MediaType, RowStatus, TrafficRow } from './types'

interface Seed {
  asset: string
  mediaType: MediaType
  channel: ChannelId
  caption: string
  campaign: string
  audience?: string
  status: RowStatus
  /** Hours from "now" for scheduledAt (negative = already in the past). */
  at: number
  error?: string
}

// A believable cross-channel content plan spanning three campaigns, so the
// sheet reads like a real trafficking board: paid + organic + owned, audiences
// on the paid rows, and a spread of statuses (incl. one failed).
const SEEDS: Seed[] = [
  // ---- Spring Launch 2026 ----
  { asset: 'spring-hero-30s.mp4', mediaType: 'video', channel: 'meta-ads', campaign: 'Spring Launch 2026', audience: 'Lookalike – Customers', caption: 'Meet the all-new Spring lineup — built for speed.', status: 'posted', at: -48 },
  { asset: 'spring-promo-9x16.jpg', mediaType: 'image', channel: 'tiktok-ads', campaign: 'Spring Launch 2026', audience: 'Interest – Productivity', caption: 'POV: your workflow just got 2x faster ⚡', status: 'posted', at: -36 },
  { asset: 'spring-promo-1x1.jpg', mediaType: 'image', channel: 'instagram', campaign: 'Spring Launch 2026', caption: 'Spring is here. Tap to see what’s new.', status: 'scheduled', at: 6 },
  { asset: 'launch-announcement.md', mediaType: 'text', channel: 'email', campaign: 'Spring Launch 2026', caption: 'The Spring release is live — here’s everything new.', status: 'approved', at: 18 },
  { asset: 'spring-hero-30s.mp4', mediaType: 'video', channel: 'youtube-ads', campaign: 'Spring Launch 2026', audience: 'Retargeting – Site Visitors', caption: 'The Spring launch in 30 seconds.', status: 'approved', at: 26 },
  { asset: 'launch-story.md', mediaType: 'text', channel: 'linkedin', campaign: 'Spring Launch 2026', caption: 'We just shipped our biggest release yet. Here’s the story 🧵', status: 'scheduled', at: 8 },
  { asset: 'spring-launch-lp', mediaType: 'link', channel: 'landing-page', campaign: 'Spring Launch 2026', caption: 'Spring 2026 — explore the launch.', status: 'approved', at: 4 },
  { asset: 'spring-promo-1x1.jpg', mediaType: 'image', channel: 'linkedin-ads', campaign: 'Spring Launch 2026', audience: 'ABM – Enterprise', caption: 'Enterprise-ready. Now faster.', status: 'draft', at: 30 },

  // ---- Q2 Demand Gen ----
  { asset: 'acme-case-study.pdf', mediaType: 'link', channel: 'lead-magnet', campaign: 'Q2 Demand Gen', caption: 'How Acme cut ops time 40% — full case study.', status: 'posted', at: -12 },
  { asset: 'founder-story-60s.mp4', mediaType: 'video', channel: 'meta-ads', campaign: 'Q2 Demand Gen', audience: 'Lookalike – Newsletter', caption: 'Why we started — a 60-second founder story.', status: 'draft', at: 40 },
  { asset: 'productivity-tips.jpg', mediaType: 'image', channel: 'instagram', campaign: 'Q2 Demand Gen', caption: '5 ways to speed up your week (save this).', status: 'scheduled', at: 12 },
  { asset: 'demand-gen-rsa', mediaType: 'text', channel: 'google-search', campaign: 'Q2 Demand Gen', audience: 'In-market – Ops Software', caption: 'Faster ops software — start free today.', status: 'approved', at: 2 },
  { asset: 'may-digest.md', mediaType: 'text', channel: 'email', campaign: 'Q2 Demand Gen', caption: 'May digest: 3 plays to ship faster.', status: 'approved', at: 50 },

  // ---- Webinar: Scaling Ops ----
  { asset: 'webinar-invite.md', mediaType: 'text', channel: 'linkedin', campaign: 'Webinar: Scaling Ops', caption: 'Join us live: scaling ops without scaling headcount.', status: 'scheduled', at: 20 },
  { asset: 'webinar-invite.md', mediaType: 'text', channel: 'email', campaign: 'Webinar: Scaling Ops', caption: 'You’re invited — live webinar next Thursday.', status: 'approved', at: 22 },
  { asset: 'webinar-promo.jpg', mediaType: 'image', channel: 'x-ads', campaign: 'Webinar: Scaling Ops', audience: 'Followers – Lookalike', caption: 'Free live session: scaling ops. Save your seat.', status: 'failed', error: 'Media ratio rejected (needs 1.91:1)', at: -6 },
]

/** Build a fresh set of sample rows scheduled relative to `now`. */
export function sampleRows(now: number = Date.now()): TrafficRow[] {
  return SEEDS.map((s, i) => {
    const scheduledMs = now + s.at * 3_600_000
    const posted = s.status === 'posted'
    const approved = posted || s.status === 'approved' || s.status === 'scheduled'
    return {
      id: `sample_${i + 1}`,
      assetId: `sample_asset_${i + 1}`,
      assetName: s.asset,
      mediaType: s.mediaType,
      channel: s.channel,
      caption: s.caption,
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
