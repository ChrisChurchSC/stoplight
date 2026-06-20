/**
 * Campaigns belong to a client. The breadcrumb walks Client › Campaign, and a
 * campaign maps to exactly one client. Campaigns not listed here fall back to
 * "Unassigned" so new free-text campaigns still slot somewhere.
 */
export const CAMPAIGN_CLIENTS: Record<string, string> = {
  'Spring Launch 2026': 'Acme Co',
  'Q2 Demand Gen': 'Acme Co',
  'Webinar: Scaling Ops': 'Globex',
}

export const UNASSIGNED = 'Unassigned'

/** A campaign created through the new-client wizard. */
/** Client identity captured in the intake wizard. Feeds the ICP + copy drafting. */
export interface ClientProfile {
  website?: string
  industry?: string
  /** Short brand-voice note, e.g. "Plain, technical, no hype." */
  voice?: string
  /** B2C / B2B / B2B2C / … — drives which audience fields matter. */
  businessModel?: string
  companySize?: string
  revenue?: string
  funding?: string
  region?: string
}

export interface Campaign {
  name: string
  client: string
  strategy: string
  objective?: string
  /** Flight length in weeks; omitted/0 = ongoing. */
  durationWeeks?: number
  /** Overall campaign budget (media + content/production). Drives mediaBudget. */
  overallBudget?: number
  /** Paid-media budget for the flight: the strategy's media share of overallBudget. */
  mediaBudget?: number
  /** Content pieces produced per month (monthly cadence total). */
  contentPerMonth?: number
  /** One-time brand assets built for the campaign (landing pages, etc.). */
  oneTimeAssets?: number
  // ---- Timing dimension (drives when/how the campaign ships) ----
  /** one-off / seasonal / always-on / triggered. Defaults to one-off. */
  timing?: import('./timing').CampaignTiming
  /** Seasonal: the recurring window (e.g. "Holiday"). */
  seasonalWindow?: string
  /** Seasonal: which cycle this is (1, 2, …); a re-run increments it. */
  seasonalCycle?: number
  /** Seasonal re-run: the campaign this cycle was cloned from. */
  sourceCampaign?: string
  /** Always-on: creative refresh cadence in weeks (auto-rotation). */
  refreshWeeks?: number
  /** Triggered: behavior (lifecycle) vs moment (cultural). */
  triggerKind?: import('./timing').TriggerKind
  /** Triggered: the selected event (scaffolded, not yet wired). */
  triggerEvent?: string
}

// Campaigns created at runtime (the wizard) register here so clientForCampaign
// resolves them before any rows exist. The store hydrates this from localStorage.
const runtimeCampaignClients: Record<string, string> = {}

export function registerCampaign(name: string, client: string): void {
  const n = name.trim()
  if (n) runtimeCampaignClients[n] = client
}

export const clientForCampaign = (campaign?: string): string =>
  (campaign && (runtimeCampaignClients[campaign] ?? CAMPAIGN_CLIENTS[campaign])) || UNASSIGNED
