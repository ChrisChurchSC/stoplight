import { useEffect, useMemo, useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { clientForCampaign } from '../domain/clients'
import { persistState } from '../adapters/state/workspaceState'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Asset-tasks: a to-do derived from every asset in a brand's flows, so making assets in a flow
 * surfaces them in the Tasks page and on Home without any extra step. "Done" is tracked per-asset
 * (persisted + workspace-synced), independent of the asset's own status — a posted asset also
 * reads as done. Shared by TasksView and HomeAgenda so the two never disagree.
 *
 * An empty `brand` means UNSCOPED — every brand's assets — and not "no brand, so nothing". The rail
 * only lands on a brand when Brand records exist (BrandRail auto-selects the first one); a workspace
 * whose campaigns carry brand folders but no Brand card leaves the filter on 'all', and this hook
 * used to answer that with an empty list, so a workspace of five campaigns and thirty-odd assets
 * showed no tasks anywhere. Each task carries the brand of its own campaign, so an unscoped list
 * still says who each one belongs to.
 */
export const ASSET_DONE_KEY = 'stoplight.assetTaskDone.v1'
/** Who owns each asset-task, by row id. Kept beside the asset rather than on it: an assignee is a
 *  fact about the WORK, not about the thing published, and the row belongs to the flow. */
export const ASSET_ASSIGNEE_KEY = 'stoplight.assetTaskAssignee.v1'

export interface AssetTask {
  id: string // `asset:<rowId>`
  text: string
  due: string // 'YYYY-MM-DD' or ''
  done: boolean
  assignee: string
  createdAt: number
  brand: string
  rowId: string
  campaign: string
  derived: true
}

const loadAssetDone = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(ASSET_DONE_KEY) ?? '[]')
    return Array.isArray(raw) ? (raw as string[]) : []
  } catch {
    return []
  }
}

const loadAssetAssignees = (): Record<string, string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(ASSET_ASSIGNEE_KEY) ?? '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** An asset's own name is enough when it already says the channel: the label used to be built as
 *  "<channel> · <asset>", which read "Landing page · Landing page" and "Instagram · Instagram feed
 *  post" on every row that named its own channel. */
const taskLabel = (channelLabel: string, assetName: string): string => {
  const name = assetName.trim() || 'Untitled asset'
  return name.toLowerCase().startsWith(channelLabel.toLowerCase()) ? name : `${channelLabel} · ${name}`
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function useAssetTasks(brand: string): {
  assetTasks: AssetTask[]
  toggleAssetDone: (rowId: string) => void
  setAssetAssignee: (rowId: string, name: string) => void
  renameAssetAssignee: (from: string, to: string) => void
} {
  const rows = useTrafficStore((s) => s.rows)
  const [assetDone, setAssetDone] = useState<string[]>(() => loadAssetDone())
  const [assignees, setAssignees] = useState<Record<string, string>>(() => loadAssetAssignees())

  // Reload when another view (or tab) edits an asset-task — all of them fire 'stoplight:tasks'.
  useEffect(() => {
    const update = () => {
      setAssetDone(loadAssetDone())
      setAssignees(loadAssetAssignees())
    }
    window.addEventListener('stoplight:tasks', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('stoplight:tasks', update)
      window.removeEventListener('focus', update)
    }
  }, [])

  const toggleAssetDone = (rowId: string) => {
    const next = loadAssetDone()
    const i = next.indexOf(rowId)
    if (i >= 0) next.splice(i, 1)
    else next.push(rowId)
    persistState(ASSET_DONE_KEY, next)
    setAssetDone(next)
    window.dispatchEvent(new Event('stoplight:tasks'))
  }

  const setAssetAssignee = (rowId: string, name: string) => {
    const next = loadAssetAssignees()
    // An unassigned asset drops out of the map rather than storing '', so the store does not fill
    // with a key per asset anyone ever opened.
    if (name.trim()) next[rowId] = name.trim()
    else delete next[rowId]
    persistState(ASSET_ASSIGNEE_KEY, next)
    setAssignees(next)
    window.dispatchEvent(new Event('stoplight:tasks'))
  }

  /** Rename an owner everywhere at once, or drop them ('' clears). A name is only ever typed, so a
   *  typo is the normal case — fixing it has to reach every asset already carrying it, not just the
   *  one in front of you. */
  const renameAssetAssignee = (from: string, to: string) => {
    const next = loadAssetAssignees()
    let touched = false
    for (const [rowId, who] of Object.entries(next)) {
      if (who !== from) continue
      touched = true
      if (to.trim()) next[rowId] = to.trim()
      else delete next[rowId]
    }
    if (!touched) return
    persistState(ASSET_ASSIGNEE_KEY, next)
    setAssignees(next)
    window.dispatchEvent(new Event('stoplight:tasks'))
  }

  const assetTasks = useMemo<AssetTask[]>(() => {
    const done = new Set(assetDone)
    return rows
      .filter((r) => !r.archivedAt && (!brand || clientForCampaign(r.campaign) === brand))
      .map((r) => ({
        id: `asset:${r.id}`,
        text: taskLabel(CHANNELS[r.channel]?.label ?? r.channel, r.assetName ?? ''),
        due: r.scheduledAt ? ymd(new Date(r.scheduledAt)) : '',
        done: done.has(r.id) || r.status === 'posted',
        assignee: assignees[r.id] ?? '',
        createdAt: r.scheduledAt ? Date.parse(r.scheduledAt) : 0,
        // The asset's own brand, not the filter's — unscoped, the two are not the same.
        brand: clientForCampaign(r.campaign),
        rowId: r.id,
        campaign: r.campaign ?? '',
        derived: true as const,
      }))
  }, [rows, brand, assetDone, assignees])

  return { assetTasks, toggleAssetDone, setAssetAssignee, renameAssetAssignee }
}
