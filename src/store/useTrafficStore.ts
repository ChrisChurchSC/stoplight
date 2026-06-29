import { create } from 'zustand'
import { MockSheetAdapter } from '../adapters/sheet/mockSheetAdapter'
import { SupabaseSheetAdapter } from '../adapters/sheet/supabaseSheetAdapter'
import { isSupabaseConfigured } from '../lib/supabase'
import type { SheetAdapter } from '../adapters/sheet/types'
import { publishers as channelPublishers } from '../adapters/publishers/registry'
import type { PublisherRegistry } from '../adapters/publishers/types'
import type { Asset, ChannelId, TrafficRow } from '../domain/types'
import { proposeSchedule } from '../scheduling/propose'
import { classifyAssets } from '../lib/classifyAsset'
import { registerCampaign, clientForCampaign, type Campaign, type ClientProfile } from '../domain/clients'
import { deriveCampaignStatus, type CampaignStatus } from '../domain/lifecycle'
import { normalizeAudience, freshAudienceId, type AudienceType } from '../domain/audiences'
import { defaultLibrary, type MessagingLibrary, type LibraryKind, type LibraryCta } from '../domain/library'
import type { GtmStrategy } from '../domain/strategies'
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
import { ClaudeCopyWriter, HeuristicCopyWriter, type CopyWriter } from '../adapters/copy/draftWriter'
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
import { messagingFields, messagingAllText, messagingMap } from '../domain/messaging'
import { composeMessaging } from '../domain/matrixDraft'
import { ctaFor } from '../domain/matrix'
import { funnelStageFor } from '../domain/funnel'
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
  type BreakStatus,
  type CoherenceBreak,
  applyBreakStatus,
  breakScopeKey,
  coherenceContentHash,
  detectBreaks,
  freshAuditId,
  resolveBreaks,
} from '../domain/breaks'
import { claudeCoherence } from '../adapters/coherence/claudeCoherence'
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
import { snapshotRows, diffChanged, diffSummary, type CampaignVersion } from '../domain/versions'

// Wire the swappable seams here. The sheet is backed by Supabase when a project
// is configured (VITE_SUPABASE_*), and by localStorage otherwise — so the backend
// is additive and the app runs unchanged until you provision one.
const sheet: SheetAdapter = isSupabaseConfigured ? new SupabaseSheetAdapter() : new MockSheetAdapter()
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
    localStorage.setItem(CLIENT_AUDIENCES_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

const LIBRARY_KEY = 'stoplight.library.v1'
function loadLibrary(): MessagingLibrary {
  const seed = defaultLibrary()
  try {
    const v = JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null')
    if (!v || typeof v !== 'object') return seed
    return {
      ctas: Array.isArray(v.ctas) ? v.ctas : seed.ctas,
      rtbs: Array.isArray(v.rtbs) ? v.rtbs : seed.rtbs,
      audiences: Array.isArray(v.audiences) ? v.audiences.map((a: AudienceType) => normalizeAudience(a)) : seed.audiences,
      strategies: Array.isArray(v.strategies) ? v.strategies : seed.strategies,
      // Newer kinds — seed them if an older stored library predates the field.
      subjects: Array.isArray(v.subjects) ? v.subjects : seed.subjects,
      hooks: Array.isArray(v.hooks) ? v.hooks : seed.hooks,
    }
  } catch {
    return seed
  }
}
function saveLibrary(lib: MessagingLibrary): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib))
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
    localStorage.setItem(CANVASES_KEY, JSON.stringify(list))
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
  page: 'clients' | 'connectors' | 'billing' | 'library'
  /** Cross-project messaging library: reusable CTAs, RTBs, audiences, strategies. */
  library: MessagingLibrary
  addLibraryItem: (kind: LibraryKind, item: LibraryCta | Rtb | AudienceType | GtmStrategy) => void
  removeLibraryItem: (kind: LibraryKind, id: string) => void
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
  /** Campaigns created via the new-client wizard (persisted). */
  campaignList: Campaign[]
  addCampaign: (campaign: Campaign) => void
  /** Move a campaign through its lifecycle (planning → in-review → active → completed). */
  setCampaignStatus: (name: string, status: CampaignStatus) => void
  /** Open a campaign straight into its workspace (Level 2 canvas) from anywhere —
   *  the home hub's "jump back in" + triage deep-links use this to resume work. */
  openCampaign: (name: string) => void
  /** Link a campaign to a GTM playbook (ABM, Demand Gen, etc.) — the strategy selector. */
  setCampaignStrategy: (name: string, strategy: string) => void
  /** Swap a campaign's subject (what it's about) — the Subject card picker. */
  setCampaignSubject: (name: string, subject: string) => void
  /** Swap a campaign's brand/client — the Brand card picker. Re-homes the campaign. */
  setCampaignClient: (name: string, client: string) => void
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
  /** "Claude sets up the workspace" flow (the manual route's connect + confirm). */
  setupOpen: boolean
  openSetup: () => void
  closeSetup: () => void
  /** Forked onboarding: pick Do-it-yourself (manual) vs Set-up-with-Claude (assisted). */
  onboardOpen: boolean
  openOnboard: () => void
  closeOnboard: () => void
  /** The assisted route's desktop handoff screen (opens Claude to connect tools). */
  assistedOpen: boolean
  openAssisted: () => void
  closeAssisted: () => void
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
    opts?: { mediaBudget?: number; flightWeeks?: number; endDate?: string },
  ) => Promise<void>
  setFilter: (filter: ChannelId | 'all') => void
  setProofFilter: (proofFilter: string) => void
  setCtaFilter: (ctaFilter: string) => void
  setAudienceFilter: (audienceFilter: string) => void
  setCardFilter: (cardFilter: CardFilter) => void
  setQuery: (query: string) => void
  setClientFilter: (client: string) => void
  setCampaignFilter: (campaign: string) => void
  setView: (view: 'grid' | 'calendar' | 'flow' | 'insights' | 'canvas') => void
  setPage: (page: 'clients' | 'connectors' | 'billing' | 'library') => void
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
  duplicateRow: (id: string) => Promise<void>
  /** Paste a copy of a row as a new draft asset (unique name) — Cmd/Ctrl+V. */
  pasteAsset: (id: string) => Promise<void>
  /** Undo the last sheet mutation (swap, restage, connect, paste, delete) — Cmd/Ctrl+Z. */
  undo: () => Promise<void>
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
  coherenceChecking: boolean
  coherenceLive: boolean
  /** Content hash claudeBreaks were computed for — stale once content changes. */
  coherenceCheckedHash: string | null
  /** Claude check fell back / errored — stay on the live heuristic, stop auto-retry. */
  coherenceUnavailable: boolean
  runCoherenceCheck: () => Promise<void>
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

export const useTrafficStore = create<TrafficState>((set, get) => ({
  assets: [],
  rows: [],
  loading: false,
  filter: 'all',
  proofFilter: 'all',
  ctaFilter: 'all',
  audienceFilter: 'all',
  cardFilter: 'all',
  query: '',
  // A share link locks the session to its client + role from the first render.
  clientFilter: initialShare?.client ?? 'all',
  campaignFilter: 'all',
  view: 'flow',
  perfMode: false,
  brandView: 'campaigns',
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
  refreshingClient: null,
  channelIngestOpen: false,
  channelIngestTarget: null,
  channelIngestStages: [],
  channelIngestResult: null,
  channelIngestError: null,
  ingestingChannel: false,
  clientAudiences: loadClientAudiences(),
  regenIds: new Set<string>(),
  library: loadLibrary(),
  canvases: loadCanvases(),
  artboards: loadArtboards(),
  activeCanvas: loadActiveCanvas(),
  openProjects: loadOpenProjects(),
  campaignList: loadCampaigns(),
  wizardOpen: false,
  wizardClient: null,
  audienceWizardOpen: false,
  setupOpen: false,
  onboardOpen: false,
  assistedOpen: false,
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
  claudeBreaks: null,
  claudeBreaksScope: null,
  coherenceChecking: false,
  coherenceLive: false,
  coherenceCheckedHash: null,
  coherenceUnavailable: false,
  engineOpen: false,
  engineRunning: false,
  engineActions: [],
  engineSummary: '',
  engineLive: false,
  auditLog: loadAuditLog(),
  coherenceDecisions: loadCoherenceDecisions(),
  aggregateContributing: loadAggregateContributing(),
  icpFromClosedWon: false,
  trackingRan: false,
  trackingCleared: false,
  budgetCleared: false,

  setFilter: (filter) => set({ filter }),
  setProofFilter: (proofFilter) => set({ proofFilter }),
  setCtaFilter: (ctaFilter) => set({ ctaFilter }),
  setAudienceFilter: (audienceFilter) => set({ audienceFilter }),
  setCardFilter: (cardFilter) => set({ cardFilter }),
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

  addLibraryItem: (kind, item) =>
    set((s) => {
      const list = [...(s.library[kind] as unknown[]), item]
      const library = { ...s.library, [kind]: list } as MessagingLibrary
      saveLibrary(library)
      return { library }
    }),
  removeLibraryItem: (kind, id) =>
    set((s) => {
      const idKey = kind === 'strategies' ? 'key' : 'id'
      const list = (s.library[kind] as { id?: string; key?: string }[]).filter((x) => (x as Record<string, string>)[idKey] !== id)
      const library = { ...s.library, [kind]: list } as MessagingLibrary
      saveLibrary(library)
      return { library }
    }),
  approveLibraryItem: (kind, id) =>
    set((s) => {
      const list = (s.library[kind] as { id: string; approved?: boolean }[]).map((x) =>
        x.id === id ? { ...x, approved: true } : x,
      )
      const library = { ...s.library, [kind]: list } as MessagingLibrary
      saveLibrary(library)
      return { library }
    }),
  editLibrarySubject: (id, text) => {
    const next = text.trim()
    const s = get()
    const master = s.library.subjects.find((x) => x.id === id)
    const oldText = master?.text?.trim() ?? ''
    if (!next || !master || next === oldText) return 0
    // Update the master on the shelf.
    const subjects = s.library.subjects.map((x) => (x.id === id ? { ...x, text: next } : x))
    const library = { ...s.library, subjects }
    saveLibrary(library)
    // Propagate to instances: every campaign carrying the old subject text follows
    // the master to the new text (master→instance, the way a renamed component
    // updates everywhere it's placed).
    const touched = s.campaignList.filter((c) => (c.subject ?? '').trim() === oldText)
    let campaignList = s.campaignList
    if (oldText && touched.length) {
      campaignList = s.campaignList.map((c) => ((c.subject ?? '').trim() === oldText ? { ...c, subject: next } : c))
      saveCampaigns(campaignList)
    }
    set({ library, campaignList })
    return oldText ? touched.length : 0
  },
  editLibraryHook: (id, text) =>
    set((s) => {
      const next = text.trim()
      if (!next) return {}
      const hooks = s.library.hooks.map((x) => (x.id === id ? { ...x, text: next } : x))
      const library = { ...s.library, hooks }
      saveLibrary(library)
      return { library }
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
      const clone = normalizeAudience({ ...audience, id: `laud_${Date.now().toString(36)}` })
      const library = { ...s.library, audiences: [...s.library.audiences, clone] }
      saveLibrary(library)
      return { library }
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

  openCampaign: (name) => {
    const campaign = name.trim()
    if (!campaign) return
    const client = clientForCampaign(campaign)
    // Honor a shared session's client lock (a guest can't jump into another brand).
    const ss = get().sharedSession
    if (ss && client !== ss.client) return
    registerCampaign(campaign, client)
    get().openProject(campaign)
    set({
      page: 'clients',
      clientFilter: client,
      campaignFilter: campaign,
      view: 'canvas',
      proofFilter: 'all',
      ctaFilter: 'all',
      audienceFilter: 'all',
      cardFilter: 'all',
    })
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
  openOnboard: () => set({ onboardOpen: true }),
  closeOnboard: () => set({ onboardOpen: false }),
  // Fork → assisted: leave the fork, open the desktop handoff.
  openAssisted: () => set({ onboardOpen: false, assistedOpen: true }),
  closeAssisted: () => set({ assistedOpen: false }),
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
    set({ setupOpen: false, clientFilter: client, campaignFilter: campaign, filter: 'all', proofFilter: 'all', ctaFilter: 'all' })
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
    set({ setupOpen: false, clientFilter: client, campaignFilter: campaign, filter: 'all', proofFilter: 'all', ctaFilter: 'all' })
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
      // Feed the current client's defined audiences in, so a folder named for an
      // audience routes the asset to that lane on the canvas automatically.
      const audienceNames = (s.clientAudiences[s.clientFilter] ?? []).map((a) => a.name)
      const fresh = classifyAssets(assets, audienceNames).filter((a) => !have.has(a.id))
      return { assets: [...s.assets, ...fresh] }
    }),

  draftMatrixCell: async (row) => {
    await sheet.append([row])
    await get().refresh()
  },

  draftMatrixCells: async (rows) => {
    if (!rows.length) return
    await sheet.append(rows)
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
    for (const r of s.rows) {
      if (scope.campaign && (r.campaign ?? '').trim() !== scope.campaign.trim()) continue
      if (scope.audience && (r.audience ?? '').trim() !== scope.audience.trim()) continue
      const client = clientForCampaign(r.campaign)
      if (scope.client && client !== scope.client) continue
      // Linked-external assets (produced video / image / live page) can't be
      // redrafted — their words are welded in. A frame change flags them for
      // external rework; it never fake-edits them here.
      if (isLinkedExternal(r)) continue
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
      updates.push({ id: r.id, patch: { messaging, rtbMap } })
    }
    if (!updates.length) return
    // Flag the affected cards as regenerating so the canvas can animate the
    // change rippling across them, then apply the re-draft.
    const ids = updates.map((u) => u.id)
    set({ regenIds: new Set(ids) })
    await get().updateRows(updates)
    // Clear once the (staggered) animation has played — duration 1.5s plus the
    // longest stagger (~0.8s), so the "thinking → resolve" effect fully reads.
    setTimeout(() => {
      const remaining = new Set(get().regenIds)
      for (const id of ids) remaining.delete(id)
      set({ regenIds: remaining })
    }, 2500)
  },

  removeRow: async (id) => {
    pushUndo(get().rows)
    await sheet.remove(id)
    await get().refresh()
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
  },

  openBreaks: (breakId) => set({ breaksOpen: true, activeBreakId: breakId ?? null }),
  closeBreaks: () => set({ breaksOpen: false, activeBreakId: null }),

  runCoherenceCheck: async () => {
    const { rows, clientFilter, campaignFilter, icp, brandGuides } = get()
    if (clientFilter === 'all') return
    // Coherence is a property of the whole campaign, not the filtered view — check
    // every in-scope asset (matches the Breaks queue + the continuous hash).
    const scoped = rows.filter((r) => rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
    if (scoped.length === 0) return
    set({ coherenceChecking: true })
    const campaign = campaignFilter === 'all' ? 'All campaigns' : campaignFilter
    const brandGuide = brandGuides[clientFilter]?.confirmed ? brandGuides[clientFilter]?.guide : undefined
    try {
      const { breaks, live } = await claudeCoherence(scoped, { client: clientFilter, campaign, icp, brandGuide })
      set({
        claudeBreaks: breaks,
        claudeBreaksScope: breakScopeKey(clientFilter, campaignFilter),
        coherenceCheckedHash: coherenceContentHash(scoped),
        coherenceLive: live,
        // A fallback (live === false) means Claude is unavailable — stop auto-retrying.
        coherenceUnavailable: !live,
        coherenceChecking: false,
      })
    } catch {
      set({ coherenceChecking: false, coherenceUnavailable: true })
    }
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

// Audiences own their proof now; point the RTB resolver at the foundation so a
// campaign's proof = the union of its audiences' owned RTBs (falling back to the
// seed/runtime sets for campaigns whose audiences don't own RTBs yet).
setAudienceRtbResolver((campaign) => {
  const client = clientForCampaign(campaign)
  const auds = useTrafficStore.getState().clientAudiences[client] ?? []
  return rtbsFromAudiences(auds)
})
