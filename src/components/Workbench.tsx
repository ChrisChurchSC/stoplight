import { useEffect, useState } from 'react'
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
import { BrandWorkspace } from './BrandWorkspace'
import { ClientsOverview } from './ClientsOverview'
import { IngestTray } from './IngestTray'
import { SheetGrid } from './SheetGrid'
import { CalendarView } from './CalendarView'
import { CanvasView } from './CanvasView'
import { CanvasProjectTabs } from './CanvasProjectTabs'
import { InsightsView } from './InsightsView'
import { ViewToggle } from './ViewToggle'
import { ConnectorsPage } from './ConnectorsPage'
import { LibraryPage } from './LibraryPage'
import { LibraryView } from './LibraryView'
import { PrioritiesView } from './PrioritiesView'
import { ChannelsView } from './ChannelsView'
import { ChannelRecordsView } from './ChannelRecordsView'
import { ReportsView } from './ReportsView'
import { InsightsTabs } from './InsightsTabs'
import { CompaniesView } from './CompaniesView'
import { PeopleView } from './PeopleView'
import { SegmentsView } from './SegmentsView'
import { ProofPointsView } from './ProofPointsView'
import { MessagesView } from './MessagesView'
import { VoicesView } from './VoicesView'
import { PatternsView } from './PatternsView'
import { TriggersView } from './TriggersView'
import { ObjectivesView } from './ObjectivesView'
import { TasksView } from './TasksView'
import { BrandsView } from './BrandsView'
import { FlowsView } from './FlowsView'
import { CampaignCalendar } from './CampaignCalendar'
import { BrandPage } from './BrandPage'
import { BillingPage } from './BillingPage'
import { Portfolio } from './Portfolio'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { IcpDrawer } from './IcpDrawer'
import { PersonalizationDrawer } from './PersonalizationDrawer'
import { SavedViewsDrawer } from './SavedViewsDrawer'
import { TrackingDrawer } from './TrackingDrawer'
import { CopyReview } from './CopyReview'
import { CommentDrawer } from './CommentDrawer'
import { DrivePicker } from './DrivePicker'
import { NewClientWizard } from './NewClientWizard'
import { OnboardingFork } from './OnboardingFork'
import { ClaudeHandoff } from './ClaudeHandoff'
import { SetupWizard } from './SetupWizard'
import { Onboarding } from './Onboarding'
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
import { GettingStarted } from './GettingStarted'
import { Toast } from './Toast'

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
      await refresh()
      await hydrateRecords()
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

  // One-time flights migration: once assets have loaded, give every campaign a default flight and
  // stamp its assets. Self-guarded, so this is a no-op after the first run.
  const rowsLoaded = useTrafficStore((s) => s.rows.length > 0)
  const ensureFlights = useTrafficStore((s) => s.ensureFlights)
  useEffect(() => {
    if (rowsLoaded) void ensureFlights()
  }, [rowsLoaded, ensureFlights])

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
              {overview ? (
                <>
                  {/* Show freshly-ingested assets here too — otherwise an upload
                      from the home overview gives no visible feedback. */}
                  <IngestTray />
                  <ClientsOverview />
                </>
              ) : level1 ? (
                <BrandWorkspace />
              ) : (
                <>
                  <IngestTray />
                  {view === 'calendar' ? (
                    <CalendarView />
                  ) : view === 'flow' || view === 'canvas' ? (
                    <CanvasView />
                  ) : view === 'insights' ? (
                    <InsightsView />
                  ) : (
                    <SheetGrid />
                  )}
                  <ViewToggle />
                </>
              )}
            </div>

            {over && <div className="drop-veil">Drop to add assets</div>}
          </div>
        </div>
      ) : (
        // Library / Connectors / Billing share the home's dashboard shell (files
        // sidebar + tab bar) so the layout never changes between them and the hub.
        <HomeShell>
          {page === 'priorities' ? (
            <div className="home-main-scroll">
              <PrioritiesView scopeClient={scopedBrand} />
            </div>
          ) : page === 'brand' ? (
            <div className="home-main-scroll">
              <BrandPage brand={scopedBrand} />
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
      <OnboardingFork />
      <ClaudeHandoff />
      <SetupWizard />
      <Onboarding />
      <AudienceWizard />
      <GettingStarted />
      <Toast />
    </div>
  )
}
