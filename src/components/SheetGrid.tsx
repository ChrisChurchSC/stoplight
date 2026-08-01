import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { KIND_ORDER, channelsByKind, resolveChannelId } from '../domain/channels'
import { isValidType, primaryTypeKey, typesFor } from '../domain/channelAssetTypes'
import { hasCopy, messagingFields, messagingMap } from '../domain/messaging'
import { PACE_LABEL, hasBudget, isPaidRow, money, pacing } from '../domain/budget'
import { flagResolved } from '../adapters/icp/mockIcp'
import { assetRtbIds, rtbById } from '../domain/rtb'
import { boardFor, deliverableKeyFor, type CanvasObject, type CanvasObjectKind } from '../domain/flowBoard'
import { cardsForRow } from '../domain/cardsForRow'
import { OBJECT_META } from '../domain/canvasObjectMeta'
import type { ChannelId, TrafficRow } from '../domain/types'
import { isoToLocalInput, localInputToIso } from '../lib/format'
import { rowInScope } from '../lib/scope'
import { inTimeRange } from '../domain/timeRange'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'
import { CompletenessBar } from './CompletenessBar'



/**
 * THE COLUMNS THE SHEET CAN SHOW, in order. What it DOES show is worked out per render: see `cols`.
 *
 * Two things make the list dynamic rather than fixed. Messaging used to stack every copy component
 * into one cell as labelled pills, which is a list wearing a column's clothes: you could not read a
 * column of titles down the page, widen the one you were working in, or see at a glance which posts
 * had no description. Each component the rows actually carry gets a column now. And a column that is
 * empty on every row in view is a column of dashes, spending the width this screen has least of.
 *
 * `width` lives on the descriptor. It was a parallel array indexed by position, which is the kind of
 * thing that silently misaligns the moment a column is added or removed — and six have just gone.
 *
 * `always` marks the ones that stay whether or not they hold anything: what a row IS, and the
 * controls. An empty Asset column would not read as "nothing here", it would read as no sheet.
 */
const COLUMNS: { key: string; label: string; icon: string; width: number; always?: true }[] = [
  { key: 'asset', label: 'Asset', icon: '▦', width: 220, always: true },
  { key: 'channel', label: 'Channel', icon: '◉', width: 140, always: true },
  { key: 'type', label: 'Type', icon: '◆', width: 160, always: true },
  { key: 'campaign', label: 'Campaign', icon: '◇', width: 150 },
  { key: 'audience', label: 'Audience', icon: '◎', width: 150 },
  { key: 'messaging', label: 'Messaging', icon: '¶', width: 320 },
  { key: 'rtb', label: 'Proof', icon: '◆', width: 300 },
  { key: 'scheduled', label: 'Scheduled', icon: '◷', width: 184 },
  { key: 'budget', label: 'Budget', icon: '◧', width: 200 },
  { key: 'actions', label: '', icon: '', width: 84, always: true },
  { key: 'delete', label: '', icon: '', width: 64, always: true },
]
const GUTTER_W = 40
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
  const openReview = useTrafficStore((s) => s.openReview)
  const batchReview = useTrafficStore((s) => s.batchReview)
  const icp = useTrafficStore((s) => s.icp)
  const flowBoards = useTrafficStore((s) => s.flowBoards)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  // Batch (column-header) actions.

  const pains = icp?.pains ?? []

  // Heuristic ICP-fit grade for content that's already live (the batch review
  // only scores unshipped rows). Graded on whether the piece is targeted to a
  // defined audience, substantiated by proof, and resonant with that audience's
  // needs. A "Recheck with Claude" deepens it.

  /**
   * WHAT IS SELECTED: a row, a column, or one cell. A spreadsheet's most basic gesture, and this
   * sheet had none of it — clicking anywhere opened the review drawer, so there was no way to point
   * at a row without also leaving the sheet.
   *
   * Selecting is the single click now and opening is the double click, which is the convention every
   * spreadsheet already taught everyone. The inline controls still take their own clicks first, so a
   * status picker or a text cell behaves exactly as before.
   *
   * The column is identified by KEY rather than index: the column list changes with the data, and an
   * index would quietly point at a different column the moment one appeared or dropped out.
   */
  const [pick, setPick] = useState<
    { kind: 'row'; rowId: string } | { kind: 'col'; colKey: string } | { kind: 'cell'; rowId: string; colKey: string } | null
  >(null)
  const [widthByKey, setWidthByKey] = useState<Record<string, number>>({})

  function startResize(idx: number, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths[idx]
    const key = cols[idx - 1]?.key
    if (!key) return
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_COL, startW + (ev.clientX - startX))
      setWidthByKey((prev) => ({ ...prev, [key]: w }))
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

  // Through hasCopy, the same question the Messaging cell asks. These disagreed: this counted a
  // row filled on any stored key while the cell showed "Add messaging…" for the same row.
  const now = Date.now()

  // ---- Batch-action states for the column headers ----
  // Connection gate: the thread must be intact (no open breaks in scope) before
  // anything ships. "Review connections" actually gates "Publish."
  // Journey performance (reach + per-fork flow) on the campaign — the same numbers
  // the canvas shows, surfaced per row here so performance reads the same everywhere.
  /**
   * WHAT THE HEADER BUTTONS ACT ON, so they act on what they counted.
   *
   * Only when the grid is pinned to a campaign or a brand — the case where the counts above are a
   * subset and the actions were not. At the unpinned workbench the grid already IS the workspace, so
   * it passes nothing and the actions keep the reach they were written with.
   */

  /**
   * ONE COLUMN PER COPY COMPONENT the rows in view actually carry, in the order the formats declare
   * them. A campaign of YouTube posts gets Title, Description and Pinned comment; a mixed one gets
   * the union, and a component nobody has filled in does not get a column at all.
   */
  const msgCols = (() => {
    const seen = new Map<string, string>()
    for (const r of view) {
      for (const f of messagingFields(r.channel, r.assetType)) {
        if (!seen.has(f.key) && (messagingMap(r)[f.key] ?? '').trim()) seen.set(f.key, f.label)
      }
    }
    return [...seen].map(([key, label]) => ({ key: `msg:${key}`, label, icon: '¶', width: 280, fieldKey: key }))
  })()

  /** Empty on every row in view? Only asked of columns that are allowed to disappear. */
  const columnEmpty = (key: string): boolean => {
    const none = (fn: (r: TrafficRow) => unknown) =>
      !view.some((r) => {
        const v = fn(r)
        return v !== undefined && v !== null && v !== '' && v !== 0 && v !== false
      })
    switch (key) {
      case 'campaign': return none((r) => (r.campaign ?? '').trim())
      case 'audience': return none((r) => (r.audience ?? '').trim())
      case 'rtb': return none((r) => assetRtbIds(r).length)
      case 'scheduled': return none((r) => r.scheduledAt)
      case 'budget': return none((r) => r.budget?.amount)
      default: return false
    }
  }

  /**
   * WHAT EACH ASSET IS WRITTEN FROM, by object kind — one column per kind, so a Brand, a Message and
   * a Voice sit side by side and can be read down the page.
   *
   * The canvas answers this by having you look at it: the lines run from those cards into the brief
   * and down to the post. The grid said nothing about it, so it described the copy and the schedule
   * and the budget while staying silent on the thing that decided what the copy says.
   *
   * A card names a record in one of a dozen collections, so the name is resolved here where those
   * live. A card with nothing picked shows its own typed text, and failing that its kind, because a
   * card that is connected and empty is worth seeing — it is reaching the writer with nothing.
   */
  const smartObjects = useTrafficStore((s) => s.smartObjects)
  const companies = useTrafficStore((s) => s.companies)
  const people = useTrafficStore((s) => s.people)
  const messages = useTrafficStore((s) => s.messages)
  const concepts = useTrafficStore((s) => s.concepts)
  const seasons = useTrafficStore((s) => s.seasons)
  const voices = useTrafficStore((s) => s.voices)
  const triggers = useTrafficStore((s) => s.triggers)
  const products = useTrafficStore((s) => s.products)
  const brandObjects = useTrafficStore((s) => s.brandObjects)

  const nameFor = (o: CanvasObject): string => {
    if (o.smartObjectId) {
      const so = smartObjects.find((x) => x.id === o.smartObjectId)
      if (so) return so.name
    }
    const byId = (list: { id: string; name?: string; label?: string }[]) =>
      o.refId ? (list.find((x) => x.id === o.refId)?.name ?? list.find((x) => x.id === o.refId)?.label) : undefined
    const named =
      o.kind === 'brand' ? byId(brandObjects)
      : o.kind === 'product' ? byId(products)
      : o.kind === 'message' ? byId(messages)
      : o.kind === 'voice' ? byId(voices)
      : o.kind === 'concept' ? byId(concepts)
      : o.kind === 'season' ? byId(seasons)
      : o.kind === 'company' ? byId(companies)
      : o.kind === 'person' ? byId(people)
      : o.kind === 'trigger' ? byId(triggers)
      : o.kind === 'audience' ? byId(clientAudiences[clientFilter] ?? [])
      : undefined
    return named ?? o.text.trim().split('\n')[0] ?? ''
  }

  /** Cards reaching each row, by row id. One board walk per row, only when a board exists. */
  const cardsByRow = (() => {
    const out = new Map<string, ReturnType<typeof cardsForRow>>()
    if (!scopeCampaign) return out
    const board = boardFor(flowBoards, scopeCampaign)
    if (!board.objects.length) return out
    for (const r of view) out.set(r.id, cardsForRow(board, r, nameFor))
    return out
  })()

  /**
   * A COLUMN FOR EVERY OBJECT TYPE, whether or not anything is wired to one.
   *
   * This is the exception to the empty-column rule, and it is the whole point of these columns. An
   * empty Voice column does not mean "nothing to show here", it means NOTHING IS SHAPING THE VOICE —
   * which is exactly what the canvas says by having no line, and exactly the gap a person opens the
   * sheet to find. Hiding it would hide the finding.
   *
   * Note cards are left out: a note is markup on the board, deliberately never sent to the writer,
   * so a column of them would say nothing about how anything was written.
   */
  const objectCols = (Object.keys(OBJECT_META) as CanvasObjectKind[])
    .filter((k) => k !== 'note')
    .map((k) => ({ key: `obj:${k}`, label: OBJECT_META[k].label, icon: '◈', width: 170, objKind: k }))

  const cols = (() => {
    const out: { key: string; label: string; icon: string; width: number; fieldKey?: string; objKind?: CanvasObjectKind }[] = []
    for (const c of COLUMNS) {
      if (c.key === 'messaging') { out.push(...msgCols); continue }
      if (!c.always && columnEmpty(c.key)) continue
      out.push(c)
    }
    // The object columns sit after the copy and before the controls: they say where the words came
    // from, which you read after the words themselves.
    const at = out.findIndex((c) => c.key === 'actions')
    out.splice(at < 0 ? out.length : at, 0, ...objectCols)
    return out
  })()
  /** Is this column on screen? The body cells are written in order, so they ask before rendering. */
  const show = (key: string) => cols.some((c) => c.key === key)
  const widths = [GUTTER_W, ...cols.map((c) => widthByKey[c.key] ?? c.width)]
  const total = widths.reduce((a, b) => a + b, 0)
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
  const detachedRowIds = (() => {
    if (!scopeCampaign) return new Set<string>()
    const cut = boardFor(flowBoards, scopeCampaign).detached ?? []
    if (!cut.length) return new Set<string>()
    return new Set(view.filter((r) => cut.includes(deliverableKeyFor(r))).map((r) => r.id))
  })()

  /**
   * The selected CELL is marked on the DOM node after render rather than through a class on the
   * cell itself. The body cells are written out in order — a column key is not threaded through
   * them — and adding one to all thirty would be thirty chances to get it wrong for a highlight.
   * The row carries its id and the column carries its position, which is enough to find the one.
   */
  useEffect(() => {
    document.querySelectorAll('.sheet td.cell-sel').forEach((e) => e.classList.remove('cell-sel'))
    if (pick?.kind !== 'cell') return
    const tr = document.querySelector(`.sheet tr[data-row-id="${CSS.escape(pick.rowId)}"]`)
    const idx = cols.findIndex((c) => c.key === pick.colKey)
    if (idx >= 0) tr?.children[idx + 1]?.classList.add('cell-sel')
  })

  /** Escape drops the selection, the same key that drops one on the canvas. */
  useEffect(() => {
    if (!pick) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t instanceof Element && t.closest('input, textarea, select, [role="dialog"], .drawer')) return
      setPick(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pick])

  const pad = Math.max(0, MIN_ROWS - view.length)

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
              <col
                key={i}
                className={i > 0 && pick?.kind === 'col' && pick.colKey === cols[i - 1]?.key ? 'sel' : undefined}
                style={{ width: w }}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="letters">
              <th className="corner" />
              {cols.map((c, i) => (
                <th
                  key={c.key}
                  className={pick?.kind === 'col' && pick.colKey === c.key ? 'sel' : undefined}
                  onClick={() => setPick((p) => (p?.kind === 'col' && p.colKey === c.key ? null : { kind: 'col', colKey: c.key }))}
                >
                  {colLetter(i)}
                </th>
              ))}
            </tr>
            <tr className="names">
              <th className="corner">#</th>
              {cols.map((c, i) => (
                <th key={c.key}>
                  {c.icon && <span className="col-ico">{c.icon}</span>}
                  {c.label}
                  <span className="col-resizer" onMouseDown={(e) => startResize(i + 1, e)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => {
              const typeValid = isValidType(row.channel, row.assetType)
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={`data-row${pick?.kind === 'row' && pick.rowId === row.id ? ' sel' : ''}`}
                  onClick={(e) => {
                    // Inline controls take their own clicks, exactly as before.
                    const t = e.target as HTMLElement
                    if (t.closest('input, select, textarea, button, code, a, .col-resizer')) return
                    const td = t.closest('td')
                    if (!td) return
                    // The gutter is the row's handle: clicking the number takes the whole row.
                    if (td.cellIndex === 0) {
                      setPick((p) => (p?.kind === 'row' && p.rowId === row.id ? null : { kind: 'row', rowId: row.id }))
                      return
                    }
                    const colKey = cols[td.cellIndex - 1]?.key
                    if (!colKey) return
                    setPick((p) =>
                      p?.kind === 'cell' && p.rowId === row.id && p.colKey === colKey
                        ? null
                        : { kind: 'cell', rowId: row.id, colKey },
                    )
                  }}
                  onDoubleClick={(e) => {
                    const t = e.target as HTMLElement
                    if (t.closest('input, select, textarea, button, code, a, .col-resizer')) return
                    openReview(row.id)
                  }}
                >
                  <td className="gutter">{i + 1}</td>

                  <td>
                    {/* No thumbnail. It reserved a 200px slot on every row for a picture most
                        assets do not have, so the column was mostly an upload arrow repeated down
                        the page — and the canvas, which is where you look at creative, has no
                        thumbnails either. The name is what you scan this column for. */}
                    <div className="sheet-asset">
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

                  {show('campaign') && (
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
                  )}

                  {show('audience') && (
                    <td>
                      <GrowCell
                        value={row.audience ?? ''}
                        placeholder="—"
                        dep={total}
                        onChange={(v) => updateRow(row.id, { audience: v })}
                      />
                    </td>
                  )}

                  {msgCols.map((mc) => {
                    const copy = (messagingMap(row)[mc.fieldKey] ?? '').trim()
                    const isFlagged =
                      !!batchReview &&
                      batchReview.flags.some(
                        (f) => f.rowId === row.id && f.field?.key === mc.fieldKey && !flagResolved(f, row, pains),
                      )
                    return (
                      <td
                        key={mc.key}
                        className={`msg-cell${isFlagged ? ' flagged' : ''}`}
                        onClick={() => openReview(row.id)}
                        title={copy || 'Open messaging'}
                      >
                        {copy ? <span className="msg-copy">{copy}</span> : <span className="cell-ro">—</span>}
                      </td>
                    )
                  })}

                  {show('rtb') && (
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
                  )}

                  {show('scheduled') && (
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
                  )}



                  {show('budget') && (
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
                  )}

                  {/* WHAT THIS ASSET IS WRITTEN FROM, one cell per object kind. A card that reaches the row
                      with nothing picked still shows, greyed, because a connected empty card is reaching the
                      writer with nothing and that is worth seeing. */}
                  {objectCols.map((oc) => {
                    const mine = (cardsByRow.get(row.id) ?? []).filter((c) => c.kind === oc.objKind)
                    return (
                      <td key={oc.key} className="obj-cell">
                        {mine.length === 0 ? (
                          <span className="cell-ro">—</span>
                        ) : (
                          mine.map((c) => (
                            <span key={c.id} className={`obj-chip${c.label ? '' : ' empty'}`} title={c.label || `${oc.label} card with nothing picked yet`}>
                              {c.label || 'Nothing picked'}
                            </span>
                          ))
                        )}
                      </td>
                    )
                  })}
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
                {cols.map((c) => (
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
