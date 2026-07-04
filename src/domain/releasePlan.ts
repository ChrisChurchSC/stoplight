/**
 * Release planning — stage a portfolio of campaigns into paced launch waves instead
 * of shipping everything at once. Each campaign wants to launch in its flight window;
 * a per-wave cadence cap keeps any single week from overloading (extras stagger to the
 * next open week). Readiness (approval + coherence) rides along so the plan shows both
 * WHEN each campaign is slated and whether it's actually clear to go.
 *
 * Pure and deterministic: the UI passes campaigns + a cap + `now`, and gets back waves.
 */

const DAY = 86_400_000
const WEEK = 7 * DAY

export interface ReleaseCampaign {
  name: string
  brand: string
  label: string
  status: string
  reach: number
  toConversion: number
  /** Intended launch (flight start) and end, ms epoch, or null when undated. */
  start: number | null
  end: number | null
  approved: number
  total: number
  /** High-severity triage flags (coherence / re-check) that should block a launch. */
  highFlags: number
}

export interface ReleaseItem extends ReleaseCampaign {
  /** Clear to launch: fully approved, has assets, no blocking flag. */
  launchReady: boolean
  /** What still stands between it and launch (empty when ready). */
  reasons: string[]
  /** approved / total, 0..1. */
  readiness: number
  /** Pushed to a later week than intended because its target week hit the cap. */
  bumped: boolean
  /** Monday (ms) of the wave it's slotted into, or null when undated. */
  weekStart: number | null
}

export interface ReleaseWave {
  weekStart: number
  items: ReleaseItem[]
  reach: number
  ready: number
}

export interface ReleaseBoard {
  waves: ReleaseWave[]
  /** Campaigns with no flight window — can't be slotted until dated. */
  undated: ReleaseItem[]
  readyCount: number
  needsWorkCount: number
  total: number
}

/** Monday 00:00 (local) of the week containing `ms`. */
export function weekStart(ms: number): number {
  const d = new Date(ms)
  const backToMon = (d.getDay() + 6) % 7 // 0 = Monday
  return +new Date(d.getFullYear(), d.getMonth(), d.getDate() - backToMon)
}

function toItem(c: ReleaseCampaign, wk: number | null, bumped: boolean): ReleaseItem {
  const readiness = c.total ? c.approved / c.total : 0
  const reasons: string[] = []
  if (c.total === 0) reasons.push('no assets yet')
  else if (c.approved < c.total) reasons.push(`${c.total - c.approved} need sign-off`)
  if (c.highFlags > 0) reasons.push(`${c.highFlags} to fix`)
  const launchReady = c.total > 0 && c.approved === c.total && c.highFlags === 0
  return { ...c, launchReady, reasons, readiness, bumped, weekStart: wk }
}

/**
 * Build the staged release board. Dated campaigns are slotted into the week of their
 * intended launch; if a week already holds `cap` launches, the lowest-value overflow
 * staggers to the next open week. `cap` of 0 or less means no cap.
 */
export function buildReleaseBoard(campaigns: ReleaseCampaign[], cap: number, _now: number): ReleaseBoard {
  const dated = campaigns.filter((c) => c.start != null)
  const undated = campaigns.filter((c) => c.start == null).map((c) => toItem(c, null, false))

  // Earliest intended launch first; higher projected reach wins a contested slot.
  dated.sort((a, b) => a.start! - b.start! || b.reach - a.reach)

  const perWeek = new Map<number, number>()
  const items: ReleaseItem[] = dated.map((c) => {
    let wk = weekStart(c.start!)
    let bumped = false
    while (cap > 0 && (perWeek.get(wk) ?? 0) >= cap) {
      wk += WEEK
      bumped = true
    }
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1)
    return toItem(c, wk, bumped)
  })

  const byWeek = new Map<number, ReleaseItem[]>()
  for (const it of items) {
    const list = byWeek.get(it.weekStart!)
    if (list) list.push(it)
    else byWeek.set(it.weekStart!, [it])
  }
  const waves: ReleaseWave[] = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wk, its]) => ({
      weekStart: wk,
      items: its,
      reach: its.reduce((a, i) => a + i.reach, 0),
      ready: its.filter((i) => i.launchReady).length,
    }))

  const readyCount = [...items, ...undated].filter((i) => i.launchReady).length
  return { waves, undated, readyCount, needsWorkCount: campaigns.length - readyCount, total: campaigns.length }
}
