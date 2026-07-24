import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CHANNELS } from '../domain/channels'
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

// Most chips a record-tag row shows before collapsing the rest into a "+N" pill, so a card stays
// one clean line per category instead of clipping tags mid-word.
const TAG_CAP = 2
type RecordOptionGroup = { type: FlowRefType; label: string; items: { id: string; label: string }[] }
// A node card's record tags, grouped into card categories (Audience / Channel / Proof). Each group
// is CLICKABLE: clicking its chips (or its "Needs …" flag) opens an inline picker to add/remove the
// records for that category right on the card. `overridden` tints a deliverable whose records
// differ from the campaign's. `ops` writes to the right target (campaign brief or a deliverable).
function CardTags({ tags, overridden, ops, recordGroups, excludeGroupKeys }: {
  tags: FlowReference[]
  overridden: boolean
  ops: TagOps
  recordGroups: RecordOptionGroup[]
  /** Category keys to omit (e.g. 'audience' on the campaign brief, where a dedicated
   *  "Personalized to" selector owns the audience instead of a tag row). */
  excludeGroupKeys?: string[]
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const stop = (e: ReactMouseEvent) => e.stopPropagation()
  // Close the picker on any click outside it. A fixed-position scrim can't cover the viewport from
  // inside the zoom-transformed canvas, so listen on the document instead.
  useEffect(() => {
    if (!openKey) return
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpenKey(null) }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [openKey])
  const groups = CARD_GROUPS
    .filter((g) => !excludeGroupKeys?.includes(g.key))
    .map((g) => ({ ...g, items: tags.filter((t) => g.types.includes(t.type)) }))
    .filter((g) => g.items.length || g.required)
  if (!groups.length) return null
  return (
    <div className={`flow-node-taggroups${overridden ? ' overridden' : ''}`} title={overridden ? 'Overriding the campaign records' : undefined}>
      {groups.map((g) => {
        const missing = g.required && !g.items.length
        const open = openKey === g.key
        const optionGroups = recordGroups.filter((rg) => g.types.includes(rg.type))
        return (
          <div key={g.key} className={`flow-node-taggroup${g.required ? ' required' : ''}${missing ? ' missing' : ''}`}>
            <span className="flow-node-taggroup-ic" title={g.label} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{g.icon}</svg>
            </span>
            <div className="flow-node-taggroup-chips">
              <button
                type="button"
                className="flow-node-tagedit"
                title={`Choose ${g.label.toLowerCase()} records`}
                onMouseDown={stop}
                onClick={(e) => { stop(e); setOpenKey(open ? null : g.key) }}
              >
                {g.items.length ? (
                  <>
                    {g.items.slice(0, TAG_CAP).map((r) => (
                      <span key={`${r.type}:${r.id}`} className="flow-node-tag">{r.label}</span>
                    ))}
                    {g.items.length > TAG_CAP && (
                      <span className="flow-node-tag flow-node-tag-more">+{g.items.length - TAG_CAP}</span>
                    )}
                  </>
                ) : (
                  <span className="flow-node-tag missing-tag">Needs {g.need}</span>
                )}
              </button>
            </div>
            {open && (
                  <div className="flow-tagpick" ref={menuRef} onMouseDown={stop} onClick={stop}>
                    {optionGroups.map((rg) => (
                      <div key={rg.type} className="flow-tagpick-group">
                        <div className="flow-tagpick-head">{rg.label}</div>
                        {rg.items.length === 0 && <div className="flow-tagpick-empty">None yet</div>}
                        {rg.items.map((it) => {
                          const on = ops.has(rg.type, it.id)
                          return (
                            <button
                              key={it.id}
                              type="button"
                              className={`flow-tagpick-item${on ? ' on' : ''}`}
                              onClick={(e) => { stop(e); on ? ops.remove(`${rg.type}:${it.id}`) : ops.add(rg.type, it.id, it.label) }}
                            >
                              <span className="flow-tagpick-check" aria-hidden="true">{on ? '✓' : ''}</span>
                              <span className="flow-tagpick-lbl">{it.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
              )}
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

// Quick-start templates offered on the empty canvas: one high-signal deliverable per motion
// (email, content, social, web, paid, lead magnet). Clicking one drops that node so the canvas
// is never a blank page. Keys must exist in DELIVERABLE_PRESETS.
const STARTER_KEYS = ['newsletter', 'blog', 'ig-reel', 'landing', 'meta-video', 'ebook'] as const

// Freeform canvas cards you drop from the toolbar (a lightweight node primitive shared across the
// new types). They live in the builder's memory alongside the deliverable nodes, positioned via the
// same `pos` map and connectable through the same edge system.
type FlowNoteKind =
  | 'audience' | 'data-source' | 'channel-asset' | 'note'
  | 'proof-point' | 'goal' | 'trigger' | 'message' | 'voice' | 'company' | 'person' | 'concept' | 'season'
interface FlowNote {
  id: string
  kind: FlowNoteKind
  text: string
  /** For linked kinds (channel asset → an established channel record), the record's id. */
  refId?: string
}
const NOTE_META: Record<FlowNoteKind, { label: string; tone: string; placeholder: string; icon: React.ReactNode }> = {
  audience: {
    label: 'Audience', tone: '#4c86f0', placeholder: 'Which audience or segment?',
    icon: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M17 8a3 3 0 0 1 0 6M20.5 20a5.5 5.5 0 0 0-4-5.3" /></>,
  },
  'data-source': {
    label: 'Data source', tone: '#12a594', placeholder: 'Which input or data source?',
    icon: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>,
  },
  'channel-asset': {
    label: 'Channel asset', tone: '#c99a2e', placeholder: 'Which post or asset?',
    icon: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 15l4.5-4 3 2.5 4-4.5 5.5 6" /><circle cx="8.5" cy="9" r="1.4" /></>,
  },
  'proof-point': {
    label: 'Proof point', tone: '#30a46c', placeholder: 'Which proof point?',
    icon: <><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  },
  goal: {
    label: 'Goal', tone: '#d9a520', placeholder: 'Which goal?',
    icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  },
  trigger: {
    label: 'Trigger', tone: '#e5484d', placeholder: 'Which trigger?',
    icon: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  },
  message: {
    label: 'Message', tone: '#9b2dff', placeholder: 'Which message or angle?',
    icon: <path d="M21 11.5a7.5 7.5 0 0 1-11 6.7L4 20l1.8-4.9A7.5 7.5 0 1 1 21 11.5z" />,
  },
  voice: {
    label: 'Voice', tone: '#0ea5a5', placeholder: 'Which brand voice?',
    icon: <path d="M4 10v4M8 6.5v11M12 3v18M16 6.5v11M20 10v4" />,
  },
  company: {
    label: 'Company', tone: '#4c86f0', placeholder: 'Which company?',
    icon: <><rect x="4" y="3" width="10" height="18" rx="1.2" /><path d="M14 8.5h6V21h-6" /><path d="M7 7h4M7 11h4M7 15h4M17 12h1M17 16h1" /></>,
  },
  person: {
    label: 'Person', tone: '#6d5cff', placeholder: 'Which person?',
    icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  },
  concept: {
    label: 'Concept', tone: '#ff8c42', placeholder: 'Describe the concept…',
    icon: <><path d="M9.5 18h5M10.5 21h3" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2v.2h5v-.2c0-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" /></>,
  },
  season: {
    label: 'Season', tone: '#db6aa0', placeholder: 'A moment or season…',
    icon: <><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" /><path d="M5 19c4-2 7-5 9.5-9.5" /></>,
  },
  note: {
    label: 'Note', tone: '#9aa1ac', placeholder: 'Type a note…',
    icon: <><path d="M5 4h14v10l-5 5H5z" /><path d="M14 19v-5h5" /></>,
  },
}
let noteSeq = 0
const freshNoteId = () => `note_${++noteSeq}`
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
  const setPage = useTrafficStore((s) => s.setPage)
  const newCampaignParent = useTrafficStore((s) => s.newCampaignParent)
  const setNewCampaignParent = useTrafficStore((s) => s.setNewCampaignParent)

  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
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
  // The linked objective mapped onto the campaign's goal fields — the metric becomes the KPI and
  // the target's leading number becomes the goal target.
  const objectiveCfg = linkedObjective
    ? {
        text: linkedObjective.name,
        kpi: linkedObjective.metric?.trim() || undefined,
        target: linkedObjective.target ? Number(String(linkedObjective.target).replace(/[^0-9.]/g, '')) || undefined : undefined,
      }
    : undefined
  // Build-mode record-tag selection (Companies / People / Segments / Media mix). null =
  // not touched yet, so it defaults to all of the brand's segments.
  const [briefRefs, setBriefRefs] = useState<FlowReference[] | null>(null)
  const [nodes, setNodes] = useState<FlowDeliverable[]>([])
  // Freeform toolbar cards (brief / audience / data source / channel asset / note). Ephemeral in the
  // builder for now; positioned via `pos` and connectable like any other node.
  const [notes, setNotes] = useState<FlowNote[]>([])
  const [sel, setSel] = useState<'campaign' | string | null>('campaign')
  const [pickAt, setPickAt] = useState<number | null>(null)
  // When the deliverable picker is opened FROM an asset card (its "+"), this holds that
  // source asset's row id. The new deliverable's rows get branchOf = that asset's name, so
  // the canvas draws a journey edge from the asset to the new deliverable (asset → next step).
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const connectFromRef = useRef<string | null>(null)
  connectFromRef.current = connectFrom
  const [building, setBuilding] = useState(false)
  // The goal card's objective picker (open state), so you can link/change the goal on the card.
  const [goalPickOpen, setGoalPickOpen] = useState(false)
  const goalPickRef = useRef<HTMLDivElement>(null)
  // Build always writes copy now (the toggle was removed); kept as a constant so the
  // preview + build paths that reference it stay unchanged.
  const writeCopy = true
  const [built, setBuilt] = useState<{ name: string; count: number; copy: boolean; source: CopySource | null } | null>(null)
  // Live draft copy per deliverable node, generated when it's added (and on redraft).
  // Ephemeral UI state: never seeded into rows or localStorage until you Build.
  const [preview, setPreview] = useState<Record<string, { loading: boolean; source: CopySource | null; posts: { headline: string; primary: string; components: { key: string; label: string; value: string }[] }[] }>>({})
  // How the flow-in-progress is shown: the canvas, or a grid / calendar of its assets.
  // View + Crumbot-collapse live in the store so the campaign icon rail (Files / Assets / Crumbot)
  // in HomeShell can drive and reflect them.
  const flowView = useTrafficStore((s) => s.flowView)
  const setFlowView = useTrafficStore((s) => s.setFlowView)
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
  // The campaign brief is the board's root, rendered unconditionally. Deleting it hides the card
  // (the campaign data stays); "Brief" in the Add menu brings it back. Reset on entering a campaign.
  const [briefHidden, setBriefHidden] = useState(false)
  // The empty-canvas starter prompt: what the user types before a campaign has any shape. Submitting
  // opens Crumbot and hands it the brief (its discovery/build flow takes over from there).
  const [starterText, setStarterText] = useState('')
  // Dismissing the starter card reveals the bare canvas (build by hand via the toolbar or Crumbot).
  // Reset on startNew so a fresh campaign always offers it again.
  const [starterDismissed, setStarterDismissed] = useState(false)
  // Where the starter card sits (canvas-local px). null = its default docked spot on the left.
  const [starterPos, setStarterPos] = useState<{ x: number; y: number } | null>(null)
  // Search box on the Assets brand-library view.
  const [librarySearch, setLibrarySearch] = useState('')
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
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addWrapRef = useRef<HTMLDivElement>(null)
  // Close the Add menu on any click outside it (a scrim gets trapped in the toolbar's stacking
  // context, so canvas clicks miss it).
  useEffect(() => {
    if (!addMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!addWrapRef.current?.contains(e.target as Node)) setAddMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [addMenuOpen])
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
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // Delete / Backspace removes the selected card(s) — deliverable or freeform note. The campaign
      // brief is the board's root, so it's never deleted this way.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selectedRef.current.size ? [...selectedRef.current] : selRef.current ? [selRef.current] : []
        if (ids.length) {
          e.preventDefault()
          ids.forEach((id) => {
            if (id === 'campaign') setBriefHidden(true)
            else if (notesRef.current.some((nt) => nt.id === id)) deleteNote(id)
            else if (nodesRef.current.some((n) => n.id === id)) removeNode(id)
          })
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
  // Fresh refs for the Delete/Backspace shortcut, whose keydown listener is bound less often than
  // these change.
  const notesRef = useRef(notes)
  notesRef.current = notes
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
  // The Goal card's lightweight readiness read: does this flow plausibly support its goal? A
  // heuristic (not a forecast) over asset volume, channel spread, paid coverage and budget vs the
  // goal type — enough to eyeball "will brief → deliverables → goal actually get there?".
  const goalRead = useMemo(() => {
    const objective = viewCampaign?.objective?.trim() || ''
    const kpi = viewCampaign?.goalKpi?.trim() || ''
    const target = viewCampaign?.goalTarget
    const text = `${objective} ${kpi}`.toLowerCase()
    const conversionGoal = /convert|conversion|sign\s?up|signup|\blead|revenue|\bsale|mql|sql|demo|trial|purchas|subscrib|\bbook/.test(text)
    const assets = viewRows.length
    const channels = new Set(viewRows.map((r) => r.channel)).size
    const hasPaid = viewPaidRows.length > 0
    const budget = viewCampaign?.overallBudget ?? 0
    let level: 'red' | 'amber' | 'green' = 'green'
    let why = ''
    if (!objective) { level = 'amber'; why = 'No goal linked yet — link an objective to judge fit.' }
    else if (assets === 0) { level = 'red'; why = 'No assets yet — add a deliverable and generate its copy.' }
    else if (conversionGoal && !hasPaid) { level = 'amber'; why = 'Conversion goal, but no paid media to drive the volume — add a paid channel.' }
    else if (budget > 0 && !hasPaid) { level = 'amber'; why = `$${budget.toLocaleString()} budget set, but no paid placement to spend it on.` }
    else if (channels < 2) { level = 'amber'; why = `Only ${channels} channel — diversify to reach the goal more reliably.` }
    else { level = 'green'; why = `Good coverage: ${assets} assets across ${channels} channels${hasPaid ? ', incl. paid' : ''}.` }
    return { objective, kpi, target, level, why }
  }, [viewCampaign, viewRows, viewPaidRows])
  // Link (or clear) the flow's goal from the goal card: write the objective's name + KPI + target
  // onto the campaign, exactly like the brief's Objective select does.
  const linkObjective = (o: (typeof objectives)[number] | null) => {
    if (!viewName) return
    patchCampaign(viewName, {
      objective: o?.name || undefined,
      goalKpi: o?.metric?.trim() || undefined,
      goalTarget: o?.target ? Number(String(o.target).replace(/[^0-9.]/g, '')) || undefined : undefined,
    })
    setGoalPickOpen(false)
  }
  // Close the goal picker on any outside click (a fixed scrim can't cover the zoomed canvas).
  useEffect(() => {
    if (!goalPickOpen) return
    const onDown = (e: MouseEvent) => { if (!goalPickRef.current?.contains(e.target as Node)) setGoalPickOpen(false) }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [goalPickOpen])
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
  // The one audience this campaign is personalized to = its single segment reference (segments ARE
  // the brand's audiences). Surfaced as a prominent brief field, not a tag chip: picking one replaces
  // any other segment refs so a campaign personalizes to exactly one audience. Generation already
  // writes to the segment refs, so this drives it with no extra wiring. In build mode an untouched
  // brief (null) reads as "not chosen yet" rather than the all-segments default.
  const chosenSegmentRefs = (viewName !== null ? flowRefs : briefRefs ?? []).filter((r) => r.type === 'segment')
  // Resolve the picked segment to a brand audience by id OR name — a ref created by the fan-out (or an
  // older store) can carry a different id than the current clientAudiences record, so match on the
  // label too, else the selector reads "Choose an audience" for a campaign that clearly has one.
  const currentAudience =
    chosenSegmentRefs.length === 1
      ? brandSegments.find((a) => a.id === chosenSegmentRefs[0].id || a.name === chosenSegmentRefs[0].label)
      : undefined
  const personalizedAudienceId = currentAudience?.id ?? ''
  const setPersonalizedAudience = (segId: string) => {
    const seg = brandSegments.find((a) => a.id === segId)
    const base = viewName !== null ? flowRefs : briefRefs ?? []
    const nonSeg = base.filter((r) => r.type !== 'segment')
    const next = seg ? [...nonSeg, { type: 'segment' as FlowRefType, id: seg.id, label: seg.name }] : nonSeg
    if (viewName !== null) {
      setCampaignReferences(viewName, next)
      setRefsDirty(true)
    } else {
      commitBriefRefs(next)
    }
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
      <div className="flow-inspect-label" style={{ marginTop: 16 }}>
        Linked records{ops.refs.length ? ` · ${ops.refs.length}` : ''}
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
  // Empty-canvas starter: hand the typed brief to Crumbot, which runs its discovery/build flow.
  // Opening the assistant is the whole point, so the conversation continues in one place.
  const submitStarter = () => {
    const t = starterText.trim()
    if (!t) return
    setStarterText('')
    setChatCollapsed(false)
    void runFlowChat(t, 'build')
  }
  // Drag the starter card around the canvas. Grabs from the card body only — its inputs, buttons,
  // and chips keep working. Position is canvas-local px; the card is an overlay, so it doesn't
  // pan/zoom with the stack (like the outline and toolbar).
  const onStarterDragStart = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('textarea, button, input, select')) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const cardRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cr = canvasRef.current?.getBoundingClientRect()
    const baseX = cardRect.left - (cr?.left ?? 0)
    const baseY = cardRect.top - (cr?.top ?? 0)
    const onMove = (ev: MouseEvent) => setStarterPos({ x: baseX + (ev.clientX - startX), y: baseY + (ev.clientY - startY) })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  // Drop a freeform card from the toolbar. Cascades to the right of the campaign column so repeated
  // adds don't stack exactly on top of each other; the user drags it wherever from there.
  const addNote = (kind: FlowNoteKind) => {
    const id = freshNoteId()
    const i = notes.length
    setNotes((n) => [...n, { id, kind, text: '' }])
    setPos((p) => ({ ...p, [id]: { x: 300 + (i % 3) * 28, y: 120 + i * 34 } }))
    setSel(id)
    setSelected(new Set([id]))
  }
  const deleteNote = (id: string) => {
    setNotes((n) => n.filter((x) => x.id !== id))
    setConnectors((c) => c.filter((e) => e.from !== id && e.to !== id))
    setPos((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
    if (sel === id) setSel(null)
  }
  const updateNoteText = (id: string, text: string) => setNotes((n) => n.map((x) => (x.id === id ? { ...x, text } : x)))
  const setNoteRef = (id: string, refId: string) => setNotes((n) => n.map((x) => (x.id === id ? { ...x, refId: refId || undefined } : x)))
  // Linked kinds pick from an established record; freeform kinds (note, concept, season) return null.
  const named = <T extends { id: string; name: string }>(list: T[]) => list.map((r) => ({ id: r.id, label: r.name || 'Untitled' }))
  const noteOptions = (kind: FlowNoteKind): { id: string; label: string }[] | null => {
    switch (kind) {
      case 'channel-asset': return channelRecords.map((c) => ({ id: c.id, label: c.name || 'Untitled channel' }))
      case 'audience': return brandSegments.map((a) => ({ id: a.id, label: a.name || 'Untitled audience' }))
      case 'data-source': return CONNECTOR_SOURCES
      case 'proof-point': return brandProof.map((r) => ({ id: r.id, label: r.label || 'Untitled proof point' }))
      case 'company': return named(companies)
      case 'person': return named(people)
      case 'goal': return named(objectives)
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
    setViewName(null)
    setBuilt(null)
    setNodes([])
    setNotes([])
    setBriefHidden(false)
    setPreview({})
    setName('')
    setSubject('')
    setBudget('')
    setStrategyKey(undefined)
    setObjectiveId('')
    setMessageId('')
    setBriefRefs(null)
    lastSubjectRef.current = ''
    setSel('campaign')
    setPickAt(null)
    setCampaignFilter('all')
    setStarterText('')
    setStarterDismissed(false)
    setStarterPos(null)
  }
  const openView = (n: string) => {
    setViewName(n)
    setBuilt(null)
    setPickAt(null)
    setSel('campaign')
    setBriefHidden(false)
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
  }, [nodes, pos, offset, zoom, selected, connectors, viewName, chatCollapsed, briefCollapsed, dragDelta, viewDelivs, varTreeH])

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
  const applyFlowCommands = async (cmds: FlowCommand[]): Promise<string[]> => {
    const applied: string[] = []
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

  // The outline (campaign + its deliverables) — a map of the board's contents, shown in the
  // inspector's nothing-selected state. Clicking a row selects that node.
  const outlineItems = viewing
    ? viewDelivs.map((d) => ({ id: d.key, label: d.label, count: d.count }))
    : nodes.map((n) => {
        const p = presetByKey(n.presetKey)
        return { id: n.id, label: p?.label ?? 'Deliverable', count: p ? subcardCount(p, n.perMonth) : 0 }
      })
  const pickOutline = (id: string) => {
    setSel(id === 'campaign' ? 'campaign' : id)
    setSelected(id === 'campaign' ? new Set() : new Set([id]))
    setBriefCollapsed(false)
  }
  // One Add-menu row for a freeform/record card kind (uses NOTE_META for the icon, tone, and label).
  const noteMenuBtn = (kind: FlowNoteKind, desc: string) => (
    <button key={kind} className="flow-tb-add-item" role="menuitem" onClick={() => { setAddMenuOpen(false); addNote(kind) }}>
      <span className="flow-tb-add-ic" style={{ color: NOTE_META[kind].tone }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{NOTE_META[kind].icon}</svg>
      </span>
      <span className="flow-tb-add-txt"><span className="flow-tb-add-name">{NOTE_META[kind].label}</span><span className="flow-tb-add-desc">{desc}</span></span>
    </button>
  )

  return (
    <div className={`flow${chatCollapsed ? ' chat-collapsed' : ''}${briefCollapsed ? ' brief-collapsed' : ''}${selected.size > 1 ? ' has-multi' : ''}`}>
      <header className="flow-top">
        <div className="flow-crumb">
          <span className="flow-crumb-ic" aria-hidden="true">
            ⋔
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
            <button className="flow-switcher" onClick={() => setSwitcherOpen((o) => !o)}>
              {viewing ? viewShort : name.trim() || 'New campaign'}
              <span className="flow-switcher-caret">▾</span>
            </button>
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
          className={`flow-canvas${tool === 'pan' || spaceCursor ? ' panning' : ''}${tool === 'connect' ? ' connecting' : ''}`}
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
                  <path className="flow-edge-hit" d={d} onClick={() => setConnectors((c) => c.filter((_, j) => j !== i))}>
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
          {/* Empty-canvas starter: the front door before a campaign has any shape. Describe it to
              Crumbot, or drop a template deliverable. Sits OUTSIDE the transformed stack so it stays
              centered while the canvas pans/zooms, and yields the moment a chat or a node exists. */}
          {!viewing && !building && !starterDismissed && nodes.length === 0 && chatMsgs.length === 0 && (
            <div
              className="flow-starter"
              onMouseDown={onStarterDragStart}
              style={starterPos ? { left: starterPos.x, top: starterPos.y, transform: 'none' } : undefined}
            >
              <button className="flow-starter-close" title="Dismiss" aria-label="Dismiss" onClick={() => setStarterDismissed(true)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
              <div className="flow-starter-eyebrow">New campaign</div>
              <h2 className="flow-starter-title">What are you launching?</h2>
              <p className="flow-starter-sub">Describe it and Crumbot drafts the plan, audiences, and copy. Nothing sends until you say so.</p>
              <div className="flow-starter-prompt">
                <textarea
                  className="flow-starter-input"
                  rows={4}
                  placeholder="A spring launch for our new onboarding flow, aimed at RevOps leads…"
                  value={starterText}
                  onChange={(e) => setStarterText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submitStarter() }
                  }}
                />
                <button className="flow-starter-go" onClick={submitStarter} disabled={!starterText.trim()}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5z" /></svg>
                  Draft with Crumbot
                  <span className="flow-starter-kbd">⌘↵</span>
                </button>
              </div>
              <div className="flow-starter-or"><span>or start from a template</span></div>
              <div className="flow-starter-chips">
                {STARTER_KEYS.map((k) => {
                  const p = presetByKey(k)
                  if (!p) return null
                  return (
                    <button key={k} className="flow-starter-chip" onClick={() => addPreset(p)}>
                      <PresetTile tone={TONE_HEX[p.tone]} channel={p.channel} />
                      <span>{p.label}</span>
                    </button>
                  )
                })}
                <button className="flow-starter-chip flow-starter-chip-more" onClick={openAddDeliverable}>
                  <span className="flow-starter-more-ic" aria-hidden="true">+</span>
                  <span>Browse all</span>
                </button>
              </div>
            </div>
          )}
          <div className={`flow-stack${viewing ? ' flow-stack-view' : ''}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom / 100})`, transformOrigin: '0 0' }}>
            {/* Campaign brief node — the board's root. Hideable via delete; "Brief" restores it. */}
            {!briefHidden && (
            <div
              className={`flow-node flow-tier-campaign${sel === 'campaign' ? ' sel' : ''}${selected.has('campaign') ? ' multi' : ''}`}
              data-node-id="campaign"
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
                  title="Delete the brief card"
                  aria-label="Delete the brief card"
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
                    {viewing ? `${viewRows.length} assets · ${viewDelivs.length} deliverable${viewDelivs.length === 1 ? '' : 's'}` : `${flightWeeks}-week flight`}
                  </div>
                  {/* Personalized to: the one audience this campaign is written for. Its own field, not
                      a tag, so it reads as the campaign's target; drives which segment generation writes to. */}
                  <label
                    className="flow-audience"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="flow-audience-lbl">Personalized to</span>
                    {brandSegments.length ? (
                      <select
                        className="flow-audience-sel"
                        value={personalizedAudienceId}
                        onChange={(e) => setPersonalizedAudience(e.target.value)}
                      >
                        <option value="">Choose an audience…</option>
                        {brandSegments.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button className="flow-audience-add" onClick={() => setPage('segments')}>
                        Add an audience first
                      </button>
                    )}
                  </label>
                  <CardTags tags={viewing ? flowRefs : briefRefsEffective} excludeGroupKeys={['audience']} overridden={false} ops={campaignTagOps} recordGroups={recordGroups} />
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
              {/* Goal: a tiny card tucked just under the brief so it reads as attached to it —
                  the flow's north-star plus a red/amber/green read on whether it'll get there. */}
              {viewing && (
                <div className="flow-goal-card" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <div className="flow-goal-head">
                    <span className="flow-goal-eyebrow">Goal</span>
                    <span className={`flow-goal-dot lvl-${goalRead.level}`} title={goalRead.why} aria-hidden="true" />
                  </div>
                  <button type="button" className="flow-goal-tagbtn" title="Choose the goal for this flow" onClick={() => setGoalPickOpen((o) => !o)}>
                    <span className={`flow-node-tag flow-goal-tag${goalRead.objective ? '' : ' missing-tag'}`}>{goalRead.objective || 'Needs a goal'}</span>
                  </button>
                  {goalRead.objective && (goalRead.kpi || goalRead.target != null) && (
                    <div className="flow-goal-meta">
                      {[goalRead.kpi, goalRead.target != null ? `Target ${goalRead.target.toLocaleString()}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="flow-goal-why">{goalRead.why}</div>
                  {goalPickOpen && (
                      <div className="flow-tagpick flow-goal-pick" ref={goalPickRef} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <div className="flow-tagpick-group">
                          <div className="flow-tagpick-head">Objectives</div>
                          {objectives.length === 0 && <div className="flow-tagpick-empty">No objectives yet</div>}
                          {objectives.map((o) => {
                            const on = o.name === goalRead.objective
                            return (
                              <button key={o.id} type="button" className={`flow-tagpick-item${on ? ' on' : ''}`} onClick={() => linkObjective(o)}>
                                <span className="flow-tagpick-check" aria-hidden="true">{on ? '✓' : ''}</span>
                                <span className="flow-tagpick-lbl">{o.name}</span>
                              </button>
                            )
                          })}
                          {goalRead.objective && (
                            <button type="button" className="flow-tagpick-item flow-tagpick-clear" onClick={() => linkObjective(null)}>
                              <span className="flow-tagpick-check" aria-hidden="true" />
                              <span className="flow-tagpick-lbl">Clear goal</span>
                            </button>
                          )}
                        </div>
                      </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Freeform toolbar cards (brief / audience / data source / channel asset / note):
                absolutely positioned in the stack, dragged, selected, and connected like any node. */}
            {notes.map((nt) => {
              const meta = NOTE_META[nt.kind]
              return (
                <div
                  key={nt.id}
                  className={`flow-node flow-note flow-note-${nt.kind}${sel === nt.id ? ' sel' : ''}${selected.has(nt.id) ? ' multi' : ''}`}
                  data-node-id={nt.id}
                  style={{ transform: `translate(${pos[nt.id]?.x ?? 0}px, ${pos[nt.id]?.y ?? 0}px)`, ['--note-tone']: meta.tone } as React.CSSProperties}
                  onMouseDown={(e) => startDrag(e, nt.id)}
                  onClick={(e) => clickSelect(e, nt.id)}
                >
                  <div className="flow-note-head">
                    <span className="flow-note-ic" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{meta.icon}</svg>
                    </span>
                    <span className="flow-note-kind">{meta.label}</span>
                    <button className="flow-note-del" title="Delete" aria-label="Delete card" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteNote(nt.id) }}>✕</button>
                  </div>
                  {(() => {
                    const opts = noteOptions(nt.kind)
                    if (!opts) return null
                    const noun = meta.label.toLowerCase()
                    return (
                      <select
                        className="flow-note-sel"
                        value={nt.refId ?? ''}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => setNoteRef(nt.id, e.target.value)}
                      >
                        <option value="">{opts.length ? `Link a ${noun}…` : `No ${noun}s established yet`}</option>
                        {opts.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    )
                  })()}
                  <textarea
                    className="flow-note-text"
                    value={nt.text}
                    placeholder={noteOptions(nt.kind) ? 'Add a note…' : meta.placeholder}
                    rows={2}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => updateNoteText(nt.id, e.target.value)}
                  />
                  <button className="flow-note-port" title="Draw a connection" aria-label="Draw a connection" onMouseDown={(e) => startConnect(e, nt.id)}>
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
                          className={`flow-node flow-tier-deliv${sel === d.key ? ' sel' : ''}${selected.has(d.key) ? ' multi' : ''}`}
                          data-node-id={d.key}
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
                              <CardTags tags={delivEffRefs(d)} overridden={d.rows.some((r) => r.references && r.references.length)} ops={delivTagOps(d)} recordGroups={recordGroups} />
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
                                  onClick={(e) => clickSelect(e, r.id)}
                                >
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
                          className={`flow-node flow-tier-deliv${sel === n.id ? ' sel' : ''}${selected.has(n.id) ? ' multi' : ''}`}
                          data-node-id={n.id}
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
                                  style={{ transform: `translate(${pos[`${n.id}:${bi}`]?.x ?? 0}px, ${pos[`${n.id}:${bi}`]?.y ?? 0}px)` }}
                                  onMouseDown={(e) => startDrag(e, `${n.id}:${bi}`)}
                                  onClick={(e) => clickSelect(e, `${n.id}:${bi}`)}
                                >
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
                      'Inherited from the campaign. Edit to target different records for just this deliverable, then Generate.'
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
                  {objectives.length > 0 && (() => {
                    const linked = objectives.find((o) => o.name === (viewCampaign?.objective ?? ''))
                    return (
                      <>
                        <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                          Objective
                        </label>
                        <select
                          className="flow-inspect-input flow-inspect-select"
                          value={linked?.id ?? ''}
                          onChange={(e) => {
                            const o = objectives.find((x) => x.id === e.target.value)
                            if (!viewName) return
                            patchCampaign(viewName, {
                              objective: o?.name || undefined,
                              goalKpi: o?.metric?.trim() || undefined,
                              goalTarget: o?.target ? Number(String(o.target).replace(/[^0-9.]/g, '')) || undefined : undefined,
                            })
                          }}
                        >
                          <option value="">Link an objective…</option>
                          {objectives.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
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
                {objectives.length > 0 && (
                  <>
                    <label className="flow-inspect-label" style={{ marginTop: 14 }}>
                      Objective
                    </label>
                    <select className="flow-inspect-input flow-inspect-select" value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
                      <option value="">Link an objective…</option>
                      {objectives.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    {linkedObjective && (linkedObjective.metric || linkedObjective.target) && (
                      <div className="flow-inspect-note" style={{ marginTop: 4 }}>
                        Goal: {[linkedObjective.metric, linkedObjective.target].filter(Boolean).join(' · ')}
                        {linkedObjective.timeframe ? ` · ${linkedObjective.timeframe}` : ''}
                      </div>
                    )}
                  </>
                )}
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
            <>
              <div className="flow-panel-head">
                <span className="flow-panel-title">{name.trim() || 'Untitled campaign'}</span>
              </div>
              <div className="flow-overview">
                <div className="flow-ov-note">Pick the campaign brief to set audiences and flight, or add deliverables. When it looks right, build it into a real draft campaign.</div>
                {/* Outline: the board's contents (campaign + its deliverables). Click a row to open it. */}
                <div className="flow-outline-list">
                  <div className="flow-outline-head">Outline</div>
                  <button className={`flow-outline-row campaign${sel === 'campaign' ? ' on' : ''}`} onClick={() => pickOutline('campaign')}>
                    <span className="flow-outline-label">{name.trim() || (viewing ? viewShort : 'Campaign')}</span>
                  </button>
                  {outlineItems.length === 0 ? (
                    <div className="flow-outline-empty">No deliverables yet.</div>
                  ) : (
                    outlineItems.map((it) => (
                      <button key={it.id} className={`flow-outline-row${sel === it.id ? ' on' : ''}`} onClick={() => pickOutline(it.id)}>
                        <span className="flow-outline-label">{it.label}</span>
                        {it.count > 0 && <span className="flow-outline-n">{it.count}</span>}
                      </button>
                    ))
                  )}
                </div>
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
          <button className={`flow-tb-tool${tool === 'connect' ? ' on' : ''}`} onClick={() => setTool(tool === 'connect' ? 'select' : 'connect')} title="Connect — drag from one card to another to link them" aria-label="Connect">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="2.6" /><circle cx="18" cy="18" r="2.6" /><path d="M8 8l8 8" />
            </svg>
          </button>
          <button className="flow-tb-tool" onClick={organizeCards} title="Tidy layout — arrange the cards cleanly" aria-label="Tidy layout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </button>
        </div>
        <span className="flow-tb-divider" />
        <div className="flow-tb-addwrap" ref={addWrapRef}>
          <button className="flow-tb-add" onClick={() => setAddMenuOpen((o) => !o)} disabled={addingDeliv}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            Add
            <span className="flow-tb-caret" aria-hidden="true">▾</span>
          </button>
          {addMenuOpen && (
            <>
              <div className="flow-tb-add-menu" role="menu">
                <div className="flow-tb-add-sec">Structure</div>
                <button className="flow-tb-add-item" role="menuitem" onClick={() => { setAddMenuOpen(false); setBriefHidden(false); setSel('campaign'); setSelected(new Set()); setBriefCollapsed(false) }}>
                  <span className="flow-tb-add-ic" style={{ color: CAMPAIGN_TONE }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4h11l-1.5 3.5L16 11H5" /></svg></span>
                  <span className="flow-tb-add-txt"><span className="flow-tb-add-name">Brief</span><span className="flow-tb-add-desc">The board&rsquo;s root</span></span>
                </button>
                <button className="flow-tb-add-item" role="menuitem" onClick={() => { setAddMenuOpen(false); openAddDeliverable() }} disabled={addingDeliv}>
                  <span className="flow-tb-add-ic" style={{ color: CAMPAIGN_TONE }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></svg></span>
                  <span className="flow-tb-add-txt"><span className="flow-tb-add-name">Deliverable</span><span className="flow-tb-add-desc">The workhorse node <span className="flow-tb-add-kbd">B</span></span></span>
                </button>
                {noteMenuBtn('channel-asset', 'A last-mile post')}
                <button className="flow-tb-add-item" role="menuitem" onClick={() => { setAddMenuOpen(false); setTool('connect') }}>
                  <span className="flow-tb-add-ic" style={{ color: 'var(--text-muted)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.6" /><circle cx="18" cy="18" r="2.6" /><path d="M8 8l8 8" /></svg></span>
                  <span className="flow-tb-add-txt"><span className="flow-tb-add-name">Connector</span><span className="flow-tb-add-desc">Link two cards</span></span>
                </button>
                <div className="flow-tb-add-sec">Audience &amp; data</div>
                {noteMenuBtn('audience', 'Your fan-out axis')}
                {noteMenuBtn('data-source', 'An input you plug in')}
                {noteMenuBtn('company', 'An account')}
                {noteMenuBtn('person', 'A contact')}
                <div className="flow-tb-add-sec">Strategy</div>
                {noteMenuBtn('message', 'The angle copy is written to')}
                {noteMenuBtn('goal', 'A north-star objective')}
                {noteMenuBtn('trigger', 'What fires an action')}
                {noteMenuBtn('proof-point', 'Evidence to back it up')}
                {noteMenuBtn('voice', 'How it should sound')}
                <div className="flow-tb-add-sec">Freeform</div>
                {noteMenuBtn('concept', 'The big idea')}
                {noteMenuBtn('season', 'A moment to hit')}
                {noteMenuBtn('note', 'A sticky note')}
              </div>
            </>
          )}
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
              {regenerating ? 'Generating…' : refsDirty ? 'Generate with records' : 'Generate'}
            </button>
          </>
        )}
      </div>
        </>
      )}

      {flowView === 'library' && (() => {
        const q = librarySearch.trim().toLowerCase()
        const libs = brandCampaigns.filter((c) => !q || c.name.toLowerCase().includes(q))
        return (
          <div className="flow-library">
            <div className="flow-library-panel">
              <div className="flow-library-head">
                <span className="flow-library-searchic" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                </span>
                <input className="flow-library-search" placeholder="Search all libraries" value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} />
              </div>
              <div className="flow-library-body">
                <div className="flow-library-secttl">All libraries</div>
                {libs.length === 0 ? (
                  <div className="flow-library-empty">{q ? 'No libraries match your search.' : 'No campaigns for this brand yet. Build one to fill your library.'}</div>
                ) : (
                  <div className="flow-library-list">
                    {libs.map((lib) => (
                      <button key={lib.name} className="flow-library-item" onClick={() => { openView(lib.name); setFlowView('flow') }}>
                        <span className="flow-library-ic" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /></svg>
                        </span>
                        <span className="flow-library-txt">
                          <span className="flow-library-name">{lib.name.replace(`${brand} — `, '')}</span>
                          <span className="flow-library-count">{lib.count} asset{lib.count === 1 ? '' : 's'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
