import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { mockAttio } from '../adapters/attio/mockAttio'
import { money } from '../domain/budget'
import { CHANNELS } from '../domain/channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from '../domain/funnel'
import { handoffFor, type HandoffLevel } from '../domain/flowReview'
import type { ChannelId, RowStatus, TrafficRow } from '../domain/types'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChannelIcon } from './ChannelIcon'

const STATUS_COLOR: Record<RowStatus, string> = {
  draft: '#9aa0aa',
  approved: 'var(--blue)',
  scheduled: 'var(--blue)',
  posted: 'var(--green)',
  failed: '#b42318',
}

interface Edge {
  key: string
  sourceId: string
  targetName: string
  level: HandoffLevel
  reason: string
  back: boolean
  /** True for auto-derived funnel edges (vs. an explicit per-asset linksTo edge). */
  auto?: boolean
  x1: number
  y1: number
  x2: number
  y2: number
}

export function FlowView() {
  const rows = useTrafficStore((s) => s.rows)
  const filter = useTrafficStore((s) => s.filter)
  const query = useTrafficStore((s) => s.query)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const openReview = useTrafficStore((s) => s.openReview)

  const view = rows.filter((r) => rowInScope(r, { filter, query, clientFilter, campaignFilter }))

  const graphRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState<Edge[]>([])
  const [hover, setHover] = useState<{ id: string; name: string } | null>(null)

  // Recompute connector geometry when the data or layout changes.
  const linkKey = view.map((r) => `${r.id}:${r.linksTo ?? ''}`).join('|')
  useLayoutEffect(() => {
    const root = graphRef.current
    if (!root) return
    const compute = () => {
      const base = root.getBoundingClientRect()
      const cards = [...root.querySelectorAll<HTMLElement>('.flow-card')]
      const byId = new Map<string, HTMLElement>()
      const byName = new Map<string, HTMLElement>()
      for (const c of cards) {
        if (c.dataset.id) byId.set(c.dataset.id, c)
        if (c.dataset.name && !byName.has(c.dataset.name)) byName.set(c.dataset.name, c)
      }
      const next: Edge[] = []
      const linked = new Set<string>()
      for (const r of view) {
        if (!r.linksTo) continue
        const src = byId.get(r.id)
        const tgt = byName.get(r.linksTo)
        if (!src || !tgt || src === tgt) continue
        const s = src.getBoundingClientRect()
        const t = tgt.getBoundingClientRect()
        // Backward link (destination is an earlier stage / to the left): attach
        // to the RIGHT side of both cards. Forward: source-right → target-left.
        const back = t.right <= s.left + 1
        const targetRow = rows.find((x) => x.assetName === r.linksTo)
        const h = targetRow ? handoffFor(r, targetRow) : { level: 'weak' as const, reason: '' }
        linked.add(r.id)
        next.push({
          key: r.id,
          sourceId: r.id,
          targetName: r.linksTo,
          level: h.level,
          reason: h.reason,
          back,
          // Center of the facing side, inset a few px so the dot clears the card.
          x1: (back ? s.left - 5 : s.right + 5) - base.left,
          y1: s.top + s.height / 2 - base.top,
          x2: (back ? t.right + 5 : t.left - 5) - base.left,
          y2: t.top + t.height / 2 - base.top,
        })
      }
      // Connect any asset WITHOUT an explicit link forward to the next populated
      // stage (preferring its landing page) so every asset reads as connected.
      {
        const order = FUNNEL_STAGES.map((s) => s.stage)
        const byStage = new Map<FunnelStage, TrafficRow[]>()
        for (const r of view) {
          const st = funnelStageFor(r.channel, r.assetType)
          const list = byStage.get(st)
          if (list) list.push(r)
          else byStage.set(st, [r])
        }
        for (const list of byStage.values())
          list.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
        const populated = order.filter((st) => (byStage.get(st)?.length ?? 0) > 0)
        for (let i = 0; i < populated.length - 1; i++) {
          const nextRows = byStage.get(populated[i + 1])!
          const toTarget = nextRows.find((r) => r.channel === 'landing-page') ?? nextRows[0]
          const tgt = byId.get(toTarget.id)
          if (!tgt) continue
          const t = tgt.getBoundingClientRect()
          for (const fr of byStage.get(populated[i])!) {
            if (linked.has(fr.id)) continue
            const src = byId.get(fr.id)
            if (!src) continue
            const s = src.getBoundingClientRect()
            next.push({
              key: `auto-${fr.id}`,
              sourceId: fr.id,
              targetName: toTarget.assetName,
              level: 'coherent',
              reason: '',
              back: false,
              auto: true,
              x1: s.right + 5 - base.left,
              y1: s.top + s.height / 2 - base.top,
              x2: t.left - 5 - base.left,
              y2: t.top + t.height / 2 - base.top,
            })
          }
        }
      }
      setEdges(next)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(root)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkKey])

  // A second pass after fonts/layout settle so the first paint isn't off.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [linkKey])

  const targetId = (name: string) => rows.find((r) => r.assetName === name)?.id

  // Handoff health across all linked units (CTA + message continuity).
  const handoffs = view
    .filter((r) => r.linksTo)
    .map((r) => {
      const t = rows.find((x) => x.assetName === r.linksTo)
      return t ? handoffFor(r, t) : null
    })
    .filter((h): h is NonNullable<typeof h> => !!h)
  const cleanN = handoffs.filter((h) => h.level === 'coherent').length
  const breakN = handoffs.filter((h) => h.level !== 'coherent').length

  const Card = ({ row }: { row: TrafficRow }) => {
    const linkId = row.linksTo ? targetId(row.linksTo) : undefined
    return (
      <button
        className="flow-card"
        data-id={row.id}
        data-name={row.assetName}
        style={{ borderLeftColor: STATUS_COLOR[row.status] }}
        onClick={() => openReview(row.id)}
        onMouseEnter={() => setHover({ id: row.id, name: row.assetName })}
        onMouseLeave={() => setHover(null)}
        title={`${CHANNELS[row.channel].label} · ${row.assetName}`}
      >
        <div className="flow-card-head">
          <ChannelIcon channel={row.channel} size={13} />
          <span className="flow-card-name">{row.assetName}</span>
        </div>
        {row.linksTo && (
          <span
            className="flow-card-link"
            title={`Drives to ${row.linksTo}`}
            onClick={(e) => {
              e.stopPropagation()
              if (linkId) openReview(linkId)
            }}
          >
            → {row.linksTo}
          </span>
        )}
      </button>
    )
  }

  const stageData = (stage: FunnelStage) => {
    const items = view
      .filter((r) => funnelStageFor(r.channel, r.assetType) === stage)
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    const channels = [...new Set(items.map((r) => r.channel))] as ChannelId[]
    const names = new Set(items.map((r) => r.assetName))
    let revenue = 0
    let leads = 0
    for (const n of names) {
      const a = mockAttio.attributionForAsset(n)
      revenue += a.wonRevenue
      leads += a.leads
    }
    return { items, channels, assets: names.size, revenue, leads }
  }

  return (
    <div className="sheet-grid">
      <div className="journey">
        <div className="journey-intro">
          The path a prospect travels — lines show how each unit drives to the next.
          {handoffs.length > 0 && (
            <span className="journey-handoffs">
              <span className="journey-handoff-ok">{cleanN} clean</span>
              {breakN > 0 && (
                <span className="journey-handoff-bad">· {breakN} need a tighter CTA / message</span>
              )}
            </span>
          )}
        </div>

        <div className="journey-graph" ref={graphRef}>
          <svg className="journey-svg" aria-hidden="true">
            <defs>
              <marker id="journey-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                <circle cx="5" cy="5" r="4" fill="context-stroke" />
              </marker>
            </defs>
            {edges.map((e) => {
              const dx = Math.max(40, Math.abs(e.x2 - e.x1) / 2)
              const cx1 = e.back ? e.x1 - dx : e.x1 + dx
              const cx2 = e.back ? e.x2 + dx : e.x2 - dx
              const active = hover && (hover.id === e.sourceId || hover.name === e.targetName)
              const cls = hover ? (active ? ' active' : ' dim') : ''
              const variant = e.auto ? ' journey-edge--flow' : ` h-${e.level}`
              return (
                <path
                  key={e.key}
                  className={`journey-edge${variant}${cls}`}
                  d={`M ${e.x1} ${e.y1} C ${cx1} ${e.y1}, ${cx2} ${e.y2}, ${e.x2} ${e.y2}`}
                  markerStart="url(#journey-dot)"
                  markerEnd="url(#journey-dot)"
                >
                  <title>{e.reason}</title>
                </path>
              )
            })}
          </svg>

          <div className="journey-rail">
            {FUNNEL_STAGES.map((stage, i) => {
              const d = stageData(stage.stage)
              return (
                <div className="journey-station-wrap" key={stage.stage}>
                  <div className="journey-station">
                    <div className="journey-step">
                      <span className="journey-step-num">{i + 1}</span>
                      <div className="journey-step-meta">
                        <div className="journey-step-name">{stage.label}</div>
                        <div className="journey-step-hint">{stage.hint}</div>
                      </div>
                    </div>

                    <div className="journey-channels" title="Channels that touch the user here">
                      {d.channels.length === 0 ? (
                        <span className="journey-none">no touchpoints</span>
                      ) : (
                        d.channels.map((c) => (
                          <span key={c} className="journey-chan" title={CHANNELS[c].label}>
                            <ChannelIcon channel={c} size={15} />
                          </span>
                        ))
                      )}
                    </div>

                    <div className="journey-outcome">
                      <span className="journey-outcome-stat">
                        <b>{d.assets}</b> asset{d.assets === 1 ? '' : 's'}
                      </span>
                      {d.leads > 0 && (
                        <span className="journey-outcome-stat">
                          <b>{d.leads}</b> lead{d.leads === 1 ? '' : 's'}
                        </span>
                      )}
                      {d.revenue > 0 && <span className="journey-outcome-rev">{money(d.revenue)}</span>}
                    </div>

                    <div className="journey-assets">
                      {d.items.length === 0 ? (
                        <div className="flow-empty">—</div>
                      ) : (
                        d.items.map((row) => <Card key={row.id} row={row} />)
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
