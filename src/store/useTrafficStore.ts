import { create } from 'zustand'
import { MockSheetAdapter } from '../adapters/sheet/mockSheetAdapter'
import type { SheetAdapter } from '../adapters/sheet/types'
import { publishers as channelPublishers } from '../adapters/publishers/registry'
import type { PublisherRegistry } from '../adapters/publishers/types'
import type { Asset, ChannelId, TrafficRow } from '../domain/types'
import { proposeSchedule } from '../scheduling/propose'
import { classifyAssets } from '../lib/classifyAsset'
import { registerCampaign, clientForCampaign, type Campaign, type ClientProfile } from '../domain/clients'
import type { Deliverable } from '../domain/strategyAssets'
import { CHANNELS } from '../domain/channels'
import { driveFilesToAssets } from '../lib/driveImport'
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
import { messagingFields, messagingAllText } from '../domain/messaging'
import { registerCampaignRtbs, rtbsForCampaign, type Rtb } from '../domain/rtb'
import { rowInScope } from '../lib/scope'
import { MockIcpSource, MockIcpReviewer } from '../adapters/icp/mockIcp'
import { ClaudeIcpReviewer } from '../adapters/icp/claudeReviewer'
import type { BatchReview, Icp, IcpReviewer, IcpSource } from '../adapters/icp/types'
import { buildUtm, isTrackingClean } from '../domain/tracking'
import { hasBudget, isPaidRow, mockSpend } from '../domain/budget'
import { mockAttio } from '../adapters/attio/mockAttio'
import { mockCommentSource, type Comment } from '../adapters/comments/mockComments'

// Wire the swappable seams here. Replace these two lines to go live.
const sheet: SheetAdapter = new MockSheetAdapter()
const publishers: PublisherRegistry = channelPublishers
const icpSource: IcpSource = new MockIcpSource()
// Real Claude batch review when a backend + key are present; heuristic otherwise.
const icpReviewer: IcpReviewer = new ClaudeIcpReviewer(new MockIcpReviewer())
// Real Claude starter-copy drafting when a backend + key are present; heuristic otherwise.
const copyWriter: CopyWriter = new ClaudeCopyWriter(new HeuristicCopyWriter())

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
  view: 'grid' | 'calendar' | 'flow' | 'insights'
  /** Top-level destination in the global nav rail. */
  page: 'clients' | 'connectors' | 'billing'
  /** ICP & proof side drawer. */
  icpOpen: boolean
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
  /** Remove a client: its rows, campaigns, saved Drive link, profile, and list entry. */
  deleteClient: (name: string) => Promise<void>
  /** Campaigns created via the new-client wizard (persisted). */
  campaignList: Campaign[]
  addCampaign: (campaign: Campaign) => void
  /** New-client / add-campaign wizard UI state. wizardClient = the client to add
   *  a campaign to (campaign-only mode), or null for the full new-client flow. */
  wizardOpen: boolean
  wizardClient: string | null
  openClientWizard: () => void
  openCampaignWizard: (client: string) => void
  closeWizard: () => void
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
  setView: (view: 'grid' | 'calendar' | 'flow' | 'insights') => void
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
  runBatchReview: () => Promise<void>
  acceptReview: () => void
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

  // copy review
  /** Row whose copy-review drawer is open, or null. */
  reviewRowId: string | null
  openReview: (id: string | null) => void
  /** Extract the in-creative copy for a row (text body real; vision stubbed). */
  extractCopy: (id: string) => Promise<void>
  /** Toggle the "copy reviewed" sign-off for a row. */
  toggleReviewed: (id: string, value: boolean) => Promise<void>
}

export const useTrafficStore = create<TrafficState>((set, get) => ({
  assets: [],
  rows: [],
  loading: false,
  filter: 'all',
  query: '',
  clientFilter: 'all',
  campaignFilter: 'all',
  view: 'grid',
  page: 'clients',
  icpOpen: false,
  drivePickerOpen: false,
  driveConnected: false,
  driveLinks: loadDriveLinks(),
  clientList: loadClients(),
  clientProfiles: loadClientProfiles(),
  campaignList: loadCampaigns(),
  wizardOpen: false,
  wizardClient: null,
  reviewRowId: null,
  comments: {},
  commentRowId: null,
  icp: null,
  batchReview: null,
  reviewing: false,
  drafting: false,
  gateCleared: false,
  icpFromClosedWon: false,
  trackingRan: false,
  trackingCleared: false,
  budgetCleared: false,

  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  // Switching client resets the campaign scope (campaigns belong to a client).
  setClientFilter: (clientFilter) => set({ clientFilter, campaignFilter: 'all' }),
  setCampaignFilter: (campaignFilter) => set({ campaignFilter }),
  setView: (view) => set({ view }),
  setPage: (page) => set({ page }),
  setIcpOpen: (icpOpen) => set({ icpOpen }),
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
      saveClients(clientList)
      saveCampaigns(campaignList)
      saveDriveLinks(driveLinks)
      saveClientProfiles(clientProfiles)
      const next: Partial<TrafficState> = { clientList, campaignList, driveLinks, clientProfiles }
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
  openClientWizard: () => set({ wizardOpen: true, wizardClient: null }),
  openCampaignWizard: (client) => set({ wizardOpen: true, wizardClient: client }),
  closeWizard: () => set({ wizardOpen: false, wizardClient: null }),
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
    const draftIds = get()
      .rows.filter((r) => r.status === 'draft')
      .map((r) => r.id)
    if (draftIds.length === 0) return
    await sheet.setStatus(draftIds, 'approved')
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
    // Bring in the sample ICP (Clay pull) alongside the sheet so the gate is populated.
    const icp = await icpSource.fetch()
    set({ icp, icpFromClosedWon: false, batchReview: null, gateCleared: false, trackingRan: false, trackingCleared: false, budgetCleared: false })
    await get().refresh()
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

  syncComments: async () => {
    const posted = get().rows.filter((r) => r.status === 'posted')
    const comments: Record<string, Comment[]> = {}
    for (const r of posted) {
      comments[r.id] = await mockCommentSource.fetch(r)
    }
    set({ comments })
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
        const brand = get().clientProfiles[clientForCampaign(campaign)]
        const result = await copyWriter.draft({ icp, campaign, brand, assets })
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

  acceptReview: () => set({ gateCleared: true }),

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
