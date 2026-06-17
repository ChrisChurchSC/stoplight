import { CHANNELS } from './channels'
import type { ChannelId, TrafficRow } from './types'

export const isPaidChannel = (c: ChannelId): boolean => CHANNELS[c].kind === 'paid'
export const isPaidRow = (r: TrafficRow): boolean => isPaidChannel(r.channel)
export const hasBudget = (r: TrafficRow): boolean => !!r.budget && r.budget.amount > 0

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

const DAY = 86_400_000
const DEFAULT_FLIGHT_DAYS = 14

function flight(row: TrafficRow): { start: number; end: number } {
  const start = new Date(row.scheduledAt).getTime()
  const end = row.budget?.endDate
    ? new Date(row.budget.endDate).getTime()
    : start + DEFAULT_FLIGHT_DAYS * DAY
  return { start, end: Math.max(end, start + DAY) }
}

/** Planned spend-to-date from the flight + budget type (time-based, no actuals). */
export function plannedToDate(row: TrafficRow, now: number): number {
  if (!row.budget) return 0
  const { start, end } = flight(row)
  if (now <= start) return 0
  if (row.budget.type === 'daily') {
    const days = Math.min((now - start) / DAY, (end - start) / DAY)
    return row.budget.amount * Math.max(0, days)
  }
  // lifetime: linear over the flight
  const frac = Math.max(0, Math.min(1, (now - start) / (end - start)))
  return row.budget.amount * frac
}

export type PaceStatus = 'on-track' | 'under' | 'over' | 'cap' | 'none'

export interface Pacing {
  planned: number
  spent: number
  pct: number
  status: PaceStatus
}

export function pacing(row: TrafficRow, now: number): Pacing {
  if (!row.budget || !row.spend) {
    return { planned: 0, spent: row.spend?.toDate ?? 0, pct: 0, status: 'none' }
  }
  const planned = plannedToDate(row, now)
  const spent = row.spend.toDate
  const pct = planned > 0 ? spent / planned : 0
  let status: PaceStatus = 'on-track'
  if (row.budget.type === 'lifetime' && spent > row.budget.amount * 0.9) status = 'cap'
  else if (pct > 1.15) status = 'over'
  else if (pct < 0.8) status = 'under'
  return { planned, spent, pct, status }
}

export const PACE_LABEL: Record<PaceStatus, string> = {
  'on-track': 'On track',
  under: 'Underspending',
  over: 'Overspending',
  cap: 'Near cap',
  none: 'No spend yet',
}

/** Allocation rollup across the to-be-trafficked paid set, by channel. */
export function allocation(rows: TrafficRow[]): {
  total: number
  byChannel: { channel: ChannelId; total: number }[]
} {
  const paid = rows.filter((r) => isPaidRow(r) && r.budget)
  const map = new Map<ChannelId, number>()
  for (const r of paid) {
    map.set(r.channel, (map.get(r.channel) ?? 0) + (r.budget?.amount ?? 0))
  }
  return {
    total: [...map.values()].reduce((a, b) => a + b, 0),
    byChannel: [...map.entries()].map(([channel, total]) => ({ channel, total })),
  }
}

/**
 * Mock spend source — stands in for a daily pull from each platform's ads API.
 * Deterministic per row (varies under/on-track/over) so pacing demos cleanly.
 * Swap for a real adapter keyed by the same platform/UTM ids used to traffic.
 */
export function mockSpend(row: TrafficRow, now: number): number {
  if (!row.budget) return 0
  const seed = [...row.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const factor = 0.55 + (seed % 90) / 100 // 0.55 .. 1.44
  return Math.round(plannedToDate(row, now) * factor)
}
