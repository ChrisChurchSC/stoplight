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

export interface AssetTask {
  id: string // `asset:<rowId>`
  text: string
  due: string // 'YYYY-MM-DD' or ''
  done: boolean
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

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function useAssetTasks(brand: string): {
  assetTasks: AssetTask[]
  toggleAssetDone: (rowId: string) => void
} {
  const rows = useTrafficStore((s) => s.rows)
  const [assetDone, setAssetDone] = useState<string[]>(() => loadAssetDone())

  // Reload when another view (or tab) toggles an asset-task — both fire 'stoplight:tasks'.
  useEffect(() => {
    const update = () => setAssetDone(loadAssetDone())
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

  const assetTasks = useMemo<AssetTask[]>(() => {
    const done = new Set(assetDone)
    return rows
      .filter((r) => !r.archivedAt && (!brand || clientForCampaign(r.campaign) === brand))
      .map((r) => ({
        id: `asset:${r.id}`,
        text: `${CHANNELS[r.channel]?.label ?? r.channel} · ${r.assetName || 'Untitled asset'}`,
        due: r.scheduledAt ? ymd(new Date(r.scheduledAt)) : '',
        done: done.has(r.id) || r.status === 'posted',
        createdAt: r.scheduledAt ? Date.parse(r.scheduledAt) : 0,
        // The asset's own brand, not the filter's — unscoped, the two are not the same.
        brand: clientForCampaign(r.campaign),
        rowId: r.id,
        campaign: r.campaign ?? '',
        derived: true as const,
      }))
  }, [rows, brand, assetDone])

  return { assetTasks, toggleAssetDone }
}
