import { useRef } from 'react'
import { filesToAssets } from '../lib/files'
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
  const setDrivePickerOpen = useTrafficStore((s) => s.setDrivePickerOpen)
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)

  const inputRef = useRef<HTMLInputElement>(null)
  const overview = clientFilter === 'all'

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await filesToAssets(Array.from(files))
    if (assets.length) addAssets(assets)
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
        <button className="btn sm" onClick={() => setDrivePickerOpen(true)} title="Import from Drive">
          ⬇ Drive
        </button>
        <button className="btn sm primary" onClick={() => inputRef.current?.click()}>
          + Add assets
        </button>
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
  )
}
