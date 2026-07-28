import { funnelStageFor } from './funnel'
import type { TrafficRow } from './types'

/**
 * Saved Views (smart canvases): a named, persisted, re-resolving filter over a brand's
 * assets. A view stores a FILTER, not a copy, so "Super Conscious's social posts from the
 * last 60 days" stays live: new posts in the window appear, ones that age out drop off.
 * Distinct from a campaign (an authored bucket) and from the per-campaign audience boards
 * (`CanvasBoard`). An asset can appear in many views without being duplicated.
 */

/** The query a view (or list_assets) resolves against. All clauses are AND-ed; an
 *  array clause matches if the asset is any of its values. Empty/omitted = no constraint. */
export interface AssetFilter {
  source?: string[]
  campaign?: string
  channel?: string[]
  audience?: string[]
  stage?: string[]
  status?: string[]
  /** ISO date-time; keep assets published on/after this. */
  publishedAfter?: string
  /** ISO date-time; keep assets published on/before this. */
  publishedBefore?: string
  /** A RELATIVE trailing window in days (7 = last week, 30, 60, 90 = last quarter, 365).
   *  Stored instead of an absolute date so the view stays relative: it re-computes the
   *  cutoff every time it resolves, so "last 30 days" is always the trailing 30 days. */
  withinDays?: number
  /** Include soft-deleted (archived) assets. Default false. */
  includeArchived?: boolean
}

export type ViewLayout = 'board' | 'calendar' | 'grid' | 'list'
export type ViewGroupBy = 'date' | 'channel' | 'audience' | 'stage' | 'none'

export interface SavedView {
  id: string
  brand: string
  name: string
  filter: AssetFilter
  layout: ViewLayout
  groupBy: ViewGroupBy
  /** Sort key: 'newest' | 'oldest' | 'engagement' | a metric key. */
  sort?: string
  createdAt: number
}

let viewSeq = 0
export function newSavedView(brand: string, name: string, patch: Partial<SavedView> = {}): SavedView {
  viewSeq += 1
  return {
    id: patch.id ?? `view_${Date.now().toString(36)}_${viewSeq}`,
    brand,
    name: name.trim() || 'Saved view',
    filter: patch.filter ?? {},
    layout: patch.layout ?? 'board',
    groupBy: patch.groupBy ?? 'none',
    sort: patch.sort ?? 'newest',
    createdAt: patch.createdAt ?? Date.now(),
  }
}

/** The date an asset is filtered/sorted by: when it was published externally, else its
 *  scheduled slot (so generated assets with a date still sort/filter sensibly). */
export function assetDate(r: TrafficRow): number {
  const iso = r.publishedAt || r.scheduledAt
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : r.createdAt ?? 0
}

/** The funnel stage an asset reads as (matches list_assets' `stage`): an explicit
 *  drag-placed stage wins, else it's derived from the channel + type. */
const stageOf = (r: TrafficRow): string => r.funnelStage ?? funnelStageFor(r.channel, r.assetType)

const inSet = (v: string, set?: string[]) => !set || set.length === 0 || set.includes(v)

/** Resolve a relative window (withinDays) to an absolute publishedAfter, relative to
 *  `nowMs`. Done at resolve time so a saved view stays relative. Other clauses pass
 *  through. An explicit publishedAfter that's tighter (later) than the window wins. */
export function resolveWindow(f: AssetFilter, nowMs: number): AssetFilter {
  if (!f.withinDays || f.withinDays <= 0) return f
  const windowStart = nowMs - f.withinDays * 86400000
  const explicit = f.publishedAfter ? Date.parse(f.publishedAfter) : NaN
  const start = Number.isFinite(explicit) ? Math.max(explicit, windowStart) : windowStart
  return { ...f, publishedAfter: new Date(start).toISOString() }
}

/**
 * Does an asset match a filter? Pure and shared by list_assets + a view's resolution,
 * so the connector and the saved canvas always agree. The caller pre-scopes to the brand
 * (and excludes archived unless filter.includeArchived); this narrows the rest.
 */
export function assetMatchesFilter(r: TrafficRow, f: AssetFilter): boolean {
  if (!f.includeArchived && r.archivedAt) return false
  if (f.campaign && (r.campaign ?? '').trim() !== f.campaign.trim()) return false
  if (!inSet(r.source ?? 'generated', f.source)) return false
  if (!inSet(r.channel, f.channel)) return false
  if (!inSet((r.audience ?? '').trim(), f.audience)) return false
  if (!inSet(stageOf(r), f.stage)) return false
  if (!inSet(r.status, f.status)) return false
  if (f.publishedAfter) {
    const after = Date.parse(f.publishedAfter)
    if (Number.isFinite(after) && assetDate(r) < after) return false
  }
  if (f.publishedBefore) {
    const before = Date.parse(f.publishedBefore)
    if (Number.isFinite(before) && assetDate(r) > before) return false
  }
  return true
}

/** The bucket an asset falls in for a groupBy. 'date' buckets by YYYY-MM (month). */
export function groupKeyFor(r: TrafficRow, groupBy: ViewGroupBy): string {
  switch (groupBy) {
    case 'date': {
      const d = new Date(assetDate(r))
      return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'undated'
    }
    case 'channel':
      return r.channel
    case 'audience':
      return (r.audience ?? '').trim() || 'Unsegmented'
    case 'stage':
      return stageOf(r)
    default:
      return 'all'
  }
}
