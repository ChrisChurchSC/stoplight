import { create } from 'zustand'
import { MockSheetAdapter } from '../adapters/sheet/mockSheetAdapter'
import type { SheetAdapter } from '../adapters/sheet/types'
import { publishers as channelPublishers } from '../adapters/publishers/registry'
import type { PublisherRegistry } from '../adapters/publishers/types'
import type { Asset, ChannelId, TrafficRow } from '../domain/types'
import { proposeSchedule } from '../scheduling/propose'
import { classifyAssets } from '../lib/classifyAsset'
import { registerCampaign, type Campaign } from '../domain/clients'
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
import { typesFor } from '../domain/channelAssetTypes'
import { extractInCreativeCopy } from '../adapters/copy/extract'
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
  /** Campaigns created via the new-client wizard (persisted). */
  campaignList: Campaign[]
  addCampaign: (campaign: Campaign) => void
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
  campaignList: loadCampaigns(),
  reviewRowId: null,
  comments: {},
  commentRowId: null,
  icp: null,
  batchReview: null,
  reviewing: false,
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
  addCampaign: (campaign) =>
    set((s) => {
      registerCampaign(campaign.name, campaign.client)
      if (s.campaignList.some((c) => c.name === campaign.name && c.client === campaign.client)) return {}
      const campaignList = [...s.campaignList, campaign]
      saveCampaigns(campaignList)
      return { campaignList }
    }),

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
