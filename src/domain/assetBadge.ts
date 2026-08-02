import type { RowStatus, TrafficRow } from './types'

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

/**
 * EVERY STATUS, IN ORDER, WITH THE WORD FOR IT. One list, because there were three and they
 * disagreed: two `<select>`s offered five of the seven values, so an asset the review drawer had
 * just marked `in_review` or `rejected` selected NOTHING and the cell went blank; and a panel
 * elsewhere called four of the seven "Draft", so a posted asset read `posted` in the grid and
 * "Draft" in the inspector beside it.
 *
 * Distinct from assetBadge, deliberately. A badge collapses posted and scheduled into "Live",
 * which is the right reading for a glance at a card. A picker cannot collapse anything: it has to
 * offer each state you can actually put a row into.
 */
export const STATUS_ORDER: RowStatus[] = ['draft', 'in_review', 'approved', 'rejected', 'scheduled', 'posted', 'failed']

export const STATUS_LABEL: Record<RowStatus, string> = {
  draft: 'draft',
  in_review: 'in review',
  approved: 'approved',
  rejected: 'rejected',
  scheduled: 'scheduled',
  posted: 'posted',
  failed: 'failed',
}
