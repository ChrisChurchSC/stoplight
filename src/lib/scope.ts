import { clientForCampaign } from '../domain/clients'
import { assetCta, messagingAllText } from '../domain/messaging'
import { assetRtbIds, isApprovedProof, rtbById } from '../domain/rtb'
import type { ChannelId, TrafficRow } from '../domain/types'

/** CTA filter sentinel for "assets that carry no CTA". */
export const CTA_NONE = '__no-cta'

/**
 * Status / governance "card filters" — a workspace-wide narrow by the asset's
 * own state rather than its content axis (channel / proof / CTA / audience):
 *  - flagged  — carries a re-check flag (a frame change moved it off its proof)
 *  - draft    — not yet approved (still in the working set)
 *  - live     — in market (posted or scheduled)
 *  - unvetted — carries a proof point that's an unapproved library draft
 */
export type CardFilter = 'all' | 'flagged' | 'draft' | 'live' | 'unvetted'

/** Does a row pass a card (status / governance) filter? Shared so the Sidebar
 *  count and every view's scope agree. */
export function passesCardFilter(r: TrafficRow, cardFilter: CardFilter): boolean {
  switch (cardFilter) {
    case 'flagged':
      return !!r.recheckFlag
    case 'draft':
      return r.status === 'draft'
    case 'live':
      return r.status === 'posted' || r.status === 'scheduled'
    case 'unvetted':
      return assetRtbIds(r).some((id) => {
        const rtb = rtbById(r.campaign, id)
        return !!rtb && !isApprovedProof(rtb)
      })
    default:
      return true
  }
}

/** The active workspace scope: sidebar channel, search, and Client › Campaign. */
export interface Scope {
  filter: ChannelId | 'all'
  query: string
  clientFilter: string
  campaignFilter: string
  /** Sidebar proof-point filter (an RTB id); 'all' or undefined shows everything. */
  proofFilter?: string
  /** Sidebar CTA filter (a CTA value); 'all' or undefined shows everything. */
  ctaFilter?: string
  /** Sidebar audience filter (an audience name); 'all' or undefined shows everything. */
  audienceFilter?: string
  /** Status / governance card filter (flagged / draft / live / unvetted). */
  cardFilter?: CardFilter
  /** Live workspace: restrict to in-market content (posted or scheduled). */
  liveOnly?: boolean
}

/** Single source of truth for which rows a view shows. */
export function rowInScope(r: TrafficRow, s: Scope): boolean {
  // Archived (soft-deleted) assets are hidden everywhere until restored.
  if (r.archivedAt) return false
  if (s.filter !== 'all' && r.channel !== s.filter) return false
  if (s.proofFilter && s.proofFilter !== 'all' && !assetRtbIds(r).includes(s.proofFilter)) return false
  if (s.ctaFilter && s.ctaFilter !== 'all') {
    const cta = assetCta(r)
    // CTA_NONE matches assets with no CTA at all; otherwise it's an exact match.
    if (s.ctaFilter === CTA_NONE ? cta !== '' : cta !== s.ctaFilter) return false
  }
  if (s.audienceFilter && s.audienceFilter !== 'all' && (r.audience ?? '').trim() !== s.audienceFilter) return false
  if (s.cardFilter && s.cardFilter !== 'all' && !passesCardFilter(r, s.cardFilter)) return false
  if (s.clientFilter !== 'all' && clientForCampaign(r.campaign) !== s.clientFilter) return false
  if (s.campaignFilter !== 'all' && (r.campaign ?? '') !== s.campaignFilter) return false
  if (s.liveOnly && r.status !== 'posted' && r.status !== 'scheduled') return false
  const q = s.query.trim().toLowerCase()
  if (
    q &&
    !(
      r.assetName.toLowerCase().includes(q) ||
      messagingAllText(r).toLowerCase().includes(q) ||
      r.channel.includes(q)
    )
  )
    return false
  return true
}
