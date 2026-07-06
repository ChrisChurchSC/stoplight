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

/** Four tone dimensions on a 0–100 scale (0 = the left trait, 100 = the right).
 *  A neutral brand sits at 50 on each. Modeled on the NN/g tone-of-voice axes. */
export interface VoiceTone {
  funnySerious?: number
  casualFormal?: number
  irreverentRespectful?: number
  enthusiasticMatterOfFact?: number
}

/** The detailed brand-voice guide behind the short `voice` summary — the full
 *  reference the team writes to and reviews against. The `voice` string stays the
 *  compact line generation is prompted with; this is the human-facing guide. */
export interface VoiceGuide {
  /** Personality in a few adjectives (e.g. warm, candid, wry). */
  traits?: string[]
  /** Where the brand sits on the four tone dimensions. */
  tone?: VoiceTone
  /** Practices to follow. */
  dos?: string[]
  /** Practices to avoid. */
  donts?: string[]
  /** Words & phrases we reach for. */
  preferredWords?: string[]
  /** Words & phrases we never use. */
  avoidWords?: string[]
  /** Grammar & mechanics: capitalization, punctuation, emoji, contractions. */
  mechanics?: string
  /** Reading level / sentence-length guidance. */
  readingLevel?: string
  /** Signature line / tagline. */
  tagline?: string
  /** Sample copy that sounds unmistakably on-brand. */
  examples?: string[]
}

/** A campaign created through the new-client wizard. */
/** Client identity captured in the intake wizard. Feeds the ICP + copy drafting. */
/** A competitor in the brand's landscape. `kind` says what you compete with them FOR:
 *  'answer' — they own the search / answer-engine real estate for your questions;
 *  'attention' — they win your audience's watch-time on adjacent topics;
 *  'model' — they're the closest direct analog to what you actually do. */
export interface Competitor {
  name: string
  kind?: 'answer' | 'attention' | 'model'
  /** One line on what they are. */
  what?: string
  /** Where they win — the ground they hold. */
  strength?: string
  /** Where they're weak, and the opening it leaves you. */
  gap?: string
  url?: string
}

export interface ClientProfile {
  website?: string
  industry?: string
  /** Short brand-voice note, e.g. "Plain, technical, no hype." The compact line
   *  injected into generation prompts + measured by the coherence check. */
  voice?: string
  /** The detailed voice guide behind the summary (traits, tone, do/don't, lexicon). */
  voiceGuide?: VoiceGuide
  // ---- GTM motion (inferred at setup, overridable) ----
  /** The active GTM strategy key (e.g. 'plg', 'demand-gen', 'sales-led'). Inferred
   *  from business-model signals at setup, pre-selected for generation, overridable. */
  strategy?: string
  /** An optional secondary motion (motions can combine, e.g. PLG + demand-capture). */
  secondaryStrategy?: string
  /** Why this motion was chosen — human-readable, so the recommendation is trustable. */
  strategyRationale?: string
  /** Inference confidence: 'low' | 'medium' | 'high'. */
  strategyConfidence?: string
  /** The business-model signals the recommendation was grounded in. */
  strategySignals?: string[]
  /** Personalization locations (cities / regions / neighborhoods) the Location
   *  fan-out card fans across. */
  locations?: string[]
  /** Standing personalization values per fan-out dimension the brand fans across
   *  (behavior, tier, language, account, …). Location has its own `locations`;
   *  audience + journey come from the library / funnel. Set in the Personalization tab. */
  personalization?: Record<string, string[]>
  // ---- Company overview (filled in by site ingestion) ----
  /** One line on what the company does. */
  oneLiner?: string
  /** The business goal the marketing serves — the outcome campaigns ladder up to
   *  (e.g. "grow the movement to fund community-owned businesses"). The north-star the
   *  Portfolio frames every campaign's goal against. */
  businessGoal?: string
  /** The north-star metric the business goal is measured by (e.g. "Subscribers"). */
  businessKpi?: string
  /** The overall target for that north-star metric (campaign targets sum toward it). */
  businessTarget?: number
  /** The company's mission, in their words. */
  mission?: string
  /** Founding year (or date), as stated. */
  founded?: string
  /** Headquarters / primary location. */
  headquarters?: string
  /** Key people: founders, leadership, named team. */
  team?: { name: string; role?: string }[]
  /** What they make or offer: products, services, programs. */
  products?: string[]
  /** What sets them apart — their stated differentiators. */
  differentiators?: string[]
  /** The competitive landscape — who the brand is really up against, for attention and
   *  for answers. A brand-system input (you define it), so other reads can contrast
   *  against it: AEO answers written against the incumbent, Signals differentiation. */
  competitors?: Competitor[]
  /** The brand's wedge: the position it owns that no competitor does. The one sentence
   *  the whole landscape resolves to. */
  wedge?: string
  /** Named clients, partners, or backers. */
  notableClients?: string[]
  /** Stated values / principles. */
  values?: string[]
  /** Traction in their words: a key stat or milestone (e.g. "2M downloads"). */
  traction?: string
  /** Connected channel profile URLs (social accounts) to re-gather on refresh. */
  channels?: string[]
  /** Quick-access console / admin URLs per channel id (YouTube Studio, ad managers,
   *  the Neon One dashboard, …). A launch link, never a credential. */
  channelLinks?: Record<string, string>
  /** Sanity CMS connection, so the brand's owned content can be ingested. */
  sanity?: { projectId: string; dataset: string; token?: string }
  /** Resend connection (API key), so the brand's email broadcasts can be ingested. */
  resend?: { apiKey: string }
  /** Google Ads API connection, so the brand's live ad copy can be ingested. */
  googleAds?: {
    developerToken: string
    clientId: string
    clientSecret: string
    refreshToken: string
    customerId: string
    loginCustomerId?: string
  }
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
  /** Subject — what the campaign is ABOUT (its theme/focus), e.g. "Spring Launch
   *  — the new protein line." Distinct from strategy (what you want it to do). */
  subject?: string
  strategy: string
  objective?: string
  /** Campaign goal, structured. The message is what the assets communicate (derived from
   *  the cards unless overridden here); the KPI + target are how success is measured. */
  goalMessage?: string
  goalKpi?: string
  goalTarget?: number
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
  // ---- Lifecycle state (drives the brand campaign-states dashboard) ----
  /**
   * Where the campaign sits in its life: planning → in-review → active →
   * completed. Optional: when unset, the dashboard derives the state from the
   * campaign's rows (see domain/lifecycle.ts). An explicit value overrides the
   * derivation — the user sends a campaign to review or marks it complete, and
   * later the approval gate / publish step set it too.
   */
  status?: import('./lifecycle').CampaignStatus
  /** When the campaign was marked completed (ms epoch); set alongside status: 'completed'. */
  completedAt?: number
  /** Soft-delete: when set, the campaign (and its assets) are archived, hidden from
   *  lists but recoverable. Restore clears it. */
  archivedAt?: number
  /** Optional folder this campaign is filed under, within its brand's gallery.
   *  Undefined = unfiled. Folder names are brand-scoped (see campaignFolders). */
  folder?: string
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
