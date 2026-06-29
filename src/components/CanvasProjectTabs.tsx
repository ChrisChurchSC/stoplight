import { useEffect, useMemo } from 'react'
import { clientForCampaign } from '../domain/clients'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The project drawer: the campaigns you have open, as folder tabs across the very
 * top of the canvas (flush with the channel filter). Click to flip to a project,
 * × to close it like a browser tab. Opening a campaign's canvas adds its tab.
 */
export function CanvasProjectTabs() {
  const rows = useTrafficStore((s) => s.rows)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const openProjects = useTrafficStore((s) => s.openProjects)
  const openProject = useTrafficStore((s) => s.openProject)
  const closeProject = useTrafficStore((s) => s.closeProject)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const setPage = useTrafficStore((s) => s.setPage)

  const assetCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const c = (r.campaign ?? '').trim()
      if (c) m.set(c, (m.get(c) ?? 0) + 1)
    }
    return m
  }, [rows])

  const projects = useMemo(
    () =>
      openProjects
        .filter((c) => assetCounts.has(c))
        .map((c) => ({ campaign: c, client: clientForCampaign(c), count: assetCounts.get(c)! })),
    [openProjects, assetCounts],
  )

  // Opening a campaign's canvas adds it to the drawer.
  useEffect(() => {
    if (campaignFilter !== 'all' && assetCounts.has(campaignFilter)) openProject(campaignFilter)
  }, [campaignFilter, assetCounts, openProject])

  if (projects.length === 0) return null

  const switchTo = (client: string, campaign: string) => {
    if (campaign === campaignFilter) return
    setClientFilter(client)
    setCampaignFilter(campaign)
  }
  const close = (e: React.MouseEvent, campaign: string) => {
    e.stopPropagation()
    closeProject(campaign)
    if (campaign === campaignFilter) {
      const next = projects.find((p) => p.campaign !== campaign)
      if (next) {
        setClientFilter(next.client)
        setCampaignFilter(next.campaign)
      } else {
        setPage('clients')
      }
    }
  }

  return (
    <div className="cv-projects">
      {projects.map((p) => (
        <span
          key={p.campaign}
          className={`cv-project-tab${p.campaign === campaignFilter ? ' active' : ''}`}
          title={`${p.client} · ${p.campaign} (${p.count} assets)`}
          role="button"
          tabIndex={0}
          onClick={() => switchTo(p.client, p.campaign)}
        >
          <span className="cv-project-tab-body">
            <span className="cv-project-tab-client">{p.client}</span>
            <span className="cv-project-tab-name">{p.campaign}</span>
          </span>
          <button className="cv-project-tab-x" title="Close this canvas" onClick={(e) => close(e, p.campaign)}>
            ✕
          </button>
        </span>
      ))}
    </div>
  )
}
