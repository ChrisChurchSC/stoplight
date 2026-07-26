import { create } from 'zustand'
import { MockSheetAdapter } from '../adapters/sheet/mockSheetAdapter'
import { SupabaseSheetAdapter } from '../adapters/sheet/supabaseSheetAdapter'
import { SupabaseRecordAdapter } from '../adapters/records/supabaseRecordAdapter'
import { persistState, hydrateState } from '../adapters/state/workspaceState'
import { RECORD_GROUPING_KEY } from '../domain/recordGrouping'
import { isSupabaseConfigured } from '../lib/supabase'
import type { SheetAdapter } from '../adapters/sheet/types'
import { publishers as channelPublishers } from '../adapters/publishers/registry'
import type { PublisherRegistry } from '../adapters/publishers/types'
import type { Asset, ChannelId, MediaType, RowStatus, TrafficRow } from '../domain/types'
import { proposeSchedule } from '../scheduling/propose'
import { classifyAssets } from '../lib/classifyAsset'
import { registerCampaign, clientForCampaign, type Campaign, type ClientProfile, type FlowReference } from '../domain/clients'
import { newFlight, flightForRow, type Flight } from '../domain/flight'
import { reachByChannelFromActuals, type BrandActuals } from '../domain/actuals'
import { setBrandCalibration } from '../domain/journeyPerf'
import { actualsProvider } from '../adapters/actuals'
import { getActiveWorkspaceId } from '../lib/session'
import { contentProvider } from '../adapters/content'
import { deriveCampaignStatus, type CampaignStatus } from '../domain/lifecycle'
import { classifyRowAudience, newAudience, normalizeAudience, freshAudienceId, type AudienceType, mergeAudiences } from '../domain/audiences'
import { emptyLibrary, type MessagingLibrary, type LibraryKind, type LibraryCta, type LibrarySubject, type LibraryHook } from '../domain/library'
import type { GtmStrategy } from '../domain/strategies'
import type { Deliverable } from '../domain/strategyAssets'
import { CHANNELS, resolveChannelId } from '../domain/channels'
import { driveFilesToAssets } from '../lib/driveImport'
import { filesToAssets } from '../lib/files'
import {
  pickFromGoogleDrive,
  pickFolderFromGoogleDrive,
  connectGoogleDrive,
  listFolderByUrl,
  isGoogleDriveConfigured,
  mockDriveSource,
} from '../adapters/drive'
import { sampleRows } from '../domain/sampleData'
import { typesFor, isValidType, primaryTypeKey } from '../domain/channelAssetTypes'
import { extractInCreativeCopy } from '../adapters/copy/extract'
import { realExtractTransport } from '../adapters/copy/extractTransport'
import {
  ingestChannelStream,
  IngestError,
  type ChannelIngestResult,
  type IngestProgress,
  type IngestedMessage,
} from '../adapters/setup/ingestChannel'
import { ingestSanityStream, type SanityIngestResult } from '../adapters/setup/ingestSanity'
import { ingestResendStream, type ResendIngestResult } from '../adapters/setup/ingestResend'
import { ingestGoogleAdsStream, type GoogleAdsIngestResult } from '../adapters/setup/ingestGoogleAds'
import { ingestNeonStream } from '../adapters/setup/ingestNeon'
import {
  ClaudeCopyWriter,
  HeuristicCopyWriter,
  type AssetDraft,
  type CopySource,
  type CopyWriter,
  type DraftAsset,
  type DraftRequest,
  type DraftResult,
} from '../adapters/copy/draftWriter'
import {
  ClaudeSetupGenerator,
  HeuristicSetupGenerator,
  type SetupGenerator,
  type SetupInput,
  type WorkspaceSetup,
} from '../adapters/setup/setupGenerator'
import { mapSite, type SiteMap } from '../adapters/setup/siteMap'
import { GTM_STRATEGIES, mediaSharePct } from '../domain/strategies'
import { STRATEGY_ASSETS } from '../domain/strategyAssets'
import { messagingFields, messagingAllText, messagingMap, clampToLimit } from '../domain/messaging'
import { composeMessaging } from '../domain/matrixDraft'
import { ctaFor } from '../domain/matrix'
import { funnelStageFor, FUNNEL_STAGES } from '../domain/funnel'
import { dimensionField, dimensionValues, isPruned, planFanout, type FanoutPlan } from '../domain/fanout'
import { FANOUT_HARD_CEILING, capForChannels, fanoutVerdict, recommendedDimension } from '../domain/fanoutPolicy'
import { proposeConditions as proposeConditionsDomain, resolveConditions, type FanCondition } from '../domain/conditions'
import {
  type BrandMeta,
  type BrandMetaMap,
  type BrandBaseline,
  resolveBrandScope,
  resolveBrandVoice,
  brandBaseline,
  ancestorsOf,
  isBrandless,
  isDraftBrand,
} from '../domain/brand'
import {
  type Account,
  type AccountStatus,
  type TargetList,
  accountContext,
  newAccount,
  newTargetList,
} from '../domain/accounts'
import {
  type AssetSource,
  CONTENT_LIBRARY_CAMPAIGN,
  normalizeImportItem,
  engagementFromMetrics,
  looksLikeBlockedPage,
} from '../domain/importAssets'
import { type SavedView, newSavedView } from '../domain/savedViews'
import type { BrandReport } from '../domain/reports'
import type { MediaMix } from '../domain/channelMix'
import { type Company, freshCompanyId, seedCompanies } from '../domain/companies'
import { type ChannelRecord, freshChannelRecordId, seedChannelRecords } from '../domain/channelRecords'
import { type OnboardingState, type OnboardingStepId, DEFAULT_ONBOARDING } from '../domain/onboarding'
import type { SavedFlowChat } from '../domain/flowAgent'
import type { SavedHomeChat } from '../domain/homeChat'
import { BLUEPRINT_META_KEYS } from '../domain/emailPatterns'
import { type Person, freshPersonId, seedPeople } from '../domain/people'
import { type Segment, freshSegmentId, seedSegments } from '../domain/segments'
import { type Message, freshMessageId } from '../domain/message'
import { type Voice, freshVoiceId } from '../domain/voice'
import { type Pattern, freshPatternId } from '../domain/pattern'
import { type Trigger, freshTriggerId } from '../domain/trigger'
import { snapshotsFromActuals, snapshotsFromAssets } from '../domain/metricSnapshot'
import { appendSnapshots } from '../adapters/metrics/metricSnapshots'
import { buildOutcomeMap } from '../domain/outcomeMap'
import { buildContributions } from '../domain/aggregateOutcome'
import { contribute, contributorId } from '../adapters/aggregate/aggregateOutcomes'
import { ingestSite } from '../adapters/ask/ingestSite'
import { DEFAULT_AI_MODEL } from '../domain/aiModels'
import { DEFAULT_USER_PREFS, type UserPrefs } from '../domain/userPrefs'
import { ROLE_PRESETS } from '../domain/roles'
import { type Objective, freshObjectiveId } from '../domain/objective'
import {
  type LibraryFolder,
  type LibraryFolderItem,
  type LibraryFolderItemInput,
  channelFromUrl,
  freshFolderId,
  freshFolderItemId,
  titleFromUrl,
} from '../domain/libraryFolders'
import { type BrandRecord, freshBrandRecordId, seedBrandRecords } from '../domain/brandRecord'
import { type SmartObject, freshSmartObjectId, kindForRefs } from '../domain/smartObject'
import { type BrandDataset, blankDataset } from '../domain/brandDataset'
import type { PinnedInsight } from '../domain/pinnedInsights'
import { rowCopyKey, isPlannedCard } from '../domain/contentSignals'
import { isLinkedExternal } from '../domain/assetKind'
import { assetRtbIds, registerCampaignRtbs, rtbsForCampaign, rtbsFromAudiences, setAudienceRtbResolver, type Rtb } from '../domain/rtb'
import { rowInScope, type CardFilter } from '../lib/scope'
import { MockIcpSource, MockIcpReviewer, flagResolved } from '../adapters/icp/mockIcp'
import { type CoherenceDecision, freshDecisionId } from '../domain/coherence'
import { type BrandGuide, draftBrandGuide } from '../domain/readiness'
import type { TimeRange } from '../domain/timeRange'
import {
  AUDIT_LABEL,
  type AuditAction,
  type AuditEntry,
  type BreakAxis,
  type BreakSeverity,
  type BreakStatus,
  type ClaudeCoherenceFlag,
  type CoherenceBreak,
  applyBreakStatus,
  breakScopeKey,
  coherenceContentHash,
  detectBreaks,
  freshAuditId,
  resolveBreaks,
} from '../domain/breaks'
import { claudeCoherence } from '../adapters/coherence/claudeCoherence'
import { buildDirection } from '../domain/direction'
import { buildCoherenceVocab } from '../domain/coherenceChecks'
import { claudeAgent, type AgentAction } from '../adapters/agent/claudeAgent'
import { ClaudeIcpReviewer } from '../adapters/icp/claudeReviewer'
import type { BatchReview, Icp, IcpReviewer, IcpSource } from '../adapters/icp/types'
import { buildUtm, isTrackingClean } from '../domain/tracking'
import { hasBudget, isPaidRow, mockSpend } from '../domain/budget'
import { mockAttio } from '../adapters/attio/mockAttio'
import { enrichCommenter, type Comment } from '../adapters/comments/mockComments'
import { ingestCommentsViaClaude } from '../adapters/comments/claudeCommentSource'
import { messageStore } from '../adapters/messages/messageStore'
import { can, type Role } from '../domain/access'
import { decodeShareToken, type ShareGrant } from '../lib/shareLink'
import { publishShareSnapshot } from '../lib/shareSnapshot'
import { snapshotRows, diffChanged, diffSummary, type CampaignVersion } from '../domain/versions'

// An anonymous share viewer (main.tsx seeded localStorage from the published snapshot and set a
// flag) has no backend session — its data IS the seeded snapshot. So for a share view we run the
// DATA layer in localStorage mode even when Supabase is configured; auth stays bypassed via the
// share token. A signed-in user opening a share link keeps their live backend (no flag set).
const shareViewMode = ((): boolean => {
  try {
    const hasToken = !!new URLSearchParams(window.location.search).get('share')
    return hasToken && sessionStorage.getItem('stoplight.shareView') === '1'
  } catch {
    return false
  }
})()
const localDataMode = !isSupabaseConfigured || shareViewMode

// Wire the swappable seams here. The sheet is backed by Supabase when a project
// is configured (VITE_SUPABASE_*), and by localStorage otherwise — so the backend
// is additive and the app runs unchanged until you provision one.
const sheet: SheetAdapter = localDataMode ? new MockSheetAdapter() : new SupabaseSheetAdapter()
const publishers: PublisherRegistry = channelPublishers
const icpSource: IcpSource = new MockIcpSource()
// Real Claude batch review when a backend + key are present; heuristic otherwise.
const icpReviewer: IcpReviewer = new ClaudeIcpReviewer(new MockIcpReviewer())
// Real Claude starter-copy drafting when a backend + key are present; heuristic otherwise.
const copyWriter: CopyWriter = new ClaudeCopyWriter(new HeuristicCopyWriter())

/**
 * Regenerate any drafted unit whose headline or primary text collides with another
 * in the same campaign, so a generated set reads as distinct assets, not a template
 * pasted across audiences. CTAs are EXCLUDED: they're verbatim brand CTAs and recur
 * by design (matched to stage), so a repeated CTA is correct, not a collision.
 * Bounded to a few rounds; each feeds the used strings back as an avoid list.
 */
async function dedupeCampaignDrafts(
  result: DraftResult,
  assets: DraftAsset[],
  baseReq: Omit<DraftRequest, 'assets' | 'avoid'>,
): Promise<void> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const byId = new Map(assets.map((a) => [a.rowId, a]))
  const rolesOf = (a: DraftAsset) => {
    const f = a.fields
    return {
      headlineKey: f.find((x) => /headline|subject|title|subhead|^h\d/i.test(x.key))?.key,
      primaryKey: (f.find((x) => /primary|body|caption|intro|post|message/i.test(x.key)) ?? f[0])?.key,
    }
  }
  const valOf = (d: AssetDraft, key?: string) => (key ? (d.components.find((c) => c.key === key)?.value ?? '') : '')
  for (let round = 0; round < 3; round++) {
    const seenH = new Set<string>()
    const seenB = new Set<string>()
    const collisions: AssetDraft[] = []
    for (const d of result.drafts) {
      const a = byId.get(d.rowId)
      if (!a) continue
      const { headlineKey, primaryKey } = rolesOf(a)
      const h = norm(valOf(d, headlineKey))
      const b = norm(valOf(d, primaryKey))
      if ((h && seenH.has(h)) || (b && seenB.has(b))) collisions.push(d)
      else {
        if (h) seenH.add(h)
        if (b) seenB.add(b)
      }
    }
    if (collisions.length === 0) return
    const avoid = { headlines: [...seenH], bodies: [...seenB], ctas: [] }
    for (const d of collisions) {
      const a = byId.get(d.rowId)
      if (!a) continue
      const bumped: DraftAsset = { ...a, index: (a.index ?? 0) + (round + 1) * 101 }
      try {
        const re = await copyWriter.draft({ ...baseReq, avoid, assets: [bumped] })
        if (re.drafts[0]) d.components = re.drafts[0].components
      } catch {
        // Leave the unit as-is if regeneration fails; better than dropping copy.
      }
    }
  }
}
// Real Claude workspace setup (reads the site) when a backend + key are present; heuristic otherwise.
const setupGenerator: SetupGenerator = new ClaudeSetupGenerator(new HeuristicSetupGenerator())

function freshRowId(): string {
  return `row_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
}

/** The personal space loose canvases live in until a brand is attached (Figma's
 *  "Drafts"). A canvas here isn't tied to any client; the Brand card on the canvas
 *  re-homes it to a real brand whenever you're ready. */
export const DRAFTS_SPACE = 'Drafts'

// Map an extracted message's {headline, body, cta} onto a channel's real
// messaging field keys, so the current-state copy renders on the canvas.
function buildMessaging(
  channel: ChannelId,
  m: { headline: string; body?: string; cta?: string },
): Record<string, string> {
  const keys = messagingFields(channel).map((f) => f.key)
  const out: Record<string, string> = {}
  const put = (val: string | undefined, prefer: string[]) => {
    if (!val?.trim()) return
    const key = prefer.find((k) => keys.includes(k) && !(k in out)) ?? keys.find((k) => !(k in out))
    if (key) out[key] = val.trim()
  }
  put(m.headline, ['headline', 'title', 'primary', 'intro', 'post', 'caption', 'message', 'subject'])
  put(m.body, ['body', 'description', 'primary', 'caption', 'meta-description', 'd1'])
  put(m.cta, ['cta', 'link'])
  return out
}

/** The live-messaging rows for a current-state map (shared by provision + refresh). */
function currentStateRows(campaign: string, map: SiteMap): TrafficRow[] {
  return map.messages.map((m) => {
    const channel: ChannelId = m.channel in CHANNELS ? (m.channel as ChannelId) : 'website'
    return {
      id: freshRowId(),
      assetId: '',
      assetName: m.label || m.headline.slice(0, 48) || 'Message',
      mediaType: 'text' as const,
      channel,
      messaging: buildMessaging(channel, m),
      campaign,
      audience: m.audience || '',
      status: 'posted' as const,
      scheduledAt: new Date().toISOString(),
      createdAt: Date.now(),
    }
  })
}

/** Register + persist a current-state map's proof points for the campaign. */
function currentStateProof(campaign: string, map: SiteMap): void {
  const rtbs: Rtb[] = map.proofPoints.map((p, i) => ({ id: `rtb-live-${i}`, label: p.label, detail: p.detail }))
  if (!rtbs.length) return
  registerCampaignRtbs(campaign, rtbs)
  const persisted = loadCampaignRtbs()
  persisted[campaign] = rtbs
  saveCampaignRtbs(persisted)
}

// Infer which channel a social profile URL belongs to, so a channel in the
// Foundation panel can resolve to the account to link + read.
export function channelIdOfUrl(url: string): ChannelId | null {
  const u = url.toLowerCase()
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('linkedin.com')) return 'linkedin'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x'
  if (u.includes('facebook.com')) return 'facebook'
  if (u.includes('pinterest.com')) return 'pinterest'
  return null
}

/** The linked profile URL for a channel, from the client's connected accounts. */
export function profileUrlForChannel(channel: ChannelId, channels?: string[]): string | undefined {
  return (channels ?? []).find((u) => channelIdOfUrl(u) === channel)
}

/** Rows for a per-channel ingest. Posts that carry copy in the art become image
 *  rows with extractedCopy set; caption-only posts stay text rows. */
function ingestRows(campaign: string, channel: ChannelId, messages: IngestedMessage[]): TrafficRow[] {
  return messages.map((m) => {
    const art = m.extractedCopy?.trim()
    return {
      id: freshRowId(),
      assetId: '',
      assetName: m.label || m.headline.slice(0, 48) || 'Post',
      mediaType: art ? ('image' as const) : ('text' as const),
      channel,
      messaging: buildMessaging(channel, m),
      extractedCopy: art || undefined,
      copyReviewed: false,
      campaign,
      audience: m.audience || '',
      status: 'posted' as const,
      scheduledAt: new Date().toISOString(),
      createdAt: Date.now(),
    }
  })
}

// Owned web surfaces a Sanity document can map to; anything else falls to website.
const OWNED_CHANNELS: ChannelId[] = ['website', 'blog', 'landing-page', 'lead-magnet', 'email']

/** Rows for a Sanity ingest. Tagged assetId 'sanity' so a re-ingest replaces just
 *  the CMS-sourced rows (not the scraped website rows on the same channel). */
function sanityRows(campaign: string, messages: SanityIngestResult['messages']): TrafficRow[] {
  return messages.map((m) => {
    const channel: ChannelId =
      m.channel && OWNED_CHANNELS.includes(m.channel as ChannelId) ? (m.channel as ChannelId) : 'website'
    return {
      id: freshRowId(),
      assetId: 'sanity',
      assetName: m.label || m.headline.slice(0, 48) || 'Content',
      mediaType: 'text' as const,
      channel,
      messaging: buildMessaging(channel, m),
      copyReviewed: false,
      campaign,
      audience: m.audience || '',
      status: 'posted' as const,
      scheduledAt: new Date().toISOString(),
      createdAt: Date.now(),
    }
  })
}

/** Rows for a Resend ingest. Mapped to the email channel, tagged assetId 'resend'
 *  so a re-ingest replaces just the email-sourced rows. */
function resendRows(campaign: string, messages: ResendIngestResult['messages']): TrafficRow[] {
  return messages.map((m) => ({
    id: freshRowId(),
    assetId: 'resend',
    assetName: m.label || m.headline.slice(0, 48) || 'Email',
    mediaType: 'text' as const,
    channel: 'email' as ChannelId,
    messaging: buildMessaging('email', m),
    copyReviewed: false,
    campaign,
    audience: m.audience || '',
    status: 'posted' as const,
    scheduledAt: new Date().toISOString(),
    createdAt: Date.now(),
  }))
}

// Paid Google surfaces a Google Ads message can map to.
const PAID_GOOGLE: ChannelId[] = ['google-search', 'google-demand', 'pmax']

/** Rows for a Google Ads ingest. Mapped to the paid Google channel the ad runs
 *  on, tagged assetId 'google-ads' so a re-ingest replaces just the ad rows. */
function googleAdsRows(campaign: string, messages: GoogleAdsIngestResult['messages']): TrafficRow[] {
  return messages.map((m) => {
    const channel: ChannelId =
      m.channel && PAID_GOOGLE.includes(m.channel as ChannelId) ? (m.channel as ChannelId) : 'google-search'
    return {
      id: freshRowId(),
      assetId: 'google-ads',
      assetName: m.label || m.headline.slice(0, 48) || 'Ad',
      mediaType: 'text' as const,
      channel,
      messaging: buildMessaging(channel, m),
      copyReviewed: false,
      campaign,
      audience: m.audience || '',
      status: 'posted' as const,
      scheduledAt: new Date().toISOString(),
      createdAt: Date.now(),
    }
  })
}

/** The company-overview fields extracted from a site map, as a profile patch.
 *  Only present fields are included, so a refresh never wipes an existing value. */
function brandOverview(b: SiteMap['brand']): Partial<ClientProfile> {
  const out: Partial<ClientProfile> = {}
  const str = (v?: string) => (v?.trim() ? v.trim() : undefined)
  const arr = <T,>(a?: T[]) => (a && a.length ? a : undefined)
  const o = str(b.oneLiner); if (o) out.oneLiner = o
  const m = str(b.mission); if (m) out.mission = m
  const f = str(b.founded); if (f) out.founded = f
  const h = str(b.headquarters); if (h) out.headquarters = h
  const t = arr(b.team); if (t) out.team = t
  const p = arr(b.products); if (p) out.products = p
  const d = arr(b.differentiators); if (d) out.differentiators = d
  const nc = arr(b.notableClients); if (nc) out.notableClients = nc
  const v = arr(b.values); if (v) out.values = v
  const tr = str(b.traction); if (tr) out.traction = tr
  return out
}

/** Merge a channel's proof points into the campaign's proof library (by label),
 *  so ingesting one channel doesn't wipe proof gathered from another. */
function mergeChannelProof(campaign: string, proof: { label: string; detail: string }[]): void {
  if (!proof.length) return
  const persisted = loadCampaignRtbs()
  const existing = persisted[campaign] ?? []
  const seen = new Set(existing.map((r) => r.label.toLowerCase()))
  const additions: Rtb[] = []
  proof.forEach((p, i) => {
    const key = p.label.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    additions.push({ id: `rtb-live-${campaign}-${Date.now().toString(36)}-${i}`, label: p.label, detail: p.detail })
  })
  if (!additions.length) return
  const next = [...existing, ...additions]
  registerCampaignRtbs(campaign, next)
  persisted[campaign] = next
  saveCampaignRtbs(persisted)
}

// Per-client Google Drive folder links, persisted (clients are derived from
// rows, so the link can't live on a client record).
const DRIVE_LINKS_KEY = 'stoplight.driveLinks.v1'
function loadDriveLinks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DRIVE_LINKS_KEY) || '{}')
  } catch {
    return {}
  }
}
function saveDriveLinks(links: Record<string, string>): void {
  try {
    localStorage.setItem(DRIVE_LINKS_KEY, JSON.stringify(links))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// Explicitly-added clients, persisted. Clients are otherwise derived from rows
// (campaign → client), so a brand-new client with no assets needs its own list.
const CLIENTS_KEY = 'stoplight.clients.v1'
function loadClients(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLIENTS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveClients(list: string[]): void {
  try {
    persistState(CLIENTS_KEY, list)
  } catch {
    /* ignore */
  }
}

// Client identity captured in the intake wizard (website, industry, voice),
// persisted by client name. Feeds the copy drafter so copy matches the brand.
const CLIENT_PROFILES_KEY = 'stoplight.clientProfiles.v1'
function loadClientProfiles(): Record<string, ClientProfile> {
  try {
    const v = JSON.parse(localStorage.getItem(CLIENT_PROFILES_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveClientProfiles(map: Record<string, ClientProfile>): void {
  try {
    persistState(CLIENT_PROFILES_KEY, map)
  } catch {
    /* ignore */
  }
}

// Measured actuals per brand, pulled from a connected analytics source (read-only).
const BRAND_ACTUALS_KEY = 'stoplight.brandActuals.v1'
function loadBrandActuals(): Record<string, BrandActuals> {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_ACTUALS_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveBrandActuals(map: Record<string, BrandActuals>): void {
  try {
    localStorage.setItem(BRAND_ACTUALS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

// Snapshot the metrics time-series at most once per brand per UTC day, so repeated pulls of the
// same actuals don't flood metric_snapshots. Returns true (and marks today done) the first time.
const SNAP_DAY_KEY = 'stoplight.metricsSnapDay.v1'
function snapshotOncePerDay(brand: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const map = JSON.parse(localStorage.getItem(SNAP_DAY_KEY) || '{}') as Record<string, string>
    if (map[brand] === today) return false
    map[brand] = today
    localStorage.setItem(SNAP_DAY_KEY, JSON.stringify(map))
    return true
  } catch {
    return true
  }
}

// Saved Claude-generated reports over a brand's library (narrative + recommendations),
// persisted as an array. Newest-first is applied at read time in the view.
const REPORTS_KEY = 'stoplight.reports.v1'
function loadReports(): BrandReport[] {
  try {
    const v = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveReports(list: BrandReport[]): void {
  try {
    persistState(REPORTS_KEY, list)
  } catch {
    /* ignore */
  }
}

// Records › Companies — a lightweight CRM table, persisted as a plain array. Seeds with
// the agency's known clients on first ever load (only when the key is unset, so deleting
// every row doesn't resurrect them).
const COMPANIES_KEY = 'stoplight.companies.v1'
function loadCompanies(): Company[] {
  try {
    const raw = localStorage.getItem(COMPANIES_KEY)
    if (raw == null) {
      const seeded = seedCompanies([])
      localStorage.setItem(COMPANIES_KEY, JSON.stringify(seeded))
      return seeded
    }
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveCompanies(list: Company[]): void {
  try {
    saveRecordList(COMPANIES_KEY, list)
  } catch {
    /* ignore */
  }
}

// Per-brand SMART OBJECTS: named, reusable bundles of records ("the RevOps buyer"). Brand-level
// rather than per-campaign, because being reusable across campaigns is the whole point.
const SMART_OBJECTS_KEY = 'stoplight.smartObjects.v1'
function loadSmartObjects(): SmartObject[] {
  try {
    const v = JSON.parse(localStorage.getItem(SMART_OBJECTS_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveSmartObjects(list: SmartObject[]): void {
  try {
    localStorage.setItem(SMART_OBJECTS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

// Per-brand freeform data sets (blank spreadsheets) — the flexible half of the brand model.
const BRAND_DATASETS_KEY = 'stoplight.brandDatasets.v1'
function loadBrandDatasets(): BrandDataset[] {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_DATASETS_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveBrandDatasets(list: BrandDataset[]): void {
  try {
    localStorage.setItem(BRAND_DATASETS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

// Records › Channels — the channel taxonomy as records, seeded once from CHANNEL_LIST.
const CHANNEL_RECORDS_KEY = 'stoplight.channelRecords.v1'
function loadChannelRecords(): ChannelRecord[] {
  try {
    const raw = localStorage.getItem(CHANNEL_RECORDS_KEY)
    if (raw == null) {
      const seeded = seedChannelRecords()
      localStorage.setItem(CHANNEL_RECORDS_KEY, JSON.stringify(seeded))
      return seeded
    }
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveChannelRecords(list: ChannelRecord[]): void {
  try {
    saveRecordList(CHANNEL_RECORDS_KEY, list)
  } catch {
    /* ignore */
  }
}

const ONBOARDING_KEY = 'stoplight.onboarding.v1'
function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    if (raw == null) return { ...DEFAULT_ONBOARDING }
    const v = JSON.parse(raw)
    return {
      collapsed: !!v.collapsed,
      dismissed: !!v.dismissed,
      done: Array.isArray(v.done) ? (v.done as OnboardingStepId[]) : [],
    }
  } catch {
    return { ...DEFAULT_ONBOARDING }
  }
}
function saveOnboarding(state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

// Flow-canvas chat history — past conversations per flow.
const FLOW_CHATS_KEY = 'stoplight.flowChats.v1'
function loadFlowChats(): SavedFlowChat[] {
  try {
    const v = JSON.parse(localStorage.getItem(FLOW_CHATS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveFlowChats(list: SavedFlowChat[]): void {
  try {
    persistState(FLOW_CHATS_KEY, list)
  } catch {
    /* ignore */
  }
}

// Home chat history — past conversations from the Home ask box, one global list.
const HOME_CHATS_KEY = 'stoplight.homeChats.v1'
function loadHomeChats(): SavedHomeChat[] {
  try {
    const v = JSON.parse(localStorage.getItem(HOME_CHATS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveHomeChats(list: SavedHomeChat[]): void {
  try {
    persistState(HOME_CHATS_KEY, list)
  } catch {
    /* ignore */
  }
}

// Records › People — the contacts table, same seed-once persistence as Companies.
const PEOPLE_KEY = 'stoplight.people.v1'
function loadPeople(): Person[] {
  try {
    const raw = localStorage.getItem(PEOPLE_KEY)
    if (raw == null) {
      const seeded = seedPeople()
      localStorage.setItem(PEOPLE_KEY, JSON.stringify(seeded))
      return seeded
    }
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function savePeople(list: Person[]): void {
  try {
    saveRecordList(PEOPLE_KEY, list)
  } catch {
    /* ignore */
  }
}
// Generic localStorage-backed record list (no seed): the new workbook sheets — Messages,
// Objectives, Campaigns — all persist the same way.
function loadRecordList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
// Each record-list localStorage key → its Supabase table. saveRecordList() writes localStorage
// always (cache/offline) and, when a backend is configured, mirrors the list to the workspace's
// table. Hydration (hydrateRecords) pulls the same tables back on sign-in. String literals, not the
// KEY consts, so this can sit above their declarations.
const RECORD_TABLES: Record<string, string> = {
  'stoplight.companies.v1': 'companies',
  'stoplight.people.v1': 'people',
  'stoplight.channelRecords.v1': 'channels',
  'stoplight.segments.v1': 'segments',
  'stoplight.objectives.v1': 'objectives',
  'stoplight.messages.v1': 'message_records',
  'stoplight.voices.v1': 'voice_records',
  'stoplight.patterns.v1': 'patterns',
  'stoplight.triggers.v1': 'triggers',
  'stoplight.brandRecords.v1': 'brands',
  'stoplight.libraryFolders.v1': 'library_folders',
}
const recordAdapterCache: Record<string, SupabaseRecordAdapter<{ id: string; name?: string }>> = {}
function saveRecordList<T extends { id: string }>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* ignore */
  }
  const table = RECORD_TABLES[key]
  if (table && isSupabaseConfigured) {
    const adapter = (recordAdapterCache[table] ??= new SupabaseRecordAdapter(table))
    void adapter.replaceAll(list as unknown as { id: string; name?: string }[])
  }
}
const MESSAGES_KEY = 'stoplight.messages.v1'
const VOICES_KEY = 'stoplight.voices.v1'
const PATTERNS_KEY = 'stoplight.patterns.v1'
const TRIGGERS_KEY = 'stoplight.triggers.v1'
const OBJECTIVES_KEY = 'stoplight.objectives.v1'
const LIBRARY_FOLDERS_KEY = 'stoplight.libraryFolders.v1'
const TASKS_KEY = 'stoplight.tasks.v1'
const BRAND_RECORDS_KEY = 'stoplight.brandRecords.v1'

// The Brands sheet is seeded once from the real workspace brands (clients + campaign brands) so it
// opens populated; after that it's an independent, editable record list like the other sheets.
function loadOrSeedBrandRecords(): BrandRecord[] {
  if (localStorage.getItem(BRAND_RECORDS_KEY) != null) return loadRecordList<BrandRecord>(BRAND_RECORDS_KEY)
  const names = new Set<string>()
  for (const c of loadClients()) if (c && c !== DRAFTS_SPACE) names.add(c)
  for (const c of loadCampaigns()) if (c.client && c.client !== DRAFTS_SPACE) names.add(c.client)
  const profiles = loadClientProfiles()
  const seeded = seedBrandRecords([...names].sort((a, b) => a.localeCompare(b)), profiles)
  saveRecordList(BRAND_RECORDS_KEY, seeded)
  return seeded
}
const SEGMENTS_KEY = 'stoplight.segments.v1'
function loadSegments(): Segment[] {
  try {
    const raw = localStorage.getItem(SEGMENTS_KEY)
    if (raw == null) {
      const seeded = seedSegments()
      localStorage.setItem(SEGMENTS_KEY, JSON.stringify(seeded))
      return seeded
    }
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveSegments(list: Segment[]): void {
  try {
    saveRecordList(SEGMENTS_KEY, list)
  } catch {
    /* ignore */
  }
}

// Saved media mixes (channel-split scenarios), persisted per brand.
const MEDIA_MIXES_KEY = 'stoplight.mediaMixes.v1'
function loadMediaMixes(): MediaMix[] {
  try {
    const v = JSON.parse(localStorage.getItem(MEDIA_MIXES_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveMediaMixes(list: MediaMix[]): void {
  try {
    persistState(MEDIA_MIXES_KEY, list)
  } catch {
    /* ignore */
  }
}

// Insights pinned out of a report and kept in view on the Overview. Persisted like reports.
const PINNED_KEY = 'stoplight.pinnedInsights.v1'
function loadPinned(): PinnedInsight[] {
  try {
    const v = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function savePinned(list: PinnedInsight[]): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

// Register measured-actuals calibration on load so projected reach uses each brand's
// real per-asset averages (see journeyPerf.setBrandCalibration).
for (const [brand, data] of Object.entries(loadBrandActuals())) {
  setBrandCalibration(brand, reachByChannelFromActuals(data))
}

// Audience types per client (personas under the ICP), persisted by client name.
const CLIENT_AUDIENCES_KEY = 'stoplight.clientAudiences.v1'
function loadClientAudiences(): Record<string, AudienceType[]> {
  try {
    const v = JSON.parse(localStorage.getItem(CLIENT_AUDIENCES_KEY) || '{}')
    if (!v || typeof v !== 'object') return {}
    // Backfill the new container fields (rtbs / descriptors) on audiences saved
    // before they existed, so every audience is a complete first-class object.
    const out: Record<string, AudienceType[]> = {}
    for (const [client, list] of Object.entries(v)) {
      out[client] = Array.isArray(list) ? list.map((a) => normalizeAudience(a as AudienceType)) : []
    }
    return out
  } catch {
    return {}
  }
}
function saveClientAudiences(map: Record<string, AudienceType[]>): void {
  try {
    persistState(CLIENT_AUDIENCES_KEY, map)
  } catch {
    /* ignore */
  }
}

/**
 * Merge a brand's system-library audiences with its clientAudiences store, deduped by name.
 * clientAudiences wins on a collision (it is the actively-maintained source the audience selector and
 * canvas lanes write to, and where the data-driven flow puts new personas); brandSystems-only
 * (inherited) personas are kept. This is why generation always sees the full persona — role, angle,
 * pains — regardless of which store holds it, so a "Personalized to" pick actually personalizes.
 */


// Messaging systems — ONE per brand. Each brand owns a self-contained library
// (audiences, proof, subjects, hooks, CTAs + the universal GTM strategies). Keyed
// by brand name; created lazily (emptyLibrary) the first time a brand's system is
// read or edited. The canvas reads the campaign's brand's system; the Messaging
// page views one brand at a time.
const BRAND_SYSTEMS_KEY = 'stoplight.brandSystems.v1'
function normalizeLibrary(v: Partial<MessagingLibrary> | undefined): MessagingLibrary {
  const seed = emptyLibrary()
  if (!v || typeof v !== 'object') return seed
  return {
    ctas: Array.isArray(v.ctas) ? v.ctas : [],
    rtbs: Array.isArray(v.rtbs) ? v.rtbs : [],
    audiences: Array.isArray(v.audiences) ? v.audiences.map((a) => normalizeAudience(a as AudienceType)) : [],
    strategies: Array.isArray(v.strategies) ? v.strategies : seed.strategies,
    subjects: Array.isArray(v.subjects) ? v.subjects : [],
    hooks: Array.isArray(v.hooks) ? v.hooks : [],
  }
}
function loadBrandSystems(): Record<string, MessagingLibrary> {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_SYSTEMS_KEY) || 'null')
    if (v && typeof v === 'object') {
      const out: Record<string, MessagingLibrary> = {}
      for (const [brand, lib] of Object.entries(v)) out[brand] = normalizeLibrary(lib as MessagingLibrary)
      return out
    }
  } catch {
    /* ignore */
  }
  return {}
}
function saveBrandSystems(map: Record<string, MessagingLibrary>): void {
  try {
    persistState(BRAND_SYSTEMS_KEY, map)
  } catch {
    /* ignore */
  }
}

const CONDITIONS_KEY = 'stoplight.conditions.v1'
function loadConditions(): Record<string, FanCondition[]> {
  try {
    const raw = localStorage.getItem(CONDITIONS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, FanCondition[]>) : {}
  } catch {
    return {}
  }
}
function saveConditions(map: Record<string, FanCondition[]>): void {
  try {
    localStorage.setItem(CONDITIONS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
// Brand tree + explicit sharing + draft flag, keyed by the same brand (client) name
// used by brandSystems / clientProfiles. The hard boundary every canvas resolves through.
const BRAND_META_KEY = 'stoplight.brandMeta.v1'
function loadBrandMeta(): BrandMetaMap {
  try {
    const raw = localStorage.getItem(BRAND_META_KEY)
    return raw ? (JSON.parse(raw) as BrandMetaMap) : {}
  } catch {
    return {}
  }
}
function saveBrandMeta(map: BrandMetaMap): void {
  try {
    persistState(BRAND_META_KEY, map)
  } catch {
    /* ignore */
  }
}
// ABM target accounts: accounts per brand, named target lists, and the list a campaign
// targets. The data foundation for account-based programs.
const ACCOUNTS_KEY = 'stoplight.accounts.v1'
const TARGET_LISTS_KEY = 'stoplight.targetLists.v1'
const CAMPAIGN_TARGET_KEY = 'stoplight.campaignTarget.v1'
// Saved Views (smart canvases): named, re-resolving filters over a brand's assets.
const SAVED_VIEWS_KEY = 'stoplight.savedViews.v1'
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
/** A brand's system, defaulting to a fresh empty one (read-only — never mutates). */
function libFor(map: Record<string, MessagingLibrary>, brand: string): MessagingLibrary {
  return map[brand] ?? emptyLibrary()
}
/** Apply a change to the VIEWED brand's system (messagingBrand) and keep the
 *  `library` mirror in sync (the Messaging page + library readers use the mirror). */
function activeLibPatch(
  s: TrafficState,
  fn: (lib: MessagingLibrary) => MessagingLibrary,
): { brandSystems: Record<string, MessagingLibrary>; library: MessagingLibrary } {
  const brand = s.messagingBrand
  if (!brand) return { brandSystems: s.brandSystems, library: s.library }
  const library = fn(libFor(s.brandSystems, brand))
  const brandSystems = { ...s.brandSystems, [brand]: library }
  saveBrandSystems(brandSystems)
  return { brandSystems, library }
}

// Coherence decisions: the human accept/override calls on the cross-variant
// check. The proprietary dataset (see domain/coherence.ts), persisted locally.
const COHERENCE_KEY = 'stoplight.coherenceDecisions.v1'
function loadCoherenceDecisions(): CoherenceDecision[] {
  try {
    const v = JSON.parse(localStorage.getItem(COHERENCE_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveCoherenceDecisions(list: CoherenceDecision[]): void {
  try {
    localStorage.setItem(COHERENCE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

// Connection-check break statuses (intended / in-review) and the audit log.
// Breaks themselves are derived from the rows; only the human overlay + the
// disclosure trail persist.
const BREAK_STATUS_KEY = 'stoplight.breakStatus.v1'
function loadBreakStatus(): Record<string, BreakStatus> {
  try {
    const v = JSON.parse(localStorage.getItem(BREAK_STATUS_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveBreakStatus(map: Record<string, BreakStatus>): void {
  try {
    localStorage.setItem(BREAK_STATUS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
// The last Claude-run coherence check, persisted so it survives a reload (the whole
// point of "ask Claude to check": the result shouldn't evaporate). Only a real Claude
// run (live) is stored; the local heuristic fallback is never persisted as the check.
const COHERENCE_CHECK_KEY = 'stoplight.coherenceCheck.v1'
interface PersistedCoherence {
  claudeBreaks: CoherenceBreak[] | null
  claudeBreaksScope: string | null
  coherenceCheckedHash: string | null
  coherenceLive: boolean
  coherenceBaseline: BrandBaseline | null
}
const EMPTY_COHERENCE: PersistedCoherence = {
  claudeBreaks: null,
  claudeBreaksScope: null,
  coherenceCheckedHash: null,
  coherenceLive: false,
  coherenceBaseline: null,
}
function loadCoherenceCheck(): PersistedCoherence {
  try {
    const v = JSON.parse(localStorage.getItem(COHERENCE_CHECK_KEY) || 'null')
    if (v && typeof v === 'object' && Array.isArray(v.claudeBreaks)) return v as PersistedCoherence
  } catch {
    /* ignore */
  }
  return EMPTY_COHERENCE
}
function saveCoherenceCheck(c: PersistedCoherence): void {
  try {
    localStorage.setItem(COHERENCE_CHECK_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}
const INITIAL_COHERENCE = loadCoherenceCheck()
const AUDIT_LOG_KEY = 'stoplight.auditLog.v1'
function loadAuditLog(): AuditEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveAuditLog(list: AuditEntry[]): void {
  try {
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

// Share links the owner has handed out, persisted. The grant is also self-encoded
// in each link's token; this list is the owner's management view (revoke).
const SHARES_KEY = 'stoplight.shares.v1'
function loadShares(): ShareGrant[] {
  try {
    const v = JSON.parse(localStorage.getItem(SHARES_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveShares(list: ShareGrant[]): void {
  try {
    localStorage.setItem(SHARES_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

// Campaign version history (copy save-points), persisted per client.
const VERSIONS_KEY = 'stoplight.versions.v1'
function loadVersions(): CampaignVersion[] {
  try {
    const v = JSON.parse(localStorage.getItem(VERSIONS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveVersions(list: CampaignVersion[]): void {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
/** Attribute a version to the same identity multiplayer presence uses. */
function currentAuthor(): string {
  try {
    const id = JSON.parse(sessionStorage.getItem('stoplight.presence.identity') || 'null')
    if (id?.name) return id.name
  } catch {
    /* ignore */
  }
  return 'You'
}

// A share link (?share=token) puts the app into that grant's role + client on the
// very first render, so there's no flash of the owner's full view.
interface SharedSession {
  client: string
  role: Role
  grantId: string
  /** When set, the session is locked to this single flow (campaign), not the whole brand. */
  campaign?: string
}
function readShareFromUrl(): SharedSession | null {
  try {
    const token = new URLSearchParams(window.location.search).get('share')
    if (!token) return null
    const g = decodeShareToken(token)
    return g ? { client: g.client, role: g.role, grantId: g.id, campaign: g.campaign } : null
  } catch {
    return null
  }
}
const initialShare = readShareFromUrl()

// Starter brand guides per client (generated by the readiness check, confirmed
// by the user). The single most important input the coherence check needs.
interface BrandGuideEntry {
  guide: BrandGuide
  confirmed: boolean
}
const BRAND_GUIDES_KEY = 'stoplight.brandGuides.v1'
function loadBrandGuides(): Record<string, BrandGuideEntry> {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_GUIDES_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveBrandGuides(map: Record<string, BrandGuideEntry>): void {
  try {
    persistState(BRAND_GUIDES_KEY, map)
  } catch {
    /* ignore */
  }
}

/**
 * Who wrote each brand field: the person, or a drafting pass.
 *
 * Needed because the brand drafter fills every field it is asked for (its response schema marks all
 * 26 required, so nothing ever comes back empty) and used to write all of them over the top of
 * whatever was there. A user who typed their own one-liner during setup had it replaced by the
 * model's version minutes later. Provenance is the only way to tell "you have not said" from "you
 * said, and I overwrote you", and the review screen needs the same distinction to show what is a
 * draft versus what is the user's own words.
 *
 * Keyed by brand, then by field name. Absent means unknown, which is treated as model-owned so a
 * re-draft can still refresh fields written before this existed.
 */
const BRAND_FIELD_SOURCES_KEY = 'stoplight.brandFieldSources.v1'
export type FieldSource = 'user' | 'model'
function loadBrandFieldSources(): Record<string, Record<string, FieldSource>> {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_FIELD_SOURCES_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveBrandFieldSources(map: Record<string, Record<string, FieldSource>>): void {
  try {
    persistState(BRAND_FIELD_SOURCES_KEY, map)
  } catch {
    /* ignore */
  }
}

// Account-wide switch for contributing to (and reading from) the anonymized
// aggregate learning layer. Default-on; one opt-out for the whole account.
const AGG_CONTRIB_KEY = 'stoplight.aggregateContributing.v1'
function loadAggregateContributing(): boolean {
  try {
    return localStorage.getItem(AGG_CONTRIB_KEY) !== 'false'
  } catch {
    return true
  }
}
function saveAggregateContributing(on: boolean): void {
  try {
    localStorage.setItem(AGG_CONTRIB_KEY, on ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

// The model the user picked for the internal AI (see domain/aiModels). 'auto' = server tier defaults.
const AI_MODEL_KEY = 'stoplight.aiModel.v1'
function loadAiModel(): string {
  try {
    return localStorage.getItem(AI_MODEL_KEY) || DEFAULT_AI_MODEL
  } catch {
    return DEFAULT_AI_MODEL
  }
}
function saveAiModel(id: string): void {
  try {
    localStorage.setItem(AI_MODEL_KEY, id)
  } catch {
    /* ignore */
  }
}

// Per-user interface preferences (skill level + marketer role). Persisted via persistState so they
// mirror to the workspace_state blob. null axes = today's full UI (see domain/userPrefs).
const USER_PREFS_KEY = 'stoplight.userPrefs.v1'
// Set the moment the user changes a preference this session, so the device-sync restore during
// hydration never clobbers an in-flight change with the stale server blob it read before the change.
let userPrefsTouchedThisSession = false
function loadUserPrefs(): UserPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_PREFS_KEY) ?? 'null')
    return raw && typeof raw === 'object' ? { ...DEFAULT_USER_PREFS, ...raw } : { ...DEFAULT_USER_PREFS }
  } catch {
    return { ...DEFAULT_USER_PREFS }
  }
}

// Campaigns created in the new-client wizard, persisted. Registered into
// clientForCampaign on load so they resolve to their client before any rows exist.
const CAMPAIGNS_KEY = 'stoplight.campaigns.v1'
function loadCampaigns(): Campaign[] {
  try {
    const v = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]')
    const list: Campaign[] = Array.isArray(v) ? v : []
    for (const c of list) registerCampaign(c.name, c.client)
    return list
  } catch {
    return []
  }
}
function saveCampaigns(list: Campaign[]): void {
  try {
    persistState(CAMPAIGNS_KEY, list)
  } catch {
    /* ignore */
  }
}

// Campaign folders per brand — the ordered folder names a brand's gallery can file
// its campaigns under. Membership lives on each Campaign.folder; this holds the list
// (so an empty folder still exists) and its order. Keyed by brand (client) name.
const FLIGHTS_KEY = 'stoplight.flights.v1'
function loadFlights(): Flight[] {
  try {
    const v = JSON.parse(localStorage.getItem(FLIGHTS_KEY) || '[]')
    return Array.isArray(v) ? (v as Flight[]) : []
  } catch {
    return []
  }
}
function saveFlights(list: Flight[]): void {
  try {
    persistState(FLIGHTS_KEY, list)
  } catch {
    /* ignore */
  }
}

const CAMPAIGN_FOLDERS_KEY = 'stoplight.campaignFolders.v1'
function loadCampaignFolders(): Record<string, string[]> {
  try {
    const v = JSON.parse(localStorage.getItem(CAMPAIGN_FOLDERS_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}
function saveCampaignFolders(map: Record<string, string[]>): void {
  try {
    persistState(CAMPAIGN_FOLDERS_KEY, map)
  } catch {
    /* ignore */
  }
}

// Named connection canvases (boards) per campaign. The implicit "All" board
// (id 'all') shows every audience and isn't stored — only custom boards live here.
export interface CanvasBoard {
  id: string
  client: string
  campaign: string
  name: string
  /** Audiences this board shows, by name; empty shows all. */
  audiences: string[]
}
const CANVASES_KEY = 'stoplight.canvases.v1'
function loadCanvases(): CanvasBoard[] {
  try {
    const v = JSON.parse(localStorage.getItem(CANVASES_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveCanvases(list: CanvasBoard[]): void {
  try {
    persistState(CANVASES_KEY, list)
  } catch {
    /* ignore */
  }
}

// Artboards: named frames drawn on the infinite canvas to group a region of cards
// (a launch set, a channel cluster, a phase). Purely a spatial grouping/label in
// v1 — the projections that read a campaign (Grid, Calendar) already exist; this is
// the canvas surface for framing work. Persisted per client + campaign, in world coords.
export interface Artboard {
  id: string
  client: string
  campaign: string
  name: string
  x: number
  y: number
  w: number
  h: number
}
const ARTBOARDS_KEY = 'stoplight.artboards.v1'
function loadArtboards(): Artboard[] {
  try {
    const v = JSON.parse(localStorage.getItem(ARTBOARDS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveArtboards(list: Artboard[]): void {
  try {
    localStorage.setItem(ARTBOARDS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
// Open project tabs (campaign names) — the canvases you have open in the folder
// drawer, in tab order. You close them with the × like browser tabs.
const OPEN_PROJECTS_KEY = 'stoplight.openProjects.v1'
function loadOpenProjects(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_PROJECTS_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
function saveOpenProjects(list: string[]): void {
  try {
    localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
const ACTIVE_CANVAS_KEY = 'stoplight.activeCanvas.v1'
function loadActiveCanvas(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_CANVAS_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveActiveCanvas(map: Record<string, string>): void {
  try {
    localStorage.setItem(ACTIVE_CANVAS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

// RTBs drafted from the ICP per campaign, persisted. Re-registered on load so
// their labels resolve in the grid / drawer / flow after a reload.
const CAMPAIGN_RTBS_KEY = 'stoplight.campaignRtbs.v1'
function loadCampaignRtbs(): Record<string, Rtb[]> {
  try {
    const v = JSON.parse(localStorage.getItem(CAMPAIGN_RTBS_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveCampaignRtbs(map: Record<string, Rtb[]>): void {
  try {
    localStorage.setItem(CAMPAIGN_RTBS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
for (const [c, list] of Object.entries(loadCampaignRtbs())) registerCampaignRtbs(c, list)

interface TrafficState {
  /** Assets dropped into the tray, not yet trafficked into the sheet. */
  assets: Asset[]
  /** Rows mirrored from the sheet (the source of truth). */
  rows: TrafficRow[]
  loading: boolean

  /** Sidebar channel filter; 'all' shows everything. */
  filter: ChannelId | 'all'
  /** Sidebar proof-point filter (an RTB id); 'all' shows everything. */
  proofFilter: string
  /** Sidebar CTA filter (a CTA value); 'all' shows everything. */
  ctaFilter: string
  /** Sidebar audience filter (an audience name); 'all' shows everything. */
  audienceFilter: string
  /** Status / governance card filter (flagged / draft / live / unvetted). */
  cardFilter: CardFilter
  /** "Getting started" checklist UI state (collapsed / dismissed / hand-checked steps). */
  onboarding: OnboardingState
  /** Collapse the checklist to the compact pill, or expand it. */
  setOnboardingCollapsed: (collapsed: boolean) => void
  /** Hide the checklist entirely (until reset). */
  dismissOnboarding: () => void
  /** Bring the checklist back (and expand it). */
  resetOnboarding: () => void
  /** Toggle a step's hand-checked state (an override on top of auto-detection). */
  toggleOnboardingStep: (id: OnboardingStepId) => void
  /** Mark a step done (idempotent) — used to record teaching actions like opening the calendar. */
  markOnboardingDone: (id: OnboardingStepId) => void
  /** The files-browser home filter (all / drafts / flagged / live / `brand:<name>`),
   *  owned here so the files sidebar can drive it from any page. */
  homeFilter: string
  setHomeFilter: (f: string) => void
  /** Toolbar search across asset name / caption. */
  query: string
  /** Breadcrumb scope: which client, then which campaign. 'all' = no scope. */
  clientFilter: string
  campaignFilter: string
  /** Per-client workspace view. */
  view: 'grid' | 'calendar' | 'flow' | 'insights' | 'canvas'
  /** Connection-canvas performance overlay: per-asset reach/rate + plan rollup. */
  perfMode: boolean
  togglePerfMode: () => void
  /** Brand-level (Level 1) view: the workspace's layers. */
  brandView: 'foundation' | 'live' | 'campaigns' | 'personalize'
  setBrandView: (v: 'foundation' | 'live' | 'campaigns' | 'personalize') => void
  /** Forward time horizon for the Connection + Grid views. */
  timeRange: TimeRange
  setTimeRange: (range: TimeRange) => void
  /** Top-level destination in the global nav rail. */
  page: 'clients' | 'connectors' | 'billing' | 'library' | 'portfolio' | 'content' | 'channels' | 'metrics' | 'brand' | 'account' | 'reports' | 'priorities' | 'records' | 'channelrecords' | 'people' | 'segments' | 'proofpoints' | 'messages' | 'voices' | 'patterns' | 'objectives' | 'triggers' | 'flows' | 'tasks' | 'brands' | 'calendar' | 'dataset'
  /** A record id to auto-open in its RecordsTable drawer once that sheet mounts (e.g. clicking a
   *  task's linked company jumps to Companies and pops that row's details). Consumed + cleared by
   *  the table that owns the id. */
  focusRecordId: string | null
  focusRecord: (id: string | null) => void
  /** When you jump into a record that lives on another page (e.g. an Audience's linked Company, a
   *  Task's company), the page you came from, so the destination record view can offer a "← Back"
   *  out of it. Set by jumpToRecord; cleared by any ordinary nav (setPage). */
  recordBackTo: TrafficState['page'] | null
  jumpToRecord: (id: string, page: TrafficState['page']) => void
  /** Which Library sub-view is open — nested under Library in the sidebar. */
  libraryMode: 'catalog' | 'data'
  setLibraryMode: (mode: 'catalog' | 'data') => void
  /** Which Brand sub-view is open — nested under Brand in the sidebar. */
  brandTab: 'about' | 'goal' | 'voice' | 'audiences' | 'strategy' | 'messaging' | 'channels' | 'visual' | 'data'
  setBrandTab: (tab: 'about' | 'goal' | 'voice' | 'audiences' | 'strategy' | 'messaging' | 'channels' | 'visual' | 'data') => void
  /** One messaging system per brand, keyed by brand name (lazy-created). */
  brandSystems: Record<string, MessagingLibrary>
  /** Brand tree + explicit sharing + draft flag, keyed by brand (client) name. The
   *  hard boundary: generation/coherence resolve assets only from a brand's own scope
   *  (self + ancestors + explicit shares). */
  brandMeta: BrandMetaMap
  // ---- ABM: target accounts ----
  /** Target accounts per brand (BlackRock, Robinhood, …). Accounts live under a brand. */
  accountsByBrand: Record<string, Account[]>
  /** Named account sets a campaign/program targets. */
  targetLists: TargetList[]
  /** The target list a campaign targets (campaign name → list id). */
  campaignTargetList: Record<string, string>
  /** Saved Views (smart canvases): named, re-resolving filters over a brand's assets. */
  savedViews: SavedView[]
  /** Approved/proposed conditional rules per campaign (fan-out conditional logic). */
  campaignConditions: Record<string, FanCondition[]>
  /** The brand whose system the Messaging page is viewing/editing. */
  messagingBrand: string
  setMessagingBrand: (brand: string) => void
  /** Mirror of the viewed brand's system (brandSystems[messagingBrand]): reusable
   *  audiences, proof, subjects, hooks, CTAs, strategies. The canvas reads the
   *  campaign's brand's system directly from brandSystems. */
  library: MessagingLibrary
  addLibraryItem: (kind: LibraryKind, item: LibraryCta | Rtb | AudienceType | GtmStrategy | LibrarySubject | LibraryHook) => void
  /** Clear a brand's authored messaging (CTAs, proof, audiences, subjects, hooks);
   *  keeps the standard GTM strategies. Used to reset a polluted system. */
  resetBrandMessaging: (brand: string) => void
  removeLibraryItem: (kind: LibraryKind, id: string) => void
  /** Patch fields on a library item (used by the editable audience sheet). */
  updateLibraryItem: (kind: LibraryKind, id: string, patch: Record<string, unknown>) => void
  /** Set the alias lists on a brand's canonical audiences (keyed by audience id), so
   *  freeform plan tags tie back to them for performance rollups. */
  setAudienceAliases: (brand: string, aliasesById: Record<string, string[]>) => void
  /** Append a proof point (RTB) to a specific brand's library (brand-explicit, unlike the
   *  active-library addLibraryItem). Used by the flow chat's createProof command. */
  addBrandProof: (brand: string, rtb: Rtb) => void
  /** Bless a draft library asset into an approved master (governance). */
  approveLibraryItem: (kind: LibraryKind, id: string) => void
  /** Edit a library Subject master and PROPAGATE the new text to every campaign
   *  carrying the old text (Figma-style master→instance). Returns how many
   *  campaigns were updated, so the Library can report the blast radius. */
  editLibrarySubject: (id: string, text: string) => number
  /** Edit a library Hook master in place (no canvas instances to propagate yet). */
  editLibraryHook: (id: string, text: string) => void
  /** Pull a library audience (with its proof + voice) onto a client. */
  useLibraryAudience: (client: string, audienceId: string) => void
  /** Save a project's audience into the library for reuse elsewhere. */
  saveAudienceToLibrary: (audience: AudienceType) => void
  /** ICP & proof side drawer. */
  icpOpen: boolean
  /** Personalization fan-out card drawer. */
  personalizeOpen: boolean
  /** Saved Views (smart canvases) drawer + which view is open as a board (null = list). */
  savedViewsOpen: boolean
  setSavedViewsOpen: (open: boolean) => void
  openSavedViewId: string | null
  setOpenSavedViewId: (id: string | null) => void
  /** Channel whose tracking-setup drawer is open ('all' = overview), or null. */
  trackingChannel: ChannelId | 'all' | null
  openTracking: (channel: ChannelId | 'all') => void
  closeTracking: () => void
  /** Google Drive / Demo Drive import picker. */
  drivePickerOpen: boolean
  /** True once the Drive account is connected (real sign-in, or demo). */
  driveConnected: boolean
  /** Per-client saved Google Drive folder link. */
  driveLinks: Record<string, string>
  /** Explicitly-added clients (persisted), merged with clients derived from rows. */
  clientList: string[]
  addClient: (name: string) => void
  /** Client profiles (website / industry / voice) captured in intake, persisted. */
  clientProfiles: Record<string, ClientProfile>
  /** Save (merge) a client's profile. */
  setClientProfile: (name: string, profile: ClientProfile) => void
  /** Remove a brand's profile record (used by the Brand records page). */
  removeClientProfile: (name: string) => void
  /** Measured actuals per brand, pulled from a connected analytics source (read-only,
   *  refreshed out of band). Read by the Metrics tab beside the projected plan. */
  brandActuals: Record<string, BrandActuals>
  /** Replace a brand's measured actuals (whole-object write from a refresh pull). */
  setBrandActuals: (brand: string, data: BrandActuals) => void
  /** Saved Claude-generated reports over each brand's library (newest surfaced first). */
  reports: BrandReport[]
  /** Save a new report; returns its id. */
  addReport: (input: { client: string; title: string; kind: BrandReport['kind']; summary?: string; html: string }) => string
  /** Delete a saved report by id. */
  deleteReport: (id: string) => void
  /** Records › Companies — the lightweight CRM table. */
  companies: Company[]
  /** Add a company row (blank defaults unless overridden); returns its id. */
  addCompany: (partial?: Partial<Company>) => string
  /** Patch a company row by id. */
  updateCompany: (id: string, patch: Partial<Company>) => void
  /** Delete a company row by id. */
  deleteCompany: (id: string) => void
  /** Records › Channels — the channel taxonomy as records (paid / organic / owned + benchmarks). */
  channelRecords: ChannelRecord[]
  /** Add a channel record (blank defaults unless overridden); returns its id. */
  addChannelRecord: (partial?: Partial<ChannelRecord>) => string
  /** Patch a channel record by id. */
  updateChannelRecord: (id: string, patch: Partial<ChannelRecord>) => void
  /** Delete a channel record by id. */
  deleteChannelRecord: (id: string) => void
  /** Records › People — the contacts table. */
  people: Person[]
  /** Add a person row (blank defaults unless overridden); returns its id. */
  addPerson: (partial?: Partial<Person>) => string
  /** Patch a person row by id. */
  updatePerson: (id: string, patch: Partial<Person>) => void
  /** Delete a person row by id. */
  deletePerson: (id: string) => void
  /** Records › Message › Messages — reusable messages/angles. */
  messages: Message[]
  addMessage: (partial?: Partial<Message>) => string
  updateMessage: (id: string, patch: Partial<Message>) => void
  deleteMessage: (id: string) => void
  /** Records › Foundation › Voices — brand voice / tone-of-voice profiles copy is written in. */
  voices: Voice[]
  addVoice: (partial?: Partial<Voice>) => string
  updateVoice: (id: string, patch: Partial<Voice>) => void
  deleteVoice: (id: string) => void
  patterns: Pattern[]
  addPattern: (partial?: Partial<Pattern>) => string
  updatePattern: (id: string, patch: Partial<Pattern>) => void
  deletePattern: (id: string) => void
  triggers: Trigger[]
  addTrigger: (partial?: Partial<Trigger>) => string
  updateTrigger: (id: string, patch: Partial<Trigger>) => void
  deleteTrigger: (id: string) => void
  /** Records › Message › Objectives — what campaigns move + how it's measured. */
  objectives: Objective[]
  addObjective: (partial?: Partial<Objective>) => string
  updateObjective: (id: string, patch: Partial<Objective>) => void
  deleteObjective: (id: string) => void
  /** Library › folders — brand-scoped buckets of reference content (e.g. a competitor's posts),
   *  sat beside the brand's own ingested catalog. Each folder owns its items. */
  libraryFolders: LibraryFolder[]
  /** Create a folder for a brand; returns its id. */
  addLibraryFolder: (brand: string, name: string, kind?: LibraryFolder['kind']) => string
  /** Rename a folder. */
  renameLibraryFolder: (id: string, name: string) => void
  /** Delete a folder and everything filed in it. */
  deleteLibraryFolder: (id: string) => void
  /** Add items to a folder (from pasted URLs or hand-entered). Returns how many were added. */
  addLibraryFolderItems: (folderId: string, items: LibraryFolderItemInput[]) => number
  /** Remove one item from a folder. */
  removeLibraryFolderItem: (folderId: string, itemId: string) => void
  /** Records › Brands — your own brands/clients. Naming a brand registers it as a real client. */
  brandRecords: BrandRecord[]
  addBrandRecord: (partial?: Partial<BrandRecord>) => string
  updateBrandRecord: (id: string, patch: Partial<BrandRecord>) => void
  deleteBrandRecord: (id: string) => void
  /** Per-brand freeform data sets (blank spreadsheets). */
  brandDatasets: BrandDataset[]
  /** Brand-level reusable record bundles. A card links one of these rather than a raw record. */
  smartObjects: SmartObject[]
  addSmartObject: (brand: string, name: string, refs: FlowReference[]) => string
  updateSmartObject: (id: string, patch: Partial<Pick<SmartObject, 'name' | 'refs'>>) => void
  deleteSmartObject: (id: string) => void
  addBrandDataset: (brand: string, name?: string) => string
  renameBrandDataset: (id: string, name: string) => void
  deleteBrandDataset: (id: string) => void
  setDatasetCell: (id: string, row: number, col: number, value: string) => void
  setDatasetColumn: (id: string, col: number, label: string) => void
  addDatasetRow: (id: string) => void
  addDatasetColumn: (id: string) => void
  /** Records › Segments — the account-segments table. */
  segments: Segment[]
  /** Add a segment row (blank defaults unless overridden); returns its id. */
  addSegment: (partial?: Partial<Segment>) => string
  /** Patch a segment row by id. */
  updateSegment: (id: string, patch: Partial<Segment>) => void
  /** Delete a segment row by id. */
  deleteSegment: (id: string) => void
  /** Records › Media mix — saved channel-split scenarios, selectable per brand. */
  mediaMixes: MediaMix[]
  /** Create a new named mix for a brand; returns its id. */
  addMediaMix: (brand: string) => string
  /** Patch a saved mix by id. */
  updateMediaMix: (id: string, patch: Partial<MediaMix>) => void
  /** Delete a saved mix by id. */
  deleteMediaMix: (id: string) => void
  /** Insights pinned out of a report, kept in view on the Overview (newest first). */
  pinnedInsights: PinnedInsight[]
  /** Pin a finding lifted from a report; returns its id. */
  addPinnedInsight: (input: { client: string; text: string; note?: string; sourceReportId?: string; sourceTitle?: string }) => string
  /** Remove a pinned insight by id. */
  removePinnedInsight: (id: string) => void
  /** Auto-tag a brand's untagged library content to its best-fit audience; returns count tagged. */
  autoTagAudiences: (brand: string) => Promise<number>
  /** Reconcile planned cards to their published post (by sourceUrl/copy), inheriting the
   *  measured metrics so the projection becomes the actual. Returns count reconciled. */
  reconcileActuals: (brand: string) => Promise<number>
  /** Brand whose measured actuals are being pulled right now, or null. */
  actualsRefreshing: string | null
  /** Re-pull a brand's measured actuals from the connected source (mock or live proxy). */
  refreshActuals: (brand: string) => Promise<void>
  /** Brand whose content backfill is running right now, or null. */
  contentIngesting: string | null
  /** Last content-ingest result per brand (for the Library tab's summary line). */
  contentIngest: Record<string, { at: number; imported: number; updated: number; skipped: number; sources: string[] }>
  /** Pull every published post / video / page for a brand from its connected channels
   *  and land them in the Library as posted content (dedup + metrics via importAssets). */
  ingestContent: (brand: string) => Promise<void>
  /** Onboarding readiness: starter brand guides per client + the drawer state. */
  brandGuides: Record<string, BrandGuideEntry>
  /** Who wrote each brand field, per brand: 'user' fields are never overwritten by a drafting pass. */
  brandFieldSources: Record<string, Record<string, FieldSource>>
  /** Record authorship for a set of brand fields. Call it right after writing them. */
  markBrandFields: (brand: string, fields: string[], source: FieldSource) => void
  /** The fields this brand's owner supplied themselves, as a set for cheap lookup. */
  userOwnedBrandFields: (brand: string) => Set<string>
  /** Carry a brand's authorship map across a rename. Provenance is keyed by NAME, records by id. */
  renameBrandFieldSources: (from: string, to: string) => void
  readinessOpen: boolean
  openReadiness: () => void
  /** Onboarding-as-diagnosis: the before→after reveal on the brand's own data. */
  diagnosisOpen: boolean
  openDiagnosis: () => void
  closeDiagnosis: () => void
  /** Ask Claude: the conversational connection / what-worked palette. */
  askOpen: boolean
  /** A question to pre-fill and auto-run when the palette opens (from the home hero /
   *  quick-action chips). Consumed and cleared by AskClaude on open. */
  askSeed?: string
  openAsk: (seed?: string) => void
  closeAsk: () => void
  /** The Home conversational chat: a full-page thread opened from the Home ask box.
   *  `homeChatSeed` is the first question to run when it opens. */
  homeChatOpen: boolean
  homeChatSeed: string | null
  /** The saved conversation currently open (null = a fresh, unsaved chat). */
  activeHomeChatId: string | null
  /** Bumped on every open/new so the chat remounts with the right thread. */
  homeChatSession: number
  openHomeChat: (q: string) => void
  closeHomeChat: () => void
  /** Start a fresh, empty Home chat. */
  newHomeChat: () => void
  /** Reopen a saved Home chat by id. */
  openSavedHomeChat: (id: string) => void
  /** Past Home chat conversations, newest activity first. */
  homeChats: SavedHomeChat[]
  /** Upsert a saved Home chat by id. */
  saveHomeChat: (chat: SavedHomeChat) => void
  /** Delete a saved Home chat by id. */
  deleteHomeChat: (id: string) => void
  /** Sharing & access: the current session role and the owner's share links. */
  role: Role
  sharedSession: SharedSession | null
  shares: ShareGrant[]
  shareDialogOpen: boolean
  /** When set, the Share dialog mints a link for this single flow (campaign), not the whole brand. */
  shareDialogCampaign: string | null
  openShareDialog: (campaign?: string) => void
  closeShareDialog: () => void
  createShare: (client: string, role: Role, campaign?: string) => ShareGrant
  revokeShare: (id: string) => void
  exitSharedSession: () => void
  /** Campaign version history: copy save-points per client. */
  versions: CampaignVersion[]
  historyOpen: boolean
  openHistory: () => void
  closeHistory: () => void
  saveVersion: (label?: string) => void
  restoreVersion: (id: string) => Promise<void>
  closeReadiness: () => void
  generateBrandGuide: (client: string) => void
  updateBrandGuide: (client: string, patch: Partial<BrandGuide>) => void
  confirmBrandGuide: (client: string) => void
  /** Audience types per client (personas under the ICP), persisted. */
  clientAudiences: Record<string, AudienceType[]>
  /** Replace a client's audience-type list. */
  setClientAudiences: (name: string, audiences: AudienceType[]) => void
  /** Remove a client: its rows, campaigns, saved Drive link, profile, and list entry. */
  deleteClient: (name: string) => Promise<void>
  /** Named connection canvases (boards) per campaign; the implicit 'all' board
   *  isn't stored. */
  canvases: CanvasBoard[]
  /** Active canvas id per scope key (`client|campaign`); defaults to 'all'. */
  activeCanvas: Record<string, string>
  addCanvas: (client: string, campaign: string, name: string, audiences?: string[]) => string
  renameCanvas: (id: string, name: string) => void
  deleteCanvas: (id: string) => void
  /** Artboards: named frames drawn on the canvas to group a region of cards.
   *  Persisted per client + campaign in world coordinates. */
  artboards: Artboard[]
  addArtboard: (client: string, campaign: string, rect: { x: number; y: number; w: number; h: number }) => void
  renameArtboard: (id: string, name: string) => void
  deleteArtboard: (id: string) => void
  setActiveCanvas: (scopeKey: string, id: string) => void
  setCanvasAudiences: (id: string, audiences: string[]) => void
  /** Open project tabs (campaign names) in the canvas folder drawer, in tab order. */
  openProjects: string[]
  openProject: (campaign: string) => void
  closeProject: (campaign: string) => void
  /** Brands opened as canvas tabs (alongside campaigns), so a brand's page is a closeable tab. */
  openBrandTabs: string[]
  openBrandTab: (brand: string) => void
  closeBrandTab: (brand: string) => void
  /** Data sets opened as canvas tabs — each is a full-page spreadsheet. `activeDatasetId` is the one
   *  the 'dataset' page renders. */
  openDatasetTabs: string[]
  activeDatasetId: string | null
  openDatasetTab: (id: string) => void
  closeDatasetTab: (id: string) => void
  /** A campaign the Flows view should open in view mode (the project tabs set this so a
   *  tab opens the flow, not the legacy canvas). '' means open a fresh flow builder.
   *  FlowsView consumes it and calls clearFlowOpen. */
  flowOpen: string | null
  /** Which view the flow should open in (flow canvas / grid / calendar). Set alongside flowOpen
   *  so a caller like "Review your calendar" can land directly on the calendar. FlowsView reads
   *  it when it consumes flowOpen, then it's reset on clearFlowOpen. */
  flowOpenView: 'flow' | 'grid' | 'calendar'
  openFlow: (campaign: string, flowView?: 'flow' | 'grid' | 'calendar') => void
  clearFlowOpen: () => void
  /** Umbrella to nest the next-created campaign under (set by "Add a campaign" inside an umbrella).
   *  FlowsView reads it when it builds the campaign, then clears it. null = a top-level campaign. */
  newCampaignParent: string | null
  setNewCampaignParent: (parent: string | null) => void
  /** True while a flow canvas (build or view) is open — collapses the sidebar to a rail. */
  flowCanvasOpen: boolean
  setFlowCanvasOpen: (open: boolean) => void
  /** Which view of the open campaign is showing (the Flow / Grid / Calendar top tabs). Lifted here
   *  so the campaign icon rail (Files / Assets / Hansel in HomeShell) can drive and reflect it. */
  flowView: 'flow' | 'grid' | 'calendar'
  setFlowView: (v: 'flow' | 'grid' | 'calendar') => void
  /** Whether the campaign's Hansel panel is collapsed to its rail. Lifted so the icon rail's
   *  Hansel item can toggle and reflect it. */
  flowChatCollapsed: boolean
  setFlowChatCollapsed: (v: boolean) => void
  /** Whether the Assets library is docked as the canvas's left panel (shares the slot with Hansel,
   *  so the canvas stays put — Assets is a panel ON the one canvas, not a separate view). */
  flowAssetsOpen: boolean
  setFlowAssetsOpen: (v: boolean) => void
  /** User-toggled sidebar collapse (persists; works on every page). */
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Whether the Records-page AI assistant panel is collapsed to its rail (remembered). */
  recordsChatCollapsed: boolean
  setRecordsChatCollapsed: (v: boolean) => void
  /** Saved flow-chat conversations, per flow (newest first). */
  flowChats: SavedFlowChat[]
  /** Upsert a saved flow chat by id. */
  saveFlowChat: (chat: SavedFlowChat) => void
  /** Delete a saved flow chat by id. */
  deleteFlowChat: (id: string) => void
  /** Campaigns created via the new-client wizard (persisted). */
  campaignList: Campaign[]
  addCampaign: (campaign: Campaign) => void
  /** Move a campaign through its lifecycle (planning → in-review → active → completed). */
  setCampaignStatus: (name: string, status: CampaignStatus) => void
  /** Open a campaign straight into its workspace (Level 2 canvas) from anywhere —
   *  the home hub's "jump back in" + triage deep-links use this to resume work. */
  openCampaign: (name: string) => void
  /** Create a fresh, brand-less canvas in the Drafts space and open it — the hub's
   *  "New canvas" action. No client / wizard up front; attach a brand later via the
   *  Brand card. Seeds one default audience lane so the blank canvas is addable. */
  createCanvas: () => void
  /** Link a campaign to a GTM playbook (ABM, Demand Gen, etc.) — the strategy selector. */
  setCampaignStrategy: (name: string, strategy: string) => void
  /** Apply a GTM strategy to every campaign of a brand at once — the brand-level playbook. */
  setBrandStrategy: (brand: string, strategy: string) => void
  /** Swap a campaign's subject (what it's about) — the Subject card picker. */
  setCampaignSubject: (name: string, subject: string) => void
  /** Set the records a flow references (Companies / People / Segments / Media mix). Read when generating assets. */
  setCampaignReferences: (name: string, references: FlowReference[]) => void
  /** The campaign's object direction: what its objects instruct the copy writer to do. */
  setCampaignDirection: (name: string, direction: { kind: string; key: string; value: string }[]) => void
  /** Patch arbitrary campaign metadata (flight length, budget, …) on an existing campaign.
   *  A no-op if the campaign isn't found (only meaningful for built flows). */
  patchCampaign: (name: string, patch: Partial<Campaign>) => void
  /** Shift every scheduled asset in a campaign by N days — drag-to-move a campaign on the calendar. */
  moveCampaignSchedule: (campaign: string, deltaDays: number) => Promise<void>
  /** Rescale a campaign's assets into a new [startMs, endMs] window and update its duration —
   *  drag-to-resize a campaign on the calendar. */
  rescaleCampaignSchedule: (campaign: string, newStartMs: number, newEndMs: number) => Promise<void>
  /** Shift a single asset's launch date (scheduledAt) by N days — drag an asset on the calendar. */
  moveAssetSchedule: (rowId: string, deltaDays: number) => Promise<void>
  /** Set a campaign's goal (its objective) — what it's meant to achieve. Empty clears it. */
  setCampaignGoal: (name: string, goal: string) => void
  /** Set the structured goal parts: message override, KPI, target. Only the passed keys change. */
  setCampaignGoalParts: (
    name: string,
    patch: { message?: string; kpi?: string; target?: number | null },
  ) => void
  /** Swap a campaign's brand/client — the Brand card picker. Re-homes the campaign. */
  setCampaignClient: (name: string, client: string) => void
  /** Campaign folders per brand: the ordered folder names each brand's gallery files under. */
  campaignFolders: Record<string, string[]>
  /** Campaign Flights — each a scheduled run of a campaign (Umbrella → Campaign → Flight → Asset). */
  flights: Flight[]
  /** True once flights have been hydrated from the backend (or immediately, with no backend). Gates
   *  ensureFlights so it can't overwrite the workspace's real flights during the load race. */
  flightsHydrated: boolean
  /** Give every campaign that has assets a default flight (idempotent; gated on flightsHydrated). */
  ensureFlights: () => Promise<void>
  /** Add a flight to a campaign; returns the new flight's id. */
  addFlight: (campaign: string, patch?: Partial<Flight>) => string
  /** Edit a flight (name / startAt / durationWeeks). */
  patchFlight: (id: string, patch: Partial<Flight>) => void
  /** Remove a flight; its assets keep their dates but lose the flight tag. */
  deleteFlight: (id: string) => void
  /** Drag-move a flight on the calendar: shift its window + every asset that resolves to it by N days. */
  moveFlightSchedule: (flightId: string, deltaDays: number) => Promise<void>
  /** Drag-resize a flight: set its window to [startMs, endMs] and rescale its assets into it. */
  rescaleFlightSchedule: (flightId: string, newStartMs: number, newEndMs: number) => Promise<void>
  /** Re-run a campaign: add a new flight after the latest one and clone its assets into that window
   *  (fresh draft rows stamped with the new flightId). Returns the new flight's id. */
  addFlightRun: (campaign: string) => Promise<string | null>
  /** Remove a re-run flight and archive ONLY the assets explicitly stamped to it (never the primary
   *  flight's unstamped assets). */
  removeFlightRun: (flightId: string) => Promise<void>
  /** Delete a flight and archive every asset that resolves to it (stamped OR the primary flight's
   *  fallback), with the same verify+retry hardening as removeFlightRun. This is the explicit,
   *  user-initiated per-flight delete used by the folder view. */
  removeFlight: (flightId: string) => Promise<void>
  /** Which folder the campaigns gallery is scoped to — nested under Campaigns in the
   *  sidebar. null = all folders grouped; '' = Unfiled; else a folder name. */
  campaignFolderView: string | null
  setCampaignFolderView: (folder: string | null) => void
  /** File a campaign under a folder (within its brand). undefined = unfiled. */
  setCampaignFolder: (name: string, folder: string | undefined) => void
  /** Create an (initially empty) folder for a brand. No-op if it already exists. */
  createCampaignFolder: (brand: string, folder: string) => void
  /** Rename a brand's folder, moving every campaign filed under it. */
  renameCampaignFolder: (brand: string, from: string, to: string) => void
  /** Delete a brand's folder; its campaigns fall back to unfiled. */
  deleteCampaignFolder: (brand: string, folder: string) => void
  /** Clone a campaign + all its assets into a new variant campaign (non-destructive
   *  "duplicate & try"); switches to it and returns the new campaign name. */
  duplicateCampaign: (name: string) => Promise<string>
  /** Re-tag every asset in a campaign targeting `from` to `to`, then ripple. The
   *  audience-swap, as a store action so it works on any campaign (incl. a clone). */
  swapCampaignAudience: (campaign: string, from: string, to: string) => Promise<void>
  /** Clear a persisted re-check flag once the produced asset has been reworked
   *  where it lives (or the mismatch is accepted). */
  clearRecheckFlag: (id: string) => Promise<void>
  /** Seasonal re-run: clone a campaign's assets + structure into a new editable cycle. */
  rerunSeasonalCampaign: (campaign: string) => Promise<void>
  /** Always-on: rotate creative now (reset rotated assets to draft, reschedule, log). */
  rotateAlwaysOn: (campaign: string) => Promise<void>
  /** Triggered: fire the event now — ship the campaign's draft assets. The
   *  connection check must be clean first, so a fast-shipped triggered piece is
   *  still checked before it goes. */
  fireTrigger: (campaign: string) => Promise<void>
  /** New-client / add-campaign wizard UI state. wizardClient = the client to add
   *  a campaign to (campaign-only mode), or null for the full new-client flow. */
  wizardOpen: boolean
  wizardClient: string | null
  openClientWizard: () => void
  openCampaignWizard: (client: string) => void
  closeWizard: () => void
  /** Add-audience flow (a guided modal under the active client's profile). */
  audienceWizardOpen: boolean
  openAudienceWizard: () => void
  closeAudienceWizard: () => void
  /** The "Invite teammate" modal (share the workspace by link). */
  inviteOpen: boolean
  openInvite: () => void
  closeInvite: () => void
  /** Generate a proposed workspace setup from a URL (Claude, heuristic fallback). */
  generateSetup: (input: SetupInput) => Promise<WorkspaceSetup>
  /** Commit a confirmed setup: client + profile + ICP + proof + first campaign. */
  provisionWorkspace: (setup: WorkspaceSetup) => Promise<void>
  /** Store an extracted current-state messaging map as the client's connected map. */
  provisionCurrentState: (map: SiteMap) => Promise<void>
  /** Re-gather a client's channels and replace their live-messaging map. */
  refreshClient: (client: string) => Promise<void>
  /** The client currently being refreshed (re-gathered), or null. */
  refreshingClient: string | null
  // ---- Per-channel link + ingest (Foundation › Channels) ----
  /** The channel-ingest drawer: open + which client/channel it targets. A 'sanity'
   *  kind targets the brand's Sanity CMS instead of a scraped channel. */
  channelIngestOpen: boolean
  channelIngestTarget: { client: string; channel: ChannelId; kind?: 'channel' | 'sanity' | 'resend' | 'google-ads' } | null
  /** Streamed stage progress for the running ingest. */
  channelIngestStages: IngestProgress[]
  /** The last ingest's result (mapped messaging + in-art copy), or null. */
  channelIngestResult: ChannelIngestResult | null
  /** A surfaced error from the ingest (e.g. LOGIN_REQUIRED, NO_KEY). */
  channelIngestError: { code: string | null; message: string } | null
  /** True while a per-channel ingest is running. */
  ingestingChannel: boolean
  /** Open the per-channel link + ingest drawer for a channel. */
  openChannelIngest: (client: string, channel: ChannelId) => void
  closeChannelIngest: () => void
  /** Manually link a channel by profile URL (the no-browser fallback). */
  linkChannelUrl: (client: string, channel: ChannelId, url: string) => void
  /** Open the drawer to ingest the brand's owned content from Sanity. */
  openSanityIngest: (client: string) => void
  /** Save a client's Sanity connection (projectId/dataset/token). */
  setSanityCreds: (client: string, creds: { projectId: string; dataset: string; token?: string }) => void
  /** Open the drawer to ingest the brand's email copy from Resend. */
  openResendIngest: (client: string) => void
  /** Save a client's Resend connection (API key). */
  setResendCreds: (client: string, creds: { apiKey: string }) => void
  /** Open the drawer to ingest the brand's live ad copy from the Google Ads API. */
  openGoogleAdsIngest: (client: string) => void
  /** Save a client's Google Ads API credentials. */
  setGoogleAdsCreds: (client: string, creds: NonNullable<ClientProfile['googleAds']>) => void
  /** Run the ingest for the open target: gather + read the copy (incl. art), or
   *  query Sanity when the target is the CMS. */
  ingestChannel: () => Promise<void>
  /** Seed the spreadsheet with draft rows for a strategy's needed assets, spread
   *  across the flight at each asset's monthly cadence, optionally splitting a
   *  media budget across the paid rows. */
  seedCampaignAssets: (
    campaign: string,
    deliverables: Deliverable[],
    opts?: { mediaBudget?: number; flightWeeks?: number; endDate?: string; audiences?: string[] },
  ) => Promise<void>
  /** Add one blank draft asset to a campaign (from the flow Grid/Calendar), returns its row id. */
  addBlankAsset: (campaign: string, opts?: { channel?: ChannelId; scheduledAt?: string }) => Promise<string>
  setFilter: (filter: ChannelId | 'all') => void
  setProofFilter: (proofFilter: string) => void
  setCtaFilter: (ctaFilter: string) => void
  setAudienceFilter: (audienceFilter: string) => void
  setCardFilter: (cardFilter: CardFilter) => void
  setQuery: (query: string) => void
  setClientFilter: (client: string) => void
  setCampaignFilter: (campaign: string) => void
  setView: (view: 'grid' | 'calendar' | 'flow' | 'insights' | 'canvas') => void
  setPage: (page: 'clients' | 'connectors' | 'billing' | 'library' | 'portfolio' | 'content' | 'channels' | 'metrics' | 'brand' | 'account' | 'reports' | 'priorities' | 'records' | 'channelrecords' | 'people' | 'segments' | 'proofpoints' | 'messages' | 'voices' | 'patterns' | 'objectives' | 'triggers' | 'flows' | 'tasks' | 'brands' | 'calendar' | 'dataset') => void
  setIcpOpen: (open: boolean) => void
  setPersonalizeOpen: (open: boolean) => void
  setDrivePickerOpen: (open: boolean) => void
  /** Connect the Drive account (real sign-in, or demo). */
  connectDrive: () => Promise<void>
  /** Entry point for "Import from Drive": opens the real Google Picker when
   *  configured, else the Demo Drive modal. */
  importFromDrive: () => Promise<void>
  /** Pick a whole Drive folder and import its files. */
  importFolderFromDrive: () => Promise<void>
  /** Ingest the assets in a Google Drive folder from its link. */
  ingestDriveFolderUrl: (url: string) => Promise<void>
  /** Save a Google Drive folder link for a client. */
  setDriveLink: (client: string, url: string) => void
  /** Ingest the assets from a client's saved Drive folder link. */
  ingestDriveLink: (client: string) => Promise<void>

  refresh: () => Promise<void>
  /** Pull the record lists (companies, people, brands, …) from the workspace backend into the store
   *  after sign-in. No-op on localStorage (the slices already loaded synchronously at init). */
  hydrateRecords: () => Promise<void>
  /** One-time: push this browser's localStorage data into the signed-in Supabase workspace, so a
   *  user's existing work carries over when the backend is turned on. Safe to run once. */
  migrateLocalToSupabase: () => Promise<{ ok: boolean; error?: string }>

  // ingest tray
  addAssets: (assets: Asset[]) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  toggleChannel: (id: string, channel: ChannelId) => void
  removeAsset: (id: string) => void
  /** Turn ready tray assets into scheduled draft rows in the sheet. */
  addToSheet: () => Promise<void>
  /** Generate a draft asset for one personalization-matrix cell (composed from the
   *  brand model), append it, and refresh so the connection check runs on it. */
  draftMatrixCell: (row: TrafficRow) => Promise<void>
  /** Append a batch of matrix-drafted assets at once (bulk gap-fill), then refresh. */
  draftMatrixCells: (rows: TrafficRow[]) => Promise<void>

  // sheet (spreadsheet) edits
  updateRow: (id: string, patch: Partial<TrafficRow>) => Promise<void>
  /** Apply many row patches as ONE batch (sequential writes, a single refresh) so
   *  cascades don't race concurrent refreshes and leave the in-memory rows stale. */
  updateRows: (updates: { id: string; patch: Partial<TrafficRow> }[]) => Promise<void>
  /** Re-draft the messaging of every asset in scope from the current model — the
   *  audience's angle + emphasized proof, and the stage CTA. Called when the
   *  strategy or an audience changes so the change ripples across every asset. */
  redraftAssets: (scope: { campaign?: string; audience?: string; client?: string }) => Promise<void>
  /** Row ids currently re-drafting — drives the on-canvas "generating" animation
   *  so a strategy/audience change is visibly seen rippling across the cards. */
  regenIds: Set<string>
  removeRow: (id: string) => Promise<void>
  // ---- Asset lifecycle ----
  /** Hand-author a first-class asset into a campaign (no generation). Tagged `authored`. */
  addAsset: (brand: string, campaign: string, patch: Partial<TrafficRow>) => Promise<TrafficRow>
  /** Bulk-import real content into a canvas as first-class assets (Buffer posts, scraped
   *  site/case studies, a pasted audit). Dedups by URL/copy so a re-import adds only new. */
  importAssets: (
    brand: string,
    campaign: string,
    items: Record<string, unknown>[],
    source: AssetSource,
  ) => Promise<{ imported: number; updated: number; skipped: number }>
  /** Pull a brand's real published content (its website pages) into the Library — headless, reusable
   *  by the auto-ingest trigger and the chat. Resolves the site from the brand's profile/record. */
  ingestBrandSite: (brand: string, urlOverride?: string) => Promise<{ imported: number; updated: number; skipped: number; ok: boolean; error?: string }>
  /** Set a single asset's review/publish status (draft → in_review → approved/rejected). */
  setRowStatus: (id: string, status: RowStatus, note?: string) => Promise<void>
  /** Soft-delete (archive) an asset — hidden but restorable. */
  archiveRow: (id: string) => Promise<void>
  /** Soft-delete many assets at once (a whole fan set, a campaign's assets). */
  archiveRows: (ids: string[]) => Promise<void>
  /** Restore an archived asset. */
  restoreRow: (id: string) => Promise<void>
  /** Soft-delete a campaign + archive its assets. Recoverable. */
  deleteCampaign: (name: string) => Promise<void>
  /** Rename a campaign (or umbrella) everywhere it's keyed by name: its record, every asset row's
   *  `campaign`, its flights, any child campaigns' `parent`, and open-project state. */
  renameCampaign: (oldName: string, newName: string) => Promise<void>
  /** Restore an archived campaign + its assets. */
  restoreCampaign: (name: string) => Promise<void>
  duplicateRow: (id: string) => Promise<void>
  /** Paste a copy of a row as a new draft asset (unique name) — Cmd/Ctrl+V. */
  pasteAsset: (id: string) => Promise<void>
  /** Undo the last sheet mutation (swap, restage, connect, paste, delete) — Cmd/Ctrl+Z. */
  undo: () => Promise<void>
  /** Replace all rows with a snapshot — used by the flow canvas's own undo/redo timeline. */
  applyRowsSnapshot: (rows: TrafficRow[]) => Promise<void>
  approveAll: () => Promise<void>
  publishRow: (id: string) => Promise<void>
  clearSheet: () => Promise<void>
  /** Replace the sheet with a curated sample dataset. */
  loadSample: () => Promise<void>
  /** Add a placeholder row for each asset type of a channel not yet present. */
  addMissingSlots: (channel: ChannelId) => Promise<void>

  // ICP messaging gate
  icp: Icp | null
  /** Result of the batch messaging review, or null if not run / stale. */
  batchReview: BatchReview | null
  reviewing: boolean
  /** True once the user has accepted the review — unlocks scheduling. */
  gateCleared: boolean
  loadIcp: () => Promise<void>
  /** Set a specific ICP (e.g. one proposed by the setup flow). */
  setIcp: (icp: Icp) => void
  runBatchReview: () => Promise<void>
  acceptReview: () => void
  /** Connection check: the breaks queue drawer + which card is expanded. */
  breaksOpen: boolean
  activeBreakId: string | null
  /** Human overlay on derived breaks (intended / in-review), keyed by break id. */
  breakStatus: Record<string, BreakStatus>
  /** Claude-powered coherence check: the last run's breaks + which scope it covers.
   *  Null until a recheck is requested, so the heuristic is the default everywhere. */
  claudeBreaks: CoherenceBreak[] | null
  claudeBreaksScope: string | null
  /** Which brand baseline the last coherence check measured against (voice + proof set
   *  in force, and where it came from). The check reports its referent explicitly. */
  coherenceBaseline: BrandBaseline | null
  coherenceChecking: boolean
  coherenceLive: boolean
  /** Content hash claudeBreaks were computed for — stale once content changes. */
  coherenceCheckedHash: string | null
  /** Claude check fell back / errored — stay on the live heuristic, stop auto-retry. */
  coherenceUnavailable: boolean
  runCoherenceCheck: () => Promise<void>
  /** The connected Claude app pushes coherence flags it ran itself (so the check
   *  comes from the live Claude, not Hyperfocus's own API credits). Injects them
   *  for the current scope and marks the result live. */
  applyClaudeCoherence: (flags: ClaudeCoherenceFlag[]) => void
  /** The Claude engine: reads from sources + publishes to channels via tools. */
  engineOpen: boolean
  engineRunning: boolean
  engineActions: AgentAction[]
  engineSummary: string
  engineLive: boolean
  openEngine: () => void
  closeEngine: () => void
  runEngine: (mode: 'read' | 'publish') => Promise<void>
  /** The disclosure trail: every check result and every action. */
  auditLog: AuditEntry[]
  openBreaks: (breakId?: string) => void
  closeBreaks: () => void
  applyBreakFix: (breakId: string) => Promise<void>
  reassignBreakProof: (breakId: string) => Promise<void>
  markBreakIntended: (breakId: string) => void
  sendBreakToReview: (breakId: string) => void
  /** Human accept/override calls on the coherence check — the proprietary dataset. */
  coherenceDecisions: CoherenceDecision[]
  /** Account-wide opt-out of the anonymized aggregate learning layer (default-on). */
  aggregateContributing: boolean
  setAggregateContributing: (on: boolean) => void
  /** Publish this workspace's anonymized outcome patterns to the cross-customer pool (opt-in only). */
  contributeAggregate: () => Promise<void>
  /** The model the user picked for the internal AI ('auto' = server tier defaults). See domain/aiModels. */
  aiModel: string
  setAiModel: (id: string) => void
  /** Per-user interface preferences: skill level (how much shows) + marketer role (what leads). */
  userPrefs: UserPrefs
  setUserPrefs: (patch: Partial<UserPrefs>) => void
  /** Once, after hydration: pick a starting detail level (Simple for a fresh workspace, Advanced when
   * data exists) if the user has never chosen one. No-op once skillLevel is set. */
  resolveSkillDefault: () => void
  /** True when the ICP was refined from Attio closed-won data (feedback loop). */
  icpFromClosedWon: boolean
  /** Refresh the ICP from actual closed-won customers in Attio. */
  refreshIcpFromClosedWon: () => void

  // starter-copy drafting (ICP-aware, real Claude with heuristic fallback)
  /** True while a draft run is in flight (drives the button states). */
  drafting: boolean
  /** Draft starter copy + proof into empty messaging fields. Pass specific row
   *  ids, or omit to draft every in-scope reviewable row that has no copy yet.
   *  Resolves to which writer produced the copy ('claude' | 'heuristic'), or null
   *  when nothing was drafted, so callers can show a source badge. 'heuristic' is
   *  sticky: if any campaign group fell back, the whole run reports 'heuristic'. */
  draftCopy: (rowIds?: string[]) => Promise<CopySource | null>
  /** Live preview: draft copy for a set of not-yet-built deliverable slots WITHOUT
   *  seeding any rows or touching localStorage. Resolves one {headline, primary} per
   *  slot (in order) plus which writer produced it, so the Flows builder can show
   *  copy on a deliverable the moment it's added. Returns null when the brand can't
   *  generate (brandless / unbound). */
  previewFlowCopy: (input: {
    client: string
    channel: ChannelId
    assetType: string
    /** One entry per slot; the brief drives that slot's copy (empty = generic on-brand). */
    briefs: (string | undefined)[]
    /** Audience names to write to, rotated across slots; empty = the brand's own list. */
    audiences: string[]
    /** Proof-point labels every slot should lean on (the checked proof tags); empty = the
     *  brand's whole proof library. Pins preview proof to match what a build writes. */
    proof?: string[]
    /** Campaign theme — the throughline every slot orients around. */
    theme?: string
    /** Flight length in weeks — the campaign timeframe, so copy paces to it. */
    flightWeeks?: number
    /** Optional email-blueprint guidance per slot (framework / subject formula / CTA / levers). */
    steps?: ({ framework?: string; subjectFormula?: string; cta?: string; levers?: string } | undefined)[]
    /** What the campaign's objects instruct, so preview copy matches what a build would write. */
    direction?: { kind: string; key: string; value: string }[]
  }) => Promise<{ source: CopySource | null; posts: { headline: string; primary: string; components: { key: string; label: string; value: string }[] }[] } | null>
  /** Plan a personalization fan-out without committing (count-before-commit). */
  fanOutPreview: (
    campaign: string,
    dimension: string,
    values?: string[],
    exclude?: Record<string, string>[],
    limit?: number,
  ) => FanoutPlan
  /** Fan a campaign's base assets into one lineage-tagged variant per dimension value,
   *  then regenerate copy per variant. Stacks (multiplies) over existing variants.
   *  `limit` caps the total variants (spread across cards) when set. */
  fanOut: (
    campaign: string,
    dimension: string,
    values?: string[],
    opts?: { exclude?: Record<string, string>[]; generate?: boolean; limit?: number; force?: boolean },
  ) => Promise<{ variantCount: number; created: number; cap?: number; ceiling?: number; capped?: boolean }>
  /** Propose if/then conditions from the brand library (Claude/heuristic); human approves. */
  proposeConditions: (campaign: string) => FanCondition[]
  setConditionStatus: (campaign: string, id: string, status: 'proposed' | 'approved' | 'rejected') => void

  // ---- Brand boundary (hard isolation; brand = the coherence baseline) ----
  /** A transient notice when an action is refused because the canvas has no bound brand
   *  (the brand-less / contamination failure mode). Cleared on the next bound action. */
  brandNotice: string | null
  setBrandNotice: (msg: string | null) => void
  /** A transient bottom toast for lightweight recommendations (e.g. an unallocated budget). */
  toast: string | null
  showToast: (msg: string | null) => void
  /** Optional action shown on the toast (e.g. "Undo" after a soft delete). Cleared with the toast. */
  toastAction: { label: string; run: () => void } | null
  /** Show a toast with an action button (used for undo after archive/delete). */
  showToastAction: (msg: string, label: string, run: () => void) => void
  /** The inspectable baseline for a brand: which voice / proof set is in force and from
   *  where (self + ancestors + shares). Drives the canvas baseline chip + coherence report. */
  brandBaselineFor: (brand: string) => BrandBaseline
  /** Set / clear a brand's parent (inherit the parent's proof / values / audiences). */
  setBrandParent: (brand: string, parent: string | null) => void
  /** Explicitly attach (or detach) another brand's library as a shared source. */
  setBrandShare: (brand: string, share: string, on: boolean) => void
  /** Mark a brand a lightweight draft (sketch) or clear the flag. */
  setBrandDraft: (brand: string, draft: boolean) => void
  /** Promote a draft brand into a real brand, optionally renaming, carrying its assets. */
  promoteBrand: (draftBrand: string, realName?: string) => void

  // ---- ABM: target accounts ----
  addAccount: (brand: string, patch: Partial<Account>) => Account
  updateAccount: (brand: string, id: string, patch: Partial<Account>) => void
  setAccountStatus: (brand: string, id: string, status: AccountStatus) => void
  removeAccount: (brand: string, id: string) => void
  /** Create a target list under a brand, optionally seeded with account ids. */
  createTargetList: (brand: string, name: string, accountIds?: string[]) => TargetList
  setTargetListAccounts: (listId: string, accountIds: string[]) => void
  /** Delete a target list and detach it from any campaign that targeted it. */
  removeTargetList: (listId: string) => void
  /** Attach (or clear) the target list a campaign targets. */
  attachTargetList: (campaign: string, listId: string | null) => void
  /** The accounts a campaign targets (via its attached list). */
  accountsForCampaign: (campaign: string) => Account[]

  // ---- Saved Views (smart canvases) ----
  createSavedView: (brand: string, name: string, patch: Partial<SavedView>) => SavedView
  updateSavedView: (id: string, patch: Partial<SavedView>) => void
  deleteSavedView: (id: string) => void

  // pre-flight tracking gate (sequential, after the ICP gate)
  trackingRan: boolean
  trackingCleared: boolean
  /** Build UTMs for every row (write back to the sheet) + run presence checks. */
  generateTracking: () => Promise<void>
  /** Build UTMs for a single asset (per-row generate from the Tracking column). */
  generateTrackingForRow: (id: string) => Promise<void>
  acceptTracking: () => void

  // budget gate (paid assets only — planning: a budget must be set)
  budgetCleared: boolean
  /** Daily sync: pull actual spend back for paid assets that have a budget. */
  syncSpend: () => Promise<void>
  acceptBudget: () => void

  // comment ingest (inbound — read-only)
  /** Comments pulled back per posted row. */
  comments: Record<string, Comment[]>
  /** Row whose comments drawer is open, or null. */
  commentRowId: string | null
  openComments: (id: string | null) => void
  /** Pull comments for every published asset (read-only sync). */
  syncComments: () => Promise<void>
  /** Route an intent-y commenter to Attio as a contact (closes the loop). */
  routeCommenterToAttio: (rowId: string, commentId: string) => Promise<void>
  /** Enrich an intent commenter via Clay (company / title / fit). */
  routeToClay: (rowId: string, commentId: string) => void
  /** Campaign-level comment inbox (ingested across all posted assets). */
  commentInboxOpen: boolean
  openCommentInbox: () => void
  closeCommentInbox: () => void

  // copy review
  /** Row whose copy-review drawer is open, or null. */
  reviewRowId: string | null
  openReview: (id: string | null) => void
  /** Attach a real creative file to a planned slot (fills its media). */
  fillRowMedia: (id: string, file: File) => Promise<void>
  /** Extract the in-creative copy for a row (text body real; vision stubbed). */
  extractCopy: (id: string) => Promise<void>
  /** Toggle the "copy reviewed" sign-off for a row. */
  toggleReviewed: (id: string, value: boolean) => Promise<void>
}

/** Append one entry to the audit trail (newest first) and persist it. */
function pushAudit(
  get: () => TrafficState,
  set: (p: Partial<TrafficState>) => void,
  e: { breakId: string; action: AuditAction; summary: string; before?: string; after?: string },
): void {
  const entry: AuditEntry = { id: freshAuditId(), at: Date.now(), actor: 'You', ...e }
  const auditLog = [entry, ...get().auditLog]
  saveAuditLog(auditLog)
  set({ auditLog })
}

// Undo history — a row snapshot before each discrete sheet mutation. Module-level
// (not in state, so it never triggers a re-render) and capped to bound memory. A
// shallow row clone is enough: mutations replace nested objects, never mutate them.
const undoStack: TrafficRow[][] = []
function pushUndo(rows: TrafficRow[]): void {
  undoStack.push(rows.map((r) => ({ ...r })))
  if (undoStack.length > 30) undoStack.shift()
}

/**
 * Reconcile re-check flags on the PRODUCED/linked assets of a campaign (optionally
 * one lane) after a frame change. An editable asset just gets redrafted; a produced
 * one (welded video / static / live page) can't be, so when the new frame's proof
 * set no longer carries its claim we flag it for external rework — and clear the
 * flag again if a later change brings it back under valid proof. Idempotent.
 */
async function flagRecheckMisfits(
  get: () => TrafficState,
  campaign: string,
  newProofIds: Set<string>,
  frame: string,
  audience?: string,
): Promise<void> {
  const updates: { id: string; patch: Partial<TrafficRow> }[] = []
  for (const r of get().rows) {
    if ((r.campaign ?? '').trim() !== campaign.trim()) continue
    if (audience != null && (r.audience ?? '').trim() !== audience.trim()) continue
    if (!isLinkedExternal(r)) continue
    const ids = assetRtbIds(r)
    const misfit = ids.length > 0 && !ids.every((id) => newProofIds.has(id))
    if (misfit && !r.recheckFlag) {
      updates.push({
        id: r.id,
        patch: { recheckFlag: { reason: "Proof point doesn't carry to the new frame", frame, at: Date.now() } },
      })
    } else if (!misfit && r.recheckFlag) {
      updates.push({ id: r.id, patch: { recheckFlag: undefined } })
    }
  }
  if (updates.length) await get().updateRows(updates)
}

/**
 * Everything that makes a brand exist, swept in one pass.
 *
 * Deleting a brand used to clear six slices (client entry, profile, audiences, Drive link,
 * campaigns, sheet rows) and leave the rest behind: canvases, flights, the messaging library,
 * folders, reports, media mixes, chats, tasks, the brand record. Locally that READ as deleted,
 * because most views scope through clientList, but the orphans were still mirrored to
 * workspace_state, so a fresh device (or an incognito window) hydrated them straight back.
 *
 * Every write goes through the same save* helpers as a normal edit, so the purge propagates to
 * the workspace exactly like any other change. Returns the state patch; the caller is
 * responsible for removing the brand's sheet rows first (that side is async).
 */
function brandPurgePatch(s: TrafficState, name: string): Partial<TrafficState> {
  // Flights, chats and open tabs key off the campaign NAME, so we need name -> brand. campaignList
  // is authoritative; the runtime registry is the fallback for a campaign that only exists there
  // (registered by a builder before it was filed). Checking the list FIRST matters: campaign names
  // are a global namespace, so a stale registry entry could otherwise attribute another brand's
  // same-named campaign to this one and purge it.
  const byName = new Map(s.campaignList.map((c) => [c.name, c.client]))
  const ofBrand = (campaign?: string) => {
    if (!campaign) return false
    const filed = byName.get(campaign)
    return filed !== undefined ? filed === name : clientForCampaign(campaign) === name
  }
  const dropKey = <T,>(map: Record<string, T>): Record<string, T> => {
    const next = { ...map }
    delete next[name]
    return next
  }
  const dropCampaignKeys = <T,>(map: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(map).filter(([c]) => !ofBrand(c)))

  const clientList = s.clientList.filter((c) => c !== name)
  const campaignList = s.campaignList.filter((c) => c.client !== name)
  const canvases = s.canvases.filter((c) => c.client !== name)
  const artboards = s.artboards.filter((a) => a.client !== name)
  const reports = s.reports.filter((r) => r.client !== name)
  const pinnedInsights = s.pinnedInsights.filter((p) => p.client !== name)
  const versions = s.versions.filter((v) => v.client !== name)
  const mediaMixes = s.mediaMixes.filter((m) => m.brand !== name)
  const flights = s.flights.filter((f) => !ofBrand(f.campaign))
  const flowChats = s.flowChats.filter((c) => !ofBrand(c.flowKey))
  const openProjects = s.openProjects.filter((c) => !ofBrand(c))
  const brandRecords = s.brandRecords.filter((b) => b.name.trim() !== name)
  const driveLinks = dropKey(s.driveLinks)
  const clientProfiles = dropKey(s.clientProfiles)
  const clientAudiences = dropKey(s.clientAudiences)
  const brandSystems = dropKey(s.brandSystems)
  const brandGuides = dropKey(s.brandGuides)
  // Authorship goes with the brand. Leaving stale 'user' marks behind would make a later draft skip
  // fields for a RECREATED brand of the same name, producing blanks the review would then label as
  // the user's own words.
  const brandFieldSources = dropKey(s.brandFieldSources)
  const brandActuals = dropKey(s.brandActuals)
  const campaignFolders = dropKey(s.campaignFolders)
  const campaignConditions = dropCampaignKeys(s.campaignConditions)
  // activeCanvas is keyed "client|campaign".
  const activeCanvas = Object.fromEntries(Object.entries(s.activeCanvas).filter(([k]) => k.split('|')[0] !== name))
  // A surviving brand may still point AT the deleted one (parent / share / co-brand). Leaving those
  // dangling would make resolveBrandScope reach for a library that no longer exists.
  const brandMeta: BrandMetaMap = {}
  for (const [b, meta] of Object.entries(dropKey(s.brandMeta))) {
    const shares = meta.shares?.filter((x) => x !== name)
    const coBrand = meta.coBrand?.filter((x) => x !== name)
    brandMeta[b] = {
      ...meta,
      parent: meta.parent === name ? undefined : meta.parent,
      shares: shares?.length ? shares : undefined,
      coBrand: coBrand?.length ? coBrand : undefined,
    }
  }

  saveClients(clientList)
  saveCampaigns(campaignList)
  saveCanvases(canvases)
  saveArtboards(artboards)
  saveReports(reports)
  savePinned(pinnedInsights)
  saveVersions(versions)
  saveMediaMixes(mediaMixes)
  saveFlights(flights)
  saveFlowChats(flowChats)
  saveOpenProjects(openProjects)
  saveRecordList(BRAND_RECORDS_KEY, brandRecords)
  saveDriveLinks(driveLinks)
  saveClientProfiles(clientProfiles)
  saveClientAudiences(clientAudiences)
  saveBrandSystems(brandSystems)
  saveBrandMeta(brandMeta)
  saveBrandGuides(brandGuides)
  saveBrandFieldSources(brandFieldSources)
  saveBrandActuals(brandActuals)
  saveCampaignFolders(campaignFolders)
  saveConditions(campaignConditions)
  saveActiveCanvas(activeCanvas)

  // Tasks live in localStorage (TasksView owns them, not a store slice), and sync through the same
  // workspace mirror, so they need the same sweep or a deleted brand's to-dos come back too.
  try {
    const raw = localStorage.getItem(TASKS_KEY)
    const list: { brand?: string }[] = raw ? JSON.parse(raw) : []
    if (Array.isArray(list)) {
      const kept = list.filter((t) => (t.brand ?? '') !== name)
      if (kept.length !== list.length) {
        persistState(TASKS_KEY, kept)
        window.dispatchEvent(new Event('stoplight:tasks'))
      }
    }
  } catch {
    /* malformed or unavailable storage — nothing to sweep */
  }

  return {
    clientList, campaignList, canvases, artboards, reports, pinnedInsights, versions, mediaMixes,
    flights, flowChats, openProjects, brandRecords, driveLinks, clientProfiles, clientAudiences,
    brandSystems, brandMeta, brandGuides, brandActuals, campaignFolders, campaignConditions, activeCanvas, brandFieldSources,
  }
}

export const useTrafficStore = create<TrafficState>((set, get) => ({
  assets: [],
  rows: [],
  loading: false,
  filter: 'all',
  proofFilter: 'all',
  ctaFilter: 'all',
  audienceFilter: 'all',
  cardFilter: 'all',
  homeFilter: 'all',
  query: '',
  // A share link locks the session to its client + role from the first render.
  clientFilter: initialShare?.client ?? 'all',
  // A single-flow share also pins the campaign so the session is scoped to that one flow.
  campaignFilter: initialShare?.campaign ?? 'all',
  view: 'flow',
  perfMode: false,
  brandView: 'campaigns',
  timeRange: 'all',
  // A shared session opens on the brand's Flows (its actual work — flow / grid / calendar), not the
  // workspace home, which a stakeholder can't use anyway (they're locked to one client).
  // Campaigns (the flow canvas) is the front door: it is where the work happens and where the
  // primary chat lives. Home is a secondary dashboard now, reached from the rail. Shared sessions
  // also open straight onto the shared flow.
  page: 'flows',
  focusRecordId: null,
  recordBackTo: null,
  libraryMode: 'catalog',
  brandTab: 'about',
  brandGuides: loadBrandGuides(),
  brandFieldSources: loadBrandFieldSources(),
  readinessOpen: false,
  diagnosisOpen: false,
  askOpen: false,
  homeChatOpen: false,
  homeChatSeed: null,
  activeHomeChatId: null,
  homeChatSession: 0,
  homeChats: loadHomeChats(),
  role: initialShare?.role ?? 'owner',
  sharedSession: initialShare,
  shares: loadShares(),
  shareDialogOpen: false,
  shareDialogCampaign: null,
  versions: loadVersions(),
  historyOpen: false,
  icpOpen: false,
  personalizeOpen: false,
  savedViewsOpen: false,
  openSavedViewId: null,
  trackingChannel: null,
  drivePickerOpen: false,
  driveConnected: false,
  driveLinks: loadDriveLinks(),
  clientList: loadClients(),
  clientProfiles: loadClientProfiles(),
  brandActuals: loadBrandActuals(),
  reports: loadReports(),
  // Record lists start empty when a backend is configured (hydrateRecords fills them from the
  // workspace on sign-in), so a real user never sees the local demo seeds flash. On localStorage
  // they load/seed as before.
  companies: localDataMode ? loadCompanies() : [],
  channelRecords: localDataMode ? loadChannelRecords() : [],
  onboarding: loadOnboarding(),
  people: localDataMode ? loadPeople() : [],
  messages: localDataMode ? loadRecordList<Message>(MESSAGES_KEY) : [],
  voices: localDataMode ? loadRecordList<Voice>(VOICES_KEY) : [],
  patterns: localDataMode ? loadRecordList<Pattern>(PATTERNS_KEY) : [],
  triggers: localDataMode ? loadRecordList<Trigger>(TRIGGERS_KEY) : [],
  objectives: localDataMode ? loadRecordList<Objective>(OBJECTIVES_KEY) : [],
  libraryFolders: localDataMode ? loadRecordList<LibraryFolder>(LIBRARY_FOLDERS_KEY) : [],
  brandRecords: localDataMode ? loadOrSeedBrandRecords() : [],
  brandDatasets: loadBrandDatasets(),
  smartObjects: loadSmartObjects(),
  segments: localDataMode ? loadSegments() : [],
  mediaMixes: loadMediaMixes(),
  pinnedInsights: loadPinned(),
  actualsRefreshing: null,
  contentIngesting: null,
  contentIngest: {},
  refreshingClient: null,
  channelIngestOpen: false,
  channelIngestTarget: null,
  channelIngestStages: [],
  channelIngestResult: null,
  channelIngestError: null,
  ingestingChannel: false,
  clientAudiences: loadClientAudiences(),
  regenIds: new Set<string>(),
  brandSystems: loadBrandSystems(),
  brandMeta: loadBrandMeta(),
  brandNotice: null,
  toast: null,
  toastAction: null,
  accountsByBrand: loadJson<Record<string, Account[]>>(ACCOUNTS_KEY, {}),
  targetLists: loadJson<TargetList[]>(TARGET_LISTS_KEY, []),
  campaignTargetList: loadJson<Record<string, string>>(CAMPAIGN_TARGET_KEY, {}),
  savedViews: loadJson<SavedView[]>(SAVED_VIEWS_KEY, []),
  campaignConditions: loadConditions(),
  messagingBrand: '',
  library: emptyLibrary(),
  canvases: loadCanvases(),
  artboards: loadArtboards(),
  activeCanvas: loadActiveCanvas(),
  openProjects: loadOpenProjects(),
  openBrandTabs: [],
  openDatasetTabs: [],
  activeDatasetId: null,
  // A single-flow share opens straight into that flow (flowOpen drives FlowsView to open it).
  flowOpen: initialShare?.campaign ?? null,
  flowOpenView: 'flow',
  flowCanvasOpen: false,
  flowView: 'flow',
  flowChatCollapsed: true,
  flowAssetsOpen: false,
  sidebarCollapsed: (() => { try { return localStorage.getItem('stoplight.sidebarCollapsed') === '1' } catch { return false } })(),
  recordsChatCollapsed: (() => { try { return localStorage.getItem('stoplight.recordsChatCollapsed') === '1' } catch { return false } })(),
  flowChats: loadFlowChats(),
  campaignList: loadCampaigns(),
  campaignFolders: loadCampaignFolders(),
  flights: loadFlights(),
  // Flights are hydrated from Supabase (workspace_state) by hydrateRecords. Until that lands on a
  // backend-configured device, ensureFlights must NOT mint+persist fresh flights or it would clobber
  // the real ones. With no backend (mock/share) there's nothing to wait for, so start ready.
  flightsHydrated: localDataMode,
  campaignFolderView: null,
  wizardOpen: false,
  wizardClient: null,
  audienceWizardOpen: false,
  inviteOpen: false,
  reviewRowId: null,
  comments: {},
  commentRowId: null,
  commentInboxOpen: false,
  icp: null,
  batchReview: null,
  reviewing: false,
  drafting: false,
  gateCleared: false,
  breaksOpen: false,
  activeBreakId: null,
  breakStatus: loadBreakStatus(),
  claudeBreaks: INITIAL_COHERENCE.claudeBreaks,
  claudeBreaksScope: INITIAL_COHERENCE.claudeBreaksScope,
  coherenceBaseline: INITIAL_COHERENCE.coherenceBaseline,
  coherenceChecking: false,
  coherenceLive: INITIAL_COHERENCE.coherenceLive,
  coherenceCheckedHash: INITIAL_COHERENCE.coherenceCheckedHash,
  coherenceUnavailable: false,
  engineOpen: false,
  engineRunning: false,
  engineActions: [],
  engineSummary: '',
  engineLive: false,
  auditLog: loadAuditLog(),
  coherenceDecisions: loadCoherenceDecisions(),
  aggregateContributing: loadAggregateContributing(),
  aiModel: loadAiModel(),
  userPrefs: loadUserPrefs(),
  icpFromClosedWon: false,
  trackingRan: false,
  trackingCleared: false,
  budgetCleared: false,

  setFilter: (filter) => set({ filter }),
  setProofFilter: (proofFilter) => set({ proofFilter }),
  setCtaFilter: (ctaFilter) => set({ ctaFilter }),
  setAudienceFilter: (audienceFilter) => set({ audienceFilter }),
  setCardFilter: (cardFilter) => set({ cardFilter }),
  setOnboardingCollapsed: (collapsed) =>
    set((s) => {
      const onboarding = { ...s.onboarding, collapsed }
      saveOnboarding(onboarding)
      return { onboarding }
    }),
  dismissOnboarding: () =>
    set((s) => {
      const onboarding = { ...s.onboarding, dismissed: true }
      saveOnboarding(onboarding)
      return { onboarding }
    }),
  resetOnboarding: () =>
    set(() => {
      const onboarding = { ...DEFAULT_ONBOARDING }
      saveOnboarding(onboarding)
      return { onboarding }
    }),
  toggleOnboardingStep: (id) =>
    set((s) => {
      const has = s.onboarding.done.includes(id)
      const done = has ? s.onboarding.done.filter((x) => x !== id) : [...s.onboarding.done, id]
      const onboarding = { ...s.onboarding, done }
      saveOnboarding(onboarding)
      return { onboarding }
    }),
  markOnboardingDone: (id) =>
    set((s) => {
      if (s.onboarding.done.includes(id)) return {}
      const onboarding = { ...s.onboarding, done: [...s.onboarding.done, id] }
      saveOnboarding(onboarding)
      return { onboarding }
    }),
  setHomeFilter: (homeFilter) => set({ homeFilter }),
  setQuery: (query) => set({ query }),
  // Switching client resets the campaign scope (campaigns belong to a client).
  // A shared session is locked to its one client. Proof points, CTAs + audience
  // are campaign-scoped, so those filters reset whenever client or campaign changes.
  setClientFilter: (clientFilter) => {
    const ss = get().sharedSession
    if (ss && clientFilter !== ss.client) return
    set({ clientFilter, campaignFilter: 'all', proofFilter: 'all', ctaFilter: 'all', audienceFilter: 'all', cardFilter: 'all' })
  },
  setCampaignFilter: (campaignFilter) => set({ campaignFilter, proofFilter: 'all', ctaFilter: 'all', audienceFilter: 'all', cardFilter: 'all' }),
  setView: (view) => set({ view }),
  togglePerfMode: () => set((s) => ({ perfMode: !s.perfMode })),
  setBrandView: (brandView) => set({ brandView }),
  setTimeRange: (timeRange) => set({ timeRange }),
  // Billing and Connectors are owner-only; ignore navigation a role can't take.
  setPage: (page) => {
    const role = get().role
    if (page === 'billing' && !can(role, 'billing')) return
    if (page === 'connectors' && role !== 'owner') return
    // Ordinary nav clears any pending record back-link so a stale "← Back" never lingers.
    set({ page, recordBackTo: null })
  },
  setLibraryMode: (libraryMode) => set({ libraryMode, page: 'content' }),
  focusRecord: (focusRecordId) => set({ focusRecordId }),
  // Jump to a record that lives on another page and remember where we came from, so that page can
  // offer a "← Back" out. Sets page directly (not via setPage) so the back-link survives the nav.
  jumpToRecord: (id, page) => set((s) => ({ focusRecordId: id, page, recordBackTo: s.page === page ? null : s.page })),
  setBrandTab: (brandTab) => set({ brandTab, page: 'brand' }),
  setCampaignFolderView: (campaignFolderView) => set({ campaignFolderView }),
  setIcpOpen: (icpOpen) => set({ icpOpen }),
  setPersonalizeOpen: (personalizeOpen) => set({ personalizeOpen }),
  setSavedViewsOpen: (savedViewsOpen) => set({ savedViewsOpen }),
  setOpenSavedViewId: (openSavedViewId) => set({ openSavedViewId }),
  openTracking: (channel) => set({ trackingChannel: channel }),
  closeTracking: () => set({ trackingChannel: null }),
  setDrivePickerOpen: (drivePickerOpen) => set({ drivePickerOpen }),
  connectDrive: async () => {
    // Demo (no creds): simulate a connected account so the flow is visible.
    if (!isGoogleDriveConfigured) {
      set({ driveConnected: true })
      return
    }
    try {
      await connectGoogleDrive()
      set({ driveConnected: true })
    } catch {
      set({ driveConnected: false })
    }
  },
  importFromDrive: async () => {
    // Demo Drive (no creds) → in-app fixture modal.
    if (!isGoogleDriveConfigured) {
      set({ drivePickerOpen: true })
      return
    }
    // Real Drive → native Google Picker, same pipeline as the demo. A configured
    // user must NOT be shown the demo fixture on cancel/error (cancel now no-ops
    // via an empty result); surface real failures to the console instead.
    try {
      const files = await pickFromGoogleDrive()
      if (files.length) {
        get().addAssets(driveFilesToAssets(files))
        set({ driveConnected: true })
        if (get().page !== 'clients') set({ page: 'clients' })
      }
    } catch (e) {
      console.error('[drive] file import failed', e)
    }
  },
  importFolderFromDrive: async () => {
    // Demo Drive (no creds) → the fixture modal (its folder checkboxes stand in
    // for folder selection).
    if (!isGoogleDriveConfigured) {
      set({ drivePickerOpen: true })
      return
    }
    try {
      const files = await pickFolderFromGoogleDrive()
      if (files.length) {
        get().addAssets(driveFilesToAssets(files))
        set({ driveConnected: true })
        if (get().page !== 'clients') set({ page: 'clients' })
      }
    } catch (e) {
      console.error('[drive] folder import failed', e)
    }
  },
  ingestDriveFolderUrl: async (url) => {
    if (!url.trim()) return
    try {
      // Real Drive lists the linked folder (drive.readonly); demo ingests the
      // fixture so the flow works with no credentials.
      const files = isGoogleDriveConfigured ? await listFolderByUrl(url) : await mockDriveSource.list()
      if (files.length) {
        get().addAssets(driveFilesToAssets(files))
        set({ driveConnected: true })
      }
    } catch (e) {
      console.error('[drive] folder ingest failed', e)
    }
  },
  setDriveLink: (client, url) =>
    set((s) => {
      const driveLinks = { ...s.driveLinks }
      if (url.trim()) driveLinks[client] = url.trim()
      else delete driveLinks[client]
      saveDriveLinks(driveLinks)
      return { driveLinks }
    }),
  ingestDriveLink: async (client) => {
    const url = get().driveLinks[client]
    if (!url) return
    await get().ingestDriveFolderUrl(url)
    // Scope to the client so the freshly-ingested assets show in its workspace.
    set({ clientFilter: client })
  },
  addClient: (name) =>
    set((s) => {
      const n = name.trim()
      if (!n || s.clientList.includes(n)) return {}
      const clientList = [...s.clientList, n]
      saveClients(clientList)
      return { clientList }
    }),
  setClientProfile: (name, profile) =>
    set((s) => {
      const n = name.trim()
      if (!n) return {}
      const clientProfiles = { ...s.clientProfiles, [n]: { ...s.clientProfiles[n], ...profile } }
      saveClientProfiles(clientProfiles)
      return { clientProfiles }
    }),

  removeClientProfile: (name) =>
    set((s) => {
      if (!(name in s.clientProfiles)) return {}
      const clientProfiles = { ...s.clientProfiles }
      delete clientProfiles[name]
      saveClientProfiles(clientProfiles)
      return { clientProfiles }
    }),

  setBrandActuals: (brand, data) =>
    set((s) => {
      const n = brand.trim()
      if (!n) return {}
      const brandActuals = { ...s.brandActuals, [n]: data }
      saveBrandActuals(brandActuals)
      setBrandCalibration(n, reachByChannelFromActuals(data))
      // Append this pull to the metrics time-series (once per brand per day).
      if (snapshotOncePerDay(n)) void appendSnapshots(snapshotsFromActuals(n, data, new Date().toISOString()))
      return { brandActuals }
    }),

  addReport: (input) => {
    const id = `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const report: BrandReport = {
      id,
      client: input.client.trim(),
      title: input.title.trim() || 'Untitled report',
      kind: input.kind,
      summary: input.summary?.trim() || undefined,
      html: input.html,
      createdAt: Date.now(),
    }
    set((s) => {
      const reports = [report, ...s.reports]
      saveReports(reports)
      return { reports }
    })
    return id
  },

  deleteReport: (id) =>
    set((s) => {
      const reports = s.reports.filter((r) => r.id !== id)
      saveReports(reports)
      return { reports }
    }),

  addCompany: (partial) => {
    const id = freshCompanyId()
    const company: Company = { name: 'New company', ...(partial ?? {}), id }
    set((s) => {
      const companies = [company, ...s.companies]
      saveCompanies(companies)
      return { companies }
    })
    return id
  },

  updateCompany: (id, patch) =>
    set((s) => {
      const companies = s.companies.map((c) => (c.id === id ? { ...c, ...patch } : c))
      saveCompanies(companies)
      return { companies }
    }),

  deleteCompany: (id) =>
    set((s) => {
      const companies = s.companies.filter((c) => c.id !== id)
      saveCompanies(companies)
      return { companies }
    }),

  addChannelRecord: (partial) => {
    const id = freshChannelRecordId()
    const rec: ChannelRecord = { name: 'New channel', ...(partial ?? {}), id }
    set((s) => {
      const channelRecords = [rec, ...s.channelRecords]
      saveChannelRecords(channelRecords)
      return { channelRecords }
    })
    return id
  },

  updateChannelRecord: (id, patch) =>
    set((s) => {
      const channelRecords = s.channelRecords.map((c) => (c.id === id ? { ...c, ...patch } : c))
      saveChannelRecords(channelRecords)
      return { channelRecords }
    }),

  deleteChannelRecord: (id) =>
    set((s) => {
      const channelRecords = s.channelRecords.filter((c) => c.id !== id)
      saveChannelRecords(channelRecords)
      return { channelRecords }
    }),

  addPerson: (partial) => {
    const id = freshPersonId()
    const person: Person = { name: 'New person', ...(partial ?? {}), id }
    set((s) => {
      const people = [person, ...s.people]
      savePeople(people)
      return { people }
    })
    return id
  },

  updatePerson: (id, patch) =>
    set((s) => {
      const people = s.people.map((p) => (p.id === id ? { ...p, ...patch } : p))
      savePeople(people)
      return { people }
    }),

  deletePerson: (id) =>
    set((s) => {
      const people = s.people.filter((p) => p.id !== id)
      savePeople(people)
      return { people }
    }),

  addMessage: (partial) => {
    const id = freshMessageId()
    const row: Message = { name: 'New message', ...(partial ?? {}), id }
    set((s) => {
      const messages = [row, ...s.messages]
      saveRecordList(MESSAGES_KEY, messages)
      return { messages }
    })
    return id
  },
  updateMessage: (id, patch) =>
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m))
      saveRecordList(MESSAGES_KEY, messages)
      return { messages }
    }),
  deleteMessage: (id) =>
    set((s) => {
      const messages = s.messages.filter((m) => m.id !== id)
      saveRecordList(MESSAGES_KEY, messages)
      return { messages }
    }),

  addVoice: (partial) => {
    const id = freshVoiceId()
    const row: Voice = { name: 'New voice', status: 'draft', ...(partial ?? {}), id }
    set((s) => {
      const voices = [row, ...s.voices]
      saveRecordList(VOICES_KEY, voices)
      return { voices }
    })
    return id
  },
  updateVoice: (id, patch) =>
    set((s) => {
      const voices = s.voices.map((v) => (v.id === id ? { ...v, ...patch } : v))
      saveRecordList(VOICES_KEY, voices)
      return { voices }
    }),
  deleteVoice: (id) =>
    set((s) => {
      const voices = s.voices.filter((v) => v.id !== id)
      saveRecordList(VOICES_KEY, voices)
      return { voices }
    }),

  addPattern: (partial) => {
    const id = freshPatternId()
    const row: Pattern = { name: 'New pattern', status: 'active', ...(partial ?? {}), id }
    set((s) => {
      const patterns = [row, ...s.patterns]
      saveRecordList(PATTERNS_KEY, patterns)
      return { patterns }
    })
    return id
  },
  updatePattern: (id, patch) =>
    set((s) => {
      const patterns = s.patterns.map((p) => (p.id === id ? { ...p, ...patch } : p))
      saveRecordList(PATTERNS_KEY, patterns)
      return { patterns }
    }),
  deletePattern: (id) =>
    set((s) => {
      const patterns = s.patterns.filter((p) => p.id !== id)
      saveRecordList(PATTERNS_KEY, patterns)
      return { patterns }
    }),

  addTrigger: (partial) => {
    const id = freshTriggerId()
    const row: Trigger = { name: 'New trigger', status: 'draft', ...(partial ?? {}), id }
    set((s) => {
      const triggers = [row, ...s.triggers]
      saveRecordList(TRIGGERS_KEY, triggers)
      return { triggers }
    })
    return id
  },
  updateTrigger: (id, patch) =>
    set((s) => {
      const triggers = s.triggers.map((t) => (t.id === id ? { ...t, ...patch } : t))
      saveRecordList(TRIGGERS_KEY, triggers)
      return { triggers }
    }),
  deleteTrigger: (id) =>
    set((s) => {
      const triggers = s.triggers.filter((t) => t.id !== id)
      saveRecordList(TRIGGERS_KEY, triggers)
      return { triggers }
    }),

  addObjective: (partial) => {
    const id = freshObjectiveId()
    const row: Objective = { name: 'New objective', ...(partial ?? {}), id }
    set((s) => {
      const objectives = [row, ...s.objectives]
      saveRecordList(OBJECTIVES_KEY, objectives)
      return { objectives }
    })
    return id
  },
  updateObjective: (id, patch) =>
    set((s) => {
      const objectives = s.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o))
      saveRecordList(OBJECTIVES_KEY, objectives)
      return { objectives }
    }),
  deleteObjective: (id) =>
    set((s) => {
      const objectives = s.objectives.filter((o) => o.id !== id)
      saveRecordList(OBJECTIVES_KEY, objectives)
      return { objectives }
    }),

  addLibraryFolder: (brand, name, kind = 'competitor') => {
    const id = freshFolderId()
    const folder: LibraryFolder = { id, brand, name: name.trim() || 'New folder', kind, createdAt: Date.now(), items: [] }
    set((s) => {
      const libraryFolders = [...s.libraryFolders, folder]
      saveRecordList(LIBRARY_FOLDERS_KEY, libraryFolders)
      return { libraryFolders }
    })
    return id
  },
  renameLibraryFolder: (id, name) =>
    set((s) => {
      const libraryFolders = s.libraryFolders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f))
      saveRecordList(LIBRARY_FOLDERS_KEY, libraryFolders)
      return { libraryFolders }
    }),
  deleteLibraryFolder: (id) =>
    set((s) => {
      const libraryFolders = s.libraryFolders.filter((f) => f.id !== id)
      saveRecordList(LIBRARY_FOLDERS_KEY, libraryFolders)
      return { libraryFolders }
    }),
  addLibraryFolderItems: (folderId, items) => {
    const folder = get().libraryFolders.find((f) => f.id === folderId)
    if (!folder) return 0
    // Skip URLs already filed here, so re-pasting never duplicates.
    const seen = new Set(folder.items.map((i) => (i.url ?? '').trim().toLowerCase()).filter(Boolean))
    const next: LibraryFolderItem[] = []
    for (const it of items) {
      const url = (it.url ?? '').trim()
      const key = url.toLowerCase()
      if (url && seen.has(key)) continue
      const title = (it.title ?? '').trim() || (url ? titleFromUrl(url) : 'Untitled item')
      next.push({
        id: freshFolderItemId(),
        title,
        channel: it.channel ?? (url ? channelFromUrl(url) : undefined),
        url: url || undefined,
        copy: (it.copy ?? '').trim() || undefined,
        addedAt: Date.now(),
      })
      if (url) seen.add(key)
    }
    if (!next.length) return 0
    set((s) => {
      const libraryFolders = s.libraryFolders.map((f) => (f.id === folderId ? { ...f, items: [...next, ...f.items] } : f))
      saveRecordList(LIBRARY_FOLDERS_KEY, libraryFolders)
      return { libraryFolders }
    })
    return next.length
  },
  removeLibraryFolderItem: (folderId, itemId) =>
    set((s) => {
      const libraryFolders = s.libraryFolders.map((f) =>
        f.id === folderId ? { ...f, items: f.items.filter((i) => i.id !== itemId) } : f,
      )
      saveRecordList(LIBRARY_FOLDERS_KEY, libraryFolders)
      return { libraryFolders }
    }),

  addBrandRecord: (partial) => {
    const id = freshBrandRecordId()
    const row: BrandRecord = { name: 'New brand', status: 'active', ...(partial ?? {}), id }
    set((s) => {
      const brandRecords = [row, ...s.brandRecords]
      saveRecordList(BRAND_RECORDS_KEY, brandRecords)
      return { brandRecords }
    })
    return id
  },
  updateBrandRecord: (id, patch) =>
    set((s) => {
      const brandRecords = s.brandRecords.map((b) => (b.id === id ? { ...b, ...patch } : b))
      saveRecordList(BRAND_RECORDS_KEY, brandRecords)
      const rec = brandRecords.find((b) => b.id === id)
      const name = rec?.name.trim() ?? ''
      // A named brand becomes a real workspace client, with its industry/website mirrored to the
      // client profile so Flows / Library / Insights can bind to it. (Placeholder rows don't sync.)
      if (!rec || !name || name === 'New brand') return { brandRecords }
      const clientList = s.clientList.includes(name) ? s.clientList : [...s.clientList, name]
      // Mirror ONLY the keys this patch actually carries. Mirroring them unconditionally read the
      // merged record, which has no website when the URL was written to the profile instead (the
      // guided setup does exactly that), so any unrelated patch nulled it. Drafting the strategy
      // patches other fields entirely, and silently deleted the website the user had just typed.
      // A truthiness guard is NOT the fix: clearing the cell in the Brand sheet must still clear
      // the profile, and by then the merged record already holds ''.
      const mirrored: Partial<ClientProfile> = {
        ...('industry' in patch ? { industry: rec.industry || undefined } : {}),
        ...('website' in patch ? { website: rec.website || undefined } : {}),
      }
      const clientProfiles = Object.keys(mirrored).length
        ? { ...s.clientProfiles, [name]: { ...s.clientProfiles[name], ...mirrored } }
        : s.clientProfiles
      saveClients(clientList)
      saveClientProfiles(clientProfiles)
      return { brandRecords, clientList, clientProfiles }
    }),
  deleteBrandRecord: (id) =>
    set((s) => {
      const brandRecords = s.brandRecords.filter((b) => b.id !== id)
      saveRecordList(BRAND_RECORDS_KEY, brandRecords)
      return { brandRecords }
    }),

  addSmartObject: (brand, name, refs) => {
    const id = freshSmartObjectId()
    set((s) => {
      const smartObjects = [...s.smartObjects, { id, brand, name, kind: kindForRefs(refs), refs }]
      saveSmartObjects(smartObjects)
      return { smartObjects }
    })
    return id
  },
  updateSmartObject: (id, patch) =>
    set((s) => {
      const smartObjects = s.smartObjects.map((o) =>
        // Re-derive the kind whenever the contents change, so an object built around a contact
        // stops being offered by a Person card if the contact is removed.
        o.id === id ? { ...o, ...patch, kind: patch.refs ? kindForRefs(patch.refs, o.kind) : o.kind } : o,
      )
      saveSmartObjects(smartObjects)
      return { smartObjects }
    }),
  deleteSmartObject: (id) =>
    set((s) => {
      const smartObjects = s.smartObjects.filter((o) => o.id !== id)
      saveSmartObjects(smartObjects)
      return { smartObjects }
    }),

  addBrandDataset: (brand, name) => {
    const ds = blankDataset(brand, name ?? 'Untitled data set')
    set((s) => {
      const brandDatasets = [...s.brandDatasets, ds]
      saveBrandDatasets(brandDatasets)
      return { brandDatasets }
    })
    return ds.id
  },
  renameBrandDataset: (id, name) =>
    set((s) => {
      const brandDatasets = s.brandDatasets.map((d) => (d.id === id ? { ...d, name } : d))
      saveBrandDatasets(brandDatasets)
      return { brandDatasets }
    }),
  deleteBrandDataset: (id) =>
    set((s) => {
      const brandDatasets = s.brandDatasets.filter((d) => d.id !== id)
      saveBrandDatasets(brandDatasets)
      return { brandDatasets }
    }),
  setDatasetCell: (id, row, col, value) =>
    set((s) => {
      const brandDatasets = s.brandDatasets.map((d) => {
        if (d.id !== id) return d
        const rows = d.rows.map((r, ri) =>
          ri === row ? Array.from({ length: d.columns.length }, (_, ci) => (ci === col ? value : r[ci] ?? '')) : r,
        )
        return { ...d, rows }
      })
      saveBrandDatasets(brandDatasets)
      return { brandDatasets }
    }),
  setDatasetColumn: (id, col, label) =>
    set((s) => {
      const brandDatasets = s.brandDatasets.map((d) =>
        d.id === id ? { ...d, columns: d.columns.map((c, ci) => (ci === col ? label : c)) } : d,
      )
      saveBrandDatasets(brandDatasets)
      return { brandDatasets }
    }),
  addDatasetRow: (id) =>
    set((s) => {
      const brandDatasets = s.brandDatasets.map((d) =>
        d.id === id ? { ...d, rows: [...d.rows, Array.from({ length: d.columns.length }, () => '')] } : d,
      )
      saveBrandDatasets(brandDatasets)
      return { brandDatasets }
    }),
  addDatasetColumn: (id) =>
    set((s) => {
      const brandDatasets = s.brandDatasets.map((d) =>
        d.id === id
          ? { ...d, columns: [...d.columns, `Column ${d.columns.length + 1}`], rows: d.rows.map((r) => [...r, '']) }
          : d,
      )
      saveBrandDatasets(brandDatasets)
      return { brandDatasets }
    }),

  addSegment: (partial) => {
    const id = freshSegmentId()
    const segment: Segment = { name: 'New segment', ...(partial ?? {}), id }
    set((s) => {
      const segments = [segment, ...s.segments]
      saveSegments(segments)
      return { segments }
    })
    return id
  },

  updateSegment: (id, patch) =>
    set((s) => {
      const segments = s.segments.map((x) => (x.id === id ? { ...x, ...patch } : x))
      saveSegments(segments)
      return { segments }
    }),

  deleteSegment: (id) =>
    set((s) => {
      const segments = s.segments.filter((x) => x.id !== id)
      saveSegments(segments)
      return { segments }
    }),

  addMediaMix: (brand) => {
    const id = `mix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const n = get().mediaMixes.filter((m) => m.brand === brand).length + 1
    const mix: MediaMix = { id, brand, name: `Plan ${n}`, goal: 'reach', budget: 50000, risk: 'balanced', overrides: {} }
    const mediaMixes = [...get().mediaMixes, mix]
    saveMediaMixes(mediaMixes)
    set({ mediaMixes })
    return id
  },
  updateMediaMix: (id, patch) =>
    set((s) => {
      const mediaMixes = s.mediaMixes.map((m) => (m.id === id ? { ...m, ...patch } : m))
      saveMediaMixes(mediaMixes)
      return { mediaMixes }
    }),
  deleteMediaMix: (id) =>
    set((s) => {
      const mediaMixes = s.mediaMixes.filter((m) => m.id !== id)
      saveMediaMixes(mediaMixes)
      return { mediaMixes }
    }),

  addPinnedInsight: (input) => {
    const id = `pin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const pin: PinnedInsight = {
      id,
      client: input.client.trim(),
      text: input.text.trim(),
      note: input.note?.trim() || undefined,
      sourceReportId: input.sourceReportId,
      sourceTitle: input.sourceTitle?.trim() || undefined,
      createdAt: Date.now(),
    }
    set((s) => {
      const pinnedInsights = [pin, ...s.pinnedInsights]
      savePinned(pinnedInsights)
      return { pinnedInsights }
    })
    return id
  },

  removePinnedInsight: (id) =>
    set((s) => {
      const pinnedInsights = s.pinnedInsights.filter((p) => p.id !== id)
      savePinned(pinnedInsights)
      return { pinnedInsights }
    }),

  autoTagAudiences: async (brand) => {
    const sys = get().brandSystems[brand]
    if (!sys || !sys.audiences.length) return 0
    const auds = sys.audiences
    const updates: { id: string; patch: Partial<TrafficRow> }[] = []
    for (const r of get().rows) {
      if (clientForCampaign(r.campaign) !== brand) continue
      if ((r.audience ?? '').trim()) continue // never overwrite an existing tag
      const copy = Object.values(r.messaging ?? {})
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
      if (!copy.trim()) continue
      const name = classifyRowAudience(copy, auds)
      if (name) updates.push({ id: r.id, patch: { audience: name } })
    }
    if (updates.length) await get().updateRows(updates)
    return updates.length
  },

  reconcileActuals: async (brand) => {
    const rows = get().rows
    const posted = rows.filter((r) => r.status === 'posted' && r.socialMetrics)
    const byUrl = new Map<string, TrafficRow>()
    const byCopy = new Map<string, TrafficRow>()
    for (const p of posted) {
      if (p.sourceUrl) byUrl.set(p.sourceUrl, p)
      const k = rowCopyKey(p)
      if (k) byCopy.set(k, p)
    }
    const updates: { id: string; patch: Partial<TrafficRow> }[] = []
    for (const r of rows) {
      if (clientForCampaign(r.campaign) !== brand) continue
      if (!isPlannedCard(r) || typeof r.reconciledAt === 'number') continue
      const match = (r.sourceUrl && byUrl.get(r.sourceUrl)) || byCopy.get(rowCopyKey(r))
      if (!match || !match.socialMetrics) continue
      updates.push({
        id: r.id,
        patch: {
          socialMetrics: match.socialMetrics,
          engagement: match.engagement,
          postedAt: match.postedAt,
          metricsUpdatedAt: match.metricsUpdatedAt ?? Date.now(),
          reconciledAt: Date.now(),
          sourceUrl: r.sourceUrl ?? match.sourceUrl,
        },
      })
    }
    if (updates.length) await get().updateRows(updates)
    // Append the freshly-measured assets to the metrics time-series (the per-persona signal).
    if (updates.length) {
      const byId = new Map(get().rows.map((r) => [r.id, r]))
      const reconciled = updates.map((u) => byId.get(u.id)).filter((r): r is TrafficRow => !!r?.socialMetrics)
      void appendSnapshots(snapshotsFromAssets(brand, reconciled, new Date().toISOString()))
      void get().contributeAggregate() // refresh the cross-customer pool (self-gates on opt-in)
    }
    return updates.length
  },

  refreshActuals: async (brand) => {
    const n = brand.trim()
    if (!n || get().actualsRefreshing) return
    set({ actualsRefreshing: n })
    try {
      const s = get()
      const website = (s.clientProfiles[n]?.website || s.brandRecords.find((b) => b.name === n)?.website || '').trim() || undefined
      const workspaceId = (await getActiveWorkspaceId()) || undefined
      const data = await actualsProvider.fetch(n, { workspaceId, website })
      if (data) get().setBrandActuals(n, data)
    } finally {
      set({ actualsRefreshing: null })
    }
  },

  ingestContent: async (brand) => {
    const n = brand.trim()
    if (!n || get().contentIngesting) return
    set({ contentIngesting: n })
    try {
      // One backfill campaign holds the brand's whole published body of work. Each
      // source's batch flows through importAssets with its own source tag, deduping
      // on its own (by URL, else copy). Sources are additive: the snapshot provider
      // (YouTube / LinkedIn), then any live server-held source (Neon).
      const totals = { imported: 0, updated: 0, skipped: 0 }
      const sources: string[] = []
      const add = (r: { imported: number; updated: number; skipped: number }, label: string) => {
        totals.imported += r.imported
        totals.updated += r.updated
        totals.skipped += r.skipped
        if (!sources.includes(label)) sources.push(label)
      }

      const batches = (await contentProvider.fetch(n)) ?? []
      for (const b of batches) {
        add(await get().importAssets(n, CONTENT_LIBRARY_CAMPAIGN, b.items, b.source), b.sourceLabel)
      }

      // Site pages via Search Console: every ranking page of the brand's site plus its real search
      // metrics (impressions / clicks), when the workspace has a Google connection. Falls back to the
      // sitemap when GSC is not connected. This is why connecting GA4 + Search Console fills the Library.
      try {
        const website = (get().clientProfiles[n]?.website || get().brandRecords.find((b) => b.name === n)?.website || '').trim()
        if (website) {
          const ws = (await getActiveWorkspaceId()) || undefined
          const siteItems = await ingestSite(website, { brand: n, workspace: ws })
          if (siteItems.length) add(await get().importAssets(n, CONTENT_LIBRARY_CAMPAIGN, siteItems, 'site'), 'Search Console')
        }
      } catch {
        /* no site / no GSC, leave it out of this pull */
      }

      // Neon (NeonCRM) published assets — pulled server-side with the .env key.
      // Skips silently when Neon isn't configured (NO_KEY) or unreachable, so the
      // pull never fails on an unconnected source.
      try {
        const neon = await ingestNeonStream({ brand: n })
        if (neon.items.length) {
          add(await get().importAssets(n, CONTENT_LIBRARY_CAMPAIGN, neon.items as unknown as Record<string, unknown>[], 'site'), 'Neon')
        }
      } catch {
        /* Neon not configured / unreachable — leave it out of this pull. */
      }

      // YouTube transcripts — scraped from the browser transcript panel into a committed
      // snapshot (YouTube blocks API/server access), attached to their video assets by id.
      try {
        const res = await fetch('/ww-transcripts.json', { cache: 'no-store' })
        if (res.ok) {
          const map = (await res.json()) as Record<string, { text?: string }>
          const ytRows = get().rows.filter(
            (r) => (r.campaign ?? '').trim() === CONTENT_LIBRARY_CAMPAIGN && r.channel === 'youtube',
          )
          for (const r of ytRows) {
            const id = /[?&]v=([^&]+)/.exec(r.sourceUrl ?? '')?.[1]
            const text = id ? map[id]?.text : undefined
            if (text && r.messaging?.transcript !== text) {
              await get().updateRow(r.id, { messaging: { ...r.messaging, transcript: text } })
            }
          }
        }
      } catch {
        /* No transcripts snapshot yet — YouTube cards keep title + metrics only. */
      }

      set((s) => ({
        contentIngest: { ...s.contentIngest, [n]: { at: Date.now(), ...totals, sources } },
      }))
    } finally {
      set({ contentIngesting: null })
    }
  },

  openReadiness: () => set({ readinessOpen: true }),
  closeReadiness: () => set({ readinessOpen: false }),
  openDiagnosis: () => set({ diagnosisOpen: true }),
  closeDiagnosis: () => set({ diagnosisOpen: false }),
  openAsk: (seed) => set({ askOpen: true, askSeed: seed }),
  closeAsk: () => set({ askOpen: false, askSeed: undefined }),
  // A seeded question always starts a NEW conversation (clear the active saved id) and bumps the
  // session so the chat remounts fresh rather than continuing whatever thread was last open.
  // The assistant is a companion, not a page: opening it overlays wherever you are and never
  // navigates. (It used to force page:'portfolio', so summoning the chat teleported you to Home.)
  openHomeChat: (q) =>
    set((s) => ({ homeChatOpen: true, homeChatSeed: q, activeHomeChatId: null, homeChatSession: s.homeChatSession + 1 })),
  closeHomeChat: () => set({ homeChatOpen: false, homeChatSeed: null }),
  newHomeChat: () =>
    set((s) => ({ homeChatOpen: true, homeChatSeed: null, activeHomeChatId: null, homeChatSession: s.homeChatSession + 1 })),
  openSavedHomeChat: (id) =>
    set((s) => ({ homeChatOpen: true, homeChatSeed: null, activeHomeChatId: id, homeChatSession: s.homeChatSession + 1 })),
  saveHomeChat: (chat) =>
    set((s) => {
      const rest = s.homeChats.filter((c) => c.id !== chat.id)
      const homeChats = [chat, ...rest].sort((a, b) => b.updatedAt - a.updatedAt)
      saveHomeChats(homeChats)
      return { homeChats }
    }),
  deleteHomeChat: (id) =>
    set((s) => {
      const homeChats = s.homeChats.filter((c) => c.id !== id)
      saveHomeChats(homeChats)
      // Closing the one you're viewing drops you back to a fresh chat.
      const clearing = s.activeHomeChatId === id
      return clearing ? { homeChats, activeHomeChatId: null } : { homeChats }
    }),
  openShareDialog: (campaign) => set({ shareDialogOpen: true, shareDialogCampaign: campaign || null }),
  closeShareDialog: () => set({ shareDialogOpen: false }),
  createShare: (client, role, campaign) => {
    const grant: ShareGrant = {
      id: `shr_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      client,
      role,
      campaign: campaign || undefined,
      createdAt: new Date().toISOString(),
    }
    const shares = [grant, ...get().shares]
    saveShares(shares)
    set({ shares })
    // Publish a read-only snapshot (whole brand, or scoped to one flow) so the link is viewable
    // with no account. Built from the live store state (rows/records live there, not localStorage).
    void publishShareSnapshot(get(), client, role, grant.id, grant.campaign)
    return grant
  },
  revokeShare: (id) => {
    const shares = get().shares.filter((s) => s.id !== id)
    saveShares(shares)
    set({ shares })
  },
  exitSharedSession: () => {
    // Strip ?share= and return to the owner's full view.
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('share')
      window.history.replaceState({}, '', url.toString())
    } catch {
      /* ignore */
    }
    set({ sharedSession: null, role: 'owner', clientFilter: 'all', campaignFilter: 'all', page: 'clients' })
  },
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
  saveVersion: (label) => {
    const { rows, clientFilter, versions } = get()
    if (clientFilter === 'all') return
    const scoped = rows.filter((r) =>
      rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter: 'all' }),
    )
    if (scoped.length === 0) return
    const snap = snapshotRows(scoped)
    const prior = versions.filter((v) => v.client === clientFilter)
    const changed = diffChanged(prior[0]?.rows ?? null, snap)
    const isBaseline = prior.length === 0
    const summary = diffSummary(changed, isBaseline)
    const version: CampaignVersion = {
      id: `ver_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      client: clientFilter,
      label: label?.trim() || summary,
      author: currentAuthor(),
      ts: Date.now(),
      rows: snap,
      summary,
    }
    const next = [version, ...versions]
    saveVersions(next)
    set({ versions: next })
  },
  restoreVersion: async (id) => {
    const v = get().versions.find((x) => x.id === id)
    if (!v) return
    for (const r of v.rows) await sheet.update(r.id, { messaging: { ...r.messaging } })
    await get().refresh()
  },
  markBrandFields: (brand, fields, source) =>
    set((s) => {
      const b = brand.trim()
      if (!b || !fields.length) return {}
      const forBrand = { ...(s.brandFieldSources[b] ?? {}) }
      // A field the user has claimed stays theirs. A later draft cannot quietly take it back by
      // writing over it, which is the whole point of tracking this.
      for (const f of fields) if (source === 'user' || forBrand[f] !== 'user') forBrand[f] = source
      const brandFieldSources = { ...s.brandFieldSources, [b]: forBrand }
      saveBrandFieldSources(brandFieldSources)
      return { brandFieldSources }
    }),
  userOwnedBrandFields: (brand) => {
    const map = get().brandFieldSources[brand.trim()] ?? {}
    return new Set(Object.keys(map).filter((k) => map[k] === 'user'))
  },
  renameBrandFieldSources: (from, to) =>
    set((s) => {
      const a = from.trim()
      const b = to.trim()
      if (!a || !b || a === b || !s.brandFieldSources[a]) return {}
      const brandFieldSources = { ...s.brandFieldSources, [b]: { ...(s.brandFieldSources[b] ?? {}), ...s.brandFieldSources[a] } }
      delete brandFieldSources[a]
      saveBrandFieldSources(brandFieldSources)
      return { brandFieldSources }
    }),
  generateBrandGuide: (client) =>
    set((s) => {
      const n = client.trim()
      if (!n) return {}
      const guide = draftBrandGuide(n, s.clientProfiles[n])
      const brandGuides = { ...s.brandGuides, [n]: { guide, confirmed: false } }
      saveBrandGuides(brandGuides)
      return { brandGuides }
    }),
  updateBrandGuide: (client, patch) =>
    set((s) => {
      const cur = s.brandGuides[client]
      if (!cur) return {}
      const brandGuides = { ...s.brandGuides, [client]: { ...cur, guide: { ...cur.guide, ...patch } } }
      saveBrandGuides(brandGuides)
      return { brandGuides }
    }),
  confirmBrandGuide: (client) =>
    set((s) => {
      const cur = s.brandGuides[client]
      if (!cur) return {}
      const brandGuides = { ...s.brandGuides, [client]: { ...cur, confirmed: true } }
      saveBrandGuides(brandGuides)
      return { brandGuides }
    }),
  setClientAudiences: (name, audiences) =>
    set((s) => {
      const n = name.trim()
      if (!n) return {}
      const clientAudiences = { ...s.clientAudiences, [n]: audiences }
      saveClientAudiences(clientAudiences)
      return { clientAudiences }
    }),

  setMessagingBrand: (brand) =>
    set((s) => ({ messagingBrand: brand, library: libFor(s.brandSystems, brand) })),
  addLibraryItem: (kind, item) =>
    set((s) => activeLibPatch(s, (lib) => ({ ...lib, [kind]: [...(lib[kind] as unknown[]), item] }) as MessagingLibrary)),
  setAudienceAliases: (brand, aliasesById) =>
    set((s) => {
      const b = brand.trim()
      if (!b) return {}
      const lib = libFor(s.brandSystems, b)
      const audiences = lib.audiences.map((a) => (aliasesById[a.id] ? { ...a, aliases: aliasesById[a.id] } : a))
      const nextLib = { ...lib, audiences }
      const brandSystems = { ...s.brandSystems, [b]: nextLib }
      saveBrandSystems(brandSystems)
      return { brandSystems, ...(s.messagingBrand === b ? { library: nextLib } : {}) }
    }),
  addBrandProof: (brand, rtb) =>
    set((s) => {
      const b = brand.trim()
      if (!b) return {}
      const lib = libFor(s.brandSystems, b)
      const nextLib = { ...lib, rtbs: [...lib.rtbs, rtb] }
      const brandSystems = { ...s.brandSystems, [b]: nextLib }
      saveBrandSystems(brandSystems)
      return { brandSystems, ...(s.messagingBrand === b ? { library: nextLib } : {}) }
    }),
  resetBrandMessaging: (brand) =>
    set((s) => {
      const b = brand.trim()
      if (!b) return {}
      const brandSystems = { ...s.brandSystems, [b]: emptyLibrary() }
      saveBrandSystems(brandSystems)
      return { brandSystems, library: s.messagingBrand === b ? brandSystems[b] : s.library }
    }),
  removeLibraryItem: (kind, id) =>
    set((s) =>
      activeLibPatch(s, (lib) => {
        const idKey = kind === 'strategies' ? 'key' : 'id'
        const list = (lib[kind] as { id?: string; key?: string }[]).filter(
          (x) => (x as Record<string, string>)[idKey] !== id,
        )
        return { ...lib, [kind]: list } as MessagingLibrary
      }),
    ),
  updateLibraryItem: (kind, id, patch) =>
    set((s) =>
      activeLibPatch(s, (lib) => {
        const idKey = kind === 'strategies' ? 'key' : 'id'
        const list = (lib[kind] as unknown as Record<string, unknown>[]).map((x) =>
          (x as Record<string, string>)[idKey] === id ? { ...x, ...patch } : x,
        )
        return { ...lib, [kind]: list } as MessagingLibrary
      }),
    ),
  approveLibraryItem: (kind, id) =>
    set((s) =>
      activeLibPatch(s, (lib) => {
        const list = (lib[kind] as { id: string; approved?: boolean }[]).map((x) =>
          x.id === id ? { ...x, approved: true } : x,
        )
        return { ...lib, [kind]: list } as MessagingLibrary
      }),
    ),
  editLibrarySubject: (id, text) => {
    const next = text.trim()
    const s = get()
    const master = libFor(s.brandSystems, s.messagingBrand).subjects.find((x) => x.id === id)
    const oldText = master?.text?.trim() ?? ''
    if (!next || !master || next === oldText) return 0
    // Update the master in the viewed brand's system.
    const { brandSystems, library } = activeLibPatch(s, (lib) => ({
      ...lib,
      subjects: lib.subjects.map((x) => (x.id === id ? { ...x, text: next } : x)),
    }))
    // Propagate to instances: every campaign carrying the old subject text follows
    // the master to the new text (master→instance).
    const touched = s.campaignList.filter((c) => (c.subject ?? '').trim() === oldText)
    let campaignList = s.campaignList
    if (oldText && touched.length) {
      campaignList = s.campaignList.map((c) => ((c.subject ?? '').trim() === oldText ? { ...c, subject: next } : c))
      saveCampaigns(campaignList)
    }
    set({ brandSystems, library, campaignList })
    return oldText ? touched.length : 0
  },
  editLibraryHook: (id, text) =>
    set((s) => {
      const next = text.trim()
      if (!next) return {}
      return activeLibPatch(s, (lib) => ({ ...lib, hooks: lib.hooks.map((x) => (x.id === id ? { ...x, text: next } : x)) }))
    }),
  useLibraryAudience: (client, audienceId) =>
    set((s) => {
      const c = client.trim()
      const src = s.library.audiences.find((a) => a.id === audienceId)
      if (!c || !src) return {}
      // Clone with a fresh id so foundation edits don't mutate the library copy.
      const clone = normalizeAudience({ ...src, id: freshAudienceId() })
      const clientAudiences = { ...s.clientAudiences, [c]: [...(s.clientAudiences[c] ?? []), clone] }
      saveClientAudiences(clientAudiences)
      return { clientAudiences }
    }),
  saveAudienceToLibrary: (audience) =>
    set((s) => {
      const clone = normalizeAudience({
        ...audience,
        id: `laud_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`,
      })
      return activeLibPatch(s, (lib) => ({ ...lib, audiences: [...lib.audiences, clone] }))
    }),
  deleteClient: async (name) => {
    // Remove the client's rows from the sheet.
    const ids = get()
      .rows.filter((r) => clientForCampaign(r.campaign) === name)
      .map((r) => r.id)
    for (const id of ids) await sheet.remove(id)
    // Then sweep every other trace of the brand (see brandPurgePatch).
    set((s) => {
      const next = brandPurgePatch(s, name)
      // If we're scoped into the client being deleted, pop back to the overview.
      if (s.clientFilter === name) {
        next.clientFilter = 'all'
        next.campaignFilter = 'all'
      }
      return next
    })
    await get().refresh()
  },
  addCampaign: (campaign) =>
    set((s) => {
      registerCampaign(campaign.name, campaign.client)
      if (s.campaignList.some((c) => c.name === campaign.name && c.client === campaign.client)) return {}
      // The quick-builders pass a generic 'content-seo' default. Prefer the brand's OWN chosen GTM
      // strategy so a growth/email/product brand isn't forced into a content engine; failing that,
      // lean on the user's role focus (email→lifecycle, growth→demand-gen, …). A template or an
      // explicit non-default strategy always wins over both.
      const brandStrategy = s.clientProfiles[campaign.client]?.strategy
      const roleStrategy = s.userPrefs.marketerRole ? ROLE_PRESETS[s.userPrefs.marketerRole].defaultStrategy : undefined
      const strategy = campaign.strategy && campaign.strategy !== 'content-seo' ? campaign.strategy : brandStrategy || roleStrategy || campaign.strategy || 'content-seo'
      const campaignList = [...s.campaignList, { ...campaign, strategy }]
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  addCanvas: (client, campaign, name, audiences = []) => {
    const id = `canvas_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
    const canvases = [...get().canvases, { id, client, campaign, name, audiences }]
    saveCanvases(canvases)
    const activeCanvas = { ...get().activeCanvas, [`${client}|${campaign}`]: id }
    saveActiveCanvas(activeCanvas)
    set({ canvases, activeCanvas })
    return id
  },
  renameCanvas: (id, name) => {
    const canvases = get().canvases.map((c) => (c.id === id ? { ...c, name } : c))
    saveCanvases(canvases)
    set({ canvases })
  },
  deleteCanvas: (id) => {
    const board = get().canvases.find((c) => c.id === id)
    const canvases = get().canvases.filter((c) => c.id !== id)
    saveCanvases(canvases)
    let activeCanvas = get().activeCanvas
    if (board && activeCanvas[`${board.client}|${board.campaign}`] === id) {
      activeCanvas = { ...activeCanvas, [`${board.client}|${board.campaign}`]: 'all' }
      saveActiveCanvas(activeCanvas)
    }
    set({ canvases, activeCanvas })
  },
  setActiveCanvas: (scopeKey, id) => {
    const activeCanvas = { ...get().activeCanvas, [scopeKey]: id }
    saveActiveCanvas(activeCanvas)
    set({ activeCanvas })
  },

  addArtboard: (client, campaign, rect) => {
    const existing = get().artboards.filter((a) => a.client === client && a.campaign === campaign)
    const id = `art_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
    const artboards = [...get().artboards, { id, client, campaign, name: `Artboard ${existing.length + 1}`, ...rect }]
    saveArtboards(artboards)
    set({ artboards })
  },
  renameArtboard: (id, name) => {
    const artboards = get().artboards.map((a) => (a.id === id ? { ...a, name } : a))
    saveArtboards(artboards)
    set({ artboards })
  },
  deleteArtboard: (id) => {
    const artboards = get().artboards.filter((a) => a.id !== id)
    saveArtboards(artboards)
    set({ artboards })
  },
  setCanvasAudiences: (id, audiences) => {
    const canvases = get().canvases.map((c) => (c.id === id ? { ...c, audiences } : c))
    saveCanvases(canvases)
    set({ canvases })
  },

  openProject: (campaign) => {
    const c = campaign.trim()
    if (!c) return
    const cur = get().openProjects
    if (cur.includes(c)) return
    const openProjects = [...cur, c]
    saveOpenProjects(openProjects)
    set({ openProjects })
  },
  closeProject: (campaign) => {
    const openProjects = get().openProjects.filter((c) => c !== campaign)
    saveOpenProjects(openProjects)
    set({ openProjects })
  },
  openBrandTab: (brand) =>
    set((s) => (s.openBrandTabs.includes(brand) ? {} : { openBrandTabs: [...s.openBrandTabs, brand] })),
  closeBrandTab: (brand) =>
    set((s) => ({ openBrandTabs: s.openBrandTabs.filter((b) => b !== brand) })),
  openDatasetTab: (id) =>
    set((s) => ({
      openDatasetTabs: s.openDatasetTabs.includes(id) ? s.openDatasetTabs : [...s.openDatasetTabs, id],
      activeDatasetId: id,
      page: 'dataset',
    })),
  closeDatasetTab: (id) =>
    set((s) => {
      const openDatasetTabs = s.openDatasetTabs.filter((d) => d !== id)
      // If the closed tab was the one showing, fall back to another data set or leave the page.
      const wasActive = s.activeDatasetId === id
      const activeDatasetId = wasActive ? openDatasetTabs[openDatasetTabs.length - 1] ?? null : s.activeDatasetId
      return {
        openDatasetTabs,
        activeDatasetId,
        page: wasActive && !activeDatasetId ? 'flows' : s.page,
      }
    }),

  setCampaignStatus: (name, status) =>
    set((s) => {
      const completedAt = status === 'completed' ? Date.now() : undefined
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) =>
          i === idx ? { ...c, status, completedAt } : c,
        )
      } else {
        // Row-only campaign (no wizard record yet): create a minimal entry so the
        // explicit state persists and resolves to its client before any rows change.
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, { name, client, strategy: 'Current state', status, completedAt }]
      }
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  // Campaigns live in Flows now: every "open this campaign" path (deep-links, the
  // portfolio, the agent bridge) routes to the Flows view instead of the legacy canvas.
  openCampaign: (name) => {
    get().openFlow(name)
  },
  // Open a campaign in the Flows view instead of the legacy canvas — the project tabs use
  // this so a tab opens the flow. An empty name opens a fresh flow builder.
  openFlow: (name, flowView = 'flow') => {
    const campaign = name.trim()
    if (!campaign) {
      set({ page: 'flows', flowOpen: '', flowOpenView: flowView })
      return
    }
    const client = clientForCampaign(campaign)
    const ss = get().sharedSession
    if (ss && client !== ss.client) return
    registerCampaign(campaign, client)
    get().openProject(campaign)
    // campaignFilter tracks the active tab; it's inert on the Flows page (FlowsView scopes
    // by its own viewName), so setting it only drives the tab highlight.
    set({ page: 'flows', clientFilter: client, campaignFilter: campaign, flowOpen: campaign, flowOpenView: flowView })
  },
  clearFlowOpen: () => set({ flowOpen: null, flowOpenView: 'flow' }),
  newCampaignParent: null,
  setNewCampaignParent: (newCampaignParent) => set({ newCampaignParent }),
  setFlowCanvasOpen: (open) => set((s) => (s.flowCanvasOpen === open ? {} : { flowCanvasOpen: open })),
  setFlowView: (v) => set((s) => (s.flowView === v ? {} : { flowView: v })),
  setFlowChatCollapsed: (v) => set((s) => (s.flowChatCollapsed === v ? {} : { flowChatCollapsed: v })),
  setFlowAssetsOpen: (v) => set((s) => (s.flowAssetsOpen === v ? {} : { flowAssetsOpen: v })),
  setRecordsChatCollapsed: (v) => {
    try { localStorage.setItem('stoplight.recordsChatCollapsed', v ? '1' : '0') } catch { /* ignore */ }
    set({ recordsChatCollapsed: v })
  },
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed
      try { localStorage.setItem('stoplight.sidebarCollapsed', sidebarCollapsed ? '1' : '0') } catch { /* ignore */ }
      return { sidebarCollapsed }
    }),
  saveFlowChat: (chat) =>
    set((s) => {
      const rest = s.flowChats.filter((c) => c.id !== chat.id)
      const flowChats = [chat, ...rest].sort((a, b) => b.createdAt - a.createdAt)
      saveFlowChats(flowChats)
      return { flowChats }
    }),
  deleteFlowChat: (id) =>
    set((s) => {
      const flowChats = s.flowChats.filter((c) => c.id !== id)
      saveFlowChats(flowChats)
      return { flowChats }
    }),

  createCanvas: () => {
    // A unique "Untitled canvas [N]" so repeated New-canvas clicks don't collide.
    const exists = (n: string) =>
      get().campaignList.some((c) => c.name === n) || get().rows.some((r) => (r.campaign ?? '') === n)
    let name = 'Untitled canvas'
    for (let i = 2; exists(name); i++) name = `Untitled canvas ${i}`
    registerCampaign(name, DRAFTS_SPACE)
    get().addCampaign({ name, client: DRAFTS_SPACE, strategy: 'Current state', status: 'planning' })
    // Seed one default lane for the Drafts space (once) so the blank canvas can take
    // an asset immediately; a real brand's audiences arrive when you attach one.
    set((s) => {
      if ((s.clientAudiences[DRAFTS_SPACE] ?? []).length) return {}
      const clientAudiences = { ...s.clientAudiences, [DRAFTS_SPACE]: [newAudience({ name: 'General audience' })] }
      saveClientAudiences(clientAudiences)
      return { clientAudiences }
    })
    get().openCampaign(name)
  },

  setCampaignStrategy: (name, strategy) => {
    set((s) => {
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) => (i === idx ? { ...c, strategy } : c))
      } else {
        // Row-only campaign with no wizard record yet: create a minimal entry so the
        // chosen playbook persists and resolves to its client.
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, { name, client, strategy }]
      }
      saveCampaigns(campaignList)
      return { campaignList }
    })
    // Ripple the new playbook across every asset in the campaign.
    void get().redraftAssets({ campaign: name })
  },

  setBrandStrategy: (brand, strategy) => {
    set((s) => {
      // Every campaign of this brand: its campaignList records + any row-only campaigns
      // whose name resolves to this brand.
      const names = new Set<string>()
      for (const c of s.campaignList) if (c.client === brand && !c.archivedAt) names.add(c.name)
      for (const r of s.rows) {
        const n = (r.campaign ?? '').trim()
        if (n && clientForCampaign(n) === brand) names.add(n)
      }
      let campaignList = s.campaignList.map((c) => (names.has(c.name) ? { ...c, strategy } : c))
      const existing = new Set(campaignList.map((c) => c.name))
      for (const name of names) {
        if (!existing.has(name)) {
          registerCampaign(name, brand)
          campaignList = [...campaignList, { name, client: brand, strategy }]
        }
      }
      saveCampaigns(campaignList)
      return { campaignList }
    })
    // Ripple the shared playbook across every asset in the brand (posted/linked-external
    // assets are welded and skipped by redraftAssets).
    void get().redraftAssets({ client: brand })
  },

  setCampaignSubject: (name, subject) =>
    set((s) => {
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) => (i === idx ? { ...c, subject } : c))
      } else {
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, { name, client, strategy: 'Current state', subject }]
      }
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  setCampaignReferences: (name, references) =>
    set((s) => {
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) => (i === idx ? { ...c, references } : c))
      } else {
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, { name, client, strategy: 'Current state', references }]
      }
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  setCampaignDirection: (name, direction) =>
    set((s) => {
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) => (i === idx ? { ...c, direction } : c))
      } else {
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, { name, client, strategy: 'Current state', direction }]
      }
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  patchCampaign: (name, patch) =>
    set((s) => {
      const idx = s.campaignList.findIndex((c) => c.name === name)
      if (idx < 0) return {}
      const campaignList = s.campaignList.map((c, i) => (i === idx ? { ...c, ...patch } : c))
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  setCampaignFolder: (name, folder) =>
    set((s) => {
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) => (i === idx ? { ...c, folder } : c))
      } else {
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, { name, client, strategy: 'Current state', folder }]
      }
      saveCampaigns(campaignList)
      // Filing under a folder that isn't registered yet (e.g. drag-created) adds it.
      let campaignFolders = s.campaignFolders
      if (folder) {
        const brand = clientForCampaign(name)
        const list = campaignFolders[brand] ?? []
        if (!list.includes(folder)) {
          campaignFolders = { ...campaignFolders, [brand]: [...list, folder] }
          saveCampaignFolders(campaignFolders)
        }
      }
      return { campaignList, campaignFolders }
    }),

  createCampaignFolder: (brand, folder) =>
    set((s) => {
      const trimmed = folder.trim()
      if (!trimmed) return {}
      const list = s.campaignFolders[brand] ?? []
      if (list.includes(trimmed)) return {}
      const campaignFolders = { ...s.campaignFolders, [brand]: [...list, trimmed] }
      saveCampaignFolders(campaignFolders)
      return { campaignFolders }
    }),

  renameCampaignFolder: (brand, from, to) =>
    set((s) => {
      const trimmed = to.trim()
      if (!trimmed || trimmed === from) return {}
      const list = s.campaignFolders[brand] ?? []
      // Merge into an existing folder if the target name already exists.
      const next = list.includes(trimmed) ? list.filter((f) => f !== from) : list.map((f) => (f === from ? trimmed : f))
      const campaignFolders = { ...s.campaignFolders, [brand]: next }
      saveCampaignFolders(campaignFolders)
      const campaignList = s.campaignList.map((c) => (c.client === brand && c.folder === from ? { ...c, folder: trimmed } : c))
      saveCampaigns(campaignList)
      return { campaignFolders, campaignList }
    }),

  deleteCampaignFolder: (brand, folder) =>
    set((s) => {
      const list = s.campaignFolders[brand] ?? []
      const campaignFolders = { ...s.campaignFolders, [brand]: list.filter((f) => f !== folder) }
      saveCampaignFolders(campaignFolders)
      // Its campaigns fall back to unfiled — the campaigns themselves are untouched.
      const campaignList = s.campaignList.map((c) => (c.client === brand && c.folder === folder ? { ...c, folder: undefined } : c))
      saveCampaigns(campaignList)
      return { campaignFolders, campaignList }
    }),

  ensureFlights: async () => {
    // Give every campaign that has assets a default "Flight 1" spanning its current assets. Idempotent
    // and cheap (a scan + at most a few creates, no network, no per-asset writes), so it's safe to call
    // on load and whenever campaigns change — that's how NEW campaigns pick up a flight too. Assets are
    // NOT stamped: while a campaign has one flight, its assets resolve to it by fallback (flightForRow).
    // Don't run until flights have hydrated from the backend, or we'd mint fresh "Flight 1"s and
    // persist them over the workspace's real flights (which arrive a beat later via hydrateRecords).
    if (!get().flightsHydrated) return
    const rows = get().rows
    if (!rows.length) return // rows not loaded yet; a later call runs it once they are
    const existing = get().flights
    const haveFor = new Set(existing.map((f) => f.campaign))
    const byCampaign = new Map<string, TrafficRow[]>()
    for (const r of rows) {
      const c = (r.campaign ?? '').trim()
      if (!c || r.archivedAt) continue
      const arr = byCampaign.get(c)
      if (arr) arr.push(r)
      else byCampaign.set(c, [r])
    }
    const WK = 7 * 86_400_000
    const newFlights: Flight[] = []
    for (const [campaign, crows] of byCampaign) {
      if (haveFor.has(campaign)) continue
      const times = crows.map((r) => Date.parse(r.scheduledAt)).filter((t) => !Number.isNaN(t))
      const start = times.length ? Math.min(...times) : Date.now()
      const end = times.length ? Math.max(...times) : start
      const camp = get().campaignList.find((c) => c.name === campaign)
      const weeks = camp?.durationWeeks && camp.durationWeeks > 0 ? camp.durationWeeks : Math.max(1, Math.round((end - start) / WK) || 4)
      newFlights.push(newFlight({ campaign, name: 'Flight 1', startAt: new Date(start).toISOString(), durationWeeks: weeks }))
    }
    if (newFlights.length) {
      const flights = [...existing, ...newFlights]
      saveFlights(flights)
      set({ flights })
    }
  },

  addFlight: (campaign, patch) => {
    const flight = newFlight({ campaign, ...patch })
    const flights = [...get().flights, flight]
    saveFlights(flights)
    set({ flights })
    return flight.id
  },

  patchFlight: (id, patch) =>
    set((s) => {
      const flights = s.flights.map((f) => (f.id === id ? { ...f, ...patch, id: f.id } : f))
      saveFlights(flights)
      return { flights }
    }),

  deleteFlight: (id) =>
    set((s) => {
      const flights = s.flights.filter((f) => f.id !== id)
      saveFlights(flights)
      return { flights }
    }),

  moveFlightSchedule: async (flightId, deltaDays) => {
    if (!deltaDays) return
    const f = get().flights.find((x) => x.id === flightId)
    if (!f) return
    const ms = deltaDays * 86_400_000
    const shift = (iso?: string) => {
      if (!iso) return undefined
      const t = Date.parse(iso)
      return Number.isNaN(t) ? undefined : new Date(t + ms).toISOString()
    }
    const flights = get().flights
    const rows = get().rows.filter((r) => !r.archivedAt && r.scheduledAt && flightForRow(r, flights)?.id === flightId)
    for (const r of rows) {
      const next = shift(r.scheduledAt)
      if (next) await sheet.update(r.id, { scheduledAt: next, ...(r.endsAt ? { endsAt: shift(r.endsAt) } : {}) })
    }
    get().patchFlight(flightId, { startAt: shift(f.startAt) ?? f.startAt })
    await get().refresh()
  },

  rescaleFlightSchedule: async (flightId, newStartMs, newEndMs) => {
    const f = get().flights.find((x) => x.id === flightId)
    if (!f) return
    const flights = get().flights
    const rows = get().rows.filter((r) => !r.archivedAt && r.scheduledAt && flightForRow(r, flights)?.id === flightId)
    const parsed = rows.map((r) => ({ r, t: Date.parse(r.scheduledAt) })).filter((x) => !Number.isNaN(x.t))
    const newSpan = Math.max(86_400_000, newEndMs - newStartMs)
    if (parsed.length) {
      const oldStart = Math.min(...parsed.map((x) => x.t))
      const oldEnd = Math.max(...parsed.map((x) => x.t))
      const oldSpan = oldEnd - oldStart
      for (const { r, t } of parsed) {
        const frac = oldSpan > 0 ? (t - oldStart) / oldSpan : 0
        const patch: Partial<TrafficRow> = { scheduledAt: new Date(newStartMs + frac * newSpan).toISOString() }
        if (r.endsAt) {
          const et = Date.parse(r.endsAt)
          if (!Number.isNaN(et)) {
            const efrac = oldSpan > 0 ? (et - oldStart) / oldSpan : frac
            patch.endsAt = new Date(newStartMs + efrac * newSpan).toISOString()
          }
        }
        await sheet.update(r.id, patch)
      }
    }
    get().patchFlight(flightId, {
      startAt: new Date(newStartMs).toISOString(),
      durationWeeks: Math.max(1, Math.round(newSpan / (7 * 86_400_000))),
    })
    await get().refresh()
  },

  addFlightRun: async (campaign) => {
    const DAY_MS = 86_400_000
    const all = get().flights
    const campFlights = all.filter((f) => f.campaign === campaign)
    if (!campFlights.length) return null
    // Clone the latest flight (by start) and place the new one after it, with a one-week gap.
    const source = [...campFlights].sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))[0]
    const rows = get().rows.filter((r) => !r.archivedAt && r.scheduledAt && flightForRow(r, all)?.id === source.id)
    const times = rows.map((r) => Date.parse(r.scheduledAt)).filter((t) => !Number.isNaN(t))
    const srcStart = times.length ? Math.min(...times) : Date.parse(source.startAt)
    const srcEnd = times.length ? Math.max(...times) : srcStart
    const dur = source.durationWeeks > 0 ? source.durationWeeks : 4
    const newStart = Math.max(srcEnd, srcStart + dur * 7 * DAY_MS) + 7 * DAY_MS
    const shift = newStart - srcStart
    const flight = newFlight({ campaign, name: `Flight ${campFlights.length + 1}`, startAt: new Date(newStart).toISOString(), durationWeeks: dur })
    const flights = [...all, flight]
    saveFlights(flights)
    set({ flights })
    // Clone the source flight's assets into the new window, stamped with the new flightId, as drafts.
    const clones: TrafficRow[] = rows.map((r) => ({
      ...r,
      id: freshRowId(),
      assetId: '',
      flightId: flight.id,
      status: 'draft' as const,
      scheduledAt: new Date(Date.parse(r.scheduledAt) + shift).toISOString(),
      endsAt: r.endsAt ? new Date(Date.parse(r.endsAt) + shift).toISOString() : undefined,
      approvedAt: undefined,
      postedAt: undefined,
      copyReviewed: false,
      error: undefined,
      spend: undefined,
      createdAt: Date.now(),
    }))
    if (clones.length) await sheet.append(clones)
    await get().refresh()
    return flight.id
  },

  removeFlightRun: async (flightId) => {
    const f = get().flights.find((x) => x.id === flightId)
    if (!f) return
    // Archive ONLY assets explicitly stamped to this flight (re-run clones). The primary flight's
    // assets are unstamped and resolve by fallback, so they are never touched here.
    // HARDENING: verify the archive writes actually landed before deleting the flight. If a write
    // silently fails, deleting the flight would orphan its clones back into the primary flight (they
    // resolve there by fallback), silently inflating the campaign. So archive, re-read, retry once,
    // and only delete the flight when none of its assets remain unarchived — else keep it and warn.
    const remaining = () => get().rows.filter((r) => r.flightId === flightId && !r.archivedAt)
    for (let attempt = 0; attempt < 2; attempt++) {
      const rows = remaining()
      if (!rows.length) break
      for (const r of rows) await sheet.update(r.id, { archivedAt: Date.now() })
      await get().refresh()
    }
    const stuck = remaining()
    if (stuck.length) {
      get().showToast(
        `Couldn't archive ${stuck.length} asset${stuck.length === 1 ? '' : 's'} on that flight, so it was kept (nothing left orphaned). Try removing it again.`,
      )
      return
    }
    get().deleteFlight(flightId)
    await get().refresh()
  },

  removeFlight: async (flightId) => {
    const f = get().flights.find((x) => x.id === flightId)
    if (!f) return
    const flight = { ...f } // snapshot for undo
    const archived = new Set<string>()
    // Archive every asset that resolves to this flight — stamped clones AND, for the primary flight,
    // its unstamped fallback assets. Resolve via flightForRow while the flight still exists in state,
    // then verify + retry (same hardening as removeFlightRun) so a failed write can't orphan assets.
    const remaining = () => {
      const flights = get().flights
      return get().rows.filter((r) => !r.archivedAt && flightForRow(r, flights)?.id === flightId)
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const rows = remaining()
      if (!rows.length) break
      for (const r of rows) {
        await sheet.update(r.id, { archivedAt: Date.now() })
        archived.add(r.id)
      }
      await get().refresh()
    }
    const stuck = remaining()
    if (stuck.length) {
      get().showToast(
        `Couldn't archive ${stuck.length} asset${stuck.length === 1 ? '' : 's'} on that flight, so it was kept. Try deleting it again.`,
      )
      return
    }
    get().deleteFlight(flightId)
    await get().refresh()
    // Soft delete → offer an undo: re-add the flight and un-archive exactly the assets we archived.
    const ids = [...archived]
    get().showToastAction(`Deleted ${flight.name}`, 'Undo', async () => {
      set((s) => {
        if (s.flights.some((x) => x.id === flight.id)) return {}
        const flights = [...s.flights, flight]
        saveFlights(flights)
        return { flights }
      })
      if (ids.length) await get().updateRows(ids.map((id) => ({ id, patch: { archivedAt: undefined } })))
      await get().refresh()
    })
  },

  renameCampaign: async (oldName, newName) => {
    const from = oldName.trim()
    const to = newName.trim()
    if (!from || !to || from === to) return
    // Refuse to merge into an existing, different campaign (would silently fold two together).
    if (get().campaignList.some((c) => c.name === to && c.name !== from)) {
      get().showToast(`A campaign named "${to}" already exists.`)
      return
    }
    // 1) Repoint every asset row (Supabase-backed) to the new campaign name.
    const rowIds = get().rows.filter((r) => (r.campaign ?? '').trim() === from).map((r) => r.id)
    if (rowIds.length) await get().updateRows(rowIds.map((id) => ({ id, patch: { campaign: to } })))
    // 2) Rename the record, repoint any child campaigns' parent, all in one campaignList write.
    set((s) => {
      const client = clientForCampaign(from)
      registerCampaign(to, client)
      const campaignList = s.campaignList.map((c) => {
        if (c.name === from) return { ...c, name: to }
        if (c.parent === from) return { ...c, parent: to }
        return c
      })
      saveCampaigns(campaignList)
      // 3) Flights key their campaign by name too — repoint them (localStorage-backed).
      const flights = s.flights.map((fl) => (fl.campaign === from ? { ...fl, campaign: to } : fl))
      saveFlights(flights)
      const openProjects = s.openProjects.map((p) => (p === from ? to : p))
      saveOpenProjects(openProjects)
      return {
        campaignList,
        flights,
        openProjects,
        newCampaignParent: s.newCampaignParent === from ? to : s.newCampaignParent,
        campaignFilter: s.campaignFilter === from ? to : s.campaignFilter,
      }
    })
    await get().refresh()
  },

  setCampaignGoal: (name, goal) =>
    set((s) => {
      const objective = goal.trim() || undefined
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) => (i === idx ? { ...c, objective } : c))
      } else {
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, { name, client, strategy: 'Current state', objective }]
      }
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  setCampaignGoalParts: (name, patch) =>
    set((s) => {
      // Normalize: empty strings clear the field; a message equal to the derived line is
      // stored as empty so the message stays live-derived until deliberately overridden.
      const apply = (c: Campaign): Campaign => {
        const next = { ...c }
        if ('message' in patch) next.goalMessage = (patch.message ?? '').trim() || undefined
        if ('kpi' in patch) next.goalKpi = (patch.kpi ?? '').trim() || undefined
        if ('target' in patch) next.goalTarget = typeof patch.target === 'number' && patch.target >= 0 ? patch.target : undefined
        return next
      }
      const idx = s.campaignList.findIndex((c) => c.name === name)
      let campaignList: Campaign[]
      if (idx >= 0) {
        campaignList = s.campaignList.map((c, i) => (i === idx ? apply(c) : c))
      } else {
        const client = clientForCampaign(name)
        registerCampaign(name, client)
        campaignList = [...s.campaignList, apply({ name, client, strategy: 'Current state' })]
      }
      saveCampaigns(campaignList)
      return { campaignList }
    }),

  setCampaignClient: (name, client) => {
    const c = client.trim()
    if (!c) return
    set((s) => {
      registerCampaign(name, c)
      const idx = s.campaignList.findIndex((x) => x.name === name)
      const campaignList =
        idx >= 0
          ? s.campaignList.map((x, i) => (i === idx ? { ...x, client: c } : x))
          : [...s.campaignList, { name, client: c, strategy: 'Current state' }]
      saveCampaigns(campaignList)
      // Follow the campaign to its new brand so the canvas stays coherent.
      return { campaignList, clientFilter: c }
    })
    // The widest-blast frame change: re-home re-checks every asset against the new
    // brand's proof set. Produced assets that fall off their proof get flagged for
    // external rework (editable copy is recomposed lane-by-lane as audiences swap).
    const newProofIds = new Set(
      (get().clientAudiences[c] ?? []).flatMap((au) => [...(au.rtbEmphasis ?? []), ...(au.rtbs ?? []).map((x) => x.id)]),
    )
    void flagRecheckMisfits(get, name, newProofIds, `Brand → ${c}`)
  },

  duplicateCampaign: async (name) => {
    const src = get().campaignList.find((c) => c.name === name)
    const client = clientForCampaign(name)
    // A unique "{name} — variant N" so repeated branches don't collide.
    let newName = `${name} — variant`
    for (let i = 2; get().campaignList.some((c) => c.name === newName); i++) newName = `${name} — variant ${i}`
    registerCampaign(newName, client)
    get().addCampaign({ ...(src ?? { strategy: 'Current state' }), name: newName, client, status: 'planning', completedAt: undefined })
    const clones: TrafficRow[] = get()
      .rows.filter((r) => r.campaign === name)
      .map((r) => ({
        ...r,
        id: freshRowId(),
        assetId: '',
        campaign: newName,
        status: 'draft' as const,
        approvedAt: undefined,
        postedAt: undefined,
        copyReviewed: false,
        error: undefined,
        spend: undefined,
        createdAt: Date.now(),
      }))
    // Carry the proof set so the clone's RTB labels still resolve.
    const srcRtbs = rtbsForCampaign(name)
    if (srcRtbs.length) {
      registerCampaignRtbs(newName, srcRtbs)
      const store = loadCampaignRtbs()
      store[newName] = srcRtbs
      saveCampaignRtbs(store)
    }
    if (clones.length) await sheet.append(clones)
    await get().refresh()
    set({ campaignFilter: newName })
    return newName
  },

  swapCampaignAudience: async (campaign, from, to) => {
    if (from.trim() === to.trim()) return
    const updates = get()
      .rows.filter((r) => (r.campaign ?? '').trim() === campaign.trim() && (r.audience ?? '').trim() === from.trim())
      .map((r) => ({ id: r.id, patch: { audience: to } as Partial<TrafficRow> }))
    if (!updates.length) return
    await get().updateRows(updates)
    // Re-check the swapped lane's produced assets against the new audience's proof,
    // flagging any that no longer hold (editable copy is redrafted below).
    const client = clientForCampaign(campaign)
    const toAud = (get().clientAudiences[client] ?? []).find((a) => a.name.trim() === to.trim())
    if (toAud) {
      const newProofIds = new Set([...(toAud.rtbEmphasis ?? []), ...(toAud.rtbs ?? []).map((x) => x.id)])
      await flagRecheckMisfits(get, campaign, newProofIds, `Audience → ${to}`, to)
    }
    void get().redraftAssets({ audience: to })
  },

  clearRecheckFlag: async (id) => {
    await get().updateRow(id, { recheckFlag: undefined })
  },

  rerunSeasonalCampaign: async (campaignName) => {
    const src = get().campaignList.find((c) => c.name === campaignName)
    if (!src) return
    const cycle = (src.seasonalCycle ?? 1) + 1
    const base = src.name.replace(/\s*[—-]\s*Cycle\s*\d+$/i, '')
    const newName = `${base} — Cycle ${cycle}`
    if (get().campaignList.some((c) => c.name === newName)) {
      set({ campaignFilter: newName })
      return
    }
    // Clone structure (the Campaign) and assets (its rows), shifted ~a year
    // forward and reset to draft, so the team starts from the proven base.
    get().addCampaign({ ...src, name: newName, timing: 'seasonal', seasonalCycle: cycle, sourceCampaign: src.name })
    const YEAR = 365 * 86_400_000
    const shift = (iso?: string) =>
      iso ? new Date(new Date(iso).getTime() + YEAR).toISOString() : undefined
    const clones: TrafficRow[] = get()
      .rows.filter((r) => r.campaign === campaignName)
      .map((r) => ({
        ...r,
        id: freshRowId(),
        assetId: '',
        campaign: newName,
        status: 'draft' as const,
        scheduledAt: shift(r.scheduledAt) ?? r.scheduledAt,
        endsAt: shift(r.endsAt),
        approvedAt: undefined,
        postedAt: undefined,
        copyReviewed: false,
        error: undefined,
        spend: undefined,
        createdAt: Date.now(),
      }))
    // Carry the proof set so the cloned rows' RTB labels still resolve.
    const srcRtbs = rtbsForCampaign(campaignName)
    if (srcRtbs.length) {
      registerCampaignRtbs(newName, srcRtbs)
      const store = loadCampaignRtbs()
      store[newName] = srcRtbs
      saveCampaignRtbs(store)
    }
    if (clones.length) await sheet.append(clones)
    await get().refresh()
    set({ campaignFilter: newName })
  },

  rotateAlwaysOn: async (campaignName) => {
    const cad = get().campaignList.find((c) => c.name === campaignName)?.refreshWeeks ?? 4
    const WEEK = 7 * 86_400_000
    const rows = get().rows.filter((r) => r.campaign === campaignName)
    for (const r of rows) {
      const next = new Date(new Date(r.scheduledAt).getTime() + cad * WEEK).toISOString()
      // A rotation = fresh creative cycle: reschedule forward, back to draft for review.
      await sheet.update(r.id, {
        scheduledAt: next,
        status: 'draft',
        postedAt: undefined,
        approvedAt: undefined,
        copyReviewed: false,
      })
    }
    await get().refresh()
  },

  moveCampaignSchedule: async (campaign, deltaDays) => {
    if (!deltaDays) return
    const ms = deltaDays * 86_400_000
    const shift = (iso?: string) => {
      if (!iso) return undefined
      const t = Date.parse(iso)
      return Number.isNaN(t) ? undefined : new Date(t + ms).toISOString()
    }
    const rows = get().rows.filter((r) => r.campaign === campaign && !r.archivedAt && r.scheduledAt)
    for (const r of rows) {
      const next = shift(r.scheduledAt)
      if (next) await sheet.update(r.id, { scheduledAt: next, ...(r.endsAt ? { endsAt: shift(r.endsAt) } : {}) })
    }
    await get().refresh()
  },

  rescaleCampaignSchedule: async (campaign, newStartMs, newEndMs) => {
    const rows = get().rows.filter((r) => r.campaign === campaign && !r.archivedAt && r.scheduledAt)
    const parsed = rows.map((r) => ({ r, t: Date.parse(r.scheduledAt) })).filter((x) => !Number.isNaN(x.t))
    if (!parsed.length) return
    const oldStart = Math.min(...parsed.map((x) => x.t))
    const oldEnd = Math.max(...parsed.map((x) => x.t))
    const oldSpan = oldEnd - oldStart
    const newSpan = Math.max(86_400_000, newEndMs - newStartMs)
    // Map each asset's position within the old window onto the new window (proportional rescale),
    // so a longer bar spreads the assets out and a shorter one packs them in.
    for (const { r, t } of parsed) {
      const frac = oldSpan > 0 ? (t - oldStart) / oldSpan : 0
      const patch: Partial<TrafficRow> = { scheduledAt: new Date(newStartMs + frac * newSpan).toISOString() }
      if (r.endsAt) {
        const et = Date.parse(r.endsAt)
        if (!Number.isNaN(et)) {
          const efrac = oldSpan > 0 ? (et - oldStart) / oldSpan : frac
          patch.endsAt = new Date(newStartMs + efrac * newSpan).toISOString()
        }
      }
      await sheet.update(r.id, patch)
    }
    get().patchCampaign(campaign, { durationWeeks: Math.max(1, Math.round(newSpan / (7 * 86_400_000))) })
    await get().refresh()
  },

  moveAssetSchedule: async (rowId, deltaDays) => {
    if (!deltaDays) return
    const r = get().rows.find((x) => x.id === rowId)
    if (!r?.scheduledAt) return
    const t = Date.parse(r.scheduledAt)
    if (Number.isNaN(t)) return
    const ms = deltaDays * 86_400_000
    const patch: Partial<TrafficRow> = { scheduledAt: new Date(t + ms).toISOString() }
    if (r.endsAt) {
      const et = Date.parse(r.endsAt)
      if (!Number.isNaN(et)) patch.endsAt = new Date(et + ms).toISOString()
    }
    await sheet.update(rowId, patch)
    await get().refresh()
  },

  fireTrigger: async (campaignName) => {
    const camp = get().campaignList.find((c) => c.name === campaignName)
    if (!camp || camp.timing !== 'triggered') return
    const rows = get().rows.filter((r) => r.campaign === campaignName)
    // The connection check still runs: a fast-shipped triggered piece gets checked
    // before it goes. The UI gates this too, but never ship over an open break.
    const open = applyBreakStatus(detectBreaks(rows), get().breakStatus).filter((b) => b.status === 'open')
    if (open.length > 0) return
    // Fire: the campaign's draft assets ship now (scheduled to the moment).
    const now = new Date(Date.now()).toISOString()
    const drafts = rows.filter((r) => r.status === 'draft')
    for (const r of drafts) {
      await sheet.update(r.id, { status: 'scheduled', scheduledAt: now })
    }
    await get().refresh()
  },
  openClientWizard: () => set({ wizardOpen: true, wizardClient: null }),
  openCampaignWizard: (client) => set({ wizardOpen: true, wizardClient: client }),
  closeWizard: () => set({ wizardOpen: false, wizardClient: null }),
  openAudienceWizard: () => set({ audienceWizardOpen: true }),
  closeAudienceWizard: () => set({ audienceWizardOpen: false }),

  openInvite: () => set({ inviteOpen: true }),
  closeInvite: () => set({ inviteOpen: false }),
  generateSetup: (input) => setupGenerator.generate(input),

  provisionWorkspace: async (setup) => {
    const client = setup.brand.name.trim()
    if (!client) return
    get().addClient(client)
    // Non-destructive profile write: fill empty fields, never clobber a human edit
    // (re-running setup must not re-set a corrected industry / strategy).
    const existing = get().clientProfiles[client] ?? {}
    const keep = (cur: unknown, next: string | undefined) =>
      typeof cur === 'string' && cur.trim() ? cur : next
    get().setClientProfile(client, {
      website: keep(existing.website, setup.brand.website?.trim() || undefined),
      industry: keep(existing.industry, setup.brand.industry?.trim() || undefined),
      voice: keep(existing.voice, setup.brand.voice?.trim() || undefined),
      // The inferred GTM motion: stored on the brand so it's queryable, pre-selected
      // for generation, and overridable. Kept if already set (an override wins).
      strategy: keep(existing.strategy, setup.strategy || undefined),
      secondaryStrategy: keep(existing.secondaryStrategy, setup.secondaryStrategy || undefined),
      strategyRationale: keep(existing.strategyRationale, setup.strategyRationale || undefined),
      strategyConfidence: keep(existing.strategyConfidence, setup.strategyConfidence || undefined),
      strategySignals: existing.strategySignals?.length
        ? existing.strategySignals
        : setup.signalsUsed?.length
          ? setup.signalsUsed
          : undefined,
      businessModel: keep(existing.businessModel, setup.businessModel || undefined),
    })

    // Re-run guard: if this client already has a setup campaign, reuse it instead of
    // spawning a duplicate (and don't reset the ICP or re-seed its assets).
    const campaign = setup.campaign.name?.trim() || `${client} — Campaign`
    const existingCampaign =
      get().campaignList.find((c) => c.name === campaign) ??
      get().campaignList.find((c) => c.client === client)
    if (existingCampaign) {
      set({ clientFilter: client, campaignFilter: existingCampaign.name, filter: 'all', proofFilter: 'all', ctaFilter: 'all' })
      return
    }
    get().setIcp(setup.icp)

    const strat = GTM_STRATEGIES.find((s) => s.key === setup.strategy)
    const strategyName = strat?.name ?? setup.strategy
    const weeks = setup.campaign.durationWeeks > 0 ? setup.campaign.durationWeeks : 8
    const deliverables = STRATEGY_ASSETS[setup.strategy] ?? STRATEGY_ASSETS['demand-gen']
    const contentPerMonth = deliverables
      .filter((d) => CHANNELS[d.channel].kind !== 'paid' && !d.brand)
      .reduce((n, d) => n + d.perMonth, 0)
    const oneTimeAssets = deliverables.filter((d) => d.brand).length
    const mediaShare = (strat ? mediaSharePct(strat) : null) ?? 50
    const mediaBudget = Math.round(((setup.campaign.overallBudget || 0) * mediaShare) / 100)
    const endDate = new Date(Date.now() + weeks * 7 * 86_400_000).toISOString().slice(0, 10)

    get().addCampaign({
      name: campaign,
      client,
      strategy: strategyName,
      durationWeeks: weeks,
      overallBudget: setup.campaign.overallBudget || undefined,
      mediaBudget: mediaBudget || undefined,
      contentPerMonth: contentPerMonth || undefined,
      oneTimeAssets: oneTimeAssets || undefined,
    })

    // Register + persist the proposed proof so it resolves across the workspace.
    if (setup.rtbs.length) {
      registerCampaignRtbs(campaign, setup.rtbs)
      const store = loadCampaignRtbs()
      store[campaign] = setup.rtbs
      saveCampaignRtbs(store)
    }

    await get().seedCampaignAssets(campaign, deliverables, {
      mediaBudget,
      flightWeeks: weeks,
      endDate,
    })
    set({ clientFilter: client, campaignFilter: campaign, filter: 'all', proofFilter: 'all', ctaFilter: 'all' })
  },

  provisionCurrentState: async (map) => {
    const client = map.brand.name.trim()
    if (!client) return
    get().addClient(client)
    get().setClientProfile(client, {
      website: map.brand.website?.trim() || undefined,
      industry: map.brand.industry?.trim() || undefined,
      voice: map.brand.voice?.trim() || undefined,
      channels: map.channels ?? [],
      ...brandOverview(map.brand),
    })
    const primary = map.audiences[0]
    get().setIcp({
      name: primary?.name ?? 'Primary audience',
      segment: 'Current state',
      summary: primary?.description ?? `Audiences for ${client}, mapped from their live messaging.`,
      firmographics: [],
      pains: [],
    })

    // One campaign holds the current-state map; the rows are their LIVE messaging.
    const campaign = `${client} — Live messaging`
    get().addCampaign({ name: campaign, client, strategy: 'Current state' })
    currentStateProof(campaign, map)
    await sheet.append(currentStateRows(campaign, map))
    await get().refresh()
    set({ clientFilter: client, campaignFilter: campaign, filter: 'all', proofFilter: 'all', ctaFilter: 'all' })
  },

  refreshClient: async (client) => {
    const profile = get().clientProfiles[client]
    if (!profile?.website) return
    set({ refreshingClient: client })
    try {
      const map = await mapSite({ url: profile.website, accounts: profile.channels ?? [] })
      const campaign = `${client} — Live messaging`
      if (!get().campaignList.some((c) => c.name === campaign)) {
        get().addCampaign({ name: campaign, client, strategy: 'Current state' })
      }
      // Replace the live-messaging rows with the fresh pull (the re-gather).
      const stale = get().rows.filter((r) => r.campaign === campaign)
      for (const r of stale) await sheet.remove(r.id)
      await sheet.append(currentStateRows(campaign, map))
      await get().refresh()
      currentStateProof(campaign, map)
      get().setClientProfile(client, {
        voice: map.brand.voice?.trim() || profile.voice,
        channels: map.channels ?? profile.channels,
        ...brandOverview(map.brand),
      })
      set({ clientFilter: client, campaignFilter: campaign })
    } catch {
      // Leave the existing map untouched on failure.
    } finally {
      set({ refreshingClient: null })
    }
  },

  openChannelIngest: (client, channel) =>
    set({
      channelIngestOpen: true,
      channelIngestTarget: { client, channel },
      channelIngestStages: [],
      channelIngestResult: null,
      channelIngestError: null,
      clientFilter: client,
    }),

  closeChannelIngest: () => set({ channelIngestOpen: false }),

  linkChannelUrl: (client, _channel, url) => {
    const u = url.trim()
    if (!u) return
    const existing = get().clientProfiles[client]?.channels ?? []
    if (!existing.includes(u)) get().setClientProfile(client, { channels: [...existing, u] })
  },

  openSanityIngest: (client) =>
    set({
      channelIngestOpen: true,
      channelIngestTarget: { client, channel: 'website', kind: 'sanity' },
      channelIngestStages: [],
      channelIngestResult: null,
      channelIngestError: null,
      clientFilter: client,
    }),

  setSanityCreds: (client, creds) => get().setClientProfile(client, { sanity: creds }),

  openResendIngest: (client) =>
    set({
      channelIngestOpen: true,
      channelIngestTarget: { client, channel: 'email', kind: 'resend' },
      channelIngestStages: [],
      channelIngestResult: null,
      channelIngestError: null,
      clientFilter: client,
    }),

  setResendCreds: (client, creds) => get().setClientProfile(client, { resend: creds }),

  openGoogleAdsIngest: (client) =>
    set({
      channelIngestOpen: true,
      channelIngestTarget: { client, channel: 'google-search', kind: 'google-ads' },
      channelIngestStages: [],
      channelIngestResult: null,
      channelIngestError: null,
      clientFilter: client,
    }),

  setGoogleAdsCreds: (client, creds) => get().setClientProfile(client, { googleAds: creds }),

  ingestChannel: async () => {
    const target = get().channelIngestTarget
    if (!target) return
    const { client, channel, kind } = target
    const profile = get().clientProfiles[client]
    set({ ingestingChannel: true, channelIngestStages: [], channelIngestError: null, channelIngestResult: null })
    const onStage = (e: IngestProgress) => set((s) => ({ channelIngestStages: [...s.channelIngestStages, e] }))
    // One campaign holds the brand's live messaging; each source refreshes only its
    // own rows within it (channel rows by channel, Sanity rows by the 'sanity' tag).
    const campaign = `${client} — Live messaging`
    const ensureCampaign = () => {
      if (!get().campaignList.some((c) => c.name === campaign)) {
        get().addCampaign({ name: campaign, client, strategy: 'Current state' })
      }
    }
    try {
      if (kind === 'sanity') {
        const creds = profile?.sanity
        if (!creds?.projectId) {
          set({ channelIngestError: { code: 'SANITY_SETUP', message: 'Add your Sanity project id first.' } })
          return
        }
        const result = await ingestSanityStream(
          { projectId: creds.projectId, dataset: creds.dataset || 'production', token: creds.token },
          onStage,
        )
        ensureCampaign()
        const stale = get().rows.filter((r) => r.campaign === campaign && r.assetId === 'sanity')
        for (const r of stale) await sheet.remove(r.id)
        await sheet.append(sanityRows(campaign, result.messages))
        mergeChannelProof(campaign, result.proofPoints)
        if (result.voice && !profile?.voice) get().setClientProfile(client, { voice: result.voice })
        await get().refresh()
        // Render through the shared channel-result shape (Sanity carries no art).
        set({
          channelIngestResult: {
            channel: 'Sanity',
            voice: result.voice,
            proofPoints: result.proofPoints,
            messages: result.messages,
            imagesSeen: 0,
            imagesTranscribed: 0,
          },
          clientFilter: client,
        })
        return
      }

      if (kind === 'resend') {
        const creds = profile?.resend
        if (!creds?.apiKey) {
          set({ channelIngestError: { code: 'RESEND_SETUP', message: 'Add your Resend API key first.' } })
          return
        }
        const result = await ingestResendStream({ apiKey: creds.apiKey }, onStage)
        ensureCampaign()
        const stale = get().rows.filter((r) => r.campaign === campaign && r.assetId === 'resend')
        for (const r of stale) await sheet.remove(r.id)
        await sheet.append(resendRows(campaign, result.messages))
        mergeChannelProof(campaign, result.proofPoints)
        if (result.voice && !profile?.voice) get().setClientProfile(client, { voice: result.voice })
        await get().refresh()
        set({
          channelIngestResult: {
            channel: 'Resend',
            voice: result.voice,
            proofPoints: result.proofPoints,
            messages: result.messages,
            imagesSeen: 0,
            imagesTranscribed: 0,
          },
          clientFilter: client,
        })
        return
      }

      if (kind === 'google-ads') {
        const creds = profile?.googleAds
        if (!creds?.developerToken || !creds?.refreshToken || !creds?.customerId) {
          set({ channelIngestError: { code: 'GOOGLE_ADS_SETUP', message: 'Add your Google Ads API credentials first.' } })
          return
        }
        const result = await ingestGoogleAdsStream(creds, onStage)
        ensureCampaign()
        const stale = get().rows.filter((r) => r.campaign === campaign && r.assetId === 'google-ads')
        for (const r of stale) await sheet.remove(r.id)
        await sheet.append(googleAdsRows(campaign, result.messages))
        mergeChannelProof(campaign, result.proofPoints)
        if (result.voice && !profile?.voice) get().setClientProfile(client, { voice: result.voice })
        await get().refresh()
        set({
          channelIngestResult: {
            channel: 'Google Ads',
            voice: result.voice,
            proofPoints: result.proofPoints,
            messages: result.messages,
            imagesSeen: 0,
            imagesTranscribed: 0,
          },
          clientFilter: client,
        })
        return
      }

      const profileUrl = profileUrlForChannel(channel, profile?.channels)
      const knownAudiences = (get().clientAudiences[client] ?? []).map((a) => a.name).filter(Boolean)
      const result = await ingestChannelStream(
        { channel, profileUrl, website: profile?.website, audiences: knownAudiences },
        onStage,
      )
      ensureCampaign()
      // Keep Sanity rows (assetId 'sanity') even when they share the website channel.
      const stale = get().rows.filter(
        (r) => r.campaign === campaign && r.channel === channel && r.assetId !== 'sanity',
      )
      for (const r of stale) await sheet.remove(r.id)
      await sheet.append(ingestRows(campaign, channel, result.messages))
      mergeChannelProof(campaign, result.proofPoints)
      if (result.voice && !profile?.voice) get().setClientProfile(client, { voice: result.voice })
      // Adopt the profile's avatar as the brand picture, but never clobber one the
      // user set — only fill an empty pfp.
      if (result.profileImage) {
        const rec = get().brandRecords.find((b) => b.name === client)
        if (rec && !rec.pfp) get().updateBrandRecord(rec.id, { pfp: result.profileImage })
      }
      await get().refresh()
      set({ channelIngestResult: result, clientFilter: client })
    } catch (err) {
      const code = err instanceof IngestError ? err.code : null
      set({ channelIngestError: { code, message: String((err as Error)?.message ?? err) } })
    } finally {
      set({ ingestingChannel: false })
    }
  },

  seedCampaignAssets: async (campaign, deliverables, opts) => {
    if (!deliverables.length) return
    const flightWeeks = opts?.flightWeeks && opts.flightWeeks > 0 ? opts.flightWeeks : 4
    const flightDays = flightWeeks * 7
    const months = Math.max(1, Math.round(flightWeeks / 4))
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    // A date `offsetDays` into the flight, at the channel's first best-time hour.
    const slotIso = (channel: ChannelId, offsetDays: number): string => {
      const dt = new Date(start)
      dt.setDate(dt.getDate() + Math.min(offsetDays, flightDays))
      const bt = CHANNELS[channel].bestTimes[0] ?? { hour: 10, minute: 0 }
      dt.setHours(bt.hour, bt.minute ?? 0, 0, 0)
      return dt.toISOString()
    }
    // Paid media runs as a flight: one bar spanning the campaign (shown as a
    // multi-day span on the calendar). Owned/organic content is point-in-time —
    // recurring pieces (perMonth > 1) spread across the flight; singles once.
    const flightEnd = new Date(start)
    flightEnd.setDate(flightEnd.getDate() + flightDays)
    const flightEndIso = flightEnd.toISOString()
    // Business days (Mon–Fri) across the flight — content + brand builds land on
    // these, never a weekend.
    const businessDays: Date[] = []
    for (let i = 0; i <= flightDays; i++) {
      const dt = new Date(start)
      dt.setDate(dt.getDate() + i)
      const wd = dt.getDay()
      if (wd !== 0 && wd !== 6) businessDays.push(dt)
    }
    if (businessDays.length === 0) businessDays.push(new Date(start))
    // A weekday `n` business-days into the flight, at the channel's first best hour.
    const bizSlotIso = (channel: ChannelId, n: number): string => {
      const slot = businessDays[Math.min(businessDays.length - 1, Math.max(0, n))]
      const bt = CHANNELS[channel].bestTimes[0] ?? { hour: 10, minute: 0 }
      const dt = new Date(slot)
      dt.setHours(bt.hour, bt.minute ?? 0, 0, 0)
      return dt.toISOString()
    }
    const rows: TrafficRow[] = []
    deliverables.forEach((d, di) => {
      const assetType = isValidType(d.channel, d.assetType) ? d.assetType : primaryTypeKey(d.channel)
      const base = {
        assetId: '',
        mediaType: d.media,
        channel: d.channel,
        assetType,
        messaging: {} as Record<string, string>,
        campaign,
        audience: '',
        status: 'draft' as const,
      }
      // Paid media → one flight bar spanning the campaign.
      if (CHANNELS[d.channel].kind === 'paid') {
        rows.push({
          ...base,
          id: freshRowId(),
          assetName: d.label,
          scheduledAt: slotIso(d.channel, 1 + (di % 6)),
          endsAt: flightEndIso,
          createdAt: Date.now(),
        })
        return
      }
      // Brand asset → built once, near the start (on a weekday).
      if (d.brand) {
        rows.push({
          ...base,
          id: freshRowId(),
          assetName: d.label,
          scheduledAt: bizSlotIso(d.channel, 1 + (di % 6)),
          createdAt: Date.now(),
        })
      }
      // Content is scheduled below, as an interleaved weekday cadence.
    })

    // Content → a real publishing cadence: interleave the formats and spread
    // them across the flight's business days, so each day mixes types instead of
    // stacking three of the same.
    const queues = deliverables
      .filter((d) => CHANNELS[d.channel].kind !== 'paid' && !d.brand)
      .map((d) => {
        const count = Math.max(1, d.perMonth * months)
        return Array.from({ length: count }, (_, k) => ({ d, k, count }))
      })
    // Round-robin so consecutive pieces are different formats, then lay the
    // sequence evenly over the business days.
    const interleaved: { d: Deliverable; k: number; count: number }[] = []
    while (queues.some((q) => q.length)) {
      for (const q of queues) {
        const it = q.shift()
        if (it) interleaved.push(it)
      }
    }
    interleaved.forEach((it, i) => {
      const slot =
        businessDays[
          Math.min(businessDays.length - 1, Math.floor((i * businessDays.length) / interleaved.length))
        ]
      const bt = CHANNELS[it.d.channel].bestTimes[0] ?? { hour: 10, minute: 0 }
      const at = new Date(slot)
      at.setHours(bt.hour, bt.minute ?? 0, 0, 0)
      const assetType = isValidType(it.d.channel, it.d.assetType)
        ? it.d.assetType
        : primaryTypeKey(it.d.channel)
      rows.push({
        assetId: '',
        mediaType: it.d.media,
        channel: it.d.channel,
        assetType,
        messaging: {},
        campaign,
        audience: '',
        status: 'draft',
        id: freshRowId(),
        assetName: it.count > 1 ? `${it.d.label} #${it.k + 1}` : it.d.label,
        scheduledAt: at.toISOString(),
        createdAt: Date.now(),
      })
    })
    // Emails drive to a page: link each email to the campaign's landing page.
    const page =
      rows.find((r) => r.channel === 'landing-page' && r.assetType === 'lead-capture') ??
      rows.find((r) => r.channel === 'landing-page')
    if (page) for (const r of rows) if (r.channel === 'email') r.linksTo = page.assetName
    // Split the media budget evenly across the paid rows for the flight.
    const budget = opts?.mediaBudget
    if (budget && budget > 0) {
      const paid = rows.filter((r) => CHANNELS[r.channel].kind === 'paid')
      if (paid.length) {
        const per = Math.round(budget / paid.length)
        for (const r of paid) r.budget = { amount: per, type: 'lifetime', endDate: opts?.endDate }
      }
    }
    // Spread the brand's audiences across the seeded assets (round-robin) so each
    // asset is written for a specific segment, not a generic buyer. Generation
    // conditions copy on this.
    const auds = opts?.audiences ?? []
    if (auds.length) rows.forEach((r, i) => { if (!r.audience) r.audience = auds[i % auds.length] })
    // Every generated asset ships with UTMs built from its own channel + campaign + type, so the
    // tracking link is ready the moment the asset exists (no hand-typing, consistent convention).
    rows.forEach((r) => { r.utm = buildUtm(r) })
    await sheet.append(rows)
    await get().refresh()
  },

  addBlankAsset: async (campaign, opts) => {
    // A generic content draft the user fills in (channel is theirs to change via the grid dropdown).
    const channel: ChannelId = opts?.channel ?? 'blog'
    const media: MediaType = CHANNELS[channel]?.kind === 'paid' ? 'image' : 'text'
    const row: TrafficRow = {
      id: freshRowId(),
      assetId: '',
      assetName: 'New asset',
      mediaType: media,
      channel,
      assetType: primaryTypeKey(channel),
      messaging: {},
      campaign,
      audience: '',
      status: 'draft',
      scheduledAt: opts?.scheduledAt ?? new Date().toISOString(),
      createdAt: Date.now(),
    }
    row.utm = buildUtm(row)
    await sheet.append([row])
    await get().refresh()
    return row.id
  },

  hydrateRecords: async () => {
    // A share viewer's records are the seeded snapshot (localStorage); don't overwrite with the
    // backend (which it has no session for anyway).
    if (!isSupabaseConfigured || shareViewMode) return
    const from = <T extends { id: string; name?: string }>(table: string) => new SupabaseRecordAdapter<T>(table).list()
    const [companies, people, channelRecords, segments, objectives, messages, voices, patterns, triggers, brandRecords, libraryFolders] = await Promise.all([
      from<Company>('companies'),
      from<Person>('people'),
      from<ChannelRecord>('channels'),
      from<Segment>('segments'),
      from<Objective>('objectives'),
      from<Message>('message_records'),
      from<Voice>('voice_records'),
      from<Pattern>('patterns'),
      from<Trigger>('triggers'),
      from<BrandRecord>('brands'),
      from<LibraryFolder>('library_folders'),
    ])
    const patch: Record<string, unknown> = { companies, people, channelRecords, segments, objectives, messages, voices, patterns, triggers, brandRecords, libraryFolders }
    // Non-record state (brand system, client list, campaign metadata, …) from the KV table, mapped
    // back onto its store slice by the localStorage key it was saved under.
    const STATE_SLICES: Record<string, string> = {
      'stoplight.clients.v1': 'clientList',
      'stoplight.clientProfiles.v1': 'clientProfiles',
      'stoplight.clientAudiences.v1': 'clientAudiences',
      'stoplight.brandSystems.v1': 'brandSystems',
      'stoplight.brandMeta.v1': 'brandMeta',
      'stoplight.brandGuides.v1': 'brandGuides',
      'stoplight.brandFieldSources.v1': 'brandFieldSources',
      'stoplight.campaigns.v1': 'campaignList',
      'stoplight.campaignFolders.v1': 'campaignFolders',
      'stoplight.flights.v1': 'flights',
      'stoplight.canvases.v1': 'canvases',
      'stoplight.reports.v1': 'reports',
      'stoplight.mediaMixes.v1': 'mediaMixes',
      'stoplight.flowChats.v1': 'flowChats',
      'stoplight.homeChats.v1': 'homeChats',
    }
    const state = await hydrateState()
    for (const [key, slice] of Object.entries(STATE_SLICES)) if (key in state) patch[slice] = state[key]
    // Flights are now hydrated (whether the workspace had any or not) — release the ensureFlights gate.
    patch.flightsHydrated = true
    // Interface preferences (skill level + role) live in localStorage, not a store slice, but do sync
    // through workspace_state — restore the workspace's copy on a fresh device, merged with defaults
    // so a newer field (e.g. focusDismissed) is never dropped by an older saved blob.
    if (!userPrefsTouchedThisSession && USER_PREFS_KEY in state && state[USER_PREFS_KEY] && typeof state[USER_PREFS_KEY] === 'object') {
      const mergedPrefs = { ...DEFAULT_USER_PREFS, ...(state[USER_PREFS_KEY] as Partial<UserPrefs>) }
      patch.userPrefs = mergedPrefs
      try {
        localStorage.setItem(USER_PREFS_KEY, JSON.stringify(mergedPrefs))
      } catch {
        /* storage unavailable — prefs fall back to whatever's local */
      }
    }
    // UI preferences kept in localStorage (not a store slice) still sync via workspace_state:
    // write the workspace's copy back so components that read them synchronously (RecordsTable's
    // grouping) restore the workspace choice on a fresh device.
    if (RECORD_GROUPING_KEY in state) {
      try {
        localStorage.setItem(RECORD_GROUPING_KEY, JSON.stringify(state[RECORD_GROUPING_KEY]))
      } catch {
        /* storage unavailable — grouping falls back to whatever's local */
      }
    }
    // Tasks live in localStorage (TasksView owns them, not a store slice); restore the workspace's
    // copy so a fresh device shows the right tasks. Notify listeners (sidebar badge, home agenda).
    if (TASKS_KEY in state) {
      try {
        localStorage.setItem(TASKS_KEY, JSON.stringify(state[TASKS_KEY]))
        window.dispatchEvent(new Event('stoplight:tasks'))
      } catch {
        /* storage unavailable — tasks fall back to whatever's local */
      }
    }
    set(patch as Partial<TrafficState>)
  },

  migrateLocalToSupabase: async () => {
    if (!isSupabaseConfigured) return { ok: false, error: 'No backend configured' }
    try {
      // Record lists → their per-row tables (whole array replaced).
      const RECORD_MIGRATIONS: [string, string][] = [
        ['stoplight.companies.v1', 'companies'],
        ['stoplight.people.v1', 'people'],
        ['stoplight.channelRecords.v1', 'channels'],
        ['stoplight.segments.v1', 'segments'],
        ['stoplight.objectives.v1', 'objectives'],
        ['stoplight.messages.v1', 'message_records'],
        ['stoplight.brandRecords.v1', 'brands'],
        [LIBRARY_FOLDERS_KEY, 'library_folders'],
      ]
      for (const [key, table] of RECORD_MIGRATIONS) {
        const arr = loadRecordList<{ id: string; name?: string }>(key)
        if (arr.length) await new SupabaseRecordAdapter(table).replaceAll(arr)
      }
      // Keyed state + tasks + grouping → workspace_state.
      const STATE_MIGRATIONS = [
        'stoplight.clients.v1', 'stoplight.clientProfiles.v1', 'stoplight.clientAudiences.v1',
        'stoplight.brandSystems.v1', 'stoplight.brandMeta.v1', 'stoplight.brandGuides.v1', 'stoplight.brandFieldSources.v1',
        'stoplight.campaigns.v1', 'stoplight.campaignFolders.v1', 'stoplight.flights.v1', 'stoplight.canvases.v1',
        'stoplight.reports.v1', 'stoplight.mediaMixes.v1', 'stoplight.flowChats.v1', 'stoplight.homeChats.v1',
        TASKS_KEY, RECORD_GROUPING_KEY,
      ]
      for (const key of STATE_MIGRATIONS) {
        const raw = localStorage.getItem(key)
        if (raw != null) {
          try { persistState(key, JSON.parse(raw)) } catch { /* skip malformed */ }
        }
      }
      // Assets (the sheet) → the Supabase sheet. The mock snapshot is { rows: TrafficRow[] }, so
      // read `.rows` (tolerate a bare array too). Only append rows not already in the workspace.
      try {
        const raw = localStorage.getItem('stoplight.sheet.v1')
        if (raw) {
          const snap = JSON.parse(raw)
          const localRows: TrafficRow[] = Array.isArray(snap?.rows) ? snap.rows : Array.isArray(snap) ? snap : []
          if (localRows.length) {
            const existing = new Set((await sheet.list()).map((r) => r.id))
            const fresh = localRows.filter((r) => !existing.has(r.id))
            if (fresh.length) await sheet.append(fresh)
          }
        }
      } catch { /* skip malformed sheet */ }
      localStorage.setItem('stoplight.migrated.v1', '1')
      await get().hydrateRecords()
      await get().refresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  },

  refresh: async () => {
    set({ loading: true })
    const raw = await sheet.list()
    // Normalize channel values to canonical ids so every surface (grid select, drawer,
    // messaging fields, icons) reads the same channel. The data was seeded with a mix of
    // display names ("Instagram", "YouTube Shorts", "Newsletter") and canonical ids; a
    // loose value made the grid's channel dropdown fall through to its first option.
    const rows = raw.map((r) => {
      const c = resolveChannelId(r.channel)
      return c && c !== r.channel ? { ...r, channel: c } : r
    })
    // Persist the normalization so it sticks (only the rows that actually changed).
    for (const r of rows) {
      const orig = raw.find((o) => o.id === r.id)
      if (orig && orig.channel !== r.channel) void sheet.update(r.id, { channel: r.channel })
    }
    set({ rows, loading: false })
  },

  // Auto-organize each ingested batch to channel + per-channel type before it
  // hits the staging tray. Batch-aware (carousel slides detected across the
  // group). De-dupes by id so re-importing the same Drive files (stable ids)
  // doesn't create duplicate tray cards / rows.
  addAssets: (assets) =>
    set((s) => {
      const have = new Set(s.assets.map((a) => a.id))
      // Feed the current client's defined audiences in, so a folder named for an
      // audience routes the asset to that lane on the canvas automatically.
      const audienceNames = (s.clientAudiences[s.clientFilter] ?? []).map((a) => a.name)
      const fresh = classifyAssets(assets, audienceNames).filter((a) => !have.has(a.id))
      return { assets: [...s.assets, ...fresh] }
    }),

  draftMatrixCell: async (row) => {
    await sheet.append([{ ...row, utm: row.utm ?? buildUtm(row) }])
    await get().refresh()
  },

  draftMatrixCells: async (rows) => {
    if (!rows.length) return
    await sheet.append(rows.map((r) => ({ ...r, utm: r.utm ?? buildUtm(r) })))
    await get().refresh()
  },

  updateAsset: (id, patch) =>
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  toggleChannel: (id, channel) =>
    set((s) => ({
      assets: s.assets.map((a) => {
        if (a.id !== id) return a
        const has = a.channels.includes(channel)
        return {
          ...a,
          channels: has
            ? a.channels.filter((c) => c !== channel)
            : [...a.channels, channel],
        }
      }),
    })),

  removeAsset: (id) =>
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),

  addToSheet: async () => {
    const ready = get().assets.filter((a) => a.channels.length > 0)
    if (ready.length === 0) return
    // Inherit the open campaign so the new rows land on this campaign's canvas
    // instead of as unscoped drafts. Audience rides on each asset (tray/folder).
    const { campaignFilter } = get()
    const rows = proposeSchedule(ready, new Date(), {
      campaign: campaignFilter !== 'all' ? campaignFilter : '',
    })
    rows.forEach((r) => { r.utm = r.utm ?? buildUtm(r) })
    await sheet.append(rows)
    const stagedIds = new Set(ready.map((a) => a.id))
    set((s) => ({ assets: s.assets.filter((a) => !stagedIds.has(a.id)) }))
    // New assets change the campaign — the messaging clearance is now stale.
    set({ batchReview: null, gateCleared: false, trackingRan: false, trackingCleared: false, budgetCleared: false })
    await get().refresh()
  },

  updateRow: async (id, patch) => {
    await sheet.update(id, patch)
    await get().refresh()
  },

  updateRows: async (updates) => {
    if (!updates.length) return
    pushUndo(get().rows)
    for (const u of updates) await sheet.update(u.id, u.patch)
    await get().refresh()
  },

  redraftAssets: async (scope) => {
    const s = get()
    const updates: { id: string; patch: Partial<TrafficRow> }[] = []
    // When the strategy or audience under an asset changes, copy that was actually WRITTEN (by
    // Claude or by a person) must not be silently replaced with the template recompose below: that
    // quietly threw away good copy for worse, with a ripple animation that made it look intentional.
    // A row that already has copy is flagged as out of date instead, so the change is a visible
    // choice (regenerate) rather than a destructive surprise. Only genuinely empty rows are filled.
    const changeReason = scope.audience ? 'Audience changed, so this copy may be out of date' : 'Strategy changed, so this copy may be out of date'
    const changeFrame = scope.audience ? `Audience → ${scope.audience}` : scope.campaign ? `Campaign → ${scope.campaign}` : 'Strategy change'
    for (const r of s.rows) {
      if (scope.campaign && (r.campaign ?? '').trim() !== scope.campaign.trim()) continue
      if (scope.audience && (r.audience ?? '').trim() !== scope.audience.trim()) continue
      const client = clientForCampaign(r.campaign)
      if (scope.client && client !== scope.client) continue
      // Linked-external assets (produced video / image / live page) can't be
      // redrafted — their words are welded in. A frame change flags them for
      // external rework; it never fake-edits them here.
      if (isLinkedExternal(r)) continue
      // Real copy is preserved and flagged, never overwritten. `authored` copy is a human's words;
      // any non-empty messaging is a draft someone may have kept or edited. Either way, recomposing
      // over it is the exact silent-overwrite this guard exists to stop.
      if (r.authored || messagingAllText(r).trim()) {
        if (!r.recheckFlag) updates.push({ id: r.id, patch: { recheckFlag: { reason: changeReason, frame: changeFrame, at: Date.now() } } })
        continue
      }
      const aud = (s.clientAudiences[client] ?? []).find(
        (a) => a.name.trim() === (r.audience ?? '').trim(),
      )
      if (!aud) continue
      const assetType = r.assetType ?? primaryTypeKey(r.channel)
      // The stage drives the CTA; the audience supplies the angle, outcome, and
      // the emphasized proof. Recompose from the model so the strategy/audience
      // change shows up in every asset's copy.
      const stage = r.funnelStage ?? funnelStageFor(r.channel, assetType)
      // Resolve the audience's lead proof from the campaign's RTB pool (emphasis
      // ids reference the pool, not a copy on the audience).
      const pool = rtbsForCampaign(r.campaign)
      const emphasis = aud.rtbEmphasis ?? []
      const lead = pool.find((x) => emphasis.includes(x.id)) ?? (aud.rtbs ?? [])[0]
      const cta = ctaFor(stage, aud.outcome)
      const { messaging, rtbMap } = composeMessaging({
        channel: r.channel,
        assetType,
        audience: { name: aud.name, messageAngle: aud.messageAngle },
        proof: lead,
        cta,
      })
      // A recompose clears any stale flag on this row: it is now freshly on the new frame.
      updates.push({ id: r.id, patch: { messaging, rtbMap, recheckFlag: undefined } })
    }
    if (!updates.length) return
    // Animate ONLY the rows that were actually recomposed. Flag-only updates (real copy left in
    // place, marked out of date) must not ripple, or the animation would again imply the copy was
    // rewritten when it deliberately was not.
    const ids = updates.filter((u) => u.patch.messaging).map((u) => u.id)
    if (ids.length) set({ regenIds: new Set(ids) })
    await get().updateRows(updates)
    // Clear once the (staggered) animation has played — duration 1.5s plus the
    // longest stagger (~0.8s), so the "thinking → resolve" effect fully reads.
    if (ids.length) {
      setTimeout(() => {
        const remaining = new Set(get().regenIds)
        for (const id of ids) remaining.delete(id)
        set({ regenIds: remaining })
      }, 2500)
    }
  },

  removeRow: async (id) => {
    pushUndo(get().rows)
    await sheet.remove(id)
    await get().refresh()
  },

  // ---- Asset lifecycle ----
  addAsset: async (brand, campaign, patch) => {
    const c = campaign.trim()
    get().addClient(brand)
    if (c && !get().campaignList.some((x) => x.name === c)) get().addCampaign({ name: c, client: brand, strategy: 'Demand Gen' })
    const channel = (patch.channel ?? 'Instagram') as ChannelId
    const assetType = patch.assetType && isValidType(channel, patch.assetType) ? patch.assetType : primaryTypeKey(channel)
    const existing = new Set(get().rows.map((r) => r.assetName))
    let name = (patch.assetName ?? 'Authored asset').trim() || 'Authored asset'
    let n = 2
    while (existing.has(name)) name = `${(patch.assetName ?? 'Authored asset').trim()} ${n++}`
    const row: TrafficRow = {
      assetId: '',
      ...patch,
      // Required fields, guaranteed after the spread (patch is a Partial).
      id: freshRowId(),
      assetName: name,
      channel,
      assetType,
      mediaType: patch.mediaType ?? 'image',
      messaging: patch.messaging ?? {},
      campaign: c,
      audience: patch.audience ?? '',
      status: patch.status ?? 'draft',
      scheduledAt: patch.scheduledAt ?? new Date().toISOString(),
      source: patch.source ?? 'authored',
      authored: (patch.source ?? 'authored') === 'authored',
      createdAt: Date.now(),
    }
    pushUndo(get().rows)
    await sheet.append([row])
    await get().refresh()
    return row
  },

  importAssets: async (brand, campaign, items, source) => {
    const c = campaign.trim()
    get().addClient(brand)
    if (c && !get().campaignList.some((x) => x.name === c)) get().addCampaign({ name: c, client: brand, strategy: 'Current state' })
    const inCampaign = get().rows.filter((r) => (r.campaign ?? '').trim() === c)
    // Dedup so a re-import never duplicates: by external URL first, else by exact copy.
    const byUrl = new Map(inCampaign.filter((r) => r.sourceUrl).map((r) => [r.sourceUrl as string, r]))
    const seenUrls = new Set(byUrl.keys())
    const seenNames = new Set(inCampaign.map((r) => r.assetName))
    const copyKey = (r: TrafficRow) => Object.values(r.messaging ?? {}).join(' ¶ ').trim().toLowerCase()
    const seenCopy = new Set(inCampaign.filter((r) => r.source && r.source !== 'generated').map(copyKey))
    const rows: TrafficRow[] = []
    const updates: { id: string; patch: Partial<TrafficRow> }[] = []
    let skipped = 0
    for (const item of items) {
      const norm = normalizeImportItem(item, source)
      const blob = `${norm.headline ?? ''} ${norm.primaryText ?? ''}`.trim()
      // Never store a login / challenge / error page as content.
      if (!blob || looksLikeBlockedPage(blob)) {
        skipped++
        continue
      }
      // Already imported (same URL): refresh its metrics in place rather than duplicate.
      const existing = norm.sourceUrl ? byUrl.get(norm.sourceUrl) : undefined
      if (existing) {
        // Re-import refreshes metrics AND backfills brand scoping onto rows imported before rows
        // carried their own client (so an existing orphaned library row gets attributed on re-ingest).
        const patch: Partial<TrafficRow> = existing.client === brand ? {} : { client: brand }
        if (norm.metrics) {
          patch.socialMetrics = norm.metrics
          patch.engagement = engagementFromMetrics(norm.metrics) ?? existing.engagement
          patch.metricsUpdatedAt = norm.metricsUpdatedAt ?? Date.now()
        }
        if (Object.keys(patch).length) updates.push({ id: existing.id, patch })
        else skipped++
        continue
      }
      const channel = norm.channel
      const assetType = norm.assetType && isValidType(channel, norm.assetType) ? norm.assetType : primaryTypeKey(channel)
      // Map the normalized copy onto this channel's messaging field keys.
      const fields = messagingFields(channel, assetType)
      const key = (re: RegExp) => fields.find((f) => re.test(f.key))?.key
      const headlineKey = key(/headline|subject|title|subhead/i)
      const primaryKey = key(/primary|body|caption|intro|post|message/i) ?? fields[0]?.key
      const descKey = key(/desc|preview/i)
      const ctaKey = key(/cta/i)
      const messaging: Record<string, string> = {}
      if (norm.headline && headlineKey) messaging[headlineKey] = norm.headline
      if (norm.primaryText && primaryKey) messaging[primaryKey] = norm.primaryText
      if (norm.description && descKey) messaging[descKey] = norm.description
      if (norm.cta && ctaKey) messaging[ctaKey] = norm.cta
      // A body-only channel (no headline slot): keep the post copy in the primary field.
      if (!Object.keys(messaging).length && primaryKey) messaging[primaryKey] = norm.primaryText || norm.headline || ''
      const ck = Object.values(messaging).join(' ¶ ').trim().toLowerCase()
      if (ck && seenCopy.has(ck)) {
        skipped++
        continue
      }
      let name = (norm.headline || norm.primaryText || `${source} post`).replace(/\s+/g, ' ').trim().slice(0, 60) || `${source} post`
      let n = 2
      const baseName = name
      while (seenNames.has(name)) name = `${baseName} ${n++}`
      seenNames.add(name)
      if (norm.sourceUrl) seenUrls.add(norm.sourceUrl)
      if (ck) seenCopy.add(ck)
      // Imported real posts/pages are LIVE (posted); a pasted audit is a draft to triage.
      const status: RowStatus = source === 'imported' ? 'draft' : 'posted'
      rows.push({
        assetId: '',
        id: freshRowId(),
        assetName: name,
        channel,
        assetType,
        mediaType: norm.mediaRefs?.length ? 'image' : 'image',
        messaging,
        campaign: c,
        client: brand,
        audience: (norm.audience ?? '').trim() || (get().clientAudiences[brand]?.[0]?.name ?? ''),
        ...(norm.stage ? { funnelStage: norm.stage } : {}),
        status,
        scheduledAt: norm.publishedAt || new Date().toISOString(),
        createdAt: Date.now(),
        source,
        sourceUrl: norm.sourceUrl,
        publishedAt: norm.publishedAt,
        mediaRefs: norm.mediaRefs,
        mediaRef: norm.mediaRefs?.[0],
        socialMetrics: norm.metrics,
        engagement: engagementFromMetrics(norm.metrics),
        ...(norm.metrics ? { metricsUpdatedAt: norm.metricsUpdatedAt ?? Date.now() } : {}),
        ...(status === 'posted' ? { postedAt: norm.publishedAt ? Date.parse(norm.publishedAt) || Date.now() : Date.now() } : {}),
      })
    }
    if (rows.length || updates.length) {
      pushUndo(get().rows)
      if (rows.length) await sheet.append(rows)
      for (const u of updates) await sheet.update(u.id, u.patch)
      await get().refresh()
    }
    return { imported: rows.length, updated: updates.length, skipped }
  },

  ingestBrandSite: async (brand, urlOverride) => {
    const s = get()
    const profile = (s.clientProfiles[brand] ?? {}) as { website?: string }
    const rec = (s.brandRecords.find((b) => b.name === brand) ?? {}) as Record<string, string>
    const website = (urlOverride || profile.website || rec.website || '').trim()
    if (!website) return { imported: 0, updated: 0, skipped: 0, ok: false, error: 'no-website' }
    try {
      const items = await ingestSite(website, { brand, workspace: (await getActiveWorkspaceId()) || undefined })
      if (!items.length) return { imported: 0, updated: 0, skipped: 0, ok: false, error: 'empty' }
      const r = await get().importAssets(brand, CONTENT_LIBRARY_CAMPAIGN, items, 'site')
      return { ...r, ok: true }
    } catch (e) {
      return { imported: 0, updated: 0, skipped: 0, ok: false, error: String((e as Error)?.message ?? e) }
    }
  },

  setRowStatus: async (id, status, note) => {
    const patch: Partial<TrafficRow> = { status }
    if (status === 'approved') patch.approvedAt = Date.now()
    if (note !== undefined) patch.reviewNote = note || undefined
    await get().updateRow(id, patch)
  },

  archiveRow: async (id) => {
    await get().updateRow(id, { archivedAt: Date.now() })
  },
  archiveRows: async (ids) => {
    if (!ids.length) return
    await get().updateRows(ids.map((id) => ({ id, patch: { archivedAt: Date.now() } })))
  },
  restoreRow: async (id) => {
    await get().updateRow(id, { archivedAt: undefined })
  },

  deleteCampaign: async (name) => {
    const c = name.trim()
    if (!c) return
    // Archive only the currently-live assets (soft, recoverable). Capturing the live set — not every
    // row ever archived under this name — lets undo restore EXACTLY what this delete hid, instead of
    // resurrecting old soft-deleted assets (which the blanket restoreCampaign would).
    const ids = get().rows.filter((r) => (r.campaign ?? '').trim() === c && !r.archivedAt).map((r) => r.id)
    if (ids.length) await get().archiveRows(ids)
    set((s) => {
      const campaignList = s.campaignList.map((x) => (x.name === c ? { ...x, archivedAt: Date.now() } : x))
      saveCampaigns(campaignList)
      const open = s.openProjects.filter((p) => p !== c)
      saveOpenProjects(open)
      return {
        campaignList,
        openProjects: open,
        campaignFilter: s.campaignFilter === c ? 'all' : s.campaignFilter,
      }
    })
    // Undo: un-archive the campaign record + exactly the assets this delete hid.
    const short = c.split(' — ').slice(1).join(' — ') || c
    get().showToastAction(`Deleted "${short}"`, 'Undo', async () => {
      set((s) => {
        const campaignList = s.campaignList.map((x) => (x.name === c ? { ...x, archivedAt: undefined } : x))
        saveCampaigns(campaignList)
        return { campaignList }
      })
      if (ids.length) await get().updateRows(ids.map((id) => ({ id, patch: { archivedAt: undefined } })))
      await get().refresh()
    })
  },
  restoreCampaign: async (name) => {
    const c = name.trim()
    if (!c) return
    const ids = get().rows.filter((r) => (r.campaign ?? '').trim() === c && r.archivedAt).map((r) => r.id)
    if (ids.length) await get().updateRows(ids.map((id) => ({ id, patch: { archivedAt: undefined } })))
    set((s) => {
      const campaignList = s.campaignList.map((x) => (x.name === c ? { ...x, archivedAt: undefined } : x))
      saveCampaigns(campaignList)
      return { campaignList }
    })
  },

  duplicateRow: async (id) => {
    const row = get().rows.find((r) => r.id === id)
    if (!row) return
    pushUndo(get().rows)
    const clone: TrafficRow = {
      ...row,
      id: freshRowId(),
      status: 'draft',
      createdAt: Date.now(),
      approvedAt: undefined,
      postedAt: undefined,
      error: undefined,
    }
    await sheet.append([clone])
    await get().refresh()
  },

  pasteAsset: async (id) => {
    const row = get().rows.find((r) => r.id === id)
    if (!row) return
    pushUndo(get().rows)
    // Unique name + no branchOf so it lands as its own card, not hidden behind the
    // original (the canvas trees by assetName).
    const existing = new Set(get().rows.map((r) => r.assetName))
    let name = `${row.assetName}-copy`
    let n = 2
    while (existing.has(name)) name = `${row.assetName}-copy-${n++}`
    const clone: TrafficRow = {
      ...row,
      id: freshRowId(),
      assetName: name,
      branchOf: row.branchOf,
      status: 'draft',
      createdAt: Date.now(),
      approvedAt: undefined,
      postedAt: undefined,
      error: undefined,
    }
    await sheet.append([clone])
    await get().refresh()
  },

  undo: async () => {
    const prev = undoStack.pop()
    if (!prev) return
    await sheet.replaceAll(prev)
    await get().refresh()
  },

  applyRowsSnapshot: async (rows) => {
    await sheet.replaceAll(rows)
    await get().refresh()
  },

  approveAll: async () => {
    // All gates must clear: messaging on-ICP, tracking clean, budgets set.
    if (!get().gateCleared || !get().trackingCleared || !get().budgetCleared) return
    const drafts = get().rows.filter((r) => r.status === 'draft')
    if (drafts.length === 0) return
    // Connection gate: don't ship a broken thread. Block if any open break sits in
    // a campaign whose drafts we're about to approve.
    const draftCampaigns = new Set(drafts.map((r) => (r.campaign ?? '').trim()))
    // Honor a Claude recheck of the current scope; otherwise the heuristic.
    const resolved = resolveBreaks(
      get().rows,
      get().claudeBreaks,
      get().claudeBreaksScope,
      breakScopeKey(get().clientFilter, get().campaignFilter),
    )
    const openInScope = applyBreakStatus(resolved, get().breakStatus).filter(
      (b) => b.status === 'open' && draftCampaigns.has(b.campaign),
    )
    if (openInScope.length > 0) return
    await sheet.setStatus(
      drafts.map((r) => r.id),
      'approved',
    )
    await get().refresh()
  },

  publishRow: async (id) => {
    const row = get().rows.find((r) => r.id === id)
    if (!row) return
    const publisher = publishers[row.channel]
    if (!publisher) {
      await sheet.update(id, { status: 'failed', error: 'No publisher for channel' })
      await get().refresh()
      return
    }
    const result = await publisher.publish(row)
    await sheet.update(id, {
      status: result.ok ? 'posted' : 'failed',
      postedAt: result.ok ? Date.now() : undefined,
      error: result.ok ? undefined : result.error,
    })
    await get().refresh()
  },

  clearSheet: async () => {
    await sheet.clear()
    await get().refresh()
  },

  loadSample: async () => {
    await sheet.clear()
    await sheet.append(sampleRows())
    // Bring in the sample ICP (pulled via Claude) alongside the sheet so the gate is populated.
    const icp = await icpSource.fetch()
    // Reset the break overlay so a sample reload restarts the demo clean at 4 breaks.
    saveBreakStatus({})
    set({ icp, icpFromClosedWon: false, batchReview: null, gateCleared: false, trackingRan: false, trackingCleared: false, budgetCleared: false, breakStatus: {} })
    await get().refresh()
    // The connection check runs over the fresh sample — record the result so the
    // audit trail opens with the check, not just the human actions on it.
    const found = detectBreaks(get().rows).length
    pushAudit(get, set, {
      breakId: 'check',
      action: 'check',
      summary: `Connection check ran — ${found} break${found === 1 ? '' : 's'} found across the campaign`,
    })
  },

  addMissingSlots: async (channel) => {
    const present = new Set(
      get()
        .rows.filter((r) => r.channel === channel)
        .map((r) => r.assetType),
    )
    // Skip the Other/custom escape hatch when filling required types.
    const missing = typesFor(channel).filter((x) => x.value !== 'other' && !present.has(x.value))
    if (missing.length === 0) return
    const nowIso = new Date().toISOString()
    const rows: TrafficRow[] = missing.map((type) => ({
      id: freshRowId(),
      assetId: '',
      assetName: '—',
      mediaType: 'text',
      channel,
      assetType: type.value,
      messaging: {},
      campaign: '',
      audience: '',
      scheduledAt: nowIso,
      status: 'draft',
      createdAt: Date.now(),
    }))
    await sheet.append(rows)
    await get().refresh()
  },

  openComments: (id) => set({ commentRowId: id }),
  openCommentInbox: () => set({ commentInboxOpen: true }),
  closeCommentInbox: () => set({ commentInboxOpen: false }),

  syncComments: async () => {
    const posted = get().rows.filter((r) => r.status === 'posted')
    const prev = get().comments
    // Ingest VIA CLAUDE: the engine calls ingest_comments per channel. The mock
    // message store is the fallback when there's no Anthropic key. Either way the
    // result lands in the unified messages store.
    const { map, live } = await ingestCommentsViaClaude(posted)
    if (live) {
      // Carry prior routing state (Clay enrichment, routed-to-Attio) forward.
      const merged: Record<string, Comment[]> = {}
      for (const [rowId, comments] of Object.entries(map)) {
        const byId = new Map((prev[rowId] ?? []).map((c) => [c.id, c]))
        merged[rowId] = comments.map((c) => {
          const was = byId.get(c.id)
          return was ? { ...c, clayRouted: was.clayRouted, enrichment: was.enrichment, routed: was.routed } : c
        })
      }
      await messageStore.persist(posted, merged)
      set({ comments: merged })
      return
    }
    const comments = await messageStore.sync(posted, prev)
    set({ comments })
  },

  routeToClay: (rowId, commentId) => {
    const comment = get().comments[rowId]?.find((c) => c.id === commentId)
    if (!comment) return
    const enrichment = enrichCommenter(comment)
    set((s) => ({
      comments: {
        ...s.comments,
        [rowId]: s.comments[rowId].map((c) =>
          c.id === commentId ? { ...c, clayRouted: true, enrichment } : c,
        ),
      },
    }))
    // Persist the enrichment to the message store (durable when on a backend).
    void messageStore.update(rowId, commentId, { clayRouted: true, enrichment })
  },

  routeCommenterToAttio: async (rowId, commentId) => {
    const row = get().rows.find((r) => r.id === rowId)
    const comment = get().comments[rowId]?.find((c) => c.id === commentId)
    if (!row || !comment) return
    const email = `${comment.author.toLowerCase().replace(/\s+/g, '.')}@example.test`
    await mockAttio.pushContact({
      email,
      name: comment.author,
      sourceAsset: row.assetName,
      sourceCampaign: row.campaign,
    })
    // Mark the comment routed so the UI reflects it, and persist it.
    set((s) => ({
      comments: {
        ...s.comments,
        [rowId]: s.comments[rowId].map((c) => (c.id === commentId ? { ...c, routed: true } : c)),
      },
    }))
    await messageStore.update(rowId, commentId, { routed: true })
  },

  openReview: (id) => set({ reviewRowId: id }),

  fillRowMedia: async (id, file) => {
    const [asset] = await filesToAssets([file])
    if (!asset) return
    const patch: Partial<TrafficRow> = { mediaRef: asset.previewUrl, mediaType: asset.mediaType }
    if (asset.body !== undefined) patch.body = asset.body
    await sheet.update(id, patch)
    await get().refresh()
  },

  extractCopy: async (id) => {
    const row = get().rows.find((r) => r.id === id)
    if (!row) return
    const result = await extractInCreativeCopy(row, realExtractTransport)
    await sheet.update(id, { extractedCopy: result.text })
    await get().refresh()
  },

  fanOutPreview: (campaign, dimension, values, exclude, limit) => {
    const s = get()
    const client = clientForCampaign(campaign)
    const inCampaign = s.rows.filter((r) => (r.campaign ?? '').trim() === campaign.trim())
    // Count over the leaves (what fanOut actually fans), so the preview matches reality
    // when cards are stacked. A leaf = a card that isn't already a variant-master; a
    // journey parent (branchOf) still counts as fannable.
    const variantMasters = new Set(inCampaign.map((r) => (r.variantOf ?? '').trim()).filter(Boolean))
    const base = inCampaign.filter((r) => !variantMasters.has(r.assetName))
    const effective = resolveBrandScope(client, s.brandSystems, s.brandMeta).library
    // The Account dimension fans across the campaign's target list (ABM); other
    // dimensions pull from the brand library / profile.
    const libVals =
      dimension === 'account'
        ? s.accountsForCampaign(campaign).map((a) => a.name)
        : dimensionValues(dimension, effective, s.clientProfiles[client])
    const vals = values && values.length ? values : libVals
    const plan = planFanout(base, dimension, vals, exclude ?? [])
    const count = limit && limit > 0 && plan.variantCount > limit ? limit : plan.variantCount
    // Channel-aware guardrail: how this count sits against the sensible cap for these
    // deliverables over the flight (SEO earns thousands; organic social should stay near cadence).
    const weeks = s.campaignList.find((c) => c.name === campaign)?.durationWeeks || 4
    const channels = base.map((r) => (r.channel ?? '') as string)
    const cap = capForChannels(channels, weeks)
    return { ...plan, variantCount: count, cap, ceiling: FANOUT_HARD_CEILING, verdict: fanoutVerdict(count, cap), recommendedDimension: recommendedDimension(channels) }
  },

  fanOut: async (campaign, dimension, values, opts) => {
    const s = get()
    const client = clientForCampaign(campaign)
    const inCampaign = s.rows.filter((r) => (r.campaign ?? '').trim() === campaign.trim())
    if (inCampaign.length === 0) return { variantCount: 0, created: 0 }
    const effective = resolveBrandScope(client, s.brandSystems, s.brandMeta).library
    const libVals =
      dimension === 'account'
        ? s.accountsForCampaign(campaign).map((a) => a.name)
        : dimensionValues(dimension, effective, s.clientProfiles[client])
    const vals = values && values.length ? values : libVals
    if (vals.length === 0) return { variantCount: 0, created: 0 }
    const exclude = opts?.exclude ?? []
    // Approved conditions can prune combinations ("if audience = beach then skip winter").
    const conditions = s.campaignConditions[campaign] ?? []
    // Fan the LEAVES so stacked cards push the tree DEEPER instead of re-fanning the
    // masters. A "master" here is a card that already has VARIANTS under it (variantOf),
    // NOT a journey parent (branchOf) — so a journey step still fans, while a card you
    // already fanned doesn't re-fan. (This is the fix for "some cards won't fan".)
    const variantMasters = new Set(inCampaign.map((r) => (r.variantOf ?? '').trim()).filter(Boolean))
    const base = inCampaign.filter((r) => !variantMasters.has(r.assetName))
    // One variant per (leaf x value), tagged with its full lineage. Each variant is a
    // VARIANT of (not a branch off) the leaf — a personalization sibling that sits side
    // by side with the master in the same stage, NOT a journey step. The dimension also
    // sets a real row field where it maps (audience, journey stage). Pruned combos skip.
    // Optional cap on the total variants. Iterate value-OUTER so the cap spreads
    // across every base card (each card gets the first value before any card gets a
    // second), rather than exhausting one card before moving on.
    // Channel-aware soft cap: without an explicit limit or `force`, hold the fan to the sensible
    // cap for these channels over the flight. `force` lifts the soft cap up to the hard ceiling
    // (which nothing exceeds, to protect the browser store).
    const weeks = s.campaignList.find((c) => c.name === campaign)?.durationWeeks || 4
    const channels = base.map((r) => (r.channel ?? '') as string)
    const softCap = capForChannels(channels, weeks)
    const plannedApprox = base.length * vals.length
    const policyLimit = opts?.force ? FANOUT_HARD_CEILING : Math.min(softCap, FANOUT_HARD_CEILING)
    const limit = opts?.limit && opts.limit > 0 ? opts.limit : policyLimit
    const variants: TrafficRow[] = []
    for (const value of vals) {
      if (variants.length >= limit) break
      for (const row of base) {
        const lineage = { ...(row.lineage ?? {}), [dimension]: value }
        if (isPruned(lineage, exclude)) continue
        if (resolveConditions({ audience: (row.audience ?? '').trim(), ...lineage }, conditions).exclude) continue
        variants.push({
          ...row,
          id: freshRowId(),
          assetName: `${row.assetName} · ${value}`,
          variantOf: row.assetName, // a personalization sibling, side by side with the master
          branchOf: undefined, // NOT a journey link — variants don't draw a connecting edge
          messaging: {}, // cleared so generation writes per-variant copy
          rtbMap: undefined,
          format: undefined,
          status: 'draft',
          createdAt: Date.now(),
          lineage,
          ...(dimensionField(dimension, value) ?? {}),
        })
        if (variants.length >= limit) break
      }
    }
    if (variants.length === 0) return { variantCount: 0, created: 0 }
    await sheet.append(variants)
    await get().refresh()
    if (opts?.generate !== false) {
      get().setClientFilter(client)
      get().setCampaignFilter(campaign)
      await get().draftCopy()
    }
    return { variantCount: variants.length, created: variants.length, cap: softCap, ceiling: FANOUT_HARD_CEILING, capped: variants.length < plannedApprox }
  },

  proposeConditions: (campaign) => {
    const s = get()
    const client = clientForCampaign(campaign)
    // Propose from the brand's EFFECTIVE library (own + inherited + shared), never a
    // cross-brand or the merged Unassigned bucket.
    const sys = resolveBrandScope(client, s.brandSystems, s.brandMeta).library
    const rows = s.rows.filter((r) => (r.campaign ?? '').trim() === campaign.trim())
    // The dimension values actually present in the campaign (audience + lineage).
    const present: Record<string, string[]> = {}
    const add = (k: string, v: string) => {
      if (!v) return
      ;(present[k] ??= []).includes(v) || present[k].push(v)
    }
    for (const r of rows) {
      add('audience', (r.audience ?? '').trim())
      for (const [k, v] of Object.entries(r.lineage ?? {})) add(k, v)
    }
    const proposed = proposeConditionsDomain({
      audiences: sys.audiences,
      rtbs: sys.rtbs,
      ctas: sys.ctas,
      hooks: sys.hooks,
      present,
    })
    // Keep a human's approve/reject across re-proposals; carry forward decisions for
    // conditions no longer re-proposed.
    const existing = s.campaignConditions[campaign] ?? []
    const byId = new Map(existing.map((c) => [c.id, c]))
    const merged: FanCondition[] = proposed.map((p) => {
      const prev = byId.get(p.id)
      return prev ? { ...p, status: prev.status } : p
    })
    for (const e of existing) if (!merged.some((m) => m.id === e.id) && e.status !== 'proposed') merged.push(e)
    const campaignConditions = { ...s.campaignConditions, [campaign]: merged }
    saveConditions(campaignConditions)
    set({ campaignConditions })
    return merged
  },

  setConditionStatus: (campaign, id, status) =>
    set((s) => {
      const list = (s.campaignConditions[campaign] ?? []).map((c) => (c.id === id ? { ...c, status } : c))
      const campaignConditions = { ...s.campaignConditions, [campaign]: list }
      saveConditions(campaignConditions)
      return { campaignConditions }
    }),

  // ---- Brand boundary actions ----
  setBrandNotice: (msg) => set({ brandNotice: msg }),
  showToast: (msg) => set({ toast: msg, toastAction: null }),
  showToastAction: (msg, label, run) => set({ toast: msg, toastAction: { label, run } }),

  brandBaselineFor: (brand) => {
    const s = get()
    const effective = resolveBrandScope(brand, s.brandSystems, s.brandMeta)
    const voice = resolveBrandVoice(
      brand,
      (b) => s.clientProfiles[b]?.voice ?? (s.brandGuides[b]?.confirmed ? s.brandGuides[b]?.guide?.voice : undefined),
      s.brandMeta,
    )
    return brandBaseline(effective, voice, s.brandMeta)
  },

  setBrandParent: (brand, parent) =>
    set((s) => {
      const b = brand.trim()
      if (!b) return {}
      const p = parent?.trim()
      // No self-parenting and no cycles (the new parent can't already descend from brand).
      const wouldCycle = !!p && (p === b || ancestorsOf(p, s.brandMeta).includes(b))
      const meta: BrandMeta = { ...(s.brandMeta[b] ?? {}) }
      if (p && !wouldCycle) meta.parent = p
      else delete meta.parent
      const brandMeta = { ...s.brandMeta, [b]: meta }
      saveBrandMeta(brandMeta)
      return { brandMeta }
    }),

  setBrandShare: (brand, share, on) =>
    set((s) => {
      const b = brand.trim()
      const sh = share.trim()
      if (!b || !sh || sh === b) return {}
      const meta: BrandMeta = { ...(s.brandMeta[b] ?? {}) }
      const set0 = new Set(meta.shares ?? [])
      if (on) set0.add(sh)
      else set0.delete(sh)
      meta.shares = [...set0]
      if (!meta.shares.length) delete meta.shares
      const brandMeta = { ...s.brandMeta, [b]: meta }
      saveBrandMeta(brandMeta)
      return { brandMeta }
    }),

  setBrandDraft: (brand, draft) =>
    set((s) => {
      const b = brand.trim()
      if (!b) return {}
      const meta: BrandMeta = { ...(s.brandMeta[b] ?? {}) }
      if (draft) meta.draft = true
      else delete meta.draft
      const brandMeta = { ...s.brandMeta, [b]: meta }
      saveBrandMeta(brandMeta)
      return { brandMeta }
    }),

  promoteBrand: (draftBrand, realName) => {
    const s = get()
    const from = draftBrand.trim()
    const to = (realName ?? draftBrand).trim()
    if (!from) return
    // Same name: just clear the draft flag in place.
    if (to === from) {
      s.setBrandDraft(from, false)
      return
    }
    // Rename: carry the brand's library / profile / meta (minus draft) under the new
    // name, repoint its campaigns, and drop the old draft key.
    const brandSystems = { ...s.brandSystems }
    if (brandSystems[from]) brandSystems[to] = brandSystems[from]
    delete brandSystems[from]
    const clientProfiles = { ...s.clientProfiles }
    if (clientProfiles[from]) clientProfiles[to] = clientProfiles[from]
    delete clientProfiles[from]
    const brandMeta = { ...s.brandMeta }
    const carried: BrandMeta = { ...(brandMeta[from] ?? {}) }
    delete carried.draft
    if (Object.keys(carried).length) brandMeta[to] = carried
    delete brandMeta[from]
    const clientList = s.clientList.map((c) => (c === from ? to : c)).filter((c, i, a) => a.indexOf(c) === i)
    // Repoint campaigns from the draft brand onto the promoted brand.
    const campaignList = s.campaignList.map((c) => (c.client === from ? { ...c, client: to } : c))
    for (const c of campaignList) registerCampaign(c.name, c.client)
    saveBrandSystems(brandSystems)
    saveClientProfiles(clientProfiles)
    saveBrandMeta(brandMeta)
    saveClients(clientList)
    saveCampaigns(campaignList)
    set({
      brandSystems,
      clientProfiles,
      brandMeta,
      clientList,
      campaignList,
      clientFilter: s.clientFilter === from ? to : s.clientFilter,
      messagingBrand: s.messagingBrand === from ? to : s.messagingBrand,
    })
  },

  // ---- ABM: target accounts ----
  addAccount: (brand, patch) => {
    const b = brand.trim()
    const account = newAccount(b, patch)
    const s = get()
    s.addClient(b)
    const list = [...(s.accountsByBrand[b] ?? []), account]
    const accountsByBrand = { ...s.accountsByBrand, [b]: list }
    saveJson(ACCOUNTS_KEY, accountsByBrand)
    set({ accountsByBrand })
    return account
  },

  updateAccount: (brand, id, patch) =>
    set((s) => {
      const b = brand.trim()
      const list = (s.accountsByBrand[b] ?? []).map((a) => (a.id === id ? { ...a, ...patch, id: a.id, brand: b } : a))
      const accountsByBrand = { ...s.accountsByBrand, [b]: list }
      saveJson(ACCOUNTS_KEY, accountsByBrand)
      return { accountsByBrand }
    }),

  setAccountStatus: (brand, id, status) => get().updateAccount(brand, id, { status }),

  removeAccount: (brand, id) =>
    set((s) => {
      const b = brand.trim()
      const list = (s.accountsByBrand[b] ?? []).filter((a) => a.id !== id)
      const accountsByBrand = { ...s.accountsByBrand, [b]: list }
      // Drop it from any target list too.
      const targetLists = s.targetLists.map((t) => ({ ...t, accountIds: t.accountIds.filter((x) => x !== id) }))
      saveJson(ACCOUNTS_KEY, accountsByBrand)
      saveJson(TARGET_LISTS_KEY, targetLists)
      return { accountsByBrand, targetLists }
    }),

  createTargetList: (brand, name, accountIds = []) => {
    const list = newTargetList(brand.trim(), name, accountIds)
    const s = get()
    const targetLists = [...s.targetLists, list]
    saveJson(TARGET_LISTS_KEY, targetLists)
    set({ targetLists })
    return list
  },

  setTargetListAccounts: (listId, accountIds) =>
    set((s) => {
      const targetLists = s.targetLists.map((t) => (t.id === listId ? { ...t, accountIds: [...new Set(accountIds)] } : t))
      saveJson(TARGET_LISTS_KEY, targetLists)
      return { targetLists }
    }),

  removeTargetList: (listId) =>
    set((s) => {
      const targetLists = s.targetLists.filter((t) => t.id !== listId)
      const campaignTargetList = Object.fromEntries(Object.entries(s.campaignTargetList).filter(([, id]) => id !== listId))
      saveJson(TARGET_LISTS_KEY, targetLists)
      saveJson(CAMPAIGN_TARGET_KEY, campaignTargetList)
      return { targetLists, campaignTargetList }
    }),

  attachTargetList: (campaign, listId) =>
    set((s) => {
      const c = campaign.trim()
      const campaignTargetList = { ...s.campaignTargetList }
      if (listId) campaignTargetList[c] = listId
      else delete campaignTargetList[c]
      saveJson(CAMPAIGN_TARGET_KEY, campaignTargetList)
      return { campaignTargetList }
    }),

  accountsForCampaign: (campaign) => {
    const s = get()
    const listId = s.campaignTargetList[campaign.trim()]
    if (!listId) return []
    const list = s.targetLists.find((t) => t.id === listId)
    if (!list) return []
    const byId = new Map((s.accountsByBrand[list.brand] ?? []).map((a) => [a.id, a]))
    return list.accountIds.map((id) => byId.get(id)).filter((a): a is Account => !!a)
  },

  // ---- Saved Views (smart canvases) ----
  createSavedView: (brand, name, patch) => {
    const view = newSavedView(brand.trim(), name, patch)
    const s = get()
    get().addClient(brand.trim())
    const savedViews = [...s.savedViews, view]
    saveJson(SAVED_VIEWS_KEY, savedViews)
    set({ savedViews })
    return view
  },
  updateSavedView: (id, patch) =>
    set((s) => {
      const savedViews = s.savedViews.map((v) => (v.id === id ? { ...v, ...patch, id: v.id, brand: v.brand, createdAt: v.createdAt } : v))
      saveJson(SAVED_VIEWS_KEY, savedViews)
      return { savedViews }
    }),
  deleteSavedView: (id) =>
    set((s) => {
      const savedViews = s.savedViews.filter((v) => v.id !== id)
      saveJson(SAVED_VIEWS_KEY, savedViews)
      return { savedViews }
    }),

  draftCopy: async (rowIds) => {
    const { rows, icp, filter, query, clientFilter, campaignFilter } = get()
    // Targets: explicit ids, else every in-scope reviewable row with no copy yet.
    const targets = rowIds
      ? rows.filter((r) => rowIds.includes(r.id))
      : rows.filter(
          (r) =>
            rowInScope(r, { filter, query, clientFilter, campaignFilter }) &&
            r.status !== 'posted' &&
            r.status !== 'failed' &&
            !messagingAllText(r).trim(),
        )
    if (targets.length === 0) return null
    // Which writer produced the copy. 'heuristic' is sticky (a single fallback means
    // the run isn't fully Claude-written), so the badge never over-claims.
    let copySource: CopySource | null = null
    set({ drafting: true })
    try {
      // Group by campaign so RTBs (proof) stay scoped and shared within a story.
      const byCampaign = new Map<string, TrafficRow[]>()
      for (const r of targets) {
        const k = r.campaign ?? ''
        const list = byCampaign.get(k)
        if (list) list.push(r)
        else byCampaign.set(k, [r])
      }
      const rtbStore = loadCampaignRtbs()
      for (const [campaign, crows] of byCampaign) {
        const client = clientForCampaign(campaign)
        // HARD BOUNDARY: a canvas must bind to a brand to generate. A brand-less
        // (Unassigned) campaign is the contamination failure mode — refuse rather than
        // read the shared catch-all bucket. A draft brand is a real, isolated binding.
        if (isBrandless(client) && !isDraftBrand(client, get().brandMeta)) {
          get().setBrandNotice(`Bind "${campaign || 'this canvas'}" to a brand before generating. A brand-less canvas has no voice or proof to write from.`)
          continue
        }
        const brand = get().clientProfiles[client]
        const bg = get().brandGuides[client]
        const brandGuide = bg?.confirmed ? bg.guide : undefined
        // The brand's EFFECTIVE messaging system (its own assets + inherited from
        // ancestors + explicitly shared) supplies the four composition inputs: stage
        // (derived), audience (assigned/derived), CTA seed, and proof. Resolving through
        // the brand scope is the ONLY read path — no other brand's assets can reach here.
        const sys = resolveBrandScope(client, get().brandSystems, get().brandMeta).library
        // Audiences can live in the brand's system library OR only in clientAudiences — the store the
        // audience selector and canvas lanes write to, and where the data-driven flow puts them. Merge
        // both (clientAudiences wins on a name collision, being the actively-maintained source) so a
        // "Personalized to" pick always resolves to the full persona (angle + pains), even for brands
        // whose brandSystems audiences are empty. Without this, personalization silently falls back.
        const libAudiences = mergeAudiences(sys.audiences, get().clientAudiences[client] ?? [])
        const libCtas = sys.ctas
        const proofPool: Rtb[] = sys.rtbs
        // Record Tags checked on the campaign brief PIN the messaging inputs so every card
        // the campaign is connected to reflects them: each asset speaks to the referenced
        // segment(s) and leans on the referenced proof point(s), instead of rotating the
        // brand's whole library. With none checked, both pools fall back to the full library
        // (unchanged behavior). Company / person / channel tags are structural references
        // (who/where, not copy content), so they don't constrain the pools here.
        const campaignRefs = get().campaignList.find((c) => c.name === campaign)?.references ?? []
        // What the campaign's objects instruct, persisted on the campaign so a regeneration months
        // later still writes to the direction that produced the original draft.
        const campaignDirection = get().campaignList.find((c) => c.name === campaign)?.direction ?? []
        // Compute the pinned audience + proof pools from a reference list. A deliverable can
        // OVERRIDE the campaign's refs per-asset (row.references), so each row pins from its own
        // effective set — one deliverable can target a different segment/proof than the rest.
        const poolsFrom = (refList: FlowReference[]) => {
          const segIds = new Set(refList.filter((x) => x.type === 'segment').map((x) => x.id))
          const segNames = new Set(refList.filter((x) => x.type === 'segment').map((x) => x.label))
          const auds = libAudiences.filter((a) => segIds.has(a.id) || segNames.has(a.name))
          const prIds = new Set(refList.filter((x) => x.type === 'proof').map((x) => x.id))
          const prLabels = new Set(refList.filter((x) => x.type === 'proof').map((x) => x.label))
          const prf = proofPool.filter((p) => prIds.has(p.id) || prLabels.has(p.label))
          return { audiencePool: auds.length ? auds : libAudiences, activeProof: prf.length ? prf : proofPool }
        }
        const campaignPools = poolsFrom(campaignRefs)
        const activeProof = campaignPools.activeProof
        // CTAs are VERBATIM from the brand's list and DISTRIBUTED across the set:
        // pick the globally least-used CTA, preferring a stage match among ties. This
        // caps repetition (no one CTA dominates) even when a stage has few CTAs, while
        // still landing a stage-appropriate CTA wherever the list allows.
        const ctaUse = new Map<string, number>()
        const pickCta = (stage: string): string | undefined => {
          if (!libCtas.length) return undefined
          // Stage match is the PRIMARY key (never put a conversion CTA on an awareness
          // asset just to spread), then least-used so the stage's CTAs distribute. If a
          // stage has fewer CTAs than assets, the pool is smaller than the demand and
          // some repeat is unavoidable (but no single CTA dominates the whole set).
          const scored = libCtas
            .map((c) => ({ label: c.label, use: ctaUse.get(c.label) ?? 0, match: !c.stage || c.stage === stage }))
            .sort((a, b) => Number(b.match) - Number(a.match) || a.use - b.use)
          const chosen = scored[0].label
          ctaUse.set(chosen, (ctaUse.get(chosen) ?? 0) + 1)
          return chosen
        }
        // Approved conditions repoint a variant's proof / CTA / hook by its lineage
        // ("if audience = X then proof Y"). Resolved per row below.
        const conditions = get().campaignConditions[campaign] ?? []
        // Per-account context (segment, situation, lead concern) so a 1:1 ABM variant
        // reads in terms of the account's real situation, not a name swap.
        const accountByName = new Map((get().accountsByBrand[client] ?? []).map((acc) => [acc.name.toLowerCase(), acc]))
        // Journey CTAs: when an asset leads to a next step (a deliverable branched off it, or an
        // explicit linksTo), point that asset's CTA AT the next step so a YouTube ad that leads to
        // a newsletter actually says "Subscribe to the newsletter" instead of a generic ask.
        const journeyCta = (ch: ChannelId, ty?: string): string => {
          const t = (ty ?? '').toLowerCase()
          switch (ch) {
            case 'email':
              return t.includes('newsletter') ? 'Subscribe to the newsletter' : t.includes('welcome') ? 'Join the list' : t.includes('promo') ? 'Unlock the offer' : 'Get it in your inbox'
            case 'sms': return 'Get text updates'
            case 'landing-page': return 'See how it works'
            case 'website': return 'Explore the site'
            case 'blog': return 'Read the full story'
            case 'lead-magnet':
              return t.includes('webinar') ? 'Save your seat' : t.includes('checklist') ? 'Get the checklist' : t.includes('ebook') || t.includes('whitepaper') || t.includes('guide') ? 'Download the guide' : 'Get the free download'
            case 'events': return 'Save your seat'
            default: return CHANNELS[ch]?.label ? `Explore ${CHANNELS[ch].label}` : 'See what’s next'
          }
        }
        // Built from the FULL campaign (not just the rows being redrafted) so an asset's CTA still
        // names its next step when only that asset is regenerated.
        const campaignRows = get().rows.filter((x) => x.campaign === campaign && !x.archivedAt)
        const nextStepCta = new Map<string, string>() // source assetName → CTA naming its next step
        for (const x of campaignRows) {
          if (x.branchOf && !nextStepCta.has(x.branchOf)) nextStepCta.set(x.branchOf, journeyCta(x.channel, x.assetType))
        }
        for (const r of campaignRows) {
          if (!r.linksTo || nextStepCta.has(r.assetName)) continue
          const target = campaignRows.find((x) => x.assetName === r.linksTo)
          if (target) nextStepCta.set(r.assetName, journeyCta(target.channel, target.assetType))
        }
        const assets: DraftAsset[] = crows.map((r, i) => {
          const stage = funnelStageFor(r.channel, r.assetType)
          // Per-row effective pools: the row's own record-tag override if it has one, else the
          // campaign's. Lets a single deliverable speak to a different segment/proof.
          const eff = r.references && r.references.length ? poolsFrom(r.references) : campaignPools
          const aud =
            eff.audiencePool.find((x) => x.name === r.audience) ??
            (eff.audiencePool.length ? eff.audiencePool[i % eff.audiencePool.length] : undefined)
          const rotated = eff.activeProof.length ? eff.activeProof[i % eff.activeProof.length] : undefined
          // Non-structural lineage (location, time, lifecycle, …) becomes copy context
          // so fanned variants localize and stay distinct. audience/journey are already
          // structural fields, so exclude them here.
          const context: Record<string, string> = {}
          for (const [k, val] of Object.entries(r.lineage ?? {})) if (k !== 'audience' && k !== 'journey' && !BLUEPRINT_META_KEYS.includes(k as (typeof BLUEPRINT_META_KEYS)[number])) context[k] = val
          // An account variant carries the account's real situation (segment, ambition,
          // lead concern) so BlackRock and Robinhood variants differ on substance.
          const acct = context.account ? accountByName.get(context.account.toLowerCase()) : undefined
          if (acct) Object.assign(context, accountContext(acct))
          // Apply approved conditions for this variant's context.
          const journeyLabel = FUNNEL_STAGES.find((st) => st.stage === stage)?.label ?? ''
          const cond = resolveConditions({ audience: (r.audience ?? '').trim(), journey: journeyLabel, ...(r.lineage ?? {}) }, conditions)
          const proof = (cond.proofId && proofPool.find((p) => p.id === cond.proofId)) || rotated
          return {
            rowId: r.id,
            assetName: r.assetName,
            channel: r.channel,
            type: r.assetType,
            fields: messagingFields(r.channel, r.assetType),
            stage,
            audience: aud
              ? { name: aud.name, role: aud.role, angle: aud.messageAngle, pains: aud.pains }
              : r.audience
                ? { name: r.audience }
                : undefined,
            ctaSeed: cond.cta ?? nextStepCta.get(r.assetName) ?? pickCta(stage),
            proof: proof ? { id: proof.id, label: proof.label, detail: proof.detail } : undefined,
            context: Object.keys(context).length ? context : undefined,
            hook: cond.hook,
            // The objects wired to this campaign, as per-asset instructions. buildDirection is the
            // ONLY producer: it caps, prioritises and drops unknown keys, so a stale persisted key
            // can never reach the prompt.
            direction: campaignDirection.length ? buildDirection(campaignDirection) : undefined,
            index: i,
          }
        })
        // Anchor the set to the campaign brief's throughline so every asset connects back to it.
        // The Subject (what the campaign is about) leads; the core message the assets carry and the
        // goal fill it out, so the theme is meaningful even when the Subject alone is thin. Falls back
        // to the campaign name so there is always an anchor. Duration is the timeframe.
        const campMeta = get().campaignList.find((c) => c.name === campaign)
        const themeParts = [campMeta?.subject?.trim(), campMeta?.goalMessage?.trim()].filter(Boolean)
        const theme = themeParts.length
          ? themeParts.join('. ')
          : campMeta?.objective?.trim()
            ? `Campaign goal: ${campMeta.objective.trim()}`
            : campaign.trim() || undefined
        // The brand's hook list seeds openings so bodies don't lead with a fixed phrase.
        // ⚠️ The sent pool must be the union of the campaign-narrowed pool AND every proof actually
        // assigned to an asset. A pinned proof (cond.proofId) is resolved against the FULL brand
        // library above, while activeProof is narrowed to the campaign's proof refs, so a condition
        // could hand an asset a proof whose id is absent from the pool we send. The prompt tells the
        // model not to invent proof when the pool is non-empty, so that combination told it to lean
        // on a proof it was not allowed to cite.
        const assignedProof = assets
          .map((a) => a.proof)
          .filter((pr): pr is { id: string; label: string; detail?: string } => !!pr)
        const sentProof = [...activeProof]
        for (const pr of assignedProof) {
          if (!sentProof.some((x) => x.id === pr.id)) {
            const full = proofPool.find((x) => x.id === pr.id)
            if (full) sentProof.push(full)
          }
        }
        const baseReq = { icp, campaign, theme, flightWeeks: campMeta?.durationWeeks, brand, brandGuide, proofPool: sentProof, hooks: sys.hooks.map((h) => h.text).filter(Boolean) }
        const result = await copyWriter.draft({ ...baseReq, assets })
        // Track the writer: once any group falls back to the heuristic, the whole
        // run is 'heuristic'; otherwise it's 'claude'.
        if (result.source === 'heuristic') copySource = 'heuristic'
        else if (result.source === 'claude' && copySource !== 'heuristic') copySource = 'claude'
        // Anti-repetition: regenerate any unit whose headline / primary / CTA
        // collides across the campaign, so the set reads as distinct assets.
        await dedupeCampaignDrafts(result, assets, baseReq)
        // Register + persist the campaign's drafted proof (merged with any authored).
        if (campaign && result.rtbs.length) {
          const existing = rtbsForCampaign(campaign)
          const seen = new Set(existing.map((r) => r.id))
          const merged = [...existing, ...result.rtbs.filter((r) => !seen.has(r.id))]
          registerCampaignRtbs(campaign, merged)
          rtbStore[campaign] = merged
        }
        // Fill ONLY empty fields (never overwrite a human edit); attach proof to
        // the primary + CTA components so the handoff carries through.
        for (const d of result.drafts) {
          const row = crows.find((r) => r.id === d.rowId)
          if (!row) continue
          const fields = messagingFields(row.channel, row.assetType)
          const fieldByKey = new Map(fields.map((f) => [f.key, f]))
          const map: Record<string, string> = { ...(row.messaging ?? {}) }
          // Clamp each component to its field's hard limit as a safety net — a model overrun
          // (a pillar-guide SEO title especially) must never land as an over-length headline.
          for (const c of d.components) if (!map[c.key]?.trim()) map[c.key] = clampToLimit(c.value, fieldByKey.get(c.key))
          const primaryKey = fields[0]?.key
          const ctaKey = fields.find((f) => /cta/i.test(f.key))?.key
          const ids = d.rtbIds.length ? d.rtbIds : result.rtbs[0] ? [result.rtbs[0].id] : []
          const rmap: Record<string, string[]> = { ...(row.rtbMap ?? {}) }
          if (ids.length) {
            if (primaryKey && !(rmap[primaryKey]?.length)) rmap[primaryKey] = ids
            if (ctaKey && !(rmap[ctaKey]?.length)) rmap[ctaKey] = ids
          }
          // Persist the chosen execution format (set only by generation, so a human
          // edit isn't overwritten on re-draft).
          const patch: Partial<TrafficRow> = { messaging: map, rtbMap: rmap }
          if (d.format && !row.format) patch.format = d.format
          await sheet.update(row.id, patch)
        }
      }
      saveCampaignRtbs(rtbStore)
    } finally {
      set({ drafting: false })
      await get().refresh()
    }
    // Copy actually written by Claude is proof the connection works — complete that step.
    if (copySource === 'claude') get().markOnboardingDone('connect')
    return copySource
  },

  previewFlowCopy: async ({ client, channel, assetType, briefs, audiences, proof: proofRefLabels, theme, flightWeeks, steps, direction }) => {
    if (!briefs.length) return null
    // Same hard boundary as draftCopy: a brand must be bound to generate. A brandless
    // (or non-draft-brandless) client has no voice/proof to write from.
    if (isBrandless(client) && !isDraftBrand(client, get().brandMeta)) return null
    const brand = get().clientProfiles[client]
    const bg = get().brandGuides[client]
    const brandGuide = bg?.confirmed ? bg.guide : undefined
    // The brand's effective messaging system supplies audience / proof / CTA — the same
    // scoped read path draftCopy uses, so preview copy matches what a build would write.
    const sys = resolveBrandScope(client, get().brandSystems, get().brandMeta).library
    // Merge clientAudiences (see draftCopy) so preview personas carry angle + pains too.
    const libAudiences = mergeAudiences(sys.audiences, get().clientAudiences[client] ?? [])
    // Pin proof to the checked proof tags so preview cards lean on the same reasons-to-believe
    // a build would write; empty = the brand's whole proof library (unchanged behavior).
    const pinnedProof = proofRefLabels?.length ? sys.rtbs.filter((p) => proofRefLabels.includes(p.label)) : []
    const proofPool: Rtb[] = pinnedProof.length ? pinnedProof : sys.rtbs
    const fields = messagingFields(channel, assetType)
    const stage = funnelStageFor(channel, assetType)
    // Which audiences to write to (selected names, else the brand's own), rotated per slot.
    const chosen = audiences.length ? audiences : libAudiences.map((a) => a.name)
    const assets: DraftAsset[] = briefs.map((brief, i) => {
      const audName = chosen.length ? chosen[i % chosen.length] : undefined
      const aud = libAudiences.find((x) => x.name === audName)
      const proof = proofPool.length ? proofPool[i % proofPool.length] : undefined
      const b = brief?.trim()
      return {
        rowId: `preview-${i}`,
        assetName: '',
        channel,
        type: assetType,
        fields,
        stage,
        audience: aud
          ? { name: aud.name, role: aud.role, angle: aud.messageAngle, pains: aud.pains }
          : audName
            ? { name: audName }
            : undefined,
        // A blueprint step's CTA wins over the rotated library CTA when present.
        ctaSeed: steps?.[i]?.cta || (sys.ctas.length ? sys.ctas[i % sys.ctas.length].label : undefined),
        proof: proof ? { id: proof.id, label: proof.label, detail: proof.detail } : undefined,
        // The mini brief drives this slot's copy (mirrors lineage.brief on a real build),
        // plus any blueprint guidance (framework / subject formula / allowed levers).
        context: (() => {
          const st = steps?.[i]
          const ctx: Record<string, string> = {}
          if (b) ctx.brief = b
          if (st?.framework) ctx.framework = st.framework
          if (st?.subjectFormula && st.subjectFormula !== '—') ctx.subjectFormula = st.subjectFormula
          if (st?.levers) ctx.levers = st.levers
          return Object.keys(ctx).length ? ctx : undefined
        })(),
        // Same producer as the build path. Missing this is how a second silently unwired path
        // gets created: the canvas preview would show copy the build would not write.
        direction: direction?.length ? buildDirection(direction) : undefined,
        index: i,
      }
    })
    // campaign = client so the heuristic fallback still names the brand correctly.
    // theme + flightWeeks anchor the whole set to the campaign brief.
    const baseReq = { icp: get().icp, campaign: client, theme, flightWeeks, brand, brandGuide, proofPool, hooks: sys.hooks.map((h) => h.text).filter(Boolean) }
    const result = await copyWriter.draft({ ...baseReq, assets })
    // Pull headline + primary per slot for the card preview (same role heuristic as the writer).
    const headKey = fields.find((f) => /headline|subject|title|subhead|^h\d/i.test(f.key))?.key
    const primKey = (fields.find((f) => /primary|body|caption|intro|post|message/i.test(f.key)) ?? fields[0])?.key
    const byRow = new Map(result.drafts.map((d) => [d.rowId, d]))
    const fieldByKey = new Map(fields.map((f) => [f.key, f]))
    const posts = assets.map((a) => {
      const d = byRow.get(a.rowId)
      // Clamp to each field's hard limit so the preview matches the (clamped) committed copy.
      const val = (k?: string) =>
        k ? clampToLimit(d?.components.find((c) => c.key === k)?.value ?? '', fieldByKey.get(k)) : ''
      // Every field, labeled and in schema order, so a page can show its copy as
      // organized components (headline / subhead / proof / body / cta) not a text wall.
      const components = fields.map((f) => ({ key: f.key, label: f.label, value: val(f.key) })).filter((c) => c.value.trim())
      return { headline: val(headKey), primary: val(primKey), components }
    })
    return { source: result.source ?? null, posts }
  },

  toggleReviewed: async (id, value) => {
    await sheet.update(id, { copyReviewed: value })
    await get().refresh()
  },

  loadIcp: async () => {
    const icp = await icpSource.fetch()
    set({ icp, icpFromClosedWon: false })
  },

  setIcp: (icp) => set({ icp, icpFromClosedWon: false, batchReview: null, gateCleared: false }),

  refreshIcpFromClosedWon: () => {
    // Feedback loop: real closed-won buyers sharpen the ICP that drives the gate.
    set({ icp: mockAttio.closedWonIcp(), icpFromClosedWon: true, batchReview: null, gateCleared: false })
  },

  runBatchReview: async () => {
    const campaignFilter = get().campaignFilter
    set({ reviewing: true })
    let icp = get().icp
    if (!icp) {
      icp = await icpSource.fetch()
      set({ icp })
    }
    const batchReview = await icpReviewer.review(icp, get().rows)
    set({ batchReview, reviewing: false })
    // Wire the gate into the lifecycle: running the approval review on a campaign
    // that's still being built moves it into In Review (it's now at the gate).
    if (campaignFilter !== 'all') {
      const camp = get().campaignList.find((c) => c.name === campaignFilter)
      const cRows = get().rows.filter((r) => (r.campaign ?? '').trim() === campaignFilter)
      if (deriveCampaignStatus(camp, cRows) === 'planning') {
        get().setCampaignStatus(campaignFilter, 'in-review')
      }
    }
  },

  acceptReview: () => {
    // Capture the human's coherence calls before unlocking. Each flag the user
    // accepts the batch over becomes a decision row: 'resolved' if they'd already
    // fixed it, 'overridden' if they judged it coherent enough to ship anyway.
    const { batchReview, rows, icp, clientAudiences, coherenceDecisions, campaignFilter } = get()
    if (batchReview && batchReview.flags.length > 0) {
      const pains = icp?.pains ?? []
      const at = Date.now()
      const audienceFor = (r: (typeof rows)[number]): string => {
        if (r.audience?.trim()) return r.audience.trim()
        const client = clientForCampaign(r.campaign)
        return clientAudiences[client]?.[0]?.name?.trim() || 'Unsegmented'
      }
      const fresh: CoherenceDecision[] = batchReview.flags.map((fl) => {
        const row = rows.find((r) => r.id === fl.rowId)
        const resolved = row ? flagResolved(fl, row, pains) : false
        return {
          id: freshDecisionId(),
          variantId: fl.rowId,
          assetName: fl.assetName,
          campaign: (row?.campaign ?? '').trim(),
          client: clientForCampaign(row?.campaign),
          audienceType: row ? audienceFor(row) : 'Unsegmented',
          field: fl.field?.label,
          issue: fl.issue,
          batchVerdict: batchReview.verdict,
          verdict: resolved ? 'resolved' : 'overridden',
          at,
        }
      })
      const next = [...coherenceDecisions, ...fresh]
      saveCoherenceDecisions(next)
      set({ coherenceDecisions: next, gateCleared: true })
    } else {
      set({ gateCleared: true })
    }
    // Wire the gate into the lifecycle: approving a specific campaign at the gate
    // advances it past In Review into Active — it's cleared to run.
    if (campaignFilter !== 'all') get().setCampaignStatus(campaignFilter, 'active')
  },

  setAggregateContributing: (on) => {
    saveAggregateContributing(on)
    set({ aggregateContributing: on })
    // Opting in publishes the current anonymized patterns; opting out stops (existing rows are the
    // caller's to clear).
    if (on) void get().contributeAggregate()
  },
  contributeAggregate: async () => {
    if (!get().aggregateContributing) return
    const cid = await contributorId()
    if (!cid) return
    const s = get()
    const map = buildOutcomeMap(s.rows, { clientAudiences: s.clientAudiences, campaigns: s.campaignList })
    await contribute(buildContributions(map, cid))
  },
  setAiModel: (id) => {
    saveAiModel(id)
    set({ aiModel: id })
  },
  setUserPrefs: (patch) =>
    set((s) => {
      userPrefsTouchedThisSession = true
      const userPrefs = { ...s.userPrefs, ...patch }
      persistState(USER_PREFS_KEY, userPrefs)
      // On an explicit role pick, land on that role's home surface and confirm where you landed
      // (bias only, everything stays reachable). NOT on a workspace with no brands yet: a role's
      // landing page is a working surface, so a brand-new user would be dropped on an empty
      // Insights or Library instead of the one screen that tells them what to do first.
      const fresh = Object.keys(s.clientProfiles).length === 0 && s.clientList.length === 0
      const preset = patch.marketerRole && !fresh ? ROLE_PRESETS[patch.marketerRole] : null
      return preset
        ? { userPrefs, page: preset.landingPage, toast: `Landing on ${preset.landingLabel}. Everything stays one click away.`, toastAction: null }
        : { userPrefs }
    }),

  resolveSkillDefault: () =>
    set((s) => {
      // Runs once after hydration. If the user has never chosen (or been resolved to) a detail level,
      // start a fresh, empty workspace in Simple (the calm surface) and any workspace that already has
      // data in Advanced (today's full UI), so existing users never regress. Then persist so it's stable.
      if (s.userPrefs.skillLevel !== null) return {}
      // "Has data" must cover EVERY way a workspace can hold real work, not just campaigns/canvases/
      // audiences — a user who set up their brand and imported a CRM (records) but hasn't built a
      // campaign yet is NOT empty, and must not be forced into Simple (which would hide those very
      // sections). Any populated record list, brand profile, or canvas/campaign/audience counts.
      const recordLists = [s.companies, s.people, s.brandRecords, s.messages, s.segments, s.objectives, s.channelRecords, s.voices, s.patterns, s.triggers]
      const hasData =
        s.campaignList.length > 0 ||
        s.canvases.length > 0 ||
        Object.keys(s.clientProfiles).length > 0 ||
        Object.values(s.clientAudiences).some((a) => a.length > 0) ||
        recordLists.some((r) => r.length > 0)
      const userPrefs = { ...s.userPrefs, skillLevel: hasData ? ('advanced' as const) : ('simple' as const) }
      persistState(USER_PREFS_KEY, userPrefs)
      return { userPrefs }
    }),

  openBreaks: (breakId) => set({ breaksOpen: true, activeBreakId: breakId ?? null }),
  closeBreaks: () => set({ breaksOpen: false, activeBreakId: null }),

  runCoherenceCheck: async () => {
    const { rows, clientFilter, campaignFilter, icp, brandGuides, brandSystems, clientProfiles, brandMeta } = get()
    if (clientFilter === 'all') return
    // The check needs a brand to measure against — a brand-less canvas has no spec.
    if (isBrandless(clientFilter) && !isDraftBrand(clientFilter, brandMeta)) {
      get().setBrandNotice('Bind this canvas to a brand to run the coherence check. The brand is the standard the check measures against.')
      return
    }
    // Coherence is a property of the whole campaign, not the filtered view — check
    // every in-scope asset (matches the Breaks queue + the continuous hash).
    const scoped = rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
    if (scoped.length === 0) return
    set({ coherenceChecking: true })
    const campaign = campaignFilter === 'all' ? 'All campaigns' : campaignFilter
    const brandGuide = brandGuides[clientFilter]?.confirmed ? brandGuides[clientFilter]?.guide : undefined
    // The brand's vocabulary feeds the deterministic floor (cross-brand contamination,
    // raw-field leaks, off-audience proof) so the check is real even with no Claude key.
    // brandMeta resolves the EFFECTIVE baseline (own + inherited + shared) so inheritance
    // is treated as the brand's own voice, never flagged as contamination.
    // Target accounts are prospects (naming them as partners = an implied endorsement);
    // the brand's notableClients are substantiated partners that MAY be referenced.
    const targetAccounts =
      campaignFilter === 'all'
        ? (get().accountsByBrand[clientFilter] ?? []).map((acc) => acc.name)
        : get().accountsForCampaign(campaignFilter).map((acc) => acc.name)
    const partners = clientProfiles[clientFilter]?.notableClients ?? []
    const vocab = buildCoherenceVocab(clientFilter, campaign, brandSystems, clientProfiles, brandMeta, { targetAccounts, partners }, get().clientAudiences)
    const baseline = get().brandBaselineFor(clientFilter)
    try {
      const { breaks, live } = await claudeCoherence(scoped, { client: clientFilter, campaign, icp, brandGuide, vocab })
      const scope = breakScopeKey(clientFilter, campaignFilter)
      const hash = coherenceContentHash(scoped)
      set({
        claudeBreaks: breaks,
        claudeBreaksScope: scope,
        coherenceBaseline: baseline,
        coherenceCheckedHash: hash,
        coherenceLive: live,
        // A fallback (live === false) means Claude is unavailable — stop auto-retrying.
        coherenceUnavailable: !live,
        coherenceChecking: false,
      })
      // Only a real Claude run is durable; the heuristic fallback stays session-only.
      if (live) saveCoherenceCheck({ claudeBreaks: breaks, claudeBreaksScope: scope, coherenceCheckedHash: hash, coherenceLive: true, coherenceBaseline: baseline })
    } catch {
      set({ coherenceChecking: false, coherenceUnavailable: true })
    }
  },

  applyClaudeCoherence: (flags) => {
    const { rows, clientFilter, campaignFilter } = get()
    if (clientFilter === 'all' || campaignFilter === 'all') return
    const scoped = rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
    if (scoped.length === 0) return
    const byName = new Map(scoped.map((r) => [r.assetName, r]))
    const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)
    // Clamp to a real axis / severity so a stray value from the pusher can never crash
    // the break UI (which looks up AXIS_META[axis].label).
    const VALID_AXES = new Set<BreakAxis>(['journey', 'audience', 'proof', 'cta', 'voice', 'contamination', 'leak', 'casing', 'duplicate'])
    const VALID_SEV = new Set<BreakSeverity>(['high', 'medium', 'low'])
    const breaks: CoherenceBreak[] = flags
      .filter((f) => byName.has(f.assetName))
      .map((f) => {
        const r = byName.get(f.assetName)!
        const field = f.field && r.messaging?.[f.field] != null ? f.field : Object.keys(r.messaging ?? {})[0] ?? 'body'
        const text = String(r.messaging?.[field] ?? '')
        const axis: BreakAxis = f.axis && VALID_AXES.has(f.axis) ? f.axis : 'voice'
        const severity: BreakSeverity = f.severity && VALID_SEV.has(f.severity) ? f.severity : 'medium'
        return {
          id: `cl-${axis}-${slug(f.assetName)}-${slug(field)}`,
          axis,
          severity,
          headline: f.headline,
          campaign: campaignFilter,
          client: clientFilter,
          from: { role: `${r.channel} · ${field}`, assetName: f.assetName, channel: r.channel, field, text, highlight: f.highlight ?? '' },
          why: f.why ?? '',
          brandRule: 'Checked by Claude.',
          suggestedFix: { assetName: f.assetName, channel: r.channel, field, before: text, after: f.suggestion },
          status: 'open',
        }
      })
    const scope = breakScopeKey(clientFilter, campaignFilter)
    const hash = coherenceContentHash(scoped)
    const baseline = get().brandBaselineFor(clientFilter)
    set({
      claudeBreaks: breaks,
      claudeBreaksScope: scope,
      coherenceBaseline: baseline,
      coherenceCheckedHash: hash,
      coherenceLive: true,
      coherenceUnavailable: false,
      coherenceChecking: false,
    })
    // Persist so the Claude-run check survives a reload (never persist the heuristic).
    saveCoherenceCheck({ claudeBreaks: breaks, claudeBreaksScope: scope, coherenceCheckedHash: hash, coherenceLive: true, coherenceBaseline: baseline })
  },

  openEngine: () => set({ engineOpen: true }),
  closeEngine: () => set({ engineOpen: false }),
  runEngine: async (mode) => {
    const { rows, clientFilter, campaignFilter, filter, query } = get()
    if (clientFilter === 'all') return
    const scoped = rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))
    set({ engineOpen: true, engineRunning: true, engineActions: [], engineSummary: '' })

    let instruction: string
    let context: Record<string, unknown>
    if (mode === 'publish') {
      const approved = scoped.filter((r) => r.status === 'approved')
      instruction =
        'Publish these approved assets to their channels: publish_email for email assets, publish_social for the rest. One call per asset, then summarize.'
      context = {
        client: clientFilter,
        approvedAssets: approved.map((r) => ({
          assetName: r.assetName,
          channel: r.channel,
          subject: messagingMap(r).subject ?? r.assetName,
          html: `<p>${messagingAllText(r)}</p>`,
          text: messagingAllText(r),
        })),
      }
    } else {
      instruction = `Read the latest from ${clientFilter}'s CMS (read_cms) and enrich two example commenters as leads (enrich_lead). Report what you found.`
      context = { client: clientFilter, exampleLeads: ['Dana Reyes', 'Sam Ito'] }
    }

    const { summary, actions, live } = await claudeAgent(instruction, context)

    if (live) {
      // The engine published externally; reflect approved → posted in the cockpit.
      if (mode === 'publish') {
        const approvedIds = scoped.filter((r) => r.status === 'approved').map((r) => r.id)
        if (approvedIds.length) {
          await sheet.setStatus(approvedIds, 'posted')
          await get().refresh()
        }
      }
      set({ engineActions: actions, engineSummary: summary, engineLive: true, engineRunning: false })
      return
    }

    // Engine offline (no Anthropic key): run the same work directly through the adapters.
    if (mode === 'publish') {
      const approved = scoped.filter((r) => r.status === 'approved')
      const acts: AgentAction[] = []
      for (const r of approved) {
        await get().publishRow(r.id)
        acts.push({
          tool: r.channel === 'email' ? 'publish_email' : 'publish_social',
          input: { assetName: r.assetName, channel: r.channel },
          output: { connector: r.channel === 'email' ? 'Resend' : 'Buffer', ok: true, staged: 'direct' },
        })
      }
      set({
        engineActions: acts,
        engineSummary: `Engine offline (no Anthropic key). Published ${approved.length} approved asset${approved.length === 1 ? '' : 's'} directly through the adapters.`,
        engineLive: false,
        engineRunning: false,
      })
    } else {
      set({
        engineActions: [
          { tool: 'read_cms', input: { client: clientFilter }, output: { source: 'Sanity (mock)', entries: 3 } },
          { tool: 'enrich_lead', input: { name: 'Dana Reyes' }, output: { source: 'Clay (mock)', company: 'Northwind Ops', fit: 84 } },
        ],
        engineSummary: 'Engine offline (no Anthropic key). Read sources directly through the mock adapters.',
        engineLive: false,
        engineRunning: false,
      })
    }
  },

  applyBreakFix: async (breakId) => {
    // Resolve from the Claude-pushed set first (its ids are cl-*), then the heuristic —
    // so Apply works whoever found the break, not just the local detector.
    const claude = get().claudeBreaks ?? []
    const fromClaude = claude.find((b) => b.id === breakId)
    const brk = fromClaude ?? detectBreaks(get().rows).find((b) => b.id === breakId)
    if (!brk) return
    const { assetName, channel, field, after, attachRtb } = brk.suggestedFix
    const row = get().rows.find((r) => r.assetName === assetName && r.channel === channel)
    if (!row) return
    const messaging = { ...row.messaging, [field]: after }
    const patch: Partial<typeof row> = { messaging }
    // If the fixed field is the one the card is named after, rename the card too so the
    // change is visible on the canvas, not just in the field.
    if (row.assetName === String(row.messaging?.[field] ?? '')) patch.assetName = after
    if (attachRtb) patch.rtbMap = { ...(row.rtbMap ?? {}), [field]: [attachRtb] }
    await sheet.update(row.id, patch)
    await get().refresh()
    // Clear a Claude break from the live set once fixed, and re-baseline the content hash
    // so the continuous check doesn't re-run the (dead) API over the changed copy.
    if (fromClaude) {
      const { clientFilter, campaignFilter, claudeBreaksScope, coherenceLive, coherenceBaseline } = get()
      const remaining = claude.filter((b) => b.id !== breakId)
      const scoped = get().rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
      const hash = coherenceContentHash(scoped)
      set({ claudeBreaks: remaining, coherenceCheckedHash: hash })
      saveCoherenceCheck({ claudeBreaks: remaining, claudeBreaksScope, coherenceCheckedHash: hash, coherenceLive, coherenceBaseline })
    }
    pushAudit(get, set, {
      breakId,
      action: 'apply-fix',
      summary: `${AUDIT_LABEL['apply-fix']} — ${brk.headline}`,
      before: brk.suggestedFix.before,
      after,
    })
  },

  reassignBreakProof: async (breakId) => {
    const brk = detectBreaks(get().rows).find((b) => b.id === breakId)
    if (!brk?.suggestedFix.attachRtb) return
    const { assetName, channel, field, attachRtb } = brk.suggestedFix
    const row = get().rows.find((r) => r.assetName === assetName && r.channel === channel)
    if (!row) return
    await sheet.update(row.id, { rtbMap: { ...(row.rtbMap ?? {}), [field]: [attachRtb] } })
    await get().refresh()
    pushAudit(get, set, {
      breakId,
      action: 'reassign-proof',
      summary: `${AUDIT_LABEL['reassign-proof']} — ${brk.headline}`,
      after: attachRtb,
    })
  },

  markBreakIntended: (breakId) => {
    const brk = detectBreaks(get().rows).find((b) => b.id === breakId)
    const breakStatus = { ...get().breakStatus, [breakId]: 'intended' as BreakStatus }
    saveBreakStatus(breakStatus)
    set({ breakStatus })
    pushAudit(get, set, {
      breakId,
      action: 'mark-intended',
      summary: `${AUDIT_LABEL['mark-intended']}${brk ? ` — ${brk.headline}` : ''}`,
    })
  },

  sendBreakToReview: (breakId) => {
    const brk = detectBreaks(get().rows).find((b) => b.id === breakId)
    const breakStatus = { ...get().breakStatus, [breakId]: 'in-review' as BreakStatus }
    saveBreakStatus(breakStatus)
    set({ breakStatus })
    pushAudit(get, set, {
      breakId,
      action: 'send-to-review',
      summary: `${AUDIT_LABEL['send-to-review']}${brk ? ` — ${brk.headline}` : ''}`,
    })
  },

  generateTracking: async () => {
    // Build UTMs from each row's own metadata and persist to the sheet.
    const rows = get().rows.filter((r) => r.status !== 'posted' && r.status !== 'failed')
    for (const r of rows) {
      await sheet.update(r.id, { utm: buildUtm(r) })
    }
    set({ trackingRan: true })
    await get().refresh()
  },

  generateTrackingForRow: async (id) => {
    const row = get().rows.find((r) => r.id === id)
    if (!row) return
    await sheet.update(id, { utm: buildUtm(row) })
    set({ trackingRan: true, trackingCleared: false })
    await get().refresh()
  },

  acceptTracking: () => {
    // Only clearable once every trackable asset's tracking is clean.
    const dirty = get()
      .rows.filter((r) => r.status !== 'posted' && r.status !== 'failed')
      .some((r) => !isTrackingClean(r))
    if (dirty) return
    set({ trackingCleared: true })
  },

  syncSpend: async () => {
    const now = Date.now()
    const paid = get().rows.filter((r) => isPaidRow(r) && hasBudget(r))
    for (const r of paid) {
      await sheet.update(r.id, { spend: { toDate: mockSpend(r, now), updatedAt: now } })
    }
    await get().refresh()
  },

  acceptBudget: () => {
    // Planning gate: every paid, to-be-trafficked asset needs a valid budget.
    const missing = get()
      .rows.filter((r) => isPaidRow(r) && r.status !== 'posted' && r.status !== 'failed')
      .some((r) => !hasBudget(r))
    if (missing) return
    set({ budgetCleared: true })
  },
}))

// Audiences own their proof now; point the RTB resolver at the foundation so a
// campaign's proof = the union of its audiences' owned RTBs (falling back to the
// seed/runtime sets for campaigns whose audiences don't own RTBs yet).
setAudienceRtbResolver((campaign) => {
  const client = clientForCampaign(campaign)
  const auds = useTrafficStore.getState().clientAudiences[client] ?? []
  return rtbsFromAudiences(auds)
})
