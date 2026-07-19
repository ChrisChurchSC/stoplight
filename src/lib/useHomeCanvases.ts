import { useMemo } from 'react'
import { mockAttio } from '../adapters/attio/mockAttio'
import { resolveCampaignGoal, type CampaignGoal } from '../domain/campaignGoal'
import { applyBreakStatus, breakScopeKey, resolveBreaks } from '../domain/breaks'
import { clientForCampaign } from '../domain/clients'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { campaignAttention, deriveCampaignStatus, type CampaignAttention, type CampaignStatus } from '../domain/lifecycle'
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
  /** Triage detail behind `flagged` (the flags + count), for cockpit/risk views. */
  attention: CampaignAttention
  /** Actual paid spend to date across the campaign's assets. */
  spend: number
  /** Attributed won revenue across the campaign's assets. */
  revenue: number
  /** The campaign's resolved goal: what the assets communicate + the KPI/target. */
  goal: CampaignGoal
  /** The folder this campaign is filed under, within its brand (undefined = unfiled). */
  folder?: string
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
  const brandSystems = useTrafficStore((s) => s.brandSystems)

  const canvases = useMemo<CanvasCard[]>(() => {
    const allBreaks = applyBreakStatus(resolveBreaks(rows, null, null, breakScopeKey('all', 'all')), breakStatus)
    // Archived campaigns/assets (soft-deleted) drop out of the hub — recoverable
    // via restoreCampaign, but hidden from the gallery + counts.
    const live = rows.filter((r) => !r.archivedAt)
    const meta = new Map(campaignList.map((c) => [c.name, c] as const))
    const names = [
      ...new Set([
        ...live.map((r) => (r.campaign ?? '').trim()).filter(Boolean),
        ...campaignList.filter((c) => !c.archivedAt).map((c) => c.name),
      ]),
    ]
    return names.flatMap((name) => {
      const cRowsAll = live.filter((r) => (r.campaign ?? '').trim() === name)
      // The library bucket ("Published content") holds EVERY brand's ingested content in one shared
      // campaign, so split it into one canvas per brand (its rows carry their own `client`). Every
      // other campaign is a single canvas keyed by the campaign's client.
      const groups =
        name === CONTENT_LIBRARY_CAMPAIGN && cRowsAll.some((r) => r.client)
          ? [...new Set(cRowsAll.map((r) => (r.client || clientForCampaign(name)).trim()).filter(Boolean))].map((cl) => ({
              client: cl,
              rows: cRowsAll.filter((r) => (r.client || clientForCampaign(name)).trim() === cl),
            }))
          : [{ client: clientForCampaign(name), rows: cRowsAll }]
      return groups.map(({ client, rows: cRows }) => {
        const rtbPool = (brandSystems[client]?.rtbs ?? []).map((r) => ({ id: r.id, label: r.label }))
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
          client,
          status: deriveCampaignStatus(meta.get(name), cRows),
          rows: cRows,
          lastTouched: cRows.reduce((m, r) => Math.max(m, r.postedAt ?? r.createdAt ?? 0), 0),
          flagged: attention.count > 0,
          attention,
          spend,
          revenue,
          goal: resolveCampaignGoal(meta.get(name), cRows, rtbPool),
          folder: meta.get(name)?.folder,
        }
      })
    })
  }, [rows, campaignList, breakStatus, brandSystems])

  const counts: Record<string, number> = {
    all: canvases.length,
    drafts: canvases.filter((c) => c.client === DRAFTS_SPACE).length,
    flagged: canvases.filter((c) => c.flagged).length,
    live: canvases.filter((c) => c.status === 'active').length,
  }

  const brands = useMemo<BrandRow[]>(() => {
    const count = new Map<string, number>()
    // "Published content" is the library archive, not a campaign — it doesn't count.
    for (const c of canvases)
      if (c.client && c.client !== DRAFTS_SPACE && c.name !== CONTENT_LIBRARY_CAMPAIGN)
        count.set(c.client, (count.get(c.client) ?? 0) + 1)
    for (const c of clientList) if (c && c !== DRAFTS_SPACE && !count.has(c)) count.set(c, 0)
    return [...count.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => a.name.localeCompare(b.name))
  }, [canvases, clientList])

  return { canvases, counts, brands }
}
