/**
 * Fan-out policy — how deep a personalization fan-out should reasonably go, by channel.
 *
 * The right number of variants is the channel's real distribution surface, not "as many as the
 * math allows". SEO / landing pages legitimately reach the thousands (a page per location × query,
 * each a real ranking asset); organic social should stay near posting cadence — you'll never
 * publish 1,000 posts. These caps drive the fan-out nudges in the UI and the soft limit inside
 * fanOut. Single source of truth: tune a number here and the whole app follows.
 */

export type FanoutChannelKind = 'organic-social' | 'paid' | 'search' | 'email' | 'seo' | 'blog' | 'video' | 'sales'

export const FANOUT_POLICY: Record<FanoutChannelKind, { perMonthCap: number; defaultDimension: string; label: string }> = {
  'organic-social': { perMonthCap: 30, defaultDimension: 'audience', label: 'Organic social' },
  paid: { perMonthCap: 150, defaultDimension: 'audience', label: 'Paid ads' },
  search: { perMonthCap: 250, defaultDimension: 'audience', label: 'Search ads' },
  email: { perMonthCap: 75, defaultDimension: 'journey', label: 'Email / lifecycle' },
  seo: { perMonthCap: 1000, defaultDimension: 'location', label: 'SEO / landing pages' },
  blog: { perMonthCap: 15, defaultDimension: 'audience', label: 'Blog / long-form' },
  video: { perMonthCap: 8, defaultDimension: 'audience', label: 'Video' },
  // Closing assets are worked by a person, one account at a time: a deck or a
  // proposal fans out by segment, not by the hundred.
  sales: { perMonthCap: 40, defaultDimension: 'audience', label: 'Sales & commerce' },
}

/** A hard ceiling on total variants per flow — protects browser storage + render cost, not marketing judgment. */
export const FANOUT_HARD_CEILING = 2000

/** Map a channel id (or alias) to its fan-out kind. String-based so it tolerates aliases. */
export function fanoutChannelKind(channel: string | undefined): FanoutChannelKind {
  const id = (channel ?? '').toLowerCase().trim()
  if (!id) return 'organic-social'
  if (id === 'google-search' || id.includes('search') || id === 'sem') return 'search'
  if (id.startsWith('sales-') || ['proposal', 'checkout', 'post-purchase', 'cart'].includes(id)) return 'sales'
  if (id.endsWith('-ads') || id === 'pmax' || id === 'google-demand') return 'paid'
  if (['email', 'sms', 'push', 'newsletter'].includes(id) || id.includes('email') || id.includes('newsletter')) return 'email'
  if (id === 'youtube') return 'video'
  if (['website', 'web', 'site', 'landing-page', 'lp', 'lead-magnet'].includes(id) || id.includes('landing') || id.includes('seo')) return 'seo'
  if (['blog', 'article', 'events', 'whitepaper', 'guide'].includes(id) || id.includes('blog') || id.includes('article')) return 'blog'
  return 'organic-social'
}

/** Cap for one channel kind over a flight — per-month rate scaled by flight length, small floor. */
export function capForFlight(kind: FanoutChannelKind, flightWeeks: number): number {
  const perMonth = FANOUT_POLICY[kind].perMonthCap
  return Math.max(3, Math.round((perMonth * Math.max(1, flightWeeks)) / 4))
}

/** The dominant channel kind in a set (the most common) — the primary distribution surface. */
export function dominantKind(channels: string[]): FanoutChannelKind {
  const counts: Partial<Record<FanoutChannelKind, number>> = {}
  for (const c of channels) {
    const k = fanoutChannelKind(c)
    counts[k] = (counts[k] ?? 0) + 1
  }
  let top: FanoutChannelKind = 'organic-social'
  let n = -1
  for (const [k, v] of Object.entries(counts)) if ((v ?? 0) > n) { n = v ?? 0; top = k as FanoutChannelKind }
  return top
}

/**
 * Cap for a campaign's channels over the flight. Keyed off the DOMINANT channel, not the sum of
 * every channel present — summing inflates the cap on multi-channel campaigns so it never trips.
 * The dominant surface is what the fan is really for (and it's the same basis as recommendedDimension).
 */
export function capForChannels(channels: string[], flightWeeks: number): number {
  return capForFlight(dominantKind(channels), flightWeeks)
}

/** The dimension that best fits the dominant channel — the sensible default fan-out axis. */
export function recommendedDimension(channels: string[]): string {
  return FANOUT_POLICY[dominantKind(channels)].defaultDimension
}

export type FanoutVerdict = 'ok' | 'warn' | 'over' | 'ceiling'

/** How the projected count sits against the cap: ok / warn (≥80%) / over / ceiling. */
export function fanoutVerdict(variantCount: number, cap: number): FanoutVerdict {
  if (variantCount > FANOUT_HARD_CEILING) return 'ceiling'
  if (variantCount > cap) return 'over'
  if (variantCount >= cap * 0.8) return 'warn'
  return 'ok'
}
