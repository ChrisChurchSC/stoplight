import type { BrandActuals } from './actuals'
import { formatReach } from './journeyPerf'

/**
 * Portfolio alerts — the "what needs me" layer. Two kinds, both from transparent
 * rules on real inputs:
 *
 * - performance: a channel's reach moved sharply week over week (from the measured
 *   trend on brandActuals). A volume floor keeps low-traffic channels from firing on
 *   noise.
 * - pacing: a campaign is approaching launch without its assets signed off (from the
 *   flight window + approval state).
 *
 * Every alert carries the RULE it fired on, so the signal is inspectable, not a black
 * box. Read by the cockpit and sorted worst-first.
 */

export type AlertSeverity = 'high' | 'medium' | 'low'

export interface Alert {
  id: string
  severity: AlertSeverity
  kind: 'performance' | 'pacing'
  brand: string
  /** Set on campaign-scoped alerts; lets the surface deep-link to the canvas. */
  campaign?: string
  title: string
  detail: string
  /** The rule + thresholds this alert fired on (transparency for the operator). */
  rule: string
}

const RANK: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 }
export const sortAlerts = (a: Alert[]): Alert[] => [...a].sort((x, y) => RANK[x.severity] - RANK[y.severity])

// Performance thresholds. The floor suppresses tiny-volume channels whose percentages
// swing wildly on a handful of impressions.
const PERF_FLOOR = 1000
const PERF_DROP = 0.25
const PERF_SPIKE = 0.5

/** Week-over-week reach alerts for one brand, from its measured channel trends. */
export function performanceAlerts(brand: string, actuals: BrandActuals | undefined | null): Alert[] {
  if (!actuals) return []
  const out: Alert[] = []
  for (const c of actuals.channels) {
    if (!c.trend || c.trend.prior < PERF_FLOOR) continue
    const delta = (c.trend.cur - c.trend.prior) / c.trend.prior
    const span = `${formatReach(c.trend.cur)} this week vs ${formatReach(c.trend.prior)} the week before.`
    if (delta <= -PERF_DROP) {
      const pct = Math.round(Math.abs(delta) * 100)
      out.push({
        id: `perf-${brand}-${c.channel}`,
        severity: pct >= 40 ? 'high' : 'medium',
        kind: 'performance',
        brand,
        title: `${c.label} ${c.reachUnit} down ${pct}% week over week`,
        detail: span,
        rule: `${c.reachUnit} WoW ≤ −${Math.round(PERF_DROP * 100)}%, min ${formatReach(PERF_FLOOR)} prior week`,
      })
    } else if (delta >= PERF_SPIKE) {
      out.push({
        id: `perf-${brand}-${c.channel}`,
        severity: 'low',
        kind: 'performance',
        brand,
        title: `${c.label} ${c.reachUnit} up ${Math.round(delta * 100)}% week over week`,
        detail: span,
        rule: `${c.reachUnit} WoW ≥ +${Math.round(PERF_SPIKE * 100)}%, min ${formatReach(PERF_FLOOR)} prior week`,
      })
    }
  }
  return out
}

const DAY = 86_400_000
// Pacing thresholds: a launch within this horizon that isn't mostly signed off.
const PACE_HORIZON_DAYS = 30
const PACE_APPROVED = 0.8

export interface PacingInput {
  brand: string
  name: string
  label: string
  approved: number
  total: number
  start: number | null
}

/** Launch-readiness alerts: a campaign nears its flight start without sign-off. */
export function pacingAlerts(campaigns: PacingInput[], now: number): Alert[] {
  const out: Alert[] = []
  for (const c of campaigns) {
    if (c.start == null || c.start <= now || c.total === 0) continue
    const days = Math.ceil((c.start - now) / DAY)
    if (days > PACE_HORIZON_DAYS || c.approved / c.total >= PACE_APPROVED) continue
    const pending = c.total - c.approved
    out.push({
      id: `pace-${c.brand}-${c.name}`,
      severity: days <= 7 ? 'high' : 'medium',
      kind: 'pacing',
      brand: c.brand,
      campaign: c.name,
      title: `${c.label} launches in ${days}d, ${c.approved}/${c.total} approved`,
      detail: `${pending} asset${pending === 1 ? '' : 's'} still need sign-off before launch.`,
      rule: `starts ≤ ${PACE_HORIZON_DAYS}d AND approved/total < ${Math.round(PACE_APPROVED * 100)}%`,
    })
  }
  return out
}
