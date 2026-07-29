/**
 * AGGREGATORS: the fourth way a Data source card gets filled.
 *
 * The other three routes end with a table you can see: a spreadsheet you typed, a CSV you uploaded,
 * a sketch the model invented. This one ends with a table somebody else's warehouse is holding, and
 * that difference is the whole design problem. A connector is the only route where the app can look
 * connected while returning nothing, so everything here is built to make the true state visible:
 *
 *   - A provider is only offered if it is IMPLEMENTED and CONFIGURED, and the card says which of the
 *     two is missing. The version of this list that shipped before was four labels ("Google
 *     Analytics", "Search Console", …) wired to nothing: picking one set the card's refId to the
 *     string "google-analytics", which matched no data set and fed no prompt. The card looked wired.
 *     Nothing was.
 *   - Credentials live on the SERVER only. The token never reaches the browser, so this module holds
 *     the shape of a provider and none of its secrets.
 *   - A pull is a NAMED QUESTION, not a SQL box. "Top search queries" is a thing a marketer wants;
 *     `keyword_site_report_by_site` is not, and a canvas card is the wrong place to debug a join.
 *
 * The SQL behind each pull was run against a real Summer warehouse before it was written down here,
 * which is the only reason the table names are right: the obvious guess for "top pages" is
 * `site_report_by_page`, and that table has no `page` column. `page_report` does.
 */

/**
 * Providers the user might name, of two sorts.
 *
 * A WAREHOUSE holds several channels behind one connection and is queried with SQL. A CHANNEL is the
 * platform itself, asked directly through its own API. The distinction is real (different auth,
 * different transport, different freshness) but it is not the user's problem, so the questions on
 * offer are the same vocabulary either way: "top search queries" means the same thing whether it
 * comes through Summer or straight from Search Console.
 */
export type AggregatorProvider = 'summer' | 'supermetrics' | 'databox' | 'google' | 'linkedin' | 'instagram'

export interface AggregatorSpec {
  id: AggregatorProvider
  /** Warehouse by default; channels say so, which is how the panel groups them. */
  kind?: 'warehouse' | 'channel'
  label: string
  /** One line, shown under the name when the provider is not connected. */
  blurb: string
  /** Server-side env var that connects it. Named in the UI so the fix is actionable. */
  envVar: string
  /**
   * Whether an adapter exists at all. False means "we have not written this yet", which is a
   * different sentence from "you have not connected it", and the card says the right one.
   */
  implemented: boolean
}

export const AGGREGATORS: AggregatorSpec[] = [
  {
    id: 'summer',
    label: 'Summer',
    blurb: 'Warehouse of your connected channels, queried live.',
    envVar: 'SUMMER_API_TOKEN',
    implemented: true,
  },
  {
    id: 'supermetrics',
    // Precise on purpose. The app CAN already use a Supermetrics key: actualsHandler reads one to
    // fill the brand metrics panel. What is missing is pulling an arbitrary table onto a card, and a
    // flat "not built" would contradict a key the user may already have set.
    label: 'Supermetrics',
    blurb: 'Brand metrics can use a Supermetrics key already. Pulling a table onto a card is not built yet.',
    envVar: 'SUPERMETRICS_API_KEY',
    implemented: false,
  },
  {
    id: 'databox',
    label: 'Databox',
    blurb: 'Not built yet. Export a CSV from Databox and upload it instead.',
    envVar: 'DATABOX_API_KEY',
    implemented: false,
  },
  /**
   * DIRECT CHANNELS: the same questions, without a warehouse in between.
   *
   * Google is one entry rather than three because it is one consent: the stored connection carries
   * analytics.readonly, webmasters.readonly and yt-analytics.readonly together, so a workspace that
   * has connected Google can answer GA4, Search Console and YouTube questions from it. Which of the
   * three actually appear is decided by what that account can see, not by this list.
   */
  {
    id: 'google',
    kind: 'channel',
    label: 'Google',
    blurb: 'Analytics, Search Console and YouTube, straight from the account.',
    envVar: 'GA4_REFRESH_TOKEN',
    implemented: true,
  },
  {
    id: 'linkedin',
    kind: 'channel',
    label: 'LinkedIn',
    blurb: 'Not built yet. Needs a LinkedIn app with Community Management access.',
    envVar: 'LINKEDIN_ACCESS_TOKEN',
    implemented: false,
  },
  {
    id: 'instagram',
    kind: 'channel',
    label: 'Instagram',
    blurb: 'Not built yet. Needs a Meta app and a connected business account.',
    envVar: 'INSTAGRAM_ACCESS_TOKEN',
    implemented: false,
  },
]

export const aggregatorSpec = (id: string): AggregatorSpec | undefined =>
  AGGREGATORS.find((a) => a.id === id)

export const specKind = (a: AggregatorSpec): 'warehouse' | 'channel' => a.kind ?? 'warehouse'

/**
 * A named question, tied to one connected service.
 *
 * `service` matches the warehouse's own connector name (Summer calls a Search Console mart
 * `google_search_console`), so the app can offer only the pulls the user's warehouse can answer
 * rather than listing every question and failing on most of them.
 */
export interface AggregatorPull {
  id: string
  label: string
  service: string
  /** What the resulting table holds, in one line, shown before the pull runs. */
  detail: string
}

/** How far back a pull reaches. A fixed set, because it is interpolated into SQL server-side. */
export const PULL_WINDOWS = [30, 90, 365] as const
export type PullWindow = (typeof PULL_WINDOWS)[number]
export const isPullWindow = (n: unknown): n is PullWindow =>
  typeof n === 'number' && (PULL_WINDOWS as readonly number[]).includes(n)

export const AGGREGATOR_PULLS: AggregatorPull[] = [
  {
    id: 'gsc-queries',
    label: 'Top search queries',
    service: 'google_search_console',
    detail: 'Query, clicks, impressions, CTR and average position.',
  },
  {
    id: 'gsc-pages',
    label: 'Top landing pages',
    service: 'google_search_console',
    detail: 'Page, clicks, impressions, CTR and average position.',
  },
  {
    id: 'ga4-channels',
    label: 'Traffic by channel',
    service: 'google_analytics_4',
    detail: 'Channel, sessions, users, engaged rate and conversions.',
  },
  {
    id: 'ga4-pages',
    label: 'Top pages by views',
    service: 'google_analytics_4',
    detail: 'Page path, views, users and average engagement.',
  },
  {
    id: 'yt-videos',
    label: 'Video performance',
    service: 'youtube_analytics',
    detail: 'Video, views, watch time, average view length and subscribers gained.',
  },
  {
    id: 'li-posts',
    label: 'Post performance',
    service: 'linkedin_company_pages',
    detail: 'Post, impressions, clicks, reactions and engagement rate.',
  },
]

export const pullsForServices = (services: string[]): AggregatorPull[] =>
  AGGREGATOR_PULLS.filter((p) => services.includes(p.service))

/** Wire shapes, shared by the handler and the card so a rename breaks the build, not the feature. */
export interface AggregatorStatus {
  providers: { id: AggregatorProvider; configured: boolean; implemented: boolean }[]
}

export interface AggregatorSource {
  /** Opaque to the client: provider-specific ids, passed straight back on pull. */
  id: string
  label: string
  /** Connected services, used to narrow the pull list to answerable questions. */
  services: string[]
}

export interface AggregatorPullResult {
  columns: string[]
  rows: string[][]
  /** True when the row cap was hit, so the card can say the table is partial rather than imply it is all. */
  truncated: boolean
}
