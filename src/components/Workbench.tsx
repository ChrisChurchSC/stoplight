import { useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { filesToAssets, looksLikeUrl, urlToAsset } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'
import { GlobalNav } from './GlobalNav'
import { Sidebar } from './Sidebar'
import { Breadcrumb } from './Breadcrumb'
import { CampaignTabs } from './CampaignTabs'
import { ClientsOverview } from './ClientsOverview'
import { Toolbar } from './Toolbar'
import { SheetGrid } from './SheetGrid'
import { CalendarView } from './CalendarView'
import { FlowView } from './FlowView'
import { InsightsView } from './InsightsView'
import { ViewToggle } from './ViewToggle'
import { AssetsPage } from './AssetsPage'
import { ConnectorsPage } from './ConnectorsPage'
import { BillingPage } from './BillingPage'
import { IcpGate } from './IcpGate'
import { CopyReview } from './CopyReview'
import { CommentDrawer } from './CommentDrawer'

export function Workbench() {
  const refresh = useTrafficStore((s) => s.refresh)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const view = useTrafficStore((s) => s.view)
  const page = useTrafficStore((s) => s.page)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
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
        <>
          {!overview && <Sidebar />}
          <div
            className={`main${over ? ' drop-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOver(false)
            }}
            onDrop={onDrop}
          >
            <Breadcrumb />
            {!overview && <CampaignTabs />}

            {overview ? (
              <ClientsOverview />
            ) : (
              <>
                <Toolbar />
                {view === 'calendar' ? (
                  <CalendarView />
                ) : view === 'flow' ? (
                  <FlowView />
                ) : view === 'insights' ? (
                  <InsightsView />
                ) : view === 'icp' ? (
                  <IcpGate />
                ) : view === 'assets' ? (
                  <AssetsPage />
                ) : (
                  <SheetGrid />
                )}
                <ViewToggle />
              </>
            )}

            {over && <div className="drop-veil">Drop to add assets</div>}
          </div>
        </>
      ) : (
        <div className="main">
          {page === 'billing' ? <BillingPage /> : <ConnectorsPage />}
        </div>
      )}

      <CopyReview />
      <CommentDrawer />
    </div>
  )
}
