import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CHANNELS } from '../domain/channels'
import { DELIVERABLE_PRESETS, type DeliverablePreset, type FlowDeliverable, freshNodeId, nodeAssetCount, presetByKey, TONE_HEX } from '../domain/flows'
import { resolveBrandScope } from '../domain/brand'
import type { FlowRefType, FlowReference } from '../domain/clients'
import { blueprintsFor, blueprintByKey, stepLineage, stepFromLineage, blueprintBriefs, type EmailBlueprint } from '../domain/emailPatterns'
import { messagingFields } from '../domain/messaging'
import { GTM_STRATEGIES, mediaSharePct } from '../domain/strategies'
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

// Per-tier tones — the card badge + tile match its tier tint: campaign (tomato), deliverable
// (blue), post (purple).
const CAMPAIGN_TONE = '#ff6347'
const DELIV_TONE = '#2f6fe0'
const POST_TONE = '#8a34d6'

// The callbacks the shared Record-Tags block edits through, so the same UI can target the
// campaign brief OR a single deliverable's per-asset override.
type TagOps = {
  refs: FlowReference[]
  has: (type: FlowRefType, id: string) => boolean
  add: (type: FlowRefType, id: string, label: string) => void
  remove: (key: string) => void
  replace: (key: string, type: FlowRefType, id: string, label: string) => void
  openPicker: () => void
}

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
  channel: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M6 8.4v3a2 2 0 0 0 2 2h2.4M18 8.4v3a2 2 0 0 1-2 2h-2.4" />
    </>
  ),
  proof: <path d="m5 12.5 4.5 4.5L19 6" />,
  'media-mix': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </>
  ),
}
const RECORD_TYPE_LABEL: Record<FlowRefType, string> = { company: 'Company', person: 'Person', segment: 'Segment', channel: 'Channel', proof: 'Proof point', 'media-mix': 'Media mix' }
// Record types roll up into a few card categories. Audience (segment / company / person) is
// the WHO at three granularities; Channel is the where; Proof the why. A card shows one row per
// category. Required categories (an audience + a proof) read in the accent color, and a required
// category with no tag shows an amber "Needs …" flag so the gap is obvious.
type CardGroup = { key: string; label: string; need: string; types: FlowRefType[]; required: boolean; icon: ReactNode }
const CARD_GROUPS: CardGroup[] = [
  { key: 'audience', label: 'Audience', need: 'an audience', types: ['segment', 'company', 'person'], required: true, icon: RECORD_TYPE_ICON.person },
  { key: 'channel', label: 'Channel', need: 'a channel', types: ['channel'], required: false, icon: RECORD_TYPE_ICON.channel },
  { key: 'proof', label: 'Proof', need: 'a proof point', types: ['proof'], required: true, icon: RECORD_TYPE_ICON.proof },
]
// The record-type categories in the "Add a record" picker: Audience nests the three WHO types.
const PICKER_SECTIONS: { label: string; types: FlowRefType[] }[] = [
  { label: 'Audience', types: ['segment', 'company', 'person'] },
  { label: 'Channels', types: ['channel'] },
  { label: 'Proof points', types: ['proof'] },
]
const RecordTypeIcon = ({ type }: { type: FlowRefType }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {RECORD_TYPE_ICON[type]}
  </svg>
)

// A node card's record tags, grouped into card categories (Audience / Channel / Proof). Each
// chip carries its own record-type icon so a mixed Audience row still shows segment vs company
// vs person. `overridden` tints a deliverable whose records differ from the campaign's.
function renderCardTags(tags: FlowReference[], overridden: boolean): ReactNode {
  const groups = CARD_GROUPS
    .map((g) => ({ ...g, items: tags.filter((t) => g.types.includes(t.type)) }))
    .filter((g) => g.items.length || g.required)
  if (!groups.length) return null
  return (
    <div className={`flow-node-taggroups${overridden ? ' overridden' : ''}`} title={overridden ? 'Overriding the campaign records' : undefined}>
      {groups.map((g) => {
        const missing = g.required && !g.items.length
        return (
          <div key={g.key} className={`flow-node-taggroup${g.required ? ' required' : ''}${missing ? ' missing' : ''}`}>
            <span className="flow-node-taggroup-ic" title={g.label} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{g.icon}</svg>
            </span>
            <div className="flow-node-taggroup-chips">
              {g.items.length ? (
                g.items.map((r) => (
                  <span key={`${r.type}:${r.id}`} className="flow-node-tag" title={`${g.label} · ${RECORD_TYPE_LABEL[r.type]}: ${r.label}`}>
                    {r.label}
                  </span>
                ))
              ) : (
                <span className="flow-node-tag missing-tag">Needs {g.need}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// A recurring deliverable (newsletter, social) breaks into monthly posts. A lead magnet
// (ebook, whitepaper) breaks into sections, and a web page (homepage, pricing, landing)
// into a page card that carries its copy. Other one-offs (events) stay a single asset.
const PAGE_CHANNELS = new Set<ChannelId>(['website', 'landing-page'])
const hasSubcards = (p: DeliverablePreset): boolean =>
  !(p.brand || p.runtime === 'one-off') || p.channel === 'lead-magnet' || PAGE_CHANNELS.has(p.channel)
// The word for a sub-card: monthly posts, ebook sections, or a page.
const subcardWord = (p: DeliverablePreset): string =>
  p.channel === 'lead-magnet' ? 'Section' : PAGE_CHANNELS.has(p.channel) ? 'Page' : 'Post'
// Sub-cards a deliverable shows: monthly cadence, or a lead magnet's sections (default 4).
const subcardCount = (p: DeliverablePreset, perMonth: number): number =>
  hasSubcards(p) ? Math.min(perMonth, 12) : 0
// Count a freshly-added deliverable starts with (lead magnets get a few sections).
const startCount = (p: DeliverablePreset): number => (p.channel === 'lead-magnet' ? 4 : p.perMonth)
// The noun for a blueprint's deliverable, so the picker's help text fits the channel
// (the picker now serves emails, pages, articles and ads — not just emails).
const blueprintNoun = (channel: ChannelId): string =>
  PAGE_CHANNELS.has(channel) ? 'page' : channel === 'email' ? 'email' : channel === 'blog' ? 'article' : channel === 'linkedin-ads' ? 'ad' : 'asset'

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
const fmtCount = (n: number): string => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)))
// The live-metrics line for an ingested post (reach + engagement), for the card footer.
const ingestedMetricsText = (r: TrafficRow): string => {
  const parts: string[] = []
  const reach = postReach(r)
  if (reach) parts.push(`${fmtCount(reach)} reach`)
  const eng = r.engagement
  if (eng?.likes) parts.push(`${fmtCount(eng.likes)} likes`)
  else if (eng?.comments) parts.push(`${fmtCount(eng.comments)} comments`)
  const er = r.socialMetrics?.engagementRate
  if (!parts.length && typeof er === 'number') parts.push(`${er.toFixed(1)}% eng`)
  return parts.join(' · ') || 'Live post'
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
  // Forward (left-to-right): a rounded right-angle elbow. Clamp the corner radius to half the
  // vertical separation, so a small offset can't make the two rounded corners overshoot each
  // other into a spike — they just meet in the middle for a clean S instead.
  const sep = Math.abs(ty - sy)
  const midX = tx > sx + 80 * s ? (sx + tx) / 2 : sx + 40 * s
  const dir = ty > sy ? 1 : -1
  const rr = Math.min(r, sep / 2)
  return `M ${sx} ${sy} H ${midX - rr} Q ${midX} ${sy} ${midX} ${sy + rr * dir} V ${ty - rr * dir} Q ${midX} ${ty} ${midX + rr} ${ty} H ${tx}`
}

export function FlowsView() {
  const { brands, canvases } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const setCampaignReferences = useTrafficStore((s) => s.setCampaignReferences)
  const setCampaignSubject = useTrafficStore((s) => s.setCampaignSubject)
  const patchCampaign = useTrafficStore((s) => s.patchCampaign)
  const showToast = useTrafficStore((s) => s.showToast)
  const markOnboardingDone = useTrafficStore((s) => s.markOnboardingDone)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const companies = useTrafficStore((s) => s.companies)
  const people = useTrafficStore((s) => s.people)
  const channelRecords = useTrafficStore((s) => s.channelRecords)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const brandMeta = useTrafficStore((s) => s.brandMeta)
  const mediaMixes = useTrafficStore((s) => s.mediaMixes)
  const seedCampaignAssets = useTrafficStore((s) => s.seedCampaignAssets)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const draftCopy = useTrafficStore((s) => s.draftCopy)
  const duplicateRow = useTrafficStore((s) => s.duplicateRow)
  const removeRow = useTrafficStore((s) => s.removeRow)
  const updateRows = useTrafficStore((s) => s.updateRows)
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
  // When the deliverable picker is opened FROM an asset card (its "+"), this holds that
  // source asset's row id. The new deliverable's rows get branchOf = that asset's name, so
  // the canvas draws a journey edge from the asset to the new deliverable (asset → next step).
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const connectFromRef = useRef<string | null>(null)
  connectFromRef.current = connectFrom
  const [building, setBuilding] = useState(false)
  // Build always writes copy now (the toggle was removed); kept as a constant so the
  // preview + build paths that reference it stay unchanged.
  const writeCopy = true
  const [built, setBuilt] = useState<{ name: string; count: number; copy: boolean; source: CopySource | null } | null>(null)
  // Live draft copy per deliverable node, generated when it's added (and on redraft).
  // Ephemeral UI state: never seeded into rows or localStorage until you Build.
  const [preview, setPreview] = useState<Record<string, { loading: boolean; source: CopySource | null; posts: { headline: string; primary: string; components: { key: string; label: string; value: string }[] }[] }>>({})
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
  // Refs so the Cmd+. shortcut reads the panels' current state without re-binding the listener.
  const chatCollapsedRef = useRef(chatCollapsed)
  chatCollapsedRef.current = chatCollapsed
  const briefCollapsedRef = useRef(briefCollapsed)
  briefCollapsedRef.current = briefCollapsed
  // When a deliverable is added off an asset's "+", we place it beside that asset once it renders
  // (rather than letting it stack at the bottom of the column). Holds { delivKey, srcId } until placed.
  const pendingPlaceRef = useRef<{ key: string; srcId: string } | null>(null)
  const [blueprintBusy, setBlueprintBusy] = useState(false)
  const chatIdRef = useRef(0)
  const nextChatId = () => `msg_${++chatIdRef.current}_${chatMsgs.length}`
  // null = the new-campaign builder; a name = viewing that existing campaign as a flow.
  const [viewName, setViewName] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  // View-mode brief drafts: subject + budget buffered so a built flow's brief edits commit on
  // blur (reseeded whenever you open a different flow).
  const [viewSubjectDraft, setViewSubjectDraft] = useState('')
  const [viewBudgetDraft, setViewBudgetDraft] = useState('')
  // Build-brief: which record-tag row's dropdown is open ("<type>:<id>" or "add").
  const [openTagKey, setOpenTagKey] = useState<string | null>(null)
  // The "Add a record" slide-out drawer (search + all record groups).
  const [pickerOpen, setPickerOpen] = useState(false)
  // Which target the picker edits: null = the campaign brief, else a deliverable key (its
  // per-asset record-tag override).
  const [pickerDeliv, setPickerDeliv] = useState<string | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  // Which record categories are expanded in the drawer (collapsed by default — the lists
  // get long, so you open the one you want).
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const toggleCat = (type: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  // Swap a generated-idea post for a real ingested post from the library.
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapSearch, setSwapSearch] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [patternBusy, setPatternBusy] = useState(false)
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
      // Cmd/Ctrl + . toggles the canvas side panels (Flow assistant + inspector) for a focused,
      // full-canvas view. Works even while a field is focused, so it's checked before the guard.
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        const anyOpen = !chatCollapsedRef.current || !briefCollapsedRef.current
        setChatCollapsed(anyOpen)
        setBriefCollapsed(anyOpen)
        return
      }
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
  // The audiences a build/preview writes to are the checked SEGMENT tags only (segments ARE
  // the brand's audiences). Proof / company / person / channel tags aren't audiences — folding
  // their labels in here used to pollute the audience rotation with proof-point strings.
  const segmentRefLabels = briefRefsEffective.filter((r) => r.type === 'segment').map((r) => r.label)
  const audSelection = segmentRefLabels.length ? segmentRefLabels : audienceNames
  // The proof points every card should lean on: the checked proof tags (labels), passed to the
  // preview so canvas cards match what Build writes. Empty = the brand's whole proof library.
  const proofRefLabels = briefRefsEffective.filter((r) => r.type === 'proof').map((r) => r.label)
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
  const proofRef = useRef(proofRefLabels)
  proofRef.current = proofRefLabels
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
    // If a blueprint is applied, pass each slot's framework / subject formula / CTA / levers.
    const bp = node.blueprint ? blueprintByKey(node.blueprint) : null
    const steps = bp
      ? Array.from({ length: slots }, (_, i) => {
          const s = bp.kind === 'sequence' ? bp.steps[i] : bp.steps[0]
          if (!s) return undefined
          const levers = s.levers.filter((l) => l !== 'none')
          return { framework: s.framework, subjectFormula: s.subjectFormula, cta: s.cta, levers: levers.length ? levers.join(', ') : undefined }
        })
      : undefined
    setPreview((pv) => ({ ...pv, [node.id]: { loading: true, source: pv[node.id]?.source ?? null, posts: pv[node.id]?.posts ?? [] } }))
    try {
      const res = await previewFlowCopy({
        client: brand,
        channel: p.channel,
        assetType: p.assetType,
        briefs,
        audiences: auds,
        proof: proofRef.current,
        theme: subjectRef.current.trim() || undefined,
        flightWeeks: flightRef.current,
        steps,
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
  // The draft-copy block shown under a deliverable / post card. Shimmer while the first
  // draft generates, then the copy for that slot. A page shows every field as a labeled
  // component (headline / subhead / proof / body / cta); a post shows headline + body.
  const renderCopy = (nodeId: string, slot: number) => {
    if (!writeCopy) return null
    const pv = preview[nodeId]
    const post = pv?.posts?.[slot]
    const node = nodes.find((n) => n.id === nodeId)
    const p = node ? presetByKey(node.presetKey) : undefined
    const asFields = !!p && PAGE_CHANNELS.has(p.channel)
    const empty = !post || (!post.headline && !post.primary && !post.components?.length)
    if (pv?.loading && empty) {
      return (
        <div className="flow-copy loading" aria-hidden="true">
          <span className="flow-copy-shim" />
          <span className="flow-copy-shim short" />
        </div>
      )
    }
    if (empty) return null
    if (asFields && post!.components?.length) {
      return (
        <div className="flow-copy flow-copy-fields">
          {post!.components.map((c) => (
            <div className="flow-copy-field" key={c.key}>
              <div className="flow-copy-flabel">{c.label}</div>
              <div className="flow-copy-fval">{c.value}</div>
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="flow-copy">
        {post!.headline && <div className="flow-copy-head">{post!.headline}</div>}
        {post!.primary && <div className="flow-copy-body">{post!.primary}</div>}
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

  // Apply an email blueprint to an existing deliverable's emails: seed each email's brief
  // + framework/subject/levers (rotating steps across the emails), clear its copy, and
  // regenerate so the emails follow the blueprint arc.
  // Change how many assets sit under a deliverable in a BUILT flow: add one more (clone the
  // latest asset into a fresh draft, one slot later, and rewrite its copy) or drop the latest.
  // Build-mode uses the per-month stepper instead (assets aren't seeded yet).
  const [countBusy, setCountBusy] = useState(false)
  const changeDelivCount = async (deliv: { key: string; rows: TrafficRow[] }, delta: number) => {
    if (countBusy || !deliv.rows.length) return
    const ordered = [...deliv.rows].sort((a, b) => Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || ''))
    const last = ordered[ordered.length - 1]
    if (!last) return
    setCountBusy(true)
    try {
      if (delta > 0) {
        const before = new Set(useTrafficStore.getState().rows.map((r) => r.id))
        await duplicateRow(last.id)
        const fresh = useTrafficStore.getState().rows.find((r) => !before.has(r.id))
        if (fresh) {
          // A genuinely new asset: clear the cloned copy so it drafts anew, and push its slot
          // one week past the last so it doesn't stack on the same date.
          const next = new Date(last.scheduledAt ? Date.parse(last.scheduledAt) : Date.now())
          next.setDate(next.getDate() + 7)
          await updateRow(fresh.id, { messaging: {}, scheduledAt: next.toISOString() })
          await draftCopy([fresh.id])
        }
      } else if (ordered.length > 1) {
        await removeRow(last.id)
      }
    } finally {
      setCountBusy(false)
      // Keep this deliverable selected so the inspector stays open on it after the refresh.
      setSel(deliv.key)
    }
  }
  const applyBlueprintView = async (rows: TrafficRow[], bp: EmailBlueprint) => {
    if (blueprintBusy || !rows.length) return
    setBlueprintBusy(true)
    try {
      const ordered = [...rows].sort((a, b) => Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || ''))
      const fieldKeys = ordered[0] ? messagingFields(ordered[0].channel, ordered[0].assetType).map((f) => f.key) : undefined
      const briefs = blueprintBriefs(bp, fieldKeys)
      for (let i = 0; i < ordered.length; i++) {
        const lineage: Record<string, string> = { ...(ordered[i].lineage ?? {}), brief: briefs[i % briefs.length], ...stepLineage(bp, i) }
        await updateRow(ordered[i].id, { messaging: {}, lineage })
      }
      await draftCopy(ordered.map((r) => r.id))
    } finally {
      setBlueprintBusy(false)
    }
  }
  const viewDelivs: ViewDeliverable[] = useMemo(() => {
    const map = new Map<string, ViewDeliverable>()
    for (const r of viewRows) {
      // A deliverable that branches off a specific asset (a downstream journey step) groups
      // on its own, keyed by its source, so it never merges with the campaign-level deliverables
      // of the same channel/type.
      const key = `${r.channel}|${r.assetType}${r.branchOf ? `|↳${r.branchOf}` : ''}`
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
  // Place a just-added "next step" deliverable beside the asset it branches from, so the journey
  // reads left→right with a short connector — instead of it stacking at the bottom of the column.
  useLayoutEffect(() => {
    const pending = pendingPlaceRef.current
    if (!pending) return
    const cv = canvasRef.current
    if (!cv) return
    const srcEl = cv.querySelector(`[data-node-id="${pending.srcId}"]`)
    const delivEl = cv.querySelector(`[data-node-id="${pending.key}"]`)
    if (!srcEl || !delivEl) return
    pendingPlaceRef.current = null
    const sr = srcEl.getBoundingClientRect()
    const dr = delivEl.getBoundingClientRect()
    const scale = zoom / 100
    setPos((prev) => ({
      ...prev,
      [pending.key]: {
        x: (prev[pending.key]?.x ?? 0) + (sr.right + 140 * scale - dr.left) / scale,
        y: (prev[pending.key]?.y ?? 0) + (sr.top - dr.top) / scale,
      },
    }))
  }, [viewDelivs, zoom])
  const viewAudiences = useMemo(() => [...new Set(viewRows.map((r) => (r.audience ?? '').trim()).filter(Boolean))], [viewRows])
  const viewFlight = campaignList.find((c) => c.name === viewName)?.durationWeeks
  const viewShort = viewName ? viewName.replace(`${brand} — `, '') : ''

  // The records this flow references, drawn from the Records pages (Companies / People /
  // Segments / Media mix). These references drive asset generation.
  const viewCampaign = useMemo(() => campaignList.find((c) => c.name === viewName), [campaignList, viewName])
  const flowRefs = viewCampaign?.references ?? []
  // Estimated media spend PER paid placement: the campaign's paid-media budget (explicit
  // mediaBudget, else the strategy's media share of the overall budget) split evenly across
  // its paid assets. Lets a paid card show a spend figure even when none was logged per-asset.
  const paidSpendEach = useMemo(() => {
    const paid = viewRows.filter((r) => CHANNELS[r.channel as ChannelId]?.kind === 'paid')
    if (!paid.length) return 0
    const strat = GTM_STRATEGIES.find((s) => s.key === viewCampaign?.strategy)
    const share = (strat ? mediaSharePct(strat) : null) ?? 50
    const pool = viewCampaign?.mediaBudget ?? Math.round(((viewCampaign?.overallBudget ?? 0) * share) / 100)
    return pool > 0 ? Math.round(pool / paid.length) : 0
  }, [viewRows, viewCampaign])
  // Budget ASSIGNMENT: the campaign budget must land on paid assets. Track how much of it is
  // assigned (the sum of paid rows' budget.amount) so an under- or over-assigned budget is flagged,
  // and offer to split it evenly across the paid placements.
  const viewPaidRows = useMemo(() => viewRows.filter((r) => CHANNELS[r.channel as ChannelId]?.kind === 'paid'), [viewRows])
  const campaignBudget = viewCampaign?.overallBudget ?? 0
  const assignedBudget = useMemo(() => viewPaidRows.reduce((sum, r) => sum + (r.budget?.amount ?? 0), 0), [viewPaidRows])
  const assignEvenly = () => {
    if (!viewPaidRows.length || campaignBudget <= 0) return
    const each = Math.floor(campaignBudget / viewPaidRows.length)
    const remainder = campaignBudget - each * viewPaidRows.length
    void updateRows(viewPaidRows.map((r, i) => ({ id: r.id, patch: { budget: { amount: each + (i === 0 ? remainder : 0), type: 'lifetime' as const } } })))
  }
  const brandMixesForRefs = useMemo(() => mediaMixes.filter((m) => m.brand === brand), [mediaMixes, brand])
  // The brand's proof points (RTBs), resolved up the brand tree like generation reads them.
  const brandProof = useMemo(() => (brand ? resolveBrandScope(brand, brandSystems, brandMeta).library.rtbs : []), [brand, brandSystems, brandMeta])
  // Every Records page, as selectable tag groups: Companies / People / Segments / Channels /
  // Proof points / Media mix. Segments ARE the brand's audiences (from clientAudiences).
  const recordGroups = useMemo(
    () => [
      { type: 'company' as FlowRefType, label: 'Companies', items: companies.map((c) => ({ id: c.id, label: c.name })) },
      { type: 'person' as FlowRefType, label: 'People', items: people.map((p) => ({ id: p.id, label: p.name })) },
      { type: 'segment' as FlowRefType, label: 'Segments', items: brandSegments.map((a) => ({ id: a.id, label: a.name })) },
      { type: 'channel' as FlowRefType, label: 'Channels', items: channelRecords.map((c) => ({ id: c.id, label: c.name })) },
      { type: 'proof' as FlowRefType, label: 'Proof points', items: brandProof.map((r) => ({ id: r.id, label: r.label })) },
    ],
    [companies, people, brandSegments, channelRecords, brandProof],
  )
  const hasRef = (type: FlowRefType, id: string) => flowRefs.some((r) => r.type === type && r.id === id)
  // Record Tags edit in BOTH modes through one set of ops, so the same tag-row + picker UI
  // works whether you're building a new flow or clicking the campaign card of a built one.
  // Build edits the local brief refs; a viewed (built) flow edits the campaign's stored
  // references and flags a regenerate.
  const activeRefs = viewName !== null ? flowRefs : briefRefsEffective
  const hasActiveRef = (type: FlowRefType, id: string) => (viewName !== null ? hasRef(type, id) : hasBriefRef(type, id))
  const addActiveRef = (type: FlowRefType, id: string, label: string) => {
    if (viewName === null) return addBriefRef(type, id, label)
    if (hasRef(type, id)) return
    setCampaignReferences(viewName, [...flowRefs, { type, id, label }])
    setRefsDirty(true)
  }
  const removeActiveRef = (key: string) => {
    if (viewName === null) return removeBriefRef(key)
    setCampaignReferences(viewName, flowRefs.filter((r) => refKey(r) !== key))
    setRefsDirty(true)
  }
  const replaceActiveRef = (key: string, type: FlowRefType, id: string, label: string) => {
    if (viewName === null) return replaceBriefRef(key, type, id, label)
    setCampaignReferences(viewName, flowRefs.map((r) => (refKey(r) === key ? { type, id, label } : r)))
    setRefsDirty(true)
  }
  // Editing the CAMPAIGN's records (the brief).
  const campaignTagOps: TagOps = {
    refs: activeRefs,
    has: hasActiveRef,
    add: addActiveRef,
    remove: removeActiveRef,
    replace: replaceActiveRef,
    openPicker: () => { setPickerDeliv(null); setPickerQuery(''); setOpenTagKey(null); setPickerOpen(true) },
  }
  // A deliverable's effective records: its per-asset OVERRIDE if any row carries one, else the
  // campaign's (inherited). Editing writes the full resulting set onto every asset of the
  // deliverable (materializing the override) and flags a regenerate.
  const delivEffRefs = (deliv: ViewDeliverable): FlowReference[] =>
    deliv.rows.find((r) => r.references && r.references.length)?.references ?? flowRefs
  const writeDelivRefs = (deliv: ViewDeliverable, next: FlowReference[]) => {
    void updateRows(deliv.rows.map((r) => ({ id: r.id, patch: { references: next } })))
    setRefsDirty(true)
  }
  const delivTagOps = (deliv: ViewDeliverable): TagOps => ({
    refs: delivEffRefs(deliv),
    has: (type, id) => delivEffRefs(deliv).some((r) => r.type === type && r.id === id),
    add: (type, id, label) => {
      const cur = delivEffRefs(deliv)
      if (cur.some((r) => r.type === type && r.id === id)) return
      writeDelivRefs(deliv, [...cur, { type, id, label }])
    },
    remove: (key) => writeDelivRefs(deliv, delivEffRefs(deliv).filter((r) => refKey(r) !== key)),
    replace: (key, type, id, label) => writeDelivRefs(deliv, delivEffRefs(deliv).map((r) => (refKey(r) === key ? { type, id, label } : r))),
    openPicker: () => { setPickerDeliv(deliv.key); setPickerQuery(''); setOpenTagKey(null); setPickerOpen(true) },
  })
  // The Record Tags block (label + one row per tag with a swap dropdown + remove, then "Add a
  // record"), shared by the build brief, the built-flow brief, and a deliverable's override.
  const renderRecordTags = (ops: TagOps) => (
    <>
      <label className="flow-inspect-label" style={{ marginTop: 16 }}>
        Record Tags{ops.refs.length ? ` · ${ops.refs.length}` : ''}
      </label>
      {ops.refs.map((ref) => {
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
                          const on = ops.has(g.type, it.id)
                          return (
                            <button key={it.id} className={`flow-aud-item${refKey({ type: g.type, id: it.id }) === key ? ' on' : ''}`} disabled={on && refKey({ type: g.type, id: it.id }) !== key} onClick={() => { ops.replace(key, g.type, it.id, it.label); setOpenTagKey(null) }}>
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
            <button className="flow-tagrow-del" title="Remove tag" aria-label="Remove tag" onClick={() => ops.remove(key)}>✕</button>
          </div>
        )
      })}
      <div className="flow-tagrow flow-tagrow-add">
        <span className="flow-tagrow-ic flow-tagrow-ic-add" aria-hidden="true">＋</span>
        <button className="flow-aud-btn flow-tagrow-addbtn" onClick={ops.openPicker}>
          <span className="flow-aud-btn-txt flow-tagrow-add-txt">Add a record</span>
        </button>
      </div>
    </>
  )
  // The "Add a record" drawer edits whatever opened it: the campaign, or a deliverable's
  // override. Resolve the deliverable fresh each render so it stays reactive after edits.
  const pickerTargetDeliv = pickerDeliv ? viewDelivs.find((d) => d.key === pickerDeliv) : undefined
  const pickerOps: TagOps = pickerTargetDeliv ? delivTagOps(pickerTargetDeliv) : campaignTagOps
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
  // Reseed the view-mode brief drafts when you open a different built flow.
  useEffect(() => {
    const c = useTrafficStore.getState().campaignList.find((x) => x.name === viewName)
    setViewSubjectDraft(c?.subject ?? '')
    setViewBudgetDraft(c?.overallBudget != null ? String(c.overallBudget) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewName])
  // Commit a built flow's subject/budget edits on blur; a subject change flags a regenerate
  // (the copy is written to the theme, so it needs a rewrite to reflect the new one).
  const commitViewSubject = () => {
    if (!viewName) return
    const next = viewSubjectDraft.trim()
    if (next === (viewCampaign?.subject ?? '').trim()) return
    setCampaignSubject(viewName, next)
    setRefsDirty(true)
  }
  const commitViewBudget = () => {
    if (!viewName) return
    const n = viewBudgetDraft.trim() === '' ? undefined : Math.max(0, Number(viewBudgetDraft) || 0)
    if (n === viewCampaign?.overallBudget) return
    patchCampaign(viewName, { overallBudget: n })
    // A budget needs to be assigned to paid assets. Flag it if there's nowhere to put it, or if
    // it isn't fully assigned across the paid placements yet.
    if (n && n > 0) {
      if (!viewPaidRows.length) showToast(`$${n.toLocaleString()} budget set, but this flow has no paid media to spend it on — add a paid deliverable (Meta, LinkedIn Ads, …) to allocate it.`)
      else if (assignedBudget < n) showToast(`$${n.toLocaleString()} budget set — assign it across your paid assets so it's fully allocated.`)
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
    // If the picker was opened from an asset's "+", link the new rows back to that asset so the
    // canvas draws the journey edge (asset → this deliverable).
    const src = connectFromRef.current
    const srcRow = src ? useTrafficStore.getState().rows.find((r) => r.id === src) : undefined
    setPickAt(null)
    setConnectFrom(null)
    setAddingDeliv(true)
    try {
      const auds = flowRefs.length ? flowRefs.map((r) => r.label) : viewAudiences.length ? viewAudiences : audSelection
      const d: Deliverable = { label: p.label, channel: p.channel, assetType: p.assetType, media: p.media, perMonth: startCount(p), runtime: p.runtime, brand: p.brand }
      const before = new Set(useTrafficStore.getState().rows.filter((r) => r.campaign === viewName).map((r) => r.id))
      await seedCampaignAssets(viewName, [d], { flightWeeks: viewFlight ?? flightWeeks, audiences: auds })
      const fresh = useTrafficStore.getState().rows.filter((r) => r.campaign === viewName && !before.has(r.id))
      if (srcRow && fresh.length) {
        await updateRows(fresh.map((r) => ({ id: r.id, patch: { branchOf: srcRow.assetName } })))
        // Queue the new deliverable to be placed beside its source asset once it renders.
        const f = fresh[0]
        pendingPlaceRef.current = { key: `${f.channel}|${f.assetType}${f.branchOf ? `|↳${f.branchOf}` : `|↳${srcRow.assetName}`}`, srcId: srcRow.id }
      }
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
  // Apply an email blueprint to a deliverable: a sequence expands into its steps (one email
  // per arc step, each brief seeded); a single (newsletter) applies its structure brief to
  // every issue. Then re-preview so the copy reflects the new structure.
  const applyBlueprint = (id: string, bp: EmailBlueprint | null) => {
    let target: FlowDeliverable | null = null
    setNodes((n) =>
      n.map((x) => {
        if (x.id !== id) return x
        if (!bp) { const { blueprint: _b, ...rest } = x; target = rest; return rest }
        const p = presetByKey(x.presetKey)
        const fieldKeys = p ? messagingFields(p.channel, p.assetType).map((f) => f.key) : undefined
        const briefs = blueprintBriefs(bp, fieldKeys)
        const perMonth = bp.kind === 'sequence' ? bp.steps.length : x.perMonth
        target = { ...x, blueprint: bp.key, briefs, perMonth }
        return target
      }),
    )
    if (target) void genPreview(target)
  }
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
      // A viewed flow wires campaign → each deliverable → each of its posts. A deliverable
      // that was added off an asset card hangs from that asset instead of the campaign, so the
      // journey (asset → next step) reads as a forward edge on the canvas.
      for (const d of viewDelivs) {
        const branchSrc = d.rows.find((r) => r.branchOf)?.branchOf
        const srcRow = branchSrc ? viewRows.find((r) => r.assetName === branchSrc) : undefined
        out.push({ from: srcRow ? srcRow.id : 'campaign', to: d.key })
        for (const r of d.rows) out.push({ from: d.key, to: r.id })
      }
      return out
    }
    for (const n of nodes) {
      // Every deliverable hangs off the campaign card.
      out.push({ from: 'campaign', to: n.id })
      const p = presetByKey(n.presetKey)
      if (!p) continue
      // Wire the deliverable to each sub-card it renders (posts, sections, or a page card).
      const slots = subcardCount(p, n.perMonth)
      for (let bi = 0; bi < slots; bi++) out.push({ from: n.id, to: `${n.id}:${bi}` })
    }
    return out
  }, [nodes, viewName, viewDelivs, viewRows])

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
        // A blueprint carries per-email guidance (framework / subject formula / levers) that
        // rides in `lineage`; draftCopy copies lineage into the copy context automatically.
        const bp = n.blueprint ? blueprintByKey(n.blueprint) : null
        if (briefs.length) {
          const ordered = [...fresh].sort((a, b) => Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || ''))
          for (let i = 0; i < ordered.length; i++) {
            const brief = briefs[i % briefs.length]
            const bpLineage = bp ? stepLineage(bp, i) : {}
            await updateRow(ordered[i].id, {
              assetName: `${ordered[i].assetName} · ${brief}`,
              lineage: { ...(ordered[i].lineage ?? {}), brief, ...bpLineage },
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
  // A channel / page Record Tag (Email, Website, Landing page, Blog article, YouTube Ads, …)
  // names a channel to build for. Map each such tag to that channel's primary deliverable
  // preset, so tagging a channel and hitting Build seeds + writes that asset — no need to
  // also add the deliverable from the toolbar. Company / person / segment / proof tags stay
  // pure references; only channel tags name something to build.
  const channelLabelToId = useMemo(() => {
    const m = new Map<string, ChannelId>()
    for (const id of Object.keys(CHANNELS) as ChannelId[]) m.set(CHANNELS[id].label.trim().toLowerCase(), id)
    return m
  }, [])
  const presetForChannelTag = (recId: string): DeliverablePreset | undefined => {
    const rec = channelRecords.find((c) => c.id === recId)
    if (!rec) return undefined
    const chId = channelLabelToId.get(rec.name.trim().toLowerCase())
    return chId ? DELIVERABLE_PRESETS.find((p) => p.channel === chId) : undefined
  }
  // Channel tags not already covered by an explicit deliverable node — each becomes a
  // synthesized deliverable at Build time (deduped by channel so two email tags don't double
  // up, and an explicit email node wins over an "Email" tag).
  const channelTagPresets = useMemo(() => {
    const covered = new Set(nodes.map((n) => presetByKey(n.presetKey)?.channel).filter(Boolean))
    const out: DeliverablePreset[] = []
    const seen = new Set<ChannelId>()
    for (const r of briefRefsEffective) {
      if (r.type !== 'channel') continue
      const p = presetForChannelTag(r.id)
      if (!p || covered.has(p.channel) || seen.has(p.channel)) continue
      seen.add(p.channel)
      out.push(p)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefRefsEffective, nodes, channelRecords])

  // Whether the flow being built has any paid-media deliverable (a node or a channel tag) — a
  // budget needs one of these to land on.
  const hasPaidBuild =
    nodes.some((x) => CHANNELS[presetByKey(x.presetKey)?.channel as ChannelId]?.kind === 'paid') ||
    channelTagPresets.some((p) => CHANNELS[p.channel as ChannelId]?.kind === 'paid')

  const build = () => {
    // Materialize any channel tags into real deliverable nodes first (so they appear on the
    // canvas and a re-build won't duplicate them), then build the union of node + tag delivs.
    const extra = channelTagPresets.map((p) => ({ id: freshNodeId(), presetKey: p.key, perMonth: startCount(p) }) as FlowDeliverable)
    const effective = [...nodes, ...extra]
    if (extra.length) {
      setNodes(effective)
      for (const n of extra) void genPreview(n)
    }
    return buildFlow({ name, subject, budget, flightWeeks, refs: briefRefsEffective, audiences: audSelection, nodes: effective })
  }

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

  // Candidates for a swap: only ingested posts that MATCH the deliverable — same channel, or at
  // least the same platform (so a real LinkedIn post can back a LinkedIn ad, but a YouTube video
  // can never stand in for a LinkedIn ad). No cross-platform fallback. Filtered by the search box.
  const swapCandidates = useMemo(() => {
    if (!selPost) return []
    const q = swapSearch.trim().toLowerCase()
    const platform = CHANNELS[selPost.channel as ChannelId]?.platform
    const matches = ingestedPosts.filter(
      (r) => r.id !== selPost.id && (r.channel === selPost.channel || (!!platform && CHANNELS[r.channel as ChannelId]?.platform === platform)),
    )
    if (!q) return matches
    return matches.filter((r) => (r.assetName ?? '').toLowerCase().includes(q) || Object.values((r.messaging ?? {}) as Record<string, string>).some((v) => v?.toLowerCase().includes(q)))
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
  // The reverse of a swap: drop the ingested post's live fields (source, url, metrics, posted
  // status) back to a generated draft, then write fresh AI copy for the slot.
  const replaceWithGenerated = async () => {
    if (!selPost || replacing) return
    setReplacing(true)
    try {
      await updateRow(selPost.id, {
        messaging: {},
        source: 'generated',
        sourceUrl: undefined,
        socialMetrics: undefined,
        engagement: undefined,
        status: 'draft',
        postedAt: undefined,
        publishedAt: undefined,
      })
      await draftCopy([selPost.id])
    } finally {
      setReplacing(false)
      setSwapOpen(false)
    }
  }
  // Change the copy PATTERN (blueprint) on a single asset: reapply the blueprint's step at this
  // asset's position, keeping its slot, then rewrite its copy to the new framework/CTA/levers.
  const applyPatternToPost = async (row: TrafficRow, bp: EmailBlueprint) => {
    if (patternBusy) return
    setPatternBusy(true)
    try {
      const cur = stepFromLineage(row.lineage)
      const i = cur ? Math.max(0, cur.blueprint.steps.findIndex((s) => s.label === cur.step.label)) : 0
      const fieldKeys = messagingFields(row.channel, row.assetType).map((f) => f.key)
      const briefs = blueprintBriefs(bp, fieldKeys)
      const lineage: Record<string, string> = { ...(row.lineage ?? {}), brief: briefs[i % briefs.length], ...stepLineage(bp, i) }
      await updateRow(row.id, { messaging: {}, lineage })
      await draftCopy([row.id])
    } finally {
      setPatternBusy(false)
    }
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
              <button key={v} className={`flow-viewtab${flowView === v ? ' on' : ''}`} onClick={() => { setFlowView(v); if (v !== 'flow') markOnboardingDone('review') }}>
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
              className={`flow-node flow-tier-campaign${sel === 'campaign' ? ' sel' : ''}${selected.has('campaign') ? ' multi' : ''}`}
              data-node-id="campaign"
              style={{ transform: `translate(${pos['campaign']?.x ?? 0}px, ${pos['campaign']?.y ?? 0}px)` }}
              onMouseDown={(e) => startDrag(e, 'campaign')}
              onClick={() => { setSel('campaign'); setPickAt(null) }}
            >
              <span className="flow-node-kind" style={{ color: CAMPAIGN_TONE, background: `color-mix(in srgb, ${CAMPAIGN_TONE} 16%, transparent)` }}>
                Campaign
              </span>
              <div className="flow-node-main">
                <div className="flow-node-text">
                  <div className="flow-node-label">{viewing ? viewShort : name.trim() || 'Untitled campaign'}</div>
                  <div className="flow-node-desc">
                    {viewing ? `${viewRows.length} assets · ${viewDelivs.length} deliverable${viewDelivs.length === 1 ? '' : 's'}` : `${flightWeeks}-week flight`}
                  </div>
                  {renderCardTags(viewing ? flowRefs : briefRefsEffective, false)}
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
                          className={`flow-node flow-tier-deliv${sel === d.key ? ' sel' : ''}${selected.has(d.key) ? ' multi' : ''}`}
                          data-node-id={d.key}
                          onMouseDown={(e) => startDrag(e, d.key)}
                          onClick={() => { setSel(d.key); setPickAt(null) }}
                        >
                          <span className="flow-node-kind" style={{ color: DELIV_TONE, background: `color-mix(in srgb, ${DELIV_TONE} 15%, transparent)` }}>
                            Deliverable
                          </span>
                          <div className="flow-node-main">
                            <div className="flow-node-text">
                              <div className="flow-node-label">{d.label}</div>
                              <div className="flow-node-desc">×{d.count}</div>
                              {renderCardTags(delivEffRefs(d), d.rows.some((r) => r.references && r.references.length))}
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
                                    <PresetTile tone={POST_TONE} />
                                    <div className="flow-node-text">
                                      {r.lineage?.bpStep && <div className="flow-node-step">{r.lineage.bpStep}</div>}
                                      <div className="flow-node-label">{c.head}</div>
                                    </div>
                                  </div>
                                  {c.body && (
                                    <div className="flow-copy">
                                      <div className="flow-copy-body">{c.body}</div>
                                    </div>
                                  )}
                                  {isIngestedPost(r) ? (
                                    <div className="flow-spend-foot" title="Live post metrics">
                                      <span className="flow-spend-dot" aria-hidden="true" />
                                      {ingestedMetricsText(r)}
                                    </div>
                                  ) : hasMediaSpend(r) ? (
                                    <div className="flow-spend-foot" title={spendTitle(r)}>
                                      <span className="flow-spend-dot" aria-hidden="true" />
                                      {(() => {
                                        const explicit = spendLabel(r)
                                        if (explicit !== 'Paid') return `Media spend · ${explicit}`
                                        return paidSpendEach > 0 ? `Paid media · ${usdShort(paidSpendEach)}` : 'Paid media'
                                      })()}
                                    </div>
                                  ) : null}
                                  <button
                                    className="flow-branch-plus"
                                    title="Add a next step from this asset"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setConnectFrom(r.id)
                                      setSel(null)
                                      setBriefCollapsed(false)
                                      setPickAt(viewDelivs.length)
                                    }}
                                  >
                                    +
                                  </button>
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
                          className={`flow-node flow-tier-deliv${sel === n.id ? ' sel' : ''}${selected.has(n.id) ? ' multi' : ''}`}
                          data-node-id={n.id}
                          onMouseDown={(e) => startDrag(e, n.id)}
                          onClick={() => { setSel(n.id); setPickAt(null) }}
                        >
                          <span className="flow-node-kind" style={{ color: DELIV_TONE, background: `color-mix(in srgb, ${DELIV_TONE} 15%, transparent)` }}>
                            Deliverable
                          </span>
                          <div className="flow-node-main">
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
                                    <PresetTile tone={POST_TONE} />
                                    <div className="flow-node-text">
                                      <div className="flow-node-label">{PAGE_CHANNELS.has(p.channel) ? 'Page' : `${subcardWord(p)} ${bi + 1}`}</div>
                                      {PAGE_CHANNELS.has(p.channel) ? (
                                        n.description?.trim() ? <div className="flow-node-desc">{n.description}</div> : null
                                      ) : (
                                        <input
                                          className="flow-brief-sub"
                                          placeholder={`What's this ${subcardWord(p).toLowerCase()} about?`}
                                          value={n.briefs?.[bi] || ''}
                                          onChange={(e) => setBrief(n.id, bi, e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      )}
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
                  <button className="flow-back" onClick={() => { setPickAt(null); setConnectFrom(null) }}>
                    ‹ Back
                  </button>
                  <span className="flow-panel-title">
                    {connectFrom
                      ? `Next step after ${viewRows.find((r) => r.id === connectFrom)?.assetName ?? 'this asset'}`
                      : 'Add deliverable'}
                  </span>
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
                  {CHANNELS[selPost.channel as ChannelId]?.kind === 'paid' && (
                    <>
                      <label className="flow-inspect-label">Budget for this asset</label>
                      <div className="flow-budget">
                        <span className="flow-budget-cur">$</span>
                        <input
                          key={selPost.id}
                          className="flow-budget-input"
                          type="number"
                          min={0}
                          step={500}
                          defaultValue={selPost.budget?.amount || ''}
                          placeholder="0"
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            void updateRow(selPost.id, { budget: v === '' ? undefined : { amount: Math.max(0, +v || 0), type: selPost.budget?.type ?? 'lifetime' } })
                          }}
                        />
                      </div>
                      <div className="flow-inspect-note" style={{ marginTop: 6 }}>Its share of the campaign budget. Assign the full budget across your paid assets.</div>
                    </>
                  )}
                  {(() => {
                    const s = stepFromLineage(selPost.lineage)
                    if (!s) return null
                    const levers = s.step.levers.filter((l) => l !== 'none')
                    return (
                      <div className="flow-bp-emailstep">
                        <div className="flow-bp-emailstep-top">
                          <span className="flow-bp-emailstep-name">{s.step.label}</span>
                          <span className="flow-bp-emailstep-bp">{s.blueprint.name} · {s.step.timing}</span>
                        </div>
                        {s.step.subjectFormula !== '—' && <div className="flow-bp-emailstep-subj">Subject formula: “{s.step.subjectFormula}”</div>}
                        <div className="flow-bp-emailstep-meta">
                          <span className="flow-bp-tag">{s.step.framework}</span>
                          <span className="flow-bp-tag flow-bp-tag-cta">{s.step.cta}</span>
                          {levers.map((l) => (
                            <span key={l} className="flow-bp-tag flow-bp-tag-lever">{l.replace('-', ' ')}</span>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  {(() => {
                    // Alternatives come from the pattern the asset is USING (its blueprint's
                    // channel), so a post keeps its pattern family even if its row channel drifted.
                    const curBp = stepFromLineage(selPost.lineage)?.blueprint
                    const chan = (curBp?.channel ?? selPost.channel) as ChannelId
                    const bps = blueprintsFor(chan, curBp?.assetType ?? selPost.assetType)
                    // Changing the pattern rewrites the copy, so only for generated posts — an
                    // ingested (live) post keeps its real copy until you Replace it.
                    if (bps.length < 2 || isIngestedPost(selPost)) return null
                    const cur = curBp?.key
                    return (
                      <div className="flow-bp" style={{ marginTop: 12 }}>
                        <div className="flow-cfg-h">Pattern</div>
                        <div className="flow-inspect-note" style={{ marginTop: 0, marginBottom: 8 }}>Change the copy pattern for just this asset. This rewrites its copy.</div>
                        {bps.map((bp) => (
                          <button key={bp.key} className={`flow-bp-pick${cur === bp.key ? ' on' : ''}`} disabled={patternBusy} onClick={() => void applyPatternToPost(selPost, bp)}>
                            <span className="flow-bp-pick-name">{bp.name}</span>
                            <span className="flow-bp-pick-cadence">{patternBusy ? 'Applying…' : cur === bp.key ? 'Current' : bp.cadence}</span>
                            <span className="flow-bp-pick-sum">{bp.summary}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
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
                    {isIngestedPost(selPost) && (
                      <button className="flow-swap-btn flow-swap-regen" onClick={() => void replaceWithGenerated()} disabled={replacing}>
                        {replacing ? 'Generating…' : '✦ Replace with a generated post'}
                      </button>
                    )}
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
                          <div className="flow-swap-empty">
                            {swapSearch.trim()
                              ? 'No matches.'
                              : ingestedPosts.length
                                ? `No live ${CHANNELS[selPost.channel as ChannelId]?.platform ?? 'matching'} posts in your Library to swap in for this deliverable.`
                                : 'No ingested posts to swap in yet. Ingest content into the Library first.'}
                          </div>
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
                  {(() => {
                    // Show each field in schema order with its proper label (not the raw
                    // key), then any messaging keys the schema doesn't know about.
                    const flds = messagingFields(selPost.channel, selPost.assetType)
                    const m = (selPost.messaging ?? {}) as Record<string, string>
                    const known = new Set(flds.map((f) => f.key))
                    const rows: [string, string, string][] = flds.filter((f) => m[f.key]?.trim()).map((f) => [f.key, f.label, m[f.key]])
                    for (const [k, v] of Object.entries(m)) if (!known.has(k) && v?.trim()) rows.push([k, k, v])
                    return rows.map(([k, label, v]) => (
                      <div key={k} className="flow-post-field">
                        <label className="flow-inspect-label">{label}</label>
                        <div className="flow-post-value">{v}</div>
                      </div>
                    ))
                  })()}
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
                  <label className="flow-inspect-label">Assets</label>
                  <div className="flow-step">
                    <button onClick={() => void changeDelivCount(selDeliv, -1)} disabled={countBusy || selDeliv.count <= 1} aria-label="Remove one asset">−</button>
                    <span>{countBusy ? '…' : `×${selDeliv.count}`}</span>
                    <button onClick={() => void changeDelivCount(selDeliv, 1)} disabled={countBusy} aria-label="Add one asset">+</button>
                  </div>
                  <div className="flow-inspect-note" style={{ marginTop: 8 }}>{countBusy ? 'Updating…' : 'Add or remove assets under this deliverable. New ones draft fresh copy. Click a post to see its copy.'}</div>
                  {renderRecordTags(delivTagOps(selDeliv))}
                  <div className="flow-inspect-note" style={{ marginTop: 8 }}>
                    {selDeliv.rows.some((r) => r.references && r.references.length) ? (
                      <>
                        Overriding the campaign for just this deliverable.{' '}
                        <button
                          className="flow-reset-link"
                          onClick={() => { void updateRows(selDeliv.rows.map((r) => ({ id: r.id, patch: { references: undefined } }))); setRefsDirty(true) }}
                        >
                          Reset to campaign
                        </button>
                      </>
                    ) : (
                      'Inherited from the campaign. Edit to target different records for just this deliverable, then Regenerate.'
                    )}
                  </div>
                  {(() => {
                    const bps = blueprintsFor(selDeliv.channel, selDeliv.assetType)
                    if (!bps.length) return null
                    return (
                      <div className="flow-bp" style={{ marginTop: 4 }}>
                        <div className="flow-cfg-h">Blueprint</div>
                        <div className="flow-inspect-note" style={{ marginTop: 0, marginBottom: 8 }}>
                          Apply a proven structure to {selDeliv.count === 1 ? 'this' : `these ${selDeliv.count}`} {blueprintNoun(selDeliv.channel)}{selDeliv.count === 1 ? '' : 's'}. This rewrites their copy to the arc.
                        </div>
                        {bps.map((bp) => (
                          <button key={bp.key} className="flow-bp-pick" disabled={blueprintBusy} onClick={() => void applyBlueprintView(selDeliv.rows, bp)}>
                            <span className="flow-bp-pick-name">{bp.name}</span>
                            <span className="flow-bp-pick-cadence">{blueprintBusy ? 'Applying…' : bp.cadence}</span>
                            <span className="flow-bp-pick-sum">{bp.summary}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </>
            ) : (
              <>
                <div className="flow-panel-head">
                  <CampaignTile />
                  <span className="flow-panel-title">Campaign brief</span>
                </div>
                <div className="flow-inspect">
                  <label className="flow-inspect-label">Name</label>
                  <input className="flow-inspect-input" value={viewShort} readOnly title="Renaming a built flow isn't available yet" />
                  <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                    Goal / subject
                  </label>
                  <textarea
                    className="flow-inspect-input"
                    rows={2}
                    value={viewSubjectDraft}
                    placeholder="What is this campaign for?"
                    onChange={(e) => setViewSubjectDraft(e.target.value)}
                    onBlur={commitViewSubject}
                  />
                  <div className="flow-inspect-note" style={{ marginTop: 4 }}>The campaign theme. Every asset's copy is written to it; change it, then Regenerate to redraft them all.</div>
                  <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                    Flight length
                  </label>
                  <div className="flow-step">
                    <button onClick={() => patchCampaign(viewName, { durationWeeks: Math.max(1, (viewFlight ?? 1) - 1) })}>−</button>
                    <span>{viewFlight ?? 1} weeks</span>
                    <button onClick={() => patchCampaign(viewName, { durationWeeks: (viewFlight ?? 1) + 1 })}>+</button>
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
                      value={viewBudgetDraft}
                      placeholder="Total campaign budget"
                      onChange={(e) => setViewBudgetDraft(e.target.value)}
                      onBlur={commitViewBudget}
                    />
                  </div>
                  {campaignBudget > 0 && (viewPaidRows.length === 0 ? (
                    <div className="flow-budget-warn">
                      No paid media to spend this budget on. Add a paid deliverable (Meta, LinkedIn Ads, …) to allocate it.
                    </div>
                  ) : assignedBudget < campaignBudget ? (
                    <div className="flow-budget-warn">
                      <div>${assignedBudget.toLocaleString()} of ${campaignBudget.toLocaleString()} assigned to paid assets{assignedBudget > 0 ? ` — $${(campaignBudget - assignedBudget).toLocaleString()} left` : ''}.</div>
                      <button className="flow-budget-assign" onClick={assignEvenly}>Assign evenly across {viewPaidRows.length} paid asset{viewPaidRows.length === 1 ? '' : 's'}</button>
                    </div>
                  ) : assignedBudget > campaignBudget ? (
                    <div className="flow-budget-warn">
                      <div>${assignedBudget.toLocaleString()} assigned — ${(assignedBudget - campaignBudget).toLocaleString()} over the ${campaignBudget.toLocaleString()} budget.</div>
                      <button className="flow-budget-assign" onClick={assignEvenly}>Rebalance evenly</button>
                    </div>
                  ) : (
                    <div className="flow-budget-ok">✓ ${campaignBudget.toLocaleString()} fully assigned across {viewPaidRows.length} paid asset{viewPaidRows.length === 1 ? '' : 's'}.</div>
                  ))}
                  {renderRecordTags(campaignTagOps)}
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
                    {viewRows.length} assets · {viewDelivs.length} deliverable type{viewDelivs.length === 1 ? '' : 's'}. Click a post to see its copy, or use the Grid and Calendar tabs above.
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
                    onBlur={() => {
                      const n = Math.max(0, +budget || 0)
                      if (n > 0 && !hasPaidBuild) showToast(`$${n.toLocaleString()} budget set, but no paid media in this flow — add a paid deliverable (Meta, LinkedIn Ads, …) to allocate it.`)
                    }}
                  />
                </div>
                {(+budget || 0) > 0 && !hasPaidBuild && (
                  <div className="flow-budget-warn">
                    No paid media to spend this budget on. Add a paid deliverable (Meta, LinkedIn Ads, …) to allocate it.
                  </div>
                )}
                {renderRecordTags(campaignTagOps)}
                <div className="flow-inspect-note" style={{ marginTop: 14 }}>
                  {channelTagPresets.length && !nodes.length
                    ? `Build writes ${channelTagPresets.length} deliverable${channelTagPresets.length === 1 ? '' : 's'} from your channel tags. Add more from the toolbar.`
                    : 'Add deliverables from the canvas toolbar (or tag channels above), then Build.'}
                </div>
                <button className="flow-brief-build" onClick={build} disabled={(!nodes.length && !channelTagPresets.length) || building}>
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
              const isPage = PAGE_CHANNELS.has(p.channel)
              const pv = preview[node.id]
              const post = pv?.posts?.[bi]
              const loading = !!pv?.loading && !(post?.headline || post?.primary || post?.components?.length)
              return (
                <>
                  <div className="flow-panel-head">
                    <PresetTile tone={TONE_HEX[p.tone]} />
                    <span className="flow-panel-title">{isPage ? 'Page' : `Post ${bi + 1}`}</span>
                    <button className="flow-back flow-close" onClick={() => setSel(null)}>
                      ✕
                    </button>
                  </div>
                  <div className="flow-inspect">
                    <button className="flow-back" onClick={() => setSel(node.id)}>
                      ‹ {p.label}
                    </button>
                    <label className="flow-inspect-label" style={{ marginTop: 12 }}>
                      What's this {isPage ? 'page' : 'post'} about?
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
                    ) : post && (post.headline || post.primary || post.components?.length) ? (
                      <div className="flow-post-detail">
                        {isPage && post.components?.length ? (
                          post.components.map((c) => (
                            <div className="flow-post-detail-field" key={c.key}>
                              <div className="flow-post-detail-flabel">{c.label}</div>
                              <div className="flow-post-detail-fval">{c.value}</div>
                            </div>
                          ))
                        ) : (
                          <>
                            {post.headline && <div className="flow-post-detail-head">{post.headline}</div>}
                            {post.primary && <div className="flow-post-detail-body">{post.primary}</div>}
                          </>
                        )}
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
                    {(() => {
                      const bps = blueprintsFor(p.channel, p.assetType)
                      if (!bps.length) return null
                      const active = node.blueprint ? blueprintByKey(node.blueprint) : null
                      return (
                        <div className="flow-bp">
                          <div className="flow-cfg-h">Blueprint</div>
                          {!active ? (
                            <>
                              <div className="flow-inspect-note" style={{ marginTop: 0, marginBottom: 8 }}>
                                Apply a proven {blueprintNoun(p.channel)} structure so the copy follows a deliberate arc.
                              </div>
                              {bps.map((bp) => (
                                <button key={bp.key} className="flow-bp-pick" onClick={() => applyBlueprint(node.id, bp)}>
                                  <span className="flow-bp-pick-name">{bp.name}</span>
                                  <span className="flow-bp-pick-cadence">{bp.cadence}</span>
                                  <span className="flow-bp-pick-sum">{bp.summary}</span>
                                </button>
                              ))}
                            </>
                          ) : (
                            <>
                              <div className="flow-bp-active">
                                <span className="flow-bp-active-name">{active.name}</span>
                                <span className="flow-bp-active-cadence">{active.cadence}</span>
                                <button className="flow-bp-clear" onClick={() => applyBlueprint(node.id, null)}>Remove</button>
                              </div>
                              <ol className="flow-bp-steps">
                                {active.steps.map((s, i) => (
                                  <li key={i} className="flow-bp-step">
                                    <div className="flow-bp-step-top">
                                      <span className="flow-bp-step-label">{s.label}</span>
                                      <span className="flow-bp-step-timing">{s.timing}</span>
                                    </div>
                                    {s.subjectFormula !== '—' && <div className="flow-bp-step-subj">“{s.subjectFormula}”</div>}
                                    <div className="flow-bp-step-meta">
                                      <span className="flow-bp-tag">{s.framework}</span>
                                      <span className="flow-bp-tag flow-bp-tag-cta">{s.cta}</span>
                                      {s.levers.filter((l) => l !== 'none').map((l) => (
                                        <span key={l} className="flow-bp-tag flow-bp-tag-lever">{l.replace('-', ' ')}</span>
                                      ))}
                                    </div>
                                  </li>
                                ))}
                              </ol>
                              <details className="flow-bp-rules">
                                <summary>Guardrails</summary>
                                <ul>
                                  {active.guardrails.map((g, i) => (
                                    <li key={i}>{g}</li>
                                  ))}
                                </ul>
                              </details>
                            </>
                          )}
                        </div>
                      )
                    })()}
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
      {viewing && viewRows.length > 0 && (
        <button className="flow-regen-fab" onClick={regenerateFlow} disabled={regenerating} title="Rewrite every asset's copy">
          {regenerating ? 'Regenerating…' : refsDirty ? '↻ Regenerate with records' : '↻ Regenerate copy'}
        </button>
      )}
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

      {pickerOpen && (
        <>
          <div className="flow-recdrawer-scrim" onClick={() => setPickerOpen(false)} />
          <aside className="flow-recdrawer" role="dialog" aria-label="Add a record">
            <header className="flow-recdrawer-head">
              <span className="flow-recdrawer-title">{pickerTargetDeliv ? `Records · ${pickerTargetDeliv.label}` : 'Add a record'}</span>
              <button className="flow-recdrawer-x" onClick={() => setPickerOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <input
              className="flow-recdrawer-search"
              placeholder="Search records…"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              autoFocus
            />
            <div className="flow-recdrawer-list">
              {(() => {
                const pq = pickerQuery.trim().toLowerCase()
                // Each picker section (Audience nests segment/company/person) gathers its record
                // types' items, tagged with their real type so a chip still shows what it is.
                const sections = PICKER_SECTIONS.map((s) => ({
                  ...s,
                  items: s.types.flatMap((type) => (recordGroups.find((rg) => rg.type === type)?.items ?? []).map((it) => ({ ...it, type })))
                    .filter((it) => (pq ? it.label.toLowerCase().includes(pq) : true)),
                })).filter((s) => s.items.length)
                if (!sections.length) return <div className="flow-recdrawer-empty">No records match.</div>
                return sections.map((s) => {
                  // A search auto-expands so matches are always visible.
                  const collapsed = !pq && !expandedCats.has(s.label)
                  return (
                    <div key={s.label} className="flow-recdrawer-group">
                      <button className="flow-recdrawer-grouphead" onClick={() => toggleCat(s.label)} aria-expanded={!collapsed}>
                        <span className={`flow-recdrawer-chev${collapsed ? '' : ' open'}`} aria-hidden="true">▸</span>
                        <span className="flow-recdrawer-gic">
                          <RecordTypeIcon type={s.types[0]} />
                        </span>
                        {s.label}
                        <span className="flow-recdrawer-count">{s.items.length}</span>
                      </button>
                      {!collapsed &&
                        s.items.map((it) => {
                          const on = pickerOps.has(it.type, it.id)
                          return (
                            <button
                              key={`${it.type}:${it.id}`}
                              className={`flow-recdrawer-item${on ? ' on' : ''}`}
                              onClick={() => (on ? pickerOps.remove(refKey({ type: it.type, id: it.id })) : pickerOps.add(it.type, it.id, it.label))}
                            >
                              <span className="flow-recdrawer-item-ic">
                                <RecordTypeIcon type={it.type} />
                              </span>
                              <span className="flow-recdrawer-item-label">{it.label}</span>
                              {on && <span className="flow-recdrawer-check" aria-hidden="true">✓</span>}
                            </button>
                          )
                        })}
                    </div>
                  )
                })
              })()}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
