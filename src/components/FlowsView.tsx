import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CHANNELS } from '../domain/channels'
// The board's types live in the domain because a persisted slice must be typed outside the
// component that renders it. OBJECT_META stays here: it carries JSX icons.
import {
  type CanvasObject, type CanvasObjectKind, type ObjectFamily, type SmartPlacement,
  type FlowBoard,
  BUILDER_BOARD_KEY, REF_TYPE_FOR_OBJECT_KIND, boardFor, freshObjectId, freshPlacementId as freshGroupId, pruneBoard,
} from '../domain/flowBoard'
import { MAX_FOLDER_DEPTH, buildFolderPath, buildFolderTree, canNestUnder, countDeep, folderName, withAncestors, type FolderNode } from '../domain/campaignFolders'
import { OBJECT_META } from '../domain/canvasObjectMeta'
import { OBJECTIVE_PRESETS, objectivePresetByName } from '../domain/objectivePresets'
import { DIRECTION_FIELD, DIRECTION_KEYS, capFor, type DirectionKey } from '../domain/direction'
import { type SmartObject, describeSmartObject, scopeOf } from '../domain/smartObject'
import { DELIVERABLE_PRESETS, type DeliverablePreset, type FlowDeliverable, freshNodeId, nodeAssetCount, presetByKey, TONE_HEX } from '../domain/flows'
import { FlowVariantTree, isVariantRow } from './FlowVariantTree'
import { resolveBrandScope } from '../domain/brand'
import { can } from '../domain/access'
import type { FlowRefType, FlowReference } from '../domain/clients'
import { newAudience } from '../domain/audiences'
import { ROLE_PRESETS } from '../domain/roles'
import { type Rtb } from '../domain/rtb'
import { blueprintsFor, blueprintByKey, stepLineage, stepFromLineage, blueprintBriefs, type EmailBlueprint } from '../domain/emailPatterns'
import { messagingFields } from '../domain/messaging'
import { GTM_STRATEGIES, mediaSharePct, resolveStrategyKey } from '../domain/strategies'
import { generateFlowEdit } from '../adapters/ask/generateFlowEdit'
import type { FlowCommand, FlowChatMsg } from '../domain/flowAgent'
import { FlowChat, type ChatIntent } from './FlowChat'
import { MiniSheet } from './MiniSheet'
import { ChannelIcon } from './ChannelIcon'
import { InfoTip } from './InfoTip'
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
/**
 * Zoom bounds. The floor was 25%, which was not far enough out to see a whole campaign: ten
 * deliverables with their posts run past 4,000px, so 25% still left most of the board off-screen and
 * the only way around it was to pan and remember. At 10% that board is 400px tall — too small to
 * read, which is the point: you are navigating by shape and colour, then zooming into what you found.
 */
const MIN_ZOOM = 10
const MAX_ZOOM = 200

/** Drag payload for a smart object leaving the Assets panel for the canvas. */
const SMART_OBJECT_DND = 'application/x-breadcrumbs-smart-object'
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
const RECORD_TYPE_LABEL: Record<FlowRefType, string> = { company: 'Company', person: 'Person', segment: 'Audience', channel: 'Channel', proof: 'Proof point', 'media-mix': 'Media mix' }
// The record-type categories in the "Add a record" picker: Audience nests the three WHO types.
const PICKER_SECTIONS: { label: string; types: FlowRefType[] }[] = [
  { label: 'Audience', types: ['segment', 'company', 'person'] },
  { label: 'Channels', types: ['channel'] },
  { label: 'Proof points', types: ['proof'] },
]
// What to call each record type in the UI. The stored strings are historical ('segment' is what
// a user calls an audience), and renaming them would be a migration through share snapshots.
const RecordTypeIcon = ({ type }: { type: FlowRefType }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {RECORD_TYPE_ICON[type]}
  </svg>
)


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
/**
 * How many assets a freshly placed deliverable starts with: ONE.
 *
 * It used to start at the preset's own cadence, so dropping an Instagram reel immediately put four
 * assets and four mini briefs on the board before you had decided anything. The cadence is a
 * planning default, not a decision made by placing a card. Add more with the ×N control on the
 * card or in the inspector, where it reads as a choice.
 *
 * ⚠️ This is the STARTING count only. presetByKey(...).perMonth is untouched, so the picker still
 * shows "4 / month" as the preset's suggested cadence, and Gretel can still ask for a count
 * explicitly (applyFlowCommands passes c.perMonth when the model names one).
 */
const startCount = (_p: DeliverablePreset): number => 1
// The noun for a blueprint's deliverable, so the picker's help text fits the channel
// (the picker now serves emails, pages, articles and ads — not just emails).
const blueprintNoun = (channel: ChannelId): string =>
  PAGE_CHANNELS.has(channel) ? 'page' : channel === 'email' ? 'email' : channel === 'blog' ? 'article' : channel === 'linkedin-ads' ? 'ad' : 'asset'

// The tile mark matches the asset's channel (email envelope, LinkedIn/YouTube brand marks, a
// page globe, etc.) so each deliverable reads at a glance, instead of one generic glyph for all.
// Falls back to that generic glyph when no channel is known.
const PresetTile = ({ tone, channel }: { tone: string; channel?: ChannelId }) => (
  <span className="flow-tile" style={{ background: `color-mix(in srgb, ${tone} 20%, transparent)`, color: tone }}>
    {channel ? (
      <ChannelIcon channel={channel} size={15} color={tone} />
    ) : (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="7" rx="1.6" />
        <path d="M4 16h11" />
        <path d="M19 14v5M16.5 16.5h5" />
      </svg>
    )}
  </span>
)

// Quick-start templates offered in Gretel's blank-campaign state: one high-signal deliverable per
// motion (email, content, social, web). Clicking one drops that node, so you can skip the AI and
// start by hand. Four, not six, so the blank state stays one clear hierarchy rather than three
// dense rows; "More" opens the full picker. Keys must exist in DELIVERABLE_PRESETS.
/**
 * The eight motions a deliverable can belong to, matching DELIVERABLE_PRESETS' own `group` values
 * exactly. They sit in the toolbar's "Gets made" band so the palette offers the KIND of work you
 * are adding, not one generic "Deliverable" button that hides eight very different choices behind
 * a single click. Picking one opens the deliverable picker scoped to that motion.
 */
const DELIVERABLE_GROUPS: { group: string; label: string; tone: string; icon: ReactNode }[] = [
  { group: 'Social', label: 'Social', tone: '#2f6fe0',
    icon: <><circle cx="7" cy="8" r="2.6" /><circle cx="17" cy="6" r="2.2" /><circle cx="16" cy="17" r="2.6" /><path d="M9.3 9.3l4.6 6M9.2 7.2l5.6-1" /></> },
  { group: 'Email & lifecycle', label: 'Email', tone: '#0e8f7d',
    icon: <><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="M3.6 7l8.4 6 8.4-6" /></> },
  { group: 'Content & SEO', label: 'Content', tone: '#7a52d1',
    icon: <><path d="M5 3.5h9l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20z" /><path d="M14 3.5V9h5" /><path d="M8.5 13h6M8.5 16.5h4" /></> },
  { group: 'Web', label: 'Web', tone: '#c2410c',
    icon: <><rect x="3" y="4.5" width="18" height="15" rx="2.2" /><path d="M3 9h18" /><circle cx="6.4" cy="6.8" r="0.7" /><circle cx="8.8" cy="6.8" r="0.7" /></> },
  { group: 'Paid', label: 'Paid', tone: '#c9302c',
    icon: <><path d="M3.5 9.5v5a1.5 1.5 0 0 0 1.5 1.5h2.2L14 20V4l-6.8 4H5a1.5 1.5 0 0 0-1.5 1.5z" /><path d="M17.5 9a4.5 4.5 0 0 1 0 6" /></> },
  { group: 'Video', label: 'Video', tone: '#8a34d6',
    icon: <><rect x="2.8" y="5.5" width="13" height="13" rx="2.4" /><path d="M16 11l5-3v8l-5-3z" /></> },
  { group: 'Lead magnets', label: 'Lead magnet', tone: '#b8860b',
    icon: <><path d="M5.5 4h7l5.5 5.5V20a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M12.5 4v6h5.5" /><path d="M12 12.5v5M9.5 15.5l2.5 2.5 2.5-2.5" /></> },
  { group: 'Events', label: 'Events', tone: '#0f766e',
    icon: <><rect x="3.5" y="5" width="17" height="15" rx="2.2" /><path d="M3.5 10h17M8 3.5v3M16 3.5v3" /></> },
]

const STARTER_KEYS = ['newsletter', 'blog', 'ig-reel', 'landing'] as const

/**
 * OBJECTS. One thing on the campaign board: an audience, a message, a proof point, a note. Dropped
 * from the toolbar, wired to the campaign card to count, and convertible into a SMART OBJECT (a
 * named bundle that can be assigned to a brand folder and reused across campaigns).
 *
 * ⚠️ "object" in the UI covers BOTH arrays on this board. Context objects live in `objects`
 * (CanvasObject, below) and the things that get made live in `nodes` (FlowDeliverable). A reader who
 * greps `objects` and assumes it holds the whole board will be wrong; BoardObject is the union.
 */
/**
 * A card's ROLE is what it does, and it's the axis the canvas is now organized around: an
 * 'output' becomes real work when you Build (the Brief, its Deliverables, their posts), an
 * 'input' carries the context a campaign is written from, and 'markup' is for your team to
 * read. Role drives the data-role attribute every card emits, which is what the two visual
 * languages hang off (see the role block at the foot of index.css), and it drives the Add
 * menu's grouping so the toolbar teaches the same split. `family` is the sub-grouping inside
 * the input band only.
 *
 * WHAT AN INPUT OBJECT DOES, as of the direction wiring: it names a record AND carries an
 * instruction about this campaign (see src/domain/direction.ts). The instruction reaches the copy
 * writer as a named per-asset slot for every deliverable the object is wired to. The record it
 * names still only narrows the pools via the campaign's refs, and the free-text note is never
 * sent. This comment previously forbade promising otherwise; that promise is now kept.
 */
/**
 * What an object DOES, and the value of its data-role attribute.
 *
 * This used to declare only input and markup while the DOM emitted four values, so the type did not
 * describe reality. 'brief' and 'output' are emitted from the campaign card, the deliverables and
 * the post sub-cards. ⚠️ 'output' currently matches ZERO css rules: output styling comes from the
 * tier classes and --shadow-raise, not from the role, so the attribute is a hook nothing reads yet.
 * Kept because it makes the board self-describing in the DOM, and named here so the next person
 * does not spend an afternoon looking for the rule that styles it.
 */
/**
 * The Add menu's input band, in order. Rows are derived from OBJECT_META by family rather than
 * hand-listed in the JSX, so a new kind lands in the right group by declaring its family and
 * the menu can't drift from the registry. Kinds with role 'markup' get their own band.
 * Row order WITHIN a band is OBJECT_META's declaration order, so reorder entries there to
 * reorder the menu.
 */
const INPUT_FAMILIES: { family: ObjectFamily; label: string }[] = [
  { family: 'who', label: "Who it's for" },
  { family: 'says', label: 'What it says' },
  { family: 'when', label: 'When' },
  { family: 'draws', label: 'What it draws on' },
]
const kindsInFamily = (family: ObjectFamily): CanvasObjectKind[] =>
  (Object.keys(OBJECT_META) as CanvasObjectKind[]).filter((k) => OBJECT_META[k].role === 'input' && OBJECT_META[k].family === family)
// A card's record picker builds its own placeholder from the kind's label, which used to read
// "Link a audience…" and "No companys established yet". Covers every current label (audience,
// company, person, message, proof point, voice, channel, data source, trigger).
const articleFor = (noun: string): string => (/^[aeiou]/.test(noun) ? 'an' : 'a')
const pluralOf = (noun: string): string =>
  noun === 'person' ? 'people' : noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`

/** Everything on the board: context objects plus the deliverables that get made. */
export type BoardObject = CanvasObject | FlowDeliverable


/**
 * A SMART OBJECT: a named bundle of context cards, collapsed to one card on the board. Group a
 * few with Cmd+G (or the right-click menu), double-click to open it and work on its members on
 * their own canvas, releasePlacement to spill them back out.
 *
 * The point is reuse: "the RevOps pitch" as one object holding an audience, a message and two
 * proof points, instead of four loose cards you re-make on every campaign. It stays inside one
 * campaign for now because cards are still ephemeral React state; once they persist on Campaign
 * this is what gets promoted to a brand-level library, and applying one will set several of the
 * campaign's refs at once.
 */
// Data-source cards link to an established connector (mirrors the ConnectorsPage list).
const CONNECTOR_SOURCES: { id: string; label: string }[] = [
  { id: 'google-analytics', label: 'Google Analytics' },
  { id: 'search-console', label: 'Search Console' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'resend', label: 'Resend' },
]

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
  const flowBoards = useTrafficStore((s) => s.flowBoards)
  const saveFlowBoard = useTrafficStore((s) => s.saveFlowBoard)
  const adoptBuilderBoard = useTrafficStore((s) => s.adoptBuilderBoard)
  const setCampaignDirection = useTrafficStore((s) => s.setCampaignDirection)
  const setClientAudiences = useTrafficStore((s) => s.setClientAudiences)
  const addBrandProof = useTrafficStore((s) => s.addBrandProof)
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const userPrefs = useTrafficStore((s) => s.userPrefs)
  const setCampaignSubject = useTrafficStore((s) => s.setCampaignSubject)
  const patchCampaign = useTrafficStore((s) => s.patchCampaign)
  const showToast = useTrafficStore((s) => s.showToast)
  const markOnboardingDone = useTrafficStore((s) => s.markOnboardingDone)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const allCompanies = useTrafficStore((s) => s.companies)
  const allPeople = useTrafficStore((s) => s.people)
  const channelRecords = useTrafficStore((s) => s.channelRecords)
  const allObjectives = useTrafficStore((s) => s.objectives)
  const allMessages = useTrafficStore((s) => s.messages)
  const allTriggers = useTrafficStore((s) => s.triggers)
  const allVoices = useTrafficStore((s) => s.voices)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const brandMeta = useTrafficStore((s) => s.brandMeta)
  const mediaMixes = useTrafficStore((s) => s.mediaMixes)
  const seedCampaignAssets = useTrafficStore((s) => s.seedCampaignAssets)
  const addCampaign = useTrafficStore((s) => s.addCampaign)
  const draftCopy = useTrafficStore((s) => s.draftCopy)
  const duplicateRow = useTrafficStore((s) => s.duplicateRow)
  const removeRow = useTrafficStore((s) => s.removeRow)
  const removeRows = useTrafficStore((s) => s.removeRows)
  const updateRows = useTrafficStore((s) => s.updateRows)
  const previewFlowCopy = useTrafficStore((s) => s.previewFlowCopy)
  const updateRow = useTrafficStore((s) => s.updateRow)
  const flowOpen = useTrafficStore((s) => s.flowOpen)
  const flowOpenView = useTrafficStore((s) => s.flowOpenView)
  const clearFlowOpen = useTrafficStore((s) => s.clearFlowOpen)
  const role = useTrafficStore((s) => s.role)
  const openShareDialog = useTrafficStore((s) => s.openShareDialog)
  const addBlankAsset = useTrafficStore((s) => s.addBlankAsset)
  const openReview = useTrafficStore((s) => s.openReview)
  // A single-flow share locks the recipient to that one flow: no back-to-list, no flow switching.
  const flowShareLock = useTrafficStore((s) => !!s.sharedSession?.campaign)
  // Add a blank draft asset to the open flow (from Grid/Calendar) and open it to fill in. Calendar
  // passes the clicked day so the asset lands there.
  const addFlowAsset = async (scheduledAt?: string) => {
    const id = await addBlankAsset(flowCampaign, scheduledAt ? { scheduledAt } : undefined)
    if (id) openReview(id)
  }
  const setFlowCanvasOpen = useTrafficStore((s) => s.setFlowCanvasOpen)
  const flowChats = useTrafficStore((s) => s.flowChats)
  const saveFlowChat = useTrafficStore((s) => s.saveFlowChat)
  const deleteFlowChat = useTrafficStore((s) => s.deleteFlowChat)
  const openProject = useTrafficStore((s) => s.openProject)
  const setCampaignFilter = useTrafficStore((s) => s.setCampaignFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const setBrandTab = useTrafficStore((s) => s.setBrandTab)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const updateBrandRecord = useTrafficStore((s) => s.updateBrandRecord)
  const allBrandDatasets = useTrafficStore((s) => s.brandDatasets)
  const addBrandDataset = useTrafficStore((s) => s.addBrandDataset)
  // Brand-library smart objects: the reusable bundles a card picks from.
  const smartObjects = useTrafficStore((s) => s.smartObjects)
  const addSmartObject = useTrafficStore((s) => s.addSmartObject)
  const updateSmartObject = useTrafficStore((s) => s.updateSmartObject)
  const deleteSmartObject = useTrafficStore((s) => s.deleteSmartObject)
  const promoteSmartObject = useTrafficStore((s) => s.promoteSmartObject)
  const setSmartObjectFolder = useTrafficStore((s) => s.setSmartObjectFolder)
  // Record-create actions, so a card can make the thing it needs instead of dead-ending on
  // "No audiences established yet".
  const addCompany = useTrafficStore((s) => s.addCompany)
  const addPerson = useTrafficStore((s) => s.addPerson)
  const addMessage = useTrafficStore((s) => s.addMessage)
  const addVoice = useTrafficStore((s) => s.addVoice)
  const addTrigger = useTrafficStore((s) => s.addTrigger)
  const openBrandTab = useTrafficStore((s) => s.openBrandTab)
  const openDatasetTab = useTrafficStore((s) => s.openDatasetTab)
  const openObjectTab = useTrafficStore((s) => s.openObjectTab)
  const newCampaignParent = useTrafficStore((s) => s.newCampaignParent)
  const setNewCampaignParent = useTrafficStore((s) => s.setNewCampaignParent)

  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  // The brand's data sets (the freeform spreadsheets), linkable from a Data source card on the canvas.
  const brandDatasets = useMemo(() => allBrandDatasets.filter((d) => d.brand === brand), [allBrandDatasets, brand])
  // The brand's Segments records (the Segments page IS the brand's audiences).
  const brandSegments = clientAudiences[brand] ?? []
  const audienceNames = useMemo(() => brandSegments.map((a) => a.name), [brandSegments])

  // A campaign belongs to ONE brand, so every record it can reference (messages, objectives,
  // companies, people) is scoped to the brand you're working on — never another brand's records.
  // Untagged records (no brand) stay shared across brands, matching each Records page's own scoping.
  // Channels have no brand tag (a shared taxonomy) so they are not scoped here.
  const messages = useMemo(() => allMessages.filter((m) => !m.brand || m.brand === brand), [allMessages, brand])
  const objectives = useMemo(() => allObjectives.filter((o) => !o.brand || o.brand === brand), [allObjectives, brand])
  const companies = useMemo(() => allCompanies.filter((c) => !c.brand || c.brand === brand), [allCompanies, brand])
  const people = useMemo(() => allPeople.filter((p) => !p.brand || p.brand === brand), [allPeople, brand])
  const triggers = useMemo(() => allTriggers.filter((t) => !t.brand || t.brand === brand), [allTriggers, brand])
  const voices = useMemo(() => allVoices.filter((v) => !v.brand || v.brand === brand), [allVoices, brand])

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [budget, setBudget] = useState('')
  const [flightWeeks, setFlightWeeks] = useState(12)
  // The GTM motion the chat's setStrategy locks in for this build (a GTM_STRATEGIES key). Undefined
  // = fall back to the brand/role resolution in addCampaign.
  const [strategyKey, setStrategyKey] = useState<string>()
  // A motion is chosen FOR a brand, so never let it carry across a brand switch and stamp another
  // brand's campaign (startNew clears it for a new flow; this covers switching the rail).
  useEffect(() => { setStrategyKey(undefined) }, [brand])
  // Records that seed the brief: an Objective sets the flow's measurable goal; a Message fills the
  // theme every asset is written to (its angle). Both are optional pulls from the Records pages.
  const [objectiveId, setObjectiveId] = useState('')
  const [messageId, setMessageId] = useState('')
  const linkedObjective = objectives.find((o) => o.id === objectiveId)
  /**
   * A standard objective, when the builder picked one instead of a brand record. Carried in the same
   * `objectiveId` state under a `preset:` prefix rather than as a second piece of state, so exactly
   * one objective can be chosen and buildFlow needs no second branch.
   */
  const builderPreset = objectiveId.startsWith('preset:')
    ? OBJECTIVE_PRESETS.find((p) => p.id === objectiveId.slice('preset:'.length))
    : undefined
  // The chosen objective mapped onto the campaign's goal fields — the metric becomes the KPI and,
  // for a brand record, the target's leading number becomes the goal target. A preset brings no
  // target: nobody can guess your number.
  const objectiveCfg = linkedObjective
    ? {
        text: linkedObjective.name,
        kpi: linkedObjective.metric?.trim() || undefined,
        target: linkedObjective.target ? Number(String(linkedObjective.target).replace(/[^0-9.]/g, '')) || undefined : undefined,
      }
    : builderPreset
      ? { text: builderPreset.name, kpi: builderPreset.kpi }
      : undefined
  // Build-mode record-tag selection (Companies / People / Segments / Media mix). null =
  // not touched yet, so it defaults to all of the brand's segments.
  const [briefRefs, setBriefRefs] = useState<FlowReference[] | null>(null)
  const [nodes, setNodes] = useState<FlowDeliverable[]>([])
  // Freeform palette cards (audience / message / proof point / data source / note). Ephemeral in the
  // builder for now; positioned via `pos` and connectable like any other node.
  const [objects, setObjects] = useState<CanvasObject[]>([])
  // Smart objects: bundles of the cards above. Ephemeral alongside `objects` for now.
  const [placements, setPlacements] = useState<SmartPlacement[]>([])
  // Before a campaign exists there is nothing to persist onto, so build-mode direction is held here
  // and written through to the campaign by buildFlow.
  const [builderDirection, setBuilderDirection] = useState<{ kind: string; key: string; value: string }[]>([])
  // Which smart object you're inside, if any. Non-null swaps the canvas to that object's members
  // and adds a breadcrumb segment, so editing one feels like editing a small campaign.
  const [openPlacementId, setOpenGroupId] = useState<string | null>(null)
  // Right-click menu on the canvas. There was no context menu anywhere in the app before this;
  // it exists for "group into a smart object" but is the obvious home for per-card actions.
  // `on` is the id right-clicked (a card, an object, or null for empty canvas).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; on: string | null } | null>(null)
  // Nothing selected by default: the inspector's resting state is the LAYERS list, everything on
  // the board. Opening onto the campaign brief form showed one card's fields before you had picked
  // a card, and hid the list that says what is on the canvas at all.
  const [sel, setSel] = useState<'campaign' | string | null>(null)
  const [pickAt, setPickAt] = useState<number | null>(null)
  // When the picker is opened from a motion button, it shows only that motion's presets.
  const [pickGroup, setPickGroup] = useState<string | null>(null)
  // Which palette dropdown is open. The toolbar had grown to 21 icons; a button now does the
  // common thing and its caret opens the variants, so the bar stays short.
  const [palMenu, setPalMenu] = useState<string | null>(null)
  // When the deliverable picker is opened FROM an asset card (its "+"), this holds that
  // source asset's row id. The new deliverable's rows get branchOf = that asset's name, so
  // the canvas draws a journey edge from the asset to the new deliverable (asset → next step).
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const connectFromRef = useRef<string | null>(null)
  connectFromRef.current = connectFrom
  const [building, setBuilding] = useState(false)
  // The goal card's objective picker (open state), so you can link/change the goal on the card.
  // Build always writes copy now (the toggle was removed); kept as a constant so the
  // preview + build paths that reference it stay unchanged.
  const writeCopy = true
  const [built, setBuilt] = useState<{ name: string; count: number; copy: boolean; source: CopySource | null } | null>(null)
  // Live draft copy per deliverable node, generated when it's added (and on redraft).
  // Ephemeral UI state: never seeded into rows or localStorage until you Build.
  const [preview, setPreview] = useState<Record<string, { loading: boolean; source: CopySource | null; posts: { headline: string; primary: string; components: { key: string; label: string; value: string }[] }[] }>>({})
  // How the flow-in-progress is shown: the canvas, or a grid / calendar of its assets.
  // View + Gretel-collapse live in the store so the campaign icon rail (Files / Assets / Gretel)
  // in HomeShell can drive and reflect them.
  const flowView = useTrafficStore((s) => s.flowView)
  const setFlowView = useTrafficStore((s) => s.setFlowView)
  const flowAssetsOpen = useTrafficStore((s) => s.flowAssetsOpen)
  const setFlowAssetsOpen = useTrafficStore((s) => s.setFlowAssetsOpen)
  // The Flows section opens on an all-flows landing page; picking a flow (or New flow)
  // drops into the canvas. The "Flows" breadcrumb returns here.
  // A single-flow share opens straight in the flow (no all-flows landing to flash or navigate to).
  const [flowScreen, setFlowScreen] = useState<'home' | 'canvas'>(flowShareLock ? 'canvas' : 'home')
  // Collapse the sidebar (to a rail) whenever a flow canvas is open; restore on leave/unmount.
  useEffect(() => {
    setFlowCanvasOpen(flowScreen === 'canvas')
    return () => setFlowCanvasOpen(false)
  }, [flowScreen, setFlowCanvasOpen])
  // Flow-canvas AI chat (agentic: it edits the flow from chat).
  const [chatMsgs, setChatMsgs] = useState<FlowChatMsg[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  // Start collapsed: the assistant rests as a floating launcher over the canvas and opens into a
  // card when clicked, so the canvas is clean by default.
  const chatCollapsed = useTrafficStore((s) => s.flowChatCollapsed)
  const setChatCollapsed = useTrafficStore((s) => s.setFlowChatCollapsed)
  const [briefCollapsed, setBriefCollapsed] = useState(false)
  // The campaign brief is the board's root. Deleting it hides the card (the campaign data stays);
  // "Brief" in the Add menu brings it back. On a brand-new blank campaign it's hidden too (see
  // blankCampaign) so the canvas starts empty; briefSummoned lets the toolbar force it back even
  // while blank. Reset on entering a campaign.
  const [briefHidden, setBriefHidden] = useState(false)
  const [briefSummoned, setBriefSummoned] = useState(false)
  // Gretel's empty state is the blank-campaign front door now, so there's no separate starter
  // card to hold text, dismiss, or drag.
  // Search box on the Assets brand-library view.
  const [librarySearch, setLibrarySearch] = useState('')
  // Assets is organized by brand folders. Which brand folders are expanded (the active brand starts
  // open), and the inline "New brand" folder-creation input.
  const [openBrandFolders, setOpenBrandFolders] = useState<Set<string>>(() => new Set())
  const [addingBrand, setAddingBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  // The active brand's folder starts expanded (the user can still collapse it).
  useEffect(() => {
    if (brand) setOpenBrandFolders((prev) => (prev.has(brand) ? prev : new Set([...prev, brand])))
  }, [brand])
  // Refs so the Cmd+. shortcut reads the panels' current state without re-binding the listener.
  const chatCollapsedRef = useRef(chatCollapsed)
  chatCollapsedRef.current = chatCollapsed
  const briefCollapsedRef = useRef(briefCollapsed)
  briefCollapsedRef.current = briefCollapsed
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
  // Measured height of each deliverable's expanded variant tree, so the deliverable reserves
  // enough vertical room and neighbouring flows don't overlap it.
  const [varTreeH, setVarTreeH] = useState<Record<string, number>>({})
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
  // The Add dropdown and its click-outside handler are gone: the palette is a row of icons in
  // the toolbar now, so there is no menu to open or dismiss.
  const [tool, setTool] = useState<'select' | 'pan' | 'connect'>('select')
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
  // ids = nodes whose OWN pos we move; visualIds = every node that visually shifts by the drag
  // delta (the moved nodes plus any children carried along inside a moved parent's transform), so
  // connectors track them all. Splitting the two is what stops nested children double-moving.
  const dragging = useRef<{ ids: string[]; visualIds: string[]; x: number; y: number; start: Record<string, { x: number; y: number }> } | null>(null)
  // Live drag delta for the nodes currently being dragged, in canvas units. Connectors read this
  // so their endpoints move in the SAME commit as the cards (see connRect) — instead of waiting on
  // a per-frame rect remeasure, which rubber-bands the lines behind the cards on a big flow.
  const [dragDelta, setDragDelta] = useState<{ ids: string[]; dx: number; dy: number } | null>(null)
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
    const z1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target))
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
  /**
   * Zoom and pan so the whole board fits. The thing you actually want when you reach for the zoom
   * control: a campaign's height depends on how many assets its deliverables carry, so the right
   * zoom is a different number on every board and picking a preset is guesswork.
   *
   * Measured from the live DOM rather than from `rects`, for the same reason freeSlot is: rects is
   * written by a layout effect, so straight after adding a card it can still be a commit behind.
   */
  const fitToContent = () => {
    const cv = canvasRef.current
    const stack = cv?.querySelector('.flow-stack')
    if (!cv || !stack) return
    const sRect = stack.getBoundingClientRect()
    const s0 = zoomRef.current / 100
    const o0 = offsetRef.current
    const nodes = [...cv.querySelectorAll('.flow-node[data-node-id]')]
    if (!nodes.length) return
    // Unscaled stack coordinates: the stack's own rect already carries the current offset and scale.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of nodes) {
      const r = el.getBoundingClientRect()
      const x = (r.left - sRect.left) / s0
      const y = (r.top - sRect.top) / s0
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + r.width / s0)
      maxY = Math.max(maxY, y + r.height / s0)
    }
    const pad = 40
    const cw = cv.clientWidth - pad * 2
    const ch = cv.clientHeight - pad * 2
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    // Never zoom IN past 100% to fill the space: a two-card board blown up to 200% is not "fit".
    const z = Math.min(100, Math.max(MIN_ZOOM, Math.floor(Math.min(cw / w, ch / h) * 100)))
    const s1 = z / 100
    zoomRef.current = z
    // The translate is relative to the stack's STATIC position inside the canvas, which is not the
    // canvas origin (the stack is inset). Centring without subtracting that inset put the board a
    // sixth of the viewport off to one side.
    const cRect = cv.getBoundingClientRect()
    const originX = sRect.left - cRect.left - o0.x
    const originY = sRect.top - cRect.top - o0.y
    const no = {
      x: pad + (cw - w * s1) / 2 - minX * s1 - originX,
      y: pad + (ch - h * s1) / 2 - minY * s1 - originY,
    }
    offsetRef.current = no
    setZoom(z)
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
  // The card an in-progress connection is currently over. Drawing a line used to give no feedback
  // about WHERE it would land, so you released and hoped. The target lights up instead.
  const [connectOver, setConnectOver] = useState<string | null>(null)
  // The smart object currently being dragged out of the Assets panel, so the canvas can show it is
  // a live drop target. A custom mime type rather than text/plain: the board already accepts a
  // campaign NAME as text/plain on the campaigns page, and a stray text drop must not place an object.
  const [dragObjectId, setDragObjectId] = useState<string | null>(null)
  // The folder head currently under a dragged object ('__unfiled__' for the loose group).
  const [objDropFolder, setObjDropFolder] = useState<string | null>(null)
  // Right-click menu on a shelf row: which object, and where to draw it.
  const [shelfMenu, setShelfMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  // The folder-name input, open for one object at a time.
  const [namingFolderFor, setNamingFolderFor] = useState<string | null>(null)
  const [newObjFolder, setNewObjFolder] = useState('')
  // The smart object whose delete button is armed (click-again-to-confirm). Id, not a boolean, so
  // selecting a different object disarms it rather than leaving a live delete under the cursor.
  const [confirmDeleteObject, setConfirmDeleteObject] = useState<string | null>(null)
  // Selecting anything else disarms it too, so coming back to a card never finds a live delete
  // waiting from minutes ago.
  useEffect(() => {
    setConfirmDeleteObject(null)
  }, [sel])
  const drawingFrom = useRef<string | null>(null)
  const [rects, setRects] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({})
  // Branch keys whose auto-placement has settled — locked so a later hand drag is respected.
  const placedRef = useRef<Set<string>>(new Set())
  // Undo / redo timeline for the canvas (Cmd+Z / Cmd+Shift+Z). Each entry snapshots the card
  // layout, plus the flow rows for data actions, so moves, Tidy, add, and Generate all reverse.
  type HistEntry = { pos: Record<string, { x: number; y: number }>; rows: TrafficRow[] | null }
  const undoStackRef = useRef<HistEntry[]>([])
  const redoStackRef = useRef<HistEntry[]>([])
  const dragSnapRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const dragMovedRef = useRef(false)
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
    // Shift/Cmd-click is a multi-select toggle (handled on click) — don't reset the selection or
    // start a drag on that gesture.
    if (e.shiftKey || e.metaKey || e.ctrlKey) return
    const selIds = selected.has(id) && selected.size ? [...selected] : [id]
    if (!selected.has(id)) setSelected(new Set(selIds))
    const selSet = new Set(selIds)
    // Move only nodes whose parent isn't ALSO in the drag — a child inside a moving parent's
    // transform is carried along, so moving its own pos too would double it.
    const moveIds = selIds.filter((i) => { const p = nodeParent.get(i); return !(p && selSet.has(p)) })
    const moveSet = new Set(moveIds)
    // Connectors, though, must track every node that visually shifts: the moved nodes plus the
    // children carried inside them (whether or not those children were selected).
    const carried: string[] = []
    for (const [child, parent] of nodeParent) if (moveSet.has(parent) && !moveSet.has(child)) carried.push(child)
    const start: Record<string, { x: number; y: number }> = {}
    moveIds.forEach((i) => {
      start[i] = pos[i] ?? { x: 0, y: 0 }
    })
    dragging.current = { ids: moveIds, visualIds: [...moveIds, ...carried], x: e.clientX, y: e.clientY, start }
    dragSnapRef.current = { ...pos } // layout before this drag, committed to undo history on drop
    dragMovedRef.current = false
  }
  // Click a card to select it; Shift/Cmd-click toggles it into a multi-selection (for group drag /
  // bulk moves). The first modifier-click folds in whatever was already singly selected.
  const clickSelect = (e: ReactMouseEvent, id: string) => {
    e.stopPropagation()
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (!next.size && typeof sel === 'string') next.add(sel)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setSel(id)
      return
    }
    setSel(id)
    setPickAt(null)
    // Selecting a card reveals its properties — open the inspector if it was collapsed (it starts
    // collapsed on a blank new campaign).
    setBriefCollapsed(false)
  }
  const posRef = useRef(pos)
  posRef.current = pos
  const snapRows = () => useTrafficStore.getState().rows.map((r) => ({ ...r }))
  // Record the state BEFORE an action so it can be undone. captureRows for data actions.
  const recordHistory = (captureRows: boolean) => {
    undoStackRef.current.push({ pos: { ...posRef.current }, rows: captureRows ? snapRows() : null })
    if (undoStackRef.current.length > 40) undoStackRef.current.shift()
    redoStackRef.current = []
  }
  const restoreSnap = async (entry: HistEntry) => {
    placedRef.current = new Set(Object.keys(entry.pos)) // keep restored branches put, don't re-place
    setPos(entry.pos)
    if (entry.rows) await useTrafficStore.getState().applyRowsSnapshot(entry.rows)
  }
  const doUndo = async () => {
    const entry = undoStackRef.current.pop()
    if (!entry) return
    redoStackRef.current.push({ pos: { ...posRef.current }, rows: entry.rows ? snapRows() : null })
    await restoreSnap(entry)
  }
  const doRedo = async () => {
    const entry = redoStackRef.current.pop()
    if (!entry) return
    undoStackRef.current.push({ pos: { ...posRef.current }, rows: entry.rows ? snapRows() : null })
    await restoreSnap(entry)
  }
  // "Tidy layout": drop every manual offset so the column and the auto-placed branches re-derive
  // into a clean arrangement. Cards animate back into place via the card transition.
  const organizeCards = () => {
    recordHistory(false)
    placedRef.current = new Set()
    setPos({})
    setSelected(new Set())
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
      // SELECT belongs here as much as INPUT does. A native select uses letter keys for type-ahead,
      // so pressing "b" in the inspector's audience or smart-object dropdown to jump to an option
      // also fired the canvas 'b' shortcut: preventDefault swallowed the type-ahead, the inspector
      // closed and the deliverable picker opened. Backspace in the same dropdown deleted the
      // selected card. `closest` rather than a tagName test, so a control's inner element counts too.
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
      // A dialog or drawer renders OUTSIDE the page router, layered over a still-mounted canvas, so
      // its keystrokes reach this listener: Backspace with a card selected silently deleted that
      // card behind the open dialog.
      if (t?.closest('[role="dialog"], .drawer, .confirm-modal')) return
      // Delete / Backspace removes the selected card(s) — deliverable or freeform note. The campaign
      // brief is the board's root, so it's never deleted this way.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selectedRef.current.size ? [...selectedRef.current] : selRef.current ? [selRef.current] : []
        if (ids.length) {
          e.preventDefault()
          // Row deletions are async and go through the sheet, so they are collected across the
          // whole selection and sent as ONE action: selecting a deliverable and two loose posts is
          // a single undo entry, not three.
          const rowIds = new Set<string>()
          ids.forEach((id) => {
            if (id === 'campaign') setBriefHidden(true)
            // Delete on a smart object UNGROUPS it rather than destroying it. One keystroke
            // silently taking three or four cards with it is too sharp an edge; the card's ✕ does
            // the same thing, and the right-click menu has an explicit "delete object and its
            // cards" for when that's what you mean.
            else if (placementsRef.current.some((g) => g.id === id)) releaseRef.current(id)
            else if (objectsRef.current.some((nt) => nt.id === id)) deleteObject(id)
            else if (nodesRef.current.some((n) => n.id === id)) removeNode(id)
            // A BUILT deliverable is not a node: it is derived from its rows, keyed by
            // channel|type. So deleting it means deleting the posts under it (variants included) —
            // there is nothing else to delete. Until this branch existed, Delete on a built
            // deliverable silently did nothing at all.
            else {
              const deliv = viewDelivsRef.current.find((d) => d.key === id)
              if (deliv) deliv.rows.forEach((r) => rowIds.add(r.id))
              else if (viewRowsRef.current.some((r) => r.id === id)) rowIds.add(id)
            }
          })
          if (rowIds.size) void removeRows([...rowIds])
          setSel(null)
          setSelected(new Set())
        }
        return
      }
      // Cmd/Ctrl+Z undoes the last canvas action (move, Tidy, add, Generate); +Shift redoes.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) void doRedo()
        else void doUndo()
        return
      }
      if (e.key === ' ') {
        // Space is hold-to-pan, but it is also how a keyboard user activates a focused button, and
        // this preventDefault was unconditional: tabbing to any button on the canvas and pressing
        // Space panned instead of pressing it.
        if (t?.closest('button, a[href], [role="button"]')) return
        e.preventDefault()
        if (!spaceHeld.current) {
          spaceHeld.current = true
          setSpaceCursor(true)
        }
        return
      }
      // Cmd/Ctrl+G bundles the selected cards into a smart object (the universal "group" chord).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        convertSelectionRef.current()
        return
      }
      // Escape steps out of a smart object you're inside.
      if (e.key === 'Escape' && openPlacementRef.current) {
        e.preventDefault()
        setOpenGroupId(null)
        return
      }
      if (e.key.toLowerCase() === 'b' && viewName === null) {
        e.preventDefault()
        setPickGroup(null)
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
  // Direction, held in a ref for the same reason as subject/flight/audience: the debounced redraft
  // runs from a timer callback and must read the LATEST value, not a stale closure.
  const directionRef = useRef<{ kind: string; key: string; value: string }[]>([])
  const proofRef = useRef(proofRefLabels)
  proofRef.current = proofRefLabels
  const writeCopyRef = useRef(writeCopy)
  writeCopyRef.current = writeCopy
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  // Fresh refs for the Delete/Backspace shortcut, whose keydown listener is bound less often than
  // these change.
  const objectsRef = useRef(objects)
  objectsRef.current = objects
  const selRef = useRef(sel)
  selRef.current = sel
  const selectedRef = useRef(selected)
  selectedRef.current = selected
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
        direction: directionRef.current,
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
  /**
   * Move a deliverable's asset count by `delta`, one asset per step. Any magnitude, so the typed
   * count can ask for eleven more at once; it was ±1 only, which is why the stepper was the only way
   * to set a count and getting from 4 to 16 meant twelve clicks.
   *
   * Copy is drafted ONCE for everything added rather than per asset: a model call each would have
   * made a typed jump twelve round-trips.
   */
  const MAX_DELIV_STEP = 60
  /**
   * The typed asset count while it is being typed. Held separately from the real count so a
   * half-typed "1" on the way to "16" does not delete fifteen assets on each keystroke: nothing
   * happens until blur or Enter.
   */
  const [delivCountDraft, setDelivCountDraft] = useState<string | null>(null)
  const changeDelivCount = async (
    deliv: { key: string; rows: TrafficRow[] },
    delta: number,
    opts?: { draftNew?: boolean },
  ): Promise<string[]> => {
    if (countBusy || !deliv.rows.length || !delta) return deliv.rows.map((r) => r.id)
    setCountBusy(true)
    const added: string[] = []
    try {
      let ordered = [...deliv.rows].sort((a, b) => Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || ''))
      const steps = Math.min(Math.abs(delta), MAX_DELIV_STEP)
      for (let i = 0; i < steps; i++) {
        const last = ordered[ordered.length - 1]
        if (!last) break
        if (delta > 0) {
          const before = new Set(useTrafficStore.getState().rows.map((r) => r.id))
          await duplicateRow(last.id)
          const fresh = useTrafficStore.getState().rows.find((r) => !before.has(r.id))
          if (!fresh) break
          // A genuinely new asset: clear the cloned copy so it drafts anew, and push its slot one
          // week past the last so it doesn't stack on the same date.
          const next = new Date(last.scheduledAt ? Date.parse(last.scheduledAt) : Date.now())
          next.setDate(next.getDate() + 7)
          const scheduledAt = next.toISOString()
          await updateRow(fresh.id, { messaging: {}, scheduledAt })
          added.push(fresh.id)
          ordered = [...ordered, { ...fresh, scheduledAt }]
        } else {
          // Never below one: a deliverable with no assets is not a deliverable.
          if (ordered.length <= 1) break
          await removeRow(last.id)
          ordered = ordered.slice(0, -1)
        }
      }
      // Skipped when the caller is about to regenerate the whole deliverable: drafting a clone and
      // then immediately rewriting it is two model calls for one asset.
      if (added.length && opts?.draftNew !== false) await draftCopy(added)
      return ordered.map((r) => r.id)
    } finally {
      setCountBusy(false)
      // Keep this deliverable selected so the inspector stays open on it after the refresh.
      setSel(deliv.key)
    }
  }
  /**
   * Apply a typed asset count, then rewrite the deliverable's copy.
   *
   * Two things the steppers do not do. The count is STAGED until Apply, so typing "1" on the way to
   * "16" cannot delete fifteen assets one keystroke at a time. And applying REGENERATES, so the
   * result reads as one deliberate run of sixteen rather than four originals plus twelve clones of
   * the last one.
   */
  const applyDelivCount = async (deliv: ViewDeliverable) => {
    const raw = delivCountDraft
    if (raw === null) return
    const want = Math.round(Number(raw))
    setDelivCountDraft(null)
    // A blank or nonsense entry reverts rather than clamping to 1 and deleting the lot.
    if (!Number.isFinite(want) || want < 1) return
    const target = Math.min(want, MAX_DELIV_STEP)
    if (target === deliv.count) return
    const ids = await changeDelivCount(deliv, target - deliv.count, { draftNew: false })
    if (ids.length) await regenerateFlow(ids)
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
    // Ordered by WHEN the deliverable's first asset goes out, not by how many assets it has.
    //
    // Sorting on count meant the column reordered every time you changed one: take a deliverable from
    // 3 assets to 5 and it leapt over its neighbours mid-click, which is the jump that survived
    // top-anchoring the card. Count is also arbitrary as an order — a board reads top to bottom, so
    // chronological is the one that means something, and it does not move when a count changes.
    return [...map.values()].sort((a, b) => {
      const at = Math.min(...a.rows.map((r) => Date.parse(r.scheduledAt || '') || Infinity))
      const bt = Math.min(...b.rows.map((r) => Date.parse(r.scheduledAt || '') || Infinity))
      if (at !== bt) return at - bt
      return a.label.localeCompare(b.label)
    })
  }, [viewRows])
  // Read by the Delete handler, which is declared above this but only ever RUNS on a keystroke,
  // long after render has assigned these. Same pattern as releaseRef.
  const viewDelivsRef = useRef(viewDelivs)
  viewDelivsRef.current = viewDelivs
  const viewRowsRef = useRef(viewRows)
  viewRowsRef.current = viewRows
  // Auto-place each branched deliverable just to the RIGHT of the asset it hangs off (several
  // branches off one asset stack down its right side), so a journey reads left→right with a short
  // connector instead of dropping to the bottom of the column. Corrects toward the target across
  // frames using freshly measured rects, then LOCKS the deliverable once it settles (recorded in
  // placedRef) so a hand drag afterwards is respected. Tidy clears placedRef to re-run it.
  useEffect(() => { placedRef.current = new Set() }, [viewName])
  useLayoutEffect(() => {
    if (viewName === null) return
    const scale = zoom / 100
    const gap = 130 * scale // canvas-space gap to the right of the source asset
    const bySource = new Map<string, ViewDeliverable[]>()
    for (const d of viewDelivs) {
      const src = d.rows.find((r) => r.branchOf)?.branchOf
      if (!src) continue
      const list = bySource.get(src)
      if (list) list.push(d)
      else bySource.set(src, [d])
    }
    const deltas: Record<string, { dx: number; dy: number }> = {}
    for (const [src, list] of bySource) {
      const srcRow = viewRows.find((r) => r.assetName === src)
      if (!srcRow) continue
      const sr = rects[srcRow.id]
      if (!sr) continue
      let offset = 0 // canvas-space vertical offset accumulated down the stack
      for (const d of list) {
        if (!placedRef.current.has(d.key)) {
          const dr = rects[d.key]
          if (dr) {
            const dxScreen = sr.x + sr.w + gap - dr.x
            const dyScreen = sr.y + offset * scale - dr.y
            // Settled: lock it and stop correcting (so a later hand drag sticks). Else nudge it
            // toward the target; measuring fresh rects each pass keeps this stable.
            if (Math.abs(dxScreen) < 2 && Math.abs(dyScreen) < 2) placedRef.current.add(d.key)
            else deltas[d.key] = { dx: dxScreen / scale, dy: dyScreen / scale }
          }
        }
        offset += Math.max(1, d.rows.length) * 168 + 56 // this branch's block height + a gap
      }
    }
    if (Object.keys(deltas).length) {
      setPos((prev) => {
        const next = { ...prev }
        for (const [k, dd] of Object.entries(deltas)) {
          const cur = prev[k] ?? { x: 0, y: 0 }
          next[k] = { x: cur.x + dd.dx, y: cur.y + dd.dy }
        }
        return next
      })
    }
  }, [rects, viewDelivs, viewRows, viewName, zoom])
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
  // NOTE: a red/amber/green campaign-readiness heuristic (assets, channel spread, paid coverage,
  // budget vs goal type) used to live here as `goalRead`, feeding the goal card just removed. It is
  // worth having again inside src/domain/campaignReview.ts when the review panel is built, rather
  // than re-invented; this commit in git history has the original.
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
      { type: 'segment' as FlowRefType, label: 'Audiences', items: brandSegments.map((a) => ({ id: a.id, label: a.name })) },
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
  /**
   * ATTACHING A CARD TO THE CAMPAIGN.
   *
   * The campaign card is the hub: connecting a context card to it is how that card joins the
   * campaign. That is what a connector is FOR. Until now edges were pure SVG, drawn and read only
   * to paint a path, so the canvas was a picture of the campaign rather than the campaign.
   *
   * Direction carries the meaning. Inputs flow INTO the campaign (they feed it); the campaign
   * flows OUT to deliverables (it produces them). A backwards edge is refused rather than
   * silently doing nothing.
   *
   * An unconnected card is a draft thought: on the board, not yet part of the campaign. That is
   * what makes it safe to leave loose cards lying around.
   *
   * Only the kinds with a FlowRefType can attach, because a ref is what the rest of the app reads.
   * Of these, segment and proof are the two that actually reach the copy writer today.
   */
  // Moved to the domain: the store needs the same map to propagate a smart-object edit.
  const REF_TYPE_FOR_KIND = REF_TYPE_FOR_OBJECT_KIND
  /** The ref a card would contribute, or null if it carries nothing the campaign can hold. */
  const refForObject = (nt: CanvasObject): FlowReference | null => {
    const type = REF_TYPE_FOR_KIND[nt.kind]
    if (!type || !nt.refId) return null
    const opts = objectOptions(nt.kind)
    const label = opts?.find((o) => o.id === nt.refId)?.label
    return label ? { type, id: nt.refId, label } : null
  }
  /** Every ref behind a node id: a card contributes its own, a smart object contributes all of its members'. */
  const refsBehind = (nodeId: string): FlowReference[] => {
    const g = placements.find((x) => x.id === nodeId)
    // The library object is the source of truth for what is inside; the placed cards are a view.
    if (g) return smartObjectFor(g)?.refs ?? []
    const nt = objects.find((n) => n.id === nodeId)
    if (!nt) return []
    // A card linking an OBJECT contributes everything inside it, which is the point of objects:
    // attach one card, and the contact plus their proof and message all reach the campaign.
    if (nt.smartObjectId) return smartObjects.find((o) => o.id === nt.smartObjectId)?.refs ?? []
    return [refForObject(nt)].filter((r): r is FlowReference => !!r)
  }
  /**
   * Connecting a card to the campaign tags its records on the campaign.
   *
   * The default-set trap: briefRefsEffective falls back to defaultBriefRefs, which is EVERY brand
   * segment. So on an untouched campaign hasRef already matches any audience you attach and the
   * add would no-op while the UI claimed otherwise. The first explicit segment attach therefore
   * REPLACES that implicit default rather than adding to it.
   */
  const attachToCampaign = (nodeId: string) => {
    const refs = refsBehind(nodeId)
    if (!refs.length) return
    const explicit = viewName !== null ? flowRefs : briefRefs
    const firstSegment = refs.some((r) => r.type === 'segment') && explicit === null
    const base = firstSegment ? [] : (explicit ?? [])
    const next = [...base]
    for (const r of refs) if (!next.some((x) => x.type === r.type && x.id === r.id)) next.push(r)
    if (viewName !== null) {
      setCampaignReferences(viewName, next)
      setRefsDirty(true)
    } else {
      commitBriefRefs(next)
    }
  }
  /** Detaching drops the card's refs, unless another attached card still contributes the same one. */
  const detachFromCampaign = (nodeId: string, edges: { from: string; to: string }[]) => {
    const mine = refsBehind(nodeId)
    if (!mine.length) return
    const stillAttached = edges
      .filter((e) => e.to === 'campaign' && e.from !== nodeId)
      .flatMap((e) => refsBehind(e.from))
    const drop = mine.filter((r) => !stillAttached.some((x) => x.type === r.type && x.id === r.id))
    if (!drop.length) return
    const base = (viewName !== null ? flowRefs : briefRefsEffective).filter(
      (r) => !drop.some((d) => d.type === r.type && d.id === r.id),
    )
    if (viewName !== null) {
      setCampaignReferences(viewName, base)
      setRefsDirty(true)
    } else {
      commitBriefRefs(base)
    }
  }
  /** Is this a context card or a smart object, i.e. something that can INFORM an output? */
  const isContextNode = (id: string) => objects.some((n) => n.id === id) || placements.some((p) => p.id === id)
  /**
   * The assets behind a connector target: every asset of a deliverable, or the one asset of a post.
   * Empty for the campaign, which is handled by attachToCampaign instead.
   */
  const rowsForTarget = (target: string): TrafficRow[] => {
    const d = viewDelivs.find((x) => x.key === target)
    if (d) return d.rows
    const r = viewRows.find((x) => x.id === target)
    return r ? [r] : []
  }
  /**
   * Wire an object straight to a deliverable or a post: its records go onto those assets, so they
   * reach the writer for exactly those and nothing else.
   *
   * MATERIALIZES onto the rows, the same way attachToCampaign writes campaign references. The
   * alternative was resolving the board's edges at draft time, which would have meant the copy path
   * learning about connectors; this keeps one rule — a ref reaches the writer because it is ON the
   * asset — and it means the override the inspector already showed is the same mechanism.
   */
  const attachToTarget = (nodeId: string, target: string) => {
    const refs = refsBehind(nodeId)
    const rows = rowsForTarget(target)
    if (!refs.length || !rows.length) return
    // Start from whatever those assets already write to: their own override if they have one, else
    // the campaign's, so wiring an object ADDS context rather than replacing the campaign's.
    const base = rows.find((r) => r.references && r.references.length)?.references ?? flowRefs
    const next = [...base]
    for (const r of refs) if (!next.some((x) => x.type === r.type && x.id === r.id)) next.push(r)
    void updateRows(rows.map((r) => ({ id: r.id, patch: { references: next } })))
    setRefsDirty(true)
  }
  /** The counterpart: drop this object's records from those assets, unless another wired card gives them. */
  const detachFromTarget = (nodeId: string, target: string, edges: { from: string; to: string }[]) => {
    const mine = refsBehind(nodeId)
    const rows = rowsForTarget(target)
    if (!mine.length || !rows.length) return
    const stillWired = edges
      .filter((e) => e.to === target && e.from !== nodeId)
      .flatMap((e) => refsBehind(e.from))
    const drop = mine.filter((r) => !stillWired.some((x) => x.type === r.type && x.id === r.id))
    if (!drop.length) return
    const base = (rows.find((r) => r.references && r.references.length)?.references ?? flowRefs).filter(
      (r) => !drop.some((d) => d.type === r.type && d.id === r.id),
    )
    void updateRows(rows.map((r) => ({ id: r.id, patch: { references: base } })))
    setRefsDirty(true)
  }
  /** Is this node attached to the campaign right now? Drives the card's "in the campaign" look. */
  /**
   * Attached means "wired to the campaign hub", so it is only meaningful while the hub is on the
   * board. Hiding the brief used to leave the edges behind: every card attached beforehand kept its
   * full-strength styling while everything added after had nothing to attach to, so brightness
   * silently came to mean "you made this before you deleted the brief".
   *
   * Gated rather than stripped, deliberately. Deleting the edges would lose state that re-summoning
   * the brief cannot bring back; this way the board goes uniformly quiet and comes back exactly as
   * it was.
   */
  const isAttached = (nodeId: string) => hasHub && connectors.some((e) => e.from === nodeId && e.to === 'campaign')

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
  /**
   * Raw record rows with a swap dropdown and a remove. The heading is REQUIRED: this used to default
   * to "Linked records", which named the wrong unit on every card that showed it. The only caller
   * left is the campaign's "linked directly" group, where a record genuinely has no card behind it.
   */
  const renderRecordTags = (ops: TagOps, heading: string) => (
    <>
      <div className="flow-inspect-label" style={{ marginTop: 16 }}>
        {heading}
        <InfoTip term="linkedRecords" />
      </div>
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
          <span className="flow-aud-btn-txt flow-tagrow-add-txt">Pin one directly</span>
        </button>
      </div>
    </>
  )
  /**
   * WHAT INFORMS THE MESSAGING: the cards wired to the campaign card, in place of a flat list of
   * records.
   *
   * The record list was the wrong unit here. Connecting a card to the campaign is HOW a record gets
   * onto the campaign, so the list was a readout of a consequence: "Sebastian Elghanian" told you a
   * contact was linked but not that it arrived inside "the RevOps buyer" object, nor which card to
   * open to change it. Rows here name the object and say what it contributes, and clicking one
   * selects that card on the canvas.
   *
   * The second group is the honest part. A record can reach the campaign with no card behind it: an
   * untouched campaign defaults to every brand segment, the picker adds refs directly, and so does
   * the chat. Showing only connected cards would have left those invisible and unremovable while
   * they still steered every draft, so they keep the old swap-and-remove rows under their own head.
   */
  /**
   * The rows behind "Informing the messaging": one per card wired to `target`.
   *
   * `target` is 'campaign' for the brief, a deliverable key, or a post's row id. Wiring an object
   * straight to a deliverable was already drawable and already stored — the edge simply did nothing,
   * because only edges to 'campaign' were acted on.
   */
  const contextRowsFor = (target: string) => {
    return connectors
      .filter((e) => e.to === target)
      .map((e) => {
        const g = placements.find((p) => p.id === e.from)
        if (g) {
          const so = smartObjectFor(g)
          return {
            id: g.id,
            tone: '#8a34d6',
            icon: (
              <><path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" /></>
            ),
            kindLabel: 'Smart object',
            label: placementName(g),
            detail: so ? describeSmartObject(so) : 'Empty',
            refs: refsBehind(g.id),
          }
        }
        const nt = objects.find((n) => n.id === e.from)
        if (!nt) return null
        const meta = OBJECT_META[nt.kind]
        const linked = smartObjects.find((o) => o.id === nt.smartObjectId)
        const own = refForObject(nt)
        return {
          id: nt.id,
          tone: meta.tone,
          icon: meta.icon,
          kindLabel: meta.label,
          label: linked?.name ?? own?.label ?? nt.text.trim().split('\n')[0] ?? '',
          detail: linked ? describeSmartObject(linked) : '',
          refs: refsBehind(nt.id),
        }
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
  }
  const renderCampaignContext = () => {
    const rows = contextRowsFor('campaign')
    const covered = new Set(rows.flatMap((r) => r.refs).map(refKey))
    const direct = activeRefs.filter((r) => !covered.has(refKey(r)))

    return (
      <>
        <div className="flow-inspect-label" style={{ marginTop: 16 }}>
          Informing the messaging{rows.length ? ` · ${rows.length}` : ''}
          <InfoTip term="linkedRecords" />
        </div>
        {rows.length === 0 ? (
          <div className="flow-inspect-note" style={{ margin: '2px 0 0' }}>
            Nothing connected yet. Draw a line from a card to the campaign and what it holds reaches
            the writer.
          </div>
        ) : (
          <div className="flow-ctxlist">
            {rows.map((r) => (
              <div key={r.id} className={`flow-ctxrow${sel === r.id ? ' sel' : ''}`}>
                <button
                  className="flow-ctxrow-open"
                  title={`Select this ${r.kindLabel.toLowerCase()} on the canvas`}
                  onClick={() => { setSel(r.id); setSelected(new Set()) }}
                >
                  <span className="flow-ctxrow-ic" style={{ color: r.tone }} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{r.icon}</svg>
                  </span>
                  <span className="flow-ctxrow-txt">
                    <span className="flow-ctxrow-kind" style={{ color: r.tone }}>{r.kindLabel}</span>
                    <span className="flow-ctxrow-name">{r.label || <em>Nothing picked yet</em>}</span>
                    {/* What it actually contributes, because a card can be connected and still be
                        empty, and an empty card reaching the writer is worth seeing. Suppressed when
                        it would only repeat the name, which is the common case for a plain card
                        carrying one record. */}
                    {(() => {
                      const sub =
                        r.refs.length === 0
                          ? 'Contributes nothing yet'
                          : r.detail ||
                            (r.refs.length === 1 && r.refs[0].label === r.label
                              ? ''
                              : r.refs.map((x) => x.label).join(' · '))
                      return sub ? <span className="flow-ctxrow-sub">{sub}</span> : null
                    })()}
                  </span>
                </button>
                {/* Disconnects: the card stays on the board, it just stops feeding the campaign. */}
                <button
                  className="flow-ctxrow-del"
                  title="Disconnect from the campaign (the card stays on the board)"
                  aria-label={`Disconnect ${r.label || r.kindLabel}`}
                  onClick={() => {
                    setConnectors((c) => c.filter((x) => !(x.from === r.id && x.to === 'campaign')))
                    detachFromCampaign(r.id, connectors)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {direct.length > 0 && renderRecordTags({ ...campaignTagOps, refs: direct }, 'Linked directly, with no card on the board')}
      </>
    )
  }
  // The "Add a record" drawer edits whatever opened it: the campaign, or a deliverable's
  // override. Resolve the deliverable fresh each render so it stays reactive after edits.
  const pickerTargetDeliv = pickerDeliv ? viewDelivs.find((d) => d.key === pickerDeliv) : undefined
  const pickerOps: TagOps = pickerTargetDeliv ? delivTagOps(pickerTargetDeliv) : campaignTagOps
  // Regenerate the flow's asset copy so it reflects the newly referenced records.
  // draftCopy only fills EMPTY fields and de-duplicates what it writes, so clear each
  // post's copy first: that forces a real rewrite and lets the anti-repetition pass keep
  // every post distinct, unlike the template redraft that collapses same-audience posts.
  const regenerateFlow = async (ids?: string[]) => {
    if (!viewName || regenerating) return
    const targetIds = ids && ids.length ? ids : viewRows.map((r) => r.id)
    if (!targetIds.length) return
    recordHistory(true)
    setRegenerating(true)
    try {
      await Promise.all(targetIds.map((id) => updateRow(id, { messaging: {} })))
      await draftCopy(targetIds)
    } finally {
      setRegenerating(false)
      setRefsDirty(false)
    }
  }
  // The asset ids the Generate button acts on, from the current selection: the campaign card means
  // the whole flow, a deliverable means its assets, an asset means just itself. Empty when nothing
  // is selected, which disables the button.
  const genIds = useMemo(() => {
    if (viewName === null) return [] as string[]
    const collect = (id: string): string[] => {
      if (id === 'campaign') return viewRows.map((r) => r.id)
      const deliv = viewDelivs.find((d) => d.key === id)
      if (deliv) return deliv.rows.map((r) => r.id)
      const row = viewRows.find((r) => r.id === id)
      return row ? [row.id] : []
    }
    if (selected.size) return [...new Set([...selected].flatMap(collect))]
    if (typeof sel === 'string') return collect(sel)
    return []
  }, [viewName, sel, selected, viewRows, viewDelivs])
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
    // it isn't fully assigned across the paid groups yet.
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
    setBriefCollapsed(false)
    void genPreview(node)
  }
  // Drop a freeform card from the toolbar. Cascades to the right of the campaign column so repeated
  // adds don't stack exactly on top of each other; the user drags it wherever from there.
  /**
   * Where a newly added card lands. It used to cascade from a FIXED point (300, 120) by
   * `objects.length` * a 28x34 step, which failed three ways: the step is far smaller than a 236px
   * card so every card buried the last one, the anchor ignored pan and zoom so cards could land
   * off-screen or on top of the brief, and indexing by `objects.length` meant deleting cards reset
   * the cascade and dropped the next one back on an existing pile.
   *
   * Instead: scan the VISIBLE canvas on a grid and take the first slot that overlaps nothing.
   * `rects` is measured in canvas-local screen pixels, which is also what pendingPlace expects,
   * so this works at any pan or zoom without converting anything by hand.
   */
  const freeSlot = (): { x: number; y: number } => {
    const cv = canvasRef.current
    const cw = cv?.clientWidth ?? 900
    const ch = cv?.clientHeight ?? 600
    const s = zoom / 100
    // Reserve box: the widest card (236px) plus a gap, scaled to what's on screen right now.
    const bw = 252 * s
    const bh = 132 * s
    const pad = 14 * s
    // Measure live rather than reading the `rects` STATE. rects is written by a layout effect, so
    // at the moment of a click it can still be one commit behind the cards added a moment ago,
    // and every card after the first would be placed against stale occupancy. Same computation
    // the measure effect does, just current.
    const cr = cv?.getBoundingClientRect()
    // .flow-goal-card is the brief's goal readout: it sits on the canvas and takes up room, but
    // it isn't a node, so scanning nodes alone would drop a card on top of it.
    const taken = cv && cr
      ? [...cv.querySelectorAll('.flow-node[data-node-id], .flow-goal-card')].map((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }
        })
      : Object.values(rects)
    const clear = (x: number, y: number) =>
      !taken.some((r) => x < r.x + r.w + pad && x + bw + pad > r.x && y < r.y + r.h + pad && y + bh + pad > r.y)
    const step = 24 * s
    // Sweep columns first so cards fill down the left of the free space, then move right.
    for (let x = pad; x + bw <= cw - pad; x += step) {
      for (let y = pad; y + bh <= ch - pad; y += step) {
        if (clear(x, y)) return { x, y }
      }
    }
    // Nothing free on screen: stack below the lowest thing we can see rather than on top of it.
    const lowest = taken.reduce((m, r) => Math.max(m, r.y + r.h), pad)
    return { x: pad, y: lowest + pad }
  }
  const addObject = (kind: CanvasObjectKind) => {
    const id = freshObjectId()
    const spot = freeSlot()
    setObjects((n) => [...n, { id, kind, text: '' }])
    // Added while inside a smart object: it belongs to that object, not the outer board.
    if (openPlacementId) setPlacements((gs) => gs.map((g) => (g.id === openPlacementId ? { ...g, memberIds: [...g.memberIds, id] } : g)))
    // Provisional position; the pendingPlace effect corrects it to `spot` once the card is
    // measured, the same way the deliverable picker places a node.
    setPos((p) => ({ ...p, [id]: { x: 0, y: 0 } }))
    pendingPlace.current = { id, ...spot }
    setSel(id)
    // Active selection only. This used to be `new Set([id])`, which put every new card into the
    // MULTI-selection: startDrag drags the whole `selected` set, so dragging a fresh card could
    // carry others with it, and the card also picked up the group's .multi styling.
    setSelected(new Set())
    setBriefCollapsed(false)
  }
  const deleteObject = (id: string) => {
    // If it was attached to the campaign, its records go with it (unless another attached card
    // still contributes the same one).
    if (connectors.some((e) => e.from === id && e.to === 'campaign')) detachFromCampaign(id, connectors)
    setObjects((n) => n.filter((x) => x.id !== id))
    setConnectors((c) => c.filter((e) => e.from !== id && e.to !== id))
    setPos((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
    if (sel === id) setSel(null)
  }
  /**
   * CREATE A RECORD FROM THE CARD THAT NEEDS IT.
   *
   * A card links an established record, so on a fresh brand every picker dead-ended: "No audiences
   * established yet" with nowhere to go. The Data source card already solved this with its
   * "+ New data set…" option; this gives every other record-linked kind the same move.
   *
   * What gets created is a labeled PLACEHOLDER, the same contract the chat's createAudience and
   * createProof commands follow: a name you chose and nothing invented around it. Audience and
   * proof route through ensureAudienceRef / ensureProofRef so they inherit that hardening
   * (dedup against the brand's full set, no dangling refs on an empty brand) rather than
   * re-implementing it here and drifting.
   */
  /** Kinds whose record this card can create. Freeform kinds have no record; Data source has its own. */
  const CREATABLE_KINDS = new Set<CanvasObjectKind>(['audience', 'proof-point', 'company', 'person', 'message', 'voice', 'trigger'])
  const createRecordForKind = (kind: CanvasObjectKind, rawName: string): { id: string; label: string } | null => {
    const nm = rawName.trim()
    if (!nm) return null
    switch (kind) {
      case 'audience': {
        const r = ensureAudienceRef(nm)
        return r ? { id: r.ref.id, label: r.ref.label } : null
      }
      case 'proof-point': {
        const r = ensureProofRef(nm)
        return r ? { id: r.ref.id, label: r.ref.label } : null
      }
      // The records slices take a Partial and return the new id. Brand-scoped so the record shows
      // up in the same rail the card was dropped in.
      case 'company': return { id: addCompany({ name: nm, brand: brand || undefined }), label: nm }
      case 'person': return { id: addPerson({ name: nm, brand: brand || undefined }), label: nm }
      case 'message': return { id: addMessage({ name: nm, brand: brand || undefined }), label: nm }
      case 'voice': return { id: addVoice({ name: nm, brand: brand || undefined }), label: nm }
      case 'trigger': return { id: addTrigger({ name: nm, brand: brand || undefined }), label: nm }
      default: return null
    }
  }
  /** Which card is currently naming a new record (null = none). */
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [creatingName, setCreatingName] = useState('')
  const submitCreate = (nt: CanvasObject) => {
    const made = createRecordForKind(nt.kind, creatingName)
    setCreatingFor(null)
    setCreatingName('')
    if (!made) return
    setObjectRef(nt.id, made.id)
    // If the card is already attached to the campaign, the new record joins it immediately, so
    // creating from an attached card does the whole job in one gesture.
    if (isAttached(nt.id)) attachToCampaign(nt.id)
  }

  // ---- Smart objects ----------------------------------------------------------------------
  // Which group a card belongs to (a card is in at most one).
  const placementOf = (noteId: string): SmartPlacement | undefined => placements.find((g) => g.memberIds.includes(noteId))
  /**
   * A list of context rows, shared by the campaign brief, a deliverable and a post so all three read
   * the same. `onRemove` is omitted where the row is inherited and cannot be unwired from here.
   */
  const renderContextRows = (
    rows: ReturnType<typeof contextRowsFor>,
    onRemove?: (id: string) => void,
  ) => (
    <div className="flow-ctxlist">
      {rows.map((r) => (
        <div key={r.id} className={`flow-ctxrow${sel === r.id ? ' sel' : ''}`}>
          <button
            className="flow-ctxrow-open"
            title={`Select this ${r.kindLabel.toLowerCase()} on the canvas`}
            onClick={() => { setSel(r.id); setSelected(new Set()) }}
          >
            <span className="flow-ctxrow-ic" style={{ color: r.tone }} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{r.icon}</svg>
            </span>
            <span className="flow-ctxrow-txt">
              <span className="flow-ctxrow-kind" style={{ color: r.tone }}>{r.kindLabel}</span>
              <span className="flow-ctxrow-name">{r.label || <em>Nothing picked yet</em>}</span>
              {(() => {
                const sub =
                  r.refs.length === 0
                    ? 'Contributes nothing yet'
                    : r.detail || (r.refs.length === 1 && r.refs[0].label === r.label ? '' : r.refs.map((x) => x.label).join(' · '))
                return sub ? <span className="flow-ctxrow-sub">{sub}</span> : null
              })()}
            </span>
          </button>
          {onRemove && (
            <button
              className="flow-ctxrow-del"
              title="Unwire it (the card stays on the board)"
              aria-label={`Unwire ${r.label || r.kindLabel}`}
              onClick={() => onRemove(r.id)}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )
  /**
   * A campaign name without its brand prefix, for prose. The builder slot has no name to show, so
   * it reads as "an unsaved campaign" rather than leaking '__new-flow__'.
   */
  const shortCampaignName = (name: string): string =>
    name === BUILDER_BOARD_KEY ? 'an unsaved campaign' : name.replace(`${brand} — `, '')
  /**
   * The cards a smart object holds, for a preview. Contents when it has them; otherwise the member
   * cards of its placement on THIS board, which is the only place the cards of an object made before
   * contents existed can still be found. Falling straight through to "Empty" would have been honest
   * and useless: the object plainly has cards, they are on the canvas.
   */
  const objectCards = (o: SmartObject): CanvasObject[] => {
    if (o.contents?.length) return o.contents
    const g = placements.find((p) => p.smartObjectId === o.id)
    if (!g) return []
    return g.memberIds.map((m) => objects.find((n) => n.id === m)).filter((n): n is CanvasObject => !!n)
  }
  /** A one-line preview: what the object will put on the board, in the words already on the cards. */
  const objectPreview = (o: SmartObject): string => {
    const cards = objectCards(o)
    if (!cards.length) return o.refs.length ? describeSmartObject(o) : 'Nothing inside yet'
    const named = cards
      .map((c) => {
        const own = refForObject(c)
        return own?.label ?? c.text.trim().split('\n')[0] ?? ''
      })
      .filter(Boolean)
    // A bundle named after its lead record ("Manager/Brand Deals") would otherwise print that record
    // again directly under its own name.
    const fresh = named.filter((l) => l !== o.name)
    if (!fresh.length) {
      // Nothing left to say in words. Two different reasons, and they need different sentences: the
      // cards are genuinely blank, or the only thing in them is the name already above.
      const kinds = [...new Set(cards.map((c) => OBJECT_META[c.kind]?.label).filter(Boolean))]
      if (named.length) return kinds.join(' · ')
      return `${cards.length} card${cards.length === 1 ? '' : 's'}, none filled in`
    }
    const head = fresh.slice(0, 2).join(' · ')
    return fresh.length > 2 ? `${head} · +${fresh.length - 2}` : head
  }
  /**
   * Drop a smart object onto the board at a point. Its cards are recreated with FRESH ids, because
   * the same object can sit on two boards at once and a board's ids have to be unique; the object
   * itself stays the source of truth, and the cards are views onto it.
   */
  const placeSmartObject = (o: SmartObject, at: { x: number; y: number }) => {
    recordHistory(true)
    const cards = objectCards(o).map((c) => ({ ...c, id: freshObjectId() }))
    const pid = freshGroupId()
    setObjects((os) => [...os, ...cards])
    setPlacements((ps) => [...ps, { id: pid, smartObjectId: o.id, memberIds: cards.map((c) => c.id) }])
    setPos((p) => ({ ...p, [pid]: { x: 0, y: 0 } }))
    // Same two-step the toolbar uses: place provisionally, then let the measure pass nudge it to the
    // drop point once the card has a real rect.
    pendingPlace.current = { id: pid, ...at }
    setSel(pid)
    setSelected(new Set())
    setBriefCollapsed(false)
  }
  /**
   * A smart object as a row in the Assets panel. Built to read like the inspector's own object rows:
   * the layered glyph, the name, then what is inside. Draggable onto the canvas, and a double-click
   * opens it in its own tab.
   */
  const renderShelfObject = (o: SmartObject) => {
    const cards = objectCards(o)
    return (
      <div
        key={o.id}
        className="flow-lib-object"
        draggable
        title={`${o.name} — drag onto the canvas, or double-click to open`}
        onDragStart={(e) => {
          e.dataTransfer.setData(SMART_OBJECT_DND, o.id)
          e.dataTransfer.effectAllowed = 'copy'
          setDragObjectId(o.id)
        }}
        onDragEnd={() => { setDragObjectId(null); setObjDropFolder(null) }}
        onDoubleClick={() => openObjectTab(o.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShelfMenu({ id: o.id, x: e.clientX, y: e.clientY })
        }}
      >
        <span className="flow-lib-object-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" />
          </svg>
        </span>
        <span className="flow-lib-object-txt">
          <span className="flow-lib-object-name">{o.name || 'Untitled smart object'}</span>
          <span className="flow-lib-object-sub">{objectPreview(o)}</span>
          {/* One tinted glyph per card inside, the same read as the smart-object card on the canvas:
              you can tell an audience-plus-proof bundle from an audience-plus-message one without
              opening either. */}
          {cards.length > 0 && (
            <span className="flow-lib-object-chips">
              {cards.slice(0, 6).map((c) => (
                <span key={c.id} className="flow-lib-object-chip" style={{ color: OBJECT_META[c.kind]?.tone }} title={OBJECT_META[c.kind]?.label}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{OBJECT_META[c.kind]?.icon}</svg>
                </span>
              ))}
              {cards.length > 6 && <span className="flow-lib-object-more">+{cards.length - 6}</span>}
            </span>
          )}
        </span>
      </div>
    )
  }
  /**
   * A shelf of smart objects as a folder tree. Folders are paths on the objects themselves, so the
   * tree is derived rather than registered: there is no empty folder to render, and filing the last
   * object out of one removes it.
   *
   * A folder head is a drop target for the same drag that places an object on the canvas, so one
   * gesture does both jobs depending on where you let go.
   */
  const renderObjectShelf = (list: SmartObject[]) => {
    const tree = buildFolderTree(list.map((o) => o.folder).filter((f): f is string => !!f), list, (o) => o.folder)
    const unfiled = list.filter((o) => !o.folder)
    const folderDrop = (path: string | undefined) => ({
      onDragOver: (e: ReactDragEvent) => {
        if (!e.dataTransfer.types.includes(SMART_OBJECT_DND)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        const key = path ?? '__unfiled__'
        if (objDropFolder !== key) setObjDropFolder(key)
      },
      onDrop: (e: ReactDragEvent) => {
        const id = e.dataTransfer.getData(SMART_OBJECT_DND)
        setObjDropFolder(null)
        setDragObjectId(null)
        if (!id) return
        e.preventDefault()
        e.stopPropagation()
        setSmartObjectFolder(id, path)
      },
    })
    const renderNode = (node: FolderNode<SmartObject>): ReactNode => {
      const drop = folderDrop(node.path)
      return (
        <div key={node.path} className="flow-lib-objfolder" style={{ marginLeft: (node.depth - 1) * 10 }}>
          <div
            className={`flow-lib-objfolder-h${objDropFolder === node.path ? ' drop' : ''}`}
            onDragOver={drop.onDragOver}
            onDrop={drop.onDrop}
            onDragLeave={() => setObjDropFolder((p) => (p === node.path ? null : p))}
          >
            <span className="flow-lib-objfolder-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
            </span>
            {node.name}
            <span className="flow-lib-objfolder-n">{countDeep(node)}</span>
          </div>
          {node.items.map(renderShelfObject)}
          {node.children.map(renderNode)}
        </div>
      )
    }
    const unfiledDrop = folderDrop(undefined)
    return (
      <>
        {tree.map(renderNode)}
        {/* The unfiled objects are also a drop target, so filing something OUT of a folder is the
            same gesture as filing it in. Without it, a folder would be a one-way door. */}
        <div
          className={`flow-lib-objunfiled${objDropFolder === '__unfiled__' ? ' drop' : ''}`}
          onDragOver={unfiledDrop.onDragOver}
          onDrop={unfiledDrop.onDrop}
          onDragLeave={() => setObjDropFolder((p) => (p === '__unfiled__' ? null : p))}
        >
          {tree.length > 0 && unfiled.length > 0 && <div className="flow-lib-objects-h">Unfiled</div>}
          {unfiled.map(renderShelfObject)}
          {tree.length > 0 && unfiled.length === 0 && (
            <div className="flow-lib-folder-empty">Drag here to take an object out of its folder.</div>
          )}
        </div>
      </>
    )
  }
  /** The brand-library object a canvas placement shows. */
  const smartObjectFor = (g: SmartPlacement) => smartObjects.find((o) => o.id === g.smartObjectId)
  const placementName = (g: SmartPlacement) => smartObjectFor(g)?.name ?? 'Smart object'
  const openPlacement = openPlacementId ? placements.find((g) => g.id === openPlacementId) ?? null : null
  // Cards drawn on the CURRENT canvas: inside an object, only its members; outside, only cards
  // that aren't in one (grouped cards live inside their object, not loose on the board).
  const visibleObjects = openPlacement
    ? objects.filter((n) => openPlacement.memberIds.includes(n.id))
    : objects.filter((n) => !placementOf(n.id))
  // Name a fresh object after what it's about: the first member with a linked record wins, else
  // the first member's kind. Beats "Smart object 3" as a default you'd have to fix every time.
  const suggestPlacementName = (ids: string[]): string => {
    for (const id of ids) {
      const nt = objects.find((n) => n.id === id)
      if (!nt) continue
      const opts = objectOptions(nt.kind)
      const label = nt.refId && opts ? opts.find((o) => o.id === nt.refId)?.label : nt.text.trim().split('\n')[0]
      if (label) return label.slice(0, 48)
    }
    // Nothing inside is filled in yet, so name it after what it holds. "Bundle" only when there is
    // something to bundle: one empty audience card became "Audience bundle", which called a single
    // card a bundle and read as a stray placeholder in the library.
    const first = objects.find((n) => n.id === ids[0])
    if (!first) return 'Smart object'
    const kind = OBJECT_META[first.kind].label
    return ids.length > 1 ? `${kind} bundle` : kind
  }
  /**
   * Bundle the selected cards into a smart object. ONE is enough: an object is a named, reusable
   * thing, and a bundle of one is both legitimate ("the RevOps audience" as its own object) and the
   * natural way to start one you will add to. Only cards, since a deliverable is not context.
   * Falls back to the single active selection so Cmd+G works without a marquee.
   */
  const convertSelection = () => {
    const pool = selected.size ? [...selected] : sel ? [sel] : []
    const ids = pool.filter((id) => objects.some((n) => n.id === id) && !placementOf(id))
    if (!ids.length) return
    recordHistory(true)
    const id = freshGroupId()
    // The object takes the top-left-most member's spot, so it appears where the cards were.
    const spot = ids
      .map((m) => pos[m] ?? { x: 0, y: 0 })
      .reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }))
    // What it holds is the RECORDS behind the cards, not the cards, which is what makes it
    // portable: another campaign places the same object and gets the same records.
    //
    // LOCAL to this campaign, not the brand library. ⌘G used to write straight to the brand, so
    // every bundle anyone made anywhere joined the brand's shared vocabulary the moment it existed
    // and the library filled with one-offs. Promote it from the inspector when it earns reuse.
    const members = ids.map((m) => objects.find((n) => n.id === m)).filter((n): n is CanvasObject => !!n)
    const refs = members.map(refForObject).filter((r): r is FlowReference => !!r)
    // The CARDS go in as well as the records they resolve to. Records alone would drop every member
    // that carries none — a message, a voice, a note — so bundling "the RevOps angle" out of a
    // message and a proof point would have quietly kept the proof and thrown the message away.
    const smartObjectId = addSmartObject(brand, suggestPlacementName(ids), refs, 'campaign', boardKey, members)
    setPlacements((g) => [...g, { id, smartObjectId, memberIds: ids }])
    setPos((p) => ({ ...p, [id]: spot }))
    // Members keep their own pos: it becomes their layout INSIDE the object.
    setSel(id)
    setSelected(new Set())
    setBriefCollapsed(false)
  }
  /** Spill an object's members back onto the board and drop the object. */
  const releasePlacement = (gid: string) => {
    const g = placements.find((x) => x.id === gid)
    if (!g) return
    recordHistory(true)
    if (openPlacementId === gid) setOpenGroupId(null)
    setPlacements((gs) => gs.filter((x) => x.id !== gid))
    setConnectors((c) => c.filter((e) => e.from !== gid && e.to !== gid))
    setPos((p) => {
      const next = { ...p }
      delete next[gid]
      return next
    })
    setSel(g.memberIds[0] ?? null)
    setSelected(new Set())
  }
  /** Delete an object AND its members (releasePlacement first if you only want the object gone). */
  const deletePlacement = (gid: string) => {
    const g = placements.find((x) => x.id === gid)
    if (!g) return
    recordHistory(true)
    if (openPlacementId === gid) setOpenGroupId(null)
    g.memberIds.forEach((m) => deleteObject(m))
    setPlacements((gs) => gs.filter((x) => x.id !== gid))
    setConnectors((c) => c.filter((e) => e.from !== gid && e.to !== gid))
    if (sel === gid) setSel(null)
  }
  // Renaming renames the LIBRARY object, so it changes everywhere the object is placed.
  const renamePlacement = (gid: string, name: string) => {
    const g = placements.find((x) => x.id === gid)
    if (g) updateSmartObject(g.smartObjectId, { name })
  }
  // The global keydown effect below runs with deps [nodes.length, viewName] and reads everything
  // else through refs, so Cmd+G goes through one too rather than capturing a stale selection.
  const convertSelectionRef = useRef(convertSelection)
  convertSelectionRef.current = convertSelection
  const openPlacementRef = useRef<string | null>(openPlacementId)
  openPlacementRef.current = openPlacementId
  const placementsRef = useRef(placements)
  placementsRef.current = placements
  const releaseRef = useRef(releasePlacement)
  releaseRef.current = releasePlacement
  /** Drop a member out of an object without deleting the card. */
  const removeFromPlacement = (gid: string, noteId: string) =>
    setPlacements((gs) => gs.map((g) => (g.id === gid ? { ...g, memberIds: g.memberIds.filter((m) => m !== noteId) } : g)))

  const updateObjectText = (id: string, text: string) => setObjects((n) => n.map((x) => (x.id === id ? { ...x, text } : x)))
  const setObjectRef = (id: string, refId: string) => setObjects((n) => n.map((x) => (x.id === id ? { ...x, refId: refId || undefined } : x)))
  // Linked kinds pick from an established record; freeform kinds (note, concept, season) return null.
  const named = <T extends { id: string; name: string }>(list: T[]) => list.map((r) => ({ id: r.id, label: r.name || 'Untitled' }))
  const objectOptions = (kind: CanvasObjectKind): { id: string; label: string }[] | null => {
    switch (kind) {
      case 'audience': return brandSegments.map((a) => ({ id: a.id, label: a.name || 'Untitled audience' }))
      case 'data-source': return CONNECTOR_SOURCES
      case 'proof-point': return brandProof.map((r) => ({ id: r.id, label: r.label || 'Untitled proof point' }))
      case 'company': return named(companies)
      case 'person': return named(people)
      case 'trigger': return named(triggers)
      case 'message': return named(messages)
      case 'voice': return named(voices)
      default: return null
    }
  }
  // View mode: add a deliverable straight into the opened flow's campaign (seed its rows
  // and write their copy), so an existing flow can grow without leaving Flows or rebuilding.
  const [addingDeliv, setAddingDeliv] = useState(false)
  const addViewDeliverable = async (p: DeliverablePreset) => {
    if (!viewName || addingDeliv) return
    recordHistory(true)
    // If the picker was opened from an asset's "+", link the new rows back to that asset so the
    // canvas draws the journey edge (asset → this deliverable).
    const src = connectFromRef.current
    const srcRow = src ? useTrafficStore.getState().rows.find((r) => r.id === src) : undefined
    setPickAt(null)
    setConnectFrom(null)
    setAddingDeliv(true)
    try {
      // Segment refs only (proof/company/etc. refs must not leak into row.audience).
      const segAuds = flowRefs.filter((r) => r.type === 'segment').map((r) => r.label)
      const auds = segAuds.length ? segAuds : viewAudiences.length ? viewAudiences : audSelection
      const d: Deliverable = { label: p.label, channel: p.channel, assetType: p.assetType, media: p.media, perMonth: startCount(p), runtime: p.runtime, brand: p.brand }
      const before = new Set(useTrafficStore.getState().rows.filter((r) => r.campaign === viewName).map((r) => r.id))
      await seedCampaignAssets(viewName, [d], { flightWeeks: viewFlight ?? flightWeeks, audiences: auds })
      const fresh = useTrafficStore.getState().rows.filter((r) => r.campaign === viewName && !before.has(r.id))
      if (srcRow && fresh.length) {
        // Tag the new rows as branching off the source asset. The layout effect then pins the
        // deliverable to the right of that asset automatically.
        await updateRows(fresh.map((r) => ({ id: r.id, patch: { branchOf: srcRow.assetName } })))
      }
      if (fresh.length) await draftCopy(fresh.map((r) => r.id))
    } finally {
      setAddingDeliv(false)
    }
  }
  // Open the deliverable picker. In a viewed flow, if a card is selected the new deliverable
  // branches off it (an asset branches directly; a deliverable branches off its last asset) so it
  // lands to the RIGHT of that card instead of dropping back to the top-level column.
  const openAddDeliverable = () => {
    if (viewing && typeof sel === 'string' && sel !== 'campaign') {
      const asset = viewRows.find((r) => r.id === sel)
      const deliv = asset ? undefined : viewDelivs.find((d) => d.key === sel)
      const anchor =
        asset ??
        (deliv && deliv.rows.length
          ? [...deliv.rows].sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))[deliv.rows.length - 1]
          : undefined)
      setConnectFrom(anchor ? anchor.id : null)
    } else {
      setConnectFrom(null)
      setSel(null)
    }
    setBriefCollapsed(false)
    setPickAt(viewing ? viewDelivs.length : nodes.length)
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
    setConnectors((c) => c.filter((e) => e.from !== id && e.to !== id))
    setPos((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
    setSelected((s) => {
      if (!s.has(id)) return s
      const next = new Set(s)
      next.delete(id)
      return next
    })
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
    // Hand the outgoing conversation to history, then clear it. Without this the thread follows
    // you into the next campaign: you see the previous campaign's transcript, its Apply button
    // still points at a pending edit for the campaign you left, and because blankCampaign requires
    // chatMsgs.length === 0 the "What are you launching?" front door never renders again for the
    // rest of the session. Persist BEFORE clearing so the thread stays reopenable from history.
    persistActiveChat()
    setChatMsgs([])
    setViewName(null)
    setBuilt(null)
    setNodes([])
    setObjects([])
    // Placements belong to the campaign you made them on, same as the cards and the chat thread.
    // (The library OBJECTS survive: that is the point of them. Only "it is on this canvas" resets.)
    setPlacements([])
    setConnectors([])
    setOpenGroupId(null)
    // Drop the builder's SAVED board too, or the next new campaign inherits the last unbuilt one.
    saveFlowBoard({ key: BUILDER_BOARD_KEY, objects: [], placements: [], pos: {}, connectors: [] })
    setBriefHidden(false)
    setBriefSummoned(false)
    // A fresh campaign opens as a clean, blank canvas: inspector collapsed, just the starter
    // card + toolbar. The inspector expands the moment a card is selected (see clickSelect).
    setBriefCollapsed(true)
    setPreview({})
    setName('')
    setSubject('')
    setBudget('')
    setStrategyKey(undefined)
    setObjectiveId('')
    setMessageId('')
    setBriefRefs(null)
    lastSubjectRef.current = ''
    setSel(null)
    setPickAt(null)
    setCampaignFilter('all')
    // A new campaign opens with Gretel expanded, because Gretel IS the front door now: its
    // empty state asks what you're launching. Only on creation, so collapsing it later sticks.
    setChatCollapsed(false)
  }
  const openView = (n: string) => {
    persistActiveChat()
    setChatMsgs([])
    setOpenGroupId(null)
    // LOAD this campaign's board instead of clearing it. These two lines used to be setObjects([])
    // and setPlacements([]), with a comment saying the board belongs to the campaign you left:
    // right about the problem, and the only fix available while the board was session state.
    // Prune on load, because refId and smartObjectId are unvalidated cross-namespace keys, so a
    // record deleted since you were last here would leave an object pointing at nothing.
    const loaded = pruneBoard(boardFor(flowBoards, n), {
      objectKinds: new Set(Object.keys(OBJECT_META)),
      smartObjectIds: new Set(smartObjects.map((o) => o.id)),
    })
    setObjects(loaded.objects)
    setPlacements(loaded.placements)
    setConnectors(loaded.connectors)
    setPos((p) => ({ ...p, ...loaded.pos }))
    setViewName(n)
    setBuilt(null)
    setPickAt(null)
    setSel(null)
    setBriefHidden(false)
    setBriefSummoned(false)
    // An existing campaign has content to inspect, so open the panel to its brief.
    setBriefCollapsed(false)
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
      // Honor the requested view (e.g. "Review your calendar" opens straight to the calendar).
      setFlowView(flowOpenView)
    }
    setFlowScreen('canvas')
    clearFlowOpen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowOpen])

  const grouped = useMemo(() => {
    const map = new Map<string, DeliverablePreset[]>()
    for (const p of DELIVERABLE_PRESETS) {
      if (pickGroup && p.group !== pickGroup) continue
      const arr = map.get(p.group) ?? []
      arr.push(p)
      map.set(p.group, arr)
    }
    return [...map.entries()]
  }, [pickGroup])

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

  // Card ids (posts, deliverables, build sub-cards) that carry media budget/spend. Connectors
  // touching one of these are tinted gold so a paid path stands out from organic on the canvas.
  const paidCardIds = useMemo(() => {
    const s = new Set<string>()
    if (viewName !== null) {
      for (const d of viewDelivs) {
        const paidRows = d.rows.filter(hasMediaSpend)
        if (paidRows.length) s.add(d.key)
        for (const r of paidRows) s.add(r.id)
      }
    } else {
      for (const n of nodes) {
        const p = presetByKey(n.presetKey)
        if (!p || CHANNELS[p.channel]?.kind !== 'paid') continue
        s.add(n.id)
        const slots = subcardCount(p, n.perMonth)
        for (let bi = 0; bi < slots; bi++) s.add(`${n.id}:${bi}`)
      }
    }
    return s
  }, [viewName, viewDelivs, nodes])

  // Which node's transform CARRIES each nested child. Post cards render inside their deliverable's
  // translated container (and build sub-cards inside their deliverable's), so a child's on-screen
  // position already includes its parent's pos. Dragging a parent moves the child for free — the
  // child must NOT also move its own pos, or it drifts at double speed. This map drives that.
  const nodeParent = useMemo(() => {
    const m = new Map<string, string>()
    if (viewName !== null) {
      for (const d of viewDelivs) for (const r of d.rows) m.set(r.id, d.key)
    } else {
      for (const n of nodes) {
        const p = presetByKey(n.presetKey)
        if (!p) continue
        const slots = subcardCount(p, n.perMonth)
        for (let bi = 0; bi < slots; bi++) m.set(`${n.id}:${bi}`, n.id)
      }
    }
    return m
  }, [viewName, viewDelivs, nodes])

  // A node's rect for connector drawing: its measured rect, but while it's being dragged, offset
  // live by the current drag delta (canvas units → screen px via the zoom scale). This is what
  // keeps a connector glued to its card mid-drag without a per-frame remeasure.
  const connRect = (id: string) => {
    const r = rects[id]
    if (!r) return undefined
    if (dragDelta && dragDelta.ids.includes(id)) {
      const s = zoom / 100
      return { x: r.x + dragDelta.dx * s, y: r.y + dragDelta.dy * s, w: r.w, h: r.h }
    }
    return r
  }

  // The campaign name this flow builds into (must match build()'s naming) — used to scope
  // the real Grid / Calendar to just this flow's assets.
  const flowCampaign = viewName ?? `${brand ? `${brand} — ` : ''}${name.trim() || 'New campaign'}`
  // Whether this campaign has any built rows yet (so the grid/calendar can hint to Build).
  const hasBuiltRows = useTrafficStore((s) => s.rows.some((r) => r.campaign === flowCampaign))

  /**
   * PERSIST THE BOARD. Debounced, because pos changes on every frame of a drag and the auto-place
   * effect writes it again while a freshly added node settles (it is stabilised only by a 2px
   * epsilon and the placedRef latch), so an eager save would write dozens of times per interaction.
   *
   * Keyed the same way the chat is (chatFlowKey), so the unbuilt builder gets its own slot and its
   * board is not lost the moment you name the campaign.
   */
  const boardKey = viewName ?? BUILDER_BOARD_KEY
  /**
   * The board as it stands, ready to persist. Only the positions of things actually on THIS board:
   * pos also holds deliverable and post ids, which belong to the flow layout rather than the board.
   */
  const boardSnapshot = (key: string): FlowBoard => {
    const ids = new Set([...objects.map((o) => o.id), ...placements.map((p) => p.id), 'campaign'])
    const boardPos: Record<string, { x: number; y: number }> = {}
    for (const [k, v] of Object.entries(pos)) if (ids.has(k)) boardPos[k] = v
    return { key, objects, placements, pos: boardPos, connectors }
  }
  const boardSaveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (boardSaveTimer.current) window.clearTimeout(boardSaveTimer.current)
    boardSaveTimer.current = window.setTimeout(() => {
      saveFlowBoard(boardSnapshot(boardKey))
    }, 600)
    return () => {
      if (boardSaveTimer.current) window.clearTimeout(boardSaveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, objects, placements, connectors, pos])

  // Measure node positions (canvas-local) so the SVG connectors track them as nodes
  // move, pan, and zoom. During an active drag we SKIP the remeasure — re-reading every node's
  // bounding rect each frame can't keep 60fps on a large flow, so connectors would trail the
  // cards. Instead the dragged nodes' endpoints are offset live by dragDelta (see connRect), and
  // dragDelta flipping back to null on drop re-runs this once to capture the final geometry.
  // viewDelivs + varTreeH are deps too: adding/removing assets reflows the branch columns, so we
  // must remeasure IN THE SAME COMMIT (before paint) or the connectors paint against stale rects
  // for a frame and visibly break-then-reconnect as the layout settles.
  useLayoutEffect(() => {
    if (dragging.current) return
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
  }, [nodes, objects, pos, offset, zoom, selected, connectors, viewName, chatCollapsed, flowAssetsOpen, briefCollapsed, dragDelta, viewDelivs, varTreeH])

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
    objective?: { text: string; kpi?: string; target?: number }
    /** The chosen GTM motion (a strategy key); falls back to addCampaign's brand/role resolution. */
    strategy?: string
  }) => {
    if (!cfg.nodes.length || building) return
    setBuilding(true)
    const campaignName = `${brand ? `${brand} — ` : ''}${cfg.name.trim() || 'New campaign'}`
    try {
      if (brand) addCampaign({ name: campaignName, client: brand, strategy: cfg.strategy ?? 'content-seo', parent: newCampaignParent ?? undefined, subject: cfg.subject.trim() || undefined, durationWeeks: cfg.flightWeeks, overallBudget: cfg.budget ? Math.max(0, +cfg.budget || 0) : undefined, objective: cfg.objective?.text, goalKpi: cfg.objective?.kpi, goalTarget: cfg.objective?.target })
      // addCampaign treats 'content-seo' as a "no explicit choice" sentinel, so a deliberately
      // confirmed Content + SEO motion would be silently replaced by the brand/role default. When
      // the user actually chose a motion, stamp it directly so the campaign matches what we told them.
      if (brand && cfg.strategy) patchCampaign(campaignName, { strategy: cfg.strategy })
      if (newCampaignParent) setNewCampaignParent(null)
      if (cfg.refs.length) setCampaignReferences(campaignName, cfg.refs)
      // Hand the builder's board and any object made on it to the campaign that now exists. Without
      // this, opening the built campaign loads its own empty board over the top and every input card
      // placed before Build is gone.
      //
      // Flushed first, because the board save is debounced 600ms: hitting Build straight after
      // placing a card would otherwise find nothing in the builder slot to hand over.
      saveFlowBoard(boardSnapshot(BUILDER_BOARD_KEY))
      adoptBuilderBoard(campaignName)
      // Carry build-mode direction onto the campaign the moment it exists, BEFORE the assets are
      // seeded, so the first draft is written to it and a regeneration later still has it.
      if (builderDirection.length) setCampaignDirection(campaignName, builderDirection)
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
      // Point the workspace scope at the just-built flow so the standalone Grid, Calendar,
      // and brand views show its assets right away — no need to match the rail by hand.
      // (setClientFilter also clears any stale channel/proof/audience narrowing.)
      setClientFilter(brand || 'all')
      setCampaignFilter(campaignName)
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
    return buildFlow({ name, subject, budget, flightWeeks, refs: briefRefsEffective, audiences: audSelection, nodes: effective, objective: objectiveCfg, strategy: strategyKey })
  }

  // Resolve record-tag labels back to structured references via the record groups.
  const labelsToRefs = (labels: string[]): FlowReference[] => {
    const out: FlowReference[] = []
    for (const l of (Array.isArray(labels) ? labels : [])) {
      for (const g of recordGroups) {
        const it = g.items.find((i) => i.label === l)
        if (it) { out.push({ type: g.type, id: it.id, label: it.label }); break }
      }
    }
    return out
  }

  // Create-or-reuse a brand audience by name for the chat's `createAudience` command. Reuses an
  // existing audience of the same name instead of duplicating, otherwise creates a LABELED
  // PLACEHOLDER the user fills in later (newAudience gives empty persona fields — never a fabricated
  // persona). Reads live store state so several creates in one command batch don't clobber, and
  // returns the ref to tag plus whether it was freshly created (for the summary wording).
  const ensureAudienceRef = (rawName: string): { ref: FlowReference; created: boolean } | null => {
    // Guard first: a schema-valid command may omit `name`, and there may be no brand selected.
    // Never trim undefined (crash), never persist to an empty-brand bucket (dangling ref).
    if (typeof rawName !== 'string') return null
    const nm = rawName.trim()
    if (!nm || !brand) return null
    // Dedup against the brand's FULL audience set (client audiences AND the inherited system-library
    // ones), so we never recreate a real persona as an empty placeholder that would clobber it in
    // generation. Reuse the existing one's identity when found; create only when genuinely missing.
    // Read live client audiences so several creates in one batch don't clobber each other.
    const key = nm.toLowerCase()
    const clientAuds = useTrafficStore.getState().clientAudiences[brand] ?? []
    const libAuds = resolveBrandScope(brand, brandSystems, brandMeta).library.audiences ?? []
    const existing = [...clientAuds, ...libAuds].find((a) => a.name.trim().toLowerCase() === key)
    if (existing) return { ref: { type: 'segment', id: existing.id, label: existing.name }, created: false }
    const aud = newAudience({ name: nm })
    setClientAudiences(brand, [...clientAuds, aud])
    return { ref: { type: 'segment', id: aud.id, label: nm }, created: true }
  }

  // Create-or-reuse a brand proof point (RTB) by label for the chat's `createProof` command. Reuses
  // an existing same-label proof instead of duplicating; otherwise adds an UNVETTED DRAFT (approved:
  // false) to the brand's library for the user to review. Dedups against the brand's live proof
  // library so several creates in one batch do not duplicate.
  const ensureProofRef = (rawText: string): { ref: FlowReference; created: boolean } | null => {
    if (typeof rawText !== 'string') return null
    const label = rawText.trim()
    if (!label || !brand) return null
    const key = label.toLowerCase()
    const liveSystems = useTrafficStore.getState().brandSystems
    const libRtbs = resolveBrandScope(brand, liveSystems, brandMeta).library.rtbs ?? []
    const existing = libRtbs.find((r) => r.label.trim().toLowerCase() === key)
    if (existing) return { ref: { type: 'proof', id: existing.id, label: existing.label }, created: false }
    const rtb: Rtb = { id: `rtb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, label, detail: label, approved: false, outcomes: [] }
    addBrandProof(brand, rtb)
    return { ref: { type: 'proof', id: rtb.id, label }, created: true }
  }

  // Resolve a chat-supplied motion (a key, a name, or an alias) to a real GTM strategy. Null when it
  // cannot be resolved, so setStrategy no-ops instead of stamping a garbage strategy.
  const strategyFor = (v: string): { key: string; name: string } | null => {
    if (typeof v !== 'string' || !v.trim()) return null
    const key = resolveStrategyKey(v.trim())
    return key ? GTM_STRATEGIES.find((x) => x.key === key) ?? null : null
  }

  // Apply the AI's commands to the flow. Build-mode commands mutate the builder (and the
  // canvas) and can end in a `build`; view-mode commands edit the open flow in place.
  // Returns human-readable summaries of what was applied.
  /**
   * Applies approved commands and reports BOTH what landed and what did not. The skipped list is
   * the point: the view-mode branch below handles a subset of the vocabulary, and until now every
   * unhandled op fell out of the loop silently while the UI stamped the whole batch "Applied".
   * Verified live on 2026-07-25: asking an open campaign to set its budget showed a check mark
   * next to "Set budget to $9,000" while the stored budget never moved off $24,000.
   */
  const applyFlowCommands = async (cmds: FlowCommand[]): Promise<{ applied: string[]; skipped: string[] }> => {
    const applied: string[] = []
    const skipped: string[] = []
    if (viewName !== null) {
      let vRefs = [...flowRefs]
      const createdRefs: FlowReference[] = []
      for (const c of cmds) {
        if (c.op === 'addDeliverable') {
          const p = presetByKey(c.preset)
          if (p) { await addViewDeliverable(p); applied.push(`Added ${p.label}`) }
        } else if (c.op === 'setRecordTags') {
          // Preserve audiences created earlier this batch: their labels are not in the record list,
          // so a plain replace would silently drop them.
          const refs = labelsToRefs(c.labels)
          vRefs = [...refs, ...createdRefs.filter((cr) => !refs.some((r) => r.id === cr.id))]
          setCampaignReferences(viewName, vRefs)
          setRefsDirty(true)
          applied.push(`Tagged ${refs.length} record${refs.length === 1 ? '' : 's'}`)
        } else if (c.op === 'createAudience') {
          const r = ensureAudienceRef(c.name)
          if (r) {
            if (!vRefs.some((x) => x.type === 'segment' && x.id === r.ref.id)) vRefs = [...vRefs, r.ref]
            if (!createdRefs.some((x) => x.id === r.ref.id)) createdRefs.push(r.ref)
            setCampaignReferences(viewName, vRefs)
            setRefsDirty(true)
            applied.push(r.created ? `Created a placeholder audience "${r.ref.label}"` : `Tagged audience "${r.ref.label}"`)
          }
        } else if (c.op === 'createProof') {
          const r = ensureProofRef(c.text)
          if (r) {
            if (!vRefs.some((x) => x.type === 'proof' && x.id === r.ref.id)) vRefs = [...vRefs, r.ref]
            if (!createdRefs.some((x) => x.id === r.ref.id)) createdRefs.push(r.ref)
            setCampaignReferences(viewName, vRefs)
            setRefsDirty(true)
            applied.push(r.created ? `Added a proof point "${r.ref.label}" (draft)` : `Tagged proof point "${r.ref.label}"`)
          }
        } else if (c.op === 'setStrategy') {
          // View mode: persist the motion straight onto the open campaign (build mode uses wStrategy).
          const s = strategyFor(c.value)
          if (s) { patchCampaign(viewName, { strategy: s.key }); applied.push(`Set the strategy to ${s.name}`) }
        } else if (c.op === 'setSubject') {
          // Both of these are just campaign fields, and patchCampaign is already used for strategy
          // two branches up, so there was never a reason for them to be build-mode only.
          patchCampaign(viewName, { subject: c.value })
          setRefsDirty(true)
          applied.push(`Set the campaign theme to "${c.value}"`)
        } else if (c.op === 'setBudget') {
          const n = Math.max(0, Number(String(c.value).replace(/[^0-9.]/g, '')) || 0)
          if (n > 0) {
            patchCampaign(viewName, { overallBudget: n })
            applied.push(`Set the budget to $${n.toLocaleString()}`)
          } else {
            skipped.push(`Could not read a budget from "${c.value}"`)
          }
        } else if (c.op === 'regenerate') {
          await regenerateFlow()
          applied.push('Regenerated the copy')
        } else {
          // Everything the open-campaign branch genuinely cannot do. Say so by name rather than
          // dropping it: renaming a built campaign re-keys every row, and build/removeDeliverable
          // would rewrite work that already exists.
          skipped.push(`${describeCommand(c)} (not available on a campaign that is already built)`)
        }
      }
      return { applied, skipped }
    }
    // Build mode: keep a working copy so a same-turn `build` sees every prior edit.
    let wName = name, wSubject = subject, wBudget = budget, wFlight = flightWeeks
    let wNodes = [...nodesRef.current]
    let wRefs = [...briefRefsEffective]
    let wStrategy = strategyKey
    const createdRefs: FlowReference[] = []
    for (const c of cmds) {
      switch (c.op) {
        case 'setName': setName(c.value); wName = c.value; applied.push(`Named it "${c.value}"`); break
        case 'setStrategy': {
          // Accept a key OR a motion name/alias; anything unresolvable no-ops rather than stamping
          // a garbage strategy onto the campaign.
          const s = strategyFor(c.value)
          if (s) { setStrategyKey(s.key); wStrategy = s.key; applied.push(`Set the strategy to ${s.name}`) }
          break
        }
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
          // Preserve audiences created earlier this batch (their labels are not in the record list).
          const refs = labelsToRefs(c.labels)
          wRefs = [...refs, ...createdRefs.filter((cr) => !refs.some((r) => r.id === cr.id))]
          setBriefRefs(wRefs)
          applied.push(`Tagged ${refs.length} record${refs.length === 1 ? '' : 's'}`)
          break
        }
        case 'createAudience': {
          const r = ensureAudienceRef(c.name)
          if (r) {
            if (!wRefs.some((x) => x.type === 'segment' && x.id === r.ref.id)) { wRefs = [...wRefs, r.ref]; setBriefRefs(wRefs) }
            if (!createdRefs.some((x) => x.id === r.ref.id)) createdRefs.push(r.ref)
            applied.push(r.created ? `Created a placeholder audience "${r.ref.label}"` : `Tagged audience "${r.ref.label}"`)
          }
          break
        }
        case 'createProof': {
          const r = ensureProofRef(c.text)
          if (r) {
            if (!wRefs.some((x) => x.type === 'proof' && x.id === r.ref.id)) { wRefs = [...wRefs, r.ref]; setBriefRefs(wRefs) }
            if (!createdRefs.some((x) => x.id === r.ref.id)) createdRefs.push(r.ref)
            applied.push(r.created ? `Added a proof point "${r.ref.label}" (draft)` : `Tagged proof point "${r.ref.label}"`)
          }
          break
        }
        case 'build': {
          // Segment refs ONLY feed the audience rotation; proof/company/etc. refs must not leak
          // into row.audience (that would create phantom audiences). Mirrors audSelection.
          const segAuds = wRefs.filter((r) => r.type === 'segment').map((r) => r.label)
          const auds = segAuds.length ? segAuds : audienceNames
          const nm = await buildFlow({ name: wName, subject: wSubject, budget: wBudget, flightWeeks: wFlight, refs: wRefs, audiences: auds, nodes: wNodes, objective: objectiveCfg, strategy: wStrategy })
          if (nm) applied.push(`Built ${wNodes.length} deliverable${wNodes.length === 1 ? '' : 's'} and wrote the copy`)
          break
        }
      }
    }
    return { applied, skipped }
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
      case 'createAudience': return `Create a placeholder audience "${c.name}" and tag it`
      case 'createProof': return `Add a proof point "${c.text}" and tag it`
      case 'setStrategy': return `Set the strategy to ${GTM_STRATEGIES.find((s) => s.key === c.value)?.name ?? c.value}`
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
        proof: brandProof.map((r) => r.label),
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
            strategy: viewCampaign?.strategy ?? null,
          }
        : {
            mode: 'build' as const,
            name,
            subject,
            budget: budget ? +budget : null,
            flightWeeks,
            deliverables: nodesRef.current.map((n) => ({ preset: n.presetKey, label: presetByKey(n.presetKey)?.label ?? n.presetKey, perMonth: n.perMonth })),
            recordTags: briefRefsEffective.map((r) => r.label),
            strategy: strategyKey ?? null,
          }
      // Strategy-first discovery: the motions to choose from, and what the app already knows about
      // this brand (split across the brand record + client profile), so the chat asks PURPOSE,
      // recommends a motion, and never re-asks what it already knows.
      const strategyMenu = GTM_STRATEGIES.map((s) => ({ key: s.key, name: s.name, bestFor: s.bestFor, coreMetrics: s.coreMetrics }))
      const profile = brand ? clientProfiles[brand] : undefined
      const brandRec = brand ? brandRecords.find((r) => r.name === brand) : undefined
      const brandFacts = {
        businessObjective: brandRec?.businessObjective || undefined,
        positioning: brandRec?.positioning || undefined,
        primaryAudience: brandRec?.primaryAudience || undefined,
        strategy: profile?.strategy || undefined,
        businessModel: profile?.businessModel || undefined,
        oneLiner: profile?.oneLiner || undefined,
      }
      const res = await generateFlowEdit({
        brand,
        intent,
        flow,
        presets,
        records,
        message: t,
        history: chatMsgs.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        // One chat, two dials: skill level sets autonomy/verbosity, role biases vocabulary + defaults.
        skillLevel: userPrefs.skillLevel,
        marketerRole: userPrefs.marketerRole,
        roleStrategy: userPrefs.marketerRole ? ROLE_PRESETS[userPrefs.marketerRole].defaultStrategy : null,
        strategyMenu,
        brandFacts,
      })
      // Analyze (or no edits proposed) is answer-only. Build proposes edits as a pending
      // Suggestions block the user approves before they apply.
      const commands = intent === 'analyze' ? [] : res.commands
      const suggestions = commands.map(describeCommand)
      const nextSteps = (res.nextSteps ?? []).map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).slice(0, 3)
      setChatMsgs((m) => [...m, { id: nextChatId(), role: 'assistant', text: res.reply, live: res.live, commands: commands.length ? commands : undefined, suggestions: suggestions.length ? suggestions : undefined, nextSteps: nextSteps.length ? nextSteps : undefined }])
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
      const { applied, skipped } = await applyFlowCommands(msg.commands)
      setChatMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: 'applied', applied, skipped } : x)))
    } finally {
      setChatBusy(false)
    }
  }
  const discardPendingChat = (msgId: string) =>
    setChatMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: 'discarded' } : x)))

  // New chat + history. The active chat is saved to history (keyed by the flow) before
  // it's cleared or another is opened.
  const chatFlowKey = viewName ?? BUILDER_BOARD_KEY
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
  /**
   * Is the campaign hub actually ON the board? Unattached cards are dimmed to mark them as draft
   * thoughts, but "attached" means an edge to the campaign card — so on a canvas with no campaign
   * card, nothing CAN be attached and every card dimmed at once, saying "all of this is provisional"
   * when the truth is there is nothing to attach to. Mirrors the hub's own render condition.
   */
  const hasHub = !briefHidden && (viewing || briefSummoned)

  // A brand-new, untouched campaign — no deliverables, objects, chat, or name yet. It opens with a
  // blank canvas + the "What are you launching?" starter as the only front door; the brief card
  // isn't pre-placed until the campaign gains some shape (or the user summons it from the toolbar).
  const blankCampaign = !viewing && nodes.length === 0 && objects.length === 0 && chatMsgs.length === 0 && !name.trim()
  const selDeliv = viewing ? viewDelivs.find((d) => d.key === sel) : null
  const selPost = viewing ? viewRows.find((r) => r.id === sel) : null
  // Primitive cards are selectable in BOTH modes and their ids (note_N) match none of the other
  // inspector branches, so without this they fell through: clicking an Audience card showed you
  // the Campaign brief panel. Same lookup for build and view.
  /**
   * DIRECTION read/write. Stored on the CAMPAIGN, keyed by object kind plus direction key, because
   * objects are still session state and nothing typed should be lost on reload. One value per
   * (kind, key) per campaign: two audience objects share the pain slot, which is the same
   * "an asset gets one claim" rule the builder enforces by priority.
   */
  const campaignDirection = (viewing ? viewCampaign?.direction : builderDirection) ?? []
  const directionValue = (kind: CanvasObjectKind, key: DirectionKey): string =>
    campaignDirection.find((d) => d.kind === kind && d.key === key)?.value ?? ''
  const setDirectionValue = (kind: CanvasObjectKind, key: DirectionKey, value: string) => {
    const next = campaignDirection.filter((d) => !(d.kind === kind && d.key === key))
    if (value.trim()) next.push({ kind, key, value })
    if (viewing && viewName) setCampaignDirection(viewName, next)
    else setBuilderDirection(next)
    // Redraft the previews so typing an instruction visibly rewrites the copy on every deliverable
    // it reaches. Debounced by scheduleRedraftAll, so a sentence typed a character at a time is one
    // regeneration pass rather than forty.
    directionRef.current = next
    if (!viewing) scheduleRedraftAll()
    else setRefsDirty(true)
  }
  directionRef.current = campaignDirection

  const selObject = objects.find((n) => n.id === sel) ?? null
  const selGroup = placements.find((g) => g.id === sel) ?? null

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

  // Assets is a brand-organized library browser: each brand is a folder of its campaign libraries.
  const toggleBrandFolder = (b: string) =>
    setOpenBrandFolders((prev) => {
      const next = new Set(prev)
      next.has(b) ? next.delete(b) : next.add(b)
      return next
    })
  // Clicking a brand opens it as a canvas tab: its brand page on the Data tab (the flexible data
  // sets), with the preset basics one tab over. Scoped to the clicked brand.
  const openBrand = (b: string) => {
    if (b !== brand) setClientFilter(b)
    openBrandTab(b)
    setBrandTab('data')
  }
  // Double-clicking a Data source card opens its linked data set as a full-page spreadsheet tab. If
  // it isn't linked to a data set yet (empty, or a connector), spin one up, link it, and open it.
  const openDataCard = (nt: CanvasObject) => {
    const linked = nt.refId && allBrandDatasets.some((d) => d.id === nt.refId) ? nt.refId : null
    if (linked) {
      openDatasetTab(linked)
      return
    }
    const id = addBrandDataset(brand)
    setObjectRef(nt.id, id)
    openDatasetTab(id)
  }
  // "Start a folder for a new brand": create + register the brand, then drop into its brand page on
  // the About tab so its basics (the dropdowns Gretel reads) are right there to fill out.
  const createBrandFolder = () => {
    const nm = newBrandName.trim()
    if (!nm) return
    const id = addBrandRecord({ name: nm })
    updateBrandRecord(id, { name: nm })
    setOpenBrandFolders((prev) => new Set([...prev, nm]))
    setNewBrandName('')
    setAddingBrand(false)
    setClientFilter(nm)
    openBrandTab(nm)
    setBrandTab('about')
  }

  // The outline (campaign + its deliverables) — a map of the board's contents, shown in the
  // inspector's nothing-selected state. Clicking a row selects that node.
  /**
   * LAYERS: everything on the board, in one list, grouped by what each card does. The outline this
   * replaced listed deliverables only, so the eleven kinds of context card and every smart object
   * were invisible unless you could see them on the canvas. Click a row to select that card.
   *
   * Grouped by the same three words the toolbar palette uses, so the panel and the palette teach
   * one vocabulary. A smart object nests its members underneath it, indented.
   */
  type Layer = { id: string; label: string; sub?: string; count?: number; icon?: ReactNode; depth?: number; attached?: boolean }
  // Deliverables carry their CHANNEL mark, the same one the card shows, so the list reads as the
  // board rather than as a table of names.
  const outputLayers: Layer[] = viewing
    ? viewDelivs.map((d) => ({
        id: d.key, label: d.label, count: d.count, sub: d.channel,
        icon: <PresetTile tone={DELIV_TONE} channel={d.channel as ChannelId} />,
      }))
    : nodes.map((n) => {
        const p = presetByKey(n.presetKey)
        return {
          id: n.id,
          label: p?.label ?? 'Deliverable',
          count: p ? subcardCount(p, n.perMonth) : 0,
          sub: p?.channel,
          icon: <PresetTile tone={DELIV_TONE} channel={p?.channel} />,
        }
      })
  const objectLayer = (nt: CanvasObject, depth = 0): Layer => {
    const opts = objectOptions(nt.kind)
    // An object-linked card has no refId, so reading refId alone showed it in Layers as its bare
    // kind ("Person") rather than what it points at. Check the object first.
    const obj = nt.smartObjectId ? smartObjects.find((o) => o.id === nt.smartObjectId) : undefined
    const linked = obj ? obj.name : nt.refId && opts ? opts.find((o) => o.id === nt.refId)?.label : ''
    return {
      id: nt.id,
      label: linked || nt.text.trim().split('\n')[0] || OBJECT_META[nt.kind].label,
      sub: OBJECT_META[nt.kind].label,
      icon: (
        <span className="flow-layer-ic" style={{ color: OBJECT_META[nt.kind].tone }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{OBJECT_META[nt.kind].icon}</svg>
        </span>
      ),
      depth,
      // Only inputs can attach: a sticky note is deliberately outside the machine, so flagging it
      // as "not attached" would be noise about a state it can never be in.
      attached: OBJECT_META[nt.kind].role === 'input' ? isAttached(nt.id) : undefined,
    }
  }
  // Cards loose on the board, then each smart object with its members nested under it.
  const inputLayers: Layer[] = [
    ...objects.filter((n) => OBJECT_META[n.kind].role === 'input' && !placementOf(n.id)).map((n) => objectLayer(n)),
    ...placements.flatMap((g) => [
      {
        id: g.id,
        label: placementName(g),
        sub: 'Smart object',
        count: g.memberIds.length,
        attached: isAttached(g.id),
        icon: (
          <span className="flow-layer-ic" style={{ color: 'var(--accent-2)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" />
            </svg>
          </span>
        ),
      } as Layer,
      ...g.memberIds
        .map((m) => objects.find((n) => n.id === m))
        .filter((n): n is CanvasObject => !!n && OBJECT_META[n.kind].role === 'input')
        .map((n) => objectLayer(n, 1)),
    ]),
  ]
  const markupLayers: Layer[] = objects.filter((n) => OBJECT_META[n.kind].role === 'markup' && !placementOf(n.id)).map((n) => objectLayer(n))
  const pickOutline = (id: string) => {
    setSel(id === 'campaign' ? 'campaign' : id)
    setSelected(id === 'campaign' ? new Set() : new Set([id]))
    setBriefCollapsed(false)
  }
  /**
   * The inspector panel for a selected primitive card, shared by build and view mode. Everything
   * the card itself can do is here too (link a record, write the note, open a linked data set,
   * delete), because the card is small and the inspector is where you expect to adjust a thing.
   *
   * It also states what the card DOES, which is the one place we can be unambiguous: an input is
   * board context and its linked record does not reach the copy writer yet.
   */
  const renderObjectInspector = (nt: CanvasObject) => {
    const meta = OBJECT_META[nt.kind]
    const noun = meta.label.toLowerCase()
    return (
      <>
        <div className="flow-panel-head">
          <span className="flow-note-ic flow-insp-ic" style={{ color: meta.tone }} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{meta.icon}</svg>
          </span>
          <span className="flow-panel-title">{meta.label}</span>
        </div>
        <div className="flow-inspect">
          <p className="flow-inspect-desc">{meta.menuDesc}</p>
          {/* OBJECTS, not raw records. A Person card offers person objects: this campaign's own
              first, then the brand library. The object is the reusable unit ("the RevOps buyer",
              carrying the contact plus the proof and message that go with them); the record is
              just its contents. Picking one pulls everything inside it into the campaign when the
              card is attached. */}
          {/* NO PICKERS ON A CARD. It carried a smart-object picker and, under that, a
              single-record picker: two ways to answer the same question, on the card that is itself
              the answer. A card now says what it INSTRUCTS, and ⌘G (or the right-click menu) is how
              it becomes a smart object — one gesture, on the board, rather than a dropdown that
              quietly swapped what the card meant.

              The linked object's contents, its promote and its delete moved with it. They belong on
              the smart object's own inspector, which is where selecting one already takes you. */}
          {/* A CARD POINTS AT A SMART OBJECT, or it carries direction. There is no third option.
              The "Or just one audience" picker is gone from every kind that HAS a smart-object
              picker: it offered the same thing one rung lower, so the panel asked the same question
              twice and a card could end up naming a record its linked object was going to ignore.

              Kept on the kinds with NO smart-object picker (message, voice, trigger, season, concept,
              data source), where it is the only way to point the card at anything. */}
          {/* NO RECORD PICKER EITHER, on any kind. A card is what it INSTRUCTS: the fields below are
              the whole of it. The picker was the last place the panel asked "which stored thing is
              this" instead of "what should the copy do", and keeping it on the handful of kinds that
              had no smart object made those kinds behave differently for no reason a user could see.

              A Data source card still reaches its data set: double-clicking one opens it, creating it
              if it does not exist yet (openDataCard). */}
          {/* DIRECTION: what this object instructs the writer to do for this campaign. One or two
              fields per kind, each landing in a named slot in every wired asset's payload. This is
              the whole point of an object: not which record it names, but what it says about it.

              Stated plainly at the top, because the two ways to make a card count — point it at a
              smart object, or fill this in — were both on the panel with nothing saying that is the
              choice, and a card left with neither reads exactly like one that is finished. */}
          {(DIRECTION_KEYS[nt.kind] ?? []).length > 0 && (() => {
            const filled = (DIRECTION_KEYS[nt.kind] ?? []).some((k) => directionValue(nt.kind, k).trim())
            if (filled || nt.smartObjectId) return null
            return (
              <div className="flow-inspect-note" style={{ marginTop: 14, marginBottom: -4 }}>
                {/* Only offer the smart object as an alternative on the kinds that HAVE one: a
                    trigger has no object picker, so telling you to use it was pointing at nothing. */}
                {nt.refId || !REF_TYPE_FOR_KIND[nt.kind]
                  ? 'Nothing here reaches the writer yet. Fill in one of these and it does.'
                  : `Pick a smart object above, or fill this in: either makes this ${noun} count for the copy.`}
              </div>
            )
          })()}
          {(DIRECTION_KEYS[nt.kind] ?? []).map((k, i) => (
            <Fragment key={k}>
              {/* The first field is now the top of the panel on every kind, since no picker sits
                  above it any more. */}
              <label className="flow-inspect-label" style={{ marginTop: i === 0 ? 0 : 14 }}>
                {DIRECTION_FIELD[k].label}
              </label>
              <textarea
                className="flow-inspect-input"
                rows={2}
                maxLength={capFor(k)}
                value={directionValue(nt.kind, k)}
                placeholder={DIRECTION_FIELD[k].hint}
                onChange={(e) => setDirectionValue(nt.kind, k, e.target.value)}
              />
            </Fragment>
          ))}
          <label className="flow-inspect-label" style={{ marginTop: 14 }}>
            {meta.role === 'markup' ? 'Note' : 'Team note'}
          </label>
          <textarea
            className="flow-inspect-input"
            rows={3}
            value={nt.text}
            placeholder={meta.role === 'markup' ? meta.placeholder : 'Not sent to the writer'}
            onChange={(e) => updateObjectText(nt.id, e.target.value)}
          />
          {/* Say plainly what this object does. These two lines are the acceptance test for the
              direction wiring: the second used to end "does not change the drafts yet". */}
          <div className="flow-inspect-note">
            {meta.role === 'markup'
              ? 'A note for your team. Nothing downstream reads it.'
              : (DIRECTION_KEYS[nt.kind] ?? []).length
                ? 'What you write above is sent to the writer for every deliverable this object is wired to. The free-text note is not.'
                : 'Board context. It names what this campaign is made from.'}
          </div>
          <button className="flow-insp-del" onClick={() => deleteObject(nt.id)}>
            Delete this object
          </button>
        </div>
      </>
    )
  }

  /** The inspector for a selected smart object: name it, see and edit what's inside, open it. */
  const renderPlacementInspector = (g: SmartPlacement) => {
    const members = g.memberIds.map((m) => objects.find((n) => n.id === m)).filter((n): n is CanvasObject => !!n)
    return (
      <>
        <div className="flow-panel-head">
          <span className="flow-note-ic flow-insp-ic" style={{ color: 'var(--accent-2)' }} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" />
            </svg>
          </span>
          <span className="flow-panel-title">{placementName(g)}</span>
        </div>
        <div className="flow-inspect">
          {/* "Bundled" only describes a MULTI-card object. Said of one card it was simply untrue, and
              it made a legitimate single-card object look like a mistake. */}
          <p className="flow-inspect-desc">
            {members.length > 1
              ? 'Several cards bundled and named, so you can reuse them instead of rebuilding them.'
              : 'A named card you can reuse instead of rebuilding it. Drag more cards in to bundle them together.'}
          </p>
          <label className="flow-inspect-label">Name</label>
          <input className="flow-inspect-input" value={placementName(g)} placeholder="Name this object…" onChange={(e) => renamePlacement(g.id, e.target.value)} />
          <label className="flow-inspect-label" style={{ marginTop: 14 }}>Inside ({members.length})</label>
          <div className="flow-obj-list">
            {members.map((m) => {
              const opts = objectOptions(m.kind)
              const linked = m.refId && opts ? opts.find((o) => o.id === m.refId)?.label : ''
              return (
                <div key={m.id} className="flow-obj-row">
                  <span className="flow-obj-row-ic" style={{ color: OBJECT_META[m.kind].tone }} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{OBJECT_META[m.kind].icon}</svg>
                  </span>
                  <span className="flow-obj-row-txt">
                    <span className="flow-obj-row-kind">{OBJECT_META[m.kind].label}</span>
                    <span className="flow-obj-row-val">{linked || m.text.trim().split('\n')[0] || 'Nothing picked yet'}</span>
                  </span>
                  <button className="flow-obj-row-out" title="Move out of this object" aria-label="Move out of this object" onClick={() => removeFromPlacement(g.id, m.id)}>✕</button>
                </div>
              )
            })}
            {members.length === 0 && <div className="flow-inspect-note" style={{ margin: 0 }}>Nothing inside. Open it and add an object, or release it.</div>}
          </div>
          <button className="flow-insp-open" onClick={() => setOpenGroupId(g.id)}>Open this smart object</button>
          {/* Two different opens, deliberately. The one above narrows THIS board to the object's
              contents and hands you a breadcrumb back; this one gives it a tab of its own, which
              survives switching campaigns, so an object can sit open beside the campaign using it. */}
          {(() => {
            const so = smartObjectFor(g)
            return so ? (
              <button className="flow-insp-open subtle" onClick={() => openObjectTab(so.id)}>Open in its own tab</button>
            ) : null
          })()}
          {/* WHERE IT LIVES, on the object's own panel. This is where you look when you select a
              smart object, so promoting it from the member card's inspector alone would have hidden
              the ladder behind a card you had no reason to click. */}
          {(() => {
            const so = smartObjectFor(g)
            if (!so) return null
            return scopeOf(so) === 'brand' ? (
              <div className="flow-inspect-note">
                In the brand library{so.campaign ? `, promoted from ${shortCampaignName(so.campaign)}` : ''}. Editing it
                changes every campaign using it, not just this one.
              </div>
            ) : (
              <>
                <div className="flow-inspect-note">Only on this campaign. Edit it freely: nothing else uses it.</div>
                <button
                  className="flow-obj-promote"
                  title="Move this into the brand library so every campaign can use it"
                  onClick={() => promoteSmartObject(so.id, brand)}
                  disabled={!brand}
                >
                  Add to the brand library
                </button>
              </>
            )
          })()}
          <button className="flow-insp-del" onClick={() => releasePlacement(g.id)}>Release</button>
          {/* Deleting the OBJECT, as opposed to releasing it back into loose cards. This lived on the
              card's inspector next to its smart-object picker; the picker is gone, so it moved to the
              object's own panel, which is where it belonged anyway. Counted across boards rather than
              described vaguely, because it reaches campaigns you cannot see from here. */}
          {(() => {
            const so = smartObjectFor(g)
            if (!so) return null
            const usedOn = flowBoards.filter((b) => b.placements.some((p) => p.smartObjectId === so.id)).length
            const armed = confirmDeleteObject === so.id
            return (
              <button
                className={`flow-obj-del${armed ? ' armed' : ''}`}
                onClick={() => {
                  if (!armed) { setConfirmDeleteObject(so.id); return }
                  setConfirmDeleteObject(null)
                  deleteSmartObject(so.id)
                  placements.filter((p) => p.smartObjectId === so.id).forEach((p) => releasePlacement(p.id))
                  setObjects((os) => os.map((o) => (o.smartObjectId === so.id ? { ...o, smartObjectId: undefined } : o)))
                }}
              >
                {armed
                  ? `Click again to delete${usedOn > 1 ? ` from all ${usedOn} campaigns` : ''}`
                  : 'Delete this smart object'}
              </button>
            )
          })()}
        </div>
      </>
    )
  }

  /**
   * A palette entry with variants: the button does the common thing, the caret opens the rest.
   * Borrowed from Figma's toolbar, and the reason the bar can offer eight motions and eleven card
   * kinds without becoming eight plus eleven icons.
   */
  const palGroup = (
    key: string,
    main: { title: string; tone: string; icon: ReactNode; onClick: () => void },
    items: { label: string; hint?: string; tone: string; icon: ReactNode; onClick: () => void }[],
  ) => (
    <span className="flow-tb-palwrap" key={key}>
      <button className="flow-tb-pal" style={{ color: main.tone }} title={main.title} onClick={main.onClick}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{main.icon}</svg>
      </button>
      <button
        className={`flow-tb-palcaret${palMenu === key ? ' on' : ''}`}
        title="More"
        aria-label={`More ${key} options`}
        aria-expanded={palMenu === key}
        onClick={() => setPalMenu((m) => (m === key ? null : key))}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {palMenu === key && (
        <>
          <div className="flow-tb-palscrim" onMouseDown={() => setPalMenu(null)} />
          <div className="flow-tb-palmenu" role="menu">
            {items.map((it) => (
              <button key={it.label} className="flow-tb-palitem" role="menuitem" onClick={() => { setPalMenu(null); it.onClick() }}>
                <span className="flow-tb-palitem-ic" style={{ color: it.tone }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
                </span>
                <span className="flow-tb-palitem-lbl">{it.label}</span>
                {it.hint && <span className="flow-tb-palitem-hint">{it.hint}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )

  // One palette icon per card kind. Keeps its PER-KIND tone: the icon is all you get at this
  // size, so hue is doing real scanning work here (the card chrome is what goes role-coloured).
  // Name and description come from the registry, so the tooltip and the card can't drift.
  const palBtn = (kind: CanvasObjectKind) => (
    <button
      key={kind}
      className="flow-tb-pal"
      style={{ color: OBJECT_META[kind].tone }}
      title={`${OBJECT_META[kind].label}. ${OBJECT_META[kind].menuDesc}.`}
      aria-label={`Add a ${OBJECT_META[kind].label.toLowerCase()} object`}
      onClick={() => addObject(kind)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{OBJECT_META[kind].icon}</svg>
    </button>
  )

  /**
   * The inspector's RESTING state: everything on the board, grouped by what each card does.
   * Shown whenever nothing is selected, in BOTH build and view mode. It used to be build-mode
   * only, with view mode falling through to the campaign brief form, so the panel showed one
   * card's fields before you had picked a card.
   */
  const renderLayers = () => (
    <>
      <div className="flow-panel-head">
        <span className="flow-panel-title">{viewing ? viewShort : name.trim() || 'Untitled campaign'}</span>
      </div>
      <div className="flow-overview">
        <div className="flow-outline-list">
          <div className="flow-outline-head">Layers</div>
          <button className={`flow-outline-row layer campaign${sel === 'campaign' ? ' on' : ''}`} onClick={() => pickOutline('campaign')}>
            <CampaignTile />
            <span className="flow-layer-txt">
              <span className="flow-layer-name">{name.trim() || (viewing ? viewShort : 'Campaign')}</span>
              <span className="flow-layer-sub">Campaign brief</span>
            </span>
          </button>
          {([
            { head: 'Gets made', rows: outputLayers },
            { head: 'Made from', rows: inputLayers },
            { head: 'Notes', rows: markupLayers },
          ] as const).map((sec) => (sec.rows.length === 0 ? null : (
            <Fragment key={sec.head}>
              <div className="flow-outline-sec">{sec.head}</div>
              {sec.rows.map((it) => (
                <button
                  key={it.id}
                  className={`flow-outline-row layer${sel === it.id ? ' on' : ''}${it.depth ? ' nested' : ''}`}
                  onClick={() => pickOutline(it.id)}
                  title={it.sub ? `${it.sub}${it.attached === false ? ', not attached to the campaign' : ''}` : undefined}
                >
                  {it.icon}
                  <span className="flow-layer-txt">
                    <span className="flow-layer-name">{it.label}</span>
                    {it.sub && <span className="flow-layer-sub">{it.sub}</span>}
                  </span>
                  {it.attached === false && <span className="flow-outline-off" title="Not attached to the campaign">unattached</span>}
                  {it.count ? <span className="flow-layer-n">{it.count}</span> : null}
                </button>
              ))}
            </Fragment>
          )))}
          {outputLayers.length === 0 && inputLayers.length === 0 && markupLayers.length === 0 && (
            <div className="flow-outline-empty">Nothing on the board yet. Add an object from the toolbar.</div>
          )}
        </div>
        <div className="flow-ov-note">Click a row to open that object. Pick the campaign to set its length and budget.</div>
      </div>
    </>
  )

  return (
    <div
      className={`flow${chatCollapsed && !flowAssetsOpen ? ' chat-collapsed' : ''}${briefCollapsed ? ' brief-collapsed' : ''}${selected.size > 1 ? ' has-multi' : ''}${hasHub ? ' has-hub' : ''}`}
    >
      <header className="flow-top">
        <div className="flow-crumb">
          <span className="flow-crumb-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 21V4h11l-1.5 3.5L16 11H5" />
            </svg>
          </span>
          {flowShareLock ? (
            <span className="flow-crumb-home" style={{ cursor: 'default' }}>Campaign</span>
          ) : (
            <button className="flow-crumb-home" onClick={() => setFlowScreen('home')} title="All campaigns">
              Campaigns
            </button>
          )}
          <span className="flow-crumb-sep">/</span>
          {flowShareLock ? (
            <span className="flow-switcher" style={{ cursor: 'default' }}>{viewing ? viewShort : name.trim() || 'Campaign'}</span>
          ) : (
            viewing || name.trim() ? (
              <button className="flow-switcher" onClick={() => setSwitcherOpen((o) => !o)}>
                {viewing ? viewShort : name.trim()}
                <span className="flow-switcher-caret">▾</span>
              </button>
            ) : (
              <span className="flow-switcher flow-switcher-flat">New campaign</span>
            )
          )}
          {/* Inside a smart object: a third crumb segment, so the way back out is where you'd look
              for it rather than only on Escape. */}
          {openPlacement && (
            <>
              <span className="flow-crumb-sep">/</span>
              <button className="flow-crumb-obj" onClick={() => setOpenGroupId(null)} title="Back to the campaign canvas">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" />
                </svg>
                {placementName(openPlacement)}
              </button>
            </>
          )}
          {!flowShareLock && switcherOpen && (
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
          {can(role, 'share') && (
            <button
              className="flow-share-btn"
              onClick={() => openShareDialog(viewName ?? undefined)}
              title={viewName ? 'Share just this flow (view-only)' : 'Share this workspace'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              Share
            </button>
          )}
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
                Open campaign
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
        {/* The canvas's left slot: the Assets library OR Gretel (mutually exclusive). Either way the
            canvas and inspector stay put — Files / Assets / Gretel are all the ONE board. */}
        {flowAssetsOpen ? (() => {
          const q = librarySearch.trim().toLowerCase()
          return (
            <aside className="flow-assets">
              <div className="flow-library-head">
                <span className="flow-library-searchic" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                </span>
                <input className="flow-library-search" placeholder="Search libraries" value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} />
                <button className="flow-library-close" title="Close panel" aria-label="Close panel" onClick={() => setFlowAssetsOpen(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15 9l-2 3 2 3" /></svg>
                </button>
              </div>
              <div className="flow-library-body">
                {/* Libraries organized by brand: one folder per brand, each holding its campaigns.
                    "New brand" starts a folder for a brand you don't have yet. */}
                {/* THIS CAMPAIGN FIRST. A campaign-scoped object exists only on the board you are
                    looking at, so burying it under a brand folder said the opposite of what scoping
                    means. Brand folders below hold the promoted ones, which every campaign can reach. */}
                {(() => {
                  const here = smartObjects
                    .filter((o) => scopeOf(o) === 'campaign' && o.campaign === boardKey)
                    .filter((o) => !q || o.name.toLowerCase().includes(q))
                    .sort((x, y) => x.name.localeCompare(y.name))
                  return (
                    <>
                      <div className="flow-lib-brandshead">
                        <span className="flow-library-secttl">
                          {viewName ? viewName.replace(`${brand} — `, '') : 'This campaign'}
                        </span>
                        <span className="flow-lib-folder-count">{here.length}</span>
                      </div>
                      {here.length === 0 ? (
                        <div className="flow-lib-folder-empty">
                          No smart objects here yet. Select cards on the canvas and press ⌘G.
                        </div>
                      ) : (
                        <div className="flow-lib-objects">{renderObjectShelf(here)}</div>
                      )}
                    </>
                  )
                })()}
                <div className="flow-lib-brandshead">
                  <span className="flow-library-secttl">Brands</span>
                  <button className="flow-lib-newbrand" onClick={() => setAddingBrand((v) => !v)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    New brand
                  </button>
                </div>
                {addingBrand && (
                  <input
                    className="flow-lib-newbrand-input"
                    autoFocus
                    placeholder="Brand name…"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); createBrandFolder() }
                      if (e.key === 'Escape') { setAddingBrand(false); setNewBrandName('') }
                    }}
                    onBlur={() => { if (!newBrandName.trim()) setAddingBrand(false) }}
                  />
                )}
                <div className="flow-lib-folders">
                  {brands.map((b) => {
                    // A brand folder holds SMART OBJECTS, nothing else. It used to also list the
                    // brand's campaigns, which made the folder a second navigation tree to work the
                    // canvas from — a duplicate of the Campaigns page and the tab strip, both of
                    // which open a campaign already. Nothing was reachable only from here.
                    const shelf = smartObjects
                      .filter((o) => o.brand === b.name && scopeOf(o) === 'brand')
                      .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.folder ?? '').toLowerCase().includes(q))
                      .sort((x, y) => x.name.localeCompare(y.name))
                    if (q && shelf.length === 0 && !b.name.toLowerCase().includes(q)) return null
                    const open = openBrandFolders.has(b.name) || !!q
                    return (
                      <div className="flow-lib-folder" key={b.name}>
                        <div className={`flow-lib-folder-head${b.name === brand ? ' current' : ''}`}>
                          <button className={`flow-lib-chev${open ? ' open' : ''}`} title={open ? 'Collapse' : 'Expand'} aria-label={open ? 'Collapse' : 'Expand'} onClick={() => toggleBrandFolder(b.name)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                          </button>
                          {/* The brand row itself opens the brand's page (basics + data sets). */}
                          <button className="flow-lib-folder-open" title={`Open ${b.name}`} onClick={() => openBrand(b.name)}>
                            <span className="flow-lib-folder-ic" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /></svg>
                            </span>
                            <span className="flow-lib-folder-name">{b.name}</span>
                            {/* Objects, not campaigns: the folder holds objects, so a campaign count
                                here described something that is no longer in it. */}
                            <span className="flow-lib-folder-count">{smartObjects.filter((o) => o.brand === b.name && scopeOf(o) === 'brand').length}</span>
                          </button>
                        </div>
                        {open && (
                          <div className="flow-lib-folder-body">
                            {shelf.length === 0 ? (
                              <div className="flow-lib-folder-empty">
                                No smart objects yet. Promote one from a campaign to share it here.
                              </div>
                            ) : (
                              <div className="flow-lib-objects">{renderObjectShelf(shelf)}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {brands.length === 0 && <div className="flow-library-empty">No brands yet. Start one above.</div>}
                </div>
              </div>
            </aside>
          )
        })() : (
        <FlowChat
          messages={chatMsgs}
          busy={chatBusy}
          flowMode={viewing ? 'view' : 'build'}
          history={flowHistory}
          collapsed={chatCollapsed}
          blank={blankCampaign}
          templates={STARTER_KEYS.flatMap((k) => {
            const p = presetByKey(k)
            return p ? [{ key: k as string, label: p.label, node: <PresetTile tone={TONE_HEX[p.tone]} channel={p.channel} /> }] : []
          })}
          onTemplate={(k) => { const p = presetByKey(k); if (p) addPreset(p) }}
          onMoreTemplates={openAddDeliverable}
          onCollapse={setChatCollapsed}
          onSend={runFlowChat}
          onApply={applyPendingChat}
          onDiscard={discardPendingChat}
          onNewChat={newFlowChat}
          onOpenHistory={openHistoryChat}
          onDeleteHistory={deleteFlowChat}
        />
        )}
        <div
          ref={canvasRef}
          className={`flow-canvas${tool === 'pan' || spaceCursor ? ' panning' : ''}${tool === 'connect' || drawing ? ' connecting' : ''}${dragObjectId ? ' obj-drop' : ''}`}
          // Drop target for a smart object dragged out of the Assets panel. dropEffect must be set
          // on EVERY dragover or the browser refuses the drop, and preventDefault on both is what
          // stops the page navigating to the drag payload instead.
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(SMART_OBJECT_DND)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(SMART_OBJECT_DND)
            setDragObjectId(null)
            if (!id) return
            e.preventDefault()
            const o = smartObjects.find((x) => x.id === id)
            const cr = canvasRef.current?.getBoundingClientRect()
            if (!o || !cr) return
            // Canvas-relative, which is the space freeSlot and pendingPlace both work in.
            placeSmartObject(o, { x: e.clientX - cr.left, y: e.clientY - cr.top })
          }}
          onContextMenu={(e) => {
            const el = (e.target as HTMLElement).closest('.flow-node[data-node-id]') as HTMLElement | null
            const id = el?.dataset.nodeId ?? null
            // Right-clicking an unselected card selects it first, so the menu acts on what you
            // clicked rather than on a stale selection somewhere else on the board.
            if (id && !selected.has(id)) {
              setSel(id)
              setSelected(new Set())
            }
            const cr = canvasRef.current?.getBoundingClientRect()
            e.preventDefault()
            setCtxMenu({ x: e.clientX - (cr?.left ?? 0), y: e.clientY - (cr?.top ?? 0), on: id })
          }}
          onMouseDown={(e) => {
            // Hand tool (or held space) pans; arrow tool drags a selection box on empty canvas.
            const t = e.target as HTMLElement
            // Connect tool: press on a card, drag to another, release to link them (drops the line
            // via the same onMouseUp that the node "+" handle uses).
            if (tool === 'connect' && !spaceHeld.current) {
              const nodeEl = t.closest('.flow-node[data-node-id]') as HTMLElement | null
              const from = nodeEl?.dataset.nodeId
              if (from) {
                const cr = e.currentTarget.getBoundingClientRect()
                drawingFrom.current = from
                setDrawing({ from, x: e.clientX - cr.left, y: e.clientY - cr.top })
              }
              return
            }
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
              // What would this land on? Anything but the card we started from.
              const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
                ?.closest('.flow-node[data-node-id]') as HTMLElement | null
              const id = over?.dataset.nodeId ?? null
              setConnectOver(id && id !== drawingFrom.current ? id : null)
            } else if (dragging.current) {
              const scale = zoom / 100
              const dx = (e.clientX - dragging.current.x) / scale
              const dy = (e.clientY - dragging.current.y) / scale
              const d = dragging.current
              dragMovedRef.current = true
              setPos((prev) => {
                const next = { ...prev }
                d.ids.forEach((i) => {
                  next[i] = { x: d.start[i].x + dx, y: d.start[i].y + dy }
                })
                return next
              })
              // Move the connectors in lockstep with the cards this same commit (rect remeasure is
              // frozen during the drag). dx/dy are the total offset from drag start, in canvas units.
              // visualIds includes carried children so their edges track without moving their pos.
              setDragDelta({ ids: d.visualIds, dx, dy })
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
              setConnectOver(null)
            } else if (drawingFrom.current) {
              const from = drawingFrom.current
              const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.flow-node[data-node-id]') as HTMLElement | null
              const to = el?.dataset.nodeId
              // Direction carries meaning: a context card flows INTO the campaign. Dropping the
              // campaign onto a card is the same statement backwards, so accept it and store it
              // the right way round rather than making the user guess which end to start from.
              const pair = to === 'campaign' ? { from, to } : from === 'campaign' && to ? { from: to, to: 'campaign' } : to ? { from, to } : null
              if (pair && pair.from !== pair.to) {
                setConnectors((c) => (c.some((x) => x.from === pair.from && x.to === pair.to) ? c : [...c, pair]))
                if (pair.to === 'campaign') attachToCampaign(pair.from)
                // A card wired to a DELIVERABLE or a POST informs just that one. The edge was already
                // drawable and already saved; nothing acted on it, so it looked connected and changed
                // nothing about the copy.
                else if (isContextNode(pair.from)) attachToTarget(pair.from, pair.to)
              }
              drawingFrom.current = null
              setDrawing(null)
              setConnectOver(null)
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
            // A drag that actually moved cards records its pre-drag layout for undo.
            if (dragging.current && dragMovedRef.current && dragSnapRef.current) {
              undoStackRef.current.push({ pos: dragSnapRef.current, rows: null })
              if (undoStackRef.current.length > 40) undoStackRef.current.shift()
              redoStackRef.current = []
            }
            dragSnapRef.current = null
            dragMovedRef.current = false
            pan.current = null
            dragging.current = null
            // Drag done: clearing dragDelta re-runs the remeasure effect to lock in final geometry.
            if (dragDelta) setDragDelta(null)
          }}
          onMouseLeave={() => {
            pan.current = null
            marqueeStart.current = null
            dragging.current = null
            drawingFrom.current = null
            addDrag.current = null
            setMarquee(null)
            setDrawing(null)
            if (dragDelta) setDragDelta(null)
          }}
        >
          <svg className="flow-edges" width="100%" height="100%">
            <defs>
              <marker id="flow-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <circle cx="5" cy="5" r="3.5" fill="var(--text-faint)" />
              </marker>
            </defs>
            {implicitConnectors.map((cn) => {
              const a = connRect(cn.from)
              const b = connRect(cn.to)
              if (!a || !b) return null
              const paid = paidCardIds.has(cn.to) || paidCardIds.has(cn.from)
              return <path key={`imp-${cn.from}-${cn.to}`} className={`flow-edge implicit${paid ? ' paid' : ''}`} d={elbowPath(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, zoom / 100)} />
            })}
            {connectors.map((cn, i) => {
              const a = connRect(cn.from)
              const b = connRect(cn.to)
              if (!a || !b) return null
              const paid = paidCardIds.has(cn.to) || paidCardIds.has(cn.from)
              const d = elbowPath(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, zoom / 100)
              return (
                <g key={`${cn.from}-${cn.to}-${i}`} className="flow-edge-g">
                  <path className={`flow-edge${paid ? ' paid' : ''}`} d={d} />
                  {/* Wide transparent hit path so the thin dotted edge is easy to click to delete. */}
                  <path className="flow-edge-hit" d={d} onClick={() => {
                    if (cn.to === 'campaign') detachFromCampaign(cn.from, connectors)
                    // Deleting the edge to a deliverable or post takes its records off those assets
                    // too, or the wire would be gone while its context kept steering the copy.
                    else if (isContextNode(cn.from)) detachFromTarget(cn.from, cn.to, connectors)
                    setConnectors((c) => c.filter((_, j) => j !== i))
                  }}>
                    <title>Click to delete this connection</title>
                  </path>
                </g>
              )
            })}
            {drawing &&
              connRect(drawing.from) &&
              (() => {
                const a = connRect(drawing.from)!
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
                          <PresetTile tone={TONE_HEX[p.tone]} channel={p.channel} />
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
          {/* The outline (a map of the campaign's contents) now lives in the inspector's
              nothing-selected state instead of a floating canvas pill. */}
          <div className={`flow-stack${viewing ? ' flow-stack-view' : ''}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom / 100})`, transformOrigin: '0 0' }}>
            {/* Campaign brief node — the board's root. Shown for an existing campaign (its real root)
                or when explicitly summoned from the toolbar's "Brief" item. Adding primitives does NOT
                bring it back — a new campaign's board stays free of an auto-inserted campaign card.
                Hideable via delete. */}
            {!briefHidden && (viewing || briefSummoned) && (
            <div
              className={`flow-node flow-tier-campaign${connectOver === 'campaign' ? ' drop-target' : ''}${sel === 'campaign' ? ' sel' : ''}${selected.has('campaign') ? ' multi' : ''}`}
              data-node-id="campaign"
              data-role="brief"
              style={{ transform: `translate(${pos['campaign']?.x ?? 0}px, ${pos['campaign']?.y ?? 0}px)` }}
              onMouseDown={(e) => startDrag(e, 'campaign')}
              onClick={(e) => clickSelect(e, 'campaign')}
            >
              <span className="flow-node-kind" style={{ color: CAMPAIGN_TONE, background: `color-mix(in srgb, ${CAMPAIGN_TONE} 16%, transparent)` }}>
                Campaign
              </span>
              {!viewing && (
                <button
                  className="flow-brief-del"
                  title="Delete the brief"
                  aria-label="Delete the brief"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setBriefHidden(true); if (sel === 'campaign') setSel(null) }}
                >
                  ✕
                </button>
              )}
              <div className="flow-node-main">
                <div className="flow-node-text">
                  <div className="flow-node-label">{viewing ? viewShort : name.trim() || 'Untitled campaign'}</div>
                  <div className="flow-node-desc">
                    {viewing ? `${viewRows.length} assets · ${viewDelivs.length} deliverable${viewDelivs.length === 1 ? '' : 's'}` : `${flightWeeks}-week campaign`}
                  </div>
                  {/* Audience, proof and goal deliberately do NOT live on this card. They are
                      canvas input cards now ("what it's made from"), and the inspector owns the
                      authoritative controls (Objective, plus Linked records). Having a third copy
                      here meant three places to set the same thing and no clear home for any of
                      them. The card states what the campaign IS; you shape it elsewhere. */}
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
              {/* The hub's own port. Everything converges here, and until now this was the one
                  card you could not connect. Drag from a context card to this, or from here to
                  one: either way round the edge is stored as card into campaign. */}
              <button
                className="flow-note-port flow-brief-port"
                title="Connect an object to this campaign"
                aria-label="Connect an object to this campaign"
                onMouseDown={(e) => startConnect(e, 'campaign')}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            )}

            {/* Freeform palette cards (audience / message / proof point / data source / note):
                absolutely positioned in the stack, dragged, selected, and connected like any node. */}
            {visibleObjects.map((nt) => {
              const meta = OBJECT_META[nt.kind]
              return (
                <div
                  key={nt.id}
                  className={`flow-node flow-note flow-note-${nt.kind}${nt.refId ? ' linked' : ''}${isAttached(nt.id) ? ' attached' : ''}${connectOver === nt.id ? ' drop-target' : ''}${sel === nt.id ? ' sel' : ''}${selected.has(nt.id) ? ' multi' : ''}`}
                  data-node-id={nt.id}
                  data-role={meta.role}
                  style={{ transform: `translate(${pos[nt.id]?.x ?? 0}px, ${pos[nt.id]?.y ?? 0}px)`, ['--note-tone']: meta.tone } as React.CSSProperties}
                  onMouseDown={(e) => startDrag(e, nt.id)}
                  onClick={(e) => clickSelect(e, nt.id)}
                  onDoubleClick={nt.kind === 'data-source' ? (e) => { e.stopPropagation(); openDataCard(nt) } : undefined}
                >
                  <div className="flow-note-head">
                    <span className="flow-note-ic" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{meta.icon}</svg>
                    </span>
                    <span className="flow-note-kind">{meta.label}</span>
                    <button className="flow-note-del" title="Delete" aria-label="Delete object" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteObject(nt.id) }}>✕</button>
                  </div>
                  {nt.kind === 'data-source' ? (
                    // A Data source links one of the brand's data sets (the spreadsheets) or a live
                    // connector; "New data set" spins up a fresh spreadsheet and links it in one step.
                    // The card previews the linked set as a mini spreadsheet; double-click opens it.
                    <>
                    <select
                      className="flow-note-sel"
                      value={nt.refId ?? ''}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          const id = addBrandDataset(brand)
                          setObjectRef(nt.id, id)
                        } else setObjectRef(nt.id, e.target.value)
                      }}
                    >
                      <option value="">Link a data source…</option>
                      {brandDatasets.length > 0 && (
                        <optgroup label="Your data sets">
                          {brandDatasets.map((d) => (
                            <option key={d.id} value={d.id}>{d.name || 'Untitled data set'}</option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Connectors">
                        {CONNECTOR_SOURCES.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </optgroup>
                      <option value="__new__">+ New data set…</option>
                    </select>
                    {(() => {
                      const linkedDs = nt.refId ? allBrandDatasets.find((d) => d.id === nt.refId) : null
                      return (
                        <div
                          className={`flow-note-mini${linkedDs ? ' linked' : ''}`}
                          title={linkedDs ? `${linkedDs.name || 'Untitled data set'} · double-click to open` : 'Link or create a data set, then double-click to open it'}
                        >
                          <MiniSheet columns={linkedDs?.columns ?? ['', '', '', '']} rows={linkedDs?.rows ?? []} bodyRows={3} />
                          <span className="flow-note-mini-label">{linkedDs ? (linkedDs.name || 'Untitled data set') : 'No data set linked yet'}</span>
                        </div>
                      )
                    })()}
                    </>
                  ) : (() => {
                    const opts = objectOptions(nt.kind)
                    if (!opts) return null
                    const noun = meta.label.toLowerCase()
                    // Naming a new record: the picker becomes a name field. Enter creates and links
                    // it, Escape backs out. Same one-step move the Data source card already had.
                    if (creatingFor === nt.id) {
                      return (
                        <input
                          className="flow-note-sel flow-note-new"
                          autoFocus
                          placeholder={`Name the new ${noun}…`}
                          value={creatingName}
                          onMouseDown={(e) => e.stopPropagation()}
                          onChange={(e) => setCreatingName(e.target.value)}
                          onBlur={() => submitCreate(nt)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); submitCreate(nt) }
                            if (e.key === 'Escape') { e.preventDefault(); setCreatingFor(null); setCreatingName('') }
                          }}
                        />
                      )
                    }
                    return (
                      <select
                        className="flow-note-sel"
                        value={nt.refId ?? ''}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (e.target.value === '__new__') { setCreatingName(''); setCreatingFor(nt.id); return }
                          setObjectRef(nt.id, e.target.value)
                          // Re-attach so a changed record reaches the campaign without redrawing the edge.
                          if (isAttached(nt.id)) attachToCampaign(nt.id)
                        }}
                      >
                        <option value="">{opts.length ? `Link ${articleFor(noun)} ${noun}…` : `No ${pluralOf(noun)} yet`}</option>
                        {opts.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                        {/* Every record-linked card can make the thing it needs. Without this a
                            fresh brand dead-ends here with nowhere to go. */}
                        {CREATABLE_KINDS.has(nt.kind) && <option value="__new__">+ New {noun}…</option>}
                      </select>
                    )
                  })()}
                  <textarea
                    className="flow-note-text"
                    value={nt.text}
                    placeholder={objectOptions(nt.kind) ? 'Add a note…' : meta.placeholder}
                    rows={2}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => updateObjectText(nt.id, e.target.value)}
                  />
                  <button className="flow-note-port" title="Draw a connection" aria-label="Draw a connection" onMouseDown={(e) => startConnect(e, nt.id)}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
              )
            })}

            {/* SMART OBJECTS. Collapsed bundles of the cards above: one card showing the name and
                what's inside. Double-click opens it (the canvas swaps to its members). Not drawn
                while you're inside one, since objects don't nest yet. */}
            {!openPlacement && placements.map((g) => {
              const members = g.memberIds.map((m) => objects.find((n) => n.id === m)).filter((n): n is CanvasObject => !!n)
              const so = smartObjectFor(g)
              const scope = so ? scopeOf(so) : 'campaign'
              return (
                <div
                  key={g.id}
                  className={`flow-node flow-note flow-note-object${isAttached(g.id) ? ' attached' : ''}${connectOver === g.id ? ' drop-target' : ''}${sel === g.id ? ' sel' : ''}${selected.has(g.id) ? ' multi' : ''}`}
                  data-node-id={g.id}
                  data-role="input"
                  data-scope={scope}
                  style={{ transform: `translate(${pos[g.id]?.x ?? 0}px, ${pos[g.id]?.y ?? 0}px)` }}
                  onMouseDown={(e) => startDrag(e, g.id)}
                  onClick={(e) => clickSelect(e, g.id)}
                  onDoubleClick={(e) => { e.stopPropagation(); setOpenGroupId(g.id) }}
                  title="Double-click to open"
                >
                  <div className="flow-note-head">
                    <span className="flow-note-ic" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="M4 12l8 4.5 8-4.5" /><path d="M4 16.5L12 21l8-4.5" />
                      </svg>
                    </span>
                    <span className="flow-note-kind">Smart object</span>
                    {/* A brand object is a LINKED copy: the chain says an edit here is an edit
                        everywhere, which is exactly the thing you want to know before you touch it.
                        A local object wears nothing, because there is nothing to warn about. */}
                    {scope === 'brand' && (
                      <span className="flow-obj-linked" title="In the brand library: editing this changes every campaign using it" aria-label="In the brand library">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                          <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
                        </svg>
                      </span>
                    )}
                    <button className="flow-note-del" title="Release" aria-label="Release" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); releasePlacement(g.id) }}>✕</button>
                  </div>
                  <input
                    className="flow-obj-name"
                    value={placementName(g)}
                    placeholder="Name this object…"
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => renamePlacement(g.id, e.target.value)}
                  />
                  {/* What's inside, at a glance: one tinted glyph per member. */}
                  <div className="flow-obj-members">
                    {members.map((m) => (
                      <span key={m.id} className="flow-obj-chip" style={{ color: OBJECT_META[m.kind].tone }} title={OBJECT_META[m.kind].label}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{OBJECT_META[m.kind].icon}</svg>
                      </span>
                    ))}
                    <span className="flow-obj-count">{members.length} inside</span>
                  </div>
                  <button className="flow-note-port" title="Draw a connection" aria-label="Draw a connection" onMouseDown={(e) => startConnect(e, g.id)}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
              )
            })}

            {/* View mode: reverse-engineered deliverables, draggable + connected like build */}
            {viewing
              ? (
                <div className="flow-vcol">
                  {viewDelivs.map((d) => {
                  const allPosts = [...d.rows].sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))
                  // Base masters render as cards; fanned variants collapse into a browsable tree
                  // (below) so a deliverable with 1,000+ variants no longer mounts 1,000 cards.
                  const posts = allPosts.filter((r) => !isVariantRow(r))
                  const variantRows = allPosts.filter((r) => isVariantRow(r))
                  return (
                    <div key={d.key}>
                      <div className="flow-link" />
                      <div
                        className="flow-branched"
                        style={{ transform: `translate(${pos[d.key]?.x ?? 0}px, ${pos[d.key]?.y ?? 0}px)`, minHeight: (posts.length > 0 || variantRows.length > 0) ? `${posts.length * 168 + (varTreeH[d.key] ?? 0) + (variantRows.length ? 40 : 0)}px` : undefined }}
                      >
                        <div
                          className={`flow-node flow-tier-deliv${connectOver === d.key ? ' drop-target' : ''}${sel === d.key ? ' sel' : ''}${selected.has(d.key) ? ' multi' : ''}`}
                          data-node-id={d.key}
                          data-role="output"
                          onMouseDown={(e) => startDrag(e, d.key)}
                          onClick={(e) => clickSelect(e, d.key)}
                        >
                          <span className="flow-node-kind" style={{ color: DELIV_TONE, background: `color-mix(in srgb, ${DELIV_TONE} 15%, transparent)` }}>
                            Deliverable
                          </span>
                          <div className="flow-node-main">
                            <div className="flow-node-text">
                              <div className="flow-node-label">{d.label}</div>
                              <div className="flow-node-desc">×{d.count}</div>
                              {/* No record tags here, for the same reason the campaign card lost
                                  its own: audience and proof are context you attach by connecting
                                  a card to the campaign. A deliverable inherits the campaign's
                                  records, and the per-deliverable OVERRIDE still lives in the
                                  inspector, where it reads as the exception it is rather than as
                                  two amber "Needs a..." prompts on every card on the board. */}
                            </div>
                          </div>
                          {/* A built deliverable IS its posts, so removing it removes them. Says
                              how many, because this is the one ✕ on the board that takes other
                              cards with it. */}
                          <button
                            className="flow-node-x is-corner"
                            title={`Delete this deliverable and its ${d.rows.length} post${d.rows.length === 1 ? '' : 's'}`}
                            aria-label={`Delete ${d.label} and its ${d.rows.length} post${d.rows.length === 1 ? '' : 's'}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); void removeRows(d.rows.map((r) => r.id)) }}
                          >
                            ✕
                          </button>
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
                                  data-role="output"
                                  style={{ transform: `translate(${pos[r.id]?.x ?? 0}px, ${pos[r.id]?.y ?? 0}px)` }}
                                  onMouseDown={(e) => startDrag(e, r.id)}
                                  onClick={(e) => clickSelect(e, r.id)}
                                >
                                  {/* Every output wears a filled kind chip; an input never does. Post
                                      cards were the one output missing theirs. */}
                                  <span className="flow-node-kind" style={{ color: POST_TONE, background: `color-mix(in srgb, ${POST_TONE} 15%, transparent)` }}>
                                    Post
                                  </span>
                                  <div className="flow-node-main">
                                    <PresetTile tone={POST_TONE} channel={r.channel as ChannelId} />
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
                                    className="flow-node-x is-corner"
                                    title="Delete this post"
                                    aria-label={`Delete post ${c.head}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); void removeRow(r.id) }}
                                  >
                                    ✕
                                  </button>
                                  <button
                                    className="flow-branch-plus"
                                    title="Add a next step from this asset"
                                    aria-label="Add a next step from this asset"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setConnectFrom(r.id)
                                      setSel(null)
                                      setBriefCollapsed(false)
                                      setPickAt(viewDelivs.length)
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                      <path d="M12 6v12M6 12h12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                          {variantRows.length > 0 && (
                            <FlowVariantTree
                              rows={variantRows}
                              tone={d.tone}
                              copy={viewPostCopy}
                              onMeasure={(h) => setVarTreeH((prev) => (prev[d.key] === h ? prev : { ...prev, [d.key]: h }))}
                            />
                          )}
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
                      <div className="flow-branched" style={{ transform: `translate(${pos[n.id]?.x ?? 0}px, ${pos[n.id]?.y ?? 0}px)`, minHeight: slots > 0 ? `${slots * 168}px` : undefined }}>
                        <div
                          className={`flow-node flow-tier-deliv${connectOver === n.id ? ' drop-target' : ''}${sel === n.id ? ' sel' : ''}${selected.has(n.id) ? ' multi' : ''}`}
                          data-node-id={n.id}
                          data-role="output"
                          onMouseDown={(e) => startDrag(e, n.id)}
                          onClick={(e) => clickSelect(e, n.id)}
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
                                  data-role="output"
                                  style={{ transform: `translate(${pos[`${n.id}:${bi}`]?.x ?? 0}px, ${pos[`${n.id}:${bi}`]?.y ?? 0}px)` }}
                                  onMouseDown={(e) => startDrag(e, `${n.id}:${bi}`)}
                                  onClick={(e) => clickSelect(e, `${n.id}:${bi}`)}
                                >
                                  {/* Matches the view-mode post chip. Uses the preset's own word so a
                                      lead magnet reads Section and a site page reads Page. */}
                                  <span className="flow-node-kind" style={{ color: POST_TONE, background: `color-mix(in srgb, ${POST_TONE} 15%, transparent)` }}>
                                    {subcardWord(p)}
                                  </span>
                                  <div className="flow-node-main">
                                    <PresetTile tone={POST_TONE} channel={p.channel} />
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
              const b = connRect(cn.to)
              if (!b) return null
              return <circle key={`d-${cn.from}-${cn.to}`} className="flow-edge-dot" cx={b.x} cy={b.y + b.h / 2} r={2.5} />
            })}
            {connectors.map((cn, i) => {
              const b = connRect(cn.to)
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
          {/* A smart object and a context card inspect the SAME WAY whether the campaign is built
              or not, so these two branches sit above the view/build split rather than once in each
              arm. They were byte-identical in both, which is a standing invitation to fix a bug in
              one copy and ship the other: adding the scope line and the promote control had to be
              checked twice for exactly that reason.

              Precedence is unchanged. Both arms tested pickAt first and then these two, so the
              `pickAt === null &&` guard keeps the deliverable picker winning when it is open. */}
          {pickAt === null && selGroup ? (
            renderPlacementInspector(selGroup)
          ) : pickAt === null && selObject ? (
            renderObjectInspector(selObject)
          ) : viewing ? (
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
                          <PresetTile tone={TONE_HEX[p.tone]} channel={p.channel} />
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
                  <PresetTile tone={CHANNELS[selPost.channel as ChannelId]?.kind === 'paid' ? TONE_HEX.gold : TONE_HEX.blue} channel={selPost.channel as ChannelId} />
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
                  {/* A card can be wired to a single POST, not just to the campaign or a deliverable.
                      Same list, same rules: what it holds reaches the writer for this one asset. */}
                  {(() => {
                    const wired = contextRowsFor(selPost.id)
                    if (!wired.length) return null
                    return (
                      <>
                        <label className="flow-inspect-label">Wired to this post only · {wired.length}</label>
                        {renderContextRows(wired, (id) => {
                          setConnectors((c) => c.filter((x) => !(x.from === id && x.to === selPost.id)))
                          detachFromTarget(id, selPost.id, connectors)
                        })}
                      </>
                    )
                  })()}
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
                  <PresetTile tone={selDeliv.tone} channel={selDeliv.channel} />
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
                  {/* The count is TYPEABLE, not just steppable. Getting from 4 to 16 was twelve
                      clicks, and the number was the one thing on this panel you could see but not
                      say. The steppers stay for a nudge of one. */}
                  <div className="flow-step">
                    <button onClick={() => void changeDelivCount(selDeliv, -1)} disabled={countBusy || selDeliv.count <= 1} aria-label="Remove one asset">−</button>
                    {countBusy ? (
                      <span>…</span>
                    ) : (
                      <input
                        className="flow-step-input"
                        // text + inputMode rather than type="number": the native spinners sat right
                        // next to the − and + that already do that job, three ways to change one
                        // number in 90px. inputMode still brings up a numeric keypad on a phone.
                        type="text"
                        inputMode="numeric"
                        value={delivCountDraft ?? selDeliv.count}
                        aria-label="Number of assets"
                        onChange={(e) => setDelivCountDraft(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          // Enter applies. No commit on blur: clicking away from a half-typed number
                          // should abandon it, not act on it.
                          if (e.key === 'Enter') { e.currentTarget.blur(); void applyDelivCount(selDeliv) }
                          if (e.key === 'Escape') { setDelivCountDraft(null); e.currentTarget.blur() }
                        }}
                      />
                    )}
                    <button onClick={() => void changeDelivCount(selDeliv, 1)} disabled={countBusy} aria-label="Add one asset">+</button>
                  </div>
                  {/* APPLY appears only when the typed number differs from what is there, so it is
                      never a button that does nothing. The steppers act immediately; a typed count
                      waits, because it can be a large change and it rewrites the copy. */}
                  {delivCountDraft !== null && Number(delivCountDraft) !== selDeliv.count && (
                    <button
                      className="flow-step-apply"
                      disabled={countBusy || regenerating}
                      onClick={() => void applyDelivCount(selDeliv)}
                    >
                      {countBusy || regenerating
                        ? 'Applying…'
                        : `Apply ${Number(delivCountDraft) > selDeliv.count ? `+${Number(delivCountDraft) - selDeliv.count}` : Number(delivCountDraft) - selDeliv.count} and rewrite the copy`}
                    </button>
                  )}
                  <div className="flow-inspect-note" style={{ marginTop: 8 }}>{countBusy ? 'Updating…' : 'The − and + add or remove one, drafting fresh copy for anything new. Type a number and Apply to change it in one go and rewrite every post from the current brief.'}</div>
                  {/* WHAT INFORMS IT, as objects. This was "Linked records" with an "Add a record"
                      row, which named the wrong unit for the same reason the campaign card did: a
                      deliverable is informed by the cards wired to the campaign, and the record list
                      showed the residue of that rather than the thing itself. Inherited by default;
                      the override, when there is one, still shows exactly what it pins. */}
                  {(() => {
                    const overridden = selDeliv.rows.some((r) => r.references && r.references.length)
                    const inherited = contextRowsFor('campaign')
                    const wired = contextRowsFor(selDeliv.key)
                    return (
                      <>
                        <label className="flow-inspect-label" style={{ marginTop: 16 }}>
                          {overridden ? 'Pinned for this deliverable' : 'Informing this deliverable'}
                          {!overridden && inherited.length > 0 ? ` · ${inherited.length}` : ''}
                        </label>
                        {overridden ? (
                          <div className="flow-ctxlist">
                            {delivEffRefs(selDeliv).map((ref) => (
                              <div key={refKey(ref)} className="flow-ctxrow">
                                <span className="flow-ctxrow-open" style={{ cursor: 'default' }}>
                                  <span className="flow-ctxrow-ic" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
                                    <RecordTypeIcon type={ref.type} />
                                  </span>
                                  <span className="flow-ctxrow-txt">
                                    <span className="flow-ctxrow-kind" style={{ color: 'var(--text-muted)' }}>{RECORD_TYPE_LABEL[ref.type]}</span>
                                    <span className="flow-ctxrow-name">{ref.label}</span>
                                  </span>
                                </span>
                                <button
                                  className="flow-ctxrow-del"
                                  title="Stop pinning this record on this deliverable"
                                  aria-label={`Remove ${ref.label}`}
                                  onClick={() => delivTagOps(selDeliv).remove(refKey(ref))}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : inherited.length === 0 && !wired.length ? (
                          <div className="flow-inspect-note" style={{ margin: '2px 0 0' }}>
                            Nothing is wired to the campaign yet, so this deliverable has no context to
                            write from. Draw a line from a card to this deliverable to give it its own.
                          </div>
                        ) : (
                          renderContextRows(inherited)
                        )}
                        {/* WIRED STRAIGHT TO THIS ONE, above and beyond the campaign's. Its own head,
                            because "this applies to this deliverable only" is the whole difference and
                            mixing the two lists would lose it. */}
                        {wired.length > 0 && (
                          <>
                            <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                              Wired to this deliverable only · {wired.length}
                            </label>
                            {renderContextRows(wired, (id) => {
                              setConnectors((c) => c.filter((x) => !(x.from === id && x.to === selDeliv.key)))
                              detachFromTarget(id, selDeliv.key, connectors)
                            })}
                          </>
                        )}
                        {/* Nothing here when it is simply inheriting. The "pin different records"
                            link is gone: wiring a card straight to this deliverable is how you give it
                            its own context now, which is the same gesture as everywhere else on the
                            board rather than a second, record-shaped mechanism reachable only from a
                            footnote. An override that already exists stays explained and reversible. */}
                        {overridden && (
                          <div className="flow-inspect-note" style={{ marginTop: 8 }}>
                            This deliverable ignores the campaign's context and uses only what is pinned
                            above.{' '}
                            <button
                              className="flow-reset-link"
                              onClick={() => { void updateRows(selDeliv.rows.map((r) => ({ id: r.id, patch: { references: undefined } }))); setRefsDirty(true) }}
                            >
                              Go back to the campaign's
                            </button>
                          </div>
                        )}
                      </>
                    )
                  })()}
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
            ) : sel !== 'campaign' ? (
              renderLayers()
            ) : (
              <>
                <div className="flow-panel-head">
                  <CampaignTile />
                  <span className="flow-panel-title">Campaign brief</span>
                </div>
                <div className="flow-inspect">
                  <label className="flow-inspect-label">Name</label>
                  <input className="flow-inspect-input" value={viewShort} readOnly title="Renaming a built flow isn't available yet" />
                  {messages.length > 0 && (
                    <>
                      <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                        Message angle
                      </label>
                      <select
                        className="flow-inspect-input flow-inspect-select"
                        value={messages.find((m) => (m.angle ?? '').trim() === viewSubjectDraft.trim())?.id ?? ''}
                        onChange={(e) => {
                          const m = messages.find((x) => x.id === e.target.value)
                          if (!m?.angle || !viewName) return
                          setViewSubjectDraft(m.angle)
                          if (m.angle.trim() !== (viewCampaign?.subject ?? '').trim()) {
                            setCampaignSubject(viewName, m.angle.trim())
                            setRefsDirty(true)
                          }
                        }}
                      >
                        <option value="">Start from a message…</option>
                        {messages.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                    Theme / angle
                  </label>
                  <textarea
                    className="flow-inspect-input"
                    rows={2}
                    value={viewSubjectDraft}
                    placeholder="What is this campaign for?"
                    onChange={(e) => setViewSubjectDraft(e.target.value)}
                    onBlur={commitViewSubject}
                  />
                  <div className="flow-inspect-note" style={{ marginTop: 4 }}>The angle every asset's copy is written to; change it, then Generate to redraft them all.</div>
                  {(() => {
                    const linked = objectives.find((o) => o.name === (viewCampaign?.objective ?? ''))
                    // A campaign stores its objective as a NAME, so a preset is recognised by matching
                    // that name back. No id to store and nothing to migrate.
                    const presetObjective = linked ? undefined : objectivePresetByName(viewCampaign?.objective)
                    return (
                      <>
                        <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                          Objective
                        </label>
                        <select
                          className="flow-inspect-input flow-inspect-select"
                          value={linked?.id ?? (presetObjective ? `preset:${presetObjective.id}` : '')}
                          onChange={(e) => {
                            if (!viewName) return
                            const v = e.target.value
                            const preset = v.startsWith('preset:') ? OBJECTIVE_PRESETS.find((p) => p.id === v.slice(7)) : undefined
                            if (preset) {
                              // A preset brings its metric with it, so choosing an objective fills the
                              // KPI too. The target stays for you to set: nobody can guess your number.
                              patchCampaign(viewName, { objective: preset.name, goalKpi: preset.kpi })
                              return
                            }
                            const o = objectives.find((x) => x.id === v)
                            patchCampaign(viewName, {
                              objective: o?.name || undefined,
                              goalKpi: o?.metric?.trim() || undefined,
                              goalTarget: o?.target ? Number(String(o.target).replace(/[^0-9.]/g, '')) || undefined : undefined,
                            })
                          }}
                        >
                          <option value="">What is this campaign for?</option>
                          {/* Presets first, because they are the answer most of the time. A brand's
                              own objective records sit under their own group: a preset is a starting
                              point, not a replacement for one somebody has defined precisely. */}
                          <optgroup label="Standard objectives">
                            {OBJECTIVE_PRESETS.map((p) => (
                              <option key={p.id} value={`preset:${p.id}`}>
                                {p.name}
                              </option>
                            ))}
                          </optgroup>
                          {objectives.length > 0 && (
                            <optgroup label={`${brand || 'This brand'}'s objectives`}>
                              {objectives.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        {presetObjective && (
                          <div className="flow-inspect-note" style={{ marginTop: 4 }}>
                            {presetObjective.hint} Measured on {presetObjective.kpi.toLowerCase()}.
                          </div>
                        )}
                        {linked && (linked.metric || linked.target) && (
                          <div className="flow-inspect-note" style={{ marginTop: 4 }}>
                            Goal: {[linked.metric, linked.target].filter(Boolean).join(' · ')}
                            {linked.timeframe ? ` · ${linked.timeframe}` : ''}
                          </div>
                        )}
                      </>
                    )
                  })()}
                  <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                    Campaign length
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
                  {renderCampaignContext()}
                  <label className="flow-inspect-label" style={{ marginTop: 20 }}>Deliverables</label>
                  <div className="flow-deliv-list">
                    {viewDelivs.map((d) => (
                      <button key={d.key} className="flow-pitem" onClick={() => setSel(d.key)}>
                        <PresetTile tone={d.tone} channel={d.channel} />
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
                        <PresetTile tone={TONE_HEX[p.tone]} channel={p.channel} />
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
                {messages.length > 0 && (
                  <>
                    <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                      Message angle
                    </label>
                    <select
                      className="flow-inspect-input flow-inspect-select"
                      value={messageId}
                      onChange={(e) => {
                        const id = e.target.value
                        setMessageId(id)
                        const m = messages.find((x) => x.id === id)
                        if (m?.angle) {
                          setSubject(m.angle)
                          lastSubjectRef.current = m.angle
                          scheduleRedraftAll()
                        }
                      }}
                    >
                      <option value="">Start from a message…</option>
                      {messages.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                  Theme / angle
                </label>
                <textarea className="flow-inspect-input" rows={2} value={subject} placeholder="What is this campaign for?" onChange={(e) => setSubject(e.target.value)} onBlur={onSubjectCommit} />
                <div className="flow-inspect-note" style={{ marginTop: 4 }}>The angle every asset's copy is written to; changing it redrafts them all.</div>
                {(
                  <>
                    <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                      Objective
                    </label>
                    <select className="flow-inspect-input flow-inspect-select" value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
                      <option value="">What is this campaign for?</option>
                      <optgroup label="Standard objectives">
                        {OBJECTIVE_PRESETS.map((p) => (
                          <option key={p.id} value={`preset:${p.id}`}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                      {objectives.length > 0 && (
                        <optgroup label={`${brand || 'This brand'}'s objectives`}>
                          {objectives.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {builderPreset && (
                      <div className="flow-inspect-note" style={{ marginTop: 4 }}>
                        {builderPreset.hint} Measured on {builderPreset.kpi.toLowerCase()}.
                      </div>
                    )}
                    {linkedObjective && (linkedObjective.metric || linkedObjective.target) && (
                      <div className="flow-inspect-note" style={{ marginTop: 4 }}>
                        Goal: {[linkedObjective.metric, linkedObjective.target].filter(Boolean).join(' · ')}
                        {linkedObjective.timeframe ? ` · ${linkedObjective.timeframe}` : ''}
                      </div>
                    )}
                  </>
                )}
                <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                  Campaign length
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
                {renderCampaignContext()}
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
                    <PresetTile tone={TONE_HEX[p.tone]} channel={p.channel} />
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
                    <PresetTile tone={TONE_HEX[p.tone]} channel={p.channel} />
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
            renderLayers()
          )}
        </aside>
        )}
      </div>

      {/* Right-click menu. Its items are the ones that only make sense on a specific target, so
          they'd be noise in the toolbar: bundle these cards, open or releasePlacement an object, delete. */}
      {/* RIGHT-CLICK ON A SHELF ROW: file it, or take it out. The drag onto a folder head does the
          same job, but a menu is the discoverable one and it is the only way to make a folder that
          does not exist yet — folders are paths on the objects, so naming one here is what creates
          it. Positioned in viewport coordinates because the panel scrolls. */}
      {shelfMenu && (() => {
        const o = smartObjects.find((x) => x.id === shelfMenu.id)
        const close = () => { setShelfMenu(null); setNamingFolderFor(null); setNewObjFolder('') }
        if (!o) return null
        // Folders already in use by this object's own shelf, so the menu offers real destinations.
        const siblings = smartObjects.filter((x) =>
          scopeOf(x) === scopeOf(o) && (scopeOf(o) === 'brand' ? x.brand === o.brand : x.campaign === o.campaign),
        )
        const folders = withAncestors(siblings.map((x) => x.folder).filter((f): f is string => !!f))
        const naming = namingFolderFor === o.id
        const commit = () => {
          const path = buildFolderPath('', newObjFolder)
          if (path) setSmartObjectFolder(o.id, path)
          close()
        }
        return (
          <>
            <div className="flow-ctx-scrim" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
            <div className="flow-ctx flow-ctx-fixed" style={{ left: shelfMenu.x, top: shelfMenu.y }} role="menu">
              <div className="flow-ctx-hint">{o.name || 'Untitled smart object'}</div>
              {folders
                .filter((f) => f !== o.folder && canNestUnder(f))
                .map((f) => (
                  <button key={f} className="flow-ctx-item" role="menuitem" onClick={() => { setSmartObjectFolder(o.id, f); close() }}>
                    Move to {folderName(f)}
                  </button>
                ))}
              {naming ? (
                <input
                  className="flow-home-folder-input"
                  autoFocus
                  placeholder={`Folder name (up to ${MAX_FOLDER_DEPTH} levels)`}
                  value={newObjFolder}
                  onChange={(e) => setNewObjFolder(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') close()
                  }}
                />
              ) : (
                <button className="flow-ctx-item" role="menuitem" onClick={() => { setNewObjFolder(''); setNamingFolderFor(o.id) }}>
                  New folder…
                </button>
              )}
              {o.folder && (
                <>
                  <div className="flow-ctx-sep" />
                  <button className="flow-ctx-item" role="menuitem" onClick={() => { setSmartObjectFolder(o.id, undefined); close() }}>
                    Take out of {folderName(o.folder)}
                  </button>
                </>
              )}
              <div className="flow-ctx-sep" />
              <button className="flow-ctx-item" role="menuitem" onClick={() => { close(); openObjectTab(o.id) }}>
                Open in its own tab<span className="flow-ctx-kbd">dbl-click</span>
              </button>
            </div>
          </>
        )
      })()}
      {ctxMenu && (() => {
        const onGroup = ctxMenu.on ? placements.find((g) => g.id === ctxMenu.on) : undefined
        const onCard = ctxMenu.on ? objects.find((n) => n.id === ctxMenu.on) : undefined
        // Built outputs: a deliverable (derived, keyed channel|type) or one post under it.
        const onDeliv = ctxMenu.on ? viewDelivs.find((d) => d.key === ctxMenu.on) : undefined
        const onPost = ctxMenu.on && !onDeliv ? viewRows.find((r) => r.id === ctxMenu.on) : undefined
        // Cards eligible to bundle: the selection if it has 2+, else nothing to group.
        const convertible = (selected.size ? [...selected] : sel ? [sel] : []).filter((id) => objects.some((n) => n.id === id) && !placementOf(id))
        const close = () => setCtxMenu(null)
        return (
          <>
            <div className="flow-ctx-scrim" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
            <div className="flow-ctx" style={{ left: ctxMenu.x, top: ctxMenu.y }} role="menu">
              {onDeliv || onPost ? (
                <button
                  className="flow-ctx-item danger"
                  role="menuitem"
                  onClick={() => { close(); void (onDeliv ? removeRows(onDeliv.rows.map((r) => r.id)) : removeRow(onPost!.id)) }}
                >
                  {onDeliv
                    ? `Delete deliverable and its ${onDeliv.rows.length} post${onDeliv.rows.length === 1 ? '' : 's'}`
                    : 'Delete post'}
                  <span className="flow-ctx-kbd">⌫</span>
                </button>
              ) : onGroup ? (
                <>
                  <button className="flow-ctx-item" role="menuitem" onClick={() => { close(); setOpenGroupId(onGroup.id) }}>
                    Open<span className="flow-ctx-kbd">dbl-click</span>
                  </button>
                  {(() => {
                    const so = smartObjectFor(onGroup)
                    return so ? (
                      <button className="flow-ctx-item" role="menuitem" onClick={() => { close(); openObjectTab(so.id) }}>
                        Open in its own tab
                      </button>
                    ) : null
                  })()}
                  <button className="flow-ctx-item" role="menuitem" onClick={() => { close(); releasePlacement(onGroup.id) }}>Release</button>
                  <div className="flow-ctx-sep" />
                  <button className="flow-ctx-item danger" role="menuitem" onClick={() => { close(); deletePlacement(onGroup.id) }}>
                    Delete object and its cards
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="flow-ctx-item"
                    role="menuitem"
                    disabled={!convertible.length}
                    title={!convertible.length ? 'Select an object first' : undefined}
                    onClick={() => { close(); convertSelection() }}
                  >
                    {convertible.length > 1 ? 'Bundle into a smart object' : 'Make a smart object'}
                    <span className="flow-ctx-kbd">⌘G</span>
                  </button>
                  {openPlacement && onCard && (
                    <button className="flow-ctx-item" role="menuitem" onClick={() => { close(); removeFromPlacement(openPlacement.id, onCard.id) }}>
                      Move out of this object
                    </button>
                  )}
                  {onCard && (
                    <>
                      <div className="flow-ctx-sep" />
                      <button className="flow-ctx-item danger" role="menuitem" onClick={() => { close(); deleteObject(onCard.id) }}>Delete object</button>
                    </>
                  )}
                  {!ctxMenu.on && !convertible.length && (
                    <div className="flow-ctx-hint">Select an object to make it a smart object.</div>
                  )}
                </>
              )}
            </div>
          </>
        )
      })()}

      <div className="flow-toolbar">
        {/* PALETTE ROW — every kind of card you can add, as icons, grouped by role and split by
            dividers. The group LABELS are gone: the dividers carry the grouping, each button's
            tooltip carries its name, and the caret menus spell out every option in words, so the
            labels were paying rent in the one place with the least room. Its own row because the
            palette will not fit beside zoom + tools + Generate when both side panels are open. */}
        <div className="flow-tb-palette">
          <button
            className="flow-tb-pal" style={{ color: CAMPAIGN_TONE }}
            title="Brief. The campaign's spec sheet." aria-label="Add the campaign brief"
            onClick={() => { setBriefHidden(false); setBriefSummoned(true); setSel('campaign'); setSelected(new Set()); setBriefCollapsed(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4h11l-1.5 3.5L16 11H5" /></svg>
          </button>
          {/* Deliverable, with the eight motions the presets already carry behind its caret. The
              button opens everything; the caret picks a motion and scopes the picker to it. */}
          {palGroup(
            'deliverable',
            {
              title: 'Deliverable. A thing you ship, on a cadence. (B)',
              tone: DELIV_TONE,
              icon: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>,
              onClick: () => { setPickGroup(null); openAddDeliverable() },
            },
            DELIVERABLE_GROUPS.map((g) => ({
              label: g.label,
              hint: `${DELIVERABLE_PRESETS.filter((p) => p.group === g.group).length}`,
              tone: g.tone,
              icon: g.icon,
              onClick: () => { setPickGroup(g.group); openAddDeliverable() },
            })),
          )}
          <span className="flow-tb-divider" />
          {/* The honest caveat the dropdown used to carry as a caption now lives in the glossary
              entry behind this tip, so it is still one hover away. */}
          <InfoTip term="canvasInput" />
          {/* One entry per family: the button drops that family's most common card, the caret
              offers the rest. Eleven kinds inline was most of why the bar had outgrown the canvas. */}
          {INPUT_FAMILIES.map((f) => {
            const kinds = kindsInFamily(f.family)
            if (!kinds.length) return null
            const lead = kinds[0]
            if (kinds.length === 1) return palBtn(lead)
            return palGroup(
              f.family,
              {
                title: `${OBJECT_META[lead].label}. ${OBJECT_META[lead].menuDesc}.`,
                tone: OBJECT_META[lead].tone,
                icon: OBJECT_META[lead].icon,
                onClick: () => addObject(lead),
              },
              kinds.map((k) => ({
                label: OBJECT_META[k].label,
                hint: OBJECT_META[k].menuDesc,
                tone: OBJECT_META[k].tone,
                icon: OBJECT_META[k].icon,
                onClick: () => addObject(k),
              })),
            )
          })}
          <span className="flow-tb-divider" />
          {palBtn('note')}
        </div>
        <div className="flow-tb-row">
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
                {/* Fit first, because it is the answer most of the time: the zoom that shows a whole
                    campaign is a different number on every board. */}
                <button
                  className="flow-tb-zoom-item"
                  onClick={() => { fitToContent(); setZoomOpen(false) }}
                >
                  Fit to board
                </button>
                <div className="flow-tb-zoom-sep" />
                {[150, 125, 100, 75, 50, 25, 10].map((z) => (
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
          <button className={`flow-tb-tool${tool === 'connect' ? ' on' : ''}`} onClick={() => setTool(tool === 'connect' ? 'select' : 'connect')} title="Link. Drag from one object to another to link them." aria-label="Link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="2.6" /><circle cx="18" cy="18" r="2.6" /><path d="M8 8l8 8" />
            </svg>
          </button>
          <button className="flow-tb-tool" onClick={organizeCards} title="Tidy layout. Arrange the objects cleanly." aria-label="Tidy layout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </button>
        </div>
        {viewing && (
          <>
            <span className="flow-tb-divider" />
            <button
              className="flow-tb-regen"
              // A flow with assets regenerates their copy (from the current selection, as before).
              // An empty flow has nothing to regenerate yet, so Generate seeds its first assets the
              // same way "Add deliverable" / the AI build does — this keeps AI-built and from-scratch
              // flows behaving identically instead of hiding the control on empty flows.
              onClick={() => (viewRows.length === 0 ? openAddDeliverable() : regenerateFlow(genIds))}
              disabled={regenerating || (viewRows.length > 0 && genIds.length === 0)}
              title={
                viewRows.length === 0
                  ? 'Pick a deliverable to generate its first copy'
                  : genIds.length
                    ? 'Generate copy for the selected card(s)'
                    : 'Select a card to generate its copy'
              }
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
              </svg>
              {regenerating ? 'Generating…' : refsDirty ? 'Generate with the new context' : 'Generate'}
            </button>
          </>
        )}
        </div>
      </div>
        </>
      )}

      {(flowView === 'grid' || flowView === 'calendar') && (
        <div className="flow-real">
          <div className="flow-real-bar">
            {!hasBuiltRows ? (
              <div className="flow-real-hint">
                This is the campaign's {flowView === 'grid' ? 'Grid' : 'Calendar'}, it shows built assets. Click "Build & write copy" to populate it, or add one yourself.
              </div>
            ) : (
              <span />
            )}
            {!flowShareLock && (
              <button className="flow-share-btn" onClick={() => void addFlowAsset()} title="Add a draft asset to this flow">
                ＋ Add asset
              </button>
            )}
          </div>
          <div className="flow-real-view">
            {flowView === 'grid' ? (
              <SheetGrid scopeClient={brand || undefined} scopeCampaign={flowCampaign} />
            ) : (
              <CalendarView scopeClient={brand || undefined} scopeCampaign={flowCampaign} onAddOnDay={flowShareLock ? undefined : (iso) => void addFlowAsset(iso)} />
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
