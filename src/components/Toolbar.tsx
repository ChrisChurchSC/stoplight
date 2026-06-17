import { useRef } from 'react'
import { filesToAssets } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'

export function Toolbar() {
  const rows = useTrafficStore((s) => s.rows)
  const query = useTrafficStore((s) => s.query)
  const setQuery = useTrafficStore((s) => s.setQuery)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const approveAll = useTrafficStore((s) => s.approveAll)
  const loadSample = useTrafficStore((s) => s.loadSample)
  const gateCleared = useTrafficStore((s) => s.gateCleared)

  const inputRef = useRef<HTMLInputElement>(null)
  const draftCount = rows.filter((r) => r.status === 'draft').length
  const posted = rows.filter((r) => r.status === 'posted').length
  const approved = rows.filter((r) => r.status === 'approved' || r.status === 'scheduled').length

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await filesToAssets(Array.from(files))
    if (assets.length) addAssets(assets)
  }

  return (
    <div className="toolbar">
      <button
        className="btn green sm"
        disabled={draftCount === 0 || !gateCleared}
        onClick={approveAll}
        title={
          gateCleared
            ? 'Approve all draft rows'
            : 'Clear the ICP messaging review to unlock scheduling'
        }
      >
        ⟳ Approve {draftCount} draft{draftCount === 1 ? '' : 's'}
        {!gateCleared && ' 🔒'}
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

      <div className="toolbar-stat">▦ {rows.length} rows</div>
      <div className="toolbar-stat">
        <span className="dot" style={{ background: 'var(--blue)' }} /> {approved} approved
      </div>
      <div className="toolbar-stat">
        <span className="dot" style={{ background: 'var(--green)' }} /> {posted} posted
      </div>

      <span className="spacer" />

      <div className="toolbar-search">
        <span className="search-ico">⌕</span>
        <input
          value={query}
          placeholder="Search assets…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
    </div>
  )
}
