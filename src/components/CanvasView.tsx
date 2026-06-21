import { useMemo, useRef, useState } from 'react'
import { applyBreakStatus, detectBreaks, type CoherenceBreak } from '../domain/breaks'
import { CHANNELS } from '../domain/channels'
import { FUNNEL_STAGES, funnelStageFor } from '../domain/funnel'
import { messagingSummary } from '../domain/messaging'
import { inTimeRange } from '../domain/timeRange'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import type { TrafficRow } from '../domain/types'
import { ChannelIcon } from './ChannelIcon'

/**
 * The campaign canvas — a structured, zoomable map that makes connection the
 * native visual language. Not a freeform whiteboard: an enforced hierarchy
 * (strategy → audiences → messages) the auto-layout owns, with pan/zoom, fit,
 * and coherence flags rendered in place on the node where the drift is.
 */

const NODE_W = 200
const MSG_W = 184
const MSG_H = 56
const MSG_GAP = 14
const COL_GAP = 70
const ROOT_Y = 0
const AUD_Y = 150
const MSG_Y = 300

interface Node {
  id: string
  kind: 'root' | 'audience' | 'message'
  x: number
  y: number
  w: number
  h: number
  label: string
  sub?: string
  row?: TrafficRow
  brk?: CoherenceBreak
  flaggedCount?: number
}
interface Edge {
  x1: number
  y1: number
  x2: number
  y2: number
  broken: boolean
}
interface Band {
  stage: string
  label: string
  y: number
  h: number
}

export function CanvasView() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const openBreaksQueue = useTrafficStore((s) => s.openBreaks)
  const openReview = useTrafficStore((s) => s.openReview)
  const timeRange = useTrafficStore((s) => s.timeRange)
  const rangeNow = Date.now()

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [vp, setVp] = useState({ tx: 60, ty: 40, s: 0.8 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const scoped = rows.filter(
    (r) =>
      rowInScope(r, { filter, query, clientFilter, campaignFilter }) &&
      inTimeRange(r, timeRange, rangeNow),
  )
  const breaks = applyBreakStatus(detectBreaks(scoped), breakStatus).filter((b) => b.status === 'open')
  const breakFor = (r: TrafficRow) =>
    breaks.find(
      (b) =>
        (b.from.assetName === r.assetName && b.from.channel === r.channel) ||
        (b.to?.assetName === r.assetName && b.to?.channel === r.channel),
    )

  const { nodes, edges, bands, bounds } = useMemo(() => {
    // Hierarchy: a strategy root → audience nodes → message nodes under each.
    const client = clientFilter !== 'all' ? clientFilter : ''
    const campaignNames = [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))]
    const strat =
      campaignList.find((c) => campaignNames.includes(c.name))?.strategy ?? 'Campaign'
    const rootLabel = client || (campaignNames[0] ?? 'Campaign')

    const byAud = new Map<string, TrafficRow[]>()
    for (const r of scoped) {
      const a = (r.audience ?? '').trim() || 'Unsegmented'
      ;(byAud.get(a) ?? byAud.set(a, []).get(a)!).push(r)
    }
    const audiences = [...byAud.entries()].sort((a, b) => b[1].length - a[1].length)

    const ns: Node[] = []
    const es: Edge[] = []
    // Column widths come from each audience's message count (or 1 when collapsed).
    let cursorX = 0
    const colX: number[] = []
    audiences.forEach(([name, msgs]) => {
      colX.push(cursorX)
      const open = !collapsed.has(name)
      const colW = Math.max(NODE_W, MSG_W)
      cursorX += colW + COL_GAP
      void open
      void msgs
    })
    const totalW = Math.max(cursorX - COL_GAP, NODE_W)
    const rootX = totalW / 2 - NODE_W / 2

    ns.push({
      id: 'root',
      kind: 'root',
      x: rootX,
      y: ROOT_Y,
      w: NODE_W,
      h: 64,
      label: rootLabel,
      sub: `Strategy · ${strat}`,
    })

    // Funnel-stage bands behind the messages: each message drops into the band for
    // its journey stage, so the canvas shows the hierarchy (audience columns) and
    // the funnel (stage rows) at once. Band height = the busiest (audience × stage).
    const BAND_PAD = 30
    const stageIdx: Record<string, number> = {}
    FUNNEL_STAGES.forEach((st, i) => (stageIdx[st.stage] = i))
    const bandTop: number[] = []
    const bandH: number[] = []
    let acc = MSG_Y
    FUNNEL_STAGES.forEach((st, i) => {
      let max = 0
      audiences.forEach(([name, msgs]) => {
        if (collapsed.has(name)) return
        const c = msgs.filter((r) => funnelStageFor(r.channel, r.assetType) === st.stage).length
        max = Math.max(max, c)
      })
      bandTop[i] = acc
      bandH[i] = Math.max(max, 1) * (MSG_H + MSG_GAP) + BAND_PAD
      acc += bandH[i]
    })

    audiences.forEach(([name, msgs], i) => {
      const cx = colX[i]
      const ax = cx + (Math.max(NODE_W, MSG_W) - NODE_W) / 2
      const flagged = msgs.filter((r) => breakFor(r)).length
      ns.push({
        id: `aud-${name}`,
        kind: 'audience',
        x: ax,
        y: AUD_Y,
        w: NODE_W,
        h: 52,
        label: name,
        sub: `${msgs.length} message${msgs.length === 1 ? '' : 's'}`,
        flaggedCount: flagged,
      })
      // root → audience
      es.push({
        x1: rootX + NODE_W / 2,
        y1: ROOT_Y + 64,
        x2: ax + NODE_W / 2,
        y2: AUD_Y,
        broken: false,
      })
      if (collapsed.has(name)) return
      const mx = cx + (Math.max(NODE_W, MSG_W) - MSG_W) / 2
      const run: Record<number, number> = {}
      msgs.forEach((r) => {
        const si = stageIdx[funnelStageFor(r.channel, r.assetType)] ?? 0
        const k = run[si] ?? 0
        run[si] = k + 1
        const my = bandTop[si] + BAND_PAD - 6 + k * (MSG_H + MSG_GAP)
        const brk = breakFor(r)
        ns.push({
          id: r.id,
          kind: 'message',
          x: mx,
          y: my,
          w: MSG_W,
          h: MSG_H,
          label: r.assetName,
          sub: messagingSummary(r) || CHANNELS[r.channel].label,
          row: r,
          brk,
        })
        // audience → message
        es.push({
          x1: ax + NODE_W / 2,
          y1: AUD_Y + 52,
          x2: mx + MSG_W / 2,
          y2: my,
          broken: !!brk,
        })
      })
    })

    const bands: Band[] = FUNNEL_STAGES.map((st, i) => ({
      stage: st.stage,
      label: st.label,
      y: bandTop[i],
      h: bandH[i],
    }))
    return { nodes: ns, edges: es, bands, bounds: { w: totalW, h: acc } }
  }, [scoped, audiencesKey(scoped), collapsed, campaignList, clientFilter])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = wrapRef.current?.getBoundingClientRect()
    const px = e.clientX - (rect?.left ?? 0)
    const py = e.clientY - (rect?.top ?? 0)
    setVp((v) => {
      const ds = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const s = Math.min(2.2, Math.max(0.25, v.s * ds))
      // Zoom toward the cursor.
      const tx = px - (px - v.tx) * (s / v.s)
      const ty = py - (py - v.ty) * (s / v.s)
      return { tx, ty, s }
    })
  }
  const onDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.cv-node')) return
    pan.current = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty }
  }
  const onMove = (e: React.MouseEvent) => {
    if (!pan.current) return
    setVp((v) => ({ ...v, tx: pan.current!.tx + (e.clientX - pan.current!.x), ty: pan.current!.ty + (e.clientY - pan.current!.y) }))
  }
  const endPan = () => {
    pan.current = null
  }
  const fit = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || bounds.w === 0) return
    const s = Math.min(1.4, Math.max(0.25, Math.min((rect.width - 80) / bounds.w, (rect.height - 80) / Math.max(bounds.h, 1))))
    setVp({ s, tx: (rect.width - bounds.w * s) / 2, ty: 40 })
  }
  const zoom = (dir: 1 | -1) =>
    setVp((v) => ({ ...v, s: Math.min(2.2, Math.max(0.25, v.s * (dir > 0 ? 1.2 : 1 / 1.2))) }))
  const toggleAud = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      const key = name
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  if (scoped.length === 0) {
    return (
      <div className="sheet-grid">
        <div className="ins ins-empty">No campaign in scope. Pick a client, or load sample data.</div>
      </div>
    )
  }

  return (
    <div className="sheet-grid">
      <div className="cv-bar">
        <span className="cv-title">Campaign canvas</span>
        <span className="cv-hint">strategy → audiences → messages · drag to pan, scroll to zoom</span>
        <span className="spacer" />
        {breaks.length > 0 && (
          <button className="cv-flagjump" onClick={() => openBreaksQueue()}>
            ⚠ {breaks.length} flag{breaks.length === 1 ? '' : 's'} — jump to
          </button>
        )}
        <div className="cv-zoom">
          <button onClick={() => zoom(-1)} title="Zoom out">
            −
          </button>
          <button onClick={() => zoom(1)} title="Zoom in">
            ＋
          </button>
          <button onClick={fit} title="Fit to view">
            ⊡ Fit
          </button>
        </div>
      </div>

      <div
        className="cv-wrap"
        ref={wrapRef}
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
      >
        <div
          className="cv-world"
          style={{ transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.s})` }}
        >
          {bands.map((b, i) => (
            <div
              key={b.stage}
              className={`cv-band${i % 2 ? ' alt' : ''}`}
              style={{ left: -160, top: b.y, width: bounds.w + 160, height: b.h }}
            >
              <span className="cv-band-label">{b.label}</span>
            </div>
          ))}
          <svg className="cv-edges" width={bounds.w + 40} height={bounds.h + 40}>
            {edges.map((e, i) => (
              <path
                key={i}
                className={`cv-edge${e.broken ? ' broken' : ''}`}
                d={`M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}`}
                fill="none"
              />
            ))}
          </svg>
          {nodes.map((n) => (
            <div
              key={n.id}
              className={`cv-node k-${n.kind}${n.brk ? ' broke' : ''}`}
              style={{ left: n.x, top: n.y, width: n.w, minHeight: n.h }}
              onClick={() => {
                if (n.kind === 'audience') toggleAud(n.label)
                else if (n.kind === 'message' && n.row) openReview(n.row.id)
              }}
            >
              {n.kind === 'message' && n.row && (
                <span className="cv-node-ico">
                  <ChannelIcon channel={n.row.channel} size={13} />
                </span>
              )}
              <div className="cv-node-body">
                <div className="cv-node-label">{n.label}</div>
                {n.sub && <div className="cv-node-sub">{n.sub}</div>}
              </div>
              {n.kind === 'audience' && (
                <span className="cv-node-collapse">{collapsed.has(n.label) ? '＋' : '−'}</span>
              )}
              {n.kind === 'audience' && (n.flaggedCount ?? 0) > 0 && (
                <span className="cv-node-flagcount">⚠ {n.flaggedCount}</span>
              )}
              {n.brk && (
                <span
                  className="cv-node-flag"
                  title={n.brk.headline}
                  onClick={(e) => {
                    e.stopPropagation()
                    openBreaksQueue(n.brk!.id)
                  }}
                >
                  ⚠
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A cheap dependency key so the layout recomputes when the audience grouping changes. */
function audiencesKey(rows: TrafficRow[]): string {
  return rows.map((r) => `${r.id}:${(r.audience ?? '').trim()}`).join('|')
}
