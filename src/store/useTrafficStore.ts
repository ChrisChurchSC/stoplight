import { create } from 'zustand'
import { MockSheetAdapter } from '../adapters/sheet/mockSheetAdapter'
import type { SheetAdapter } from '../adapters/sheet/types'
import { publishers as channelPublishers } from '../adapters/publishers/registry'
import type { PublisherRegistry } from '../adapters/publishers/types'
import type { Asset, ChannelId, TrafficRow } from '../domain/types'
import { proposeSchedule } from '../scheduling/propose'
import { sampleRows } from '../domain/sampleData'
import { typesFor } from '../domain/channelAssetTypes'
import { extractInCreativeCopy } from '../adapters/copy/extract'
import { MockIcpSource, MockIcpReviewer } from '../adapters/icp/mockIcp'
import type { BatchReview, Icp, IcpReviewer, IcpSource } from '../adapters/icp/types'

// Wire the swappable seams here. Replace these two lines to go live.
const sheet: SheetAdapter = new MockSheetAdapter()
const publishers: PublisherRegistry = channelPublishers
const icpSource: IcpSource = new MockIcpSource()
const icpReviewer: IcpReviewer = new MockIcpReviewer()

function freshRowId(): string {
  return `row_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
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
  setFilter: (filter: ChannelId | 'all') => void
  setQuery: (query: string) => void

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
  reviewRowId: null,
  icp: null,
  batchReview: null,
  reviewing: false,
  gateCleared: false,

  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),

  refresh: async () => {
    set({ loading: true })
    const rows = await sheet.list()
    set({ rows, loading: false })
  },

  addAssets: (assets) => set((s) => ({ assets: [...s.assets, ...assets] })),

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
    set({ batchReview: null, gateCleared: false })
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
    // Gate: messaging review must be cleared before scheduling.
    if (!get().gateCleared) return
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
    set({ batchReview: null, gateCleared: false })
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
    set({ icp })
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
}))
