import { clientForCampaign } from '../domain/clients'
import { messagingAllText } from '../domain/messaging'
import type { ChannelId, TrafficRow } from '../domain/types'

/** The active workspace scope: sidebar channel, search, and Client › Campaign. */
export interface Scope {
  filter: ChannelId | 'all'
  query: string
  clientFilter: string
  campaignFilter: string
}

/** Single source of truth for which rows a view shows. */
export function rowInScope(r: TrafficRow, s: Scope): boolean {
  if (s.filter !== 'all' && r.channel !== s.filter) return false
  if (s.clientFilter !== 'all' && clientForCampaign(r.campaign) !== s.clientFilter) return false
  if (s.campaignFilter !== 'all' && (r.campaign ?? '') !== s.campaignFilter) return false
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
