import { useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { filesToAssets, looksLikeUrl, urlToAsset } from '../lib/files'
import { useTrafficStore } from '../store/useTrafficStore'
import { Sidebar } from './Sidebar'
import { Toolbar } from './Toolbar'
import { IngestTray } from './IngestTray'
import { IcpGate } from './IcpGate'
import { SheetGrid } from './SheetGrid'
import { CopyReview } from './CopyReview'
import { CommentDrawer } from './CommentDrawer'

export function Workbench() {
  const refresh = useTrafficStore((s) => s.refresh)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const [over, setOver] = useState(false)

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
      <Sidebar />
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
        <div className="breadcrumb">
          <span className="crumb">Sheets</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">Trafficking</span>
          <span className="crumb-sep">/</span>
          <span className="crumb active">Untitled sheet</span>
        </div>

        <Toolbar />
        <IngestTray />
        <IcpGate />
        <SheetGrid />
        <CopyReview />
        <CommentDrawer />

        {over && <div className="drop-veil">Drop to add assets</div>}
      </div>
    </div>
  )
}
