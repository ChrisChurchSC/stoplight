import { CHANNELS } from '../domain/channels'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

function timeAgo(ts: number, now: number): string {
  const h = Math.round((now - ts) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function CommentDrawer() {
  const commentRowId = useTrafficStore((s) => s.commentRowId)
  const rows = useTrafficStore((s) => s.rows)
  const commentMap = useTrafficStore((s) => s.comments)
  const openComments = useTrafficStore((s) => s.openComments)
  const syncComments = useTrafficStore((s) => s.syncComments)
  const routeCommenterToAttio = useTrafficStore((s) => s.routeCommenterToAttio)

  const row = rows.find((r) => r.id === commentRowId)
  if (!row) return null

  const comments = commentMap[row.id] ?? []
  const needsReply = comments.filter((c) => c.needsResponse).length
  const now = Date.now()

  return (
    <>
      <div className="drawer-scrim" onClick={() => openComments(null)} />
      <aside className="drawer">
        <div className="drawer-head">
          <strong>Comments</strong>
          {needsReply > 0 && <span className="drawer-flagcount">{needsReply} need reply</span>}
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => openComments(null)}>
            ✕
          </button>
        </div>

        <div className="drawer-asset">
          <div>
            <div className="drawer-name">{row.assetName}</div>
            <div className="drawer-sub">
              <ChannelIcon channel={row.channel} size={13} />
              {CHANNELS[row.channel].label} · {comments.length} comment{comments.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="drawer-body">
          {comments.length === 0 ? (
            <div className="copy-hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              No comments pulled yet.
              <div style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={syncComments}>
                  ↻ Sync comments
                </button>
              </div>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="comment">
                <div className="comment-head">
                  <span className="comment-author">{c.author}</span>
                  <span className={`sentiment s-${c.sentiment}`}>{c.sentiment}</span>
                  {c.needsResponse && <span className="needs-reply">needs reply</span>}
                  <span className="comment-time">{timeAgo(c.ts, now)}</span>
                </div>
                <div className="comment-text">{c.text}</div>
                <div className="comment-foot">
                  <span className="comment-eng">♥ {c.likes} · {c.replies} replies</span>
                  {c.intent &&
                    (c.routed ? (
                      <span className="routed">✓ in Attio</span>
                    ) : (
                      <button
                        className="btn green sm"
                        onClick={() => routeCommenterToAttio(row.id, c.id)}
                        title="Route this intent-y commenter to Attio as a contact"
                      >
                        → Attio
                      </button>
                    ))}
                </div>
              </div>
            ))
          )}
          <div className="drawer-foot-spacer" />
        </div>
      </aside>
    </>
  )
}
