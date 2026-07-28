import type { TrafficRow } from './types'

/**
 * The lifecycle marker an asset card shows, so a real published ("live") asset is told
 * apart at a glance from a working draft. Live = in market (posted/scheduled) — which is
 * what real imported social posts + site pages carry. The review states sit between.
 */
export type BadgeKind = 'live' | 'draft' | 'review' | 'approved' | 'rejected' | 'failed'

export function assetBadge(r: TrafficRow): { label: string; kind: BadgeKind } {
  switch (r.status) {
    case 'posted':
    case 'scheduled':
      return { label: 'Live', kind: 'live' }
    case 'approved':
      return { label: 'Approved', kind: 'approved' }
    case 'in_review':
      return { label: 'In review', kind: 'review' }
    case 'rejected':
      return { label: 'Rejected', kind: 'rejected' }
    case 'failed':
      return { label: 'Failed', kind: 'failed' }
    default:
      return { label: 'Draft', kind: 'draft' }
  }
}
