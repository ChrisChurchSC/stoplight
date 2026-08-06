import { useEffect, useMemo } from 'react'
import { DRAFTS, folderName } from '../domain/campaignFolders'
import { campaignShortName, clientForCampaign } from '../domain/clients'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * The project drawer: what you have open across the very top of the canvas, as folder tabs. Holds
 * three kinds of tab — campaigns (a flow), brands (a brand page), and data sets (a full-page
 * spreadsheet) — each a closeable browser-style tab. Opening any of them adds its tab.
 *
 * EVERY TAB SAYS THE SAME TWO THINGS: the folder it is filed in, then its name. That is the whole
 * label, and the tabs used to disagree about it — one showed the brand, one showed the word "Brand",
 * one showed a sentence ("Only on this campaign"), and two carried a glyph the other two did not. So
 * the eyebrow meant a different KIND of thing on each tab and the strip could not be read straight
 * across. A folder and a file name is the one pair every tab can answer, and the things that are in
 * no folder answer DRAFTS rather than going blank.
 *
 * The glyphs are gone with it. They distinguished data sets and objects from campaigns, but a tab is
 * identified by what it says, and two of four tabs wearing an icon read as a status the other two
 * had failed to earn rather than as a type.
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
  const campaignList = useTrafficStore((s) => s.campaignList)
  // Whether a campaign BOARD is the thing on screen, as opposed to the Campaigns index. FlowsView
  // mirrors its own screen state here; it is the only honest answer to "am I looking at a campaign",
  // and closing a tab has to know. See close().
  const flowCanvasOpen = useTrafficStore((s) => s.flowCanvasOpen)
  const goFlowHome = useTrafficStore((s) => s.goFlowHome)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  // The workspace-read-succeeded flag the prune waits on; see pruneOpenProjects for why it is this
  // one and not boardsHydrated.
  const flightsHydrated = useTrafficStore((s) => s.flightsHydrated)
  const pruneOpenProjects = useTrafficStore((s) => s.pruneOpenProjects)

  // Where each campaign is filed, by name. A campaign the list has never heard of (one that exists
  // only as a value on some rows) has no folder, which reads the same as unfiled — true enough.
  const folderOf = useMemo(
    () => new Map(campaignList.map((c) => [c.name, c.folder ?? ''])),
    [campaignList],
  )

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
        .map((c) => {
          const client = clientForCampaign(c)
          return {
            campaign: c,
            client,
            folder: folderOf.get(c) ?? '',
            short: campaignShortName(c, client),
            count: assetCounts.get(c) ?? 0,
          }
        })
        .filter((p) => clientFilter === 'all' || p.client === clientFilter),
    [openProjects, assetCounts, clientFilter, folderOf],
  )

  // Opening a campaign's canvas adds it to the drawer (assets or not).
  useEffect(() => {
    if (campaignFilter !== 'all') openProject(campaignFilter)
  }, [campaignFilter, openProject])

  /**
   * And drop the tabs whose campaigns are gone. The drawer is persisted on its own, so it can come
   * back from a previous session naming campaigns this workspace no longer has; the store decides
   * when that is safe to act on (it waits for the workspace to load, and only does it once), so this
   * can simply ask on every render that matters.
   */
  useEffect(() => {
    pruneOpenProjects()
  }, [pruneOpenProjects, flightsHydrated, rows, campaignList])

  // A tab opens its campaign as a flow (not the legacy canvas).
  const switchTo = (campaign: string) => {
    if (campaign === campaignFilter) return
    openFlow(campaign)
  }
  /**
   * CLOSING A TAB IS NOT NAVIGATION, AND IT IS NOT A DELETE.
   *
   * The ✕ used to move you whenever the tab it closed matched campaignFilter — and campaignFilter
   * names the campaign most recently OPENED, which outlives leaving it: going back to the Campaigns
   * index does not clear it. So tidying a tab away while standing ON the Campaigns page threw you
   * into some other campaign's board, and the page you were reading was gone. Worse when the tab it
   * landed on belonged to another brand: openFlow re-scopes the workspace to the campaign it opens,
   * so a close could swap the brand under you and empty the Campaigns page of everything you had
   * just been looking at. Nothing was deleted, but everything looked deleted.
   *
   * So: the tab always goes, and NOTHING ELSE HAPPENS unless the campaign you closed is the board
   * actually on screen. Only then is there something to replace, because the thing you were looking
   * at has gone.
   */
  const close = (e: React.MouseEvent, campaign: string) => {
    e.stopPropagation()
    closeProject(campaign)
    const viewingIt = page === 'flows' && flowCanvasOpen && campaign === campaignFilter
    if (!viewingIt) return
    /**
     * WITHIN THE SAME BRAND, OR HOME. A sibling tab is the browser-ish answer and the right one, but
     * only among this brand's tabs: openFlow sets the workspace scope to its campaign's client, and
     * a close is not a request to change brand. With no sibling, go to the Campaigns index — the old
     * setPage('flows') was a no-op from a flow (we were already on that page), which stranded you on
     * the board of the campaign whose tab you had just closed, with no tab left pointing at it.
     */
    const client = clientForCampaign(campaign)
    const next = projects.find((p) => p.campaign !== campaign && p.client === client)
    if (next) {
      // Read BEFORE the open: openFlow narrows the scope to its campaign's brand, and if you were
      // browsing all of them the index has to stay that way. A close must not shrink what you can see.
      const wasAllBrands = clientFilter === 'all'
      openFlow(next.campaign)
      if (wasAllBrands) setClientFilter('all')
      return
    }
    goFlowHome()
    // Nothing is open now, so no tab should read as active — and campaignFilter left pointing at a
    // closed campaign is exactly what the effect above re-opens a tab from.
    setCampaignFilter('all')
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
          title={`${p.client} · ${p.folder || DRAFTS} · ${p.short} (${p.count} assets)`}
          role="button"
          tabIndex={0}
          onClick={() => switchTo(p.campaign)}
        >
          <span className="cv-project-tab-body">
            {/* The eyebrow is WHERE this campaign lives, and within a brand that means its folder —
                not the brand, which the strip is already scoped to. Showing the brand here read as a
                folder that didn't exist, and then said the brand a second time in the name below it,
                because names are stored brand-prefixed. Nested folders show their last segment; the
                tooltip carries the full path. */}
            <span className="cv-project-tab-client">{p.folder ? folderName(p.folder) : DRAFTS}</span>
            <span className="cv-project-tab-name">{p.short}</span>
          </span>
          <button className="cv-project-tab-x" title="Close this tab" onClick={(e) => close(e, p.campaign)}>
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
            {/* The one tab with no folder to name and no business claiming one. A brand is the top of
                the tree, so it is in no folder the way a drive is in no drive — and it is emphatically
                not in Drafts, which would read as a brand somebody had yet to finish. The eyebrow says
                what this tab IS instead. The name has to carry the brand because brand tabs, unlike
                flow tabs, are not filtered to the brand in scope: several can sit in the strip. */}
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
            title={`${DRAFTS} · ${ds.name || 'Untitled data set'}`}
            role="button"
            tabIndex={0}
            onClick={() => openDatasetTab(id)}
          >
            <span className="cv-project-tab-body">
              {/* A data set has a brand but no folder — nothing files them yet — so they are all in
                  Drafts, and the line says the same thing for every one of them until they can be
                  filed. It used to say the brand, which was the brand a second time on a strip
                  already scoped to one, dressed as the folder it was standing in for. */}
              <span className="cv-project-tab-client">{DRAFTS}</span>
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
        // An object's folder is a path inside its brand's library, so the eyebrow shows the last
        // segment and the tooltip carries the whole path — same rule the campaign tabs follow.
        //
        // This line used to carry the object's SCOPE ("Only on this campaign" / the brand library),
        // which is a different question: where it can be SEEN, not where it is filed. Worth knowing,
        // and not worth a tab's one label — a sentence in a 9px eyebrow truncated to "ONLY ON THIS…"
        // on any tab with a real name beside it. Scope belongs on the object page, which states it.
        const folder = o.folder ? folderName(o.folder) : DRAFTS
        return (
          <span
            key={`obj:${id}`}
            className={`cv-project-tab cv-object-tab${page === 'object' && activeObjectId === id ? ' active' : ''}`}
            title={`${o.folder || DRAFTS} · ${o.name || 'Untitled smart object'}`}
            role="button"
            tabIndex={0}
            onClick={() => openObjectTab(id)}
          >
            <span className="cv-project-tab-body">
              <span className="cv-project-tab-client">{folder}</span>
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
