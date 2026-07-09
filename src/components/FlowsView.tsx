import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CHANNELS } from '../domain/channels'
import { DELIVERABLE_PRESETS, type DeliverablePreset, type FlowDeliverable, freshNodeId, nodeAssetCount, presetByKey, TONE_HEX } from '../domain/flows'
import type { FlowRefType, FlowReference } from '../domain/clients'
import { newAudience } from '../domain/audiences'
import { generateFlowEdit } from '../adapters/ask/generateFlowEdit'
import type { FlowCommand, FlowChatMsg } from '../domain/flowAgent'
import { FlowChat, type ChatIntent } from './FlowChat'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import type { CopySource } from '../adapters/copy/draftWriter'
import type { Deliverable } from '../domain/strategyAssets'
import type { ChannelId, TrafficRow } from '../domain/types'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { SheetGrid } from './SheetGrid'
import { CalendarView } from './CalendarView'
import { FlowsHome } from './FlowsHome'

/**
 * Flows — the campaign home + builder. A switcher lists the brand's campaigns; picking
 * one opens it as a read-only flow (its deliverables reverse-engineered from its assets)
 * with a jump to the canvas for detailed work. "New campaign" is the builder: a brief
 * node plus deliverable nodes you pick from a palette, and "Build" seeds a real draft
 * campaign (optionally writing copy), staying in the flow. Campaigns + canvas stay intact.
 */

const CAMPAIGN_TONE = '#ff6347'

// Icon per Records type, matching each page's sidebar-nav icon (Companies / People /
// Segments / Media mix), so a tag reads the same as the page it comes from.
const RECORD_TYPE_ICON: Record<FlowRefType, ReactNode> = {
  company: (
    <>
      <rect x="4" y="3" width="9" height="18" rx="1.4" />
      <path d="M13 8h7v13H4" />
      <path d="M7 7h3M7 11h3M7 15h3M16 12h0M16 16h0" />
    </>
  ),
  person: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M4 20a5 5 0 0 1 10 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17 14.5a5 5 0 0 1 3 5.5" />
    </>
  ),
  segment: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 13 10 5 10-5" />
    </>
  ),
  'media-mix': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </>
  ),
}
const RECORD_TYPE_LABEL: Record<FlowRefType, string> = { company: 'Company', person: 'Person', segment: 'Segment', 'media-mix': 'Media mix' }
const RecordTypeIcon = ({ type }: { type: FlowRefType }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {RECORD_TYPE_ICON[type]}
  </svg>
)

// A recurring deliverable (newsletter, social) breaks into monthly posts. A lead magnet
// (ebook, whitepaper) breaks into sections. Both show briefable sub-cards; other one-offs
// (landing page, event) stay a single asset.
const hasSubcards = (p: DeliverablePreset): boolean =>
  !(p.brand || p.runtime === 'one-off') || p.channel === 'lead-magnet'
// The word for a sub-card: monthly posts vs ebook sections.
const subcardWord = (p: DeliverablePreset): string => (p.channel === 'lead-magnet' ? 'Section' : 'Post')
// Sub-cards a deliverable shows: monthly cadence, or a lead magnet's sections (default 4).
const subcardCount = (p: DeliverablePreset, perMonth: number): number =>
  hasSubcards(p) ? Math.min(perMonth, 12) : 0
// Count a freshly-added deliverable starts with (lead magnets get a few sections).
const startCount = (p: DeliverablePreset): number => (p.channel === 'lead-magnet' ? 4 : p.perMonth)

const PresetTile = ({ tone }: { tone: string }) => (
  <span className="flow-tile" style={{ background: `color-mix(in srgb, ${tone} 20%, transparent)`, color: tone }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="7" rx="1.6" />
      <path d="M4 16h11" />
      <path d="M19 14v5M16.5 16.5h5" />
    </svg>
  </span>
)

const CampaignTile = () => (
  <span className="flow-tile" style={{ background: `color-mix(in srgb, ${CAMPAIGN_TONE} 20%, transparent)`, color: CAMPAIGN_TONE }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4h11l-1.5 3.5L16 11H5" />
    </svg>
  </span>
)

type ViewDeliverable = { key: string; label: string; tone: string; channel: ChannelId; assetType: string; count: number; rows: TrafficRow[] }

// An ingested / real posted asset (from the Library), as opposed to a generated idea.
const isIngestedPost = (r: TrafficRow): boolean =>
  r.status === 'posted' || !!r.postedAt || (!!r.sourceUrl && r.source !== 'generated')
const postReach = (r: TrafficRow): number => {
  const m = r.socialMetrics ?? {}
  return (typeof m.views === 'number' ? m.views : 0) || (typeof m.impressions === 'number' ? m.impressions : 0)
}
// A post has media spend if it carries a paid budget or logged spend, or sits on a paid channel.
const hasMediaSpend = (r: TrafficRow): boolean =>
  (r.budget?.amount ?? 0) > 0 || (r.spend?.toDate ?? 0) > 0 || CHANNELS[r.channel as ChannelId]?.kind === 'paid'
const usdShort = (n: number): string => '$' + n.toLocaleString()
// Compact label of a post's media budget / spend, for the chip on paid posts.
const spendLabel = (r: TrafficRow): string => {
  if ((r.spend?.toDate ?? 0) > 0) return usdShort(r.spend!.toDate)
  if ((r.budget?.amount ?? 0) > 0) return r.budget!.type === 'daily' ? `${usdShort(r.budget!.amount)}/day` : usdShort(r.budget!.amount)
  return 'Paid'
}
const spendTitle = (r: TrafficRow): string =>
  (r.spend?.toDate ?? 0) > 0 ? `Media spend: ${usdShort(r.spend!.toDate)}` : (r.budget?.amount ?? 0) > 0 ? `Media budget: ${usdShort(r.budget!.amount)}` : 'Paid media placement'

// The lead line + a body preview for a viewed asset, pulled from whatever fields its
// channel actually uses (subject/headline/title lead; body/caption/etc. as the body), so
// the flow shows the real generated copy rather than an empty count.
function viewPostCopy(r: TrafficRow): { head: string; body: string } {
  const m = (r.messaging ?? {}) as Record<string, string>
  const head = m.subject || m.headline || m.title || r.assetName || ''
  let body = ''
  for (const k of ['body', 'caption', 'primary', 'description', 'preview']) {
    if (m[k]?.trim()) { body = m[k]; break }
  }
  if (!body) body = Object.values(m).find((v) => v && v.trim() && v !== head) ?? ''
  return { head, body }
}

// A rounded right-angle connector from a source port (exits right) to a target (enters left).
/** Draw a path through an axis-aligned polyline, rounding each interior corner by r
 *  (clamped so it never overshoots a short leg). Keeps the right-angle look while
 *  softening the corners like the forward elbow. */
function roundedPath(pts: { x: number; y: number }[], r: number): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const inLen = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)
    const outLen = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y)
    const rr = Math.max(0, Math.min(r, inLen / 2, outLen / 2))
    const bx = p1.x - Math.sign(p1.x - p0.x) * rr
    const by = p1.y - Math.sign(p1.y - p0.y) * rr
    const ax = p1.x + Math.sign(p2.x - p1.x) * rr
    const ay = p1.y + Math.sign(p2.y - p1.y) * rr
    d += ` L ${bx} ${by} Q ${p1.x} ${p1.y} ${ax} ${ay}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

// `scale` (the canvas zoom, 1 = 100%) keeps the elbow geometry proportional to the
// zoomed node spacing: the corner radius and lane offsets are screen pixels, so without
// scaling they overwhelm the shrunken gaps between nodes when zoomed out and the routing
// looks busy and overshoots.
function elbowPath(sx: number, sy: number, tx: number, ty: number, scale = 1): string {
  const s = Math.max(0.25, Math.min(1, scale))
  const r = 14 * s
  // Straight run when the ports line up and the target is to the right.
  if (Math.abs(ty - sy) < 3 && tx > sx) return `M ${sx} ${sy} H ${tx}`
  // Target at or to the LEFT of the source's exit port: the same right-angle elbow,
  // flopped. The source port faces right, so exit rightward, drop to a lane, run left,
  // then come back into the target's left edge going right. All right angles (rounded),
  // matching the forward elbow — no double-back bend, arrowhead still points inward.
  if (tx <= sx + 24 * s) {
    const gap = 40 * s
    const sep = Math.abs(ty - sy)
    const laneY = sep >= 96 * s ? (sy + ty) / 2 : Math.max(sy, ty) + 56 * s
    return roundedPath(
      [
        { x: sx, y: sy },
        { x: sx + gap, y: sy },
        { x: sx + gap, y: laneY },
        { x: tx - gap, y: laneY },
        { x: tx - gap, y: ty },
        { x: tx, y: ty },
      ],
      r,
    )
  }
  // Forward (left-to-right): a rounded right-angle elbow.
  const midX = tx > sx + 80 * s ? (sx + tx) / 2 : sx + 40 * s
  const dir = ty > sy ? 1 : -1
  return `M ${sx} ${sy} H ${midX - r} Q ${midX} ${sy} ${midX} ${sy + r * dir} V ${ty - r * dir} Q ${midX} ${ty} ${midX + r} ${ty} H ${tx}`
}

export function FlowsView() {
  const { brands, canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const setCampaignReferences = useTrafficStore((s) => s.setCampaignReferences)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const companies = useTrafficStore((s) => s.companies)
  const people = useTrafficStore((s) => s.people)
  const mediaMixes = useTrafficStore((s) => s.mediaMixes)
  const seedCampaignAssets = useTrafficStore((s) => s.seedCampaignAssets)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const draftCopy = useTrafficStore((s) => s.draftCopy)
  const previewFlowCopy = useTrafficStore((s) => s.previewFlowCopy)
  const updateRow = useTrafficStore((s) => s.updateRow)
  const flowOpen = useTrafficStore((s) => s.flowOpen)
  const clearFlowOpen = useTrafficStore((s) => s.clearFlowOpen)
  const setFlowCanvasOpen = useTrafficStore((s) => s.setFlowCanvasOpen)
  const flowChats = useTrafficStore((s) => s.flowChats)
  const saveFlowChat = useTrafficStore((s) => s.saveFlowChat)
  const deleteFlowChat = useTrafficStore((s) => s.deleteFlowChat)
  const openProject = useTrafficStore((s) => s.openProject)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)

  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  // The brand's Segments records (the Segments page IS the brand's audiences).
  const brandSegments = clientAudiences[brand] ?? []
  const audienceNames = useMemo(() => brandSegments.map((a) => a.name), [brandSegments])

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [budget, setBudget] = useState('')
  const [flightWeeks, setFlightWeeks] = useState(12)
  // Build-mode record-tag selection (Companies / People / Segments / Media mix). null =
  // not touched yet, so it defaults to all of the brand's segments.
  const [briefRefs, setBriefRefs] = useState<FlowReference[] | null>(null)
  const [nodes, setNodes] = useState<FlowDeliverable[]>([])
  const [sel, setSel] = useState<'campaign' | string | null>('campaign')
  const [pickAt, setPickAt] = useState<number | null>(null)
  const [building, setBuilding] = useState(false)
  // Build always writes copy now (the toggle was removed); kept as a constant so the
  // preview + build paths that reference it stay unchanged.
  const writeCopy = true
  const [built, setBuilt] = useState<{ name: string; count: number; copy: boolean; source: CopySource | null } | null>(null)
  // Live draft copy per deliverable node, generated when it's added (and on redraft).
  // Ephemeral UI state: never seeded into rows or localStorage until you Build.
  const [preview, setPreview] = useState<Record<string, { loading: boolean; source: CopySource | null; posts: { headline: string; primary: string }[] }>>({})
  // How the flow-in-progress is shown: the canvas, or a grid / calendar of its assets.
  const [flowView, setFlowView] = useState<'flow' | 'grid' | 'calendar'>('flow')
  // The Flows section opens on an all-flows landing page; picking a flow (or New flow)
  // drops into the canvas. The "Flows" breadcrumb returns here.
  const [flowScreen, setFlowScreen] = useState<'home' | 'canvas'>('home')
  // Collapse the sidebar (to a rail) whenever a flow canvas is open; restore on leave/unmount.
  useEffect(() => {
    setFlowCanvasOpen(flowScreen === 'canvas')
    return () => setFlowCanvasOpen(false)
  }, [flowScreen, setFlowCanvasOpen])
  // Flow-canvas AI chat (agentic: it edits the flow from chat).
  const [chatMsgs, setChatMsgs] = useState<FlowChatMsg[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [briefCollapsed, setBriefCollapsed] = useState(false)
  const chatIdRef = useRef(0)
  const nextChatId = () => `msg_${++chatIdRef.current}_${chatMsgs.length}`
  // null = the new-campaign builder; a name = viewing that existing campaign as a flow.
  const [viewName, setViewName] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  // View-mode Audiences record selector (which segment records this flow targets).
  const [audMenuOpen, setAudMenuOpen] = useState(false)
  const [newAudName, setNewAudName] = useState('')
  // Build-brief: which record-tag row's dropdown is open ("<type>:<id>" or "add").
  const [openTagKey, setOpenTagKey] = useState<string | null>(null)
  // Swap a generated-idea post for a real ingested post from the library.
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapSearch, setSwapSearch] = useState('')
  // References changed since the last generation → offer a Regenerate button.
  const [refsDirty, setRefsDirty] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  // Canvas controls (the bottom toolbar).
  const [zoom, setZoom] = useState(100)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [tool, setTool] = useState<'select' | 'pan'>('select')
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const spaceHeld = useRef(false)
  const [spaceCursor, setSpaceCursor] = useState(false)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const marqueeStart = useRef<{ x0: number; y0: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Free-move: per-card translate offsets, applied on top of the layout. Dragging a
  // selected card moves the whole selection.
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({})
  const dragging = useRef<{ ids: string[]; x: number; y: number; start: Record<string, { x: number; y: number }> } | null>(null)
  // Connectors between nodes, plus the in-progress drag and measured node rects.
  const canvasRef = useRef<HTMLDivElement>(null)
  // Zoom + pan mirrored into refs so the wheel handler reads the latest values without a
  // re-render lag between rapid events (cursor-anchored zoom needs both at once).
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  // Zoom to a target percent while keeping the screen point (screenX/screenY) fixed. The
  // stack scales from its top-left (transform-origin 0 0), so only offset moves its
  // top-left: we shift offset so the anchor point stays put. This is what makes zoom feel
  // smooth (it grows toward the cursor) instead of lurching away from it.
  const zoomAt = (target: number, screenX: number, screenY: number) => {
    const s0 = zoomRef.current / 100
    const z1 = Math.min(200, Math.max(25, target))
    const s1 = z1 / 100
    const sRect = canvasRef.current?.querySelector('.flow-stack')?.getBoundingClientRect()
    const o0 = offsetRef.current
    let no = o0
    if (sRect) {
      const ax = screenX - sRect.left
      const ay = screenY - sRect.top
      no = { x: o0.x + ax * (1 - s1 / s0), y: o0.y + ay * (1 - s1 / s0) }
    }
    zoomRef.current = z1
    offsetRef.current = no
    setZoom(z1)
    setOffset(no)
  }
  // Native, non-passive wheel handler (React's onWheel is passive, so it can't
  // preventDefault). This matches how Attio's canvas zooms: pinch (ctrlKey) or Cmd+scroll
  // zooms toward the cursor, and we suppress the browser's own page zoom / back-swipe.
  // Pinch deltas are tiny so they get a stronger step; a plain scroll pans.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const d = Math.max(-100, Math.min(100, e.deltaY))
        zoomAt(zoomRef.current * Math.exp(-d * (e.ctrlKey ? 0.01 : 0.006)), e.clientX, e.clientY)
      } else {
        const o0 = offsetRef.current
        offsetRef.current = { x: o0.x - e.deltaX, y: o0.y - e.deltaY }
        setOffset(offsetRef.current)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // Re-attach when the canvas (re)mounts: Flows opens on the home where canvasRef is
    // null, so the listener must bind once you enter a flow, not only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowScreen, flowView])
  const [connectors, setConnectors] = useState<{ from: string; to: string }[]>([])
  const [drawing, setDrawing] = useState<{ from: string; x: number; y: number } | null>(null)
  const drawingFrom = useRef<string | null>(null)
  const [rects, setRects] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({})
  // Canvas "add": drag out of a node's +, drop to open a block picker; the new card is
  // created at the drop point and connected back to the source node.
  const [addMenu, setAddMenu] = useState<{ at: number; from: string; x: number; y: number } | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const addDrag = useRef<{ from: string; at: number } | null>(null)
  const pendingPlace = useRef<{ id: string; x: number; y: number } | null>(null)
  const startConnect = (e: ReactMouseEvent, from: string) => {
    if (spaceHeld.current) return
    e.stopPropagation()
    const cv = canvasRef.current
    if (!cv) return
    const cr = cv.getBoundingClientRect()
    drawingFrom.current = from
    setDrawing({ from, x: e.clientX - cr.left, y: e.clientY - cr.top })
  }
  const startDrag = (e: ReactMouseEvent, id: string) => {
    if (tool !== 'select' || spaceHeld.current) return
    if ((e.target as HTMLElement).closest('input, textarea, button, select')) return
    e.stopPropagation()
    const ids = selected.has(id) && selected.size ? [...selected] : [id]
    if (!selected.has(id)) setSelected(new Set(ids))
    const start: Record<string, { x: number; y: number }> = {}
    ids.forEach((i) => {
      start[i] = pos[i] ?? { x: 0, y: 0 }
    })
    dragging.current = { ids, x: e.clientX, y: e.clientY, start }
  }

  // "B" opens the deliverable picker; holding Space temporarily pans (like Figma).
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === ' ') {
        e.preventDefault()
        if (!spaceHeld.current) {
          spaceHeld.current = true
          setSpaceCursor(true)
        }
        return
      }
      if (e.key.toLowerCase() === 'b' && viewName === null) {
        e.preventDefault()
        setPickAt(nodes.length)
        setSel(null)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeld.current = false
        setSpaceCursor(false)
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [nodes.length, viewName])

  // Default the new flow to all of the brand's segments; the record labels feed generation.
  const defaultBriefRefs: FlowReference[] = brandSegments.map((a) => ({ type: 'segment', id: a.id, label: a.name }))
  const briefRefsEffective = briefRefs ?? defaultBriefRefs
  const audSelection = briefRefsEffective.length ? briefRefsEffective.map((r) => r.label) : audienceNames
  const refKey = (r: { type: FlowRefType; id: string }) => `${r.type}:${r.id}`
  const hasBriefRef = (type: FlowRefType, id: string) => briefRefsEffective.some((r) => r.type === type && r.id === id)
  const commitBriefRefs = (next: FlowReference[]) => {
    setBriefRefs(next)
    scheduleRedraftAll()
  }
  // Add a record tag (skip if already tagged); remove one; or swap which record a row points to.
  const addBriefRef = (type: FlowRefType, id: string, label: string) => {
    if (!hasBriefRef(type, id)) commitBriefRefs([...briefRefsEffective, { type, id, label }])
  }
  const removeBriefRef = (key: string) => commitBriefRefs(briefRefsEffective.filter((r) => refKey(r) !== key))
  const replaceBriefRef = (key: string, type: FlowRefType, id: string, label: string) =>
    commitBriefRefs(briefRefsEffective.map((r) => (refKey(r) === key ? { type, id, label } : r)))

  // Campaign-level generation inputs held in refs so the debounced redraft-all reads
  // the LATEST values (no stale closures in the timer callback).
  const subjectRef = useRef(subject)
  subjectRef.current = subject
  const flightRef = useRef(flightWeeks)
  flightRef.current = flightWeeks
  const audRef = useRef(audSelection)
  audRef.current = audSelection
  const writeCopyRef = useRef(writeCopy)
  writeCopyRef.current = writeCopy
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const lastSubjectRef = useRef(subject)

  // Generate live draft copy for a deliverable node (all its post slots in one call).
  // Fires when the node is added and on redraft; a no-op when copy is toggled off or no
  // brand is bound. Each post is anchored to the campaign brief — its subject is the
  // THEME, its flight the TIMEFRAME, plus the selected audiences and the post's own
  // brief. Runs against Claude when connected, the heuristic otherwise.
  const genPreview = async (node: FlowDeliverable) => {
    if (!writeCopyRef.current || !brand) return
    const p = presetByKey(node.presetKey)
    if (!p) return
    const slots = Math.max(1, subcardCount(p, node.perMonth))
    const briefs = Array.from({ length: slots }, (_, i) => node.briefs?.[i] ?? node.description ?? '')
    const auds = node.audience ? [node.audience] : audRef.current
    setPreview((pv) => ({ ...pv, [node.id]: { loading: true, source: pv[node.id]?.source ?? null, posts: pv[node.id]?.posts ?? [] } }))
    try {
      const res = await previewFlowCopy({
        client: brand,
        channel: p.channel,
        assetType: p.assetType,
        briefs,
        audiences: auds,
        theme: subjectRef.current.trim() || undefined,
        flightWeeks: flightRef.current,
      })
      setPreview((pv) => ({ ...pv, [node.id]: { loading: false, source: res?.source ?? null, posts: res?.posts ?? [] } }))
    } catch {
      setPreview((pv) => ({ ...pv, [node.id]: { loading: false, source: null, posts: [] } }))
    }
  }
  // Redraft every deliverable against the current campaign brief. Debounced so rapid
  // changes (flight ±, audience toggles) coalesce into ONE regeneration pass.
  const redraftTimer = useRef<number | null>(null)
  const scheduleRedraftAll = () => {
    if (redraftTimer.current) window.clearTimeout(redraftTimer.current)
    redraftTimer.current = window.setTimeout(() => {
      for (const n of nodesRef.current) void genPreview(n)
    }, 500)
  }
  // Subject is a text field: redraft when you leave it, and only if it actually changed.
  const onSubjectCommit = () => {
    if (subject.trim() === lastSubjectRef.current.trim()) return
    lastSubjectRef.current = subject
    scheduleRedraftAll()
  }
  // The draft-copy block shown under a deliverable / post card. Shimmer while the
  // first draft is generating, then headline + body for that slot.
  const renderCopy = (nodeId: string, slot: number) => {
    if (!writeCopy) return null
    const pv = preview[nodeId]
    const post = pv?.posts?.[slot]
    if (pv?.loading && !(post?.headline || post?.primary)) {
      return (
        <div className="flow-copy loading" aria-hidden="true">
          <span className="flow-copy-shim" />
          <span className="flow-copy-shim short" />
        </div>
      )
    }
    if (!post || (!post.headline && !post.primary)) return null
    return (
      <div className="flow-copy">
        {post.headline && <div className="flow-copy-head">{post.headline}</div>}
        {post.primary && <div className="flow-copy-body">{post.primary}</div>}
      </div>
    )
  }

  // The brand's existing campaigns (for the switcher).
  const brandCampaigns = useMemo(
    () =>
      canvases
        .filter((c) => c.client === brand && c.name !== CONTENT_LIBRARY_CAMPAIGN)
        .map((c) => ({ name: c.name, count: c.rows.filter((r) => !r.archivedAt).length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [canvases, brand],
  )

  const viewCanvas = viewName ? canvases.find((c) => c.name === viewName) : null
  const viewRows = useMemo(() => (viewCanvas ? viewCanvas.rows.filter((r) => !r.archivedAt) : []), [viewCanvas])
  const viewDelivs: ViewDeliverable[] = useMemo(() => {
    const map = new Map<string, ViewDeliverable>()
    for (const r of viewRows) {
      const key = `${r.channel}|${r.assetType}`
      const cur = map.get(key)
      if (cur) { cur.count++; cur.rows.push(r) }
      else {
        const preset = DELIVERABLE_PRESETS.find((p) => p.channel === r.channel && p.assetType === r.assetType)
        const label = preset?.label ?? `${CHANNELS[r.channel as ChannelId]?.label ?? r.channel} · ${r.assetType || 'asset'}`
        const tone = preset ? TONE_HEX[preset.tone] : CHANNELS[r.channel as ChannelId]?.kind === 'paid' ? TONE_HEX.gold : TONE_HEX.blue
        map.set(key, { key, label, tone, channel: r.channel as ChannelId, assetType: r.assetType ?? '', count: 1, rows: [r] })
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [viewRows])
  const viewAudiences = useMemo(() => [...new Set(viewRows.map((r) => (r.audience ?? '').trim()).filter(Boolean))], [viewRows])
  const viewFlight = campaignList.find((c) => c.name === viewName)?.durationWeeks
  const viewShort = viewName ? viewName.replace(`${brand} — `, '') : ''

  // The records this flow references, drawn from the Records pages (Companies / People /
  // Segments / Media mix). These references drive asset generation.
  const viewCampaign = useMemo(() => campaignList.find((c) => c.name === viewName), [campaignList, viewName])
  const flowRefs = viewCampaign?.references ?? []
  const brandMixesForRefs = useMemo(() => mediaMixes.filter((m) => m.brand === brand), [mediaMixes, brand])
  // The four Records pages, as selectable tag groups. Segments ARE the brand's audiences
  // (that's what the Segments records page shows), so they come from clientAudiences.
  const recordGroups = useMemo(
    () => [
      { type: 'company' as FlowRefType, label: 'Companies', items: companies.map((c) => ({ id: c.id, label: c.name })) },
      { type: 'person' as FlowRefType, label: 'People', items: people.map((p) => ({ id: p.id, label: p.name })) },
      { type: 'segment' as FlowRefType, label: 'Segments', items: brandSegments.map((a) => ({ id: a.id, label: a.name })) },
      { type: 'media-mix' as FlowRefType, label: 'Media mix', items: brandMixesForRefs.map((m) => ({ id: m.id, label: m.name })) },
    ],
    [companies, people, brandSegments, brandMixesForRefs],
  )
  const hasRef = (type: FlowRefType, id: string) => flowRefs.some((r) => r.type === type && r.id === id)
  const toggleRef = (type: FlowRefType, id: string, label: string) => {
    if (!viewName) return
    const on = hasRef(type, id)
    setCampaignReferences(viewName, on ? flowRefs.filter((r) => !(r.type === type && r.id === id)) : [...flowRefs, { type, id, label }])
    setRefsDirty(true)
  }
  const addSegmentRecord = () => {
    const nm = newAudName.trim()
    if (!nm || !viewName || !brand) return
    const seg = newAudience({ name: nm })
    setClientAudiences(brand, [...brandSegments, seg])
    setCampaignReferences(viewName, [...flowRefs, { type: 'segment', id: seg.id, label: nm }])
    setNewAudName('')
    setRefsDirty(true)
  }
  // Regenerate the flow's asset copy so it reflects the newly referenced records.
  // draftCopy only fills EMPTY fields and de-duplicates what it writes, so clear each
  // post's copy first: that forces a real rewrite and lets the anti-repetition pass keep
  // every post distinct, unlike the template redraft that collapses same-audience posts.
  const regenerateFlow = async () => {
    if (!viewName || regenerating) return
    const ids = viewRows.map((r) => r.id)
    if (!ids.length) return
    setRegenerating(true)
    try {
      await Promise.all(ids.map((id) => updateRow(id, { messaging: {} })))
      await draftCopy(ids)
    } finally {
      setRegenerating(false)
      setRefsDirty(false)
    }
  }

  // The brand's real ingested posts (from the Library), most-reached first — the pool a
  // generated-idea post can be swapped for.
  const ingestedPosts = useMemo(
    () => canvases.filter((c) => c.client === brand).flatMap((c) => c.rows).filter(isIngestedPost).sort((a, b) => postReach(b) - postReach(a)),
    [canvases, brand],
  )

  const addPreset = (p: DeliverablePreset) => {
    const node: FlowDeliverable = { id: freshNodeId(), presetKey: p.key, perMonth: startCount(p) }
    const at = pickAt ?? nodes.length
    setNodes((n) => {
      const copy = [...n]
      copy.splice(Math.min(at, copy.length), 0, node)
      return copy
    })
    setPickAt(null)
    setSel(node.id)
    void genPreview(node)
  }
  // View mode: add a deliverable straight into the opened flow's campaign (seed its rows
  // and write their copy), so an existing flow can grow without leaving Flows or rebuilding.
  const [addingDeliv, setAddingDeliv] = useState(false)
  const addViewDeliverable = async (p: DeliverablePreset) => {
    if (!viewName || addingDeliv) return
    setPickAt(null)
    setAddingDeliv(true)
    try {
      const auds = flowRefs.length ? flowRefs.map((r) => r.label) : viewAudiences.length ? viewAudiences : audSelection
      const d: Deliverable = { label: p.label, channel: p.channel, assetType: p.assetType, media: p.media, perMonth: startCount(p), runtime: p.runtime, brand: p.brand }
      const before = new Set(useTrafficStore.getState().rows.filter((r) => r.campaign === viewName).map((r) => r.id))
      await seedCampaignAssets(viewName, [d], { flightWeeks: viewFlight ?? flightWeeks, audiences: auds })
      const fresh = useTrafficStore.getState().rows.filter((r) => r.campaign === viewName && !before.has(r.id))
      if (fresh.length) await draftCopy(fresh.map((r) => r.id))
    } finally {
      setAddingDeliv(false)
    }
  }
  // Start dragging a new-block connector out of a node's +.
  const startAdd = (e: ReactMouseEvent, at: number, from: string) => {
    e.stopPropagation()
    const cr = canvasRef.current?.getBoundingClientRect()
    if (!cr) return
    addDrag.current = { from, at }
    drawingFrom.current = from
    setPickAt(null)
    setSel(null)
    setDrawing({ from, x: e.clientX - cr.left, y: e.clientY - cr.top })
  }
  const addFromMenu = (p: DeliverablePreset) => {
    if (!addMenu) return
    const id = freshNodeId()
    const node: FlowDeliverable = { id, presetKey: p.key, perMonth: startCount(p) }
    const { at, from, x, y } = addMenu
    setNodes((n) => {
      const c = [...n]
      c.splice(Math.min(at, c.length), 0, node)
      return c
    })
    setConnectors((c) => [...c, { from, to: id }])
    pendingPlace.current = { id, x, y }
    setAddMenu(null)
    setSel(id)
    void genPreview(node)
  }
  const menuGroups = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    const filtered = q ? DELIVERABLE_PRESETS.filter((p) => p.label.toLowerCase().includes(q) || p.group.toLowerCase().includes(q)) : DELIVERABLE_PRESETS
    const map = new Map<string, DeliverablePreset[]>()
    for (const p of filtered) {
      const a = map.get(p.group) ?? []
      a.push(p)
      map.set(p.group, a)
    }
    return [...map.entries()]
  }, [addSearch])
  const removeNode = (id: string) => {
    setNodes((n) => n.filter((x) => x.id !== id))
    if (sel === id) setSel(null)
  }
  const setCadence = (id: string, perMonth: number) => setNodes((n) => n.map((x) => (x.id === id ? { ...x, perMonth: Math.max(1, perMonth) } : x)))
  const setNodeField = (id: string, patch: Partial<FlowDeliverable>) => setNodes((n) => n.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const setBrief = (id: string, i: number, val: string) =>
    setNodes((n) =>
      n.map((x) => {
        if (x.id !== id) return x
        const briefs = [...(x.briefs ?? [])]
        briefs[i] = val
        return { ...x, briefs }
      }),
    )
  const startNew = () => {
    setViewName(null)
    setBuilt(null)
    setNodes([])
    setPreview({})
    setName('')
    setSubject('')
    setBudget('')
    setBriefRefs(null)
    lastSubjectRef.current = ''
    setSel('campaign')
    setPickAt(null)
    setCampaignFilter('all')
  }
  const openView = (n: string) => {
    setViewName(n)
    setBuilt(null)
    setPickAt(null)
    setSel('campaign')
    // Opening a flow also opens a tab for it (and lights that tab as active), so the
    // top strip tracks the flow you're in, matching how a tab click opens a flow.
    openProject(n)
    setCampaignFilter(n)
  }

  // A project tab (or any openFlow caller) asked to open a specific flow here. Consume the
  // signal: '' opens a fresh builder, a name opens that campaign in view mode.
  useEffect(() => {
    if (flowOpen === null) return
    if (flowOpen === '') startNew()
    else {
      openView(flowOpen)
      setFlowView('flow')
    }
    setFlowScreen('canvas')
    clearFlowOpen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowOpen])

  const grouped = useMemo(() => {
    const map = new Map<string, DeliverablePreset[]>()
    for (const p of DELIVERABLE_PRESETS) {
      const arr = map.get(p.group) ?? []
      arr.push(p)
      map.set(p.group, arr)
    }
    return [...map.entries()]
  }, [])

  // Every deliverable is pre-wired to each of its per-month post cards (the same SVG
  // connectors you can draw by hand), so they arrive connected to the main card.
  const implicitConnectors = useMemo(() => {
    const out: { from: string; to: string }[] = []
    if (viewName !== null) {
      // A viewed flow wires campaign → each deliverable → each of its posts.
      for (const d of viewDelivs) {
        out.push({ from: 'campaign', to: d.key })
        for (const r of d.rows) out.push({ from: d.key, to: r.id })
      }
      return out
    }
    for (const n of nodes) {
      // Every deliverable hangs off the campaign card.
      out.push({ from: 'campaign', to: n.id })
      const p = presetByKey(n.presetKey)
      if (!p || p.brand || p.runtime === 'one-off') continue
      const slots = Math.min(n.perMonth, 12)
      for (let bi = 0; bi < slots; bi++) out.push({ from: n.id, to: `${n.id}:${bi}` })
    }
    return out
  }, [nodes, viewName, viewDelivs])

  // The campaign name this flow builds into (must match build()'s naming) — used to scope
  // the real Grid / Calendar to just this flow's assets.
  const flowCampaign = viewName ?? `${brand ? `${brand} — ` : ''}${name.trim() || 'New campaign'}`
  // Whether this campaign has any built rows yet (so the grid/calendar can hint to Build).
  const hasBuiltRows = useTrafficStore((s) => s.rows.some((r) => r.campaign === flowCampaign))

  // Measure node positions (canvas-local) so the SVG connectors track them as nodes
  // move, pan, and zoom.
  useLayoutEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const cr = cv.getBoundingClientRect()
    const next: Record<string, { x: number; y: number; w: number; h: number }> = {}
    cv.querySelectorAll('.flow-node[data-node-id]').forEach((el) => {
      const r = el.getBoundingClientRect()
      const id = (el as HTMLElement).dataset.nodeId
      if (id) next[id] = { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }
    })
    setRects(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, pos, offset, zoom, selected, connectors, viewName, chatCollapsed, briefCollapsed])

  // Once a just-created card is measured, nudge it to where it was dropped.
  useEffect(() => {
    const pp = pendingPlace.current
    if (pp && rects[pp.id]) {
      const r = rects[pp.id]
      setPos((prev) => ({ ...prev, [pp.id]: { x: (prev[pp.id]?.x ?? 0) + (pp.x - r.x), y: (prev[pp.id]?.y ?? 0) + (pp.y - r.y) } }))
      pendingPlace.current = null
    }
  }, [rects])

  // Core build: seed a campaign + its deliverables + copy from an EXPLICIT config, so the
  // AI agent can build from a computed snapshot without racing React state. The UI button
  // wraps this with the builder's current state.
  const buildFlow = async (cfg: {
    name: string
    subject: string
    budget: string
    flightWeeks: number
    refs: FlowReference[]
    audiences: string[]
    nodes: FlowDeliverable[]
  }) => {
    if (!cfg.nodes.length || building) return
    setBuilding(true)
    const campaignName = `${brand ? `${brand} — ` : ''}${cfg.name.trim() || 'New campaign'}`
    try {
      if (brand) addCampaign({ name: campaignName, client: brand, strategy: 'content-seo', subject: cfg.subject.trim() || undefined, durationWeeks: cfg.flightWeeks, overallBudget: cfg.budget ? Math.max(0, +cfg.budget || 0) : undefined })
      if (cfg.refs.length) setCampaignReferences(campaignName, cfg.refs)
      const allNewIds: string[] = []
      for (const n of cfg.nodes) {
        const p = presetByKey(n.presetKey)
        if (!p) continue
        const auds = n.audience ? [n.audience] : cfg.audiences
        const d: Deliverable = { label: p.label, channel: p.channel, assetType: p.assetType, media: p.media, perMonth: n.perMonth, runtime: p.runtime, brand: p.brand }
        const before = new Set(useTrafficStore.getState().rows.filter((r) => r.campaign === campaignName).map((r) => r.id))
        await seedCampaignAssets(campaignName, [d], { flightWeeks: cfg.flightWeeks, audiences: auds })
        const fresh = useTrafficStore.getState().rows.filter((r) => r.campaign === campaignName && !before.has(r.id))
        const briefs = (n.briefs ?? []).map((b) => b.trim()).filter(Boolean)
        if (briefs.length) {
          const ordered = [...fresh].sort((a, b) => Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || ''))
          for (let i = 0; i < ordered.length; i++) {
            const brief = briefs[i % briefs.length]
            await updateRow(ordered[i].id, {
              assetName: `${ordered[i].assetName} · ${brief}`,
              lineage: { ...(ordered[i].lineage ?? {}), brief },
            })
          }
        }
        allNewIds.push(...fresh.map((r) => r.id))
      }
      let source: CopySource | null = null
      if (writeCopy && allNewIds.length) source = await draftCopy(allNewIds)
      setBuilt({ name: campaignName, count: allNewIds.length, copy: writeCopy, source })
      return campaignName
    } finally {
      setBuilding(false)
    }
  }
  const build = () =>
    buildFlow({ name, subject, budget, flightWeeks, refs: briefRefsEffective, audiences: audSelection, nodes })

  // Resolve record-tag labels back to structured references via the record groups.
  const labelsToRefs = (labels: string[]): FlowReference[] => {
    const out: FlowReference[] = []
    for (const l of labels) {
      for (const g of recordGroups) {
        const it = g.items.find((i) => i.label === l)
        if (it) { out.push({ type: g.type, id: it.id, label: it.label }); break }
      }
    }
    return out
  }

  // Apply the AI's commands to the flow. Build-mode commands mutate the builder (and the
  // canvas) and can end in a `build`; view-mode commands edit the open flow in place.
  // Returns human-readable summaries of what was applied.
  const applyFlowCommands = async (cmds: FlowCommand[]): Promise<string[]> => {
    const applied: string[] = []
    if (viewName !== null) {
      for (const c of cmds) {
        if (c.op === 'addDeliverable') {
          const p = presetByKey(c.preset)
          if (p) { await addViewDeliverable(p); applied.push(`Added ${p.label}`) }
        } else if (c.op === 'setRecordTags') {
          const refs = labelsToRefs(c.labels)
          setCampaignReferences(viewName, refs)
          setRefsDirty(true)
          applied.push(`Tagged ${refs.length} record${refs.length === 1 ? '' : 's'}`)
        } else if (c.op === 'regenerate') {
          await regenerateFlow()
          applied.push('Regenerated the copy')
        }
      }
      return applied
    }
    // Build mode: keep a working copy so a same-turn `build` sees every prior edit.
    let wName = name, wSubject = subject, wBudget = budget, wFlight = flightWeeks
    let wNodes = [...nodesRef.current]
    let wRefs = [...briefRefsEffective]
    for (const c of cmds) {
      switch (c.op) {
        case 'setName': setName(c.value); wName = c.value; applied.push(`Named it "${c.value}"`); break
        case 'setSubject': setSubject(c.value); wSubject = c.value; applied.push('Set the theme'); break
        case 'setBudget': setBudget(String(c.value)); wBudget = String(c.value); applied.push(`Set budget $${Math.round(c.value).toLocaleString()}`); break
        case 'setFlight': setFlightWeeks(c.weeks); wFlight = c.weeks; applied.push(`Set flight to ${c.weeks} week${c.weeks === 1 ? '' : 's'}`); break
        case 'addDeliverable': {
          const p = presetByKey(c.preset)
          if (!p) break
          const node: FlowDeliverable = { id: freshNodeId(), presetKey: p.key, perMonth: c.perMonth ?? startCount(p) }
          wNodes = [...wNodes, node]
          setNodes((ns) => [...ns, node])
          void genPreview(node)
          applied.push(`Added ${p.label}${!(p.brand || p.runtime === 'one-off') ? ` (${node.perMonth}/month)` : ''}`)
          break
        }
        case 'removeDeliverable': {
          const p = presetByKey(c.preset)
          wNodes = wNodes.filter((n) => n.presetKey !== c.preset)
          setNodes((ns) => ns.filter((n) => n.presetKey !== c.preset))
          if (p) applied.push(`Removed ${p.label}`)
          break
        }
        case 'setRecordTags': {
          const refs = labelsToRefs(c.labels)
          wRefs = refs
          setBriefRefs(refs)
          applied.push(`Tagged ${refs.length} record${refs.length === 1 ? '' : 's'}`)
          break
        }
        case 'build': {
          const auds = wRefs.length ? wRefs.map((r) => r.label) : audienceNames
          const nm = await buildFlow({ name: wName, subject: wSubject, budget: wBudget, flightWeeks: wFlight, refs: wRefs, audiences: auds, nodes: wNodes })
          if (nm) applied.push(`Built ${wNodes.length} deliverable${wNodes.length === 1 ? '' : 's'} and wrote the copy`)
          break
        }
      }
    }
    return applied
  }

  // A human-readable one-liner for a pending command (shown in the Suggestions block).
  const describeCommand = (c: FlowCommand): string => {
    switch (c.op) {
      case 'setName': return `Name it "${c.value}"`
      case 'setSubject': return 'Set the campaign theme'
      case 'setBudget': return `Set budget to $${Math.round(c.value).toLocaleString()}`
      case 'setFlight': return `Set flight to ${c.weeks} week${c.weeks === 1 ? '' : 's'}`
      case 'addDeliverable': { const p = presetByKey(c.preset); return `Add ${p?.label ?? c.preset}${c.perMonth ? ` (${c.perMonth}/month)` : ''}` }
      case 'removeDeliverable': { const p = presetByKey(c.preset); return `Remove ${p?.label ?? c.preset}` }
      case 'setRecordTags': return `Tag ${c.labels.length} record${c.labels.length === 1 ? '' : 's'}: ${c.labels.join(', ')}`
      case 'build': return 'Build the flow and write the copy'
      case 'regenerate': return 'Regenerate the copy'
    }
  }

  const runFlowChat = async (text: string, intent: ChatIntent) => {
    const t = text.trim()
    if (!t || chatBusy) return
    setChatMsgs((m) => [...m, { id: nextChatId(), role: 'user', text: t }])
    setChatBusy(true)
    try {
      const presets = DELIVERABLE_PRESETS.map((p) => ({ key: p.key, label: p.label, channel: p.channel, group: p.group }))
      const records = {
        companies: companies.map((c) => c.name),
        people: people.map((p) => p.name),
        segments: brandSegments.map((a) => a.name),
        mediaMixes: brandMixesForRefs.map((m) => m.name),
      }
      const flow = viewName !== null
        ? {
            mode: 'view' as const,
            name: viewShort,
            subject: viewCampaign?.subject ?? '',
            budget: viewCampaign?.overallBudget ?? null,
            flightWeeks: viewFlight ?? flightWeeks,
            deliverables: viewDelivs.map((d) => {
              const p = DELIVERABLE_PRESETS.find((x) => x.channel === d.channel && x.assetType === d.assetType)
              return { preset: p?.key ?? d.key, label: d.label, perMonth: d.count }
            }),
            recordTags: flowRefs.map((r) => r.label),
          }
        : {
            mode: 'build' as const,
            name,
            subject,
            budget: budget ? +budget : null,
            flightWeeks,
            deliverables: nodesRef.current.map((n) => ({ preset: n.presetKey, label: presetByKey(n.presetKey)?.label ?? n.presetKey, perMonth: n.perMonth })),
            recordTags: briefRefsEffective.map((r) => r.label),
          }
      const res = await generateFlowEdit({
        brand,
        intent,
        flow,
        presets,
        records,
        message: t,
        history: chatMsgs.slice(-6).map((m) => ({ role: m.role, text: m.text })),
      })
      // Analyze (or no edits proposed) is answer-only. Build proposes edits as a pending
      // Suggestions block the user approves before they apply.
      const commands = intent === 'analyze' ? [] : res.commands
      const suggestions = commands.map(describeCommand)
      setChatMsgs((m) => [...m, { id: nextChatId(), role: 'assistant', text: res.reply, live: res.live, commands: commands.length ? commands : undefined, suggestions: suggestions.length ? suggestions : undefined }])
    } catch {
      setChatMsgs((m) => [...m, { id: nextChatId(), role: 'assistant', text: 'Something went wrong. Try rephrasing.', live: false }])
    } finally {
      setChatBusy(false)
    }
  }

  // Apply / discard a message's pending suggestions.
  const applyPendingChat = async (msgId: string) => {
    const msg = chatMsgs.find((m) => m.id === msgId)
    if (!msg?.commands || chatBusy) return
    setChatBusy(true)
    try {
      await applyFlowCommands(msg.commands)
      setChatMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: 'applied' } : x)))
    } finally {
      setChatBusy(false)
    }
  }
  const discardPendingChat = (msgId: string) =>
    setChatMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: 'discarded' } : x)))

  // New chat + history. The active chat is saved to history (keyed by the flow) before
  // it's cleared or another is opened.
  const chatFlowKey = viewName ?? '__new-flow__'
  const flowHistory = useMemo(() => flowChats.filter((c) => c.flowKey === chatFlowKey), [flowChats, chatFlowKey])
  const persistActiveChat = () => {
    if (!chatMsgs.length) return
    const firstUser = chatMsgs.find((m) => m.role === 'user')
    saveFlowChat({ id: `chat_${chatMsgs[0].id}`, flowKey: chatFlowKey, title: (firstUser?.text ?? 'Chat').slice(0, 60), messages: chatMsgs, createdAt: Date.now() })
  }
  const newFlowChat = () => {
    persistActiveChat()
    setChatMsgs([])
  }
  const openHistoryChat = (id: string) => {
    const h = flowChats.find((c) => c.id === id)
    if (!h) return
    persistActiveChat()
    setChatMsgs(h.messages)
  }

  const viewing = viewName !== null
  const selDeliv = viewing ? viewDelivs.find((d) => d.key === sel) : null
  const selPost = viewing ? viewRows.find((r) => r.id === sel) : null

  // Candidates for a swap: ingested posts on the same channel as the selected post first,
  // filtered by the search box; excludes the post itself.
  const swapCandidates = useMemo(() => {
    if (!selPost) return []
    const q = swapSearch.trim().toLowerCase()
    const sameChannel = ingestedPosts.filter((r) => r.channel === selPost.channel && r.id !== selPost.id)
    const pool = sameChannel.length ? sameChannel : ingestedPosts.filter((r) => r.id !== selPost.id)
    if (!q) return pool
    return pool.filter((r) => (r.assetName ?? '').toLowerCase().includes(q) || Object.values((r.messaging ?? {}) as Record<string, string>).some((v) => v?.toLowerCase().includes(q)))
  }, [selPost, ingestedPosts, swapSearch])

  // Replace the selected generated-idea post's content with a real ingested post, keeping
  // its slot in the flow (id, campaign, schedule, audience) so it stays in place.
  const swapForIngested = async (cand: TrafficRow) => {
    if (!selPost) return
    await updateRow(selPost.id, {
      assetName: cand.assetName,
      channel: cand.channel,
      assetType: cand.assetType,
      mediaType: cand.mediaType,
      messaging: cand.messaging,
      source: cand.source,
      sourceUrl: cand.sourceUrl,
      socialMetrics: cand.socialMetrics,
      engagement: cand.engagement,
      status: 'posted',
      postedAt: cand.postedAt,
      publishedAt: cand.publishedAt,
    })
    setSwapOpen(false)
    setSwapSearch('')
  }
  useEffect(() => {
    setSwapOpen(false)
    setSwapSearch('')
  }, [sel])
  useEffect(() => {
    setRefsDirty(false)
  }, [viewName])
  const menuAnchor =
    addMenu && rects[addMenu.from]
      ? (() => {
          const r = rects[addMenu.from]
          const cw = canvasRef.current?.clientWidth ?? 900
          const ch = canvasRef.current?.clientHeight ?? 700
          return {
            x: Math.min(Math.max(addMenu.x, 8), cw - 292),
            y: Math.min(Math.max(addMenu.y - 20, 8), ch - 300),
            sx: r.x + r.w,
            sy: r.y + r.h / 2,
          }
        })()
      : null

  // The all-flows landing page. Picking a flow opens it in the canvas; New flow starts a
  // fresh builder. (A remount when you re-enter the Flows section returns you here.)
  if (flowScreen === 'home') {
    return (
      <FlowsHome
        brand={brand}
        onOpen={(name) => {
          openView(name)
          setFlowView('flow')
          setFlowScreen('canvas')
        }}
        onNew={() => {
          startNew()
          setFlowView('flow')
          setFlowScreen('canvas')
        }}
      />
    )
  }

  return (
    <div className={`flow${chatCollapsed ? ' chat-collapsed' : ''}${briefCollapsed ? ' brief-collapsed' : ''}`}>
      <header className="flow-top">
        <div className="flow-crumb">
          <span className="flow-crumb-ic" aria-hidden="true">
            ⋔
          </span>
          <button className="flow-crumb-home" onClick={() => setFlowScreen('home')} title="All flows">
            Flows
          </button>
          <span className="flow-crumb-sep">/</span>
          <button className="flow-switcher" onClick={() => setSwitcherOpen((o) => !o)}>
            {viewing ? viewShort : name.trim() || 'New campaign'}
            <span className="flow-switcher-caret">▾</span>
          </button>
          {switcherOpen && (
            <>
              <div className="flow-switch-scrim" onClick={() => setSwitcherOpen(false)} />
              <div className="flow-switch-menu">
                <button className="flow-switch-item flow-switch-new" onClick={() => { startNew(); setSwitcherOpen(false) }}>
                  + New campaign
                </button>
                {brandCampaigns.length > 0 && <div className="flow-switch-sep" />}
                {brandCampaigns.map((c) => (
                  <button key={c.name} className={`flow-switch-item${viewName === c.name ? ' active' : ''}`} onClick={() => { openView(c.name); setSwitcherOpen(false) }}>
                    <span className="flow-switch-name">{c.name.replace(`${brand} — `, '')}</span>
                    <span className="flow-switch-count">{c.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flow-top-right">
          <div className="flow-viewtabs">
            {(['flow', 'grid', 'calendar'] as const).map((v) => (
              <button key={v} className={`flow-viewtab${flowView === v ? ' on' : ''}`} onClick={() => setFlowView(v)}>
                {v === 'flow' ? 'Flow' : v === 'grid' ? 'Grid' : 'Calendar'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {built && (
        <div className="flow-built">
          <div className="flow-built-card">
            <div className="flow-built-check" aria-hidden="true">
              ✓
            </div>
            <div className="flow-built-title">Campaign built</div>
            <div className="flow-built-sub">
              {built.name.replace(`${brand} — `, '')} · {built.count} draft asset{built.count === 1 ? '' : 's'}
            </div>
            {built.copy && built.source && (
              <div className={`flow-built-badge ${built.source}`}>
                {built.source === 'claude' ? (
                  <>
                    <span className="flow-built-badge-dot" aria-hidden="true" />
                    {built.count} draft{built.count === 1 ? '' : 's'} written by Claude
                  </>
                ) : (
                  <>
                    <span className="flow-built-badge-dot" aria-hidden="true" />
                    Written offline · add Anthropic API credits for Claude drafts
                  </>
                )}
              </div>
            )}
            <div className="flow-built-actions">
              <button className="flow-built-open" onClick={() => { openView(built.name); setFlowView('flow') }}>
                Open flow
              </button>
              <button className="flow-built-new" onClick={startNew}>
                Start another
              </button>
            </div>
          </div>
        </div>
      )}

      {flowView === 'flow' && (
        <>
      <div className="flow-body">
        <FlowChat
          messages={chatMsgs}
          busy={chatBusy}
          flowMode={viewing ? 'view' : 'build'}
          history={flowHistory}
          collapsed={chatCollapsed}
          onCollapse={setChatCollapsed}
          onSend={runFlowChat}
          onApply={applyPendingChat}
          onDiscard={discardPendingChat}
          onNewChat={newFlowChat}
          onOpenHistory={openHistoryChat}
          onDeleteHistory={deleteFlowChat}
        />
        <div
          ref={canvasRef}
          className={`flow-canvas${tool === 'pan' || spaceCursor ? ' panning' : ''}`}
          onMouseDown={(e) => {
            // Hand tool (or held space) pans; arrow tool drags a selection box on empty canvas.
            const t = e.target as HTMLElement
            const onBackground = !t.closest('.flow-node, .flow-brief-card, button, input, textarea, select')
            if (tool === 'pan' || spaceHeld.current) {
              pan.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
            } else if (onBackground) {
              const r = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - r.left
              const y = e.clientY - r.top
              marqueeStart.current = { x0: x, y0: y }
              setMarquee({ x0: x, y0: y, x1: x, y1: y })
              setSelected(new Set())
              setSel(null)
            }
          }}
          onMouseMove={(e) => {
            if (drawingFrom.current) {
              const cr = e.currentTarget.getBoundingClientRect()
              setDrawing({ from: drawingFrom.current, x: e.clientX - cr.left, y: e.clientY - cr.top })
            } else if (dragging.current) {
              const scale = zoom / 100
              const dx = (e.clientX - dragging.current.x) / scale
              const dy = (e.clientY - dragging.current.y) / scale
              const d = dragging.current
              setPos((prev) => {
                const next = { ...prev }
                d.ids.forEach((i) => {
                  next[i] = { x: d.start[i].x + dx, y: d.start[i].y + dy }
                })
                return next
              })
            } else if (pan.current) {
              setOffset({ x: pan.current.ox + (e.clientX - pan.current.x), y: pan.current.oy + (e.clientY - pan.current.y) })
            } else if (marqueeStart.current) {
              const r = e.currentTarget.getBoundingClientRect()
              setMarquee({ x0: marqueeStart.current.x0, y0: marqueeStart.current.y0, x1: e.clientX - r.left, y1: e.clientY - r.top })
            }
          }}
          onMouseUp={(e) => {
            if (addDrag.current) {
              const cr = e.currentTarget.getBoundingClientRect()
              setAddMenu({ at: addDrag.current.at, from: addDrag.current.from, x: e.clientX - cr.left, y: e.clientY - cr.top })
              setAddSearch('')
              addDrag.current = null
              drawingFrom.current = null
              setDrawing(null)
            } else if (drawingFrom.current) {
              const from = drawingFrom.current
              const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.flow-node[data-node-id]') as HTMLElement | null
              const to = el?.dataset.nodeId
              if (to && to !== from) setConnectors((c) => (c.some((x) => x.from === from && x.to === to) ? c : [...c, { from, to }]))
              drawingFrom.current = null
              setDrawing(null)
            }
            if (marqueeStart.current) {
              const r = e.currentTarget.getBoundingClientRect()
              const s = marqueeStart.current
              const ex = e.clientX - r.left
              const ey = e.clientY - r.top
              const l = Math.min(s.x0, ex)
              const tp = Math.min(s.y0, ey)
              const rr = Math.max(s.x0, ex)
              const bt = Math.max(s.y0, ey)
              const ids = new Set<string>()
              e.currentTarget.querySelectorAll('.flow-node[data-node-id]').forEach((el) => {
                const nr = el.getBoundingClientRect()
                if (nr.left - r.left < rr && nr.right - r.left > l && nr.top - r.top < bt && nr.bottom - r.top > tp) {
                  const id = (el as HTMLElement).dataset.nodeId
                  if (id) ids.add(id)
                }
              })
              setSelected(ids)
              marqueeStart.current = null
              setMarquee(null)
            }
            pan.current = null
            dragging.current = null
          }}
          onMouseLeave={() => {
            pan.current = null
            marqueeStart.current = null
            dragging.current = null
            drawingFrom.current = null
            addDrag.current = null
            setMarquee(null)
            setDrawing(null)
          }}
        >
          <svg className="flow-edges" width="100%" height="100%">
            <defs>
              <marker id="flow-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <circle cx="5" cy="5" r="3.5" fill="var(--text-faint)" />
              </marker>
            </defs>
            {implicitConnectors.map((cn) => {
              const a = rects[cn.from]
              const b = rects[cn.to]
              if (!a || !b) return null
              return <path key={`imp-${cn.from}-${cn.to}`} className="flow-edge implicit" d={elbowPath(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, zoom / 100)} />
            })}
            {connectors.map((cn, i) => {
              const a = rects[cn.from]
              const b = rects[cn.to]
              if (!a || !b) return null
              return (
                <path
                  key={`${cn.from}-${cn.to}-${i}`}
                  className="flow-edge"
                  d={elbowPath(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, zoom / 100)}
                  onClick={() => setConnectors((c) => c.filter((_, j) => j !== i))}
                />
              )
            })}
            {drawing &&
              rects[drawing.from] &&
              (() => {
                const a = rects[drawing.from]
                return <path className="flow-edge drawing" d={elbowPath(a.x + a.w, a.y + a.h / 2, drawing.x, drawing.y, zoom / 100)} markerEnd="url(#flow-arrow)" />
              })()}
            {menuAnchor && <path className="flow-edge drawing" d={elbowPath(menuAnchor.sx, menuAnchor.sy, menuAnchor.x, menuAnchor.y + 26)} markerEnd="url(#flow-arrow)" />}
          </svg>
          {menuAnchor && (
            <>
              <div className="flow-addmenu-scrim" onMouseDown={() => setAddMenu(null)} />
              <div className="flow-addmenu" style={{ left: menuAnchor.x, top: menuAnchor.y }} onMouseDown={(e) => e.stopPropagation()}>
                <input className="flow-addmenu-search" autoFocus placeholder="Search deliverables" value={addSearch} onChange={(e) => setAddSearch(e.target.value)} />
                <div className="flow-addmenu-list">
                  {menuGroups.map(([group, presets]) => (
                    <div key={group}>
                      <div className="flow-addmenu-group">{group}</div>
                      {presets.map((p) => (
                        <button key={p.key} className="flow-addmenu-item" onClick={() => addFromMenu(p)}>
                          <PresetTile tone={TONE_HEX[p.tone]} />
                          <span>{p.label}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {menuGroups.length === 0 && <div className="flow-addmenu-empty">No matches</div>}
                </div>
              </div>
            </>
          )}
          {marquee && (
            <div
              className="flow-marquee"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}
          <div className={`flow-stack${viewing ? ' flow-stack-view' : ''}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom / 100})`, transformOrigin: '0 0' }}>
            {/* Campaign brief node */}
            <div
              className={`flow-node${sel === 'campaign' ? ' sel' : ''}${selected.has('campaign') ? ' multi' : ''}`}
              data-node-id="campaign"
              style={{ transform: `translate(${pos['campaign']?.x ?? 0}px, ${pos['campaign']?.y ?? 0}px)` }}
              onMouseDown={(e) => startDrag(e, 'campaign')}
              onClick={() => { setSel('campaign'); setPickAt(null) }}
            >
              <span className="flow-node-kind" style={{ color: CAMPAIGN_TONE, background: `color-mix(in srgb, ${CAMPAIGN_TONE} 16%, transparent)` }}>
                Campaign
              </span>
              <div className="flow-node-main">
                <CampaignTile />
                <div className="flow-node-text">
                  <div className="flow-node-label">{viewing ? viewShort : name.trim() || 'Untitled campaign'}</div>
                  <div className="flow-node-desc">
                    {viewing ? `${viewRows.length} assets · ${viewDelivs.length} deliverable${viewDelivs.length === 1 ? '' : 's'}` : `${flightWeeks}-week flight`}
                  </div>
                  {(() => {
                    const tags = viewing ? flowRefs : briefRefsEffective
                    if (!tags.length) return null
                    return (
                      <div className="flow-node-tags">
                        {tags.map((r) => (
                          <span key={refKey(r)} className="flow-node-tag" title={`${RECORD_TYPE_LABEL[r.type]}: ${r.label}`}>
                            <span className="flow-node-tag-ic" aria-hidden="true"><RecordTypeIcon type={r.type} /></span>
                            <span className="flow-node-tag-txt">{r.label}</span>
                          </span>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
              {!viewing && (
                <div className="flow-hover">
                  <span className="flow-port" />
                  <button className="flow-plus" title="Drag out to add" onMouseDown={(e) => startAdd(e, nodes.length, 'campaign')}>
                    +
                  </button>
                </div>
              )}
            </div>

            {/* View mode: reverse-engineered deliverables, draggable + connected like build */}
            {viewing
              ? (
                <div className="flow-vcol">
                  {viewDelivs.map((d) => {
                  const posts = [...d.rows].sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))
                  return (
                    <div key={d.key}>
                      <div className="flow-link" />
                      <div
                        className="flow-branched"
                        style={{ transform: `translate(${pos[d.key]?.x ?? 0}px, ${pos[d.key]?.y ?? 0}px)`, minHeight: posts.length > 0 ? `${posts.length * 152}px` : undefined }}
                      >
                        <div
                          className={`flow-node${sel === d.key ? ' sel' : ''}${selected.has(d.key) ? ' multi' : ''}`}
                          data-node-id={d.key}
                          onMouseDown={(e) => startDrag(e, d.key)}
                          onClick={() => { setSel(d.key); setPickAt(null) }}
                        >
                          <span className="flow-node-kind" style={{ color: d.tone, background: `color-mix(in srgb, ${d.tone} 16%, transparent)` }}>
                            Deliverable
                          </span>
                          <div className="flow-node-main">
                            <PresetTile tone={d.tone} />
                            <div className="flow-node-text">
                              <div className="flow-node-label">{d.label}</div>
                              <div className="flow-node-desc">×{d.count}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flow-branch-list">
                          {posts.map((r) => {
                            const c = viewPostCopy(r)
                            return (
                              <div className="flow-branch-row" key={r.id}>
                                <span className="flow-branch-port" style={{ borderColor: d.tone }} />
                                <div
                                  className={`flow-node flow-brief-node${sel === r.id ? ' sel' : ''}${selected.has(r.id) ? ' multi' : ''}${pos[r.id] ? ' moved' : ''}`}
                                  data-node-id={r.id}
                                  style={{ transform: `translate(${pos[r.id]?.x ?? 0}px, ${pos[r.id]?.y ?? 0}px)` }}
                                  onMouseDown={(e) => startDrag(e, r.id)}
                                  onClick={(e) => { e.stopPropagation(); setSel(r.id) }}
                                >
                                  <div className="flow-node-main">
                                    <PresetTile tone={d.tone} />
                                    <div className="flow-node-text">
                                      <div className="flow-node-label">{c.head}</div>
                                    </div>
                                  </div>
                                  {c.body && (
                                    <div className="flow-copy">
                                      <div className="flow-copy-body">{c.body}</div>
                                    </div>
                                  )}
                                  {hasMediaSpend(r) && (
                                    <div className="flow-spend-foot" title={spendTitle(r)}>
                                      <span className="flow-spend-dot" aria-hidden="true" />
                                      {spendLabel(r) === 'Paid' ? 'Paid media' : `Media spend · ${spendLabel(r)}`}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
                </div>
              )
              : nodes.map((n) => {
                  const p = presetByKey(n.presetKey)
                  if (!p) return null
                  const cadence = !(p.brand || p.runtime === 'one-off')
                  const slots = subcardCount(p, n.perMonth)
                  return (
                    <div key={n.id}>
                      <div className="flow-link" />
                      <div className="flow-branched" style={{ transform: `translate(${pos[n.id]?.x ?? 0}px, ${pos[n.id]?.y ?? 0}px)`, minHeight: slots > 0 ? `${slots * 152}px` : undefined }}>
                        <div
                          className={`flow-node${sel === n.id ? ' sel' : ''}${selected.has(n.id) ? ' multi' : ''}`}
                          data-node-id={n.id}
                          onMouseDown={(e) => startDrag(e, n.id)}
                          onClick={() => { setSel(n.id); setPickAt(null) }}
                        >
                          <span className="flow-node-kind" style={{ color: TONE_HEX[p.tone], background: `color-mix(in srgb, ${TONE_HEX[p.tone]} 16%, transparent)` }}>
                            Deliverable
                          </span>
                          <div className="flow-node-main">
                            <PresetTile tone={TONE_HEX[p.tone]} />
                            <div className="flow-node-text">
                              <div className="flow-node-label">{p.label}</div>
                              <div className="flow-node-desc">
                                {cadence ? `×${n.perMonth} / month` : p.channel === 'lead-magnet' ? `${n.perMonth} sections` : 'one-off'}
                                {n.audience ? ` · ${n.audience.split(/[ &]/)[0]}` : ''}
                              </div>
                            </div>
                            {writeCopy && (
                              <button
                                className={`flow-node-regen${preview[n.id]?.loading ? ' spin' : ''}`}
                                title="Redraft copy from the current briefs"
                                onClick={(e) => { e.stopPropagation(); void genPreview(n) }}
                              >
                                ↻
                              </button>
                            )}
                            <button className="flow-node-x" title="Remove" onClick={(e) => { e.stopPropagation(); removeNode(n.id) }}>
                              ✕
                            </button>
                          </div>
                          {slots === 0 && renderCopy(n.id, 0)}
                          <span className="flow-conn-port" title="Drag to connect" onMouseDown={(e) => startConnect(e, n.id)} />
                        </div>
                        {slots > 0 && (
                          <div className="flow-branch-list">
                            {Array.from({ length: slots }).map((_, bi) => (
                              <div className="flow-branch-row" key={bi}>
                                <span className="flow-branch-port" style={{ borderColor: TONE_HEX[p.tone] }} />
                                <div
                                  className={`flow-node flow-brief-node${sel === `${n.id}:${bi}` ? ' sel' : ''}${selected.has(`${n.id}:${bi}`) ? ' multi' : ''}${pos[`${n.id}:${bi}`] ? ' moved' : ''}`}
                                  data-node-id={`${n.id}:${bi}`}
                                  style={{ transform: `translate(${pos[`${n.id}:${bi}`]?.x ?? 0}px, ${pos[`${n.id}:${bi}`]?.y ?? 0}px)` }}
                                  onMouseDown={(e) => startDrag(e, `${n.id}:${bi}`)}
                                  onClick={(e) => { e.stopPropagation(); setSel(`${n.id}:${bi}`); setPickAt(null) }}
                                >
                                  <div className="flow-node-main">
                                    <PresetTile tone={TONE_HEX[p.tone]} />
                                    <div className="flow-node-text">
                                      <div className="flow-node-label">{subcardWord(p)} {bi + 1}</div>
                                      <input
                                        className="flow-brief-sub"
                                        placeholder="What's this post about?"
                                        value={n.briefs?.[bi] || ''}
                                        onChange={(e) => setBrief(n.id, bi, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  </div>
                                  {renderCopy(n.id, bi)}
                                  <span className="flow-conn-port" title="Drag to connect" onMouseDown={(e) => startConnect(e, `${n.id}:${bi}`)} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

          </div>
          {/* Connector endpoint dots, redrawn on a layer ABOVE the cards so they sit on
              top of each card's edge instead of tucking behind it. */}
          <svg className="flow-edges-top" width="100%" height="100%">
            {implicitConnectors.map((cn) => {
              const b = rects[cn.to]
              if (!b) return null
              return <circle key={`d-${cn.from}-${cn.to}`} className="flow-edge-dot" cx={b.x} cy={b.y + b.h / 2} r={2.5} />
            })}
            {connectors.map((cn, i) => {
              const b = rects[cn.to]
              if (!b) return null
              return <circle key={`dm-${cn.from}-${cn.to}-${i}`} className="flow-edge-dot" cx={b.x} cy={b.y + b.h / 2} r={2.5} />
            })}
          </svg>
        </div>

        {briefCollapsed ? (
          <div className="flow-panel-rail">
            <button className="flow-panel-rail-btn" title="Open panel" aria-label="Open panel" onClick={() => setBriefCollapsed(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /><path d="M10 9l2 3-2 3" />
              </svg>
            </button>
          </div>
        ) : (
        <aside className="flow-panel">
          <button className="flow-panel-collapse" title="Collapse panel" aria-label="Collapse panel" onClick={() => setBriefCollapsed(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /><path d="M9 9l2 3-2 3" />
            </svg>
          </button>
          {viewing ? (
            pickAt !== null ? (
              <>
                <div className="flow-panel-head">
                  <button className="flow-back" onClick={() => setPickAt(null)}>
                    ‹ Back
                  </button>
                  <span className="flow-panel-title">Add deliverable</span>
                </div>
                <div className="flow-picker-list">
                  {grouped.map(([group, presets]) => (
                    <div key={group} className="flow-pgroup">
                      <div className="flow-pgroup-h">{group}</div>
                      {presets.map((p) => (
                        <button key={p.key} className="flow-pitem" disabled={addingDeliv} onClick={() => void addViewDeliverable(p)}>
                          <PresetTile tone={TONE_HEX[p.tone]} />
                          <div className="flow-pitem-text">
                            <div className="flow-pitem-label">{p.label}</div>
                            <div className="flow-pitem-desc">{addingDeliv ? 'Adding…' : p.brand || p.runtime === 'one-off' ? 'one-off' : `${p.perMonth} / month`}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : selPost ? (
              <>
                <div className="flow-panel-head">
                  <PresetTile tone={CHANNELS[selPost.channel as ChannelId]?.kind === 'paid' ? TONE_HEX.gold : TONE_HEX.blue} />
                  <span className="flow-panel-title">{selPost.assetName}</span>
                  <button className="flow-back flow-close" onClick={() => setSel('campaign')}>
                    ✕
                  </button>
                </div>
                <div className="flow-inspect">
                  <p className="flow-inspect-desc">
                    {CHANNELS[selPost.channel as ChannelId]?.label ?? selPost.channel}
                    {selPost.audience ? ` · ${selPost.audience}` : ''}
                    {selPost.scheduledAt ? ` · ${new Date(selPost.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                  </p>
                  <div className="flow-swap">
                    <div className="flow-swap-tag">
                      {isIngestedPost(selPost) ? (
                        <>
                          <span className="flow-swap-badge ingested">Ingested post</span>
                          {selPost.sourceUrl && (
                            <a className="flow-swap-link" href={selPost.sourceUrl} target="_blank" rel="noreferrer">
                              View original ↗
                            </a>
                          )}
                        </>
                      ) : (
                        <span className="flow-swap-badge">Generated idea</span>
                      )}
                    </div>
                    <button className="flow-swap-btn" onClick={() => setSwapOpen((o) => !o)}>
                      ⇄ Swap for an ingested post
                    </button>
                    {swapOpen && (
                      <div className="flow-swap-panel">
                        <input
                          className="flow-swap-search"
                          value={swapSearch}
                          placeholder={`Search ${brand || 'brand'} ingested posts…`}
                          onChange={(e) => setSwapSearch(e.target.value)}
                          autoFocus
                        />
                        {swapCandidates.length === 0 ? (
                          <div className="flow-swap-empty">No ingested posts to swap in yet. Ingest content into the Library first.</div>
                        ) : (
                          <div className="flow-swap-list">
                            {swapCandidates.slice(0, 50).map((r) => {
                              const reach = postReach(r)
                              const reachTxt = reach >= 1e6 ? (reach / 1e6).toFixed(1) + 'M' : reach >= 1e3 ? Math.round(reach / 1e3) + 'k' : reach ? String(reach) : ''
                              return (
                                <button key={r.id} className="flow-swap-item" onClick={() => swapForIngested(r)}>
                                  <span className="flow-swap-item-title">{r.assetName}</span>
                                  <span className="flow-swap-item-meta">
                                    {CHANNELS[r.channel as ChannelId]?.label ?? r.channel}
                                    {reachTxt ? ` · ${reachTxt} reach` : ''}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {Object.entries((selPost.messaging ?? {}) as Record<string, string>)
                    .filter(([, v]) => v && v.trim())
                    .map(([k, v]) => (
                      <div key={k} className="flow-post-field">
                        <label className="flow-inspect-label">{k}</label>
                        <div className="flow-post-value">{v}</div>
                      </div>
                    ))}
                </div>
              </>
            ) : selDeliv ? (
              <>
                <div className="flow-panel-head">
                  <PresetTile tone={selDeliv.tone} />
                  <span className="flow-panel-title">{selDeliv.label}</span>
                  <button className="flow-back flow-close" onClick={() => setSel('campaign')}>
                    ✕
                  </button>
                </div>
                <div className="flow-inspect">
                  <p className="flow-inspect-desc">
                    {selDeliv.channel} · {selDeliv.assetType}
                  </p>
                  <div className="flow-inspect-note">{selDeliv.count} asset{selDeliv.count === 1 ? '' : 's'} in this flow. Click a post to see its copy.</div>
                </div>
              </>
            ) : (
              <>
                <div className="flow-panel-head">
                  <CampaignTile />
                  <span className="flow-panel-title">{viewShort}</span>
                </div>
                <div className="flow-inspect">
                  <p className="flow-inspect-desc">
                    {viewRows.length} assets · {viewDelivs.length} deliverable type{viewDelivs.length === 1 ? '' : 's'}
                    {viewFlight ? ` · ${viewFlight}-week flight` : ''}
                  </p>
                  <label className="flow-inspect-label">Records</label>
                  <div className="flow-aud">
                    <button className="flow-aud-btn" onClick={() => setAudMenuOpen((o) => !o)}>
                      <span className="flow-aud-btn-txt">{flowRefs.length ? flowRefs.map((r) => r.label).join(', ') : 'Reference records'}</span>
                      <span className="flow-aud-caret" aria-hidden="true">▾</span>
                    </button>
                    {audMenuOpen && (
                      <>
                        <div className="flow-aud-scrim" onClick={() => setAudMenuOpen(false)} />
                        <div className="flow-aud-menu">
                          {recordGroups.map((g) => (
                            <div key={g.type} className="flow-aud-group">
                              <div className="flow-aud-grouphead">{g.label}</div>
                              {g.items.length === 0 && <div className="flow-aud-groupempty">None yet</div>}
                              {g.items.map((it) => {
                                const on = hasRef(g.type, it.id)
                                return (
                                  <button key={it.id} className={`flow-aud-item${on ? ' on' : ''}`} onClick={() => toggleRef(g.type, it.id, it.label)}>
                                    <span className="flow-aud-check" aria-hidden="true">{on ? '✓' : ''}</span>
                                    <span>{it.label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          ))}
                          <div className="flow-aud-add">
                            <input
                              className="flow-aud-input"
                              value={newAudName}
                              placeholder="New segment…"
                              onChange={(e) => setNewAudName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') addSegmentRecord()
                              }}
                            />
                            <button className="flow-aud-add-btn" onClick={addSegmentRecord} disabled={!newAudName.trim()}>
                              Add
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {refsDirty && (
                    <button className="flow-regen" onClick={regenerateFlow} disabled={regenerating}>
                      {regenerating ? 'Regenerating…' : '↻ Regenerate assets with these records'}
                    </button>
                  )}

                  <label className="flow-inspect-label" style={{ marginTop: 20 }}>Deliverables</label>
                  <div className="flow-deliv-list">
                    {viewDelivs.map((d) => (
                      <button key={d.key} className="flow-pitem" onClick={() => setSel(d.key)}>
                        <PresetTile tone={d.tone} />
                        <div className="flow-pitem-text">
                          <div className="flow-pitem-label">{d.label}</div>
                          <div className="flow-pitem-desc">{d.count} asset{d.count === 1 ? '' : 's'}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flow-inspect-note" style={{ marginTop: 14 }}>
                    Referenced records (companies, people, segments, media mix) inform generated copy. Click a post to see its copy, or use the Grid and Calendar tabs above.
                  </div>
                </div>
              </>
            )
          ) : pickAt !== null ? (
            <>
              <div className="flow-panel-head">
                <button className="flow-back" onClick={() => setPickAt(null)}>
                  ‹ Back
                </button>
                <span className="flow-panel-title">Add deliverable</span>
              </div>
              <div className="flow-picker-list">
                {grouped.map(([group, presets]) => (
                  <div key={group} className="flow-pgroup">
                    <div className="flow-pgroup-h">{group}</div>
                    {presets.map((p) => (
                      <button key={p.key} className="flow-pitem" onClick={() => addPreset(p)}>
                        <PresetTile tone={TONE_HEX[p.tone]} />
                        <div className="flow-pitem-text">
                          <div className="flow-pitem-label">{p.label}</div>
                          <div className="flow-pitem-desc">{p.brand || p.runtime === 'one-off' ? 'one-off' : `${p.perMonth} / month`}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : sel === 'campaign' ? (
            <>
              <div className="flow-panel-head">
                <CampaignTile />
                <span className="flow-panel-title">Campaign brief</span>
              </div>
              <div className="flow-inspect">
                <label className="flow-inspect-label">Name</label>
                <input className="flow-inspect-input" value={name} placeholder="e.g. Q3 Always-On" onChange={(e) => setName(e.target.value)} />
                <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                  Goal / subject
                </label>
                <textarea className="flow-inspect-input" rows={2} value={subject} placeholder="What is this campaign for?" onChange={(e) => setSubject(e.target.value)} onBlur={onSubjectCommit} />
                <div className="flow-inspect-note" style={{ marginTop: 4 }}>The campaign theme. Every asset's copy is written to it; changing it redrafts them all.</div>
                <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                  Flight length
                </label>
                <div className="flow-step">
                  <button onClick={() => { setFlightWeeks((w) => Math.max(1, w - 1)); scheduleRedraftAll() }}>−</button>
                  <span>{flightWeeks} weeks</span>
                  <button onClick={() => { setFlightWeeks((w) => w + 1); scheduleRedraftAll() }}>+</button>
                </div>
                <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                  Budget
                </label>
                <div className="flow-budget">
                  <span className="flow-budget-cur">$</span>
                  <input
                    className="flow-budget-input"
                    type="number"
                    min={0}
                    step={1000}
                    value={budget}
                    placeholder="Total campaign budget"
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </div>
                <label className="flow-inspect-label" style={{ marginTop: 16 }}>
                  Record Tags{briefRefsEffective.length ? ` · ${briefRefsEffective.length}` : ''}
                </label>
                {briefRefsEffective.map((ref) => {
                  const key = refKey(ref)
                  const open = openTagKey === key
                  return (
                    <div key={key} className="flow-tagrow">
                      <span className="flow-tagrow-ic" title={RECORD_TYPE_LABEL[ref.type]} aria-hidden="true">
                        <RecordTypeIcon type={ref.type} />
                      </span>
                      <div className="flow-aud flow-tagrow-dd">
                        <button className="flow-aud-btn" onClick={() => setOpenTagKey(open ? null : key)}>
                          <span className="flow-aud-btn-txt">{ref.label}</span>
                          <span className="flow-aud-caret" aria-hidden="true">▾</span>
                        </button>
                        {open && (
                          <>
                            <div className="flow-aud-scrim" onClick={() => setOpenTagKey(null)} />
                            <div className="flow-aud-menu">
                              {recordGroups.map((g) => (
                                <div key={g.type} className="flow-aud-group">
                                  <div className="flow-aud-grouphead">{g.label}</div>
                                  {g.items.length === 0 && <div className="flow-aud-groupempty">None yet</div>}
                                  {g.items.map((it) => {
                                    const on = hasBriefRef(g.type, it.id)
                                    return (
                                      <button key={it.id} className={`flow-aud-item${refKey({ type: g.type, id: it.id }) === key ? ' on' : ''}`} disabled={on && refKey({ type: g.type, id: it.id }) !== key} onClick={() => { replaceBriefRef(key, g.type, it.id, it.label); setOpenTagKey(null) }}>
                                        <span className="flow-aud-check" aria-hidden="true">{refKey({ type: g.type, id: it.id }) === key ? '✓' : ''}</span>
                                        <span>{it.label}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <button className="flow-tagrow-del" title="Remove tag" aria-label="Remove tag" onClick={() => removeBriefRef(key)}>✕</button>
                    </div>
                  )
                })}
                <div className="flow-tagrow flow-tagrow-add">
                  <span className="flow-tagrow-ic flow-tagrow-ic-add" aria-hidden="true">＋</span>
                  <div className="flow-aud flow-tagrow-dd">
                    <button className="flow-aud-btn" onClick={() => setOpenTagKey(openTagKey === 'add' ? null : 'add')}>
                      <span className="flow-aud-btn-txt flow-tagrow-add-txt">Add a record</span>
                      <span className="flow-aud-caret" aria-hidden="true">▾</span>
                    </button>
                    {openTagKey === 'add' && (
                      <>
                        <div className="flow-aud-scrim" onClick={() => setOpenTagKey(null)} />
                        <div className="flow-aud-menu">
                          {recordGroups.map((g) => {
                            const items = g.items.filter((it) => !hasBriefRef(g.type, it.id))
                            if (!items.length) return null
                            return (
                              <div key={g.type} className="flow-aud-group">
                                <div className="flow-aud-grouphead">{g.label}</div>
                                {items.map((it) => (
                                  <button key={it.id} className="flow-aud-item" onClick={() => { addBriefRef(g.type, it.id, it.label); setOpenTagKey(null) }}>
                                    <span className="flow-aud-tic" aria-hidden="true"><RecordTypeIcon type={g.type} /></span>
                                    <span>{it.label}</span>
                                  </button>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flow-inspect-note" style={{ marginTop: 14 }}>
                  Add deliverables from the canvas toolbar, then Build.
                </div>
                <button className="flow-brief-build" onClick={build} disabled={!nodes.length || building}>
                  {building ? 'Building…' : 'Build & write copy'}
                </button>
              </div>
            </>
          ) : sel && sel.includes(':') ? (
            (() => {
              // A post/brief card is selected (id is "nodeId:index"): show its detail —
              // brief, the full generated draft copy, and a redraft, in the right panel.
              const [nid, bstr] = sel.split(':')
              const node = nodes.find((n) => n.id === nid)
              const p = node && presetByKey(node.presetKey)
              if (!node || !p) {
                return (
                  <>
                    <div className="flow-panel-head">
                      <span className="flow-panel-title">Post</span>
                    </div>
                    <div className="flow-overview">
                      <div className="flow-ov-note">This post is no longer on the canvas.</div>
                    </div>
                  </>
                )
              }
              const bi = Number(bstr)
              const pv = preview[node.id]
              const post = pv?.posts?.[bi]
              const loading = !!pv?.loading && !(post?.headline || post?.primary)
              return (
                <>
                  <div className="flow-panel-head">
                    <PresetTile tone={TONE_HEX[p.tone]} />
                    <span className="flow-panel-title">Post {bi + 1}</span>
                    <button className="flow-back flow-close" onClick={() => setSel(null)}>
                      ✕
                    </button>
                  </div>
                  <div className="flow-inspect">
                    <button className="flow-back" onClick={() => setSel(node.id)}>
                      ‹ {p.label}
                    </button>
                    <label className="flow-inspect-label" style={{ marginTop: 12 }}>
                      What's this post about?
                    </label>
                    <textarea
                      className="flow-inspect-input"
                      rows={2}
                      placeholder="Brief for this post"
                      value={node.briefs?.[bi] || ''}
                      onChange={(e) => setBrief(node.id, bi, e.target.value)}
                    />
                    <div className="flow-cfg-h">Draft copy</div>
                    {loading ? (
                      <div className="flow-inspect-note">Generating…</div>
                    ) : post && (post.headline || post.primary) ? (
                      <div className="flow-post-detail">
                        {post.headline && <div className="flow-post-detail-head">{post.headline}</div>}
                        {post.primary && <div className="flow-post-detail-body">{post.primary}</div>}
                        {pv?.source && (
                          <div className={`flow-built-badge ${pv.source}`} style={{ marginTop: 4 }}>
                            <span className="flow-built-badge-dot" aria-hidden="true" />
                            {pv.source === 'claude' ? 'Written by Claude' : 'Written offline'}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flow-inspect-note">
                        {writeCopy ? 'No copy yet. Redraft to generate.' : 'Turn on "Write copy for each asset" to generate.'}
                      </div>
                    )}
                    <button className="flow-inspect-regen" onClick={() => void genPreview(node)} disabled={!writeCopy}>
                      ↻ Redraft this deliverable
                    </button>
                    <div className="flow-inspect-note" style={{ marginTop: 12 }}>
                      {p.channel} · {p.assetType}
                      {node.audience ? ` · ${node.audience}` : ''}
                    </div>
                  </div>
                </>
              )
            })()
          ) : sel && presetByKey((nodes.find((n) => n.id === sel) || ({} as FlowDeliverable)).presetKey || '') ? (
            (() => {
              const node = nodes.find((n) => n.id === sel)!
              const p = presetByKey(node.presetKey)!
              return (
                <>
                  <div className="flow-panel-head">
                    <PresetTile tone={TONE_HEX[p.tone]} />
                    <span className="flow-panel-title">{p.label}</span>
                    <button className="flow-back flow-close" onClick={() => setSel(null)}>
                      ✕
                    </button>
                  </div>
                  <div className="flow-inspect">
                    <textarea
                      className="flow-desc"
                      rows={2}
                      placeholder="What is this deliverable about?"
                      value={node.description || ''}
                      onChange={(e) => setNodeField(node.id, { description: e.target.value })}
                    />
                    <div className="flow-cfg-h">Configuration</div>
                    <label className="flow-inspect-label">Audience</label>
                    <select className="flow-inspect-input flow-select" value={node.audience || ''} onChange={(e) => setNodeField(node.id, { audience: e.target.value })}>
                      <option value="">All campaign audiences</option>
                      {audienceNames.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    {p.channel === 'lead-magnet' ? (
                      <>
                        <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                          Sections
                        </label>
                        <div className="flow-step">
                          <button onClick={() => setCadence(node.id, node.perMonth - 1)}>−</button>
                          <span>{node.perMonth} sections</span>
                          <button onClick={() => setCadence(node.id, node.perMonth + 1)}>+</button>
                        </div>
                        <div className="flow-inspect-note" style={{ marginTop: 8 }}>
                          One creative brief per section (the cards under this deliverable). Empty briefs get generic on-brand copy.
                        </div>
                      </>
                    ) : p.brand || p.runtime === 'one-off' ? (
                      <>
                        <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                          Focus
                        </label>
                        <input className="flow-inspect-input" placeholder="What this piece is about" value={node.briefs?.[0] || ''} onChange={(e) => setBrief(node.id, 0, e.target.value)} />
                        <div className="flow-inspect-note" style={{ marginTop: 10 }}>Built once for the campaign.</div>
                      </>
                    ) : (
                      <>
                        <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                          Per month
                        </label>
                        <div className="flow-step">
                          <button onClick={() => setCadence(node.id, node.perMonth - 1)}>−</button>
                          <span>{node.perMonth} / month</span>
                          <button onClick={() => setCadence(node.id, node.perMonth + 1)}>+</button>
                        </div>
                        <div className="flow-inspect-note" style={{ marginTop: 8 }}>
                          ≈ {nodeAssetCount(p, node.perMonth, flightWeeks)} assets · one creative brief per monthly post (the cards under this deliverable). Empty briefs get generic on-brand copy.
                        </div>
                      </>
                    )}
                    <div className="flow-inspect-note" style={{ marginTop: 12 }}>
                      {p.channel} · {p.assetType}
                    </div>
                    <button className="flow-inspect-del" onClick={() => removeNode(node.id)}>
                      Remove deliverable
                    </button>
                  </div>
                </>
              )
            })()
          ) : (
            <>
              <div className="flow-panel-head">
                <span className="flow-panel-title">{name.trim() || 'Untitled campaign'}</span>
              </div>
              <div className="flow-overview">
                <div className="flow-ov-note">Pick the campaign brief to set audiences and flight, or add deliverables. When it looks right, build it into a real draft campaign.</div>
              </div>
            </>
          )}
        </aside>
        )}
      </div>

      <div className="flow-toolbar">
        <div className="flow-tb-zoom-wrap">
          <button className="flow-tb-zoom" onClick={() => setZoomOpen((o) => !o)} title="Zoom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            {Math.round(zoom)}%
            <svg className="flow-tb-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {zoomOpen && (
            <>
              <div className="flow-tb-zoom-scrim" onClick={() => setZoomOpen(false)} />
              <div className="flow-tb-zoom-menu">
                {[150, 125, 100, 75, 50].map((z) => (
                  <button
                    key={z}
                    className={`flow-tb-zoom-item${Math.round(zoom) === z ? ' on' : ''}`}
                    onClick={() => {
                      // Anchor a preset to the canvas center so it zooms about the middle.
                      const r = canvasRef.current?.getBoundingClientRect()
                      if (r) zoomAt(z, r.left + r.width / 2, r.top + r.height / 2)
                      else setZoom(z)
                      setZoomOpen(false)
                    }}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flow-tb-tools">
          <button className={`flow-tb-tool${tool === 'pan' ? ' on' : ''}`} onClick={() => setTool('pan')} title="Pan" aria-label="Pan">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5.5a1.5 1.5 0 0 1 3 0V12M14 12V8a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6 5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-1.9L8 14" />
            </svg>
          </button>
          <button className={`flow-tb-tool${tool === 'select' ? ' on' : ''}`} onClick={() => setTool('select')} title="Select" aria-label="Select">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 3.5 19 10l-6.3 1.9L10 19z" />
            </svg>
          </button>
        </div>
        <span className="flow-tb-divider" />
        <button className="flow-tb-add" onClick={() => { setPickAt(viewing ? viewDelivs.length : nodes.length); setSel(null) }} disabled={addingDeliv}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          Add deliverable
          <span className="flow-tb-kbd">B</span>
        </button>
      </div>
        </>
      )}

      {(flowView === 'grid' || flowView === 'calendar') && (
        <div className="flow-real">
          {!hasBuiltRows && (
            <div className="flow-real-hint">
              This is the campaign's {flowView === 'grid' ? 'Grid' : 'Calendar'}, it shows built assets. Click "Build & write copy" to populate it.
            </div>
          )}
          <div className="flow-real-view">
            {flowView === 'grid' ? (
              <SheetGrid scopeClient={brand || undefined} scopeCampaign={flowCampaign} />
            ) : (
              <CalendarView scopeClient={brand || undefined} scopeCampaign={flowCampaign} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
