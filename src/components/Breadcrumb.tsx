import { useRef } from 'react'
import { filesToAssets } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'

export function Breadcrumb() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const addAssets = useTrafficStore((s) => s.addAssets)

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
        </>
      )}

      <span className="spacer" />

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
