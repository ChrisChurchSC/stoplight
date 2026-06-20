import { useRef, useState } from 'react'
import { filesToAssets } from '../lib/files'
import { TIMING_BY_KEY } from '../domain/timing'
import { useTrafficStore } from '../store/useTrafficStore'

export function Breadcrumb() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const query = useTrafficStore((s) => s.query)
  const setQuery = useTrafficStore((s) => s.setQuery)
  const icpOpen = useTrafficStore((s) => s.icpOpen)
  const setIcpOpen = useTrafficStore((s) => s.setIcpOpen)
  const importFromDrive = useTrafficStore((s) => s.importFromDrive)
  const ingestDriveFolderUrl = useTrafficStore((s) => s.ingestDriveFolderUrl)
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const rerunSeasonalCampaign = useTrafficStore((s) => s.rerunSeasonalCampaign)
  const rotateAlwaysOn = useTrafficStore((s) => s.rotateAlwaysOn)

  const activeCampaign =
    campaignFilter !== 'all' ? campaignList.find((c) => c.name === campaignFilter) : undefined
  const timing = activeCampaign?.timing
  const timingDef = timing ? TIMING_BY_KEY[timing] : undefined

  const inputRef = useRef<HTMLInputElement>(null)
  const overview = clientFilter === 'all'
  const [addOpen, setAddOpen] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await filesToAssets(Array.from(files))
    if (assets.length) addAssets(assets)
  }

  function ingestFolder() {
    if (!folderUrl.trim()) return
    void ingestDriveFolderUrl(folderUrl)
    setFolderUrl('')
    setAddOpen(false)
  }

  return (
    <div className="breadcrumb">
      <div className="bc-left">
        {overview ? (
          <span className="crumb active">All clients</span>
        ) : (
          <button className="crumb crumb-link" onClick={() => setClientFilter('all')}>
            All clients
          </button>
        )}
        {!overview && (
          <>
            <span className="crumb-sep">/</span>
            <span className="crumb active">{clientFilter}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb">{campaignFilter === 'all' ? 'All campaigns' : campaignFilter}</span>
            {timingDef && (
              <span className={`crumb-timing t-${timingDef.key}`} title={timingDef.scheduling}>
                {timingDef.icon} {timingDef.label}
                {timing === 'seasonal' && activeCampaign?.seasonalWindow ? ` · ${activeCampaign.seasonalWindow}` : ''}
                {timing === 'seasonal' && (activeCampaign?.seasonalCycle ?? 1) > 1 ? ` · Cycle ${activeCampaign?.seasonalCycle}` : ''}
                {timing === 'always-on' && activeCampaign?.refreshWeeks ? ` · every ${activeCampaign.refreshWeeks}w` : ''}
              </span>
            )}
          </>
        )}
      </div>

      {!overview && (
        <div className="bc-center">
          <div className="toolbar-search">
            <span className="search-ico">⌕</span>
            <input
              value={query}
              placeholder="Search assets…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="bc-right">
        {timing === 'seasonal' && (
          <button
            className="btn sm"
            onClick={() => rerunSeasonalCampaign(campaignFilter)}
            title="Clone this campaign's assets + structure into a new editable cycle"
          >
            ↻ Re-run next cycle
          </button>
        )}
        {timing === 'always-on' && (
          <button
            className="btn sm"
            onClick={() => rotateAlwaysOn(campaignFilter)}
            title="Rotate creative now — reschedule forward and reset to draft for review"
          >
            ∞ Rotate creative
          </button>
        )}
        {!overview && (
          <button
            className={`btn sm${view === 'insights' ? ' primary' : ''}`}
            onClick={() => setView(view === 'insights' ? 'grid' : 'insights')}
            title="Insights"
          >
            ◧ Insights
          </button>
        )}
        {!overview && (
          <button
            className={`btn sm${icpOpen ? ' primary' : ''}`}
            onClick={() => setIcpOpen(!icpOpen)}
            title="ICP & proof"
          >
            ◎ ICP
          </button>
        )}
        <div className="bc-add">
          <button className="btn sm primary" onClick={() => setAddOpen((o) => !o)}>
            + Add assets
          </button>
          {addOpen && (
            <>
              <div className="bc-add-scrim" onClick={() => setAddOpen(false)} />
              <div className="bc-add-pop">
                <div className="bc-add-label">Ingest a Google Drive folder</div>
                <div className="bc-add-row">
                  <input
                    value={folderUrl}
                    placeholder="Paste a folder link…"
                    onChange={(e) => setFolderUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && ingestFolder()}
                    autoFocus
                  />
                  <button className="btn sm primary" disabled={!folderUrl.trim()} onClick={ingestFolder}>
                    Ingest
                  </button>
                </div>
                <div className="bc-add-or">or</div>
                <button
                  className="bc-add-opt"
                  onClick={() => {
                    setAddOpen(false)
                    importFromDrive()
                  }}
                >
                  ⇄ Browse Drive (pick files)
                </button>
                <button
                  className="bc-add-opt"
                  onClick={() => {
                    setAddOpen(false)
                    inputRef.current?.click()
                  }}
                >
                  ⬆ Upload from this computer
                </button>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}
