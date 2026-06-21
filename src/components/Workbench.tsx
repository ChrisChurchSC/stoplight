import { useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { filesToAssets, looksLikeUrl, urlToAsset } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'
import { GlobalNav } from './GlobalNav'
import { Sidebar } from './Sidebar'
import { Breadcrumb } from './Breadcrumb'
import { CampaignTabs } from './CampaignTabs'
import { ClientsOverview } from './ClientsOverview'
import { IngestTray } from './IngestTray'
import { SheetGrid } from './SheetGrid'
import { CalendarView } from './CalendarView'
import { CanvasView } from './CanvasView'
import { InsightsView } from './InsightsView'
import { ViewToggle } from './ViewToggle'
import { ConnectorsPage } from './ConnectorsPage'
import { BillingPage } from './BillingPage'
import { IcpDrawer } from './IcpDrawer'
import { TrackingDrawer } from './TrackingDrawer'
import { CopyReview } from './CopyReview'
import { CommentDrawer } from './CommentDrawer'
import { DrivePicker } from './DrivePicker'
import { NewClientWizard } from './NewClientWizard'
import { SetupWizard } from './SetupWizard'
import { AudienceWizard } from './AudienceWizard'
import { ConnectionHeader } from './ConnectionHeader'
import { BreaksQueue } from './BreaksQueue'
import { ReadinessPanel } from './ReadinessPanel'
import { DiagnosisOverlay } from './DiagnosisOverlay'
import { AskClaude } from './AskClaude'
import { ShareBanner } from './ShareBanner'
import { ShareDialog } from './ShareDialog'
import { CommentInbox } from './CommentInbox'
import { VersionHistory } from './VersionHistory'

export function Workbench() {
  const refresh = useTrafficStore((s) => s.refresh)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const view = useTrafficStore((s) => s.view)
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const wizardOpen = useTrafficStore((s) => s.wizardOpen)
  const wizardClient = useTrafficStore((s) => s.wizardClient)
  const closeWizard = useTrafficStore((s) => s.closeWizard)
  const openAsk = useTrafficStore((s) => s.openAsk)
  const [over, setOver] = useState(false)
  const overview = clientFilter === 'all'

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
    <div className="workspace">
      <GlobalNav />

      {page === 'clients' ? (
        <div className="work-col">
          <ShareBanner />
          <Breadcrumb />
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
            {!overview && <Sidebar />}
            <div className="main">
              {!overview && <CampaignTabs />}
              {!overview && <ConnectionHeader />}

              {overview ? (
                <>
                  {/* Show freshly-ingested assets here too — otherwise an upload
                      from the home overview gives no visible feedback. */}
                  <IngestTray />
                  <ClientsOverview />
                </>
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
        <div className="main">
          {page === 'billing' ? <BillingPage /> : <ConnectorsPage />}
        </div>
      )}

      <BreaksQueue />
      <ReadinessPanel />
      <DiagnosisOverlay />
      <AskClaude />
      <ShareDialog />
      <IcpDrawer />
      <TrackingDrawer />
      <CopyReview />
      <CommentDrawer />
      <CommentInbox />
      <VersionHistory />
      <DrivePicker />
      {wizardOpen && <NewClientWizard client={wizardClient ?? undefined} onClose={closeWizard} />}
      <SetupWizard />
      <AudienceWizard />
    </div>
  )
}
