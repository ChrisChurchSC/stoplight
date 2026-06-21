import { useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { can } from '../domain/access'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'

function timeAgo(ts: number, now: number): string {
  const h = Math.round((now - ts) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

type SortKey = 'recent' | 'top'
type FilterKey = 'all' | 'reply' | 'intent'

/**
 * Campaign-level comment inbox. Ingests comments across every posted asset in
 * scope into one feed, attributed by platform, sortable by recent or top, and
 * filterable to the two that matter: comments that need a reply, and intent
 * comments worth routing. An intent comment goes Clay (enrich) then Attio (store).
 */
export function CommentInbox() {
  const open = useTrafficStore((s) => s.commentInboxOpen)
  const close = useTrafficStore((s) => s.closeCommentInbox)
  const rows = useTrafficStore((s) => s.rows)
  const commentMap = useTrafficStore((s) => s.comments)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const syncComments = useTrafficStore((s) => s.syncComments)
  const routeToClay = useTrafficStore((s) => s.routeToClay)
  const routeToAttio = useTrafficStore((s) => s.routeCommenterToAttio)
  const role = useTrafficStore((s) => s.role)

  const [sort, setSort] = useState<SortKey>('recent')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [syncing, setSyncing] = useState(false)

  if (!open) return null
  const canRoute = can(role, 'edit')

  const scoped = rows.filter(
    (r) => r.status === 'posted' && rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }),
  )
  const all = scoped.flatMap((r) => (commentMap[r.id] ?? []).map((c) => ({ c, row: r })))
  const totals = {
    total: all.length,
    reply: all.filter((x) => x.c.needsResponse).length,
    intent: all.filter((x) => x.c.intent).length,
  }
  let items = all
  if (filter === 'reply') items = items.filter((x) => x.c.needsResponse)
  if (filter === 'intent') items = items.filter((x) => x.c.intent)
  items = [...items].sort((a, b) => (sort === 'top' ? b.c.likes - a.c.likes : b.c.ts - a.c.ts))
  const now = Date.now()

  const doSync = async () => {
    setSyncing(true)
    await syncComments()
    setSyncing(false)
  }

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer ci-drawer">
        <div className="drawer-head">
          <strong>Comment inbox</strong>
          {totals.reply > 0 && <span className="drawer-flagcount">{totals.reply} need reply</span>}
          <span className="spacer" />
          <button className="btn ghost sm" onClick={close}>
            ✕
          </button>
        </div>

        <div className="ci-toolbar">
          <div className="ci-filters">
            {(['all', 'reply', 'intent'] as const).map((f) => (
              <button key={f} className={`ci-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? `All ${totals.total}` : f === 'reply' ? `Needs reply ${totals.reply}` : `Intent ${totals.intent}`}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <div className="ci-sort">
            <button className={`ci-sort-btn${sort === 'recent' ? ' on' : ''}`} onClick={() => setSort('recent')}>
              Recent
            </button>
            <button className={`ci-sort-btn${sort === 'top' ? ' on' : ''}`} onClick={() => setSort('top')}>
              Top
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {totals.total === 0 ? (
            <div className="copy-hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              No comments ingested yet.
              <div style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={doSync} disabled={syncing}>
                  {syncing ? 'Pulling…' : '↻ Ingest comments'}
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="copy-hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              Nothing matches this filter.
            </div>
          ) : (
            items.map(({ c, row }) => (
              <div key={c.id} className="comment ci-comment">
                <div className="comment-head">
                  <span className={`ci-platform p-${c.platform.toLowerCase()}`}>{c.platform}</span>
                  <span className="comment-author">{c.author}</span>
                  <span className={`sentiment s-${c.sentiment}`}>{c.sentiment}</span>
                  {c.needsResponse && <span className="needs-reply">needs reply</span>}
                  <span className="comment-time">{timeAgo(c.ts, now)}</span>
                </div>
                <div className="comment-text">{c.text}</div>
                <div className="ci-asset">
                  on <strong>{row.assetName}</strong> · {CHANNELS[row.channel].label}
                </div>
                {c.enrichment && (
                  <div className="ci-enrich">
                    ✦ Clay: <strong>{c.enrichment.company}</strong> · {c.enrichment.title} · fit {c.enrichment.fit}
                  </div>
                )}
                <div className="comment-foot">
                  <span className="comment-eng">
                    ♥ {c.likes} · {c.replies} replies
                  </span>
                  {c.intent &&
                    canRoute &&
                    (c.routed ? (
                      <span className="routed">✓ in Attio</span>
                    ) : c.clayRouted ? (
                      <button
                        className="btn green sm"
                        onClick={() => routeToAttio(row.id, c.id)}
                        title="Save the enriched lead to Attio"
                      >
                        → Attio
                      </button>
                    ) : (
                      <button
                        className="btn sm ci-clay"
                        onClick={() => routeToClay(row.id, c.id)}
                        title="Enrich this commenter via Clay"
                      >
                        → Clay
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
