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
  /**
   * WHETHER THE NUMBERS THIS RETURNS ARE REAL.
   *
   * The only adapter in the tree is a mock: six fictional contacts and five fictional deals, with
   * attribution matched on the SAMPLE workspace's asset names. Two things follow, and both reached
   * the screen unmarked.
   *
   * In the sample workspace it returns $48,000 and $72,000 closed-won, which render in the same
   * type, beside genuinely-measured engagement, with nothing to say they were invented.
   *
   * In a REAL workspace no asset name matches, so it returns zero — and a KPI strip reading £0
   * attributed revenue with no ROAS does not say "no CRM is connected". It says the campaigns
   * earned nothing. That is the worse of the two, because it is the one a customer sees.
   *
   * A real adapter sets this false and the marks disappear on their own.
   */
  readonly isSample: boolean
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
