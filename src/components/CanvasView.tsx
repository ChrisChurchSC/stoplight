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
import { assetBadge } from '../domain/assetBadge'
import { proxiedMedia } from '../lib/media'

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
// An ingested post's media banner across the TOP of the card, stacked above the copy.
// Kept in sync with .cv-node-media height in index.css; a media card reserves this much
// extra height (the banner sits above the copy, so it ADDS to the card height).
const CARD_MEDIA = 220
const MSG_GAP = 64
// Extra vertical gap between TIERS of the same funnel stage (a card and its
// same-stage child), so a same-stage fork drops down instead of running flat.
const TIER_GAP = 220
// The click-to-add ghost cell that sits at the bottom of every (audience × stage)
// cell, so you can place a card straight onto the canvas.
const ADD_H = 38
const COL_GAP = 80
const BAND_PAD = 220
// Zoom past this and message cards reveal their full messaging breakdown (every
// component), not just the one-line summary — read everything without leaving the map.
const DETAIL_ZOOM = 1.15
// Breathing room below the last row in a band.
const BAND_BOTTOM_PAD = 120
// The spine — Brand → Subject → Strategy → Audience — stacks compactly down the top
// of the canvas as labelled CARDS (each carries its own tag), not full-width bands;
// only the funnel stages below get labelled lane-bands (where a card's row encodes
// its stage). These Y's stack the lanes tightly so the funnel starts high.
// Brand / Subject / Strategy (the canvas frame) now live in the TOP BAR — they govern
// the whole board, so they're not cards on the work surface. The audience lanes are the
// canvas roots, starting at the top.
const AUD_Y = 20
const MSG_Y = 220

// Hand-placed card positions persist per canvas, so a card you drag stays exactly
// where you dropped it across re-layouts, reloads, and canvas switches.
const CARD_POS_KEY = 'stoplight.cardPos.v1'
type PosMap = Record<string, { x: number; y: number }>
function loadCardPos(canvasKey: string): PosMap {
  try {
    const all = JSON.parse(localStorage.getItem(CARD_POS_KEY) || '{}')
    return (all && all[canvasKey]) || {}
  } catch {
    return {}
  }
}
function saveCardPos(canvasKey: string, pos: PosMap): void {
  try {
    const all = JSON.parse(localStorage.getItem(CARD_POS_KEY) || '{}')
    if (Object.keys(pos).length) all[canvasKey] = pos
    else delete all[canvasKey]
    localStorage.setItem(CARD_POS_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable — positions stay in-memory for the session */
  }
}

interface Node {
  id: string
  kind: 'root' | 'audience' | 'message' | 'add'
  x: number
  y: number
  w: number
  h: number
  label: string
  sub?: string
  row?: TrafficRow
  brk?: CoherenceBreak
  flaggedCount?: number
  /** The card's funnel-stage name (its band's label), shown as a chip on the card
   *  now that the funnel bands no longer carry a persistent label. */
  stageLabel?: string
  /** The card's canonical funnel stage, used to colour-coordinate the card (a left
   *  accent stripe + the stage chip) so stages read at a glance without the bands. */
  stage?: FunnelStage
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
  const duplicateCampaign = useTrafficStore((s) => s.duplicateCampaign)
  const swapCampaignAudience = useTrafficStore((s) => s.swapCampaignAudience)
  const clearRecheckFlag = useTrafficStore((s) => s.clearRecheckFlag)
  const regenIds = useTrafficStore((s) => s.regenIds)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const claudeBreaks = useTrafficStore((s) => s.claudeBreaks)
  const claudeBreaksScope = useTrafficStore((s) => s.claudeBreaksScope)
  const coherenceCheckedHash = useTrafficStore((s) => s.coherenceCheckedHash)
  const coherenceChecking = useTrafficStore((s) => s.coherenceChecking)
  const coherenceUnavailable = useTrafficStore((s) => s.coherenceUnavailable)
  const runCoherenceCheck = useTrafficStore((s) => s.runCoherenceCheck)
  const openBreaksQueue = useTrafficStore((s) => s.openBreaks)
  const openReview = useTrafficStore((s) => s.openReview)
  const removeRow = useTrafficStore((s) => s.removeRow)
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
  // Change a card's funnel stage by clicking its stage pill — opens a stage picker.
  const [stageMenu, setStageMenu] = useState<{ rowId: string; x: number; y: number } | null>(null)
  // Swap a lane's audience — the Brand / Subject / Strategy frame now lives in the top
  // bar (CanvasFrameBar); only the per-lane audience swap remains on the canvas.
  const [frameMenu, setFrameMenu] = useState<{ kind: 'audience'; x: number; y: number; audience?: string } | null>(null)
  // Measured banner height per asset (rowId → px), so an ingested image renders at the
  // ART'S real aspect ratio (no crop). Unknown until the image loads, so the card
  // reserves a default then reflows to the true height on load. 0 = failed to load.
  const [mediaH, setMediaH] = useState<Record<string, number>>({})
  // Coalesce image measurements into ONE reflow per frame — otherwise dozens of images
  // loading each trigger a full canvas re-layout (the slow part). Batched via rAF.
  const pendingMediaH = useRef<Record<string, number>>({})
  const mediaRaf = useRef<number | null>(null)
  const queueMediaH = (rowId: string, h: number) => {
    pendingMediaH.current[rowId] = h
    if (mediaRaf.current != null) return
    mediaRaf.current = requestAnimationFrame(() => {
      mediaRaf.current = null
      const batch = pendingMediaH.current
      pendingMediaH.current = {}
      setMediaH((prev) => {
        let changed = false
        const next = { ...prev }
        for (const k in batch) if (prev[k] !== batch[k]) ((next[k] = batch[k]), (changed = true))
        return changed ? next : prev
      })
    })
  }
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
  // Mirror of `moved` for synchronous reads (drag end persists from here, so a save
  // never races the async state update).
  const movedRef = useRef<Record<string, { x: number; y: number }>>({})
  const applyMoved = (next: Record<string, { x: number; y: number }>) => {
    movedRef.current = next
    setMoved(next)
  }
  // The canvas whose hand-placed positions we load/persist (null when not in a
  // single-campaign canvas, e.g. the aggregate Live view).
  const posKey = campaignFilter !== 'all' ? `${clientFilter}|${campaignFilter}` : null
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
  // Marquee (rubber-band) multi-select: drag on empty canvas draws a box and selects
  // every card it touches. `marquee` holds the drag origin (world coords); `marqueeRect`
  // is the live box; `multiSel` is the resulting set of card ids. Hold Space to pan.
  const marquee = useRef<{ x0: number; y0: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set())
  const spaceDown = useRef(false)
  // Selected journey connector (a child row id) — click a line to select, then ✕ or
  // Delete/Backspace to remove it (clears that card's branchOf, unlinking the step).
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const clipboard = useRef<string | null>(null)
  // Load hand-placed card positions for the canvas you're on (and reload them when
  // you switch canvases), so a card sits exactly where it was dropped.
  useEffect(() => {
    applyMoved(posKey ? loadCardPos(posKey) : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey])
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
        // A journey connector unlinks (clears branchOf); an audience connector unassigns
        // the card (clears audience) so it goes back to loose.
        const row = rows.find((r) => r.id === selectedEdge)
        void updateRow(selectedEdge, row?.branchOf ? { branchOf: undefined } : { audience: '' })
        setSelectedEdge(null)
      } else if (e.key === 'Escape') {
        setSelectedEdge(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedEdge, updateRow, rows])
  // A selected card: Delete/Backspace removes it (Cmd/Ctrl+Z to undo), Escape
  // deselects. Ignored while typing, and skipped for audience/add nodes.
  useEffect(() => {
    if (!selected || selected.startsWith('aud-') || selected.startsWith('add-')) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const id = selected
        setSelected(null)
        void removeRow(id)
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, removeRow])
  // A marquee multi-selection: Delete/Backspace removes every selected card (undoable),
  // Escape clears the selection. Ignored while typing.
  useEffect(() => {
    if (multiSel.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const ids = [...multiSel].filter((id) => !id.startsWith('aud-') && !id.startsWith('add-'))
        setMultiSel(new Set())
        ids.forEach((id) => void removeRow(id))
      } else if (e.key === 'Escape') {
        setMultiSel(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [multiSel, removeRow])
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
  // Hold Space to pan (since a plain drag now draws a marquee selection). Track the
  // key so onDown can choose pan vs marquee; ignored while typing in a field.
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        spaceDown.current = true
        wrapRef.current?.classList.add('cv-wrap-pan')
        if (!marquee.current) e.preventDefault() // stop the page scrolling on space
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false
        wrapRef.current?.classList.remove('cv-wrap-pan')
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  // Drag-to-connect: pulling a connector out of a card's edge handle. `connect`
  // holds the source while dragging; `connectLine` (world coords) draws the
  // rubber-band line; `lastScreen` is the cursor at drop, for hit-testing.
  const connect = useRef<{ fromId: string; fromX: number; fromY: number } | null>(null)
  const lastScreen = useRef({ x: 0, y: 0 })
  const [connectLine, setConnectLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // A low-opacity preview of the card this pull would place (a next-step branch off
  // the source) — shown at the cursor end of the line, hidden while over a drop
  // target since dropping there links instead of placing a new card.
  const [connectGhost, setConnectGhost] = useState<{ label: string; stageLabel: string; stage: FunnelStage } | null>(null)
  const [connectOverTarget, setConnectOverTarget] = useState(false)

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

  const { nodes, edges, bands, audienceSlabs, campaignName, bounds } = useMemo(() => {
    // A freshly-created canvas has no rows yet, so fall back to the scoped campaign
    // so its spine + lanes still render (and it's addable) before the first asset.
    const campaignNames = scoped.length
      ? [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))]
      : campaignFilter !== 'all'
        ? [campaignFilter]
        : []
    const campObj = campaignList.find((c) => campaignNames.includes(c.name))
    const strat = campObj?.strategy ?? 'Campaign'
    // The strategy is one of the GTM marketing plans we've already authored — resolve
    // the campaign's strategy to its plan so the funnel bands take the plan's stage flow.
    const stratKey = (campObj?.strategy ?? '').trim().toLowerCase()
    const stratPlan = GTM_STRATEGIES.find(
      (s) => s.key === stratKey || s.name.toLowerCase() === strat.trim().toLowerCase(),
    )
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
      // proof point) in FULL at every zoom level — the copy is never truncated, so a
      // card reserves height for all its lines. Inbound replies append when zoomed in.
      const fields = cardRows(r)
      const inbound = detail ? comments[r.id] ?? [] : []
      if (!fields.length && !inbound.length) return MSG_H
      // Pixel constants track the message-card type scale in index.css (label 18,
      // value 15 / line-height 1.4 ≈ 21, key+gap ≈ 17, padding 14 top+bottom = 28).
      // Rounded up so the reserve never falls short of the rendered card.
      let h = 28 + 24 + 6 // padding + label line + breakdown margin
      // The media banner is stacked above the copy at the art's real aspect ratio. Use
      // the measured height once the image loads; a default reserves space until then.
      if (r.mediaRef) h += (mediaH[r.id] ?? CARD_MEDIA) + 8
      fields.forEach((f, idx) => {
        if (idx) h += 8 // gap between components
        h += 17 // component label + gap
        // Count hard newlines (pre-wrap renders them) PLUS wrapping per line, so a
        // multi-paragraph caption (the real social posts) reserves enough height.
        const lines = f.value.split('\n').reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / 34)), 0)
        h += Math.max(1, lines) * 21 // full copy at all zoom levels (no clamp)
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
      // Two kinds of parent link, laid out differently:
      //  - branchOf: a JOURNEY step. The child flows forward to a later stage and draws
      //    a connecting edge (a downward fork).
      //  - variantOf: a personalization VARIANT. The child is a sibling of its master in
      //    the SAME stage — it sits side by side, flat, with no connecting edge.
      const branchParentOf = (r: TrafficRow) =>
        r.branchOf && byName.has(r.branchOf) && r.branchOf !== r.assetName ? r.branchOf : null
      const variantParentOf = (r: TrafficRow) =>
        r.variantOf && byName.has(r.variantOf) && r.variantOf !== r.assetName ? r.variantOf : null
      const parentOf = (r: TrafficRow) => branchParentOf(r) ?? variantParentOf(r)
      const isVariantLink = (r: TrafficRow) => !branchParentOf(r) && !!variantParentOf(r)
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
        // Tidy-tree lanes: each leaf takes the next lane; a JOURNEY parent centres over
        // its branch children (which drop into the next band). VARIANTS are different —
        // they sit side by side to the RIGHT of their master in the same band (a flat
        // fan), so the master is NOT centred over them.
        const branchChildren = new Map<string, TrafficRow[]>()
        const variantChildren = new Map<string, TrafficRow[]>()
        const roots: TrafficRow[] = []
        for (const r of msgs) {
          const bp = branchParentOf(r)
          const vp = variantParentOf(r)
          if (bp) (branchChildren.get(bp) ?? branchChildren.set(bp, []).get(bp)!).push(r)
          else if (vp) (variantChildren.get(vp) ?? variantChildren.set(vp, []).get(vp)!).push(r)
          else roots.push(r)
        }
        roots.sort(ord)
        let leaf = 0
        const laneOf = new Map<string, number>()
        // `assigning` is the recursion stack — if we re-enter a node mid-recursion
        // the parent links form a cycle, so we break it by treating the node as a
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
          const kids = (branchChildren.get(r.assetName) ?? []).slice().sort(ord)
          let lane: number
          if (!kids.length) {
            lane = leaf
            leaf += 1
          } else {
            const ls = kids.map(assign)
            lane = ls.reduce((s, x) => s + x, 0) / ls.length
          }
          laneOf.set(r.id, lane)
          // Variants of this card fan out to the RIGHT, each taking the next lane (same
          // tier — the relY pass keeps them flush with the master). They recurse so a
          // stacked fan (Audience x Location) keeps spreading sideways.
          for (const v of (variantChildren.get(r.assetName) ?? []).slice().sort(ord)) assign(v)
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
        // A same-stage JOURNEY child steps a full TIER_GAP below its parent (the fork
        // reads as a downward step). A VARIANT instead sits at the SAME tier as its
        // master — flush, side by side — since it's a personalization sibling, not a
        // next step. Collision avoidance below keeps it in its own lane.
        const sameBandParent = parent && relY.has(parent.id) && phaseOf(parent) === pl.stage
        const tierBelow = !sameBandParent
          ? 0
          : isVariantLink(pl.row)
            ? relY.get(parent!.id)!
            : relY.get(parent!.id)! + (hById.get(parent!.id) ?? MSG_H) + TIER_GAP
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

    // Brand · Subject · Strategy (the canvas frame) govern the whole board, so they
    // live in the TOP BAR (see CanvasFrameBar), not as cards here. The audience lanes
    // are the canvas roots.
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
        // The card's canonical funnel stage (colour-coding), resolved the same way as
        // the bands: the playbook's own phase→canon map, or a proportional projection.
        const canonStage = stageDefs
          ? stageDefs[pl.stage].canon
          : FUNNEL_STAGES[phaseToCanon(pl.stage, nPhases, nCanon)].stage
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
          stageLabel: phaseLabels[pl.stage],
          stage: canonStage,
        })
        // Connect the audience only to its entry roots. A journey branch hangs off its
        // parent via the journey edge below; a variant sits beside its master with no
        // edge at all — neither connects to the audience header.
        const hasParent = (link?: string) => !!link && byName.has(link) && link !== pl.row.assetName
        const isRoot = !hasParent(pl.row.branchOf) && !hasParent(pl.row.variantOf)
        // Link a card to its audience only if it actually HAS an assigned audience. An
        // unassigned asset (an ingested live post) with no audience and no parent stays
        // loose — no line to the "Unsegmented" lane, since it belongs to nothing.
        const hasAudience = (pl.row.audience ?? '').trim() !== ''
        if (isRoot && hasAudience) et.push({ fromId: `aud-${p.name}`, toId: pl.row.id, broken: !!brk, kind: 'message' })
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
          // Journey + audience connectors are both selectable/deletable by their child row
          // (journey → the branch card; message → the audience-assigned card).
          childRowId: kind === 'journey' || kind === 'message' ? t.row?.id : undefined,
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
      bounds: { w: maxX, h: bandBottom },
    }
  }, [scoped, audiencesKey(scoped), collapsed, campaignList, clientAudiences, clientFilter, moved, detail, comments, scopeKeyDep, mediaH])

  // Only load a card's image when the card is near the viewport, so a canvas of 80+ real
  // posts doesn't fetch ~28MB up front — images stream in as you pan. Conservative (a big
  // margin + window size ≥ the actual container) so a visible card's image never gets culled.
  const nearViewport = (n: { x: number; y: number; w: number; h: number }): boolean => {
    const M = 700
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1600
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900
    const sx = vp.tx + n.x * vp.s
    const sy = vp.ty + n.y * vp.s
    return sx + n.w * vp.s > -M && sx < vw + M && sy + n.h * vp.s > -M && sy < vh + M
  }

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
    onRemoteMove: (id, x, y) => applyMoved({ ...movedRef.current, [id]: { x, y } }),
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
    setConnectOverTarget(false)
    // Preview the card an empty-canvas drop would place: the source's next-step branch.
    const sugs = n.row ? branchSuggestions(n.row) : []
    const sug = sugs.find((s) => s.group === 'next-step') ?? sugs[0]
    setConnectGhost(sug ? { label: sug.channelLabel, stageLabel: sug.stageLabel, stage: sug.stage } : null)
  }
  const onDown = (e: React.MouseEvent) => {
    if (branchMenu) setBranchMenu(null)
    if (addMenu) setAddMenu(null)
    if (stageMenu) setStageMenu(null)
    if (pillMenu) setPillMenu(null)
    if (recheckMenu) setRecheckMenu(null)
    if (frameMenu) setFrameMenu(null)
    if (frameChange) setFrameChange(null)
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
    // Space held → pan the view; otherwise a drag on empty canvas draws a marquee
    // that multi-selects the cards it touches.
    if (spaceDown.current) {
      pan.current = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty }
      return
    }
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      const wx = (e.clientX - rect.left - vp.tx) / vp.s
      const wy = (e.clientY - rect.top - vp.ty) / vp.s
      marquee.current = { x0: wx, y0: wy }
      setMarqueeRect({ x: wx, y: wy, w: 0, h: 0 })
      setMultiSel(new Set())
      setSelected(null)
    }
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
    setMultiSel(new Set())
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
    // Rubber-band the marquee and live-select every message card it overlaps.
    if (marquee.current && rect) {
      const wx = (e.clientX - rect.left - vp.tx) / vp.s
      const wy = (e.clientY - rect.top - vp.ty) / vp.s
      const box = {
        x: Math.min(marquee.current.x0, wx),
        y: Math.min(marquee.current.y0, wy),
        w: Math.abs(wx - marquee.current.x0),
        h: Math.abs(wy - marquee.current.y0),
      }
      setMarqueeRect(box)
      const hit = new Set<string>()
      for (const n of nodes) {
        if (n.kind !== 'message') continue
        if (n.x < box.x + box.w && n.x + n.w > box.x && n.y < box.y + box.h && n.y + n.h > box.y) hit.add(n.id)
      }
      setMultiSel(hit)
      return
    }
    // Rubber-band the connector to the cursor while pulling one out.
    if (connect.current && rect) {
      const wx = (e.clientX - rect.left - vp.tx) / vp.s
      const wy = (e.clientY - rect.top - vp.ty) / vp.s
      setConnectLine({ x1: connect.current.fromX, y1: connect.current.fromY, x2: wx, y2: wy })
      // Over another card/lane → dropping links (no new card), so drop the ghost.
      const overEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const overId = overEl?.closest<HTMLElement>('.cv-node')?.dataset.nodeId
      setConnectOverTarget(!!overId && overId !== connect.current.fromId)
      return
    }
    if (drag.current) {
      const d = drag.current
      const dx = (e.clientX - d.mx) / vp.s
      const dy = (e.clientY - d.my) / vp.s
      if (Math.abs(dx) + Math.abs(dy) > 3) d.far = true
      const nx = d.sx + dx
      const ny = d.sy + dy
      applyMoved({ ...movedRef.current, [d.id]: { x: nx, y: ny } })
      publishMove(d.id, nx, ny)
      return
    }
    // Capture the pan origin: the setVp updater runs later, and a mouseup could
    // null pan.current before it does (which would throw).
    const p = pan.current
    if (p) setVp((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }))
  }
  const endAll = () => {
    // Finish a marquee: keep whatever it selected (already live in multiSel), clear the
    // box, and suppress the trailing click so it doesn't wipe the selection.
    if (marquee.current) {
      marquee.current = null
      setMarqueeRect(null)
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      return
    }
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
      setConnectGhost(null)
      setConnectOverTarget(false)
      const el = document.elementFromPoint(lastScreen.current.x, lastScreen.current.y) as HTMLElement | null
      const targetId = el?.closest<HTMLElement>('.cv-node')?.dataset.nodeId
      if (targetId && targetId !== c.fromId) {
        const targetNode = nodes.find((n) => n.id === targetId)
        const fromRow = nodes.find((n) => n.id === c.fromId)?.row
        // Dropped on an AUDIENCE header → assign this card to that audience (so a loose
        // ingested post gets a home + a link). Dropping on the "Unsegmented" lane clears it.
        if (targetNode?.kind === 'audience' && fromRow) {
          const name = targetNode.label === 'Unsegmented' ? '' : targetNode.label
          if ((fromRow.audience ?? '').trim() !== name) void updateRows([{ id: fromRow.id, patch: { audience: name } }])
          return
        }
        // Dropped over another card → link them (target branches from source).
        const toRow = targetNode?.row
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
        // Dropped on empty canvas → draft a NEW asset card branched off the source,
        // and place it exactly where it was dropped (matching the ghost preview) so it
        // doesn't jump to the auto-layout slot.
        const from = nodes.find((n) => n.id === c.fromId)
        if (from?.row) {
          const sugs = branchSuggestions(from.row)
          const sug = sugs.find((s) => s.group === 'next-step') ?? sugs[0]
          if (sug) {
            const r = wrapRef.current?.getBoundingClientRect()
            const dropX = r ? (lastScreen.current.x - r.left - vp.tx) / vp.s : null
            const dropY = r ? (lastScreen.current.y - r.top - vp.ty) / vp.s : null
            void doBranch(from.row, sug).then((newId) => {
              if (newId && dropX != null && dropY != null) {
                const next = { ...movedRef.current, [newId]: { x: dropX, y: dropY - 24 } }
                applyMoved(next)
                if (posKey) saveCardPos(posKey, next)
              }
            })
          }
        }
      }
      return
    }
    if (drag.current?.far) {
      // A real drag (not a click) just repositions the card — the new position is
      // already in `moved`. Suppress the trailing click so it doesn't open the card,
      // and persist the final layout so the card stays put across reloads.
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      if (posKey) saveCardPos(posKey, movedRef.current)
    }
    if (drag.current) publishNode(null)
    drag.current = null
    pan.current = null
  }
  const onLeave = () => {
    clearCursor()
    endAll()
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
  async function doBranch(row: TrafficRow, sug: BranchSuggestion): Promise<string | undefined> {
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
    return newRow.id
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
  // Change a card's funnel stage from its stage pill: pin the new stage and refresh
  // the stage-dependent CTA so the messaging matches. The card's pill (label + colour)
  // updates; its position is left as-is (positions are hand-managed now).
  const changeStage = (rowId: string, stage: FunnelStage) => {
    const row = rows.find((r) => r.id === rowId)
    setStageMenu(null)
    if (!row) return
    const cur = row.funnelStage ?? funnelStageFor(row.channel, row.assetType)
    if (stage === cur) return
    const patch: Partial<TrafficRow> = { funnelStage: stage }
    const aud = (clientAudiences[clientFilter] ?? []).find((a) => a.name === (row.audience ?? '').trim())
    const cta = ctaFor(stage, aud?.outcome)
    const map = { ...messagingMap(row) }
    let hit = false
    for (const f of messagingFields(row.channel, row.assetType)) if (isCtaField(f.key)) { map[f.key] = cta; hit = true }
    if (hit) patch.messaging = map
    void updateRow(rowId, patch)
  }

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
        {/* Funnel stages drive the vertical layout of cards, but they're no longer a
            drop target — cards carry their stage as a colour + chip, and dragging a
            card just repositions it (no restage-into-a-section). */}
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
          {marqueeRect && (
            <div
              className="cv-marquee"
              style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
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
              const selectable = (e.kind === 'journey' || e.kind === 'message') && !!e.childRowId
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
                        // Journey connector → unlink (branchOf); audience connector → unassign.
                        void updateRow(e.childRowId!, e.kind === 'journey' ? { branchOf: undefined } : { audience: '' })
                        setSelectedEdge(null)
                      }}
                    >
                      <title>{e.kind === 'journey' ? 'Delete this connection' : 'Unassign from this audience'}</title>
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
          {/* Ghost preview of the card an empty-canvas drop would place — a faint
              stand-in that follows the cursor end of the connector line. */}
          {connectGhost && connectLine && !connectOverTarget && (
            <div
              className={`cv-node k-message cv-node-ghost stage-${connectGhost.stage}`}
              style={{ left: connectLine.x2, top: connectLine.y2 - 24, width: MSG_W }}
            >
              <span className="cv-node-badge badge-draft">Draft</span>
              <span className="cv-node-stage">{connectGhost.stageLabel}</span>
              <div className="cv-node-label">
                <span className="cv-node-label-name">New {connectGhost.label}</span>
              </div>
              <div className="cv-node-sub">Drop to draft this next step</div>
            </div>
          )}
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
              className={`cv-node k-${n.kind}${n.stage ? ` stage-${n.stage}` : ''}${n.kind === 'audience' && n.label === 'Unsegmented' ? ' loose' : ''}${n.brk ? ' broke' : ''}${selected === n.id || multiSel.has(n.id) ? ' selected' : ''}${regen ? ' regen' : ''}`}
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
                // A plain click replaces any marquee multi-selection with just this card.
                if (n.kind === 'message') {
                  setSelected(n.id)
                  setMultiSel(new Set())
                }
                // Click an audience lane to swap its audience (Brand / Subject / Strategy
                // now live in the top bar).
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
              {n.kind === 'message' && n.row?.mediaRef && nearViewport(n) && (
                // The real media of an ingested post, shown at the ART'S aspect ratio (no
                // crop). On load we measure natural w/h and reserve the true banner height.
                // Only loaded when the card is near the viewport (streams in as you pan).
                <div className="cv-node-media" key={n.row.mediaRef}>
                  <img
                    src={proxiedMedia(n.row.mediaRef, 720)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => {
                      const img = e.currentTarget
                      const h = img.naturalWidth ? Math.round(((MSG_W - 22) * img.naturalHeight) / img.naturalWidth) : CARD_MEDIA
                      queueMediaH(n.row!.id, h)
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      queueMediaH(n.row!.id, 0)
                    }}
                  />
                </div>
              )}
              {(
              <div className="cv-node-body">
                {n.kind === 'audience' && (
                  <span className="cv-node-tag">{n.label === 'Unsegmented' ? 'No audience' : 'Audience'}</span>
                )}
                {n.kind === 'message' && n.row && (() => {
                  const b = assetBadge(n.row)
                  return <span className={`cv-node-badge badge-${b.kind}`}>{b.label}</span>
                })()}
                {n.kind === 'message' && n.row && n.stageLabel && (
                  <button
                    className="cv-node-stage"
                    title="Change funnel stage"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setStageMenu({ rowId: n.row!.id, x: e.clientX, y: e.clientY })
                    }}
                  >
                    {n.stageLabel}
                  </button>
                )}
                <div className="cv-node-label">
                  <span className="cv-node-label-name">{n.kind === 'audience' && n.label === 'Unsegmented' ? 'Unassigned' : n.label}</span>
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
                              <span className="cv-node-fval">{fld.value}</span>
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
                <div className="cv-node-actions">
                  <button
                    className="cv-node-del"
                    title="Delete this card (Cmd/Ctrl+Z to undo)"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (selected === n.id) setSelected(null)
                      void removeRow(n.row!.id)
                    }}
                  >
                    🗑 Delete
                  </button>
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
                </div>
              )}
              {n.kind === 'message' &&
                (['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                  <span
                    key={edge}
                    className={`cv-node-handle handle-${edge}`}
                    title="Drag to connect this card to another asset, or to an audience lane to assign it"
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

        {/* Stage picker — click a card's stage pill to move it to another funnel stage. */}
        {stageMenu && (() => {
          const row = rows.find((r) => r.id === stageMenu.rowId)
          const cur = row ? row.funnelStage ?? funnelStageFor(row.channel, row.assetType) : null
          return (
            <div className="cv-branch-menu" style={menuStyle(stageMenu.x, stageMenu.y)} onMouseDown={(e) => e.stopPropagation()}>
              <div className="cv-branch-head">Move to funnel stage</div>
              {bands.map((b) => (
                <button
                  key={b.key}
                  className={`cv-branch-opt${b.stage === cur ? ' on' : ''}`}
                  onClick={() => changeStage(stageMenu.rowId, b.stage)}
                >
                  <span className="cv-branch-ch">{b.label}</span>
                  {b.stage === cur && <span className="cv-branch-mark">✓</span>}
                </button>
              ))}
              <button className="cv-branch-cancel" onClick={() => setStageMenu(null)}>
                Cancel
              </button>
            </div>
          )
        })()}

        {/* Audience-lane swap menu (Brand / Subject / Strategy live in the top bar). */}
        {frameMenu && (
          <div className="cv-branch-menu cv-strat-menu" style={menuStyle(frameMenu.x, frameMenu.y)} onMouseDown={(e) => e.stopPropagation()}>
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
              applyMoved({})
              if (posKey) saveCardPos(posKey, {})
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
  // No audience assigned (e.g. an ingested live post) is genuinely unassigned — never
  // guess it into a real audience; it stays loose and unlinked.
  if (!raw) return 'Unsegmented'
  if (!defined.length) return raw
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
