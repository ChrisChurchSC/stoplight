import type { Icp } from '../icp/types'

/** A contact (lead) in Attio — the system of record. Carries first-touch source. */
export interface AttioContact {
  email: string
  name: string
  company?: string
  /** First-touch attribution — the asset/campaign that originated this contact. */
  sourceAsset?: string
  sourceCampaign?: string
}

export interface AttioDeal {
  id: string
  contactEmail: string
  amount: number
  stage: 'open' | 'closed-won' | 'closed-lost'
  /** First-touch source, written back so reporting traces asset → campaign → deal. */
  sourceAsset?: string
  sourceCampaign?: string
}

/** Revenue/lead rollup attributed to an asset or campaign. */
export interface Attribution {
  leads: number
  openDeals: number
  wonRevenue: number
}

/**
 * Attio = system of record (contacts, deals, attribution). ICP enrichment/scoring
 * happens upstream via Claude (MCP) and syncs in; the tool reads ICP context from
 * there and reads/writes contacts + attribution here. Email is the dedup key.
 */
export interface AttioAdapter {
  /** Capture a lead (lead magnet / landing page / intent commenter) into Attio. */
  pushContact(contact: AttioContact): Promise<void>
  listContacts(): AttioContact[]
  listDeals(): AttioDeal[]
  /** First-touch rollup for an originating asset. */
  attributionForAsset(assetName: string): Attribution
  /** Total closed-won revenue attributed across all assets. */
  totalWonRevenue(): number
  /** Refined ICP derived from actual closed-won customers (the feedback loop). */
  closedWonIcp(): Icp
}
