import { lazy, Suspense, useEffect, useState } from 'react'
import { ChunkBoundary } from './ChunkBoundary'
import type { DragEvent } from 'react'
import { filesToAssets, looksLikeUrl, urlToAsset } from '../lib/files'
import { claimInvite } from '../lib/session'
import { isSupabaseConfigured } from '../lib/supabase'
import { useTrafficStore } from '../store/useTrafficStore'
import { GlobalNav } from './GlobalNav'
import { HomeShell } from './HomeShell'
import { AccountSettings } from './AccountSettings'
import { Sidebar } from './Sidebar'
import { Breadcrumb } from './Breadcrumb'
import { buildCampaignLink, readCampaignLink } from '../domain/campaignLink'
import { IngestTray } from './IngestTray'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { ViewToggle } from './ViewToggle'
import { InsightsTabs } from './InsightsTabs'
import { FlowsView } from './FlowsView'
// FlowsView imports both of these itself, so they are in the entry chunk whatever this file does.
// Splitting them here would buy no bytes and cost a frame of blank canvas on every switch into
// Grid or Calendar, so they stay static.
import { SheetGrid } from './SheetGrid'
import { CalendarView } from './CalendarView'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { IcpDrawer } from './IcpDrawer'
import { PersonalizationDrawer } from './PersonalizationDrawer'
import { SavedViewsDrawer } from './SavedViewsDrawer'
import { TrackingDrawer } from './TrackingDrawer'
import { CopyReview } from './CopyReview'
import { CommentDrawer } from './CommentDrawer'
import { DrivePicker } from './DrivePicker'
import { NewClientWizard } from './NewClientWizard'
import { AudienceWizard } from './AudienceWizard'
import { BreaksQueue } from './BreaksQueue'
import { ReadinessPanel } from './ReadinessPanel'
import { DiagnosisOverlay } from './DiagnosisOverlay'
import { AskClaude } from './AskClaude'
import { ShareBanner } from './ShareBanner'
import { ShareDialog } from './ShareDialog'
import { CommentInbox } from './CommentInbox'
import { VersionHistory } from './VersionHistory'
import { ClaudeEngine } from './ClaudeEngine'
import { ChannelIngestDrawer } from './ChannelIngestDrawer'
import { DevReset } from './DevReset'
import { Toast } from './Toast'

/**
 * THE ROUTED SCREENS, one chunk each.
 *
 * Everything above is either chrome that renders on every route (rail, breadcrumb, tab bar, view
 * pills) or an overlay that is always mounted and decides for itself whether to show anything.
 * Those have to stay static: a lazy component that is on screen the whole time buys nothing and
 * only adds a suspense boundary the shell can fall through.
 *
 * Everything below is a destination reached by a click, so it does not belong in the first
 * download. Statically importing all of them is what made the app one 1.3MB chunk in which every
 * user paid for every screen they would never open. Each is a NAMED export, hence the `.then`
 * unwrap: React.lazy only understands a module whose `default` is the component.
 *
 * FlowsView is the deliberate exception and stays static above. `page` boots to 'flows'
 * (useTrafficStore's initial state), so it is the front door: making it lazy would put a second
 * round trip in front of the one screen almost everybody sees first. It is also by far the largest
 * module here, so splitting it internally is the next real win, not splitting it off the entry.
 * SheetGrid and CalendarView stay static for a duller reason, noted at their imports: FlowsView
 * pulls them in anyway, so a lazy() around them would be a suspend with nothing to wait for.
 */
const BrandWorkspace = lazy(() => import('./BrandWorkspace').then((m) => ({ default: m.BrandWorkspace })))
const ClientsOverview = lazy(() => import('./ClientsOverview').then((m) => ({ default: m.ClientsOverview })))
const CanvasView = lazy(() => import('./CanvasView').then((m) => ({ default: m.CanvasView })))
const InsightsView = lazy(() => import('./InsightsView').then((m) => ({ default: m.InsightsView })))
const ConnectorsPage = lazy(() => import('./ConnectorsPage').then((m) => ({ default: m.ConnectorsPage })))
const LibraryPage = lazy(() => import('./LibraryPage').then((m) => ({ default: m.LibraryPage })))
const LibraryView = lazy(() => import('./LibraryView').then((m) => ({ default: m.LibraryView })))
const PrioritiesView = lazy(() => import('./PrioritiesView').then((m) => ({ default: m.PrioritiesView })))
const ChannelsView = lazy(() => import('./ChannelsView').then((m) => ({ default: m.ChannelsView })))
const ChannelRecordsView = lazy(() => import('./ChannelRecordsView').then((m) => ({ default: m.ChannelRecordsView })))
const ReportsView = lazy(() => import('./ReportsView').then((m) => ({ default: m.ReportsView })))
const CompaniesView = lazy(() => import('./CompaniesView').then((m) => ({ default: m.CompaniesView })))
const PeopleView = lazy(() => import('./PeopleView').then((m) => ({ default: m.PeopleView })))
const SegmentsView = lazy(() => import('./SegmentsView').then((m) => ({ default: m.SegmentsView })))
const ProofPointsView = lazy(() => import('./ProofPointsView').then((m) => ({ default: m.ProofPointsView })))
const MessagesView = lazy(() => import('./MessagesView').then((m) => ({ default: m.MessagesView })))
const VoicesView = lazy(() => import('./VoicesView').then((m) => ({ default: m.VoicesView })))
const PatternsView = lazy(() => import('./PatternsView').then((m) => ({ default: m.PatternsView })))
const TriggersView = lazy(() => import('./TriggersView').then((m) => ({ default: m.TriggersView })))
const ObjectivesView = lazy(() => import('./ObjectivesView').then((m) => ({ default: m.ObjectivesView })))
const TasksView = lazy(() => import('./TasksView').then((m) => ({ default: m.TasksView })))
const BrandsView = lazy(() => import('./BrandsView').then((m) => ({ default: m.BrandsView })))
const CampaignCalendar = lazy(() => import('./CampaignCalendar').then((m) => ({ default: m.CampaignCalendar })))
const BrandPage = lazy(() => import('./BrandPage').then((m) => ({ default: m.BrandPage })))
const DatasetPage = lazy(() => import('./DatasetPage').then((m) => ({ default: m.DatasetPage })))
const ObjectPage = lazy(() => import('./ObjectPage').then((m) => ({ default: m.ObjectPage })))
const BillingPage = lazy(() => import('./BillingPage').then((m) => ({ default: m.BillingPage })))
const Portfolio = lazy(() => import('./Portfolio').then((m) => ({ default: m.Portfolio })))

export function Workbench() {
  const refresh = useTrafficStore((s) => s.refresh)
  const hydrateRecords = useTrafficStore((s) => s.hydrateRecords)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const view = useTrafficStore((s) => s.view)
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const ingestBrandSite = useTrafficStore((s) => s.ingestBrandSite)
  const refreshActuals = useTrafficStore((s) => s.refreshActuals)
  const contributeAggregate = useTrafficStore((s) => s.contributeAggregate)
  const homeFilter = useTrafficStore((s) => s.homeFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const { brands } = useHomeCanvases()
  const wizardOpen = useTrafficStore((s) => s.wizardOpen)
  const wizardClient = useTrafficStore((s) => s.wizardClient)
  const closeWizard = useTrafficStore((s) => s.closeWizard)
  const openAsk = useTrafficStore((s) => s.openAsk)
  const [over, setOver] = useState(false)
  // All channel/status/time filtering lives behind a bottom-left "Filters" button —
  // a popover — so the canvas gets the full width. Closed by default.
  const [filtersOpen, setFiltersOpen] = useState(false)
  /**
   * THE ADDRESS BAR SAYS WHAT IS OPEN, so there is something to copy.
   *
   * The URL read `/` whatever you were looking at, which meant a campaign could not be linked to,
   * bookmarked, or handed to anything outside the app — and the way people actually want to tell a
   * model which campaign they mean is to paste its link and say "this one".
   *
   * replaceState, not pushState: opening a campaign is a change of scope inside one screen, not a
   * new page, and stacking history entries would turn Back into an undo for a filter nobody thinks
   * of as navigation. Same reasoning AuthGate gives for its own replaceState.
   *
   * The invite/share tokens are deliberately not preserved here — both are redeemed and stripped on
   * the way in, and re-attaching a spent token to every subsequent URL is how a one-time link ends
   * up pasted somewhere it should never have gone.
   */
  useEffect(() => {
    const open = campaignFilter !== 'all' ? campaignFilter : ''
    const brand = clientFilter !== 'all' ? clientFilter : ''
    const next = open ? new URL(buildCampaignLink(window.location.origin, open, brand)) : null
    const target = next ? `${next.pathname}${next.search}` : window.location.pathname
    if (`${window.location.pathname}${window.location.search}` === target) return
    window.history.replaceState(null, '', target)
  }, [campaignFilter, clientFilter])

  const overview = clientFilter === 'all'
  // Level 1: a brand is open but no campaign is selected — show the campaign-states
  // home (campaigns by lifecycle). Picking a campaign drops to Level 2 (the canvas).
  const level1 = !overview && campaignFilter === 'all'
  // The Connection (canvas) view goes edge-to-edge: the map fills the whole work
  // area and the chrome (top nav, channel sidebar, canvas controls, view pills)
  // floats translucently on top. Scoped by a class so other views stay normal.
  // All campaign sub-views (Connection / Grid / Calendar) share the full-bleed,
  // floating-chrome design — the project-tab drawer + dark top bar sit above all three.
  const canvasMode = page === 'clients' && !overview && !level1
  // The files-browser home carries its own shell (files sidebar + tabs), so the
  // global rail + breadcrumb step aside there — matching how the canvas works.
  const homeFiles = page === 'clients' && overview
  // Library / Channels are top-level, brand-scoped pages. The brand comes from the
  // sidebar selection (a brand filter), falling back to the only brand when there's
  // just one — so a single-brand workspace "just works" without picking.
  const brandFromFilter = homeFilter.startsWith('brand:')
    ? homeFilter.slice(6)
    : clientFilter !== 'all'
      ? clientFilter
      : null
  const scopedBrand = brandFromFilter ?? (brands.length === 1 ? brands[0].name : undefined) ?? undefined

  useEffect(() => {
    void (async () => {
      // If the URL carries an invite token, redeem it FIRST so the shared workspace becomes active
      // before we load data, then strip it from the address bar.
      if (isSupabaseConfigured) {
        const params = new URLSearchParams(window.location.search)
        const invite = params.get('invite')
        if (invite) {
          await claimInvite(invite)
          params.delete('invite')
          const qs = params.toString()
          window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
        }
      }
      /**
       * A LINK THAT OPENS THE CAMPAIGN IT NAMES. Read before the data loads so the scope is already
       * set when it arrives, and cleared from the URL only by the mirror below — which rewrites it
       * from the live scope, so a link that opened something keeps working as a link to it.
       *
       * Tolerated rather than required: a link naming a campaign this workspace does not have leaves
       * the scope alone rather than dropping the person into an empty canvas that looks like loss.
       */
      const link = readCampaignLink(window.location.href)
      if (link) {
        if (link.brand) useTrafficStore.getState().setClientFilter(link.brand)
        useTrafficStore.getState().setCampaignFilter(link.campaign)
        useTrafficStore.getState().openCampaign(link.campaign)
      }
      await refresh()
      try {
        await hydrateRecords()
      } finally {
        // The canvas does not save while this gate is shut, so it must open whatever happened above.
        // hydrateRecords opens it itself on the way out; this covers the path where it throws first
        // and never gets there, which would otherwise turn one failed read into a session that
        // silently stops persisting the board.
        useTrafficStore.getState().markBoardsHydrated()
      }
      // New users land straight in the app now; the first-run onboarding takeover was removed.
      // The SetupFlow is still available to open manually (Getting started / setup wizard).
    })()
  }, [refresh, hydrateRecords])

  // Auto-ingest: the first time a brand with a website is active, pull its real published content
  // into the Library in the background (once per brand). Gives the taxonomy + generation a real
  // corpus to learn from without anyone having to ask. Manual re-sync lives on the Library page.
  useEffect(() => {
    const brand = clientFilter
    if (!brand || brand === 'all') return
    const website = (clientProfiles[brand]?.website || brandRecords.find((b) => b.name === brand)?.website || '').trim()
    if (!website) return
    let guard: Record<string, number> = {}
    try {
      guard = JSON.parse(localStorage.getItem('stoplight.siteIngested.v1') || '{}')
    } catch {
      /* ignore */
    }
    if (guard[brand]) return
    guard[brand] = Date.now()
    try {
      localStorage.setItem('stoplight.siteIngested.v1', JSON.stringify(guard))
    } catch {
      /* ignore */
    }
    void ingestBrandSite(brand)
  }, [clientFilter, clientProfiles, brandRecords, ingestBrandSite])

  // Pull the brand's real channel actuals (GA4 / Search Console via /api/actuals) whenever a brand
  // is active. This is what fills `brandActuals` (Insights + Brand goal) and appends the metrics
  // time-series (metric_snapshots). Self-gates on an in-flight guard, so re-renders don't refetch.
  useEffect(() => {
    if (scopedBrand) void refreshActuals(scopedBrand)
  }, [scopedBrand, refreshActuals])

  // Publish this account's anonymized contributions to the cross-customer pool on load. Internally a
  // no-op unless the account is contributing; keeps the floor-gated pattern pool current over time.
  useEffect(() => {
    void contributeAggregate()
  }, [contributeAggregate])

  // Cmd/Ctrl+K opens Ask Claude from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openAsk()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAsk])

  // Once assets have loaded AND flights have hydrated from the backend, give every campaign a default
  // flight. Waiting on flightsHydrated matters on a fresh device: running before hydration would mint
  // fresh "Flight 1"s and persist them over the workspace's real flights. Self-guarded + idempotent.
  const rowsLoaded = useTrafficStore((s) => s.rows.length > 0)
  const flightsHydrated = useTrafficStore((s) => s.flightsHydrated)
  const ensureFlights = useTrafficStore((s) => s.ensureFlights)
  useEffect(() => {
    if (rowsLoaded && flightsHydrated) void ensureFlights()
  }, [rowsLoaded, flightsHydrated, ensureFlights])

  // Once hydration lands (so we can see whether the workspace actually has data), pick a starting
  // detail level for a user who has never chosen one: Simple for a fresh workspace, Advanced when
  // data already exists. Guarded + idempotent in the store; a no-op for anyone who already has a level.
  const resolveSkillDefault = useTrafficStore((s) => s.resolveSkillDefault)
  useEffect(() => {
    if (flightsHydrated) resolveSkillDefault()
  }, [flightsHydrated, resolveSkillDefault])

  async function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const text =
      e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (e.dataTransfer.files?.length) {
      const assets = await filesToAssets(Array.from(e.dataTransfer.files))
      if (assets.length) addAssets(assets)
    } else if (text && looksLikeUrl(text)) {
      addAssets([urlToAsset(text)])
    }
  }

  if (page === 'account') return <AccountSettings />

  return (
    <div className={`workspace${canvasMode ? ` canvas-mode view-${view}` : ''}`}>
      {/* Global rail only on the brand workspace (Level 1). The home + the
          Library / Connectors / Billing pages carry the files sidebar (HomeShell),
          and the canvas is full-bleed — none of them want the rail. */}
      {page === 'clients' && !overview && !canvasMode && <GlobalNav />}
      {page === 'clients' ? (
        <div className="work-col">
          <ShareBanner />
          {canvasMode && <CanvasProjectTabs />}
          {!homeFiles && <Breadcrumb />}
          <div
            className={`work-body${over ? ' drop-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOver(false)
            }}
            onDrop={onDrop}
          >
            {/* Filtering (channels / status / time / search) lives behind this
                bottom-left button; the panel pops up above it. */}
            {!overview && !level1 && (
              <>
                <button
                  className={`filters-fab${filtersOpen ? ' on' : ''}`}
                  onClick={() => setFiltersOpen((v) => !v)}
                  title="Filters"
                >
                  ☰ Filters
                </button>
                {filtersOpen && (
                  <>
                    <div className="filters-scrim" onClick={() => setFiltersOpen(false)} />
                    <div className="filters-popover">
                      <Sidebar popover onCollapse={() => setFiltersOpen(false)} />
                    </div>
                  </>
                )}
              </>
            )}
            <div className="main">
              {/* The tray and the view pills are hoisted OUT of the branches so they sit outside
                  the boundary below. Same three combinations as before (the tray shows on the
                  overview and on a campaign, the pills only on a campaign), but a screen that has
                  not downloaded yet now blanks on its own instead of taking the controls you just
                  clicked with it.
                  The tray on the overview is deliberate: without it an upload from the home
                  overview gives no visible feedback. */}
              {!level1 && <IngestTray />}
              <ChunkBoundary>
                <Suspense fallback={null}>
                  {overview ? (
                    <ClientsOverview />
                  ) : level1 ? (
                    <BrandWorkspace />
                  ) : view === 'calendar' ? (
                    <CalendarView />
                  ) : view === 'flow' || view === 'canvas' ? (
                    <CanvasView />
                  ) : view === 'insights' ? (
                    <InsightsView />
                  ) : (
                    <SheetGrid />
                  )}
                </Suspense>
              </ChunkBoundary>
              {!overview && !level1 && <ViewToggle />}
            </div>

            {over && <div className="drop-veil">Drop to add assets</div>}
          </div>
        </div>
      ) : (
        // Library / Connectors / Billing share the home's dashboard shell (files
        // sidebar + tab bar) so the layout never changes between them and the hub.
        <HomeShell>
          {/* One boundary for the whole routed region, INSIDE the shell rather than around it.
              Around it, a screen that has not downloaded yet would take the rail and the tab bar
              down with it on the way in, because a boundary that suspends hides everything it
              wraps, not just the part that is waiting. Here the shell stays put and only the
              content area is briefly empty.
              fallback={null} on purpose: a skeleton sized for the wrong screen shifts the layout
              twice, once when it appears and once when the real thing replaces it. */}
          <ChunkBoundary>
            <Suspense fallback={null}>
              {page === 'priorities' ? (
                <div className="home-main-scroll">
                  <PrioritiesView scopeClient={scopedBrand} />
                </div>
              ) : page === 'brand' ? (
                <div className="home-main-scroll">
                  <BrandPage brand={scopedBrand} />
                </div>
              ) : page === 'dataset' ? (
                <div className="home-main-scroll">
                  <DatasetPage />
                </div>
              ) : page === 'object' ? (
                <div className="home-main-scroll">
                  <ObjectPage />
                </div>
              ) : page === 'content' ? (
                <div className="home-main-scroll">
                  <InsightsTabs />
                  <LibraryView scopeClient={scopedBrand} />
                </div>
              ) : page === 'channels' ? (
                <div className="home-main-scroll">
                  <ChannelsView scopeClient={scopedBrand} />
                </div>
              ) : page === 'reports' ? (
                <div className="home-main-scroll">
                  <InsightsTabs />
                  <ReportsView scopeClient={scopedBrand} />
                </div>
              ) : page === 'records' ? (
                <div className="home-main-page">
                  <CompaniesView />
                </div>
              ) : page === 'channelrecords' ? (
                <div className="home-main-page">
                  <ChannelRecordsView />
                </div>
              ) : page === 'people' ? (
                <div className="home-main-page">
                  <PeopleView />
                </div>
              ) : page === 'segments' ? (
                <div className="home-main-page">
                  <SegmentsView />
                </div>
              ) : page === 'proofpoints' ? (
                <div className="home-main-page">
                  <ProofPointsView />
                </div>
              ) : page === 'messages' ? (
                <div className="home-main-page">
                  <MessagesView />
                </div>
              ) : page === 'voices' ? (
                <div className="home-main-page">
                  <VoicesView />
                </div>
              ) : page === 'patterns' ? (
                <div className="home-main-page">
                  <PatternsView />
                </div>
              ) : page === 'objectives' ? (
                <div className="home-main-page">
                  <ObjectivesView />
                </div>
              ) : page === 'triggers' ? (
                <div className="home-main-page">
                  <TriggersView />
                </div>
              ) : page === 'tasks' ? (
                <div className="home-main-scroll">
                  <TasksView />
                </div>
              ) : page === 'brands' ? (
                // This brand's strategy record. BrandsView is single-brand only now — never the
                // cross-brand roster — so this can't expose the whole portfolio.
                <div className="home-main-page">
                  <BrandsView />
                </div>
              ) : page === 'flows' ? (
                <div className="home-main-page">
                  <FlowsView />
                </div>
              ) : page === 'calendar' ? (
                <div className="home-main-scroll">
                  <CampaignCalendar />
                </div>
              ) : (
                <div className="home-main-page">
                  {page === 'portfolio' ? (
                    <Portfolio />
                  ) : page === 'library' ? (
                    <LibraryPage />
                  ) : page === 'billing' ? (
                    <BillingPage />
                  ) : (
                    <ConnectorsPage />
                  )}
                </div>
              )}
            </Suspense>
          </ChunkBoundary>
        </HomeShell>
      )}

      <BreaksQueue />
      <ReadinessPanel />
      <DiagnosisOverlay />
      <AskClaude />
      <ShareDialog />
      <IcpDrawer />
      <PersonalizationDrawer />
      <SavedViewsDrawer />
      <ChannelIngestDrawer />
      <TrackingDrawer />
      <CopyReview />
      <CommentDrawer />
      <CommentInbox />
      <VersionHistory />
      <ClaudeEngine />
      <DrivePicker />
      {wizardOpen && <NewClientWizard client={wizardClient ?? undefined} onClose={closeWizard} />}
      <AudienceWizard />
      {/* Dev only: clears this browser's workspace so a fresh state can be tested. */}
      <DevReset />
      <Toast />
    </div>
  )
}
