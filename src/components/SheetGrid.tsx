import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { KIND_ORDER, channelsByKind, resolveChannelId } from '../domain/channels'
import { isValidType, primaryTypeKey, typesFor } from '../domain/channelAssetTypes'
import { filledFields, hasCopy, messagingFields, messagingMap } from '../domain/messaging'
import { PACE_LABEL, hasBudget, isPaidRow, money, pacing } from '../domain/budget'
import { flagResolved } from '../adapters/icp/mockIcp'
import { rtbsForCampaign } from '../domain/rtb'
import { boardFor, deliverableKeyFor, objectName, type CanvasObject, type CanvasObjectKind } from '../domain/flowBoard'
import { cardsForRow } from '../domain/cardsForRow'
import { madeFrom } from '../domain/madeFrom'
import { REF_TYPE_FOR_OBJECT_KIND } from '../domain/flowBoard'
import { OBJECT_META } from '../domain/canvasObjectMeta'
import type { ChannelId, TrafficRow } from '../domain/types'
import type { FlowReference } from '../domain/clients'
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
  /**
   * NO AUDIENCE COLUMN. An audience is an OBJECT, not a field on the asset, and it is already stated
   * as one in Made from — with its mark, its hue, the segment it names and a way to open it. A text
   * column beside that was the same answer written twice in two different alphabets: a free-typed
   * string here, a picked record there, and nothing keeping them honest with each other.
   *
   * The string itself is not gone — the writer still targets by it, the sidebar still filters on it,
   * and the asset's own drawer still edits it. What is gone is a second place to set it that could
   * disagree with the object. Picking an Audience object writes the name through (see setRowRecord),
   * so the one gesture answers both.
   */
  { key: 'messaging', label: 'Messaging', icon: '¶', width: 320 },
  { key: 'scheduled', label: 'Scheduled', icon: '◷', width: 184 },
  { key: 'budget', label: 'Budget', icon: '◧', width: 200 },
  /**
   * NO DUPLICATE COLUMN. It was 84px down the whole sheet holding one ⎘ per row, invisible until
   * the row was hovered — a permanent lane for an occasional gesture, parked next to the delete
   * control where a mis-aimed click is expensive. It lives on the row's right-click menu now,
   * which is where a spreadsheet already keeps its per-row actions and costs no width at all.
   */
  { key: 'delete', label: '', icon: '', width: 64, always: true },
]
const GUTTER_W = 40

/**
 * MADE FROM: one column for every card an asset is written from, not one column per KIND.
 *
 * It was a column each — Brand, Product, Audience, Data source, Message, Proof point, Trigger,
 * Voice, Company, Person, Concept, Season — twelve columns, 170px apiece, sat in front of the copy.
 * The argument for that was that an empty Voice column is itself a finding: nothing is shaping the
 * voice. What it produced in practice was 2,040px of mostly "Select voice" between an asset's name
 * and its first line of copy, a horizontal scroll to read one row, and a grid whose widest thing by
 * far was the part that is usually empty.
 *
 * One column, holding the cards this asset actually has, in registry order. A row that is written
 * from a brand and a message says so in two chips; a row written from nothing says so in a cell
 * offering to add one. The per-kind gap is no longer visible at a glance across the sheet — that is
 * what collapsing costs, and it is paid for by the copy being on screen at all.
 *
 * Note cards are left out: a note is markup on the board, deliberately never sent to the writer, so
 * it says nothing about how anything was written.
 */
const MADE_FROM_KINDS = (Object.keys(OBJECT_META) as CanvasObjectKind[]).filter((k) => k !== 'note')
const MADE_FROM_COL = { key: 'madeFrom', label: 'Made from', icon: '◈', width: 320 }

/**
 * Kinds a cell can MAKE a record for. Proof and data sets are absent deliberately: a proof point is
 * a claim with a number and a source behind it, and a data set is a table. Minting either from a
 * name produces something that looks established and says nothing — worse than an empty picker that
 * sends you to build it properly. The canvas takes the same line about data sets.
 */
const CREATABLE = new Set<CanvasObjectKind>(['brand', 'product', 'audience', 'message', 'voice', 'concept', 'season', 'company', 'person', 'trigger'])
const MIN_COL = 60
const MIN_ROWS = 20
/**
 * The row menu's own size, only so it can be kept on screen. It is what .flow-ctx is drawn at —
 * its min-width, and its padding around one hint line and one item — rather than a measurement,
 * which would mean rendering the menu somewhere it can be measured before knowing where to put it.
 */
const ROW_MENU_W = 216
const ROW_MENU_H = 76
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

export function SheetGrid({
  liveScope = false,
  scopeClient,
  scopeCampaign,
  zoom = 100,
  onPickObject,
  onCreateObject,
  onPickRow,
  selectedRowId,
}: {
  liveScope?: boolean
  scopeClient?: string
  scopeCampaign?: string
  /**
   * Percent, and the SAME number the campaign canvas zooms by — the toolbar that sets it is shared,
   * so a sheet at 50% and a board at 50% are one setting rather than two that happen to agree.
   *
   * It rides on the table rather than on the scrolling wrapper around it, which is the whole point:
   * shrinking the CONTENT inside a window whose width does not move is what puts more columns on
   * screen. Scaling the window too would just draw the same slice of sheet, smaller.
   */
  zoom?: number
  /**
   * Clicking an object cell hands the CARD BEHIND IT back to whoever rendered this grid, so they can
   * open their own inspector on it. The grid does not open one itself, deliberately: the inspector
   * that matters already exists on the canvas, and a second one built here would be a second answer
   * to the same question. `cardId` is undefined when the cell's value came from a row pin or the
   * campaign's brand rather than from a card — a real state, and the caller has to say so rather
   * than being handed an invented card.
   */
  onPickObject?: (pick: { kind: CanvasObjectKind; cardId?: string; label: string }) => void
  /**
   * "Add a voice" makes a real CARD on the board and opens the real form on it, which is what
   * adding one on the canvas does. The grid asks for it and does not do it: the board belongs to
   * whoever rendered this.
   */
  onCreateObject?: (req: { kind: CanvasObjectKind; rowId: string }) => void
  /**
   * CLICKING AN ASSET OPENS THE ASSET — the same inspector the canvas and the calendar open, on the
   * same row. The grid was the last surface in a campaign that could not reach it.
   *
   * That is not a missing button, it is a gap left by two decisions that were each right on their
   * own. The row drawer went when every object cell became a picker, and the object cells were given
   * the canvas's inspector in its place. The ASSET cells were not, so the copy columns — the reason
   * you open a sheet — became read-only text with nothing behind them: no way to fix a word, and no
   * way to ask for the copy again.
   *
   * The grid still does not build a panel of its own, for the same reason it does not build one for
   * objects: the inspector that matters already exists, and a second one here would be a second
   * answer to the same question. It hands back the row id and whoever rendered it opens it.
   *
   * Absent outside a campaign (the brand folder, Live), where there is no board in scope to inspect
   * an asset against — the same line CalendarView draws.
   */
  onPickRow?: (rowId: string) => void
  /** The row the caller's inspector is currently open on, so the sheet can mark it. */
  selectedRowId?: string
} = {}) {
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
  /**
   * THE ROW'S RIGHT-CLICK MENU, at the point it was opened from. It holds what used to be the
   * duplicate column: an action you reach for now and then, which does not deserve a lane of the
   * sheet's width forever. Positioned against the VIEWPORT, because the sheet scrolls in both
   * directions under it and a menu that scrolls away from the pointer is a menu you re-open.
   */
  const [rowMenu, setRowMenu] = useState<{ rowId: string; x: number; y: number } | null>(null)
  const [widthByKey, setWidthByKey] = useState<Record<string, number>>({})
  /**
   * The asset whose "Made from" drawer is open, by row id, and what is typed in its search.
   *
   * By ROW rather than by a boolean plus a remembered row, because the row is what the drawer is
   * about: a row that leaves the view while its drawer is open (the filter moves, the campaign
   * changes) resolves to nothing and the drawer closes with it, instead of staying up and writing
   * to an asset that is no longer on screen.
   */
  const [addFor, setAddFor] = useState<string | null>(null)
  const [addQuery, setAddQuery] = useState('')

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
   * HOW WIDE THE COMPONENT LABELS ARE, in characters, for the whole Messaging column at once.
   *
   * Sizing the label column per cell — which is what CSS does on its own — lines the labels up
   * INSIDE a cell and nowhere else: a row of Title and Description sets a narrower column than the
   * row under it carrying Pinned comment, so the copy starts at a different x on every row and the
   * column reads as ragged down the page. Sizing it to the longest label in the SCHEMA instead
   * spends 92px on whitespace for the four-fifths of formats whose labels are one short word.
   *
   * So it is measured from what is actually on screen: the longest label any row in view renders,
   * which is the narrowest width that lines them all up. Capped at 16 characters because the schema
   * declares some long ones — "Problem / solution / use-case copy" is 34 — and past the cap they
   * wrap onto a second line rather than taking a third of the cell. A floor of 5 so a column of
   * nothing but CTA does not collapse to a sliver.
   *
   * In ch, resolved against .msg-key's own monospace face where the property is used, so the number
   * is characters of the font it is actually measuring — see the width there.
   */
  const msgKeyCh = (() => {
    let n = 0
    for (const r of view) for (const f of filledFields(r)) n = Math.max(n, f.label.length)
    return Math.min(Math.max(n, 5), 16)
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
      case 'scheduled': return none((r) => r.scheduledAt)
      case 'budget': return none((r) => r.budget?.amount)
      // Nothing written anywhere in view. Asked through hasCopy — the schema-filtered reading — so
      // the column disappears on exactly the rows whose own cells would have said "Add messaging…",
      // and not on a row whose text is sitting under a key its format no longer defines.
      case 'messaging': return !view.some(hasCopy)
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
  const brandDatasets = useTrafficStore((s) => s.brandDatasets)
  const bindCampaignBrand = useTrafficStore((s) => s.bindCampaignBrand)

  const nameFor = (o: CanvasObject): string => {
    // WHAT YOU CALLED THE CARD comes first, ahead of the smart object and ahead of the record, for
    // the same reason it does on the canvas: the grid's object columns are how you check what a row
    // is written from, and they should answer in the words on the board. See objectName.
    if (o.name?.trim()) return o.name.trim()
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
    return objectName(o, named)
  }

  /**
   * THE RECORDS YOU CAN PICK for each object kind. The same lists the canvas card's own dropdown
   * offers, so the two surfaces are choosing from one library rather than two.
   */
  /**
   * `detail` is the object's own one line — what a Message argues, what a Product is, what fires a
   * Trigger. The drawer shows it under the name, because a list of thirty names is a list of thirty
   * things you have to already know; it is absent for the kinds whose records carry no such line,
   * rather than padded with something invented to fill the row.
   */
  const optionsFor = (kind: CanvasObjectKind): { id: string; label: string; detail?: string }[] => {
    const named = <T extends { id: string; name?: string }>(l: T[], detail?: (x: T) => string | undefined) =>
      l.map((x) => ({ id: x.id, label: x.name || 'Untitled', detail: detail?.(x)?.trim() || undefined }))
    switch (kind) {
      case 'brand': return named(brandObjects, (b) => b.oneLiner)
      case 'product': return named(products, (p) => p.summary)
      case 'audience': return named(clientAudiences[clientFilter] ?? [], (a) => a.role)
      case 'message': return named(messages, (m) => m.angle)
      case 'voice': return named(voices, (v) => v.summary || v.tone)
      case 'concept': return named(concepts, (c) => c.idea)
      case 'season': return named(seasons, (s) => s.moment)
      case 'company': return named(companies, (c) => c.description || c.segment)
      case 'person': return named(people, (p) => p.title)
      case 'trigger': return named(triggers, (t) => t.signal)
      case 'data-source': return brandDatasets.map((d) => ({
        id: d.id,
        label: d.name || 'Untitled data set',
        detail: d.columns?.length ? `${d.rows?.length ?? 0} rows · ${d.columns.join(', ')}` : undefined,
      }))
      // Proof lives per campaign rather than per brand, which is why it is fetched differently
      // from every other kind here.
      case 'proof-point': return rtbsForCampaign(scopeCampaign).map((r) => ({ id: r.id, label: r.label || 'Untitled proof point' }))
      default: return []
    }
  }


  /**
   * SETTING ONE KIND MUST NOT DROP THE OTHERS.
   *
   * `row.references`, when it has anything in it, REPLACES the campaign's records wholesale for that
   * asset (see poolsFrom in the store). So writing a single picked voice into an empty references
   * array would silently detach the row from the campaign's audience and proof at the same time —
   * one dropdown quietly answering three questions.
   *
   * The set is therefore seeded from whatever is reaching the row today, and only the one kind is
   * replaced. Clearing a kind removes just that entry; clearing the last one drops back to the
   * campaign's records rather than pinning the row to nothing.
   */
  /**
   * `label` is passed in by the create path. Without it this looks the name up in optionsFor, which
   * closes over the render that STARTED the creation and so cannot contain the record that creation
   * just made: the lookup missed, `picked` came back undefined, and the branch that adds the entry
   * fell through to the one that removes it. Created, then silently unselected.
   */
  const setRowRecord = (row: TrafficRow, kind: CanvasObjectKind, refId: string, label?: string) => {
    /**
     * BRAND IS NOT A REFERENCE and is not per row: it is the campaign's OWNER, which is why it
     * carries no FlowRefType and binds through bindCampaignBrand instead. So its picker does what
     * the Brand card on the canvas does — it rebinds the campaign — and every row in the campaign
     * changes with it, because a campaign has one brand. The tooltip says so before you touch it.
     */
    if (kind === 'brand') {
      if (!scopeCampaign) return
      bindCampaignBrand(scopeCampaign, brandObjects.find((b) => b.id === refId)?.name ?? '')
      return
    }
    const type = REF_TYPE_FOR_OBJECT_KIND[kind]
    if (!type) return
    const current: FlowReference[] =
      row.references && row.references.length
        ? row.references
        : (cardsByRow.get(row.id) ?? [])
            .flatMap((c) => {
              const t = REF_TYPE_FOR_OBJECT_KIND[c.kind]
              return t && c.refId ? [{ type: t, id: c.refId, label: c.label }] : []
            })
    const rest = current.filter((r) => r.type !== type)
    const name = label ?? optionsFor(kind).find((o) => o.id === refId)?.label
    const next = refId && name ? [...rest, { type, id: refId, label: name }] : rest
    /**
     * THE AUDIENCE OBJECT WRITES THE ASSET'S AUDIENCE THROUGH.
     *
     * `row.audience` is a plain string and half the app reads it: the writer targets by it, the
     * sidebar filters on it, the canvas branches on it. It used to have its own column in this
     * sheet, typed by hand next to the object that says the same thing — two answers to one
     * question with nothing keeping them level. The column is gone (see COLUMNS) and this is the
     * other half of that: picking the segment sets the name, clearing it clears the name.
     *
     * Only for audience, and only from this cell. No other kind has a mirror field on the row.
     */
    const patch: Partial<TrafficRow> = { references: next.length ? next : undefined }
    if (kind === 'audience') patch.audience = refId && name ? name : ''
    void updateRow(row.id, patch)
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

  /** The records you can pick, resolved once per render rather than once per row per kind. */
  const optionsByKind = new Map<CanvasObjectKind, { id: string; label: string; detail?: string }[]>(
    MADE_FROM_KINDS.map((k) => [k, optionsFor(k)]),
  )
  const optsFor = (kind: CanvasObjectKind) => optionsByKind.get(kind) ?? []

  /**
   * CAN THIS CELL SET THIS KIND? Everything with a FlowRefType is pinned on the asset itself. Brand
   * is not a reference — it is the campaign's owner — so it is settable only where there is a
   * campaign to rebind, and is read-only anywhere the grid spans more than one.
   */
  const settable = (kind: CanvasObjectKind) => !!REF_TYPE_FOR_OBJECT_KIND[kind] || (kind === 'brand' && !!scopeCampaign)

  const cols = (() => {
    const out: { key: string; label: string; icon: string; width: number; fieldKey?: string }[] = []
    // Campaign is the anchor the object columns sit behind, and it can drop out as empty, so the
    // fallback anchor is Type — the last column that is always present before the copy begins.
    const anchor = COLUMNS.some((c) => c.key === 'campaign' && (c.always || !columnEmpty('campaign'))) ? 'campaign' : 'type'
    for (const c of COLUMNS) {
      if (!c.always && columnEmpty(c.key)) continue
      out.push(c)
      // MADE FROM COMES BEFORE THE COPY, not after it.
      //
      // It was after, on the reasoning that you read where the words came from once you have read
      // the words. Measured, that reasoning put it 2,684px past the right-hand edge of a 1,382px
      // viewport — nearly three screens of scrolling, behind eleven copy columns — so in practice
      // nobody ever read it at all.
      //
      // In front it also makes a better sentence: what this asset IS, what it is made FROM, then what
      // it SAYS. The pickers are the part you come here to change; the copy is the part you come here
      // to read, and reading survives a scroll better than setting does.
      if (c.key === anchor) out.push(MADE_FROM_COL)
    }
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

  /**
   * ANYTHING THAT MOVES THE SHEET CLOSES THE ROW MENU. It is pinned to the viewport at the point
   * you right-clicked, so a scroll or a resize leaves it hanging over a different row than the one
   * it acts on — which is the one way a menu like this can do real damage. Scroll is captured
   * because the sheet scrolls in its own wrapper, not on the window.
   */
  useEffect(() => {
    if (!rowMenu) return
    const close = () => setRowMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [rowMenu])

  /**
   * Escape closes the Made from drawer, from inside it as well as out.
   *
   * Its own listener rather than the one above, which deliberately ignores keys pressed inside a
   * dialog or a field — and the drawer is a dialog whose search field takes focus the moment it
   * opens, so the one key everybody presses to get out of it would have been the one it ignored.
   */
  useEffect(() => {
    if (!addFor) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddFor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addFor])

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
        <table
          className="sheet"
          style={{
            tableLayout: 'fixed',
            width: total,
            minWidth: total,
            // One width for every component label in the Messaging column — see msgKeyCh.
            ['--msg-key-w' as string]: `${msgKeyCh}ch`,
            ...(zoom === 100 ? null : { zoom: zoom / 100 }),
          } as React.CSSProperties}
        >
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
                  {/* The kind's own mark and hue used to ride in the header, one per column, so the
                      sheet and the canvas named the same thing the same way. With every kind in one
                      column there is no single mark to wear, and the marks moved down into the cells
                      where the cards are. The header keeps a plain glyph like every other column. */}
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
                  className={`data-row${pick?.kind === 'row' && pick.rowId === row.id ? ' sel' : ''}${
                    row.id === selectedRowId ? ' on' : ''
                  }`}
                  /**
                   * OPENING IS THE DOUBLE CLICK, which is what this sheet has claimed since selection
                   * arrived and has never done, because until now there was nothing to open. Every
                   * column answers to it, so the convention holds wherever you land — including the
                   * columns whose own cells do nothing else.
                   *
                   * The inline controls are skipped by the same test the single click uses: a picker
                   * or a text cell is where you edit that field, and opening a panel over the second
                   * click of a double-click in a textarea would take the cursor away mid-word.
                   */
                  onDoubleClick={(e) => {
                    if (!onPickRow) return
                    const t = e.target as HTMLElement
                    if (t.closest('input, select, textarea, button, code, a, .col-resizer')) return
                    onPickRow(row.id)
                  }}
                  /**
                   * RIGHT-CLICK IS THE ROW'S OWN MENU, and it takes the row as it opens: a menu
                   * that acts on something has to say which something, and the selection is the
                   * sheet's existing way of saying it.
                   *
                   * A field keeps the BROWSER's menu. Right-clicking inside a text cell is how you
                   * paste into it, and trading cut/paste/spellcheck for one duplicate command would
                   * be a bad swap in the one place people type.
                   */
                  onContextMenu={(e) => {
                    const t = e.target as HTMLElement
                    if (t.closest('input, select, textarea')) return
                    e.preventDefault()
                    setPick({ kind: 'row', rowId: row.id })
                    setRowMenu({ rowId: row.id, x: e.clientX, y: e.clientY })
                  }}
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
                >
                  <td className="gutter">{i + 1}</td>

                  {/* The asset's NAME is the row itself, so it opens on the first click rather than
                      the second — the same gesture an object cell already answers to, and the same
                      one the calendar answers to on an event. The double click stays for the columns
                      that have a control in them and cannot spare a single. */}
                  <td
                    className={onPickRow ? 'asset-cell open' : 'asset-cell'}
                    onClick={() => onPickRow?.(row.id)}
                  >
                    {/* No thumbnail. It reserved a 200px slot on every row for a picture most
                        assets do not have, so the column was mostly an upload arrow repeated down
                        the page — and the canvas, which is where you look at creative, has no
                        thumbnails either. The name is what you scan this column for. */}
                    <div className="sheet-asset">
                      <span className="nm" title={onPickRow ? `${row.assetName} — open this asset` : row.assetName}>
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
                  {/**
                    * WHAT THIS ASSET IS MADE FROM, in one cell: a chip per card reaching it.
                    *
                    * The chip is the card, shrunk to a word — the same mark and the same hue it wears
                    * on the canvas, so the two surfaces name the same thing the same way. Pressing it
                    * opens that card; the caret beside it changes which record the card names; the
                    * dashed "Add" at the end lands a new one on this asset.
                    */}
                  <td className="mf-cell">
                    {(() => {
                      const entries = madeFrom({
                        kinds: MADE_FROM_KINDS,
                        cards: cardsByRow.get(row.id) ?? [],
                        references: row.references,
                        // The brand's answer is the campaign's binding, so it is read from the row's
                        // own client rather than from a card: a campaign bound with no Brand card on
                        // the board still has a brand, and the cell has to say which.
                        brandRefId: brandObjects.find((b) => b.name === (row.client ?? ''))?.id,
                        nameOf: (kind, refId) => optsFor(kind).find((o) => o.id === refId)?.label,
                      })
                      const present = new Set(entries.map((e) => e.kind))
                      // Only kinds that could actually land on this asset: settable here, not already
                      // on it, and with something to pick or a way to make one. An optgroup holding
                      // nothing is a dead end wearing a menu's clothes.
                      const addable = MADE_FROM_KINDS.filter(
                        (k) =>
                          settable(k) &&
                          !present.has(k) &&
                          (optsFor(k).length > 0 || (CREATABLE.has(k) && !!onCreateObject)),
                      )
                      return (
                        // The flex lives on a wrapper, never on the <td>: a table cell given another
                        // display value stops being a table cell, and every column past it shifts.
                        <div className="mf-wrap">
                          {entries.map((e) => {
                            const meta = OBJECT_META[e.kind]
                            const opts = optsFor(e.kind)
                            const name = e.label || `No ${meta.label.toLowerCase()} picked`
                            const face = (
                              <>
                                <span className="obj-ic" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                    {meta.icon}
                                  </svg>
                                </span>
                                <span className="mf-name">{name}</span>
                              </>
                            )
                            const title = e.primary
                              ? `${meta.label}: ${e.label || 'nothing picked yet'}`
                              : `Also reaching this asset: ${e.label}`
                            return (
                              <span
                                key={`${e.kind}:${e.cardId ?? e.refId ?? 'pin'}`}
                                className={`mf-chip${e.label ? '' : ' unset'}`}
                                style={{ ['--note-tone' as string]: meta.tone } as React.CSSProperties}
                              >
                                {/* Pressing the chip opens the card, which is the gesture the canvas
                                    already taught. Where nobody is listening for it — the workbench
                                    grid renders no inspector — it is plain text rather than a button
                                    that does nothing when pressed. */}
                                {onPickObject ? (
                                  <button
                                    type="button"
                                    className="mf-open"
                                    title={`${title} — open it`}
                                    onClick={(ev) => {
                                      ev.stopPropagation()
                                      onPickObject({ kind: e.kind, cardId: e.cardId, label: meta.label })
                                    }}
                                  >
                                    {face}
                                  </button>
                                ) : (
                                  <span className="mf-open" title={title}>
                                    {face}
                                  </span>
                                )}
                                {/* THE PICKER SETS THE KIND'S PRIMARY, so only the primary carries one.
                                    A second card of the same kind is listed and read-only: a caret on it
                                    would look like it set that card and would quietly set the other. */}
                                {e.primary && settable(e.kind) && (
                                  <span className="mf-swap">
                                    <select
                                      className="mf-pick"
                                      value={e.refId ?? ''}
                                      title={`Which ${meta.label.toLowerCase()} this asset is made from`}
                                      aria-label={`Which ${meta.label.toLowerCase()} this asset is made from`}
                                      onClick={(ev) => ev.stopPropagation()}
                                      onChange={(ev) => {
                                        if (ev.target.value === '__new__') {
                                          onCreateObject?.({ kind: e.kind, rowId: row.id })
                                          return
                                        }
                                        setRowRecord(row, e.kind, ev.target.value)
                                      }}
                                    >
                                      {/* Also how you take one off: choosing it writes no record, which
                                          drops the pin and hands the question back to the campaign. */}
                                      <option value="">Select {meta.label.toLowerCase()}</option>
                                      {/* A record reaching this row from a card that is not in the picker's
                                          list still has to be selectable, or opening the dropdown would
                                          silently change the answer. */}
                                      {e.refId && !opts.some((o) => o.id === e.refId) && (
                                        <option value={e.refId}>{e.label || 'Set on the canvas'}</option>
                                      )}
                                      {opts.map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.label}
                                        </option>
                                      ))}
                                      {CREATABLE.has(e.kind) && onCreateObject && (
                                        <option value="__new__">+ New {meta.label.toLowerCase()}…</option>
                                      )}
                                    </select>
                                  </span>
                                )}
                              </span>
                            )
                          })}
                          {/* THE ＋ OPENS THE DRAWER, it does not drop a menu.
                              A native menu over twelve kinds is a single scrolling list with no search
                              and no room to say what a record IS beyond its name, and on a real brand
                              it is hundreds of options long. The drawer is the surface the canvas
                              already uses to pick a record — searchable, grouped, ticking what the
                              asset already has — so this is one picker in two places rather than two
                              pickers. */}
                          {addable.length > 0 && (
                            <button
                              type="button"
                              className={`mf-add${entries.length ? ' compact' : ''}`}
                              title="Choose what this asset is made from"
                              aria-label="Choose what this asset is made from"
                              aria-haspopup="dialog"
                              onClick={(ev) => {
                                ev.stopPropagation()
                                setAddFor(row.id)
                                setAddQuery('')
                              }}
                            >
                              <span aria-hidden="true">＋</span>
                              {!entries.length && ' Add'}
                            </button>
                          )}
                          {!entries.length && !addable.length && <span className="cell-ro">—</span>}
                        </div>
                      )
                    })()}
                  </td>

                  {/**
                    * WHAT THIS ASSET SAYS, in one cell: a line per copy component it carries.
                    *
                    * The same move Made from just made beside it, for the same reason. It was a
                    * column per component — Title, Description, Primary text, Headline, CTA, Subject
                    * line, Pinned comment, whatever the formats in view declared between them — at
                    * 280px each, against 320px for the one column here. One channel's worth is three
                    * or four; a grid spanning several takes the union of all of them, and the schema
                    * declares 47 distinct components across its formats, so the count grows with
                    * every channel on screen while each row still fills three or four.
                    *
                    * The cost of a column is paid by every row whether or not that row has the
                    * component. A YouTube Short does not have a Subject line, so the Subject line
                    * column was a dash down the whole sheet wherever email was not — the per-format
                    * schema is exactly the thing a fixed grid of columns cannot express, and the
                    * sheet was spending its width to say "not applicable" over and over.
                    *
                    * One column, and each row lists its OWN components: the format decides what is
                    * in the cell, which is what the format was always for.
                    */}
                  {show('messaging') && (
                    <td
                      className={`msg-cell${onPickRow ? ' open' : ''}`}
                      /**
                       * THE COPY OPENS THE ASSET, on one click like the object cells beside it.
                       * These are the columns the sheet exists for and they were the only ones with
                       * nothing behind them: read-only text you could not fix a word of and could
                       * not ask to be written again.
                       *
                       * An EMPTY cell opens too, and says so. Nothing written is the state you most
                       * want to act on, and a cell that only responds once it already has something
                       * in it answers every row except the ones that need answering.
                       */
                      onClick={() => onPickRow?.(row.id)}
                    >
                      {(() => {
                        const declared = messagingFields(row.channel, row.assetType)
                        const map = messagingMap(row)
                        const filled = declared.filter((f) => (map[f.key] ?? '').trim())
                        const missing = declared.filter((f) => !(map[f.key] ?? '').trim())
                        if (!filled.length) {
                          return (
                            <span className="msg-empty" title={onPickRow ? 'Open the asset to write its copy.' : undefined}>
                              Add messaging…
                            </span>
                          )
                        }
                        return (
                          // The flex lives on a wrapper, never on the <td>, for the reason .mf-wrap
                          // gives: a table cell given another display value stops being a table cell
                          // and every column past it shifts.
                          <div className="msg-wrap">
                            {filled.map((f) => {
                              const copy = (map[f.key] ?? '').trim()
                              /* The component-level ICP flag, which the split columns carried on the
                                 whole cell and which had no style behind it — so a flagged component
                                 has been invisible here since the columns split. It rides the line it
                                 belongs to now, which is the only place it was ever specific enough
                                 to be worth showing. */
                              const isFlagged =
                                !!batchReview &&
                                batchReview.flags.some(
                                  (fl) => fl.rowId === row.id && fl.field?.key === f.key && !flagResolved(fl, row, pains),
                                )
                              return (
                                <div
                                  key={f.key}
                                  className={`msg-field${isFlagged ? ' flagged' : ''}`}
                                  title={
                                    onPickRow
                                      ? `${f.label}\n${copy}\n\nOpen the asset to edit this or write it again.`
                                      : `${f.label}\n${copy}`
                                  }
                                >
                                  <span className="msg-key">{f.label}</span>
                                  <span className="msg-val">{copy}</span>
                                </div>
                              )
                            })}
                            {/* WHAT THE FORMAT ASKED FOR AND DID NOT GET, named once at the end
                                rather than once per line. This is the finding the per-component
                                columns existed to make visible — a Short with no description is the
                                row you came here for — and dropping it was the real cost of
                                collapsing. A list rather than a line each because Made from settled
                                that argument for this sheet already: every extra line here is a row
                                taller across the whole table, and these are labels, not copy. */}
                            {missing.length > 0 && (
                              <div
                                className="msg-missing"
                                title={onPickRow ? 'Open the asset to write these.' : undefined}
                              >
                                Not written: {missing.map((f) => f.label).join(', ')}
                              </div>
                            )}
                          </div>
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

      {/**
        * THE ROW MENU. It wears the canvas's right-click menu — same frame, same items, same scrim —
        * because it IS the same gesture on the same records, and a second look for it would only be
        * two menus to keep in step.
        *
        * It names the asset above the command. The menu opens at the pointer, which by then is a
        * long way from the row's own name in a sheet this wide, and duplicating the wrong asset is
        * a mistake you only find later.
        */}
      {rowMenu && (() => {
        const row = view.find((r) => r.id === rowMenu.rowId)
        // Filtered out from under the menu (an edit elsewhere, a changed scope): nothing to act on.
        if (!row) return null
        const close = () => setRowMenu(null)
        // Held inside the viewport. Right-clicking near the right-hand edge of a sheet that is
        // wider than the screen is normal here, and a menu half off it cannot be read or clicked.
        const x = Math.min(rowMenu.x, Math.max(8, window.innerWidth - ROW_MENU_W - 8))
        const y = Math.min(rowMenu.y, Math.max(8, window.innerHeight - ROW_MENU_H - 8))
        return (
          <>
            <div
              className="flow-ctx-scrim flow-ctx-fixed"
              onMouseDown={close}
              onContextMenu={(e) => {
                e.preventDefault()
                close()
              }}
            />
            <div className="flow-ctx flow-ctx-fixed" style={{ left: x, top: y }} role="menu">
              <div className="flow-ctx-hint">{row.assetName || 'Untitled asset'}</div>
              <button
                className="flow-ctx-item"
                role="menuitem"
                onClick={() => {
                  close()
                  void duplicateRow(row.id)
                }}
              >
                Duplicate onto another channel
              </button>
            </div>
          </>
        )
      })()}

      {/**
        * WHAT THIS ASSET IS MADE FROM, and what else it could be, in the drawer the canvas already
        * slides out to pick with.
        *
        * The ＋ used to drop a native menu of every record under every kind. That is a single
        * scrolling list with no search, no room to say what an object IS beyond its name, and on a
        * real brand it is hundreds of lines long. This borrows the record drawer's frame and the
        * canvas's own object row — the kind in its own hue, the name, and the one line the object
        * carries — so an object looks the same wherever you meet it.
        *
        * Two sections, in the order the question is asked. What is on the asset now, including the
        * cards wired to it holding nothing, because a connected empty card is the finding. Then what
        * you could add, which is every object not already on it.
        *
        * It stays open after a pick: assets are made from several things, and closing it is the
        * gesture that says you are done.
        */}
      {addFor && (() => {
        const row = view.find((r) => r.id === addFor)
        if (!row) return null
        const q = addQuery.trim().toLowerCase()
        const entries = madeFrom({
          kinds: MADE_FROM_KINDS,
          cards: cardsByRow.get(row.id) ?? [],
          references: row.references,
          brandRefId: brandObjects.find((b) => b.name === (row.client ?? ''))?.id,
          nameOf: (kind, refId) => optsFor(kind).find((o) => o.id === refId)?.label,
        })
        const on = new Set(entries.filter((e) => e.refId).map((e) => `${e.kind}:${e.refId}`))
        /**
         * One row, in the shape the canvas states an object in: mark and kind in the object's own
         * hue, its name, and the line under it saying what it contributes. `sub` is deliberately
         * "Contributes nothing yet" when there is nothing behind it — the same words the canvas uses
         * for the same state, because it is the same state.
         */
        const objRow = (o: {
          key: string
          kind: CanvasObjectKind
          name: string
          sub?: string
          empty?: boolean
          onOpen?: () => void
          onOff?: () => void
          title: string
        }) => {
          const meta = OBJECT_META[o.kind]
          return (
            <div key={o.key} className="flow-ctxrow mf-objrow">
              <button className="flow-ctxrow-open" title={o.title} onClick={o.onOpen}>
                <span className="flow-ctxrow-ic" style={{ color: meta.tone }} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {meta.icon}
                  </svg>
                </span>
                <span className="flow-ctxrow-txt">
                  <span className="flow-ctxrow-kind" style={{ color: meta.tone }}>{meta.label}</span>
                  <span className="flow-ctxrow-name">{o.empty ? <em>{o.name}</em> : o.name}</span>
                  {o.sub && <span className="flow-ctxrow-sub">{o.sub}</span>}
                </span>
              </button>
              {o.onOff && (
                <button
                  className="flow-ctxrow-del"
                  title="Take this off the asset"
                  aria-label={`Take ${o.name} off this asset`}
                  onClick={o.onOff}
                >
                  ✕
                </button>
              )}
            </div>
          )
        }
        // Everything not already on the asset, in registry order. Each row says its own kind, so
        // there are no group headings above them to say it a second time.
        const addable = MADE_FROM_KINDS.filter(settable).flatMap((kind) =>
          optsFor(kind)
            .filter(
              (o) =>
                !on.has(`${kind}:${o.id}`) &&
                (!q || o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q)),
            )
            .map((o) => ({ kind, id: o.id, label: o.label, detail: o.detail })),
        )
        /**
         * Making one, kept to the foot rather than sitting beside the kind it makes.
         *
         * Ten kinds can be made, so inline they were ten actions dealt through the objects — "New
         * brand…", one product, "New product…", "New audience…" — and the list stopped reading as a
         * list of things and started reading as a menu. Down here they are one row of the same
         * shape, and on a fresh brand with nothing in the library they are the whole drawer, which
         * is exactly right: there is nothing to pick and everything to make.
         *
         * Absent while searching: with a query on screen, "New voice…" reads as a result.
         */
        const makeable = q || !onCreateObject ? [] : MADE_FROM_KINDS.filter((k) => settable(k) && CREATABLE.has(k))
        return (
          <>
            <div className="flow-recdrawer-scrim" onClick={() => setAddFor(null)} />
            <aside className="flow-recdrawer" role="dialog" aria-label={`What ${row.assetName} is made from`}>
              <header className="flow-recdrawer-head">
                <span className="flow-recdrawer-title">Made from · {row.assetName}</span>
                <button className="flow-recdrawer-x" onClick={() => setAddFor(null)} aria-label="Close">
                  ✕
                </button>
              </header>
              <input
                className="flow-recdrawer-search"
                placeholder="Search objects…"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                autoFocus
              />
              <div className="flow-recdrawer-list mf-objlist">
                {/* Hidden while searching: a search is a question about what to add, and the answer
                    to it is below rather than up here. */}
                {!q && !!entries.length && (
                  <>
                    <div className="mf-objsec">On this asset</div>
                    {entries.map((e) =>
                      objRow({
                        key: `on:${e.kind}:${e.cardId ?? e.refId}`,
                        kind: e.kind,
                        name: e.label || 'Nothing picked yet',
                        empty: !e.label,
                        sub: e.label
                          ? optsFor(e.kind).find((o) => o.id === e.refId)?.detail ||
                            (e.kind === 'brand' ? 'Sets the brand this is written as' : undefined)
                          : 'Contributes nothing yet',
                        title: onPickObject ? `Open this ${OBJECT_META[e.kind].label.toLowerCase()}` : OBJECT_META[e.kind].label,
                        onOpen: onPickObject
                          ? () => onPickObject({ kind: e.kind, cardId: e.cardId, label: OBJECT_META[e.kind].label })
                          : undefined,
                        // Brand is the campaign's owner rather than something pinned on the asset, so
                        // there is nothing here to take off it — unbinding a campaign's brand is a
                        // decision for the Brand card, not for one of its thirty assets.
                        onOff:
                          e.primary && e.kind !== 'brand' && settable(e.kind)
                            ? () => setRowRecord(row, e.kind, '')
                            : undefined,
                      }),
                    )}
                  </>
                )}
                {(!!addable.length || !makeable.length) && (
                  <div className="mf-objsec">{q ? 'Objects' : 'Add an object'}</div>
                )}
                {!addable.length && !makeable.length && <div className="flow-recdrawer-empty">No objects match.</div>}
                {addable.map((a) =>
                  objRow({
                    key: `add:${a.kind}:${a.id}`,
                    kind: a.kind,
                    name: a.label,
                    sub: a.detail,
                    title: `Make this asset from ${a.label}`,
                    onOpen: () => setRowRecord(row, a.kind, a.id, a.label),
                  }),
                )}
                {!!makeable.length && <div className="mf-objsec">Make a new object</div>}
                {makeable.map((kind) =>
                  objRow({
                    key: `new:${kind}`,
                    kind,
                    name: `New ${OBJECT_META[kind].label.toLowerCase()}…`,
                    empty: true,
                    sub: 'Adds the card to this asset and opens its form',
                    title: `Make a ${OBJECT_META[kind].label.toLowerCase()} for this asset`,
                    onOpen: () => {
                      setAddFor(null)
                      onCreateObject?.({ kind, rowId: row.id })
                    },
                  }),
                )}
              </div>
            </aside>
          </>
        )
      })()}
    </div>
  )
}

// Load-sample handler reads the store lazily so the empty-state button works.
function loadSampleHint() {
  void useTrafficStore.getState().loadSample()
}
