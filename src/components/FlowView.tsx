import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { mockAttio } from '../adapters/attio/mockAttio'
import { money } from '../domain/budget'
import { CHANNELS } from '../domain/channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from '../domain/funnel'
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
      // Group links by destination so we can fan the incoming lines across the
      // target card's edge instead of converging on a single point.
      const groups = new Map<HTMLElement, TrafficRow[]>()
      for (const r of view) {
        if (!r.linksTo) continue
        const src = byId.get(r.id)
        const tgt = byName.get(r.linksTo)
        if (!src || !tgt || src === tgt) continue
        const list = groups.get(tgt)
        if (list) list.push(r)
        else groups.set(tgt, [r])
      }
      const next: Edge[] = []
      for (const [tgt, list] of groups) {
        const t = tgt.getBoundingClientRect()
        list.forEach((r, k) => {
          const src = byId.get(r.id)!
          const s = src.getBoundingClientRect()
          const frac = (k + 1) / (list.length + 1)
          next.push({
            key: r.id,
            sourceId: r.id,
            targetName: r.linksTo!,
            x1: s.right - base.left,
            y1: s.top + s.height / 2 - base.top,
            x2: t.left - base.left,
            y2: t.top + t.height * frac - base.top,
          })
        })
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
      .filter((r) => funnelStageFor(r.channel) === stage)
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
        </div>

        <div className="journey-graph" ref={graphRef}>
          <svg className="journey-svg" aria-hidden="true">
            <defs>
              <marker
                id="journey-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
              </marker>
            </defs>
            {edges.map((e) => {
              const dx = Math.max(40, (e.x2 - e.x1) / 2)
              const active = hover && (hover.id === e.sourceId || hover.name === e.targetName)
              const cls = hover ? (active ? ' active' : ' dim') : ''
              return (
                <path
                  key={e.key}
                  className={`journey-edge${cls}`}
                  d={`M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`}
                  markerEnd="url(#journey-arrow)"
                />
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
