import { useRef, useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { contentFlow, extractLinks, flowRecommendations, type FlowAsset } from '../domain/contentSignals'
import type { ChannelId, TrafficRow } from '../domain/types'

/**
 * Content flow — a high-level, drillable map of how the library links together: each
 * channel (left) drawn to the destinations its copy drives to (right), weighted by how
 * many posts point there. Hover a node to preview the assets behind it, click to pin the
 * full list; the dead-ends list is the content that links nowhere, and the recommendations
 * read the leaks straight off the flow.
 */
type Selection = { kind: 'channel' | 'dest'; key: string } | null
const chLabel = (c: string) => CHANNELS[c as ChannelId]?.label ?? c
const sameSel = (a: Selection, b: Selection) => !!a && !!b && a.kind === b.kind && a.key === b.key

export function LibraryMap({ rows }: { rows: TrafficRow[] }) {
  const flow = contentFlow(rows)
  const links = extractLinks(rows)
  const recs = flowRecommendations(flow)
  const [pin, setPin] = useState<Selection>(null)
  const [hover, setHover] = useState<Selection>(null)
  const [tip, setTip] = useState<{ x: number; y: number; flip: boolean }>({ x: 0, y: 0, flip: false })
  const scrollRef = useRef<HTMLDivElement>(null)

  const sources = flow.channels.filter((c) => c.total > 0)
  const dests = flow.destinations

  if (!sources.length) {
    return <div className="mtx-empty">Ingest this brand's content first, then the map shows how it links together.</div>
  }

  const assetsFor = (sel: Selection): FlowAsset[] =>
    sel?.kind === 'dest'
      ? flow.destinations.find((d) => d.key === sel.key)?.assets ?? []
      : sel?.kind === 'channel'
        ? flow.assets.filter((a) => a.channel === sel.key)
        : []

  const rowH = 60
  const padY = 22
  const nodeW = 156
  const nodeH = 38
  const W = 820
  const H = Math.max(sources.length, dests.length, 1) * rowH + padY * 2
  const leftX = 14
  const rightX = W - nodeW - 14
  const srcY = (i: number) => padY + i * rowH + rowH / 2
  const dstIndex = new Map(dests.map((d, j) => [d.key, j]))
  const dstY = (j: number) => padY + j * rowH + rowH / 2
  const maxEdge = Math.max(1, ...sources.flatMap((s) => s.destinations.map((d) => d.count)))
  const active = hover ?? pin

  const edges = sources.flatMap((s, i) =>
    s.destinations.flatMap((d) => {
      const j = dstIndex.get(d.key)
      if (j == null) return []
      const on = !active || (active.kind === 'channel' && active.key === s.channel) || (active.kind === 'dest' && active.key === d.key)
      return [{ key: `${s.channel}-${d.key}`, x1: leftX + nodeW, y1: srcY(i), x2: rightX, y2: dstY(j), w: 1.5 + (d.count / maxEdge) * 7, on }]
    }),
  )

  const hoverAssets = hover ? assetsFor(hover) : []
  const pinned = assetsFor(pin)

  const AssetRow = ({ a }: { a: FlowAsset }) => (
    <div className="lmap-asset">
      <span className="lmap-asset-name" title={a.name}>
        {a.name}
      </span>
      <span className="lmap-asset-meta">
        {chLabel(a.channel)}
        {a.when ? ` · ${a.when}` : ''}
        {a.destinations.length ? ` → ${a.destinations.join(', ')}` : ' · dead end'}
      </span>
      {a.url && (
        <a className="lmap-asset-link" href={a.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          ↗
        </a>
      )}
    </div>
  )

  const nodeHandlers = (sel: Selection) => ({
    className: 'lmap-hit',
    onMouseEnter: () => setHover(sel),
    onMouseLeave: () => setHover(null),
    onClick: () => setPin(sameSel(pin, sel) ? null : sel),
  })

  return (
    <div className="lmap">
      <header className="mtx-head">
        <h2>Content flow</h2>
        <span className="mtx-sub">
          How each channel's content drives onward and where the links point · {flow.overall.connected} of{' '}
          {flow.overall.total} posts link to a next step · {flow.overall.deadEndPct}% dead-end · hover a node to preview,
          click to pin.
        </span>
      </header>

      {recs.length > 0 && (
        <div className="lmap-recs">
          <div className="lmap-links-h">Recommendations</div>
          <ul className="lmap-rec-list">
            {recs.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="lmap-scroll"
        ref={scrollRef}
        onMouseMove={(e) => {
          const r = scrollRef.current?.getBoundingClientRect()
          if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, flip: e.clientX - r.left > r.width * 0.6 })
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="lmap-svg" role="img" aria-label="Content flow map">
          {edges.map((e) => (
            <path
              key={e.key}
              className={`lmap-edge${e.on ? '' : ' dim'}`}
              strokeWidth={e.w}
              d={`M ${e.x1} ${e.y1} C ${(e.x1 + e.x2) / 2} ${e.y1}, ${(e.x1 + e.x2) / 2} ${e.y2}, ${e.x2} ${e.y2}`}
            />
          ))}
          {sources.map((s, i) => {
            const sel: Selection = { kind: 'channel', key: s.channel }
            return (
              <g key={s.channel} transform={`translate(${leftX}, ${srcY(i) - nodeH / 2})`} {...nodeHandlers(sel)}>
                <rect
                  className={`lmap-node src${s.connected === 0 ? ' dead' : ''}${sameSel(active, sel) ? ' on' : ''}`}
                  width={nodeW}
                  height={nodeH}
                  rx={8}
                />
                <text className="lmap-label" x={13} y={16}>
                  {s.label}
                </text>
                <text className="lmap-sub" x={13} y={30}>
                  {s.connected === 0 ? 'dead end' : `${s.connected}/${s.total} connect`}
                </text>
              </g>
            )
          })}
          {dests.map((d, j) => {
            const sel: Selection = { kind: 'dest', key: d.key }
            return (
              <g key={d.key} transform={`translate(${rightX}, ${dstY(j) - nodeH / 2})`} {...nodeHandlers(sel)}>
                <rect className={`lmap-node dst${sameSel(active, sel) ? ' on' : ''}`} width={nodeW} height={nodeH} rx={8} />
                <text className="lmap-label" x={13} y={16}>
                  {d.key}
                </text>
                <text className="lmap-sub" x={13} y={30}>
                  ×{d.count}
                </text>
              </g>
            )
          })}
        </svg>

        {hover && hoverAssets.length > 0 && (
          <div
            className="lmap-tip"
            style={{
              left: tip.flip ? tip.x - 14 : tip.x + 14,
              top: tip.y + 14,
              transform: tip.flip ? 'translateX(-100%)' : undefined,
            }}
          >
            <div className="lmap-tip-h">
              {hover.kind === 'dest' ? `→ ${hover.key}` : chLabel(hover.key)} · {hoverAssets.length}
            </div>
            {hoverAssets.slice(0, 6).map((a) => (
              <div className="lmap-tip-item" key={a.id}>
                {a.name}
              </div>
            ))}
            {hoverAssets.length > 6 && <div className="lmap-tip-more">click to see all {hoverAssets.length}</div>}
          </div>
        )}
      </div>

      {pin && (
        <div className="lmap-detail">
          <div className="lmap-detail-head">
            <strong>{pin.kind === 'dest' ? `Assets driving to ${pin.key}` : `${chLabel(pin.key)} assets`}</strong>
            <span className="lmap-detail-n">{pinned.length}</span>
            <button className="lmap-detail-x" onClick={() => setPin(null)} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="lmap-asset-list">
            {pinned.slice(0, 50).map((a) => (
              <AssetRow a={a} key={a.id} />
            ))}
            {pinned.length > 50 && <div className="lmap-asset-more">+{pinned.length - 50} more</div>}
          </div>
        </div>
      )}

      {flow.deadEnds.length > 0 && (
        <div className="lmap-deadends">
          <div className="lmap-links-h">Dead ends · {flow.deadEnds.length} assets link nowhere onward</div>
          <div className="lmap-asset-list lmap-deadend-list">
            {flow.deadEnds.slice(0, 6).map((a) => (
              <AssetRow a={a} key={a.id} />
            ))}
            {flow.deadEnds.length > 6 && <div className="lmap-asset-more">+{flow.deadEnds.length - 6} more</div>}
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="lmap-links">
          <div className="lmap-links-h">Links &amp; platforms referenced in the copy</div>
          <div className="sig-themes">
            {links.map((l) => (
              <span className="sig-theme" key={l.host}>
                {l.host}
                <b>×{l.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mtx-foot">
        A high-level map of where content sends people. Edge thickness is how many posts drive to each destination; hover
        a node to preview its assets and click to pin the full list. The dead-ends list is the content that goes nowhere
        next.
      </div>
    </div>
  )
}
