import { useRef, useState } from 'react'
import { filesToAssets } from '../lib/files'
import { TIMING_BY_KEY } from '../domain/timing'
import { can } from '../domain/access'
import { applyBreakStatus, detectBreaks } from '../domain/breaks'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

export function Breadcrumb() {
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const addAssets = useTrafficStore((s) => s.addAssets)
  const role = useTrafficStore((s) => s.role)
  const sharedSession = useTrafficStore((s) => s.sharedSession)
  const openShareDialog = useTrafficStore((s) => s.openShareDialog)
  const rows = useTrafficStore((s) => s.rows)
  const comments = useTrafficStore((s) => s.comments)
  const openCommentInbox = useTrafficStore((s) => s.openCommentInbox)
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
  const fireTrigger = useTrafficStore((s) => s.fireTrigger)
  const breakStatus = useTrafficStore((s) => s.breakStatus)

  const activeCampaign =
    campaignFilter !== 'all' ? campaignList.find((c) => c.name === campaignFilter) : undefined
  const timing = activeCampaign?.timing
  const timingDef = timing ? TIMING_BY_KEY[timing] : undefined

  const inputRef = useRef<HTMLInputElement>(null)
  const overview = clientFilter === 'all'
  const [addOpen, setAddOpen] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')

  // Comments that need a reply, across posted assets in scope (drives the badge).
  const scopedPostedIds = new Set(
    rows
      .filter((r) => r.status === 'posted' && rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
      .map((r) => r.id),
  )
  const needsReply = Object.entries(comments)
    .filter(([id]) => scopedPostedIds.has(id))
    .reduce((n, [, cs]) => n + cs.filter((c) => c.needsResponse).length, 0)

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
        ) : sharedSession ? (
          // In a shared session the recipient is locked to this one client.
          <span className="crumb">All clients</span>
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
                {timing === 'triggered' && activeCampaign?.triggerEvent ? ` · ${activeCampaign.triggerEvent}` : ''}
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
        {timing === 'triggered' &&
          (() => {
            // The trigger only fires once the connection check is clean — a fast
            // triggered piece still gets checked before it goes.
            const campRows = rows.filter((r) =>
              rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }),
            )
            const openBreaks = applyBreakStatus(detectBreaks(campRows), breakStatus).filter(
              (b) => b.status === 'open',
            ).length
            const draftN = campRows.filter((r) => r.status === 'draft').length
            const blocked = openBreaks > 0 || draftN === 0
            return (
              <button
                className="btn sm"
                disabled={blocked}
                onClick={() => fireTrigger(campaignFilter)}
                title={
                  openBreaks > 0
                    ? `Resolve ${openBreaks} connection break${openBreaks === 1 ? '' : 's'} before firing`
                    : draftN === 0
                      ? 'No draft assets to ship'
                      : `Fire the trigger — ships ${draftN} checked asset${draftN === 1 ? '' : 's'} on “${activeCampaign?.triggerEvent ?? 'the event'}”`
                }
              >
                ⚡ Fire trigger{openBreaks > 0 ? ' 🔒' : ''}
              </button>
            )
          })()}
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
        {!overview && (
          <button className="btn sm" onClick={openCommentInbox} title="Comments ingested across posted assets">
            💬 Comments
            {needsReply > 0 && <span className="bc-comment-badge">{needsReply}</span>}
          </button>
        )}
        {!overview && can(role, 'share') && (
          <button className="btn sm" onClick={openShareDialog} title="Share this client's workspace">
            ⤴ Share
          </button>
        )}
        {can(role, 'edit') && (
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
        )}
      </div>
    </div>
  )
}
