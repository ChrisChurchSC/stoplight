import { useLayoutEffect, useRef, useState } from 'react'
import { KIND_ORDER, channelsByKind, resolveChannelId } from '../domain/channels'
import { isValidType, primaryTypeKey, typesFor } from '../domain/channelAssetTypes'
import { STATUS_LABEL, STATUS_ORDER } from '../domain/assetBadge'
import { filledFields, hasCopy, messagingAllText, messagingFields, messagingMap } from '../domain/messaging'
import { isTrackingClean, trackingChecks, utmQuery } from '../domain/tracking'
import { PACE_LABEL, hasBudget, isPaidRow, money, pacing } from '../domain/budget'
import { flagResolved } from '../adapters/icp/mockIcp'
import { mockAttio } from '../adapters/attio/mockAttio'
import { assetRtbIds, rtbById } from '../domain/rtb'
import { can } from '../domain/access'
import { boardFor, deliverableKeyFor } from '../domain/flowBoard'
import type { ChannelId, RowStatus, TrafficRow } from '../domain/types'
import { isoToLocalInput, localInputToIso } from '../lib/format'
import { rowInScope } from '../lib/scope'
import { inTimeRange } from '../domain/timeRange'
import { applyBreakStatus, detectBreaks } from '../domain/breaks'
import { journeyPerformance, formatReach, isBrandCalibrated } from '../domain/journeyPerf'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { CompletenessBar } from './CompletenessBar'
import { Thumb } from './Thumb'
import { proxiedMedia } from '../lib/media'



// Named columns of the spreadsheet, in order, with a type glyph per column.
const COLUMNS = [
  { key: 'asset', label: 'Asset', icon: '▦' },
  { key: 'channel', label: 'Channel', icon: '◉' },
  { key: 'type', label: 'Type', icon: '◆' },
  { key: 'campaign', label: 'Campaign', icon: '◇' },
  { key: 'audience', label: 'Audience', icon: '◎' },
  { key: 'messaging', label: 'Messaging', icon: '¶' },
  { key: 'rtb', label: 'Proof', icon: '◆' },
  { key: 'review', label: 'ICP', icon: '◑' },
  { key: 'scheduled', label: 'Scheduled', icon: '◷' },
  { key: 'status', label: 'Status', icon: '●' },
  { key: 'tracking', label: 'Tracking', icon: '◈' },
  { key: 'budget', label: 'Budget', icon: '◧' },
  { key: 'attribution', label: 'Attribution', icon: '↗' },
  { key: 'performance', label: 'Performance', icon: '📊' },
  { key: 'posted', label: 'Posted', icon: '✓' },
  { key: 'comments', label: 'Platform comments', icon: '💬' },
  { key: 'publish', label: 'Publish', icon: '▷' },
  { key: 'actions', label: '', icon: '' },
  { key: 'delete', label: '', icon: '' },
] as const

// Widths include the leading row-number gutter (index 0), then one per COLUMN.
const DEFAULT_WIDTHS = [40, 220, 140, 160, 150, 150, 320, 300, 116, 184, 138, 200, 200, 150, 150, 120, 150, 100, 84, 64]
const MIN_COL = 60
const MIN_ROWS = 20
const colLetter = (i: number) => String.fromCharCode(65 + i)

/**
 * `postedAt` is stamped only when the app itself publishes a row, so an INGESTED post — already live
 * on the platform, carrying a publishedAt and its real metrics — read as never posted here while the
 * canvas rendered the same asset with a live-metrics footer. Six other modules already read
 * `publishedAt ?? postedAt`; this was the one that did not. One is an ISO string and the other a
 * timestamp, which is why both go through Date.
 */
function postedLabel(row: TrafficRow): string {
  const when = row.publishedAt ?? row.postedAt
  if (!when) return '—'
  return new Date(when).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CovBar({ n, total }: { n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0
  return (
    <div className="cov">
      <div className="cov-bar">
        <div className="cov-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cov-pct">{pct}%</span>
    </div>
  )
}

/**
 * Auto-growing text cell: wraps content and expands the row to fit.
 *
 * `commitOnBlur` holds the keystrokes locally and writes once you leave. It exists because a cell
 * whose value is also part of the grid's FILTER cannot write per keystroke: the row leaves the view
 * on the first character and the textarea unmounts under the cursor. `readOnly` is for the same
 * field when the answer is fixed by where you are standing.
 */
function GrowCell({
  value,
  placeholder,
  onChange,
  dep,
  commitOnBlur,
  readOnly,
  title,
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  dep: number
  commitOnBlur?: boolean
  readOnly?: boolean
  title?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [shown, dep])
  return (
    <textarea
      ref={ref}
      className="cell-input grow"
      rows={1}
      value={shown}
      placeholder={placeholder}
      readOnly={readOnly}
      title={title}
      onChange={(e) => (commitOnBlur ? setDraft(e.target.value) : onChange(e.target.value))}
      onBlur={(e) => {
        if (!commitOnBlur) return
        setDraft(null)
        if (e.target.value !== value) onChange(e.target.value)
      }}
    />
  )
}

export function SheetGrid({ liveScope = false, scopeClient, scopeCampaign }: { liveScope?: boolean; scopeClient?: string; scopeCampaign?: string } = {}) {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const proofFilter = useTrafficStore((s) => s.proofFilter)
  const ctaFilter = useTrafficStore((s) => s.ctaFilter)
  const audienceFilter = useTrafficStore((s) => s.audienceFilter)
  const cardFilter = useTrafficStore((s) => s.cardFilter)
  const query = useTrafficStore((s) => s.query)
  const clientFilterStore = useTrafficStore((s) => s.clientFilter)
  const campaignFilterStore = useTrafficStore((s) => s.campaignFilter)
  // `scopeClient` (from the brand folder's combined Grid) pins the view to one
  // brand across ALL its campaigns, overriding the global client/campaign filters.
  const clientFilter = scopeClient ?? clientFilterStore
  // scopeCampaign pins the view to a single campaign (the Flows grid); scopeClient alone
  // pins to a brand across all its campaigns; otherwise follow the global filters.
  const campaignFilter = scopeCampaign ?? (scopeClient ? 'all' : campaignFilterStore)
  const timeRange = useTrafficStore((s) => s.timeRange)
  const rangeNow = Date.now()
  const updateRow = useTrafficStore((s) => s.updateRow)
  const removeRow = useTrafficStore((s) => s.removeRow)
  const duplicateRow = useTrafficStore((s) => s.duplicateRow)
  const publishRow = useTrafficStore((s) => s.publishRow)
  const openReview = useTrafficStore((s) => s.openReview)
  const fillRowMedia = useTrafficStore((s) => s.fillRowMedia)
  const openComments = useTrafficStore((s) => s.openComments)
  const commentMap = useTrafficStore((s) => s.comments)
  const generateTrackingForRow = useTrafficStore((s) => s.generateTrackingForRow)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  // Batch (column-header) actions.
  const approveAll = useTrafficStore((s) => s.approveAll)
  const role = useTrafficStore((s) => s.role)
  const canPublish = can(role, 'publish')
  const gateCleared = useTrafficStore((s) => s.gateCleared)
  const trackingCleared = useTrafficStore((s) => s.trackingCleared)
  const budgetCleared = useTrafficStore((s) => s.budgetCleared)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const openBreaksQueue = useTrafficStore((s) => s.openBreaks)
  const generateTracking = useTrafficStore((s) => s.generateTracking)
  const acceptTracking = useTrafficStore((s) => s.acceptTracking)
  const acceptBudget = useTrafficStore((s) => s.acceptBudget)
  const syncSpend = useTrafficStore((s) => s.syncSpend)
  const syncComments = useTrafficStore((s) => s.syncComments)
  const draftCopy = useTrafficStore((s) => s.draftCopy)
  const drafting = useTrafficStore((s) => s.drafting)

  const pains = icp?.pains ?? []
  const unresolvedFlags = (row: TrafficRow) =>
    batchReview
      ? batchReview.flags.filter((fl) => fl.rowId === row.id && !flagResolved(fl, row, pains)).length
      : 0

  // Per-row ICP verdict shown in the grid (the review, row by row).
  type RowVerdict = 'none' | 'on' | 'drift' | 'off'
  const rowVerdict = (row: TrafficRow): RowVerdict => {
    if (!batchReview) return 'none'
    if (row.status === 'posted' || row.status === 'failed') return 'none'
    const flags = batchReview.flags.filter(
      (fl) => fl.rowId === row.id && !flagResolved(fl, row, pains),
    )
    if (flags.length === 0) return 'on'
    return flags.some((fl) => fl.verdict === 'off-icp') ? 'off' : 'drift'
  }

  // Heuristic ICP-fit grade for content that's already live (the batch review
  // only scores unshipped rows). Graded on whether the piece is targeted to a
  // defined audience, substantiated by proof, and resonant with that audience's
  // needs. A "Recheck with Claude" deepens it.
  const audMap = new Map((clientAudiences[clientFilter] ?? []).map((a) => [a.name, a] as const))
  const icpGrade = (row: TrafficRow): { letter: 'A' | 'B' | 'C' | 'D'; reasons: string } => {
    const aud = audMap.get((row.audience ?? '').trim())
    const targeted = !!aud
    const proof = assetRtbIds(row).length > 0
    const text = messagingAllText(row).toLowerCase()
    const terms = aud ? [...aud.pains, aud.messageAngle].filter(Boolean) : []
    const resonant = terms.some((t) =>
      String(t)
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .slice(0, 4)
        .some((w) => text.includes(w)),
    )
    const score = (targeted ? 1 : 0) + (proof ? 1 : 0) + (resonant ? 1 : 0)
    const letter = score >= 3 ? 'A' : score === 2 ? 'B' : score === 1 ? 'C' : 'D'
    const reasons = `${targeted ? 'targeted' : 'no audience'} · ${proof ? 'has proof' : 'no proof'} · ${resonant ? 'resonant' : 'generic'}`
    return { letter, reasons }
  }

  const [widths, setWidths] = useState<number[]>(DEFAULT_WIDTHS)
  const total = widths.reduce((a, b) => a + b, 0)

  function startResize(idx: number, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths[idx]
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_COL, startW + (ev.clientX - startX))
      setWidths((prev) => {
        const next = [...prev]
        next[idx] = w
        return next
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // The brand-folder combined view ("see everything in this folder") is a fresh,
  // unfiltered look at the whole brand. It must NOT inherit the per-canvas sidebar
  // filters or the forward time horizon — a stale channel / audience / card filter
  // or a narrowed time range from a previous canvas session would otherwise hide
  // the folder's assets, which reads as "my canvases aren't showing up".
  const scoped = !!scopeClient
  const view = rows.filter(
    (r) =>
      rowInScope(r, {
        filter: scoped ? 'all' : filter,
        proofFilter: scoped ? 'all' : proofFilter,
        ctaFilter: scoped ? 'all' : ctaFilter,
        audienceFilter: scoped ? 'all' : audienceFilter,
        cardFilter: scoped ? 'all' : cardFilter,
        query: scoped ? '' : query,
        clientFilter,
        campaignFilter,
        liveOnly: liveScope,
      }) &&
      (scoped || inTimeRange(r, timeRange, rangeNow)),
  )

  const totalRows = view.length
  const typeSet = view.filter((r) => isValidType(r.channel, r.assetType)).length
  // Through hasCopy, the same question the Messaging cell asks. These disagreed: this counted a
  // row filled on any stored key while the cell showed "Add messaging…" for the same row.
  const messagingFilled = view.filter((r) => hasCopy(r)).length
  const rtbSetN = view.filter((r) => assetRtbIds(r).length > 0).length
  const reviewableN = view.filter((r) => r.status !== 'posted' && r.status !== 'failed').length
  const onMessageN = view.filter((r) => rowVerdict(r) === 'on').length
  const campaignFilled = view.filter((r) => (r.campaign ?? '').trim()).length
  const audienceFilled = view.filter((r) => (r.audience ?? '').trim()).length
  const postedN = view.filter((r) => r.status === 'posted').length
  const trackingCleanN = view.filter((r) => r.utm && isTrackingClean(r)).length
  const paidN = view.filter(isPaidRow).length
  const budgetSetN = view.filter((r) => isPaidRow(r) && hasBudget(r)).length
  const commentedN = view.filter((r) => (commentMap[r.id]?.length ?? 0) > 0).length
  const approvedN = view.filter((r) => r.status === 'approved' || r.status === 'scheduled').length
  const wonScoped = [...new Set(view.map((r) => r.assetName))].reduce(
    (a, name) => a + mockAttio.attributionForAsset(name).wonRevenue,
    0,
  )
  const now = Date.now()

  // ---- Batch-action states for the column headers ----
  const reviewable = view.filter((r) => r.status !== 'posted' && r.status !== 'failed')
  const draftN = view.filter((r) => r.status === 'draft').length
  // Connection gate: the thread must be intact (no open breaks in scope) before
  // anything ships. "Review connections" actually gates "Publish."
  const scopedForBreaks = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }),
  )
  const openBreakN = applyBreakStatus(detectBreaks(scopedForBreaks), breakStatus).filter(
    (b) => b.status === 'open',
  ).length
  // Journey performance (reach + per-fork flow) on the campaign — the same numbers
  // the canvas shows, surfaced per row here so performance reads the same everywhere.
  const journeyPerf = journeyPerformance(scopedForBreaks)
  const connectionCleared = openBreakN === 0
  /**
   * WHAT THE HEADER BUTTONS ACT ON, so they act on what they counted.
   *
   * Only when the grid is pinned to a campaign or a brand — the case where the counts above are a
   * subset and the actions were not. At the unpinned workbench the grid already IS the workspace, so
   * it passes nothing and the actions keep the reach they were written with.
   */
  const scopeIds = scopeCampaign || scopeClient ? view.map((r) => r.id) : undefined
  /** Whether the reach figures are modelled rather than measured, for this brand. */
  const reachIsProjected = !isBrandCalibrated(clientFilter === 'all' ? undefined : clientFilter)
  /**
   * CHANNELS CUT OFF FROM THE BRIEF, as row ids.
   *
   * The connection gate above reads detectBreaks, which is handed rows and only rows: it has never
   * seen the board, the wires, or which channels have been severed from the campaign. So cutting a
   * channel on the canvas and switching to this tab produced "✓ Connected" — the grid asserting the
   * exact word the canvas had just taken away, with nothing anywhere to say that six rows had
   * stopped reading the brief.
   *
   * Being cut off is not a break and must not gate publish: it is a decision somebody made, and the
   * assets still ship. It just has to be SAID, because it changes what gets written (see
   * FlowBoard.detached: a cut channel's assets take neither the campaign's records nor its
   * instructions). Only meaningful when the grid is scoped to one campaign, which is the only time
   * there is a single board to read.
   */
  const flowBoards = useTrafficStore((s) => s.flowBoards)
  const detachedRowIds = (() => {
    if (!scopeCampaign) return new Set<string>()
    const cut = boardFor(flowBoards, scopeCampaign).detached ?? []
    if (!cut.length) return new Set<string>()
    return new Set(view.filter((r) => cut.includes(deliverableKeyFor(r))).map((r) => r.id))
  })()
  const allGatesCleared = gateCleared && trackingCleared && budgetCleared && connectionCleared
  const missingUtmN = reviewable.filter((r) => !r.utm).length
  const dirtyTrackingN = reviewable.filter((r) => r.utm && !isTrackingClean(r)).length
  const paidReviewable = reviewable.filter(isPaidRow)
  const missingBudgetN = paidReviewable.filter((r) => !hasBudget(r)).length
  const paidWithBudget = paidReviewable.some((r) => hasBudget(r))
  const emptyMsgN = reviewable.filter((r) => !hasCopy(r)).length
  const hasPosted = view.some((r) => r.status === 'posted')
  const needsReplyN = view
    .flatMap((r) => commentMap[r.id] ?? [])
    .filter((c) => c.needsResponse).length

  const pad = Math.max(0, MIN_ROWS - view.length)

  function onStatusChange(row: TrafficRow, status: RowStatus) {
    updateRow(row.id, {
      status,
      approvedAt: status === 'approved' ? row.approvedAt ?? Date.now() : row.approvedAt,
      postedAt: status === 'posted' ? row.postedAt ?? Date.now() : row.postedAt,
    })
  }

  return (
    <div className="sheet-grid">
      <CompletenessBar />
      <div className="sheet-wrap">
        {rows.length === 0 && (
          <div className="sheet-hint">
            <div>
              Add an asset to start the sheet.
            </div>
            <button
              className="btn sm"
              style={{ marginTop: 12, pointerEvents: 'auto' }}
              onClick={loadSampleHint}
            >
              Load sample data
            </button>
          </div>
        )}
        <table className="sheet" style={{ tableLayout: 'fixed', width: total, minWidth: total }}>
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr className="letters">
              <th className="corner" />
              {COLUMNS.map((_, i) => (
                <th key={i}>{colLetter(i)}</th>
              ))}
            </tr>
            <tr className="names">
              <th className="corner">#</th>
              {COLUMNS.map((c, i) => (
                <th key={c.key}>
                  {c.icon && <span className="col-ico">{c.icon}</span>}
                  {c.label}
                  <span className="col-resizer" onMouseDown={(e) => startResize(i + 1, e)} />
                </th>
              ))}
            </tr>
            <tr className="col-actions">
              <th className="corner" />
              <th />
              <th />
              <th />
              <th />
              <th />
              <th>
                {drafting ? (
                  <span className="cov-ok">✦ Drafting…</span>
                ) : emptyMsgN > 0 ? (
                  <button
                    className="cov-btn"
                    onClick={() => draftCopy()}
                    title="Draft starter copy + proof for every empty asset, from the ICP"
                  >
                    ✦ Draft ({emptyMsgN})
                  </button>
                ) : null}
              </th>
              <th />
              <th />
              <th className="gate-conn">
                {/* Two independent facts, so both are said. A break is a thread that does not hold
                    together and it gates publish; being cut off is a decision somebody made and it
                    does not. Showing one INSTEAD of the other hid the cut whenever anything else was
                    also wrong, which is exactly when you would want to know. */}
                {reviewable.length === 0 ? null : (
                  <>
                    {connectionCleared ? (
                      detachedRowIds.size ? null : <span className="cov-ok">✓ Connected</span>
                    ) : (
                      <button
                        className="cov-btn warn"
                        onClick={() => openBreaksQueue()}
                        title="Resolve the thread before you ship: the connection check gates publish"
                      >
                        ⚠ {openBreakN} break{openBreakN === 1 ? '' : 's'}
                      </button>
                    )}
                    {detachedRowIds.size > 0 && (
                      <span
                        className="cov-cut"
                        title={`${detachedRowIds.size} asset${detachedRowIds.size === 1 ? '' : 's'} sit under a channel cut off from the campaign brief, so ${detachedRowIds.size === 1 ? 'it takes' : 'they take'} none of the campaign's cards or instructions. Reconnect the channel on the Flow tab.`}
                      >
                        {detachedRowIds.size} cut off
                      </span>
                    )}
                  </>
                )}
              </th>
              <th>
                {draftN > 0 ? (
                  <button
                    className="cov-btn green"
                    disabled={!allGatesCleared || !canPublish}
                    onClick={() => void approveAll(scopeIds)}
                    title={
                      !canPublish
                        ? 'Publishing is owner / editor only'
                        : allGatesCleared
                          ? 'Approve all draft rows'
                          : !connectionCleared
                            ? `Resolve ${openBreakN} connection break${openBreakN === 1 ? '' : 's'} to unlock`
                            : 'Clear ICP, tracking, and budget gates to unlock'
                    }
                  >
                    Approve {draftN}
                    {!canPublish ? ' 🔒' : !allGatesCleared && ' 🔒'}
                  </button>
                ) : null}
              </th>
              <th>
                {trackingCleared ? (
                  <span className="cov-ok">✓ Tracked</span>
                ) : missingUtmN > 0 ? (
                  <button className="cov-btn" onClick={() => void generateTracking(scopeIds)} title="Build UTMs for every row in view">
                    Generate ({missingUtmN})
                  </button>
                ) : dirtyTrackingN === 0 && reviewable.length > 0 ? (
                  <button className="cov-btn green" onClick={() => acceptTracking(scopeIds)}>
                    Accept
                  </button>
                ) : null}
              </th>
              <th>
                {paidReviewable.length === 0 ? null : budgetCleared ? (
                  <span className="cov-ok">✓ Set</span>
                ) : missingBudgetN === 0 ? (
                  <button className="cov-btn green" onClick={() => acceptBudget(scopeIds)}>
                    Accept
                  </button>
                ) : paidWithBudget ? (
                  <button className="cov-btn" onClick={() => void syncSpend(scopeIds)} title="Pull actual spend">
                    ↻ Spend
                  </button>
                ) : null}
              </th>
              <th />
              <th />
              <th />
              <th>
                {hasPosted ? (
                  <button className="cov-btn" onClick={() => void syncComments(scopeIds)} title="Pull comments from the posted assets in view">
                    ↻ Sync{needsReplyN > 0 ? ` (${needsReplyN})` : ''}
                  </button>
                ) : null}
              </th>
              <th />
              <th />
              <th />
            </tr>
            <tr className="coverage">
              <th className="corner">%</th>
              <th><span className="cov-stat">{totalRows} row{totalRows === 1 ? '' : 's'}</span></th>
              <th><span className="cov-check">✓</span></th>
              <th><CovBar n={typeSet} total={totalRows} /></th>
              <th><CovBar n={campaignFilled} total={totalRows} /></th>
              <th><CovBar n={audienceFilled} total={totalRows} /></th>
              <th><CovBar n={messagingFilled} total={totalRows} /></th>
              <th><CovBar n={rtbSetN} total={totalRows} /></th>
              <th><CovBar n={onMessageN} total={reviewableN} /></th>
              <th><span className="cov-check">✓</span></th>
              <th><span className="cov-stat">{approvedN} approved · {postedN} posted</span></th>
              <th><CovBar n={trackingCleanN} total={totalRows} /></th>
              <th><CovBar n={budgetSetN} total={paidN} /></th>
              {/* Only when there is attribution to report. "$0 won" reads as a measured zero,
                  and on any campaign that is not the seeded demo data it is simply the absence of a
                  connected source: the adapter recognises three hardcoded asset names. */}
              <th>{wonScoped > 0 ? <span className="cov-stat">↗ {money(wonScoped)} won</span> : null}</th>
              {/* PROJECTED until the brand has measured numbers. journeyPerf is a model — reach
                  decays down the funnel from a per-channel base with a stable per-asset jitter — and
                  it exported isBrandCalibrated "so surfaces can label projections" and then had no
                  callers, so a figure nobody had measured was printed exactly like one that had. */}
              <th>
                <span className="cov-stat" title={reachIsProjected ? 'Projected from channel benchmarks. No measured reach for this brand yet.' : 'From measured reach for this brand.'}>
                  📊 {formatReach(journeyPerf.plan.topReach)} reach{reachIsProjected ? ' (est.)' : ''}
                </span>
              </th>
              <th><CovBar n={postedN} total={totalRows} /></th>
              <th><CovBar n={commentedN} total={postedN} /></th>
              <th />
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => {
              const typeValid = isValidType(row.channel, row.assetType)
              return (
                <tr
                  key={row.id}
                  className="data-row"
                  onClick={(e) => {
                    // Open the editor for clicks on dead space, but let inline
                    // controls (selects, inputs, buttons) handle their own clicks.
                    const t = e.target as HTMLElement
                    if (t.closest('input, select, textarea, button, code, a, .col-resizer'))
                      return
                    openReview(row.id)
                  }}
                >
                  <td className="gutter">{i + 1}</td>

                  <td>
                    <div className="sheet-asset">
                      <div className="mini">
                        {row.mediaRef ? (
                          <Thumb mediaType={row.mediaType} url={proxiedMedia(row.mediaRef, 200)} />
                        ) : (
                          <label
                            className="mini-upload"
                            title="Upload creative for this slot"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ⬆
                            <input
                              type="file"
                              accept="image/*,video/*,.pdf,.txt,.md,.html,.json"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) fillRowMedia(row.id, f)
                                e.currentTarget.value = ''
                              }}
                            />
                          </label>
                        )}
                      </div>
                      <span className="nm" title={row.assetName}>
                        {row.assetName}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className="ch-cell">
                      {/* The icon carries the brand colour, at 15px, in a shape people recognise
                          faster than they read. The LABEL used to carry it too, which is the only
                          place in the app that puts a brand hue on running text: #ff0000 YouTube and
                          #e60023 Pinterest are more saturated than the app's own red, so the loudest
                          thing in a row was the one cell that says nothing about its state, and a
                          column of 28 different hues cannot be scanned for pattern, which is the job
                          of a column. */}
                      <ChannelIcon channel={row.channel} size={15} />
                      <select
                        className="cell-select"
                        value={resolveChannelId(row.channel) ?? row.channel}
                        onChange={(e) => {
                          const channel = e.target.value as ChannelId
                          // Keep the type if still valid; otherwise preselect the channel's primary
                          // type (matching how new rows seed) rather than leaving it blank to prompt.
                          const assetType = isValidType(channel, row.assetType) ? row.assetType : primaryTypeKey(channel)
                          // A human pick clears the inferred-categorization flag.
                          updateRow(row.id, { channel, assetType, classifyConfidence: undefined, classifySource: undefined })
                        }}
                      >
                        {KIND_ORDER.map((section) => (
                          <optgroup key={section.kind} label={section.label}>
                            {channelsByKind(section.kind).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {/* Cut off from the brief. The canvas says this by a missing line and the
                          panel says it in words; here it has to be per row, because the grid is the
                          one surface where a cut channel's assets sit interleaved with everything
                          else and nothing distinguishes them. */}
                      {detachedRowIds.has(row.id) && (
                        <span className="ch-cut" title="This channel is cut off from the campaign brief, so its assets are written without the campaign's cards. Reconnect it on the Flow tab.">
                          cut off
                        </span>
                      )}
                    </div>
                  </td>

                  <td>
                    <div className="type-cell">
                      {row.classifyConfidence != null && row.classifyConfidence < 0.7 ? (
                        <span
                          className="cat-review"
                          title="Low-confidence categorization. Claude was not sure of the channel/type; check it."
                        >
                          ⛑
                        </span>
                      ) : row.classifySource === 'path' || row.classifySource === 'ai' ? (
                        <span
                          className="auto-dot"
                          title={`Channel auto-organized from ${
                            row.classifySource === 'ai' ? 'Claude' : 'folder & name'
                          }`}
                        />
                      ) : null}
                      <select
                        className={`cell-select${typeValid ? '' : ' unset'}`}
                        value={typeValid ? row.assetType : ''}
                        onChange={(e) => updateRow(row.id, { assetType: e.target.value, classifyConfidence: undefined, classifySource: undefined })}
                      >
                        {!typeValid && <option value="">Select…</option>}
                        {typesFor(row.channel).map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  <td>
                    {/* Read-only inside a campaign, and buffered everywhere else. This wrote per
                        keystroke, and the campaign is what the grid FILTERS on: inside a campaign
                        tab the row failed the filter on the first character, left the view, and the
                        textarea unmounted mid-word. The canvas deliberately does not let this be
                        typed freely either — it edits only the part after "Brand — " and rebuilds
                        the rest, because that prefix is how every reader finds the row's brand. */}
                    <GrowCell
                      value={row.campaign ?? ''}
                      placeholder="—"
                      dep={total}
                      commitOnBlur
                      readOnly={!!scopeCampaign}
                      title={scopeCampaign ? 'You are inside this campaign. Move the asset from the campaign it belongs to.' : undefined}
                      onChange={(v) => updateRow(row.id, { campaign: v })}
                    />
                  </td>

                  <td>
                    <GrowCell
                      value={row.audience ?? ''}
                      placeholder="—"
                      dep={total}
                      onChange={(v) => updateRow(row.id, { audience: v })}
                    />
                  </td>

                  <td
                    className="msg-cell"
                    onClick={() => openReview(row.id)}
                    title="Open messaging"
                  >
                    {(() => {
                      const map = messagingMap(row)
                      const filled = filledFields(row)
                      const flagged = (key: string) =>
                        !!batchReview &&
                        batchReview.flags.some(
                          (f) => f.rowId === row.id && f.field?.key === key && !flagResolved(f, row, pains),
                        )
                      if (filled.length === 0) return <span className="msg-empty">Add messaging…</span>
                      return (
                        <div className="msg-pills">
                          {filled.map((fl) => {
                            const copy = (map[fl.key] ?? '').trim()
                            return (
                              <span
                                key={fl.key}
                                className={`msg-pill${flagged(fl.key) ? ' flagged' : ''}`}
                                title={`${fl.label}: ${copy}`}
                              >
                                <span className="msg-pill-key">{fl.label}</span>
                                <span className="msg-pill-copy">{copy}</span>
                              </span>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </td>

                  <td
                    className="rtb-cell"
                    onClick={() => openReview(row.id)}
                    title="Map proof to each claim in the messaging"
                  >
                    {(() => {
                      const map = messagingMap(row)
                      const fields = messagingFields(row.channel, row.assetType)
                      const labelFor = (key: string) =>
                        fields.find((f) => f.key === key)?.label ?? key
                      const entries = Object.entries(row.rtbMap ?? {}).filter(
                        ([, ids]) => ids.length,
                      )
                      if (entries.length) {
                        return (
                          <div className="rtb-map">
                            {entries.map(([key, ids]) => (
                              <div key={key} className="rtb-map-row">
                                <span
                                  className="rtb-map-claim"
                                  title={(map[key] ?? '').trim() || labelFor(key)}
                                >
                                  {labelFor(key)}
                                </span>
                                <span className="rtb-map-proof">
                                  {ids.map((id) => (
                                    <span
                                      key={id}
                                      className="rtb-mini"
                                      title={rtbById(row.campaign, id)?.detail}
                                    >
                                      {rtbById(row.campaign, id)?.label ?? id}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                      return hasCopy(row) ? (
                        <span className="rtb-warn">unsupported</span>
                      ) : (
                        <span className="cell-ro">—</span>
                      )
                    })()}
                  </td>

                  <td className="icp-cell" onClick={() => openReview(row.id)} title="Open to review vs ICP">
                    {(() => {
                      const v = rowVerdict(row)
                      if (v === 'on') return <span className="icp-verdict on">✓ On-ICP</span>
                      if (v === 'off') return <span className="icp-verdict off">✕ Off-ICP</span>
                      if (v === 'drift')
                        return <span className="icp-verdict drift">⚠ Drift {unresolvedFlags(row)}</span>
                      // Live / posted content: a heuristic ICP-fit grade.
                      if (!hasCopy(row)) return <span className="cell-ro">—</span>
                      const g = icpGrade(row)
                      return (
                        <span className={`icp-grade g-${g.letter}`} title={`ICP fit: ${g.reasons}`}>
                          {g.letter}
                        </span>
                      )
                    })()}
                  </td>

                  <td>
                    <input
                      className="cell-input"
                      type="datetime-local"
                      value={isoToLocalInput(row.scheduledAt)}
                      onChange={(e) =>
                        updateRow(row.id, { scheduledAt: localInputToIso(e.target.value) })
                      }
                    />
                  </td>

                  <td>
                    <select
                      className={`cell-select st-${row.status}`}
                      value={row.status}
                      onChange={(e) => onStatusChange(row, e.target.value as RowStatus)}
                    >
                      {/* All seven. This offered five, so a row the review drawer had just put
                          into `in_review` or `rejected` matched no option and the cell rendered
                          blank: the one column whose whole job is to say where a row is up to went
                          empty exactly when it had something to say. */}
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="track-cell">
                    {row.utm ? (
                      (() => {
                        const checks = trackingChecks(row)
                        const clean = checks.every((c) => c.ok)
                        const bad = checks.filter((c) => !c.ok).map((c) => c.label)
                        return (
                          <div
                            className="track-cell-inner"
                            title={clean ? utmQuery(row.utm) : `Missing: ${bad.join(', ')}`}
                          >
                            <span className={`trk ${clean ? 'ok' : 'bad'}`}>
                              {clean ? '✓ Tracked' : `⚑ ${bad.length}`}
                            </span>
                            <code className="trk-utm">?{utmQuery(row.utm)}</code>
                          </div>
                        )
                      })()
                    ) : (
                      <button
                        className="btn ghost sm"
                        onClick={() => generateTrackingForRow(row.id)}
                      >
                        Generate
                      </button>
                    )}
                  </td>

                  <td className="budget-cell">
                    {isPaidRow(row) ? (
                      <div className="bud">
                        <div className="bud-line">
                          <span className="bud-cur">$</span>
                          <input
                            className="bud-amt"
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.budget?.amount || ''}
                            onChange={(e) =>
                              updateRow(row.id, {
                                budget: {
                                  amount: Number(e.target.value) || 0,
                                  type: row.budget?.type ?? 'daily',
                                  endDate: row.budget?.endDate,
                                },
                              })
                            }
                          />
                          <select
                            className="bud-type"
                            value={row.budget?.type ?? 'daily'}
                            onChange={(e) =>
                              updateRow(row.id, {
                                budget: {
                                  amount: row.budget?.amount ?? 0,
                                  type: e.target.value as 'daily' | 'lifetime',
                                  endDate: row.budget?.endDate,
                                },
                              })
                            }
                          >
                            <option value="daily">daily</option>
                            <option value="lifetime">lifetime</option>
                          </select>
                        </div>
                        {!hasBudget(row) && row.status !== 'posted' && row.status !== 'failed' && (
                          <span className="bud-flag" title="Set a budget to clear the budget gate">
                            ⚑ needs budget
                          </span>
                        )}
                        {row.spend &&
                          (() => {
                            const p = pacing(row, now)
                            return (
                              <span className={`pace pace-${p.status}`} title={`Planned ${money(p.planned)} · spent ${money(p.spent)}`}>
                                {money(p.spent)} · {PACE_LABEL[p.status]}
                              </span>
                            )
                          })()}
                      </div>
                    ) : (
                      <span className="cell-ro">—</span>
                    )}
                  </td>

                  <td className="attr-cell">
                    {(() => {
                      const a = mockAttio.attributionForAsset(row.assetName)
                      if (!a.leads && !a.wonRevenue) return <span className="cell-ro">—</span>
                      return (
                        <div className="attr">
                          {a.wonRevenue > 0 && <span className="attr-rev">{money(a.wonRevenue)}</span>}
                          <span className="attr-leads">
                            {a.leads} lead{a.leads === 1 ? '' : 's'}
                            {a.openDeals ? ` · ${a.openDeals} open` : ''}
                          </span>
                        </div>
                      )
                    })()}
                  </td>

                  <td className="perf-cell">
                    {(() => {
                      const p = journeyPerf.perAsset.get(row.id)
                      if (!p || !p.reach) return <span className="cell-ro">—</span>
                      return (
                        <div className="perf" title={`Reached ${p.reach.toLocaleString()} · ${(p.rate * 100).toFixed(1)}% ${p.rateLabel}`}>
                          <span className="perf-reach">{formatReach(p.reach)}{reachIsProjected ? <span className="perf-est"> est.</span> : null}</span>
                          {/* NO LEAK FLAG. It painted anything under 12% in the same red as the
                              delete button, and these numbers are simulated: a leaf's rate is its
                              stage benchmark times a jitter of 0.8 to 1.2 (journeyPerf), and the
                              first two benchmarks are 3% and 6%. So every awareness and
                              consideration asset was flagged as underperforming every time, by
                              construction, and a bottom-funnel one never could be. A threshold
                              relative to the stage would be just as empty, because the number is
                              generated FROM the stage. It can come back when the rates are real and
                              there is a target to miss. */}
                          <span className="perf-rate">
                            {(p.rate * 100).toFixed(0)}% {p.rateLabel}
                          </span>
                        </div>
                      )
                    })()}
                  </td>

                  <td className="cell-ro">{postedLabel(row)}</td>

                  <td className="comments-cell">
                    {row.status === 'posted'
                      ? (() => {
                          const cs = commentMap[row.id] ?? []
                          const needs = cs.filter((c) => c.needsResponse).length
                          if (cs.length === 0)
                            return (
                              <button
                                className="comments-link muted"
                                onClick={() => openComments(row.id)}
                                title="Sync comments to pull replies"
                              >
                                No comments
                              </button>
                            )
                          return (
                            <button
                              className="comments-link"
                              onClick={() => openComments(row.id)}
                              title="Open comments"
                            >
                              💬 {cs.length}
                              {needs > 0 && (
                                <span className="comments-badge" title={`${needs} need a reply`}>
                                  {needs} to reply
                                </span>
                              )}
                            </button>
                          )
                        })()
                      : <span className="cell-ro">—</span>}
                  </td>

                  <td className="act-publish">
                    {(row.status === 'approved' || row.status === 'failed') && canPublish ? (
                      <button className="btn sm" onClick={() => publishRow(row.id)}>
                        Publish
                      </button>
                    ) : (
                      <span className="cell-ro">—</span>
                    )}
                  </td>

                  <td className="act-hover">
                    <button
                      className="btn ghost sm"
                      title="Edit row"
                      onClick={() => openReview(row.id)}
                    >
                      ✎
                    </button>
                    <button
                      className="btn ghost sm"
                      title="Duplicate this asset onto another channel"
                      onClick={() => duplicateRow(row.id)}
                    >
                      ⎘
                    </button>
                  </td>

                  <td className="act-delete">
                    <button
                      className="btn ghost sm"
                      title="Remove row"
                      onClick={() => removeRow(row.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}

            {Array.from({ length: pad }).map((_, i) => (
              <tr key={`pad-${i}`} className="pad-row">
                <td className="gutter">{view.length + i + 1}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Load-sample handler reads the store lazily so the empty-state button works.
function loadSampleHint() {
  void useTrafficStore.getState().loadSample()
}
