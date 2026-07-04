import { useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { filesToAssets, looksLikeUrl, urlToAsset } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'
import { GlobalNav } from './GlobalNav'
import { HomeShell } from './HomeShell'
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
import { ChannelsView } from './ChannelsView'
import { MetricsView } from './MetricsView'
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

export function Workbench() {
  const refresh = useTrafficStore((s) => s.refresh)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const view = useTrafficStore((s) => s.view)
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
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
    refresh()
  }, [refresh])

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
          {page === 'brand' ? (
            <div className="home-main-scroll">
              <BrandPage brand={scopedBrand} />
            </div>
          ) : page === 'metrics' ? (
            <div className="home-main-scroll">
              <MetricsView scopeClient={scopedBrand} />
            </div>
          ) : page === 'content' ? (
            <div className="home-main-scroll">
              <LibraryView scopeClient={scopedBrand} />
            </div>
          ) : page === 'channels' ? (
            <div className="home-main-scroll">
              <ChannelsView scopeClient={scopedBrand} />
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
      <AudienceWizard />
    </div>
  )
}
