import { useEffect, useMemo } from 'react'
import { clientForCampaign } from '../domain/clients'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The project drawer: what you have open across the very top of the canvas, as folder tabs. Holds
 * three kinds of tab — campaigns (a flow), brands (a brand page), and data sets (a full-page
 * spreadsheet) — each a closeable browser-style tab. Opening any of them adds its tab.
 */
export function CanvasProjectTabs() {
  const rows = useTrafficStore((s) => s.rows)
  const page = useTrafficStore((s) => s.page)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const openProjects = useTrafficStore((s) => s.openProjects)
  const openProject = useTrafficStore((s) => s.openProject)
  const closeProject = useTrafficStore((s) => s.closeProject)
  const setPage = useTrafficStore((s) => s.setPage)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setBrandTab = useTrafficStore((s) => s.setBrandTab)
  const openBrandTabs = useTrafficStore((s) => s.openBrandTabs)
  const closeBrandTab = useTrafficStore((s) => s.closeBrandTab)
  const openDatasetTabs = useTrafficStore((s) => s.openDatasetTabs)
  const activeDatasetId = useTrafficStore((s) => s.activeDatasetId)
  const openDatasetTab = useTrafficStore((s) => s.openDatasetTab)
  const closeDatasetTab = useTrafficStore((s) => s.closeDatasetTab)
  const smartObjects = useTrafficStore((s) => s.smartObjects)
  const openObjectTabs = useTrafficStore((s) => s.openObjectTabs)
  const activeObjectId = useTrafficStore((s) => s.activeObjectId)
  const openObjectTab = useTrafficStore((s) => s.openObjectTab)
  const closeObjectTab = useTrafficStore((s) => s.closeObjectTab)
  const brandDatasets = useTrafficStore((s) => s.brandDatasets)

  const assetCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const c = (r.campaign ?? '').trim()
      if (c) m.set(c, (m.get(c) ?? 0) + 1)
    }
    return m
  }, [rows])

  // Only the CURRENT brand's open flows get tabs: switching brands hides the other brand's tabs
  // (they stay open in the store and reappear when you switch back), so you can't reach another
  // brand's flows from here. On the "all brands" scope, show everything.
  const projects = useMemo(
    () =>
      openProjects
        .map((c) => ({ campaign: c, client: clientForCampaign(c), count: assetCounts.get(c) ?? 0 }))
        .filter((p) => clientFilter === 'all' || p.client === clientFilter),
    [openProjects, assetCounts, clientFilter],
  )

  // Opening a campaign's canvas adds it to the drawer (assets or not).
  useEffect(() => {
    if (campaignFilter !== 'all') openProject(campaignFilter)
  }, [campaignFilter, openProject])

  // A tab opens its campaign as a flow (not the legacy canvas).
  const switchTo = (campaign: string) => {
    if (campaign === campaignFilter) return
    openFlow(campaign)
  }
  const close = (e: React.MouseEvent, campaign: string) => {
    e.stopPropagation()
    closeProject(campaign)
    if (campaign === campaignFilter) {
      const next = projects.find((p) => p.campaign !== campaign)
      if (next) openFlow(next.campaign)
      else setPage('flows')
    }
  }

  const openBrand = (b: string) => {
    setClientFilter(b)
    setBrandTab('data')
  }
  const closeBrand = (e: React.MouseEvent, b: string) => {
    e.stopPropagation()
    const wasActive = page === 'brand' && clientFilter === b
    closeBrandTab(b)
    if (wasActive) setPage('flows')
  }
  const closeDs = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    closeDatasetTab(id)
  }
  const closeObj = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    closeObjectTab(id)
  }

  return (
    <div className="cv-projects">
      {projects.map((p) => (
        <span
          key={p.campaign}
          className={`cv-project-tab${p.campaign === campaignFilter && page === 'flows' ? ' active' : ''}`}
          title={`${p.client} · ${p.campaign} (${p.count} assets)`}
          role="button"
          tabIndex={0}
          onClick={() => switchTo(p.campaign)}
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
      {openBrandTabs.map((b) => (
        <span
          key={`brand:${b}`}
          className={`cv-project-tab cv-brand-tab${page === 'brand' && clientFilter === b ? ' active' : ''}`}
          title={`Brand · ${b}`}
          role="button"
          tabIndex={0}
          onClick={() => openBrand(b)}
        >
          <span className="cv-project-tab-body">
            <span className="cv-project-tab-client">Brand</span>
            <span className="cv-project-tab-name">{b}</span>
          </span>
          <button className="cv-project-tab-x" title="Close this tab" onClick={(e) => closeBrand(e, b)}>
            ✕
          </button>
        </span>
      ))}
      {openDatasetTabs.map((id) => {
        const ds = brandDatasets.find((d) => d.id === id)
        if (!ds) return null
        return (
          <span
            key={`ds:${id}`}
            className={`cv-project-tab cv-dataset-tab${page === 'dataset' && activeDatasetId === id ? ' active' : ''}`}
            title={`${ds.brand} · ${ds.name || 'Untitled data set'}`}
            role="button"
            tabIndex={0}
            onClick={() => openDatasetTab(id)}
          >
            <span className="cv-project-tab-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>
            </span>
            <span className="cv-project-tab-body">
              <span className="cv-project-tab-client">{ds.brand}</span>
              <span className="cv-project-tab-name">{ds.name || 'Untitled data set'}</span>
            </span>
            <button className="cv-project-tab-x" title="Close this tab" onClick={(e) => closeDs(e, id)}>
              ✕
            </button>
          </span>
        )
      })}
      {openObjectTabs.map((id) => {
        const o = smartObjects.find((x) => x.id === id)
        // The guard matters: deleting an object with its tab still open would otherwise crash the
        // whole strip rather than dropping one tab.
        if (!o) return null
        const where = o.scope === 'campaign' ? 'Only on this campaign' : o.brand ?? 'Brand library'
        return (
          <span
            key={`obj:${id}`}
            className={`cv-project-tab cv-object-tab${page === 'object' && activeObjectId === id ? ' active' : ''}`}
            title={`${where} · ${o.name || 'Untitled smart object'}`}
            role="button"
            tabIndex={0}
            onClick={() => openObjectTab(id)}
          >
            <span className="cv-project-tab-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" />
              </svg>
            </span>
            <span className="cv-project-tab-body">
              <span className="cv-project-tab-client">{where}</span>
              <span className="cv-project-tab-name">{o.name || 'Untitled smart object'}</span>
            </span>
            <button className="cv-project-tab-x" title="Close this tab" onClick={(e) => closeObj(e, id)}>
              ✕
            </button>
          </span>
        )
      })}
      <span
        className="cv-project-tab cv-project-tab-new"
        role="button"
        tabIndex={0}
        title="New campaign"
        onClick={() => openFlow('')}
      >
        ＋
      </span>
    </div>
  )
}
