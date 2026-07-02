import { useEffect, useRef, useState } from 'react'
import { can } from '../domain/access'
import { applyBreakStatus, detectBreaks } from '../domain/breaks'
import { rowsToCsv, downloadCsv } from '../lib/csv'
import { rowInScope } from '../lib/scope'
import { usePresence } from '../lib/usePresence'
import { useTrafficStore } from '../store/useTrafficStore'
import { BrandTabs } from './BrandTabs'
import { CanvasFrameBar } from './CanvasFrameBar'

export function Breadcrumb() {
  // Comments / History / Export CSV collapse into a "⋯ More" dropdown; close on
  // an outside click.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const role = useTrafficStore((s) => s.role)
  const openShareDialog = useTrafficStore((s) => s.openShareDialog)
  const rows = useTrafficStore((s) => s.rows)
  const setPage = useTrafficStore((s) => s.setPage)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const rerunSeasonalCampaign = useTrafficStore((s) => s.rerunSeasonalCampaign)
  const rotateAlwaysOn = useTrafficStore((s) => s.rotateAlwaysOn)
  const fireTrigger = useTrafficStore((s) => s.fireTrigger)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const openHistory = useTrafficStore((s) => s.openHistory)
  const openCommentInbox = useTrafficStore((s) => s.openCommentInbox)
  const comments = useTrafficStore((s) => s.comments)
  const brandNotice = useTrafficStore((s) => s.brandNotice)
  const setBrandNotice = useTrafficStore((s) => s.setBrandNotice)

  // Comments needing a reply across posted assets in scope (drives the badge).
  const scopedPostedIds = new Set(
    rows
      .filter((r) => r.status === 'posted' && rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }))
      .map((r) => r.id),
  )
  const needsReply = Object.entries(comments)
    .filter(([id]) => scopedPostedIds.has(id))
    .reduce((n, [, cs]) => n + cs.filter((c) => c.needsResponse).length, 0)

  // Live presence in the top bar (the "N here" pill sits next to Share). The
  // canvas keeps its own usePresence for cursors; both share one tab identity, so
  // there's no double-counting.
  const { peers } = usePresence({
    client: clientFilter,
    enabled: clientFilter !== 'all',
    bounds: { w: 0, h: 0 },
    nodeIds: [],
    onRemoteMove: () => {},
  })

  const activeCampaign =
    campaignFilter !== 'all' ? campaignList.find((c) => c.name === campaignFilter) : undefined
  const timing = activeCampaign?.timing

  const overview = clientFilter === 'all'
  // The HyperFocus wordmark doubles as Home now that the global rail is gone.
  const goHome = () => {
    setPage('clients')
    setClientFilter('all')
  }


  // The overview bar held only the breadcrumb trail and Add assets, both removed —
  // so there's nothing to show there. Navigation lives in the global rail.
  if (overview) return null

  return (
    <div className="breadcrumb">
      {/* Level 1 — the brand-layer tabs live up here in the top bar. At Level 2
          (inside a campaign) this is an empty spacer that keeps search centered. */}
      <div className="bc-left">
        {campaignFilter === 'all' ? (
          <>
            <button className="bc-logo" onClick={goHome} title="Home — back to all clients">
              HyperFocus
            </button>
            <BrandTabs />
          </>
        ) : (
          // Inside a campaign (the canvas), the frame that governs the whole board —
          // Brand · Subject · Strategy — lives up here in the top bar.
          <CanvasFrameBar />
        )}
      </div>

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
        {peers.length > 0 && (
          <div className="cv-presence" title={`${peers.length} here now`}>
            {peers.slice(0, 4).map((p) => (
              <span key={p.id} className="cv-avatar" style={{ background: p.color }} title={p.name}>
                {p.name.charAt(0)}
              </span>
            ))}
            <span className="cv-presence-n">{peers.length} here</span>
          </div>
        )}
        <div className="bc-more" ref={menuRef}>
          <button className="btn sm" onClick={() => setMenuOpen((v) => !v)} title="More — comments, history, export">
            ⋯ More
            {needsReply > 0 && <span className="bc-comment-badge">{needsReply}</span>}
          </button>
          {menuOpen && (
            <div className="bc-more-menu">
              <button
                className="bc-more-item"
                onClick={() => {
                  openCommentInbox()
                  setMenuOpen(false)
                }}
              >
                <span>💬 Comments</span>
                {needsReply > 0 && <span className="bc-comment-badge">{needsReply}</span>}
              </button>
              <button
                className="bc-more-item"
                onClick={() => {
                  openHistory()
                  setMenuOpen(false)
                }}
              >
                <span>⟲ History</span>
              </button>
              <button
                className="bc-more-item"
                disabled={rows.length === 0}
                onClick={() => {
                  downloadCsv('hyperfocus-sheet.csv', rowsToCsv(rows))
                  setMenuOpen(false)
                }}
              >
                <span>⤓ Export CSV</span>
              </button>
            </div>
          )}
        </div>
        {can(role, 'share') && (
          <button className="btn sm" onClick={openShareDialog} title="Share this client's workspace">
            ⤴ Share
          </button>
        )}
      </div>
      {brandNotice && (
        <div className="bc-brand-notice" role="status">
          <span>{brandNotice}</span>
          <button className="bc-notice-x" onClick={() => setBrandNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
