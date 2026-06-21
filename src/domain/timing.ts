/**
 * The timing dimension — a cross-cutting tag on every campaign that drives *when*
 * and *how* it ships. Orthogonal to objective and audience: any objective + any
 * audience set can carry any timing. Setting timing once tells the trafficking
 * system how to put the campaign out.
 */

export type CampaignTiming = 'one-off' | 'seasonal' | 'always-on' | 'triggered'

/** Triggered sub-kinds (from the nested strategy model). */
export type TriggerKind = 'behavior' | 'moment'

export interface TimingDef {
  key: CampaignTiming
  label: string
  icon: string
  blurb: string
  /** How scheduling behaves for this type. */
  scheduling: string
  /** False = selectable in the model but event wiring not yet built. */
  built: boolean
}

export const TIMINGS: TimingDef[] = [
  {
    key: 'one-off',
    label: 'One-off',
    icon: '◆',
    blurb: 'A discrete campaign with fixed start/end dates. Built, shipped once, done.',
    scheduling: 'Traffic on the set dates, then complete.',
    built: true,
  },
  {
    key: 'seasonal',
    label: 'Seasonal',
    icon: '↻',
    blurb: 'Recurs on a calendar cycle — holiday push, back-to-school, a fiscal-quarter moment.',
    scheduling: 'Tied to a recurring window; re-run each cycle from the prior one (improved).',
    built: true,
  },
  {
    key: 'always-on',
    label: 'Always-on',
    icon: '∞',
    blurb: 'Perpetual, no end date — evergreen nurture, ongoing local lead-gen, always-on demand.',
    scheduling: 'Continuous trafficking; rotate creative on a refresh cadence so it never goes stale.',
    built: true,
  },
  {
    key: 'triggered',
    label: 'Triggered',
    icon: '⚡',
    blurb: 'Fired by an event, not a calendar — a customer action or an external moment.',
    scheduling: 'Wired to an event source; ships the checked assets when the trigger fires.',
    built: true,
  },
]

export const TIMING_BY_KEY: Record<CampaignTiming, TimingDef> = Object.fromEntries(
  TIMINGS.map((t) => [t.key, t]),
) as Record<CampaignTiming, TimingDef>

/** Recurring windows a seasonal campaign can be tied to. */
export const SEASONAL_WINDOWS = [
  'Spring',
  'Summer',
  'Back-to-School',
  'Fall',
  'Holiday',
  'New Year',
  "Valentine's Day",
  'Black Friday / Cyber Monday',
  'Q1',
  'Q2',
  'Q3',
  'Q4',
]

/** Always-on creative refresh cadences (weeks). */
export const REFRESH_CADENCES: { weeks: number; label: string }[] = [
  { weeks: 2, label: 'Every 2 weeks' },
  { weeks: 4, label: 'Monthly' },
  { weeks: 8, label: 'Every 8 weeks' },
  { weeks: 12, label: 'Quarterly' },
]

export const TRIGGER_KINDS: { key: TriggerKind; label: string; source: string; blurb: string }[] = [
  {
    key: 'behavior',
    label: 'Behavior-triggered',
    source: 'CRM / Attio lifecycle',
    blurb: 'A customer action — signup, lapse, milestone.',
  },
  {
    key: 'moment',
    label: 'Moment-triggered',
    source: 'Cultural / manual',
    blurb: 'An external event — news, trend, competitor move.',
  },
]

export const TRIGGER_EVENTS: Record<TriggerKind, string[]> = {
  behavior: ['Signup', 'Trial started', 'Lapsed / churned', 'Milestone reached', 'Cart abandoned', 'Renewal due'],
  moment: ['Breaking news', 'Trending topic', 'Competitor move', 'Weather event', 'Local event'],
}
