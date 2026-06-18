import { useEffect, useState } from 'react'
import { driveSource } from '../adapters/drive'
import type { DriveFile } from '../adapters/drive'
import { driveFilesToAssets } from '../lib/driveImport'
import { formatBytes } from '../lib/format'
import { useTrafficStore } from '../store/useTrafficStore'

function fileSub(f: DriveFile): string {
  const bits: string[] = []
  if (f.mimeType === 'application/pdf') bits.push('PDF')
  else if (f.mimeType.startsWith('image/')) bits.push('Image')
  else if (f.mimeType.startsWith('video/')) bits.push('Video')
  else bits.push('Doc')
  if (f.width && f.height) bits.push(`${f.width}×${f.height}`)
  if (f.durationSec) bits.push(`${Math.round(f.durationSec)}s`)
  if (f.size != null) bits.push(formatBytes(f.size))
  return bits.join(' · ')
}

export function DrivePicker() {
  const open = useTrafficStore((s) => s.drivePickerOpen)
  const setOpen = useTrafficStore((s) => s.setDrivePickerOpen)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const page = useTrafficStore((s) => s.page)
  const setPage = useTrafficStore((s) => s.setPage)

  const [files, setFiles] = useState<DriveFile[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    setLoading(true)
    setError(null)
    driveSource
      .list()
      .then((fs) => {
        if (!live) return
        setFiles(fs)
        setSelected(new Set(fs.map((f) => f.id))) // default: everything checked
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load Drive.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [open])

  if (!open) return null

  const groups = new Map<string, DriveFile[]>()
  for (const f of files) {
    if (!groups.has(f.folderPath)) groups.set(f.folderPath, [])
    groups.get(f.folderPath)!.push(f)
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleFolder = (ids: string[]) =>
    setSelected((s) => {
      const next = new Set(s)
      const allOn = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })

  function importSelected() {
    const picked = files.filter((f) => selected.has(f.id))
    if (picked.length) addAssets(driveFilesToAssets(picked))
    setOpen(false)
    if (page !== 'clients') setPage('clients')
  }

  return (
    <>
      <div className="drawer-scrim" onClick={() => setOpen(false)} />
      <div className="drive-modal" role="dialog" aria-label="Import from Drive">
        <div className="drive-head">
          <div>
            <strong>Import from {driveSource.label}</strong>
            {driveSource.isDemo && <span className="drive-demo-badge">Demo</span>}
          </div>
          <button className="btn ghost sm" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        {driveSource.isDemo && (
          <div className="drive-note">
            Sample files so you can see the flow. Set <code>VITE_GOOGLE_CLIENT_ID</code> to connect a
            real Drive. Folders carry the channel; files import + auto-organize on the next screen.
          </div>
        )}

        <div className="drive-body">
          {loading && <div className="drive-empty">Loading…</div>}
          {error && <div className="drive-empty drive-error">{error}</div>}
          {!loading &&
            !error &&
            [...groups.entries()].map(([folder, list]) => {
              const ids = list.map((f) => f.id)
              const allOn = ids.every((id) => selected.has(id))
              return (
                <div className="drive-group" key={folder}>
                  <button className="drive-folder" onClick={() => toggleFolder(ids)}>
                    <span className={`drive-check${allOn ? ' on' : ''}`}>{allOn ? '✓' : ''}</span>
                    <span className="drive-folder-name">{folder}</span>
                    <span className="drive-folder-count">{list.length}</span>
                  </button>
                  {list.map((f) => (
                    <button
                      className={`drive-file${selected.has(f.id) ? ' on' : ''}`}
                      key={f.id}
                      onClick={() => toggle(f.id)}
                    >
                      <span className={`drive-check${selected.has(f.id) ? ' on' : ''}`}>
                        {selected.has(f.id) ? '✓' : ''}
                      </span>
                      <span className="drive-file-name" title={f.name}>
                        {f.name}
                      </span>
                      <span className="drive-file-sub">{fileSub(f)}</span>
                    </button>
                  ))}
                </div>
              )
            })}
        </div>

        <div className="drive-foot">
          <span className="drive-count">{selected.size} selected</span>
          <span className="spacer" />
          <button className="btn primary" disabled={selected.size === 0} onClick={importSelected}>
            Import {selected.size} file{selected.size === 1 ? '' : 's'} ↓
          </button>
        </div>
      </div>
    </>
  )
}
