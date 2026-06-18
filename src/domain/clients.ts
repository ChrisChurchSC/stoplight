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
export interface Campaign {
  name: string
  client: string
  strategy: string
  objective?: string
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
