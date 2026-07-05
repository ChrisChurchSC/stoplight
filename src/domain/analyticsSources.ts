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
  /** KPI stems this source can measure — matched against a goal's KPI so the app can say
   *  which connector to add when a goal's metric has no connected source. */
  kpis: string[]
}

export const ANALYTICS_SOURCES: AnalyticsSource[] = [
  { id: 'youtube_analytics', label: 'YouTube Analytics', metrics: 'views, subscribers, watch time', kpis: ['subscrib', 'view', 'watch'] },
  { id: 'google_analytics_4', label: 'GA4', metrics: 'sessions, conversions, revenue', kpis: ['session', 'traffic', 'conversion', 'sign', 'visit'] },
  { id: 'google_search_console', label: 'Search Console', metrics: 'impressions, clicks, position', kpis: ['impression', 'click', 'organic', 'search', 'rank'] },
  { id: 'linkedin_company_pages', label: 'LinkedIn Pages', metrics: 'impressions, followers, engagement', kpis: ['follow', 'impression', 'engagement'] },
  { id: 'facebook_pages', label: 'Meta / Instagram', metrics: 'reach, engagement, followers', kpis: ['follow', 'reach', 'engagement'] },
  { id: 'tiktok', label: 'TikTok', metrics: 'views, followers, engagement', kpis: ['follow', 'view', 'engagement'] },
  { id: 'email', label: 'Email (Neon One / Mailchimp / Klaviyo)', metrics: 'subscribers, sends, opens', kpis: ['subscrib', 'open', 'send', 'sign', 'newsletter', 'list'] },
  { id: 'crm', label: 'CRM (HubSpot / Salesforce / Neon)', metrics: 'leads, donations, revenue', kpis: ['lead', 'donat', 'revenue', 'member', 'purchase', 'opportunit', 'meeting', 'pledge', 'sales', 'fundrais'] },
]

export const sourceLabel = (id: string): string => ANALYTICS_SOURCES.find((s) => s.id === id)?.label ?? id

/** Known sources that aren't in the connected set — the "connect these to add them" list. */
export const missingSources = (connected: string[] | undefined | null): AnalyticsSource[] => {
  const set = new Set(connected ?? [])
  return ANALYTICS_SOURCES.filter((s) => !set.has(s.id))
}

/** The sources that can measure a given KPI (by stem match). */
export const sourcesForKpi = (kpi: string): AnalyticsSource[] => {
  const k = (kpi ?? '').toLowerCase().trim()
  if (!k) return []
  return ANALYTICS_SOURCES.filter((s) => s.kpis.some((kw) => k.includes(kw)))
}

/** Whether a KPI is measurable with the connected sources, and if not, which connectors
 *  would measure it. `measured` = connected sources feeding this KPI; `gap` = connectors to
 *  add (non-empty only when nothing connected can measure it). Both empty = KPI not mapped. */
export function kpiMeasurement(
  kpi: string,
  connected: string[] | undefined | null,
): { measured: AnalyticsSource[]; gap: AnalyticsSource[] } {
  const relevant = sourcesForKpi(kpi)
  const set = new Set(connected ?? [])
  const measured = relevant.filter((s) => set.has(s.id))
  return { measured, gap: measured.length ? [] : relevant }
}
