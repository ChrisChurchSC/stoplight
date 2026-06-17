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

export const clientForCampaign = (campaign?: string): string =>
  (campaign && CAMPAIGN_CLIENTS[campaign]) || UNASSIGNED
