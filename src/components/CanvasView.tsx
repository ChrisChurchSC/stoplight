import { useEffect, useMemo, useRef, useState } from 'react'
import { applyBreakStatus, breakScopeKey, coherenceContentHash, resolveBreaks, type CoherenceBreak } from '../domain/breaks'
import { CHANNELS } from '../domain/channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from '../domain/funnel'
import { GTM_STRATEGIES, playbookStages, canonToPhase, phaseToCanon } from '../domain/strategies'
import { playbookFunnel, makeChannelPhase, firstPhaseForCanon } from '../domain/playbookFunnel'
import { splitByKind } from '../domain/assetKind'
import { audienceProfile, proofProfile, profileLabel } from '../domain/assetProfile'
import { ctaFor } from '../domain/matrix'
import { assetHref } from '../domain/assetLink'
import {
  branchSuggestions,
  composeBranchAsset,
  composeCellAsset,
  stageSuggestions,
  type BranchSuggestion,
} from '../domain/branchSuggest'
import { journeyPerformance, formatReach } from '../domain/journeyPerf'
import { assetCta, isCtaField, messagingFields, messagingMap, messagingSummary, primaryFieldKey } from '../domain/messaging'
import { composeMessaging } from '../domain/matrixDraft'
import { assetRtbIds, isApprovedProof, newRtb, rtbById, rtbsForCampaign, type Rtb } from '../domain/rtb'
import { inTimeRange } from '../domain/timeRange'
import { CTA_NONE, rowInScope } from '../lib/scope'
import { usePresence, type Peer } from '../lib/usePresence'
import { useTrafficStore } from '../store/useTrafficStore'
import type { ChannelId, TrafficRow } from '../domain/types'
import { typesFor } from '../domain/channelAssetTypes'
import { ChannelIcon } from './ChannelIcon'

/**
 * The campaign canvas — a structured, zoomable map that makes connection the
 * native visual language. An enforced hierarchy (strategy → audiences →
 * messages) the auto-layout owns, laid over funnel-stage bands, with coherence
 * flags in place. Nodes can be nudged by hand and the connections follow.
 */

const NODE_W = 260
// Audience ("segment") cards are the persona headers each lane hangs off — sized
// up so the segment reads as the anchor of its whole journey, not a small chip.
const AUD_W = 440
const AUD_H = 168
const MSG_W = 500
const MSG_H = 132
const MSG_GAP = 64
// Extra vertical gap between TIERS of the same funnel stage (a card and its
// same-stage child), so a same-stage fork drops down instead of running flat.
const TIER_GAP = 220
// The click-to-add ghost cell that sits at the bottom of every (audience × stage)
// cell, so you can place a card straight onto the canvas.
const ADD_H = 38
const COL_GAP = 80
const BAND_PAD = 220
// How far the first/last funnel band overshoot the top/bottom of the viewport (in
// screen px) so the stripes always fill the whole canvas regardless of pan/zoom.
const BAND_OVERFLOW = 4000
// Zoom past this and message cards reveal their full messaging breakdown (every
// component), not just the one-line summary — read everything without leaving the map.
const DETAIL_ZOOM = 1.15
// Breathing room below the last row in a band.
const BAND_BOTTOM_PAD = 120
// The spine — Brand → Subject → Strategy → Audience — stacks compactly down the top
// of the canvas as labelled CARDS (each carries its own tag), not full-width bands;
// only the funnel stages below get labelled lane-bands (where a card's row encodes
// its stage). These Y's stack the spine tightly so the funnel starts high.
const BRAND_Y = 20
// The Frame card folds Subject + Strategy into one two-row card just below the
// Brand pill; the audience lanes + funnel follow.
const FRAME_Y = 72
const FRAME_H = 150
const AUD_Y = 250
const MSG_Y = 450

interface Node {
  id: string
  kind: 'root' | 'brand' | 'frame' | 'audience' | 'message' | 'add'
  x: number
  y: number
  w: number
  h: number
  label: string
  sub?: string
  row?: TrafficRow
  brk?: CoherenceBreak
  flaggedCount?: number
  /** The 'frame' card folds Subject + Strategy into one two-row card (each row keeps
   *  its own swap control). */
  frame?: { subjectText: string; subjectSub?: string; strategyName: string; strategySub?: string }
  /** For 'add' ghost cells: which lane + funnel stage a new card would land in,
   *  and whether the cell is currently empty (so it reads as the obvious next move). */
  addAudience?: string
  addStage?: FunnelStage
  addEmpty?: boolean
}
interface Edge {
  x1: number
  y1: number
  x2: number
  y2: number
  broken: boolean
  /** strategy = the backbone (root→audience); message = an audience→asset
   *  messaging connection, whose colour shows whether that copy coheres;
   *  journey = a branch from one asset to its next step (the funnel path). */
  kind: 'strategy' | 'message' | 'journey'
  /** For a journey edge: the child row whose `branchOf` makes this link. Selecting
   *  the line targets this row; deleting the line clears its `branchOf`. */
  childRowId?: string
}
interface Band {
  /** Unique band id (the playbook phase index), used for React keys + drag
   *  targeting so two bands that share a canonical representative stay distinct. */
  key: string
  /** The canonical funnel stage this band best represents — what a card's
   *  `funnelStage` is set to when restaged into this band. */
  stage: FunnelStage
  /** The band's display label — the playbook's own stage name (e.g. "Engage"). */
  label: string
  y: number
  h: number
}

export function CanvasView({ liveScope = false }: { liveScope?: boolean } = {}) {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const proofFilter = useTrafficStore((s) => s.proofFilter)
  const ctaFilter = useTrafficStore((s) => s.ctaFilter)
  const audienceFilter = useTrafficStore((s) => s.audienceFilter)
  const cardFilter = useTrafficStore((s) => s.cardFilter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const setCampaignStrategy = useTrafficStore((s) => s.setCampaignStrategy)
  const setCampaignSubject = useTrafficStore((s) => s.setCampaignSubject)
  const setCampaignClient = useTrafficStore((s) => s.setCampaignClient)
  const duplicateCampaign = useTrafficStore((s) => s.duplicateCampaign)
  const swapCampaignAudience = useTrafficStore((s) => s.swapCampaignAudience)
  const clearRecheckFlag = useTrafficStore((s) => s.clearRecheckFlag)
  const clientList = useTrafficStore((s) => s.clientList)
  const redraftAssets = useTrafficStore((s) => s.redraftAssets)
  const regenIds = useTrafficStore((s) => s.regenIds)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  // The campaign's brand owns its messaging system — read that brand's subjects for
  // the reuse menu (not whatever the Messaging page happens to be viewing).
  const brandLibrary = useTrafficStore((s) => s.brandSystems[clientFilter])
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const claudeBreaks = useTrafficStore((s) => s.claudeBreaks)
  const claudeBreaksScope = useTrafficStore((s) => s.claudeBreaksScope)
  const coherenceCheckedHash = useTrafficStore((s) => s.coherenceCheckedHash)
  const coherenceChecking = useTrafficStore((s) => s.coherenceChecking)
  const coherenceUnavailable = useTrafficStore((s) => s.coherenceUnavailable)
  const runCoherenceCheck = useTrafficStore((s) => s.runCoherenceCheck)
  const openBreaksQueue = useTrafficStore((s) => s.openBreaks)
  const openReview = useTrafficStore((s) => s.openReview)
  const updateRow = useTrafficStore((s) => s.updateRow)
  const updateRows = useTrafficStore((s) => s.updateRows)
  const pasteAsset = useTrafficStore((s) => s.pasteAsset)
  const undo = useTrafficStore((s) => s.undo)
  const draftMatrixCell = useTrafficStore((s) => s.draftMatrixCell)
  const setPersonalizeOpen = useTrafficStore((s) => s.setPersonalizeOpen)
  const canvases = useTrafficStore((s) => s.canvases)
  const artboards = useTrafficStore((s) => s.artboards)
  const addArtboard = useTrafficStore((s) => s.addArtboard)
  const renameArtboard = useTrafficStore((s) => s.renameArtboard)
  const deleteArtboard = useTrafficStore((s) => s.deleteArtboard)
  const activeCanvasMap = useTrafficStore((s) => s.activeCanvas)
  // Inbound messages ingested back from every channel, keyed by asset id. Surfaced
  // on a card once you zoom in, alongside the outbound copy, so the map shows the
  // whole conversation per asset (what we said + what came back).
  const comments = useTrafficStore((s) => s.comments)
  const timeRange = useTrafficStore((s) => s.timeRange)
  const rangeNow = Date.now()

  // Multiple canvases: the active board scopes which audiences this canvas shows.
  // 'all' is the implicit board (every audience).
  const canvasScopeKey = `${clientFilter}|${campaignFilter}`
  const boards = canvases.filter((c) => c.client === clientFilter && c.campaign === campaignFilter)
  const activeCanvasId = activeCanvasMap[canvasScopeKey] ?? 'all'
  const activeBoard = boards.find((c) => c.id === activeCanvasId)
  // A custom board starts blank and shows ONLY the audiences you add to it; the
  // implicit "All" board shows everything.
  const isCustomBoard = !!activeBoard
  const scopeAudiences = activeBoard?.audiences ?? []
  const scopeKeyDep = `${isCustomBoard ? 'c' : 'all'}:${scopeAudiences.join('|')}`

  // "Branch this card" menu — anchored at the click point (screen space). It stays
  // open so you can fan out several forks at once; branchAdded marks the ones made.
  const [branchMenu, setBranchMenu] = useState<{ row: TrafficRow; x: number; y: number } | null>(null)
  const [branchAdded, setBranchAdded] = useState<Set<string>>(new Set())
  // Pill swap menu: click a proof / CTA pill to switch it. Swapping the proof
  // re-drafts the copy around the new claim; swapping the CTA re-sets the CTA slots.
  const [pillMenu, setPillMenu] = useState<{ row: TrafficRow; kind: 'proof' | 'cta'; x: number; y: number } | null>(null)
  // The re-check flag popover: a produced/linked asset that fell off its proof
  // after a frame change. We can't auto-fix produced media, so this routes the fix
  // OUTSIDE the tool ("fix where it lives") or lets you clear the flag once handled.
  const [recheckMenu, setRecheckMenu] = useState<{ row: TrafficRow; x: number; y: number } | null>(null)
  // "Add a card here" menu — opens when you click an empty funnel cell (audience
  // lane × stage), to pick the channel that carries the new asset.
  // The add-asset flow: pick the funnel part → channel → asset type. `stage` and
  // `channel` fill in as you advance; the empty-lane seed pre-sets `stage`.
  const [addMenu, setAddMenu] = useState<{ audience: string; x: number; y: number; stage?: FunnelStage; channel?: ChannelId } | null>(null)
  // The Strategy card is a playbook selector — click it to pick a GTM motion
  // (ABM, Demand Gen, etc.) and link it to this campaign.
  const [stratMenu, setStratMenu] = useState<{ campaign: string; current: string; x: number; y: number } | null>(null)
  // Swap a spine card's value (Brand / Subject / Audience) — interchangeable like
  // the Strategy playbook picker. `audience` is the lane being swapped.
  const [frameMenu, setFrameMenu] = useState<{ kind: 'brand' | 'subject' | 'audience'; x: number; y: number; audience?: string } | null>(null)
  // A pending high-blast-radius frame change (strategy / brand / audience swap)
  // awaiting confirmation. It re-checks everything built on it, so we preview the
  // consequence (how many assets, editable-vs-produced split) before committing —
  // confirm, don't surprise. `apply` performs the change once confirmed.
  const [frameChange, setFrameChange] = useState<{
    title: string
    campaign: string
    total: number
    editable: number
    linked: number
    /** The re-check result: how many assets may no longer hold under the new frame
     *  (their attached proof doesn't carry). Directional — labeled "may". */
    mismatch: number
    /** Apply the change to a campaign (the original, or a clone when branching). */
    apply: (campaign: string) => void
    x: number
    y: number
  } | null>(null)
  // Build a consequence preview for a set of affected rows + a campaign-targeted
  // apply (so it can run on the original or a duplicated variant). `holdsUnder`
  // re-checks each asset against the NEW frame — an asset whose proof won't carry
  // "may no longer hold". Omit it for changes that don't move proof (strategy is
  // structural — the funnel reshapes but the claims still stand).
  const previewFrameChange = (
    title: string,
    campaign: string,
    affected: TrafficRow[],
    apply: (campaign: string) => void,
    x: number,
    y: number,
    holdsUnder?: (r: TrafficRow) => boolean,
  ) => {
    const { editable, linked } = splitByKind(affected)
    const mismatch = holdsUnder ? affected.filter((r) => !holdsUnder(r)).length : 0
    setFrameChange({ title, campaign, total: affected.length, editable: editable.length, linked: linked.length, mismatch, apply, x, y })
  }
  const [branching, setBranching] = useState(false)
  const branchSeq = useRef(0)
  // Performance overlay: reach + per-fork flow on the journey, rolled up to the
  // plan. Toggled from the channel bar's Performance button (lives in the store).
  const perfMode = useTrafficStore((s) => s.perfMode)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Hand-nudged node positions (id → absolute world position); the engine owns
  // the rest of the layout and the connections re-route to whatever you move.
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({})
  // Start panned clear of the full-height channels panel (≈232px) so content
  // isn't hidden behind it on entry.
  const [vp, setVp] = useState({ tx: 260, ty: 40, s: 0.7 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const drag = useRef<{ id: string; sx: number; sy: number; mx: number; my: number; far: boolean } | null>(null)
  const suppressClick = useRef(false)
  // The "write a new CTA" / "write a new proof" inputs inside the pill menus.
  const ctaInputRef = useRef<HTMLInputElement>(null)
  const proofInputRef = useRef<HTMLInputElement>(null)
  const subjectInputRef = useRef<HTMLInputElement>(null)
  // Where the pointer went down, to tell a click on the canvas (start a new asset)
  // from a pan (move the view).
  const downAt = useRef<{ x: number; y: number } | null>(null)
  // Artboard tool: when on, a drag on empty canvas draws a framing rectangle (in
  // world coords) instead of panning. `draw` holds the drag origin; `drawRect` is
  // the live rubber-band the canvas renders while you draw.
  const [artboardMode, setArtboardMode] = useState(false)
  const draw = useRef<{ x0: number; y0: number } | null>(null)
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // Selected card (a single click selects; drives the highlight + copy/paste).
  const [selected, setSelected] = useState<string | null>(null)
  // Selected journey connector (a child row id) — click a line to select, then ✕ or
  // Delete/Backspace to remove it (clears that card's branchOf, unlinking the step).
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const clipboard = useRef<string | null>(null)
  // Canvas keyboard shortcuts: Cmd/Ctrl+Z undo · Cmd/Ctrl+C copy the selected card
  // · Cmd/Ctrl+V paste a copy. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        void undo()
      } else if (k === 'c' && selected) {
        e.preventDefault()
        clipboard.current = selected
      } else if (k === 'v' && clipboard.current) {
        e.preventDefault()
        void pasteAsset(clipboard.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, undo, pasteAsset])
  // A selected connector: Delete/Backspace removes it (clears the child's branchOf);
  // Escape deselects. Ignored while typing in a field.
  useEffect(() => {
    if (!selectedEdge) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        void updateRow(selectedEdge, { branchOf: undefined })
        setSelectedEdge(null)
      } else if (e.key === 'Escape') {
        setSelectedEdge(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedEdge, updateRow])
  // Escape cancels the artboard tool (and any in-progress draw).
  useEffect(() => {
    if (!artboardMode) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        draw.current = null
        setDrawRect(null)
        setArtboardMode(false)
      }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [artboardMode])
  // Drag-to-connect: pulling a connector out of a card's edge handle. `connect`
  // holds the source while dragging; `connectLine` (world coords) draws the
  // rubber-band line; `lastScreen` is the cursor at drop, for hit-testing.
  const connect = useRef<{ fromId: string; fromX: number; fromY: number } | null>(null)
  const lastScreen = useRef({ x: 0, y: 0 })
  const [connectLine, setConnectLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // While dragging a card over a different funnel band, the stage it would move to
  // (drives the band highlight + the "→ Stage" cue). Cleared on drop.
  // The band currently highlighted as a restage target (by band key), or null.
  const [dragStage, setDragStage] = useState<string | null>(null)
  // A pending restage awaiting confirmation — moving a card to a new stage can
  // re-draft a whole thread, so we confirm before applying the batch.
  const [restageConfirm, setRestageConfirm] = useState<{
    updates: { id: string; patch: Partial<TrafficRow> }[]
    rowId: string
    fromStage: FunnelStage
    toStage: FunnelStage
    /** The target band's display label (the playbook stage name). */
    toLabel: string
    count: number
    x: number
    y: number
  } | null>(null)

  const scoped = rows.filter(
    (r) =>
      rowInScope(r, { filter, proofFilter, ctaFilter, audienceFilter, cardFilter, query, clientFilter, campaignFilter, liveOnly: liveScope }) &&
      inTimeRange(r, timeRange, rangeNow),
  )
  // Continuous check: a content fingerprint of the whole campaign (not the filtered
  // view, matching the check's scope). When it changes (an edit, draft, or branch),
  // any cached Claude result is stale, so we fall back to the live heuristic
  // immediately and re-run the deeper check on a debounce.
  const checkScoped = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }),
  )
  const contentHash = coherenceContentHash(checkScoped)
  const claudeFresh =
    claudeBreaksScope === breakScopeKey(clientFilter, campaignFilter) && coherenceCheckedHash === contentHash
      ? claudeBreaks
      : null
  const breaks = applyBreakStatus(
    resolveBreaks(scoped, claudeFresh, claudeBreaksScope, breakScopeKey(clientFilter, campaignFilter)),
    breakStatus,
  ).filter((b) => b.status === 'open')
  const breakFor = (r: TrafficRow) =>
    breaks.find(
      (b) =>
        (b.from.assetName === r.assetName && b.from.channel === r.channel) ||
        (b.to?.assetName === r.assetName && b.to?.channel === r.channel),
    )

  // Continuous coherence: when the copy settles after an edit/draft/branch, re-run
  // the deeper check on a debounce. Content-hashed so it never re-spends on
  // unchanged content; pauses if Claude is unavailable (the live heuristic carries).
  useEffect(() => {
    if (clientFilter === 'all' || campaignFilter === 'all' || checkScoped.length === 0) return
    if (coherenceChecking || coherenceUnavailable || coherenceCheckedHash === contentHash) return
    const t = setTimeout(() => runCoherenceCheck(), 1200)
    return () => clearTimeout(t)
  }, [
    contentHash,
    coherenceCheckedHash,
    coherenceChecking,
    coherenceUnavailable,
    clientFilter,
    campaignFilter,
    checkScoped.length,
    runCoherenceCheck,
  ])

  // Reveal the full per-component copy once the user has zoomed in to read. Drives
  // both what each card renders and how much vertical room the layout reserves.
  const detail = vp.s >= DETAIL_ZOOM

  const { nodes, edges, bands, audienceSlabs, campaignName, strategyName, bounds } = useMemo(() => {
    const client = clientFilter !== 'all' ? clientFilter : ''
    // A freshly-created canvas has no rows yet, so fall back to the scoped campaign
    // so its spine + lanes still render (and it's addable) before the first asset.
    const campaignNames = scoped.length
      ? [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))]
      : campaignFilter !== 'all'
        ? [campaignFilter]
        : []
    const campObj = campaignList.find((c) => campaignNames.includes(c.name))
    const strat = campObj?.strategy ?? 'Campaign'
    const subjectText = campObj?.subject?.trim() || campaignNames[0] || 'This campaign'
    const objective = campObj?.objective?.trim() || ''
    const rootLabel = client || (campaignNames[0] ?? 'Campaign')
    // The strategy is one of the GTM marketing plans we've already authored —
    // resolve the campaign's strategy to its plan so the card shows the real plan
    // (its stage flow), not just a loose label.
    const stratKey = (campObj?.strategy ?? '').trim().toLowerCase()
    const stratPlan = GTM_STRATEGIES.find(
      (s) => s.key === stratKey || s.name.toLowerCase() === strat.trim().toLowerCase(),
    )
    const strategySub = stratPlan
      ? `Plan · ${stratPlan.sequence}`
      : objective || 'Set a strategy from a marketing plan'
    // The funnel bands take the linked playbook's own sequence (ABM → Engage,
    // Convert; Demand Gen → Visitor … Closed). An authored playbook maps each
    // channel precisely onto its named stages (a lead magnet lands in "Lead",
    // not skipped); without one, channels project proportionally onto the parsed
    // sequence, and with no playbook at all this is the generic 4-stage funnel.
    const stageDefs = stratPlan ? playbookFunnel(stratPlan.key) : null
    const phaseLabels = stageDefs
      ? stageDefs.map((s) => s.label)
      : stratPlan
        ? playbookStages(stratPlan.sequence)
        : FUNNEL_STAGES.map((s) => s.label)
    const nPhases = Math.max(1, phaseLabels.length)
    const nCanon = FUNNEL_STAGES.length
    const channelPhase = stageDefs ? makeChannelPhase(stageDefs) : null

    // Group by the brand's DEFINED audiences (the Foundation's set), not the raw
    // per-row audience strings — ingestion can sprawl those into dozens of one-off
    // labels, but the defined set is the truth. Each row buckets into the closest
    // defined audience; the columns are always the defined audiences (seeded, so an
    // audience with no content still shows as a column = a coverage gap).
    const allDefined =
      clientFilter !== 'all' ? (clientAudiences[clientFilter] ?? []).map((a) => a.name).filter(Boolean) : []
    // A custom board shows only the audiences added to it (empty = blank, a fresh
    // start); the "All" board shows every defined audience.
    const defined = isCustomBoard ? allDefined.filter((n) => scopeAudiences.includes(n)) : allDefined
    const byAud = new Map<string, TrafficRow[]>()
    for (const name of defined) byAud.set(name, [])
    for (const r of scoped) {
      // Bucket against ALL audiences, then drop rows outside a custom board's scope
      // (a blank board has none, so it shows nothing until you add audiences).
      const a = toDefinedAudience((r.audience ?? '').trim(), allDefined.length ? allDefined : defined)
      if (isCustomBoard && !scopeAudiences.includes(a)) continue
      ;(byAud.get(a) ?? byAud.set(a, []).get(a)!).push(r)
    }
    const audiences = [...byAud.entries()].sort((a, b) => b[1].length - a[1].length)

    const ns: Node[] = []
    const et: { fromId: string; toId: string; broken: boolean; kind: 'strategy' | 'message' | 'journey' }[] = []
    // Apply any hand-nudge to a node's auto position.
    const at = (id: string, x: number, y: number) => ({ x: moved[id]?.x ?? x, y: moved[id]?.y ?? y })

    const colW = Math.max(NODE_W, MSG_W)

    // Funnel-stage bands: each message drops into the band for its journey stage.
    // When zoomed in (detail), cards expand to their full copy, so a card's height
    // varies; each column stacks by real height and the bands grow to fit so the
    // copy never overlaps. Columns sit at distinct X, so only within-column
    // stacking matters.
    const stageIdx: Record<string, number> = {}
    FUNNEL_STAGES.forEach((st, i) => (stageIdx[st.stage] = i))
    const stageOf = (r: TrafficRow) => stageIdx[funnelStageFor(r.channel, r.assetType)] ?? 0
    // Estimated rendered height of a card. Slightly generous so the reserved row is
    // never shorter than the real (min-height) card — that would let copy overlap.
    const cardHeight = (r: TrafficRow) => {
      // Every card shows the same rows (all messaging components + a CTA + the
      // proof point); zoomed out the values are clamped to 2 lines, zoomed in
      // they're shown in full and inbound replies are appended.
      const fields = cardRows(r)
      const inbound = detail ? comments[r.id] ?? [] : []
      if (!fields.length && !inbound.length) return MSG_H
      // Pixel constants track the message-card type scale in index.css (label 18,
      // value 15 / line-height 1.4 ≈ 21, key+gap ≈ 17, padding 14 top+bottom = 28).
      // Rounded up so the reserve never falls short of the rendered card.
      let h = 28 + 24 + 6 // padding + label line + breakdown margin
      fields.forEach((f, idx) => {
        if (idx) h += 8 // gap between components
        h += 17 // component label + gap
        const lines = Math.max(1, Math.ceil(f.value.length / 34))
        h += (detail ? lines : Math.min(2, lines)) * 21 // collapsed clamps to 2 lines
      })
      if (inbound.length) {
        h += 20 // inbound header
        inbound.forEach((c) => {
          h += 16 // author line
          h += Math.max(1, Math.ceil(c.text.length / 28)) * 16 // wrapped reply lines
          h += 7 // gap between messages
        })
      }
      return Math.max(MSG_H, Math.round(h + 8))
    }

    const INNER_GAP = 40 // horizontal gap between sibling cards inside an audience slab
    const laneW = MSG_W + INNER_GAP

    // ---- Per-audience layout ----
    // A journey with real branches fans out as a tree: each fork spreads its
    // children across horizontal lanes so the branching is visible. A lane with no
    // branches keeps the simple vertical stack. Y is always the funnel stage band.
    interface Placed {
      row: TrafficRow
      stage: number
      laneX: number
      h: number
      /** Y within the card's funnel-stage band (before BAND_PAD / bandTop). A
       *  same-stage child sits a full TIER_GAP below its parent; siblings sharing
       *  a lane stack by MSG_GAP. Drives both band sizing and final placement. */
      relY: number
    }
    const laid = audiences.map(([name, msgs]) => {
      const byName = new Map<string, TrafficRow>()
      for (const r of msgs) if (!byName.has(r.assetName)) byName.set(r.assetName, r)
      const parentOf = (r: TrafficRow) =>
        r.branchOf && byName.has(r.branchOf) && r.branchOf !== r.assetName ? r.branchOf : null
      const hasBranches = msgs.some((r) => parentOf(r) !== null)
      // The visible band (playbook phase) a card lands in. A journey only flows
      // FORWARD, so a card never lands in an earlier band than its parent —
      // without this, a card whose channel maps earlier than its parent's (e.g. a
      // nurture email branched off a conversion page) jumps back up and collides
      // with its own ancestors. Base band comes from the playbook's channel map
      // (proportional projection when no playbook is linked); a drag-placed
      // `funnelStage` override pins it to that canon's first stage. Clamp to
      // max(base, parent's band).
      const effPhaseCache = new Map<string, number>()
      const phaseOf = (r: TrafficRow): number => {
        const cached = effPhaseCache.get(r.id)
        if (cached !== undefined) return cached
        // An explicit drag-placed stage wins outright — the user put it there.
        if (r.funnelStage) {
          const o = stageDefs
            ? firstPhaseForCanon(stageDefs, r.funnelStage)
            : canonToPhase(stageIdx[r.funnelStage] ?? 0, nCanon, nPhases)
          effPhaseCache.set(r.id, o)
          return o
        }
        const base = channelPhase
          ? channelPhase(r.channel, r.assetType)
          : canonToPhase(stageOf(r), nCanon, nPhases)
        effPhaseCache.set(r.id, base) // tentative, breaks any branchOf cycle
        const pn = parentOf(r)
        const parent = pn ? byName.get(pn) : undefined
        const v = parent && parent.id !== r.id ? Math.max(base, phaseOf(parent)) : base
        effPhaseCache.set(r.id, v)
        return v
      }
      const ord = (a: TrafficRow, b: TrafficRow) =>
        stageOf(a) - stageOf(b) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.assetName.localeCompare(b.assetName)
      let placed: Placed[]
      let lanes: number
      if (!hasBranches) {
        // No journey links — keep the simple single-column vertical stack.
        placed = msgs.map((r) => ({ row: r, stage: phaseOf(r), laneX: 0, h: cardHeight(r), relY: 0 }))
        lanes = 1
      } else {
        // Tidy-tree lanes: each leaf takes the next lane; a parent centres over its
        // children. Children that change stage drop into the next band; same-stage
        // forks spread sideways in the same band.
        const childrenOf = new Map<string, TrafficRow[]>()
        const roots: TrafficRow[] = []
        for (const r of msgs) {
          const p = parentOf(r)
          if (p) (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(r)
          else roots.push(r)
        }
        roots.sort(ord)
        let leaf = 0
        const laneOf = new Map<string, number>()
        // `assigning` is the recursion stack — if we re-enter a node mid-recursion
        // the branchOf links form a cycle, so we break it by treating the node as a
        // leaf instead of recursing forever.
        const assigning = new Set<string>()
        const assign = (r: TrafficRow): number => {
          if (assigning.has(r.id)) {
            const l = leaf
            leaf += 1
            laneOf.set(r.id, l)
            return l
          }
          assigning.add(r.id)
          const kids = (childrenOf.get(r.assetName) ?? []).slice().sort(ord)
          let lane: number
          if (!kids.length) {
            lane = leaf
            leaf += 1
          } else {
            const ls = kids.map(assign)
            lane = ls.reduce((s, x) => s + x, 0) / ls.length
          }
          laneOf.set(r.id, lane)
          assigning.delete(r.id)
          return lane
        }
        for (const r of roots) assign(r)
        lanes = Math.max(1, leaf)
        placed = msgs.map((r) => ({ row: r, stage: phaseOf(r), laneX: (laneOf.get(r.id) ?? 0) * laneW, h: cardHeight(r), relY: 0 }))
      }
      // In-band Y (relY): place each card relative to the top of its funnel band.
      // A same-stage child drops a full TIER_GAP below its parent so the fork
      // reads as a downward step, not a flat sideways line. Cards that happen to
      // share a lane stack by MSG_GAP. Process parents before same-stage children
      // (tier index ascending) so a parent's relY is known when its child lands.
      const tierIndex = (r: TrafficRow) => {
        let n = 0
        let cur: TrafficRow | undefined = r
        while (cur) {
          const pn = parentOf(cur)
          const parent = pn ? byName.get(pn) : undefined
          if (parent && phaseOf(parent) === phaseOf(r)) {
            n++
            cur = parent
          } else break
        }
        return n
      }
      const relY = new Map<string, number>()
      const hById = new Map<string, number>()
      // Per-band collision boxes (x, top, h) of cards already placed in that band.
      // A card never shares overlapping x at the same y with another — so an
      // ancestor centred over its descendants (which can map to the SAME band when
      // the journey's stages aren't monotonic) drops below them instead of landing
      // on top of them. This is what keeps cards from hiding behind each other.
      const bandRects = new Map<number, { x: number; top: number; h: number }[]>()
      const order = placed
        .slice()
        .sort(
          (a, b) =>
            a.stage - b.stage ||
            tierIndex(a.row) - tierIndex(b.row) ||
            (a.row.createdAt ?? 0) - (b.row.createdAt ?? 0) ||
            a.row.assetName.localeCompare(b.row.assetName),
        )
      for (const pl of order) {
        hById.set(pl.row.id, pl.h)
        const pn = parentOf(pl.row)
        const parent = pn ? byName.get(pn) : undefined
        // A direct same-stage child still steps a full TIER_GAP below its parent.
        const tierBelow =
          parent && relY.has(parent.id) && phaseOf(parent) === pl.stage
            ? relY.get(parent.id)! + (hById.get(parent.id) ?? MSG_H) + TIER_GAP
            : 0
        let y = Math.max(0, tierBelow)
        const rects = bandRects.get(pl.stage) ?? []
        // Push down until this card clears every card already placed in the band
        // (overlap = within a card-width horizontally AND vertically).
        for (let guard = 0; guard <= rects.length; guard++) {
          let bumped = false
          for (const r of rects) {
            const xo = Math.min(pl.laneX + MSG_W, r.x + MSG_W) - Math.max(pl.laneX, r.x)
            const yo = Math.min(y + pl.h, r.top + r.h) - Math.max(y, r.top)
            if (xo > 1 && yo > 1) {
              y = r.top + r.h + MSG_GAP
              bumped = true
            }
          }
          if (!bumped) break
        }
        relY.set(pl.row.id, y)
        rects.push({ x: pl.laneX, top: y, h: pl.h })
        bandRects.set(pl.stage, rects)
      }
      placed.forEach((pl) => {
        pl.relY = relY.get(pl.row.id) ?? 0
      })
      const slabW = Math.max(colW, lanes * laneW - INNER_GAP)
      return { name, msgs, placed, slabW }
    })

    // Lay the audience slabs side by side.
    const slabX: number[] = []
    {
      let accX = 0
      laid.forEach((p, i) => {
        slabX[i] = accX
        accX += p.slabW + COL_GAP
      })
    }
    const totalW = Math.max(laid.length ? slabX[laid.length - 1] + laid[laid.length - 1].slabW : NODE_W, NODE_W)

    // Band heights: each band must be tall enough to hold its lowest card. relY
    // already bakes in tier drops (TIER_GAP) and lane stacking, so the band's
    // content height is simply the deepest (relY + card height) it carries.
    const bandContent = new Array<number>(nPhases).fill(0)
    laid.forEach((p) => {
      if (collapsed.has(p.name)) return
      if (p.msgs.length === 0) bandContent[0] = Math.max(bandContent[0], ADD_H + MSG_GAP)
      for (const pl of p.placed) {
        bandContent[pl.stage] = Math.max(bandContent[pl.stage], pl.relY + pl.h + MSG_GAP)
      }
    })

    const MIN_CONTENT = 3 * (MSG_H + MSG_GAP)
    const bandTop: number[] = []
    const bandH: number[] = []
    let acc = MSG_Y
    for (let si = 0; si < nPhases; si++) {
      bandTop[si] = acc
      bandH[si] = BAND_PAD + Math.max(bandContent[si], MIN_CONTENT) + BAND_BOTTOM_PAD
      acc += bandH[si]
    }

    // The spine, centred over the whole board: Brand pill → Frame (Subject +
    // Strategy in one card) → (audiences). Brand is the constant account anchor.
    const subjectSub = campaignNames[0] && campaignNames[0] !== subjectText ? campaignNames[0] : objective
    const brandPos = at('brand', totalW / 2 - NODE_W / 2, BRAND_Y)
    ns.push({ id: 'brand', kind: 'brand', x: brandPos.x, y: brandPos.y, w: NODE_W, h: 40, label: rootLabel, sub: '' })
    const framePos = at('frame', totalW / 2 - NODE_W / 2, FRAME_Y)
    ns.push({
      id: 'frame',
      kind: 'frame',
      x: framePos.x,
      y: framePos.y,
      w: NODE_W,
      h: FRAME_H,
      label: subjectText,
      frame: {
        subjectText,
        subjectSub: subjectSub || undefined,
        strategyName: stratPlan?.name ?? strat,
        strategySub: strategySub || undefined,
      },
    })
    et.push({ fromId: 'brand', toId: 'frame', broken: false, kind: 'strategy' })

    laid.forEach((p, i) => {
      const slabStart = slabX[i]
      const slabCenter = slabStart + p.slabW / 2
      const flagged = p.msgs.filter((r) => breakFor(r) || r.recheckFlag).length
      const aPos = at(`aud-${p.name}`, slabCenter - AUD_W / 2, AUD_Y)
      ns.push({
        id: `aud-${p.name}`,
        kind: 'audience',
        x: aPos.x,
        y: aPos.y,
        w: AUD_W,
        h: AUD_H,
        label: p.name,
        sub: p.msgs.length
          ? `${p.msgs.length} message${p.msgs.length === 1 ? '' : 's'}`
          : 'Empty lane · add an entry, then branch',
        flaggedCount: flagged,
      })
      et.push({ fromId: 'frame', toId: `aud-${p.name}`, broken: false, kind: 'strategy' })
      if (collapsed.has(p.name)) return
      // An empty lane gets ONE entry seed at the top of the funnel — the journey's
      // root. Everything downstream is added by branching, so the canvas grows as a
      // forking journey, not a filled-in grid.
      if (p.msgs.length === 0) {
        ns.push({
          id: `add-${p.name}`,
          kind: 'add',
          x: slabCenter - MSG_W / 2,
          y: bandTop[0] + BAND_PAD,
          w: MSG_W,
          h: ADD_H,
          label: '',
          addAudience: p.name,
          addStage: FUNNEL_STAGES[0].stage,
          addEmpty: true,
        })
        return
      }
      const byName = new Map<string, TrafficRow>()
      for (const r of p.msgs) if (!byName.has(r.assetName)) byName.set(r.assetName, r)
      for (const pl of p.placed) {
        // relY already resolves the band offset: lane stacking plus the TIER_GAP
        // drop under a same-stage parent, so every connector enters from above.
        const mPos = at(pl.row.id, slabStart + pl.laneX, bandTop[pl.stage] + BAND_PAD + pl.relY)
        const brk = breakFor(pl.row)
        ns.push({
          id: pl.row.id,
          kind: 'message',
          x: mPos.x,
          y: mPos.y,
          w: MSG_W,
          h: pl.h,
          label: pl.row.assetName,
          sub: messagingSummary(pl.row) || CHANNELS[pl.row.channel].label,
          row: pl.row,
          brk,
        })
        // Connect the audience only to its entry roots; branched cards hang off
        // their parent via the journey edge below, so the tree reads cleanly.
        const isRoot = !(pl.row.branchOf && byName.has(pl.row.branchOf) && pl.row.branchOf !== pl.row.assetName)
        if (isRoot) et.push({ fromId: `aud-${p.name}`, toId: pl.row.id, broken: !!brk, kind: 'message' })
      }
    })

    // Journey branches: a card drafted as a branch off another draws a fork edge
    // from its parent down to it — the forking journey made visible. Coloured by the
    // child's coherence, so a broken handoff shows red on the thread.
    const nodeByAsset = new Map<string, string>()
    for (const n of ns) {
      if (n.kind === 'message' && n.row && !nodeByAsset.has(n.row.assetName)) nodeByAsset.set(n.row.assetName, n.id)
    }
    for (const r of scoped) {
      if (!r.branchOf) continue
      const parentId = nodeByAsset.get(r.branchOf)
      if (parentId && parentId !== r.id) et.push({ fromId: parentId, toId: r.id, broken: !!breakFor(r), kind: 'journey' })
    }

    // Resolve edges from the (possibly nudged) node positions so connections follow.
    const byId = new Map(ns.map((n) => [n.id, n]))
    const es: Edge[] = et.flatMap(({ fromId, toId, broken, kind }) => {
      const f = byId.get(fromId)
      const t = byId.get(toId)
      if (!f || !t) return []
      return [
        {
          x1: f.x + f.w / 2,
          y1: f.y + f.h,
          x2: t.x + t.w / 2,
          y2: t.y,
          broken,
          kind,
          childRowId: kind === 'journey' ? t.row?.id : undefined,
        },
      ]
    })

    // Funnel bands start right below the spine header bands (which tile 0 → MSG_Y)
    // and tile down to the bottom. The first funnel band begins at its real top
    // (bandTop[0] === MSG_Y), flush under the Audience header — NOT at the canvas
    // top, which would collide the "Awareness" label with the "Brand" header. The
    // top of the canvas is filled by the Brand header's upward overshoot; the last
    // funnel band overshoots down to fill the bottom.
    const lastIdx = nPhases - 1
    const bandBottom = Math.max(acc, ...ns.map((n) => n.y + n.h)) + BAND_PAD
    const bands: Band[] = phaseLabels.map((label, i) => {
      const top = bandTop[i]
      const bot = i === lastIdx ? bandBottom : bandTop[i + 1]
      // The canonical funnel stage this playbook phase best represents — the
      // target written when a card is restaged into this band.
      const stage = stageDefs ? stageDefs[i].canon : FUNNEL_STAGES[phaseToCanon(i, nPhases, nCanon)].stage
      return { key: `phase-${i}`, stage, label, y: top, h: bot - top }
    })
    const maxX = Math.max(totalW, ...ns.map((n) => n.x + n.w))
    // World-X span of each audience's slab — lets a click on empty canvas infer
    // which audience lane it landed in (paired with the band for the stage).
    const audienceSlabs = laid.map((p, i) => ({ name: p.name, x0: slabX[i], x1: slabX[i] + p.slabW }))
    return {
      nodes: ns,
      edges: es,
      bands,
      audienceSlabs,
      campaignName: campObj?.name ?? campaignNames[0] ?? '',
      strategyName: strat,
      bounds: { w: maxX, h: bandBottom },
    }
  }, [scoped, audiencesKey(scoped), collapsed, campaignList, clientAudiences, clientFilter, moved, detail, comments, scopeKeyDep])

  // Journey performance — reach + per-fork flow, derived from the tree. Keyed off a
  // cheap signature so it only recomputes when the journey's shape changes.
  const perfSig = scoped.map((r) => `${r.id}:${r.branchOf ?? ''}:${r.channel}`).join('|')
  const perf = useMemo(() => journeyPerformance(scoped), [perfSig]) // eslint-disable-line react-hooks/exhaustive-deps
  // Per-fork flow labels in world space: midpoint between a branched card and its
  // parent, with the handoff conversion. Built from node positions + perf.
  const flowLabels = useMemo(() => {
    if (!perfMode) return [] as { x: number; y: number; pct: number; childId: string }[]
    const nodeByAsset = new Map<string, Node>()
    for (const n of nodes) if (n.kind === 'message' && n.row && !nodeByAsset.has(n.row.assetName)) nodeByAsset.set(n.row.assetName, n)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const out: { x: number; y: number; pct: number; childId: string }[] = []
    for (const [childId, flow] of perf.edgeFlow) {
      const child = byId.get(childId)
      const parent = child?.row?.branchOf ? nodeByAsset.get(child.row.branchOf) : null
      if (!child || !parent) continue
      out.push({
        x: (parent.x + parent.w / 2 + child.x + child.w / 2) / 2,
        y: (parent.y + parent.h + child.y) / 2,
        pct: flow,
        childId,
      })
    }
    return out
  }, [perfMode, nodes, perf])

  // ---- multiplayer presence (cross-tab + ambient) ----
  const { peers, publishCursor, publishNode, publishMove, clearCursor } = usePresence({
    client: clientFilter,
    enabled: clientFilter !== 'all',
    bounds,
    nodeIds: nodes.filter((n) => n.kind !== 'add').map((n) => n.id),
    // A peer's drag is applied as a local nudge — last write wins.
    onRemoteMove: (id, x, y) => setMoved((prev) => ({ ...prev, [id]: { x, y } })),
  })
  const peerByNode = new Map<string, Peer>()
  for (const p of peers) if (p.nodeId) peerByNode.set(p.nodeId, p)

  // ---- pan / zoom / node-drag ----
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = wrapRef.current?.getBoundingClientRect()
    const px = e.clientX - (rect?.left ?? 0)
    const py = e.clientY - (rect?.top ?? 0)
    setVp((v) => {
      const ds = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const s = Math.min(2.2, Math.max(0.05, v.s * ds))
      return { tx: px - (px - v.tx) * (s / v.s), ty: py - (py - v.ty) * (s / v.s), s }
    })
  }
  const startDrag = (e: React.MouseEvent, n: Node) => {
    e.stopPropagation()
    drag.current = { id: n.id, sx: n.x, sy: n.y, mx: e.clientX, my: e.clientY, far: false }
    publishNode(n.id)
  }
  // Pull a connector out of one of a card's four edge handles.
  const startConnect = (e: React.MouseEvent, n: Node, edge: 'top' | 'right' | 'bottom' | 'left') => {
    e.stopPropagation()
    const fromX = edge === 'left' ? n.x : edge === 'right' ? n.x + n.w : n.x + n.w / 2
    const fromY = edge === 'top' ? n.y : edge === 'bottom' ? n.y + n.h : n.y + n.h / 2
    connect.current = { fromId: n.id, fromX, fromY }
    setConnectLine({ x1: fromX, y1: fromY, x2: fromX, y2: fromY })
  }
  const onDown = (e: React.MouseEvent) => {
    if (branchMenu) setBranchMenu(null)
    if (addMenu) setAddMenu(null)
    if (pillMenu) setPillMenu(null)
    if (recheckMenu) setRecheckMenu(null)
    if (stratMenu) setStratMenu(null)
    if (frameMenu) setFrameMenu(null)
    if (frameChange) setFrameChange(null)
    if (restageConfirm) setRestageConfirm(null)
    if (selectedEdge) setSelectedEdge(null)
    downAt.current = { x: e.clientX, y: e.clientY }
    if ((e.target as HTMLElement).closest('.cv-node')) return
    // Artboard tool: draw a framing rectangle on empty canvas instead of panning.
    if (
      artboardMode &&
      !(e.target as HTMLElement).closest('.cv-zoom, .cv-bar, .cv-plan, .cv-artboard, button, a, input, textarea, select')
    ) {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (rect) {
        const wx = (e.clientX - rect.left - vp.tx) / vp.s
        const wy = (e.clientY - rect.top - vp.ty) / vp.s
        draw.current = { x0: wx, y0: wy }
        setDrawRect({ x: wx, y: wy, w: 0, h: 0 })
      }
      return
    }
    pan.current = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty }
  }
  // A click on empty canvas just clears the selection (adding an asset is the
  // bottom-right "Add asset" button now, not a click on the canvas).
  const onCanvasClick = (e: React.MouseEvent) => {
    const d = downAt.current
    downAt.current = null
    if (!d || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 5) return // a drag, not a click
    const el = e.target as HTMLElement
    if (el.closest('.cv-node, .cv-branch-menu, .cv-restage, .cv-bar, .cv-zoom, .cv-plan, .cv-blank, button, a, input, textarea, select')) return
    setSelected(null)
  }
  // Open the add-asset flow from the bottom-right button: starts at the funnel
  // step (no stage yet), defaulting to the first audience lane.
  const openAddAsset = (e: React.MouseEvent) => {
    const audience = audienceSlabs[0]?.name
    if (!audience) return
    setAddMenu({ audience, x: e.clientX, y: e.clientY })
  }
  const onMove = (e: React.MouseEvent) => {
    // Broadcast the cursor in world coordinates so it lands over the same node on
    // every peer's screen, whatever their pan/zoom.
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) publishCursor((e.clientX - rect.left - vp.tx) / vp.s, (e.clientY - rect.top - vp.ty) / vp.s)
    lastScreen.current = { x: e.clientX, y: e.clientY }
    // Rubber-band the artboard frame to the cursor while drawing one.
    if (draw.current && rect) {
      const wx = (e.clientX - rect.left - vp.tx) / vp.s
      const wy = (e.clientY - rect.top - vp.ty) / vp.s
      setDrawRect({
        x: Math.min(draw.current.x0, wx),
        y: Math.min(draw.current.y0, wy),
        w: Math.abs(wx - draw.current.x0),
        h: Math.abs(wy - draw.current.y0),
      })
      return
    }
    // Rubber-band the connector to the cursor while pulling one out.
    if (connect.current && rect) {
      const wx = (e.clientX - rect.left - vp.tx) / vp.s
      const wy = (e.clientY - rect.top - vp.ty) / vp.s
      setConnectLine({ x1: connect.current.fromX, y1: connect.current.fromY, x2: wx, y2: wy })
      return
    }
    if (drag.current) {
      const d = drag.current
      const dx = (e.clientX - d.mx) / vp.s
      const dy = (e.clientY - d.my) / vp.s
      if (Math.abs(dx) + Math.abs(dy) > 3) d.far = true
      const nx = d.sx + dx
      const ny = d.sy + dy
      setMoved((prev) => ({ ...prev, [d.id]: { x: nx, y: ny } }))
      publishMove(d.id, nx, ny)
      // Cue: if the card is now over a DIFFERENT funnel band than its own stage,
      // light up that band and show where it would land.
      const node = nodes.find((n) => n.id === d.id)
      if (node?.row && bands.length) {
        const centerY = ny + node.h / 2
        const band = bands.find((b) => centerY >= b.y && centerY < b.y + b.h)
        const cur = node.row.funnelStage ?? funnelStageFor(node.row.channel, node.row.assetType)
        setDragStage(band && band.stage !== cur ? band.key : null)
      }
      return
    }
    // Capture the pan origin: the setVp updater runs later, and a mouseup could
    // null pan.current before it does (which would throw).
    const p = pan.current
    if (p) setVp((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }))
  }
  const endAll = () => {
    // Finish drawing an artboard: commit it if it's big enough to be intentional,
    // then drop out of the tool (one-shot, so you never get stuck in draw mode).
    if (draw.current) {
      const d = draw.current
      draw.current = null
      const rect = wrapRef.current?.getBoundingClientRect()
      setDrawRect(null)
      if (rect && campaignName) {
        const wx = (lastScreen.current.x - rect.left - vp.tx) / vp.s
        const wy = (lastScreen.current.y - rect.top - vp.ty) / vp.s
        const x = Math.min(d.x0, wx)
        const y = Math.min(d.y0, wy)
        const w = Math.abs(wx - d.x0)
        const h = Math.abs(wy - d.y0)
        if (w > 40 && h > 40) addArtboard(clientFilter, campaignName, { x, y, w, h })
      }
      setArtboardMode(false)
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      return
    }
    // Finish a connector pull: if dropped over another card, link them (the target
    // becomes a branch of the source). Dropped on empty space → cancel.
    if (connect.current) {
      const c = connect.current
      connect.current = null
      setConnectLine(null)
      const el = document.elementFromPoint(lastScreen.current.x, lastScreen.current.y) as HTMLElement | null
      const targetId = el?.closest<HTMLElement>('.cv-node')?.dataset.nodeId
      if (targetId && targetId !== c.fromId) {
        // Dropped over another card → link them (target branches from source).
        const fromRow = nodes.find((n) => n.id === c.fromId)?.row
        const toRow = nodes.find((n) => n.id === targetId)?.row
        // Making fromRow the parent of toRow would loop the journey tree if toRow is
        // already an ancestor of fromRow (point a card back at one of its own
        // upstream cards). The layout recursion never terminates on a cycle, so
        // reject the connection instead of forming it.
        const wouldCycle = (() => {
          if (!fromRow || !toRow) return false
          const byNameAll = new Map<string, TrafficRow>()
          for (const r of rows) if (!byNameAll.has(r.assetName)) byNameAll.set(r.assetName, r)
          const seen = new Set<string>()
          let cur: TrafficRow | undefined = fromRow
          while (cur) {
            if (cur.assetName === toRow.assetName) return true
            if (seen.has(cur.assetName)) return false
            seen.add(cur.assetName)
            cur = cur.branchOf ? byNameAll.get(cur.branchOf) : undefined
          }
          return false
        })()
        if (fromRow && toRow && fromRow.assetName !== toRow.assetName && !wouldCycle) {
          const patch: Partial<TrafficRow> = { branchOf: fromRow.assetName }
          // Re-parenting can move the card to a later funnel stage (journeys only
          // flow forward). When it does, refresh the stage-dependent CTA so the
          // messaging reflects the new stage.
          const rank = (r: TrafficRow) => FUNNEL_STAGES.findIndex((s) => s.stage === funnelStageFor(r.channel, r.assetType))
          const newRank = Math.max(rank(toRow), rank(fromRow))
          if (newRank > rank(toRow) && newRank >= 0) {
            const aud = (clientAudiences[clientFilter] ?? []).find((a) => a.name === (toRow.audience ?? '').trim())
            const cta = ctaFor(FUNNEL_STAGES[newRank].stage, aud?.outcome)
            const map = { ...messagingMap(toRow) }
            let hit = false
            for (const f of messagingFields(toRow.channel, toRow.assetType)) {
              if (isCtaField(f.key)) {
                map[f.key] = cta
                hit = true
              }
            }
            if (hit) patch.messaging = map
          }
          updateRows([{ id: toRow.id, patch }])
        }
      } else if (!targetId) {
        // Dropped on empty canvas → draft a NEW asset card branched off the source.
        const from = nodes.find((n) => n.id === c.fromId)
        if (from?.row) {
          const sugs = branchSuggestions(from.row)
          const sug = sugs.find((s) => s.group === 'next-step') ?? sugs[0]
          if (sug) void doBranch(from.row, sug)
        }
      }
      return
    }
    if (drag.current?.far) {
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      // Drag-to-restage: if the card was dropped in a different funnel band, move
      // its stage there and refresh the stage-dependent CTA so the messaging
      // reflects the new stage (a journey card carries a stage, not just a spot).
      const d = drag.current
      const node = nodes.find((n) => n.id === d.id)
      const row = node?.row
      if (row && bands.length) {
        const finalY = d.sy + (lastScreen.current.y - d.my) / vp.s
        const centerY = finalY + node!.h / 2
        const band = bands.find((b) => centerY >= b.y && centerY < b.y + b.h)
        const curStage = row.funnelStage ?? funnelStageFor(row.channel, row.assetType)
        if (band && band.stage !== curStage) {
          // The stage-dependent CTA for a row, refreshed for a given stage.
          const ctaMapFor = (r: TrafficRow, stage: FunnelStage) => {
            const aud = (clientAudiences[clientFilter] ?? []).find((a) => a.name === (r.audience ?? '').trim())
            const cta = ctaFor(stage, aud?.outcome)
            const m = { ...messagingMap(r) }
            let hit = false
            for (const f of messagingFields(r.channel, r.assetType)) if (isCtaField(f.key)) { m[f.key] = cta; hit = true }
            return hit ? m : null
          }
          // Collect every patch and apply them as ONE batch — firing many async
          // updateRow calls races the refreshes and leaves the card display stale.
          const updates: { id: string; patch: Partial<TrafficRow> }[] = []
          const m = ctaMapFor(row, band.stage)
          updates.push({ id: row.id, patch: m ? { funnelStage: band.stage, messaging: m } : { funnelStage: band.stage } })
          // Cascade: the cards connected below are clamped to >= the new stage, so
          // any whose effective stage shifts get their CTA refreshed too — the whole
          // downstream thread follows the move.
          const rank = (s: FunnelStage) => FUNNEL_STAGES.findIndex((x) => x.stage === s)
          const oldRank = rank(curStage)
          const newRank = rank(band.stage)
          const childrenOf = new Map<string, TrafficRow[]>()
          for (const r of scoped) {
            if (r.branchOf) (childrenOf.get(r.branchOf) ?? childrenOf.set(r.branchOf, []).get(r.branchOf)!).push(r)
          }
          const seen = new Set<string>([row.id])
          const queue = [...(childrenOf.get(row.assetName) ?? [])]
          while (queue.length) {
            const dRow = queue.shift()!
            if (seen.has(dRow.id)) continue
            seen.add(dRow.id)
            for (const c of childrenOf.get(dRow.assetName) ?? []) queue.push(c)
            if (dRow.funnelStage) continue // pinned by its own drag-placed stage
            const chRank = rank(funnelStageFor(dRow.channel, dRow.assetType))
            const before = Math.max(chRank, oldRank)
            const after = Math.max(chRank, newRank)
            if (after !== before && after >= 0) {
              const dm = ctaMapFor(dRow, FUNNEL_STAGES[after].stage)
              if (dm) updates.push({ id: dRow.id, patch: { messaging: dm } })
            }
          }
          // Don't apply yet — a restage can re-draft a whole thread, so confirm it.
          setRestageConfirm({
            updates,
            rowId: row.id,
            fromStage: curStage,
            toStage: band.stage,
            toLabel: band.label,
            count: updates.length,
            x: lastScreen.current.x,
            y: lastScreen.current.y,
          })
        }
      }
    }
    setDragStage(null)
    if (drag.current) publishNode(null)
    drag.current = null
    pan.current = null
  }
  const onLeave = () => {
    clearCursor()
    endAll()
  }
  const confirmRestage = () => {
    if (restageConfirm) void updateRows(restageConfirm.updates)
    setRestageConfirm(null)
  }
  const cancelRestage = () => {
    // Snap the card back to its original band — drop the manual nudge from the drag.
    if (restageConfirm) {
      const id = restageConfirm.rowId
      setMoved((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
    setRestageConfirm(null)
  }
  const fit = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || bounds.w === 0) return
    const s = Math.min(1.2, Math.max(0.05, Math.min((rect.width - 100) / bounds.w, (rect.height - 100) / Math.max(bounds.h, 1))))
    setVp({ s, tx: (rect.width - bounds.w * s) / 2, ty: 30 })
  }
  const zoom = (dir: 1 | -1) =>
    setVp((v) => ({ ...v, s: Math.min(2.2, Math.max(0.05, v.s * (dir > 0 ? 1.2 : 1 / 1.2))) }))
  const toggleAud = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  // Branch a card: draft the chosen fork from the brand model, recorded as a branch
  // off the source so the canvas forks from it (and the check runs on it). The menu
  // stays open and the fork is marked added, so one card can fan out to several.
  async function doBranch(row: TrafficRow, sug: BranchSuggestion) {
    if (branching) return
    const campaign = (row.campaign ?? '').trim()
    if (!campaign) {
      setBranchMenu(null)
      return
    }
    setBranching(true)
    const audience = (clientAudiences[clientFilter] ?? []).find((a) => a.name === (row.audience ?? '').trim())
    const proof = audience?.rtbEmphasis?.length ? rtbById(campaign, audience.rtbEmphasis[0]) : undefined
    const newRow = composeBranchAsset({
      source: row,
      audience,
      stage: sug.stage,
      channel: sug.channel,
      proof,
      campaign,
      index: branchSeq.current++,
      now: Date.now(),
    })
    await draftMatrixCell(newRow)
    setBranchAdded((prev) => new Set(prev).add(`${sug.stage}-${sug.channel}`))
    setBranching(false)
  }

  // Add a card to a cell: draft a fresh asset for the lane's audience at the
  // clicked funnel stage, straight from the brand model. This is how a blank
  // canvas gets built up — click a cell, pick a channel, a backed draft lands.
  async function doAddCard(audienceName: string, stage: FunnelStage, channel: ChannelId, assetType?: string) {
    if (branching) return
    const campaign = campaignFilter !== 'all' ? campaignFilter : activeBoard?.campaign ?? ''
    const audience = (clientAudiences[clientFilter] ?? []).find((a) => a.name === audienceName)
    if (!campaign || !audience) {
      setAddMenu(null)
      return
    }
    setBranching(true)
    const proof = audience.rtbEmphasis?.length ? rtbById(campaign, audience.rtbEmphasis[0]) : undefined
    const newRow = composeCellAsset({
      audience,
      stage,
      channel,
      assetType,
      proof,
      campaign,
      index: branchSeq.current++,
      now: Date.now(),
    })
    // Pin it to the funnel part the user picked, so it lands in that band even if
    // the channel's default stage differs.
    newRow.funnelStage = stage
    await draftMatrixCell(newRow)
    setBranching(false)
    setAddMenu(null)
  }

  // Re-draft one asset around a proof: keep its own lead-in (the clause before the
  // proof) and CTA, swap the claim. Pulled out so the swap can cascade down a branch.
  const proofPatch = (t: TrafficRow, next: Rtb): Partial<TrafficRow> => {
    const audType = (clientAudiences[clientFilter] ?? []).find((a) => a.name === (t.audience ?? '').trim())
    const curPrimary = (messagingMap(t)[primaryFieldKey(t.channel, t.assetType ?? '')] ?? '').trim()
    const messageAngle = audType?.messageAngle?.trim() || curPrimary.split(/[.;!?]/)[0]?.trim() || undefined
    const { messaging, rtbMap } = composeMessaging({
      channel: t.channel,
      assetType: t.assetType ?? '',
      audience: { name: (t.audience ?? '').trim() || 'this audience', messageAngle },
      proof: next,
      cta: assetCta(t),
    })
    return { messaging, rtbMap }
  }

  // Swap an asset's proof point — and cascade it down the branch. A branch is one
  // forking thread, so the proof at the top backs everything downstream; re-draft
  // the clicked asset plus every asset that branches off it (directly or not) so
  // the whole thread re-aligns to the new claim instead of silently drifting. All
  // patches go through ONE batched update so the cards re-render together.
  const swapProof = (row: TrafficRow, next: Rtb) => {
    const byParent = new Map<string, TrafficRow[]>()
    for (const r of scoped) {
      if (r.branchOf) (byParent.get(r.branchOf) ?? byParent.set(r.branchOf, []).get(r.branchOf)!).push(r)
    }
    const seen = new Set<string>()
    const queue: TrafficRow[] = [row]
    const updates: { id: string; patch: Partial<TrafficRow> }[] = []
    while (queue.length) {
      const t = queue.shift()!
      if (seen.has(t.id)) continue
      seen.add(t.id)
      updates.push({ id: t.id, patch: proofPatch(t, next) })
      for (const child of byParent.get(t.assetName) ?? []) queue.push(child)
    }
    void updateRows(updates)
    setPillMenu(null)
  }

  // Author a brand-new proof point on the spot: create it owned by the asset's
  // audience (so it joins the foundation's proof and is reusable), then attach it
  // to the asset and cascade down the branch like any other proof swap.
  const addProof = (row: TrafficRow, label: string) => {
    const text = label.trim()
    if (!text) return
    const auds = clientAudiences[clientFilter] ?? []
    const aud = auds.find((a) => a.name === (row.audience ?? '').trim())
    if (!aud) return
    // Authored on the canvas → an unvetted draft. It joins the audience's pool but
    // reads as a draft until approved, keeping the library a curated source of truth.
    const rtb = newRtb({ audienceId: aud.id, label: text, approved: false })
    setClientAudiences(
      clientFilter,
      auds.map((a) => (a.id === aud.id ? { ...a, rtbs: [...(a.rtbs ?? []), rtb] } : a)),
    )
    swapProof(row, rtb)
  }

  // Bless a draft proof point into an approved library master (governance).
  const approveProof = (rtbId: string) => {
    const auds = clientAudiences[clientFilter] ?? []
    setClientAudiences(
      clientFilter,
      auds.map((a) => ({
        ...a,
        rtbs: (a.rtbs ?? []).map((r) => (r.id === rtbId ? { ...r, approved: true } : r)),
      })),
    )
  }

  // Set an asset's CTA: write every dedicated CTA slot, or — for channels that fold
  // the CTA into the caption (organic posts) — a generic `cta` key, so a CTA can be
  // added on any asset and the pill reflects it.
  const swapCta = (row: TrafficRow, nextCta: string) => {
    const map = { ...messagingMap(row) }
    let hit = false
    for (const f of messagingFields(row.channel, row.assetType)) {
      if (isCtaField(f.key)) {
        map[f.key] = nextCta
        hit = true
      }
    }
    if (!hit) map.cta = nextCta
    updateRows([{ id: row.id, patch: { messaging: map } }])
    setPillMenu(null)
  }

  // Anchor a popover at the click point, flipping up / left when it would spill
  // past the viewport edge — so a menu opened off a bottom-row cell stays on screen.
  const menuStyle = (x: number, y: number): React.CSSProperties => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    // Anchor from whichever edge leaves more room, and cap the height to the space
    // available from that anchor so a tall menu (e.g. the playbook picker) scrolls
    // inside the viewport instead of being clipped by the screen bottom.
    const anchorBottom = y > vh / 2
    const margin = 12
    return {
      ...(x > vw - 240 ? { right: vw - x } : { left: x }),
      ...(anchorBottom ? { bottom: vh - y } : { top: y }),
      maxHeight: (anchorBottom ? y : vh - y) - margin,
      overflowY: 'auto',
    }
  }

  // Only truly out-of-scope (no campaign open) shows the empty prompt. A specific
  // campaign with no rows yet — a fresh canvas — still renders its lanes so you can
  // add the first asset.
  if (scoped.length === 0 && campaignFilter === 'all') {
    return (
      <div className="sheet-grid">
        <div className="ins ins-empty">No campaign in scope. Pick a client, or load sample data.</div>
      </div>
    )
  }

  return (
    <div className="sheet-grid">
      {/* Diagnosis moved to the top bar; this floating cluster only appears when
          there's a layout reset or open flags to surface. */}
      {breaks.length > 0 && (
        <div className="cv-bar">
          <span className="spacer" />
          {breaks.length > 0 && (
            <button className="cv-flagjump" onClick={() => openBreaksQueue()}>
              ⚠ {breaks.length} flag{breaks.length === 1 ? '' : 's'} — jump to
            </button>
          )}
        </div>
      )}

      <div
        className={`cv-wrap${artboardMode ? ' cv-wrap-drawing' : ''}`}
        ref={wrapRef}
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={endAll}
        onMouseLeave={onLeave}
        onClick={onCanvasClick}
      >
        {/* Funnel bands live in screen space, pinned to the full viewport width, with
            their vertical extent tracking the pan/zoom. The first and last stages
            overshoot top and bottom so the stripes always fill the whole canvas, not
            just the content's bounding box. */}
        <div className="cv-bands">
          {/* Only the funnel stages are bands now — the spine sits on the plain grid
              above as labelled cards. Bands start crisply at MSG_Y; the last overshoots
              down so the lanes fill to the bottom. */}
          {bands.map((b, i) => {
            const last = i === bands.length - 1
            const top = vp.ty + b.y * vp.s
            const height = b.h * vp.s + (last ? BAND_OVERFLOW : 0)
            return (
              <div
                key={b.key}
                className={`cv-band${i % 2 ? ' alt' : ''}${dragStage === b.key ? ' targeted' : ''}`}
                style={{ top, height }}
              >
                <span className="cv-band-label" style={{ top: 9 }}>
                  {b.label}
                  {dragStage === b.key && <span className="cv-band-drop">drop to move here</span>}
                </span>
              </div>
            )
          })}
        </div>
        <div className="cv-world" style={{ transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.s})` }}>
          {/* Artboard frames — drawn behind the edges + cards, labelled, resizable
              later. The frame body is click-through (pointer-events: none) so it
              never blocks panning or card interaction; only its chrome is live. */}
          {artboards
            .filter((a) => a.client === clientFilter && a.campaign === campaignName)
            .map((a) => (
              <div key={a.id} className="cv-artboard" style={{ left: a.x, top: a.y, width: a.w, height: a.h }}>
                <div className="cv-artboard-tab">
                  <input
                    className="cv-artboard-name"
                    value={a.name}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => renameArtboard(a.id, e.target.value)}
                  />
                  <button
                    className="cv-artboard-del"
                    title="Delete this artboard"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => deleteArtboard(a.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          {/* The live rubber-band while drawing a new artboard. */}
          {drawRect && (
            <div
              className="cv-artboard cv-artboard-draft"
              style={{ left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h }}
            />
          )}
          <svg className="cv-edges" width={bounds.w + 60} height={bounds.h + 60}>
            <defs>
              {/* The coherent thread runs the brand gradient (orange → purple → light
                  blue), tiled and translated downward so the colour flows down the
                  connectors like a current. The tile loops back to orange so the
                  downward scroll is seamless. */}
              <linearGradient id="cv-good-grad" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={520} spreadMethod="repeat">
                <stop offset="0" stopColor="var(--accent)" />
                <stop offset="0.34" stopColor="var(--accent-2)" />
                <stop offset="0.67" stopColor="var(--accent-3)" />
                <stop offset="1" stopColor="var(--accent)" />
                <animateTransform attributeName="gradientTransform" attributeType="XML" type="translate" from="0 0" to="0 520" dur="6s" repeatCount="indefinite" />
              </linearGradient>
            </defs>
            {edges.map((e, i) => {
              // Control points: the curve always exits the parent straight DOWN and
              // enters the child from above, so a connector never bows up over its card.
              const mid = (e.y1 + e.y2) / 2
              const c1 = Math.max(mid, e.y1 + 26)
              const c2 = Math.min(mid, e.y2 - 26)
              const d = `M ${e.x1} ${e.y1} C ${e.x1} ${c1}, ${e.x2} ${c2}, ${e.x2} ${e.y2}`
              const selectable = e.kind === 'journey' && !!e.childRowId
              const sel = selectable && selectedEdge === e.childRowId
              return (
                <g key={i}>
                  <path
                    className={`cv-edge${e.broken ? ' broken' : e.kind === 'journey' ? ' journey' : e.kind === 'message' ? ' good' : ''}${sel ? ' selected' : ''}`}
                    d={d}
                    fill="none"
                  />
                  {selectable && (
                    // A wide transparent path makes the thin line easy to click; it
                    // re-enables pointer events (the edge layer is otherwise pass-through).
                    <path
                      className="cv-edge-hit"
                      d={d}
                      fill="none"
                      onMouseDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setSelected(null)
                        setSelectedEdge(e.childRowId!)
                      }}
                    />
                  )}
                  {sel && (
                    <g
                      className="cv-edge-del"
                      transform={`translate(${(e.x1 + e.x2) / 2} ${(e.y1 + e.y2) / 2})`}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        void updateRow(e.childRowId!, { branchOf: undefined })
                        setSelectedEdge(null)
                      }}
                    >
                      <title>Delete this connection</title>
                      <circle r={11} />
                      <path d="M -3.4 -3.4 L 3.4 3.4 M 3.4 -3.4 L -3.4 3.4" />
                    </g>
                  )}
                </g>
              )
            })}
            {connectLine && (
              <path
                className="cv-edge-connecting"
                d={`M ${connectLine.x1} ${connectLine.y1} L ${connectLine.x2} ${connectLine.y2}`}
                fill="none"
              />
            )}
          </svg>
          {nodes.map((n, ni) => {
            // Click-to-add ghost cell: a dashed placeholder in a funnel cell that
            // drafts a card into that lane/stage. Rendered apart from the real
            // nodes — no drag, no presence, just an invitation to place a card.
            if (n.kind === 'add') {
              return (
                <button
                  key={n.id}
                  className={`cv-add-cell${n.addEmpty ? ' empty' : ''}`}
                  style={{ left: n.x, top: n.y, width: n.w, minHeight: n.h }}
                  title={`Add the entry asset for ${n.addAudience}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setAddMenu({ audience: n.addAudience!, stage: n.addStage!, x: e.clientX, y: e.clientY })
                  }}
                >
                  ✦ Add entry asset
                </button>
              )
            }
            const pres = peerByNode.get(n.id)
            // A card re-drafting from a strategy/audience change: it shimmers and
            // its new copy fades in, staggered down the board so you watch the
            // change ripple across every asset.
            const regen = !!n.row && regenIds.has(n.row.id)
            return (
            <div
              key={n.id}
              data-node-id={n.id}
              className={`cv-node k-${n.kind}${n.brk ? ' broke' : ''}${selected === n.id ? ' selected' : ''}${regen ? ' regen' : ''}`}
              style={{
                left: n.x,
                top: n.y,
                width: n.w,
                minHeight: n.h,
                boxShadow: pres ? `0 0 0 2px ${pres.color}` : undefined,
                animationDelay: regen ? `${Math.min(ni * 28, 800)}ms` : undefined,
              }}
              onMouseDown={(e) => startDrag(e, n)}
              onMouseEnter={() => {
                if (!drag.current) publishNode(n.id)
              }}
              onMouseLeave={() => {
                if (!drag.current) publishNode(null)
              }}
              onClick={(e) => {
                if (suppressClick.current) return
                // A click on a message card just selects/picks it up (the drag is
                // handled on mousedown); editing is via the ✎ button, bottom-right.
                if (n.kind === 'message') setSelected(n.id)
                // Spine cards are interchangeable — click to swap their value. The
                // Frame card's two rows handle their own clicks (Subject / Strategy).
                else if (n.kind === 'brand' && campaignName) setFrameMenu({ kind: 'brand', x: e.clientX, y: e.clientY })
                else if (n.kind === 'audience') setFrameMenu({ kind: 'audience', audience: n.label, x: e.clientX, y: e.clientY })
              }}
            >
              {pres && (
                <span className="cv-node-presence" style={{ background: pres.color }}>
                  {pres.name}
                </span>
              )}
              {perfMode && n.kind === 'message' && n.row && perf.perAsset.has(n.row.id) && (() => {
                const p = perf.perAsset.get(n.row.id)!
                return (
                  <span className="cv-node-perf" title={`Reached ${p.reach.toLocaleString()} · ${(p.rate * 100).toFixed(1)}% ${p.rateLabel}`}>
                    <span className="cv-node-perf-reach">{formatReach(p.reach)}</span>
                    <span className="cv-node-perf-rate">{(p.rate * 100).toFixed(0)}% {p.rateLabel}</span>
                  </span>
                )
              })()}
              {n.kind === 'message' && n.row && (
                <span className="cv-node-ico">
                  <ChannelIcon channel={n.row.channel} size={18} />
                </span>
              )}
              {n.kind === 'frame' && n.frame ? (
                <div className="cv-frame-card">
                  <button
                    className="cv-frame-row"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (campaignName) setFrameMenu({ kind: 'subject', x: e.clientX, y: e.clientY })
                    }}
                  >
                    <span className="cv-node-tag">Subject</span>
                    <span className="cv-frame-row-line">
                      <span className="cv-node-label-name">{n.frame.subjectText}</span>
                      <span className="cv-node-playbook">Swap ▾</span>
                    </span>
                    {n.frame.subjectSub && <span className="cv-node-sub">{n.frame.subjectSub}</span>}
                  </button>
                  <button
                    className="cv-frame-row"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (campaignName) setStratMenu({ campaign: campaignName, current: strategyName, x: e.clientX, y: e.clientY })
                    }}
                  >
                    <span className="cv-node-tag">Strategy</span>
                    <span className="cv-frame-row-line">
                      <span className="cv-node-label-name">{n.frame.strategyName}</span>
                      <span className="cv-node-playbook">Playbook ▾</span>
                    </span>
                    {n.frame.strategySub && <span className="cv-node-sub">{n.frame.strategySub}</span>}
                  </button>
                </div>
              ) : (
              <div className="cv-node-body">
                {n.kind === 'audience' && <span className="cv-node-tag">Audience</span>}
                <div className="cv-node-label">
                  {n.kind === 'brand' && <span className="cv-node-tag cv-node-tag-inline">Brand</span>}
                  <span className="cv-node-label-name">{n.label}</span>
                  {n.kind === 'brand' && <span className="cv-node-playbook">Swap ▾</span>}
                  {n.kind === 'message' && n.row?.recheckFlag && (
                    <button
                      className="cv-node-recheck"
                      title={`${n.row.recheckFlag.reason} (${n.row.recheckFlag.frame}). Produced asset — fix it where it lives.`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setRecheckMenu({ row: n.row!, x: e.clientX, y: e.clientY })
                      }}
                    >
                      ⚠ Re-check
                    </button>
                  )}
                  {n.kind === 'message' && n.row && branchSuggestions(n.row).length > 0 && (
                    <button
                      className="cv-node-branch"
                      title="Branch this card into next steps"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setBranchAdded(new Set())
                        setBranchMenu({ row: n.row!, x: e.clientX, y: e.clientY })
                      }}
                    >
                      ⑂ Branch
                    </button>
                  )}
                  {n.kind === 'message' && n.row && (
                    <a
                      className="cv-node-link"
                      href={assetHref(n.row)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open the asset"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↗
                    </a>
                  )}
                </div>
                {(() => {
                  if (n.kind !== 'message' || !n.row) {
                    return n.sub ? <div className="cv-node-sub">{n.sub}</div> : null
                  }
                  // Every message card shows all messaging components, then a CTA
                  // (placeholder when the post has none) and the proof point.
                  // Zoomed in, values show in full and inbound replies append;
                  // zoomed out, values clamp to 2 lines.
                  const fields = cardRows(n.row)
                  const inbound = detail ? comments[n.row.id] ?? [] : []
                  if (!fields.length && !inbound.length) {
                    return n.sub ? <div className="cv-node-sub">{n.sub}</div> : null
                  }
                  return (
                    <div className="cv-node-full">
                      {fields.map((fld, i) => {
                        const r = n.row!
                        // Zoomed in, an editable component becomes an inline textarea
                        // wired straight to the row, so you edit copy on the card.
                        const editable = detail && !!fld.edit
                        const liveVal = !fld.edit
                          ? ''
                          : fld.edit.kind === 'extracted'
                            ? r.extractedCopy ?? ''
                            : messagingMap(r)[fld.edit.key] ?? ''
                        return (
                          <div
                            className={`cv-node-field${fld.muted && !editable ? ' muted' : ''}`}
                            key={`${fld.label}-${i}`}
                          >
                            <span className="cv-node-fkey">{fld.label}</span>
                            {fld.cta ? (
                              (() => {
                                const none = fld.cta === CTA_NONE
                                return (
                                  <span className="cv-node-proofs">
                                    <button
                                      className={`cv-node-cta${none ? ' none' : ''}`}
                                      title={none ? 'Set a CTA for this asset' : `Swap the CTA — “${fld.value}”`}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPillMenu({ row: r, kind: 'cta', x: e.clientX, y: e.clientY })
                                      }}
                                    >
                                      ↗ {fld.value}
                                    </button>
                                  </span>
                                )
                              })()
                            ) : fld.proofs ? (
                              <span className="cv-node-proofs">
                                {fld.proofs.map((p) => (
                                  <button
                                    key={p.id}
                                    className={`cv-node-proof${p.draft ? ' draft' : ''}`}
                                    title={p.draft ? `Unvetted draft proof — “${p.label}”. Approve it in the proof menu to make it a library master.` : `Swap the proof point — “${p.label}”. Switching it re-drafts this card and the branch below it.`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPillMenu({ row: r, kind: 'proof', x: e.clientX, y: e.clientY })
                                    }}
                                  >
                                    ◆ {p.label}
                                    {p.draft && <span className="cv-proof-draft">draft</span>}
                                  </button>
                                ))}
                              </span>
                            ) : fld.proofAdd ? (
                              <span className="cv-node-proofs">
                                <button
                                  className="cv-node-proof none"
                                  title="Attach a proof point to back this asset"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setPillMenu({ row: r, kind: 'proof', x: e.clientX, y: e.clientY })
                                  }}
                                >
                                  ◆ Add proof
                                </button>
                              </span>
                            ) : editable ? (
                              <textarea
                                className="cv-node-fedit"
                                value={liveVal}
                                placeholder={`${fld.label}…`}
                                rows={1}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const v = e.target.value
                                  if (fld.edit!.kind === 'extracted') updateRow(r.id, { extractedCopy: v })
                                  else updateRow(r.id, { messaging: { ...messagingMap(r), [fld.edit!.key]: v } })
                                }}
                              />
                            ) : (
                              <span className={`cv-node-fval${detail ? '' : ' clamp2'}`}>{fld.value}</span>
                            )}
                          </div>
                        )
                      })}
                      {inbound.length > 0 && (
                        <div className="cv-node-msgs">
                          <div className="cv-node-msgs-hd">Messages back · {inbound.length}</div>
                          {inbound.map((c) => (
                            <div className={`cv-node-msg s-${c.sentiment}`} key={c.id}>
                              <span className="cv-node-msg-who">
                                {c.author}
                                {c.intent && <span className="cv-node-msg-tag">intent</span>}
                              </span>
                              <span className="cv-node-msg-txt">{c.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
              )}
              {n.kind === 'audience' && (
                <span
                  className="cv-node-collapse"
                  title={collapsed.has(n.label) ? 'Expand lane' : 'Collapse lane'}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleAud(n.label)
                  }}
                >
                  {collapsed.has(n.label) ? '＋' : '−'}
                </span>
              )}
              {n.kind === 'audience' && (n.flaggedCount ?? 0) > 0 && (
                <span className="cv-node-flagcount">⚠ {n.flaggedCount}</span>
              )}
              {n.kind === 'message' && n.row && (
                <button
                  className="cv-node-edit"
                  title="Edit this asset"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    openReview(n.row!.id)
                  }}
                >
                  ✎ Edit
                </button>
              )}
              {n.kind === 'message' &&
                (['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                  <span
                    key={edge}
                    className={`cv-node-handle handle-${edge}`}
                    title="Drag to connect this card to another"
                    onMouseDown={(e) => startConnect(e, n, edge)}
                  >
                    ＋
                  </span>
                ))}
              {n.brk && (
                <span
                  className="cv-node-flag"
                  title={n.brk.headline}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    openBreaksQueue(n.brk!.id)
                  }}
                >
                  ⚠
                </span>
              )}
            </div>
            )
          })}

          {/* Per-fork flow: the handoff conversion at each branch, in world space. */}
          {flowLabels.map((f) => (
            <span
              key={`flow-${f.childId}`}
              className={`cv-flow${f.pct < 0.12 ? ' leak' : ''}`}
              style={{ left: f.x, top: f.y }}
            >
              {(f.pct * 100).toFixed(f.pct < 0.1 ? 1 : 0)}%
            </span>
          ))}
        </div>

        {/* Live cursors (screen space, computed from world coords + the local viewport). */}
        {peers.map((p) =>
          p.cursor ? (
            <div
              key={`cur-${p.id}`}
              className="cv-cursor"
              style={{ left: vp.tx + p.cursor.x * vp.s, top: vp.ty + p.cursor.y * vp.s }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1 1 L1 12 L4 9 L6.5 14 L8.5 13 L6 8 L10 8 Z" fill={p.color} stroke="#fff" strokeWidth="1" />
              </svg>
              <span className="cv-cursor-label" style={{ background: p.color }}>
                {p.name}
              </span>
            </div>
          ) : null,
        )}

        {/* A fresh custom board starts blank — guide the build-out loop. */}
        {isCustomBoard && scopeAudiences.length === 0 && (
          <div className="cv-blank-hint">
            <strong>Build a branching journey</strong>
            <span>Marketing is routing, so a campaign is a tree, not a grid.</span>
            <ol className="cv-blank-steps">
              <li>
                Add an audience lane from <em>Show</em> above.
              </li>
              <li>
                <em>✦ Add entry asset</em> — one card at the top of the funnel, drafted from the brand model.
              </li>
              <li>
                <em>⑂ Branch</em> it into many next steps, then branch those. The more it forks, the more
                specific the routing.
              </li>
            </ol>
            <span className="cv-blank-foot">Coherence is checked live as the journey grows.</span>
          </div>
        )}

        {/* Branch menu — next-step suggestions for the picked card (screen space). */}
        {branchMenu && (
          <div
            className="cv-branch-menu"
            style={menuStyle(branchMenu.x, branchMenu.y)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cv-branch-title">Branch into next steps</div>
            <div className="cv-branch-note">Add as many forks as you want — the journey grows as it splits.</div>
            {(['this-stage', 'next-step'] as const).map((group) => {
              const opts = branchSuggestions(branchMenu.row).filter((s) => s.group === group)
              if (!opts.length) return null
              const sample = opts[0]
              return (
                <div key={group} className="cv-branch-group">
                  <div className="cv-branch-head">
                    {group === 'this-stage'
                      ? `More ${sample.stageLabel} variants`
                      : `→ Next step · ${sample.stageLabel}`}
                  </div>
                  {opts.map((sug: BranchSuggestion) => {
                    const added = branchAdded.has(`${sug.stage}-${sug.channel}`)
                    return (
                      <button
                        key={`${sug.stage}-${sug.channel}`}
                        className={`cv-branch-opt${added ? ' added' : ''}`}
                        disabled={branching}
                        onClick={() => doBranch(branchMenu.row, sug)}
                      >
                        <span className="cv-branch-ch">
                          <ChannelIcon channel={sug.channel} size={13} />
                          {sug.label}
                        </span>
                        <span className="cv-branch-mark">{added ? '✓ added' : '＋'}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            <button className="cv-branch-cancel" onClick={() => setBranchMenu(null)}>
              {branching ? 'Drafting…' : branchAdded.size ? `Done · ${branchAdded.size} added` : 'Close'}
            </button>
          </div>
        )}

        {/* Add-asset flow — three steps: pick the funnel part, then the channel,
            then the asset format/type (Reel, Newsletter, …). */}
        {addMenu && (
          <div
            className="cv-branch-menu"
            style={menuStyle(addMenu.x, addMenu.y)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {!addMenu.stage ? (
              <>
                <div className="cv-branch-head">{addMenu.audience} — pick a funnel part</div>
                {bands.map((b) => (
                  <button
                    key={b.key}
                    className="cv-branch-opt"
                    onClick={() => setAddMenu({ ...addMenu, stage: b.stage })}
                  >
                    <span className="cv-branch-ch">{b.label}</span>
                    <span className="cv-branch-mark">›</span>
                  </button>
                ))}
                <button className="cv-branch-cancel" onClick={() => setAddMenu(null)}>
                  Cancel
                </button>
              </>
            ) : !addMenu.channel ? (
              <>
                <div className="cv-branch-head">
                  {bands.find((b) => b.stage === addMenu.stage)?.label ?? FUNNEL_STAGES.find((s) => s.stage === addMenu.stage)?.label} — pick a channel
                </div>
                {stageSuggestions(addMenu.stage).map((sug: BranchSuggestion) => (
                  <button
                    key={`${sug.stage}-${sug.channel}`}
                    className="cv-branch-opt"
                    onClick={() => setAddMenu({ ...addMenu, channel: sug.channel })}
                  >
                    <span className="cv-branch-ch">{sug.label}</span>
                    <span className="cv-branch-mark">›</span>
                  </button>
                ))}
                <button className="cv-branch-cancel" onClick={() => setAddMenu({ ...addMenu, stage: undefined })}>
                  ‹ Back to funnel
                </button>
              </>
            ) : (
              <>
                <div className="cv-branch-head">{CHANNELS[addMenu.channel].label} — pick a type</div>
                {typesFor(addMenu.channel).map((t) => (
                  <button
                    key={t.value}
                    className="cv-branch-opt"
                    disabled={branching}
                    onClick={() => doAddCard(addMenu.audience, addMenu.stage!, addMenu.channel!, t.value)}
                  >
                    {t.label}
                  </button>
                ))}
                <button className="cv-branch-cancel" onClick={() => setAddMenu({ ...addMenu, channel: undefined })}>
                  {branching ? 'Drafting…' : '‹ Back to channels'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Playbook picker — the Strategy card is a GTM-motion selector. Pick a
            playbook (ABM, Demand Gen, etc.) and it links to this campaign, so the
            card resolves to the plan's stage flow. */}
        {stratMenu && (
          <div
            className="cv-branch-menu cv-strat-menu"
            style={menuStyle(stratMenu.x, stratMenu.y)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cv-branch-head">Strategy playbook · {stratMenu.campaign}</div>
            {GTM_STRATEGIES.map((s) => {
              const active = s.name.toLowerCase() === stratMenu.current.trim().toLowerCase() || s.key === stratMenu.current.trim().toLowerCase()
              return (
                <button
                  key={s.key}
                  className={`cv-strat-opt${active ? ' active' : ''}`}
                  onClick={(e) => {
                    const x = e.clientX
                    const y = e.clientY
                    const campaign = stratMenu.campaign
                    setStratMenu(null)
                    if (active) return // no-op: already on this playbook
                    // Don't commit yet — preview the blast radius before committing.
                    const campRows = rows.filter((r) => (r.campaign ?? '').trim() === campaign.trim())
                    previewFrameChange(
                      `Change strategy to ${s.name}?`,
                      campaign,
                      campRows,
                      (c) => setCampaignStrategy(c, s.name),
                      x,
                      y,
                    )
                  }}
                >
                  <span className="cv-strat-opt-name">
                    {s.name}
                    {active && <span className="cv-strat-opt-check">✓</span>}
                  </span>
                  <span className="cv-strat-opt-seq">{s.sequence}</span>
                </button>
              )
            })}
            <button className="cv-branch-cancel" onClick={() => setStratMenu(null)}>
              Cancel
            </button>
          </div>
        )}

        {/* Spine-card swap menu — Brand / Subject / Audience are interchangeable. */}
        {frameMenu && (
          <div className="cv-branch-menu cv-strat-menu" style={menuStyle(frameMenu.x, frameMenu.y)} onMouseDown={(e) => e.stopPropagation()}>
            {frameMenu.kind === 'brand' && (
              <>
                <div className="cv-branch-head">Swap the brand</div>
                {clientList
                  .filter((c) => c.trim())
                  .map((c) => {
                    const on = c === clientFilter
                    return (
                      <button
                        key={c}
                        className={`cv-branch-opt${on ? ' added' : ''}`}
                        onClick={(e) => {
                          const x = e.clientX, y = e.clientY
                          setFrameMenu(null)
                          if (on || !campaignName) return
                          // Re-homing the campaign is the widest-blast change — preview it.
                          const campRows = rows.filter((r) => (r.campaign ?? '').trim() === campaignName.trim())
                          // Re-check each asset's proof against the new brand's proof set.
                          const newProofs = new Set(
                            (clientAudiences[c] ?? []).flatMap((au) => [...(au.rtbEmphasis ?? []), ...(au.rtbs ?? []).map((x) => x.id)]),
                          )
                          const holds = (r: TrafficRow) => {
                            const ids = assetRtbIds(r)
                            return ids.length === 0 || ids.every((id) => newProofs.has(id))
                          }
                          previewFrameChange(`Swap brand to ${c}?`, campaignName, campRows, (camp) => setCampaignClient(camp, c), x, y, holds)
                        }}
                      >
                        <span className="cv-branch-ch">▤ {c}</span>
                        <span className="cv-branch-mark">{on ? '✓ current' : 'Use'}</span>
                      </button>
                    )
                  })}
                <button className="cv-branch-cancel" onClick={() => setFrameMenu(null)}>Cancel</button>
              </>
            )}
            {frameMenu.kind === 'subject' && (
              <>
                <div className="cv-branch-head">Swap the subject</div>
                <div className="cv-pill-add">
                  <input
                    ref={subjectInputRef}
                    className="cv-pill-input"
                    placeholder="What it's about…"
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') {
                        const v = e.currentTarget.value.trim()
                        if (v && campaignName) { setCampaignSubject(campaignName, v); setFrameMenu(null) }
                      }
                    }}
                  />
                  <button
                    className="cv-pill-add-btn"
                    onClick={() => {
                      const v = subjectInputRef.current?.value.trim()
                      if (v && campaignName) { setCampaignSubject(campaignName, v); setFrameMenu(null) }
                    }}
                  >
                    Set
                  </button>
                </div>
                {(() => {
                  // Reusable subjects = approved library masters + subjects already in
                  // use on this client's campaigns, deduped. Pulling a library subject
                  // onto a campaign is the instance side of master→instance propagation.
                  const libSubjects = (brandLibrary?.subjects ?? [])
                    .filter((s) => s.approved !== false)
                    .map((s) => s.text.trim())
                  const campSubjects = campaignList.map((c) => c.subject?.trim() ?? '')
                  const subjects = [...new Set([...libSubjects, ...campSubjects].filter(Boolean))]
                  if (subjects.length === 0) return null
                  return (
                    <>
                      <div className="cv-branch-head">Or reuse one</div>
                      {subjects.map((subj) => (
                        <button
                          key={subj}
                          className="cv-branch-opt"
                          onClick={() => { if (campaignName) setCampaignSubject(campaignName, subj); setFrameMenu(null) }}
                        >
                          <span className="cv-branch-ch">✦ {subj}</span>
                          <span className="cv-branch-mark">Use</span>
                        </button>
                      ))}
                    </>
                  )
                })()}
                <button className="cv-branch-cancel" onClick={() => setFrameMenu(null)}>Cancel</button>
              </>
            )}
            {frameMenu.kind === 'audience' && (() => {
              const others = (clientAudiences[clientFilter] ?? []).filter(
                (a) => a.name.trim() && a.name.trim() !== (frameMenu.audience ?? '').trim(),
              )
              return (
              <>
                <div className="cv-branch-head">Swap this lane's audience</div>
                {others.length === 0 && <div className="cv-branch-note">No other audiences defined for this brand.</div>}
                {others.map((a) => {
                  // Each audience carries its own living profile — confidence-first.
                  const prof = audienceProfile(a.name, rows)
                  return (
                    <button
                      key={a.id}
                      className="cv-branch-opt cv-proof-opt"
                      title={a.messageAngle}
                      onClick={(e) => {
                        const x = e.clientX, y = e.clientY
                        const from = frameMenu.audience ?? ''
                        const laneRows = rows.filter(
                          (r) => (r.campaign ?? '').trim() === campaignName.trim() && (r.audience ?? '').trim() === from.trim(),
                        )
                        setFrameMenu(null)
                        // Swapping a lane re-tags + re-drafts the whole lane — preview it,
                        // re-checking each asset's proof against the new audience's set.
                        const newProofs = new Set([...(a.rtbEmphasis ?? []), ...(a.rtbs ?? []).map((x) => x.id)])
                        const holds = (r: TrafficRow) => {
                          const ids = assetRtbIds(r)
                          return ids.length === 0 || ids.every((id) => newProofs.has(id))
                        }
                        previewFrameChange(`Swap this lane to ${a.name}?`, campaignName, laneRows, (camp) => void swapCampaignAudience(camp, from, a.name), x, y, holds)
                      }}
                    >
                      <span className="cv-proof-opt-top">
                        <span className="cv-branch-ch">◐ {a.name}</span>
                        <span className="cv-branch-mark">Use</span>
                      </span>
                      <span className={`cv-proof-prof c-${prof.confidence}`}>{profileLabel(prof, 'on')}</span>
                    </button>
                  )
                })}
                <button className="cv-branch-cancel" onClick={() => setFrameMenu(null)}>Cancel</button>
              </>
              )
            })()}
          </div>
        )}

        {/* Frame-change consequence preview — a high-blast-radius change (strategy,
            brand, or audience swap) re-checks every asset built on it. Show the
            blast radius + editable-vs-produced split before committing. */}
        {frameChange && (
          <div className="cv-restage cv-frame" style={menuStyle(frameChange.x, frameChange.y)} onMouseDown={(e) => e.stopPropagation()}>
            <div className="cv-restage-title">{frameChange.title}</div>
            <div className="cv-restage-note">
              Re-checks {frameChange.total} asset{frameChange.total === 1 ? '' : 's'} built on the old frame
              {frameChange.mismatch > 0 ? (
                <>
                  {' — '}
                  <strong className="cv-frame-hold">{frameChange.mismatch} may no longer hold</strong>
                </>
              ) : (
                '.'
              )}
            </div>
            {frameChange.mismatch > 0 && (
              <div className="cv-frame-row cv-frame-warn">
                <span className="cv-frame-dot warn" />
                Their proof point doesn't carry to the new frame — re-check the claim.
              </div>
            )}
            <div className="cv-frame-split">
              <div className="cv-frame-row">
                <span className="cv-frame-dot edit" />
                <strong>{frameChange.editable}</strong> editable — we can redraft to the new frame
              </div>
              {frameChange.linked > 0 && (
                <div className="cv-frame-row">
                  <span className="cv-frame-dot prod" />
                  <strong>{frameChange.linked}</strong> produced (video / image / page) — flag for external rework
                </div>
              )}
            </div>
            <div className="cv-restage-actions cv-frame-actions">
              <button className="btn sm" onClick={() => setFrameChange(null)}>
                Cancel
              </button>
              <button
                className="btn sm"
                title="Clone this campaign with the new frame — keeps the original untouched"
                onClick={async () => {
                  const fc = frameChange
                  setFrameChange(null)
                  const clone = await duplicateCampaign(fc.campaign)
                  fc.apply(clone)
                }}
              >
                ⎘ Duplicate &amp; try
              </button>
              <button
                className="btn sm green"
                onClick={() => {
                  frameChange.apply(frameChange.campaign)
                  setFrameChange(null)
                }}
              >
                ✓ Change &amp; redraft
              </button>
            </div>
          </div>
        )}

        {/* Re-check flag popover — a produced/linked asset that fell off its proof
            after a frame change. We can't auto-edit produced media, so the fix is
            routed OUTSIDE the tool, or the flag is cleared once it's handled. */}
        {recheckMenu && (
          <div className="cv-restage cv-frame" style={menuStyle(recheckMenu.x, recheckMenu.y)} onMouseDown={(e) => e.stopPropagation()}>
            <div className="cv-restage-title">⚠ This asset may no longer hold</div>
            <div className="cv-restage-note">
              {recheckMenu.row.recheckFlag?.reason}
              {recheckMenu.row.recheckFlag?.frame ? <> — raised by <strong>{recheckMenu.row.recheckFlag.frame}</strong>.</> : '.'}
              {' '}It's produced (video / image / page), so the words are welded in — fix it where it lives.
            </div>
            <div className="cv-restage-actions cv-frame-actions">
              <button className="btn sm" onClick={() => setRecheckMenu(null)}>
                Close
              </button>
              <a
                className="btn sm"
                href={assetHref(recheckMenu.row)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the asset at its source to rework it"
                onClick={() => setRecheckMenu(null)}
              >
                ↗ Fix where it lives
              </a>
              <button
                className="btn sm green"
                title="Clear the flag once the asset has been reworked (or the mismatch is accepted)"
                onClick={() => {
                  void clearRecheckFlag(recheckMenu.row.id)
                  setRecheckMenu(null)
                }}
              >
                ✓ Mark resolved
              </button>
            </div>
          </div>
        )}

        {/* Restage confirmation — a stage move can re-draft a whole thread, so it's
            confirmed before anything changes. */}
        {restageConfirm && (
          <div
            className="cv-restage"
            style={menuStyle(restageConfirm.x, restageConfirm.y)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cv-restage-title">Move to {restageConfirm.toLabel}?</div>
            <div className="cv-restage-note">
              {restageConfirm.count === 1
                ? "Re-drafts this card's CTA for the new stage."
                : `Re-drafts the CTA on ${restageConfirm.count} cards — this card plus the ${restageConfirm.count - 1} connected below it.`}
            </div>
            <div className="cv-restage-actions">
              <button className="btn sm" onClick={cancelRestage}>
                Cancel
              </button>
              <button className="btn sm green" onClick={confirmRestage}>
                ✓ Move
              </button>
            </div>
          </div>
        )}

        {/* Pill swap menu — switch the proof point (re-drafts the copy) or the CTA. */}
        {pillMenu && pillMenu.kind === 'proof' && (() => {
          const opts = rtbsForCampaign(pillMenu.row.campaign)
          const current = new Set(assetRtbIds(pillMenu.row))
          return (
            <div className="cv-branch-menu" style={menuStyle(pillMenu.x, pillMenu.y)} onMouseDown={(e) => e.stopPropagation()}>
              <div className="cv-branch-title">{current.size ? 'Swap the proof point' : 'Add a proof point'}</div>
              <div className="cv-branch-note">Re-drafts this card and everything downstream of it in the branch around the claim.</div>
              <div className="cv-pill-add">
                <input
                  ref={proofInputRef}
                  className="cv-pill-input"
                  placeholder="Write a proof point…"
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      const v = e.currentTarget.value.trim()
                      if (v) { addProof(pillMenu.row, v); setPillMenu(null) }
                    }
                  }}
                />
                <button
                  className="cv-pill-add-btn"
                  onClick={() => {
                    const v = proofInputRef.current?.value.trim()
                    if (v) { addProof(pillMenu.row, v); setPillMenu(null) }
                  }}
                >
                  Add
                </button>
              </div>
              {opts.length > 0 && <div className="cv-branch-head">Or reuse one</div>}
              {opts.map((rtb) => {
                const on = current.has(rtb.id)
                const draft = !isApprovedProof(rtb)
                // The proof's living track record, across every message that used
                // it (lineage). Confidence-first — we show, the human chooses.
                const prof = proofProfile(rtb.id, rows)
                return (
                  <div className="cv-branch-optrow" key={rtb.id}>
                    <button
                      className={`cv-branch-opt cv-proof-opt${on ? ' added' : ''}`}
                      title={rtb.detail}
                      onClick={() => swapProof(pillMenu.row, rtb)}
                    >
                      <span className="cv-proof-opt-top">
                        <span className="cv-branch-ch">
                          ◆ {rtb.label}
                          {draft && <span className="cv-proof-draft">Draft</span>}
                        </span>
                        <span className="cv-branch-mark">{on ? '✓ current' : 'Use'}</span>
                      </span>
                      <span className={`cv-proof-prof c-${prof.confidence}`}>{profileLabel(prof)}</span>
                    </button>
                    {draft && (
                      <button
                        className="cv-proof-approve"
                        title="Approve as a library master — a blessed, on-brand proof"
                        onClick={() => approveProof(rtb.id)}
                      >
                        ✓ Approve
                      </button>
                    )}
                  </div>
                )
              })}
              <button className="cv-branch-cancel" onClick={() => setPillMenu(null)}>
                Close
              </button>
            </div>
          )
        })()}
        {pillMenu && pillMenu.kind === 'cta' && (() => {
          const cur = assetCta(pillMenu.row)
          const hasSlot = messagingFields(pillMenu.row.channel, pillMenu.row.assetType).some((f) => isCtaField(f.key))
          const opts = [...new Set(scoped.map(assetCta).filter(Boolean))].sort()
          return (
            <div className="cv-branch-menu" style={menuStyle(pillMenu.x, pillMenu.y)} onMouseDown={(e) => e.stopPropagation()}>
              <div className="cv-branch-title">{assetCta(pillMenu.row) ? 'Swap the CTA' : 'Add a CTA'}</div>
              {!hasSlot && <div className="cv-branch-note">This channel folds the CTA into the caption — the one you set here carries as the asset's call-to-action.</div>}
              <div className="cv-pill-add">
                <input
                  ref={ctaInputRef}
                  className="cv-pill-input"
                  placeholder="Write a CTA…"
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      const v = e.currentTarget.value.trim()
                      if (v) { swapCta(pillMenu.row, v); setPillMenu(null) }
                    }
                  }}
                />
                <button
                  className="cv-pill-add-btn"
                  onClick={() => {
                    const v = ctaInputRef.current?.value.trim()
                    if (v) { swapCta(pillMenu.row, v); setPillMenu(null) }
                  }}
                >
                  Add
                </button>
              </div>
              {opts.length > 0 && <div className="cv-branch-head">Or reuse one</div>}
              {opts.map((c) => {
                  const on = c === cur
                  return (
                    <button
                      key={c}
                      className={`cv-branch-opt${on ? ' added' : ''}`}
                      onClick={() => swapCta(pillMenu.row, c)}
                    >
                      <span className="cv-branch-ch">↗ {c}</span>
                      <span className="cv-branch-mark">{on ? '✓ current' : 'Use'}</span>
                    </button>
                  )
                })}
              <button className="cv-branch-cancel" onClick={() => setPillMenu(null)}>
                Close
              </button>
            </div>
          )
        })()}

        {/* Plan rollup — the whole journey's performance, when the overlay is on. */}
        {perfMode && perf.plan.topReach > 0 && (
          <div className="cv-plan" onMouseDown={(e) => e.stopPropagation()}>
            <div className="cv-plan-hd">Plan performance</div>
            <div className="cv-plan-funnel">
              {perf.plan.byStage.map((s) => {
                const max = perf.plan.byStage[0]?.reach || 1
                return (
                  <div className="cv-plan-row" key={s.stage}>
                    <span className="cv-plan-stage">{s.label}</span>
                    <span className="cv-plan-bar">
                      <span className="cv-plan-bar-fill" style={{ width: `${Math.max(2, Math.round((s.reach / max) * 100))}%` }} />
                    </span>
                    <span className="cv-plan-val">{formatReach(s.reach)}</span>
                  </div>
                )
              })}
            </div>
            <div className="cv-plan-stat">
              <strong>{(perf.plan.convRate * 100).toFixed(1)}%</strong> of reach gets to a conversion asset
            </div>
            {perf.plan.bestPath.length > 1 && (
              <div className="cv-plan-path">
                <span className="cv-plan-k">Best path</span>
                {perf.plan.bestPath.map((n) => n.name).join(' → ')}
              </div>
            )}
            {perf.plan.weakestFork && (
              <div className="cv-plan-leak">
                <span className="cv-plan-k">Biggest leak</span>
                {perf.plan.weakestFork.name} ({(perf.plan.weakestFork.flow * 100).toFixed(1)}% advance)
              </div>
            )}
          </div>
        )}

        {/* Zoom controls float bottom-left over the canvas. stopPropagation keeps a
            button press from kicking off a pan. */}
        <div className="cv-zoom cv-zoom-float" onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => zoom(-1)} title="Zoom out">
            −
          </button>
          <button onClick={() => zoom(1)} title="Zoom in">
            ＋
          </button>
          <button onClick={fit} title="Fit to view">
            ⊡ Fit
          </button>
          <button
            className="cv-zoom-organize"
            onClick={() => {
              setMoved({})
              fit()
            }}
            title="Organize canvas — snap every card back to the auto-layout and fit to view"
          >
            ⊞ Organize
          </button>
          <button
            className={`cv-zoom-organize${artboardMode ? ' on' : ''}`}
            onClick={() => setArtboardMode((v) => !v)}
            title="Artboard — drag a frame around a set of cards to group them (Esc to cancel)"
          >
            ▱ Artboard
          </button>
        </div>
        {/* Personalize — fan the campaign across a dimension (audience, location, …). */}
        {audienceSlabs.length > 0 && (
          <button
            className="cv-add-float cv-personalize-float"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setPersonalizeOpen(true)}
            title="Personalize: fan this campaign across a dimension"
          >
            ⧉ Personalize
          </button>
        )}
        {/* Add an asset — the bottom-right primary action (replaces click-to-add). */}
        {audienceSlabs.length > 0 && (
          <button
            className="cv-add-float"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={openAddAsset}
            title="Add an asset to the canvas"
          >
            ＋ Add asset
          </button>
        )}
      </div>
    </div>
  )
}

/** A cheap dependency key so the layout recomputes when the audience grouping changes. */
function audiencesKey(rows: TrafficRow[]): string {
  return rows.map((r) => `${r.id}:${(r.audience ?? '').trim()}`).join('|')
}

/** Bucket a row's (possibly sprawled) audience string into one of the brand's
 *  defined audiences: exact name match, else the defined audience that shares the
 *  most words, else the first. Falls back to the raw value when none are defined. */
function toDefinedAudience(raw: string, defined: string[]): string {
  if (!defined.length) return raw || 'Unsegmented'
  if (defined.includes(raw)) return raw
  const words = new Set(raw.toLowerCase().match(/[a-z]{4,}/g) ?? [])
  let best = defined[0]
  let bestScore = 0
  for (const d of defined) {
    const score = (d.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** Every non-empty messaging component for an asset, in schema order — the full
 *  copy shown on a card once you zoom in. */
function messageBreakdown(row: TrafficRow): { label: string; value: string; key: string }[] {
  const map = messagingMap(row)
  return messagingFields(row.channel, row.assetType)
    .map((f) => ({ label: f.label, value: (map[f.key] ?? '').trim(), key: f.key }))
    .filter((x) => x.value)
}

/** The rows a message card shows: every non-empty messaging component, then a CTA
 *  (placeholder when the post has none — organic channels fold the CTA into the
 *  caption), then the proof point(s) backing the post (placeholder when none).
 *  Drives both the card render and its height estimate so they stay in sync. */
interface CardRow {
  label: string
  value: string
  muted?: boolean
  /** When set, the row is editable inline (zoomed in): a messaging component by
   *  key, or the copy baked into the art/video itself. */
  edit?: { kind: 'messaging'; key: string } | { kind: 'extracted' }
  /** When set, the row renders its proofs as clickable pills (filter by claim)
   *  instead of a plain value. `draft` marks an unapproved (unvetted) proof. */
  proofs?: { id: string; label: string; draft?: boolean }[]
  /** When set, the row renders the CTA as a clickable pill that isolates every
   *  asset sharing it (the value to filter by — CTA_NONE for the no-CTA bucket). */
  cta?: string
  /** When set, the row has no proof yet — render a clickable "add proof" pill. */
  proofAdd?: boolean
}
function cardRows(row: TrafficRow): CardRow[] {
  // Messaging components, minus the CTA-ish ones — the CTA gets its own pill row.
  const out: CardRow[] = messageBreakdown(row)
    .filter((f) => !isCtaField(f.key))
    .map((f) => ({
      label: f.label,
      value: f.value,
      edit: { kind: 'messaging' as const, key: f.key },
    }))
  // The CTA renders as a clickable pill (isolate every asset on the same CTA),
  // always present — a muted "No CTA" pill flags the gap.
  const cta = assetCta(row)
  out.push({ label: 'CTA', value: cta || 'No CTA', muted: !cta, cta: cta || CTA_NONE })
  // For art/video/link assets, surface the copy written into the creative itself
  // (overlays, VO, on-page text) as its own editable row — so a card carries both
  // the post copy and the in-creative copy.
  if (row.mediaType === 'image' || row.mediaType === 'video' || row.mediaType === 'link') {
    const ec = (row.extractedCopy ?? '').trim()
    out.push({ label: 'In-creative copy', value: ec || 'No in-creative copy', muted: !ec, edit: { kind: 'extracted' } })
  }
  // Always surface the proof point(s) this asset is backed by.
  const proofs = assetRtbIds(row)
    .map((id) => rtbById(row.campaign, id))
    .filter((r): r is Rtb => !!r)
  if (proofs.length) {
    out.push({
      label: proofs.length > 1 ? 'Proof points' : 'Proof point',
      value: proofs.map((p) => p.label).join(' · '),
      proofs: proofs.map((p) => ({ id: p.id, label: p.label, draft: !isApprovedProof(p) })),
    })
  } else {
    out.push({ label: 'Proof point', value: 'No proof attached', muted: true, proofAdd: true })
  }
  return out
}
