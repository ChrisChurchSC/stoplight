/**
 * The universe of analytics sources the aggregator (Summer / Forward) can connect,
 * keyed by its connector id. A brand's measured actuals carry the ids that are actually
 * connected (BrandActuals.sources); the Metrics tab renders those and prompts for the
 * rest. This is what lets the tab shape itself to each brand's stack instead of a fixed
 * list — add a connector in Summer and a new source shows up here.
 */

export interface AnalyticsSource {
  /** Summer connector id (matches a lakehouse mart schema, e.g. youtube_analytics). */
  id: string
  label: string
  /** What this source contributes, one short line. */
  metrics: string
}

export const ANALYTICS_SOURCES: AnalyticsSource[] = [
  { id: 'youtube_analytics', label: 'YouTube Analytics', metrics: 'views, subscribers, watch time' },
  { id: 'google_analytics_4', label: 'GA4', metrics: 'sessions, conversions, revenue' },
  { id: 'google_search_console', label: 'Search Console', metrics: 'impressions, clicks, position' },
  { id: 'linkedin_company_pages', label: 'LinkedIn Pages', metrics: 'impressions, followers, engagement' },
  { id: 'facebook_pages', label: 'Meta / Instagram', metrics: 'reach, engagement, followers' },
  { id: 'tiktok', label: 'TikTok', metrics: 'views, followers, engagement' },
  { id: 'email', label: 'Email (Neon One / Mailchimp / Klaviyo)', metrics: 'subscribers, sends, opens' },
  { id: 'crm', label: 'CRM (HubSpot / Salesforce / Neon)', metrics: 'leads, donations, revenue' },
]

export const sourceLabel = (id: string): string => ANALYTICS_SOURCES.find((s) => s.id === id)?.label ?? id

/** Known sources that aren't in the connected set — the "connect these to add them" list. */
export const missingSources = (connected: string[] | undefined | null): AnalyticsSource[] => {
  const set = new Set(connected ?? [])
  return ANALYTICS_SOURCES.filter((s) => !set.has(s.id))
}
