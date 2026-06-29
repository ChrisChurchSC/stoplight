import { useMemo } from 'react'
import { mockAttio } from '../adapters/attio/mockAttio'
import { applyBreakStatus, breakScopeKey, resolveBreaks } from '../domain/breaks'
import { clientForCampaign } from '../domain/clients'
import { campaignAttention, deriveCampaignStatus, type CampaignStatus } from '../domain/lifecycle'
import type { TrafficRow } from '../domain/types'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'

/**
 * The canvases (campaigns) that back the files-browser home, plus the sidebar's
 * counts + brand list. Shared by the gallery (ClientsOverview) and the files
 * sidebar (HomeSidebar) so both read one computation.
 */

export interface CanvasCard {
  name: string
  client: string
  status: CampaignStatus
  rows: TrafficRow[]
  lastTouched: number
  flagged: boolean
}

export interface BrandRow {
  name: string
  count: number
}

export function useHomeCanvases(): {
  canvases: CanvasCard[]
  counts: Record<string, number>
  brands: BrandRow[]
} {
  const rows = useTrafficStore((s) => s.rows)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const clientList = useTrafficStore((s) => s.clientList)
  const breakStatus = useTrafficStore((s) => s.breakStatus)

  const canvases = useMemo<CanvasCard[]>(() => {
    const allBreaks = applyBreakStatus(resolveBreaks(rows, null, null, breakScopeKey('all', 'all')), breakStatus)
    const meta = new Map(campaignList.map((c) => [c.name, c] as const))
    const names = [
      ...new Set([
        ...rows.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
        ...campaignList.map((c) => c.name),
      ]),
    ]
    return names.map((name) => {
      const cRows = rows.filter((r) => (r.campaign ?? '').trim() === name)
      const assetNames = new Set(cRows.map((r) => r.assetName))
      let revenue = 0
      for (const n of assetNames) revenue += mockAttio.attributionForAsset(n).wonRevenue
      const spend = cRows.reduce((a, r) => a + (r.spend?.toDate ?? 0), 0)
      const breaks = allBreaks.filter(
        (b) => b.campaign === name || assetNames.has(b.from.assetName) || (b.to ? assetNames.has(b.to.assetName) : false),
      )
      const attention = campaignAttention({ rows: cRows, breaks, roas: spend > 0 ? revenue / spend : null, spend })
      return {
        name,
        client: clientForCampaign(name),
        status: deriveCampaignStatus(meta.get(name), cRows),
        rows: cRows,
        lastTouched: cRows.reduce((m, r) => Math.max(m, r.postedAt ?? r.createdAt ?? 0), 0),
        flagged: attention.count > 0,
      }
    })
  }, [rows, campaignList, breakStatus])

  const counts: Record<string, number> = {
    all: canvases.length,
    drafts: canvases.filter((c) => c.client === DRAFTS_SPACE).length,
    flagged: canvases.filter((c) => c.flagged).length,
    live: canvases.filter((c) => c.status === 'active').length,
  }

  const brands = useMemo<BrandRow[]>(() => {
    const count = new Map<string, number>()
    for (const c of canvases) if (c.client && c.client !== DRAFTS_SPACE) count.set(c.client, (count.get(c.client) ?? 0) + 1)
    for (const c of clientList) if (c && c !== DRAFTS_SPACE && !count.has(c)) count.set(c, 0)
    return [...count.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => a.name.localeCompare(b.name))
  }, [canvases, clientList])

  return { canvases, counts, brands }
}
