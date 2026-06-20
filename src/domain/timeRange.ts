import type { TrafficRow } from './types'

/**
 * Time-range horizon for the Connection + Grid views. Caps how far into the
 * future to show; past (already-shipped) assets always remain visible so the
 * window is a forward horizon, not a blinder.
 */
export type TimeRange = 'week' | 'month' | 'quarter' | 'all'

export const TIME_RANGES: { key: TimeRange; label: string; days: number | null }[] = [
  { key: 'week', label: 'Week', days: 7 },
  { key: 'month', label: 'Month', days: 31 },
  { key: 'quarter', label: '3 Months', days: 92 },
  { key: 'all', label: 'All', days: null },
]

const DAYS = Object.fromEntries(TIME_RANGES.map((r) => [r.key, r.days])) as Record<
  TimeRange,
  number | null
>

/** A row is in range if it's already scheduled-or-past, up to the forward horizon. */
export function inTimeRange(row: TrafficRow, range: TimeRange, now: number): boolean {
  const days = DAYS[range]
  if (days == null) return true
  return new Date(row.scheduledAt).getTime() <= now + days * 86_400_000
}
