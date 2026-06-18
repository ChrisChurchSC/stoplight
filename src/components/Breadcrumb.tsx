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

  const inputRef = useRef<HTMLInputElement>(null)
  const overview = clientFilter === 'all'

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await filesToAssets(Array.from(files))
    if (assets.length) addAssets(assets)
  }

  return (
    <div className="breadcrumb">
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

          <button
            className={`btn sm${icpOpen ? ' primary' : ''}`}
            onClick={() => setIcpOpen(!icpOpen)}
            title="ICP & proof"
          >
            ◎ ICP
          </button>
        </>
      )}

      <span className="spacer" />

      {!overview && (
        <div className="toolbar-search">
          <span className="search-ico">⌕</span>
          <input
            value={query}
            placeholder="Search assets…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

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
  )
}
