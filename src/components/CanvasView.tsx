import { useMemo, useRef, useState } from 'react'
import { applyBreakStatus, detectBreaks, type CoherenceBreak } from '../domain/breaks'
import { CHANNELS } from '../domain/channels'
import { FUNNEL_STAGES, funnelStageFor } from '../domain/funnel'
import { messagingFields, messagingMap, messagingSummary } from '../domain/messaging'
import { inTimeRange } from '../domain/timeRange'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import type { TrafficRow } from '../domain/types'
import { ChannelIcon } from './ChannelIcon'

/**
 * The campaign canvas — a structured, zoomable map that makes connection the
 * native visual language. An enforced hierarchy (strategy → audiences →
 * messages) the auto-layout owns, laid over funnel-stage bands, with coherence
 * flags in place. Nodes can be nudged by hand and the connections follow.
 */

const NODE_W = 200
const MSG_W = 186
const MSG_H = 62
const MSG_GAP = 24
const COL_GAP = 80
const BAND_PAD = 72
// How far each funnel band bleeds past the content on the left and right, so the
// stripes run edge to edge instead of stopping at the outermost node.
const BAND_BLEED = 240
// Zoom past this and message cards reveal their full messaging breakdown (every
// component), not just the one-line summary — read everything without leaving the map.
const DETAIL_ZOOM = 1.15
const ROOT_Y = 0
const AUD_Y = 160
const MSG_Y = 340

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
  const openDiagnosis = useTrafficStore((s) => s.openDiagnosis)
  const timeRange = useTrafficStore((s) => s.timeRange)
  const rangeNow = Date.now()

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Hand-nudged node positions (id → absolute world position); the engine owns
  // the rest of the layout and the connections re-route to whatever you move.
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({})
  const [vp, setVp] = useState({ tx: 60, ty: 40, s: 0.7 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const drag = useRef<{ id: string; sx: number; sy: number; mx: number; my: number; far: boolean } | null>(null)
  const suppressClick = useRef(false)

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
    const client = clientFilter !== 'all' ? clientFilter : ''
    const campaignNames = [...new Set(scoped.map((r) => (r.campaign ?? '').trim()).filter(Boolean))]
    const strat = campaignList.find((c) => campaignNames.includes(c.name))?.strategy ?? 'Campaign'
    const rootLabel = client || (campaignNames[0] ?? 'Campaign')

    const byAud = new Map<string, TrafficRow[]>()
    for (const r of scoped) {
      const a = (r.audience ?? '').trim() || 'Unsegmented'
      ;(byAud.get(a) ?? byAud.set(a, []).get(a)!).push(r)
    }
    const audiences = [...byAud.entries()].sort((a, b) => b[1].length - a[1].length)

    const ns: Node[] = []
    const et: { fromId: string; toId: string; broken: boolean }[] = []
    // Apply any hand-nudge to a node's auto position.
    const at = (id: string, x: number, y: number) => ({ x: moved[id]?.x ?? x, y: moved[id]?.y ?? y })

    const colW = Math.max(NODE_W, MSG_W)
    const colX = audiences.map((_, i) => i * (colW + COL_GAP))
    const totalW = Math.max(colX.length * (colW + COL_GAP) - COL_GAP, NODE_W)
    const rootX = totalW / 2 - NODE_W / 2

    const root = at('root', rootX, ROOT_Y)
    ns.push({ id: 'root', kind: 'root', x: root.x, y: root.y, w: NODE_W, h: 64, label: rootLabel, sub: `Strategy · ${strat}` })

    // Funnel-stage bands: each message drops into the band for its journey stage.
    const stageIdx: Record<string, number> = {}
    FUNNEL_STAGES.forEach((st, i) => (stageIdx[st.stage] = i))
    const bandTop: number[] = []
    const bandH: number[] = []
    let acc = MSG_Y
    FUNNEL_STAGES.forEach((st, i) => {
      let max = 0
      audiences.forEach(([name, msgs]) => {
        if (collapsed.has(name)) return
        max = Math.max(max, msgs.filter((r) => funnelStageFor(r.channel, r.assetType) === st.stage).length)
      })
      bandTop[i] = acc
      bandH[i] = Math.max(max, 2) * (MSG_H + MSG_GAP) + BAND_PAD
      acc += bandH[i]
    })

    audiences.forEach(([name, msgs], i) => {
      const cx = colX[i]
      const aPos = at(`aud-${name}`, cx + (colW - NODE_W) / 2, AUD_Y)
      const flagged = msgs.filter((r) => breakFor(r)).length
      ns.push({
        id: `aud-${name}`,
        kind: 'audience',
        x: aPos.x,
        y: aPos.y,
        w: NODE_W,
        h: 52,
        label: name,
        sub: `${msgs.length} message${msgs.length === 1 ? '' : 's'}`,
        flaggedCount: flagged,
      })
      et.push({ fromId: 'root', toId: `aud-${name}`, broken: false })
      if (collapsed.has(name)) return
      const run: Record<number, number> = {}
      msgs.forEach((r) => {
        const si = stageIdx[funnelStageFor(r.channel, r.assetType)] ?? 0
        const k = run[si] ?? 0
        run[si] = k + 1
        const mPos = at(r.id, cx + (colW - MSG_W) / 2, bandTop[si] + BAND_PAD - 8 + k * (MSG_H + MSG_GAP))
        const brk = breakFor(r)
        ns.push({
          id: r.id,
          kind: 'message',
          x: mPos.x,
          y: mPos.y,
          w: MSG_W,
          h: MSG_H,
          label: r.assetName,
          sub: messagingSummary(r) || CHANNELS[r.channel].label,
          row: r,
          brk,
        })
        et.push({ fromId: `aud-${name}`, toId: r.id, broken: !!brk })
      })
    })

    // Resolve edges from the (possibly nudged) node positions so connections follow.
    const byId = new Map(ns.map((n) => [n.id, n]))
    const es: Edge[] = et.flatMap(({ fromId, toId, broken }) => {
      const f = byId.get(fromId)
      const t = byId.get(toId)
      if (!f || !t) return []
      return [{ x1: f.x + f.w / 2, y1: f.y + f.h, x2: t.x + t.w / 2, y2: t.y, broken }]
    })

    // Bands tile the whole canvas: the first stage reaches the top (under the
    // strategy + audiences), the last reaches the bottom, so every node sits on a
    // funnel band with no band-less gaps. Message rows keep their positions — only
    // the painted rectangles grow to fill the canvas.
    const lastIdx = FUNNEL_STAGES.length - 1
    const bandBottom = Math.max(acc, ...ns.map((n) => n.y + n.h)) + BAND_PAD
    const bands: Band[] = FUNNEL_STAGES.map((st, i) => {
      const top = i === 0 ? 0 : bandTop[i]
      const bot = i === lastIdx ? bandBottom : bandTop[i + 1]
      return { stage: st.stage, label: st.label, y: top, h: bot - top }
    })
    const maxX = Math.max(totalW, ...ns.map((n) => n.x + n.w))
    return { nodes: ns, edges: es, bands, bounds: { w: maxX, h: bandBottom } }
  }, [scoped, audiencesKey(scoped), collapsed, campaignList, clientFilter, moved])

  // ---- pan / zoom / node-drag ----
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = wrapRef.current?.getBoundingClientRect()
    const px = e.clientX - (rect?.left ?? 0)
    const py = e.clientY - (rect?.top ?? 0)
    setVp((v) => {
      const ds = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const s = Math.min(2.2, Math.max(0.2, v.s * ds))
      return { tx: px - (px - v.tx) * (s / v.s), ty: py - (py - v.ty) * (s / v.s), s }
    })
  }
  const startDrag = (e: React.MouseEvent, n: Node) => {
    e.stopPropagation()
    drag.current = { id: n.id, sx: n.x, sy: n.y, mx: e.clientX, my: e.clientY, far: false }
  }
  const onDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.cv-node')) return
    pan.current = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty }
  }
  const onMove = (e: React.MouseEvent) => {
    if (drag.current) {
      const d = drag.current
      const dx = (e.clientX - d.mx) / vp.s
      const dy = (e.clientY - d.my) / vp.s
      if (Math.abs(dx) + Math.abs(dy) > 3) d.far = true
      setMoved((prev) => ({ ...prev, [d.id]: { x: d.sx + dx, y: d.sy + dy } }))
      return
    }
    // Capture the pan origin: the setVp updater runs later, and a mouseup could
    // null pan.current before it does (which would throw).
    const p = pan.current
    if (p) setVp((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }))
  }
  const endAll = () => {
    if (drag.current?.far) {
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
    }
    drag.current = null
    pan.current = null
  }
  const fit = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || bounds.w === 0) return
    const s = Math.min(1.2, Math.max(0.2, Math.min((rect.width - 100) / bounds.w, (rect.height - 100) / Math.max(bounds.h, 1))))
    setVp({ s, tx: (rect.width - bounds.w * s) / 2, ty: 30 })
  }
  const zoom = (dir: 1 | -1) =>
    setVp((v) => ({ ...v, s: Math.min(2.2, Math.max(0.2, v.s * (dir > 0 ? 1.2 : 1 / 1.2))) }))
  const toggleAud = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  const resetLayout = () => setMoved({})
  // Reveal the full per-component copy once the user has zoomed in to read.
  const detail = vp.s >= DETAIL_ZOOM

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
        <span className="cv-hint">drag a card to move it · the connections follow · scroll to zoom</span>
        <span className="spacer" />
        <button className="cv-diagnose" onClick={openDiagnosis} title="See the live mess, then the same map connected">
          ✦ Diagnosis
        </button>
        {Object.keys(moved).length > 0 && (
          <button className="cv-reset" onClick={resetLayout} title="Snap nodes back to auto-layout">
            ↺ Reset layout
          </button>
        )}
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
        onMouseUp={endAll}
        onMouseLeave={endAll}
      >
        <div className="cv-world" style={{ transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.s})` }}>
          {bands.map((b, i) => (
            <div
              key={b.stage}
              className={`cv-band${i % 2 ? ' alt' : ''}`}
              style={{ left: -BAND_BLEED, top: b.y, width: bounds.w + BAND_BLEED * 2, height: b.h }}
            >
              <span className="cv-band-label">{b.label}</span>
            </div>
          ))}
          <svg className="cv-edges" width={bounds.w + 60} height={bounds.h + 60}>
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
              onMouseDown={(e) => startDrag(e, n)}
              onClick={() => {
                if (suppressClick.current) return
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
                {(() => {
                  if (n.kind === 'message' && detail && n.row) {
                    const bd = messageBreakdown(n.row)
                    if (bd.length)
                      return (
                        <div className="cv-node-full">
                          {bd.map((fld) => (
                            <div className="cv-node-field" key={fld.label}>
                              <span className="cv-node-fkey">{fld.label}</span>
                              <span className="cv-node-fval">{fld.value}</span>
                            </div>
                          ))}
                        </div>
                      )
                  }
                  return n.sub ? <div className="cv-node-sub">{n.sub}</div> : null
                })()}
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

/** Every non-empty messaging component for an asset, in schema order — the full
 *  copy shown on a card once you zoom in. */
function messageBreakdown(row: TrafficRow): { label: string; value: string }[] {
  const map = messagingMap(row)
  return messagingFields(row.channel, row.assetType)
    .map((f) => ({ label: f.label, value: (map[f.key] ?? '').trim() }))
    .filter((x) => x.value)
}
