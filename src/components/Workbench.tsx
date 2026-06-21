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
import { FlowView } from './FlowView'
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

export function Workbench() {
  const refresh = useTrafficStore((s) => s.refresh)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const view = useTrafficStore((s) => s.view)
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const wizardOpen = useTrafficStore((s) => s.wizardOpen)
  const wizardClient = useTrafficStore((s) => s.wizardClient)
  const closeWizard = useTrafficStore((s) => s.closeWizard)
  const [over, setOver] = useState(false)
  const overview = clientFilter === 'all'

  useEffect(() => {
    refresh()
  }, [refresh])

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
                  {view === 'canvas' ? (
                    <CanvasView />
                  ) : view === 'calendar' ? (
                    <CalendarView />
                  ) : view === 'flow' ? (
                    <FlowView />
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
      <IcpDrawer />
      <TrackingDrawer />
      <CopyReview />
      <CommentDrawer />
      <DrivePicker />
      {wizardOpen && <NewClientWizard client={wizardClient ?? undefined} onClose={closeWizard} />}
      <SetupWizard />
      <AudienceWizard />
    </div>
  )
}
