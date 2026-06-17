import { useRef } from 'react'
import { filesToAssets } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'

export function Toolbar() {
  const query = useTrafficStore((s) => s.query)
  const setQuery = useTrafficStore((s) => s.setQuery)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const view = useTrafficStore((s) => s.view)
  const setView = useTrafficStore((s) => s.setView)

  const inputRef = useRef<HTMLInputElement>(null)

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await filesToAssets(Array.from(files))
    if (assets.length) addAssets(assets)
  }

  return (
    <div className="toolbar">
      <button
        className={`btn sm${view === 'icp' ? ' primary' : ''}`}
        onClick={() => setView(view === 'icp' ? 'grid' : 'icp')}
        title="ICP & proof"
      >
        ◎ ICP
      </button>

      <button className="btn sm" onClick={() => inputRef.current?.click()}>
        + Add assets
      </button>
      <button className="btn ghost sm" onClick={loadSample} title="Replace the sheet with sample data">
        Load sample
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

      <span className="spacer" />

      <div className="toolbar-search">
        <span className="search-ico">⌕</span>
        <input
          value={query}
          placeholder="Search assets…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <button
        className={`btn sm${view === 'assets' ? ' primary' : ''}`}
        onClick={() => setView(view === 'assets' ? 'grid' : 'assets')}
        title="Assets — staged intake"
      >
        ⬡ Assets
      </button>
    </div>
  )
}
