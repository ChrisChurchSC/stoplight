import { create } from 'zustand'
import { MockSheetAdapter } from '../adapters/sheet/mockSheetAdapter'
import type { SheetAdapter } from '../adapters/sheet/types'
import { publishers as channelPublishers } from '../adapters/publishers/registry'
import type { PublisherRegistry } from '../adapters/publishers/types'
import type { Asset, ChannelId, TrafficRow } from '../domain/types'
import { proposeSchedule } from '../scheduling/propose'
import { classifyAssets } from '../lib/classifyAsset'
import { registerCampaign, clientForCampaign, type Campaign, type ClientProfile } from '../domain/clients'
import type { AudienceType } from '../domain/audiences'
import type { Deliverable } from '../domain/strategyAssets'
import { CHANNELS } from '../domain/channels'
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
import { ClaudeCopyWriter, HeuristicCopyWriter, type CopyWriter } from '../adapters/copy/draftWriter'
import {
  ClaudeSetupGenerator,
  HeuristicSetupGenerator,
  type SetupGenerator,
  type SetupInput,
  type WorkspaceSetup,
} from '../adapters/setup/setupGenerator'
import { GTM_STRATEGIES, mediaSharePct } from '../domain/strategies'
import { STRATEGY_ASSETS } from '../domain/strategyAssets'
import { messagingFields, messagingAllText } from '../domain/messaging'
import { registerCampaignRtbs, rtbsForCampaign, type Rtb } from '../domain/rtb'
import { rowInScope } from '../lib/scope'
import { MockIcpSource, MockIcpReviewer, flagResolved } from '../adapters/icp/mockIcp'
import { type CoherenceDecision, freshDecisionId } from '../domain/coherence'
import { type BrandGuide, draftBrandGuide } from '../domain/readiness'
import type { TimeRange } from '../domain/timeRange'
import {
  AUDIT_LABEL,
  type AuditAction,
  type AuditEntry,
  type BreakStatus,
  applyBreakStatus,
  detectBreaks,
  freshAuditId,
} from '../domain/breaks'
import { ClaudeIcpReviewer } from '../adapters/icp/claudeReviewer'
import type { BatchReview, Icp, IcpReviewer, IcpSource } from '../adapters/icp/types'
import { buildUtm, isTrackingClean } from '../domain/tracking'
import { hasBudget, isPaidRow, mockSpend } from '../domain/budget'
import { mockAttio } from '../adapters/attio/mockAttio'
import { mockCommentSource, enrichCommenter, type Comment } from '../adapters/comments/mockComments'
import { can, type Role } from '../domain/access'
import { decodeShareToken, type ShareGrant } from '../lib/shareLink'
import { snapshotRows, diffChanged, diffSummary, type CampaignVersion } from '../domain/versions'

// Wire the swappable seams here. Replace these two lines to go live.
const sheet: SheetAdapter = new MockSheetAdapter()
const publishers: PublisherRegistry = channelPublishers
const icpSource: IcpSource = new MockIcpSource()
// Real Claude batch review when a backend + key are present; heuristic otherwise.
const icpReviewer: IcpReviewer = new ClaudeIcpReviewer(new MockIcpReviewer())
// Real Claude starter-copy drafting when a backend + key are present; heuristic otherwise.
const copyWriter: CopyWriter = new ClaudeCopyWriter(new HeuristicCopyWriter())
// Real Claude workspace setup (reads the site) when a backend + key are present; heuristic otherwise.
const setupGenerator: SetupGenerator = new ClaudeSetupGenerator(new HeuristicSetupGenerator())

function freshRowId(): string {
  return `row_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
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
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(list))
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
    localStorage.setItem(CLIENT_PROFILES_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

// Audience types per client (personas under the ICP), persisted by client name.
const CLIENT_AUDIENCES_KEY = 'stoplight.clientAudiences.v1'
function loadClientAudiences(): Record<string, AudienceType[]> {
  try {
    const v = JSON.parse(localStorage.getItem(CLIENT_AUDIENCES_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveClientAudiences(map: Record<string, AudienceType[]>): void {
  try {
    localStorage.setItem(CLIENT_AUDIENCES_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
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
}
function readShareFromUrl(): SharedSession | null {
  try {
    const token = new URLSearchParams(window.location.search).get('share')
    if (!token) return null
    const g = decodeShareToken(token)
    return g ? { client: g.client, role: g.role, grantId: g.id } : null
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
    localStorage.setItem(BRAND_GUIDES_KEY, JSON.stringify(map))
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
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(list))
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
  /** Toolbar search across asset name / caption. */
  query: string
  /** Breadcrumb scope: which client, then which campaign. 'all' = no scope. */
  clientFilter: string
  campaignFilter: string
  /** Per-client workspace view. */
  view: 'grid' | 'calendar' | 'flow' | 'insights' | 'canvas'
  /** Forward time horizon for the Connection + Grid views. */
  timeRange: TimeRange
  setTimeRange: (range: TimeRange) => void
  /** Top-level destination in the global nav rail. */
  page: 'clients' | 'connectors' | 'billing'
  /** ICP & proof side drawer. */
  icpOpen: boolean
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
  /** Onboarding readiness: starter brand guides per client + the drawer state. */
  brandGuides: Record<string, BrandGuideEntry>
  readinessOpen: boolean
  openReadiness: () => void
  /** Onboarding-as-diagnosis: the before→after reveal on the brand's own data. */
  diagnosisOpen: boolean
  openDiagnosis: () => void
  closeDiagnosis: () => void
  /** Ask Claude: the conversational connection / what-worked palette. */
  askOpen: boolean
  openAsk: () => void
  closeAsk: () => void
  /** Sharing & access: the current session role and the owner's share links. */
  role: Role
  sharedSession: SharedSession | null
  shares: ShareGrant[]
  shareDialogOpen: boolean
  openShareDialog: () => void
  closeShareDialog: () => void
  createShare: (client: string, role: Role) => ShareGrant
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
  /** Campaigns created via the new-client wizard (persisted). */
  campaignList: Campaign[]
  addCampaign: (campaign: Campaign) => void
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
  /** "Claude sets up the workspace" flow. */
  setupOpen: boolean
  openSetup: () => void
  closeSetup: () => void
  /** Generate a proposed workspace setup from a URL (Claude, heuristic fallback). */
  generateSetup: (input: SetupInput) => Promise<WorkspaceSetup>
  /** Commit a confirmed setup: client + profile + ICP + proof + first campaign. */
  provisionWorkspace: (setup: WorkspaceSetup) => Promise<void>
  /** Seed the spreadsheet with draft rows for a strategy's needed assets, spread
   *  across the flight at each asset's monthly cadence, optionally splitting a
   *  media budget across the paid rows. */
  seedCampaignAssets: (
    campaign: string,
    deliverables: Deliverable[],
    opts?: { mediaBudget?: number; flightWeeks?: number; endDate?: string },
  ) => Promise<void>
  setFilter: (filter: ChannelId | 'all') => void
  setQuery: (query: string) => void
  setClientFilter: (client: string) => void
  setCampaignFilter: (campaign: string) => void
  setView: (view: 'grid' | 'calendar' | 'flow' | 'insights' | 'canvas') => void
  setPage: (page: 'clients' | 'connectors' | 'billing') => void
  setIcpOpen: (open: boolean) => void
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

  // ingest tray
  addAssets: (assets: Asset[]) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  toggleChannel: (id: string, channel: ChannelId) => void
  removeAsset: (id: string) => void
  /** Turn ready tray assets into scheduled draft rows in the sheet. */
  addToSheet: () => Promise<void>

  // sheet (spreadsheet) edits
  updateRow: (id: string, patch: Partial<TrafficRow>) => Promise<void>
  removeRow: (id: string) => Promise<void>
  duplicateRow: (id: string) => Promise<void>
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
  /** True when the ICP was refined from Attio closed-won data (feedback loop). */
  icpFromClosedWon: boolean
  /** Refresh the ICP from actual closed-won customers in Attio. */
  refreshIcpFromClosedWon: () => void

  // starter-copy drafting (ICP-aware, real Claude with heuristic fallback)
  /** True while a draft run is in flight (drives the button states). */
  drafting: boolean
  /** Draft starter copy + proof into empty messaging fields. Pass specific row
   *  ids, or omit to draft every in-scope reviewable row that has no copy yet. */
  draftCopy: (rowIds?: string[]) => Promise<void>

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

export const useTrafficStore = create<TrafficState>((set, get) => ({
  assets: [],
  rows: [],
  loading: false,
  filter: 'all',
  query: '',
  // A share link locks the session to its client + role from the first render.
  clientFilter: initialShare?.client ?? 'all',
  campaignFilter: 'all',
  view: 'flow',
  timeRange: 'all',
  page: 'clients',
  brandGuides: loadBrandGuides(),
  readinessOpen: false,
  diagnosisOpen: false,
  askOpen: false,
  role: initialShare?.role ?? 'owner',
  sharedSession: initialShare,
  shares: loadShares(),
  shareDialogOpen: false,
  versions: loadVersions(),
  historyOpen: false,
  icpOpen: false,
  trackingChannel: null,
  drivePickerOpen: false,
  driveConnected: false,
  driveLinks: loadDriveLinks(),
  clientList: loadClients(),
  clientProfiles: loadClientProfiles(),
  clientAudiences: loadClientAudiences(),
  campaignList: loadCampaigns(),
  wizardOpen: false,
  wizardClient: null,
  audienceWizardOpen: false,
  setupOpen: false,
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
  auditLog: loadAuditLog(),
  coherenceDecisions: loadCoherenceDecisions(),
  aggregateContributing: loadAggregateContributing(),
  icpFromClosedWon: false,
  trackingRan: false,
  trackingCleared: false,
  budgetCleared: false,

  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  // Switching client resets the campaign scope (campaigns belong to a client).
  // A shared session is locked to its one client.
  setClientFilter: (clientFilter) => {
    const ss = get().sharedSession
    if (ss && clientFilter !== ss.client) return
    set({ clientFilter, campaignFilter: 'all' })
  },
  setCampaignFilter: (campaignFilter) => set({ campaignFilter }),
  setView: (view) => set({ view }),
  setTimeRange: (timeRange) => set({ timeRange }),
  // Billing and Connectors are owner-only; ignore navigation a role can't take.
  setPage: (page) => {
    const role = get().role
    if (page === 'billing' && !can(role, 'billing')) return
    if (page === 'connectors' && role !== 'owner') return
    set({ page })
  },
  setIcpOpen: (icpOpen) => set({ icpOpen }),
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

  openReadiness: () => set({ readinessOpen: true }),
  closeReadiness: () => set({ readinessOpen: false }),
  openDiagnosis: () => set({ diagnosisOpen: true }),
  closeDiagnosis: () => set({ diagnosisOpen: false }),
  openAsk: () => set({ askOpen: true }),
  closeAsk: () => set({ askOpen: false }),
  openShareDialog: () => set({ shareDialogOpen: true }),
  closeShareDialog: () => set({ shareDialogOpen: false }),
  createShare: (client, role) => {
    const grant: ShareGrant = {
      id: `shr_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      client,
      role,
      createdAt: new Date().toISOString(),
    }
    const shares = [grant, ...get().shares]
    saveShares(shares)
    set({ shares })
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
  deleteClient: async (name) => {
    // Remove the client's rows from the sheet.
    const ids = get()
      .rows.filter((r) => clientForCampaign(r.campaign) === name)
      .map((r) => r.id)
    for (const id of ids) await sheet.remove(id)
    // Drop its persisted client entry, campaigns, and saved Drive link.
    set((s) => {
      const clientList = s.clientList.filter((c) => c !== name)
      const campaignList = s.campaignList.filter((c) => c.client !== name)
      const driveLinks = { ...s.driveLinks }
      delete driveLinks[name]
      const clientProfiles = { ...s.clientProfiles }
      delete clientProfiles[name]
      const clientAudiences = { ...s.clientAudiences }
      delete clientAudiences[name]
      saveClients(clientList)
      saveCampaigns(campaignList)
      saveDriveLinks(driveLinks)
      saveClientProfiles(clientProfiles)
      saveClientAudiences(clientAudiences)
      const next: Partial<TrafficState> = { clientList, campaignList, driveLinks, clientProfiles, clientAudiences }
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
      const campaignList = [...s.campaignList, campaign]
      saveCampaigns(campaignList)
      return { campaignList }
    }),

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

  openSetup: () => set({ setupOpen: true }),
  closeSetup: () => set({ setupOpen: false }),
  generateSetup: (input) => setupGenerator.generate(input),

  provisionWorkspace: async (setup) => {
    const client = setup.brand.name.trim()
    if (!client) return
    get().addClient(client)
    get().setClientProfile(client, {
      website: setup.brand.website?.trim() || undefined,
      industry: setup.brand.industry?.trim() || undefined,
      voice: setup.brand.voice?.trim() || undefined,
    })
    get().setIcp(setup.icp)

    const strat = GTM_STRATEGIES.find((s) => s.key === setup.strategy)
    const strategyName = strat?.name ?? setup.strategy
    const campaign = setup.campaign.name?.trim() || `${client} — Campaign`
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
    set({ setupOpen: false, clientFilter: client, campaignFilter: campaign, filter: 'all' })
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
    await sheet.append(rows)
    await get().refresh()
  },

  refresh: async () => {
    set({ loading: true })
    const rows = await sheet.list()
    set({ rows, loading: false })
  },

  // Auto-organize each ingested batch to channel + per-channel type before it
  // hits the staging tray. Batch-aware (carousel slides detected across the
  // group). De-dupes by id so re-importing the same Drive files (stable ids)
  // doesn't create duplicate tray cards / rows.
  addAssets: (assets) =>
    set((s) => {
      const have = new Set(s.assets.map((a) => a.id))
      const fresh = classifyAssets(assets).filter((a) => !have.has(a.id))
      return { assets: [...s.assets, ...fresh] }
    }),

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
    const rows = proposeSchedule(ready)
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

  removeRow: async (id) => {
    await sheet.remove(id)
    await get().refresh()
  },

  duplicateRow: async (id) => {
    const row = get().rows.find((r) => r.id === id)
    if (!row) return
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

  approveAll: async () => {
    // All gates must clear: messaging on-ICP, tracking clean, budgets set.
    if (!get().gateCleared || !get().trackingCleared || !get().budgetCleared) return
    const drafts = get().rows.filter((r) => r.status === 'draft')
    if (drafts.length === 0) return
    // Connection gate: don't ship a broken thread. Block if any open break sits in
    // a campaign whose drafts we're about to approve.
    const draftCampaigns = new Set(drafts.map((r) => (r.campaign ?? '').trim()))
    const openInScope = applyBreakStatus(detectBreaks(get().rows), get().breakStatus).filter(
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
    const comments: Record<string, Comment[]> = {}
    for (const r of posted) {
      comments[r.id] = await mockCommentSource.fetch(r)
    }
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
    // Mark the comment routed so the UI reflects it.
    set((s) => ({
      comments: {
        ...s.comments,
        [rowId]: s.comments[rowId].map((c) => (c.id === commentId ? { ...c, routed: true } : c)),
      },
    }))
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
    const result = await extractInCreativeCopy(row)
    await sheet.update(id, { extractedCopy: result.text })
    await get().refresh()
  },

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
    if (targets.length === 0) return
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
        const assets = crows.map((r) => ({
          rowId: r.id,
          assetName: r.assetName,
          channel: r.channel,
          type: r.assetType,
          fields: messagingFields(r.channel, r.assetType),
        }))
        const client = clientForCampaign(campaign)
        const brand = get().clientProfiles[client]
        const bg = get().brandGuides[client]
        const brandGuide = bg?.confirmed ? bg.guide : undefined
        const result = await copyWriter.draft({ icp, campaign, brand, brandGuide, assets })
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
          const map: Record<string, string> = { ...(row.messaging ?? {}) }
          for (const c of d.components) if (!map[c.key]?.trim()) map[c.key] = c.value
          const fields = messagingFields(row.channel, row.assetType)
          const primaryKey = fields[0]?.key
          const ctaKey = fields.find((f) => /cta/i.test(f.key))?.key
          const ids = d.rtbIds.length ? d.rtbIds : result.rtbs[0] ? [result.rtbs[0].id] : []
          const rmap: Record<string, string[]> = { ...(row.rtbMap ?? {}) }
          if (ids.length) {
            if (primaryKey && !(rmap[primaryKey]?.length)) rmap[primaryKey] = ids
            if (ctaKey && !(rmap[ctaKey]?.length)) rmap[ctaKey] = ids
          }
          await sheet.update(row.id, { messaging: map, rtbMap: rmap })
        }
      }
      saveCampaignRtbs(rtbStore)
    } finally {
      set({ drafting: false })
      await get().refresh()
    }
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
    set({ reviewing: true })
    let icp = get().icp
    if (!icp) {
      icp = await icpSource.fetch()
      set({ icp })
    }
    const batchReview = await icpReviewer.review(icp, get().rows)
    set({ batchReview, reviewing: false })
  },

  acceptReview: () => {
    // Capture the human's coherence calls before unlocking. Each flag the user
    // accepts the batch over becomes a decision row: 'resolved' if they'd already
    // fixed it, 'overridden' if they judged it coherent enough to ship anyway.
    const { batchReview, rows, icp, clientAudiences, coherenceDecisions } = get()
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
      return
    }
    set({ gateCleared: true })
  },

  setAggregateContributing: (on) => {
    saveAggregateContributing(on)
    set({ aggregateContributing: on })
  },

  openBreaks: (breakId) => set({ breaksOpen: true, activeBreakId: breakId ?? null }),
  closeBreaks: () => set({ breaksOpen: false, activeBreakId: null }),

  applyBreakFix: async (breakId) => {
    const brk = detectBreaks(get().rows).find((b) => b.id === breakId)
    if (!brk) return
    const { assetName, channel, field, after, attachRtb } = brk.suggestedFix
    const row = get().rows.find((r) => r.assetName === assetName && r.channel === channel)
    if (!row) return
    const messaging = { ...row.messaging, [field]: after }
    const patch: Partial<typeof row> = { messaging }
    if (attachRtb) patch.rtbMap = { ...(row.rtbMap ?? {}), [field]: [attachRtb] }
    await sheet.update(row.id, patch)
    await get().refresh()
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
