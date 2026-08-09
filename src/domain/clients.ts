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

/**
 * The personal space loose canvases live in until a brand is attached (Figma's "Drafts"). A canvas
 * here isn't tied to any client; the Brand card on the canvas re-homes it to a real brand whenever
 * you're ready.
 *
 * Defined here rather than in the store, where it used to live, because the domain now has to answer
 * "is this campaign brandless" (see campaignInBrandScope) and a domain module cannot reach into the
 * store. The store re-exports it, so every existing importer is unaffected.
 */
export const DRAFTS_SPACE = 'Drafts'

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
  /** Position on the landscape map, 0-100 on each axis (x = horizontal, y = vertical,
   *  higher = further up). Set by dragging the dot on the positioning map. */
  x?: number
  y?: number
}

/** The two axes of the positioning map + where the brand itself sits, so the map can show
 *  the white space (the quadrant no competitor holds). All optional: a brand that hasn't
 *  set it up gets sensible default labels. */
export interface Positioning {
  xLow?: string
  xHigh?: string
  yLow?: string
  yHigh?: string
  /** The brand's own position on the two axes (0-100), its dot on the map. */
  selfX?: number
  selfY?: number
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
  /** The positioning-map axes + the brand's own spot, for the white-space read. */
  positioning?: Positioning
  /** Named clients, partners, or backers. */
  notableClients?: string[]
  /** Stated values / principles. */
  values?: string[]
  /** Traction in their words: a key stat or milestone (e.g. "2M downloads"). */
  traction?: string
  // ---- Brand book (the Brand records page) ----
  /** The market category the brand plays in (e.g. "impact investing"). */
  category?: string
  /** The one-sentence elevator pitch. */
  elevatorPitch?: string
  /** Signature taglines / rallying cries. */
  taglines?: string[]
  /** The approved boilerplate paragraph (the "about us" block). */
  boilerplate?: string
  /** Core value propositions — the promises the brand makes. */
  valueProps?: string[]
  /** Messaging pillars — the few themes every message ladders up to. */
  pillars?: string[]
  /** Headline proof points, in plain language (the reasons to believe). */
  proofPoints?: string[]
  /** Logo asset URL. */
  logo?: string
  /** Brand colors, as hex values. */
  colors?: string[]
  /** Brand typefaces. */
  fonts?: string[]
  /** Imagery / art-direction notes. */
  imageryStyle?: string
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

/** A record from one of the Records pages that a flow references (and generation reads). */
/**
 * `product` and `trigger` joined late. Both are records the campaign refers to in exactly the way a
 * message or a voice is, and both had a card kind, a library and a picker on the canvas while
 * carrying no ref type — so the card drew, wired and contributed nothing.
 *
 * `brand` is still deliberately absent. A brand is not something a campaign REFERENCES alongside a
 * segment and a proof point, it is the campaign's owner, and putting it here would give every
 * exhaustive map below a member that means something different from all the others. It binds through
 * bindCampaignBrand instead.
 */
export type FlowRefType = 'company' | 'person' | 'segment' | 'channel' | 'proof' | 'media-mix' | 'message' | 'concept' | 'voice' | 'season' | 'dataset' | 'product' | 'trigger' | 'pattern'
export interface FlowReference {
  type: FlowRefType
  id: string
  label: string
}

export interface Campaign {
  name: string
  client: string
  /** Umbrella parent: when set, this campaign is a child (one audience + one goal) grouped under the
   *  named parent campaign. A campaign with children serves as the umbrella; children carry the work. */
  parent?: string
  /** Explicitly an umbrella container (a manually-created grouping). Renders as an umbrella even with
   *  no children yet; carries no assets of its own. */
  isUmbrella?: boolean
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
  /** Records this flow references (Companies / People / Segments / Media mix). Read when generating assets. */
  references?: FlowReference[]
  /**
   * The campaign's DIRECTION: the instructions its objects give the copy writer, keyed by the
   * object kind that set them. Lives on the campaign rather than on the object because objects are
   * still session state; this way nothing a marketer types is silently lost on reload.
   */
  direction?: { kind: string; key: string; value: string }[]
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
  /**
   * The AI model this campaign generates with, as an AI_MODELS id. Undefined or 'auto' means the
   * workspace pick, then the server's per-task default. Per campaign because a launch announcement
   * and an always-on blog run do not deserve the same model, and the cost difference between them
   * is the whole reason to choose.
   */
  aiModel?: string

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

/**
 * THE CAMPAIGNS THAT EXIST, by name.
 *
 * Two things make a campaign real, and it needs only one of them: the list has a record of it, or a
 * live asset claims it. The second half is not a fallback — a campaign can exist as nothing but a
 * value on a row (ingested assets arrive that way, before anything registers them), and the
 * Campaigns page shows those, so anything asking "does this campaign exist" has to count them too.
 *
 * Archived on either side does not count. A soft-deleted campaign is hidden from the gallery, and a
 * name carried only by archived rows is a campaign whose every asset was deleted; both are things
 * you cannot open, which is the question this answers.
 *
 * SHARED, because two definitions of "exists" is exactly how a tab outlived its campaign. The
 * Campaigns page derived its list this way while the tab strip read a separately persisted list that
 * nothing reconciled against it, so a tab could name a campaign the page could not show — and the
 * tab, having no folder to report for a campaign the list has never heard of, labelled it Drafts.
 */
export function liveCampaignNames(
  rows: readonly { campaign?: string; archivedAt?: number }[],
  campaigns: readonly { name: string; archivedAt?: number }[],
): Set<string> {
  const names = new Set<string>()
  for (const r of rows) {
    if (r?.archivedAt) continue
    const c = (r?.campaign ?? '').trim()
    if (c) names.add(c)
  }
  for (const c of campaigns) {
    if (c?.archivedAt) continue
    /**
     * `?? ''`, NOT `c.name.trim()`, and the type is not the assurance it looks like.
     *
     * `name` is non-optional on Campaign, so calling .trim() on it typechecks — but this list is
     * hydrated from a workspace, and a stored record is only as well-formed as whatever wrote it.
     * A single legacy or half-written row with no name turned this into a TypeError thrown inside
     * the useMemo that builds the campaigns gallery, which does not fail politely: it takes out the
     * render, and the page a signed-in user was looking at came back with no campaigns on it.
     *
     * The code this replaced never touched the value (`.map((c) => c.name)`), so it was accidentally
     * immune. Anything reading a persisted record has to be deliberately immune instead.
     */
    const n = (c?.name ?? '').trim()
    if (n) names.add(n)
  }
  return names
}

/**
 * The campaign name as somebody typed it. Names are STORED brand-prefixed — "Big Buoy — Competitive
 * Campaign" — so two brands can each own a "Q3 Launch" without colliding on the one key that flights,
 * chats and open tabs all hang off. The prefix is plumbing, so every surface that shows a name to a
 * human strips it back off; showing the stored name next to the brand reads as if the brand were said
 * twice.
 */
export const campaignShortName = (name: string, client?: string): string =>
  client && client !== UNASSIGNED ? name.replace(`${client} — `, '') : name

/**
 * THE INVERSE: the name a campaign is STORED under, given what somebody typed and the brand it
 * belongs to. The one place the prefix rule lives, because it was three template strings — the
 * builder's, the rename field's, and the brand rebind's — and they did not agree. One of them read a
 * brand SCOPE rather than the campaign's own brand, so on a workspace holding a single brand every
 * campaign was named after it whatever it was called and whoever it was for.
 *
 * NO BRAND IS A REAL ANSWER, and it produces no prefix. A campaign starts filed under nobody and
 * picks up its prefix when a Brand card gives it one; the catch-all buckets are not brands, so
 * neither Unassigned nor Drafts ever becomes one — the same rule campaignShortName reads back.
 *
 * Idempotent on a name that already carries the prefix, so re-binding the brand a campaign is
 * already named for cannot stack a second copy of it on the front.
 */
export const campaignStoredName = (short: string, brand?: string): string => {
  const typed = short.trim() || 'New campaign'
  const b = (brand ?? '').trim()
  if (!b || b === UNASSIGNED || b === DRAFTS_SPACE) return typed
  return `${b} — ${campaignShortName(typed, b)}`
}
