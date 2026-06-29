import { useMemo, useState } from 'react'
import { applyBreakStatus, breakScopeKey, resolveBreaks } from '../domain/breaks'
import { clientForCampaign } from '../domain/clients'
import { campaignAttention, campaignStats, deriveCampaignStatus, type CampaignStatus } from '../domain/lifecycle'
import { mockAttio } from '../adapters/attio/mockAttio'
import type { TrafficRow } from '../domain/types'
import { DRAFTS_SPACE, useTrafficStore } from '../store/useTrafficStore'
import { CampaignThumb } from './CampaignThumb'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { HomeSidebar, type BrandRow } from './HomeSidebar'
import { NewCanvasButton } from './NewCanvasButton'

/**
 * The home — a files browser for canvases, in the same shell as the canvas page:
 * a left files sidebar, the open-canvas tabs across the top, and a gallery of
 * canvas thumbnail cards you open with a click. Canvases live in a brand or in the
 * personal Drafts space; the sidebar filters the gallery (all / drafts / flagged /
 * live, or one brand). "New canvas" (top-right) starts a fresh Drafts canvas.
 */

const HOUR = 3_600_000
const DAY = 86_400_000
function fmtAgo(ms: number): string {
  if (!ms) return ''
  const d = Date.now() - ms
  if (d < 0) return 'just now'
  if (d < HOUR) {
    const m = Math.floor(d / 60_000)
    return m <= 1 ? 'just now' : `${m}m ago`
  }
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface CanvasCard {
  name: string
  client: string
  status: CampaignStatus
  rows: TrafficRow[]
  lastTouched: number
  flagged: boolean
}

export function ClientsOverview() {
  const rows = useTrafficStore((s) => s.rows)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const clientList = useTrafficStore((s) => s.clientList)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const openCampaign = useTrafficStore((s) => s.openCampaign)
  const openOnboard = useTrafficStore((s) => s.openOnboard)
  const deleteClient = useTrafficStore((s) => s.deleteClient)
  const loadSample = useTrafficStore((s) => s.loadSample)

  const [filter, setFilter] = useState('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Every canvas (campaign) across brands + Drafts, as a gallery card. Brand-less
  // Drafts canvases and zero-asset canvases are included, so a fresh canvas is
  // always reachable here even before its first asset.
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

  // Brands = real clients (Drafts is its own filter), incl. ones with no canvas yet.
  const brands = useMemo<BrandRow[]>(() => {
    const count = new Map<string, number>()
    for (const c of canvases) if (c.client && c.client !== DRAFTS_SPACE) count.set(c.client, (count.get(c.client) ?? 0) + 1)
    for (const c of clientList) if (c && c !== DRAFTS_SPACE && !count.has(c)) count.set(c, 0)
    return [...count.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => a.name.localeCompare(b.name))
  }, [canvases, clientList])

  const shown = useMemo(() => {
    let list = canvases
    if (filter === 'drafts') list = canvases.filter((c) => c.client === DRAFTS_SPACE)
    else if (filter === 'flagged') list = canvases.filter((c) => c.flagged)
    else if (filter === 'live') list = canvases.filter((c) => c.status === 'active')
    else if (filter.startsWith('brand:')) {
      const b = filter.slice(6)
      list = canvases.filter((c) => c.client === b)
    }
    return [...list].sort((a, b) => b.lastTouched - a.lastTouched || a.name.localeCompare(b.name))
  }, [canvases, filter])

  const title = filter.startsWith('brand:')
    ? filter.slice(6)
    : filter === 'drafts'
      ? 'Drafts'
      : filter === 'flagged'
        ? 'Flagged'
        : filter === 'live'
          ? 'Live'
          : 'All canvases'

  return (
    <div className="home-shell">
      <HomeSidebar
        filter={filter}
        setFilter={setFilter}
        counts={counts}
        brands={brands}
        onAddBrand={openOnboard}
        onDeleteBrand={setConfirmDelete}
      />

      <div className="home-main">
        <CanvasProjectTabs />
        <div className="home-main-scroll">
          <div className="home-main-head">
            <h1 className="home-main-title">{title}</h1>
            <NewCanvasButton />
          </div>

          {shown.length === 0 ? (
            <div className="home-empty">
              {canvases.length === 0 ? (
                <>
                  No canvases yet.{' '}
                  <button className="home-link" onClick={openOnboard}>
                    Set up a brand
                  </button>{' '}
                  or{' '}
                  <button className="home-link" onClick={loadSample}>
                    load sample data
                  </button>
                  .
                </>
              ) : (
                'No canvases here yet.'
              )}
            </div>
          ) : (
            <div className="hub-recents home-gallery">
              {shown.map((c) => (
                <button
                  key={`${c.client}|${c.name}`}
                  className="hub-recent"
                  onClick={() => openCampaign(c.name)}
                  title={`Open ${c.name}${c.client ? ` (${c.client})` : ''}`}
                >
                  <div className="hub-recent-thumb">
                    <CampaignThumb rows={c.rows} />
                  </div>
                  <div className="hub-recent-foot">
                    <span className={`hub-recent-dot s-${c.status}`} />
                    <span className="hub-recent-foot-text">
                      <span className="hub-recent-name">{c.name}</span>
                      <span className="hub-recent-sub">
                        {c.client || 'Drafts'}
                        {c.lastTouched ? ` · ${fmtAgo(c.lastTouched)}` : ''}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDelete &&
        (() => {
          const n = canvases.filter((c) => c.client === confirmDelete)
          const assets = n.reduce((a, c) => a + new Set(c.rows.map((r) => r.assetName)).size, 0)
          return (
            <>
              <div className="drawer-scrim" onClick={() => setConfirmDelete(null)} />
              <div className="confirm-modal" role="dialog" aria-label="Delete brand">
                <strong className="confirm-title">Delete {confirmDelete}?</strong>
                <p className="confirm-text">
                  This removes the brand
                  {n.length > 0 ? ` and its ${n.length} canvas${n.length === 1 ? '' : 'es'} · ${assets} asset${assets === 1 ? '' : 's'}` : ''}
                  . This can't be undone.
                </p>
                <div className="confirm-foot">
                  <button className="btn sm" onClick={() => setConfirmDelete(null)}>
                    Cancel
                  </button>
                  <span className="spacer" />
                  <button
                    className="btn sm danger"
                    onClick={() => {
                      void deleteClient(confirmDelete)
                      if (filter === `brand:${confirmDelete}`) setFilter('all')
                      setConfirmDelete(null)
                    }}
                  >
                    Delete brand
                  </button>
                </div>
              </div>
            </>
          )
        })()}
    </div>
  )
}
