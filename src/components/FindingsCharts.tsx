import { useMemo, useRef, useState } from 'react'
import { CHANNELS } from '../domain/channels'
import { formatReach } from '../domain/journeyPerf'
import type { ChannelId, TrafficRow } from '../domain/types'

/**
 * The visual summary that leads the Findings page. Two charts, each a single measure
 * (reach), so each is one hue — identity is carried by axis labels, not color:
 *  - Reach by channel: a magnitude comparison → horizontal bars.
 *  - Reach over time: change over time → an area line.
 * Everything is computed from the same ingested rows the text findings read.
 */

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A row's headline reach: views, else impressions, else reach, else its largest metric. */
function reachOf(r: TrafficRow): number {
  const m = r.socialMetrics
  if (!m) return 0
  if (typeof m.views === 'number') return m.views
  if (typeof m.impressions === 'number') return m.impressions
  if (typeof m.reach === 'number') return m.reach
  const nums = Object.values(m).filter((v): v is number => typeof v === 'number')
  return nums.length ? Math.max(...nums) : 0
}
const channelLabel = (ch: string): string => CHANNELS[ch as ChannelId]?.label ?? ch

/** A row's post date as ms (postedAt / publishedAt), date-only strings read local. */
function postMs(r: TrafficRow): number | null {
  if (typeof r.postedAt === 'number') return r.postedAt
  const iso = r.publishedAt ?? (typeof r.postedAt === 'string' ? r.postedAt : undefined)
  if (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
    if (!Number.isNaN(d.getTime())) return d.getTime()
  }
  return null
}

export function FindingsCharts({ items }: { items: TrafficRow[] }) {
  const byChannel = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of items) m.set(String(r.channel), (m.get(String(r.channel)) ?? 0) + reachOf(r))
    return [...m.entries()]
      .map(([channel, reach]) => ({ channel, reach }))
      .filter((c) => c.reach > 0)
      .sort((a, b) => b.reach - a.reach)
      .slice(0, 6)
  }, [items])

  const overTime = useMemo(() => {
    const m = new Map<string, { reach: number; t: number }>()
    for (const r of items) {
      const ms = postMs(r)
      if (ms == null) continue
      const d = new Date(ms)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const cur = m.get(key) ?? { reach: 0, t: new Date(d.getFullYear(), d.getMonth(), 1).getTime() }
      cur.reach += reachOf(r)
      m.set(key, cur)
    }
    return [...m.values()]
      .sort((a, b) => a.t - b.t)
      .map((x) => ({ reach: x.reach, label: `${MO[new Date(x.t).getMonth()]} ${String(new Date(x.t).getFullYear()).slice(2)}` }))
  }, [items])

  const maxChannel = byChannel[0]?.reach ?? 0
  if (!maxChannel) return null

  return (
    <div className="fchart-row">
      <section className="fchart">
        <div className="fchart-head">Reach by channel</div>
        <div className="fchart-bars">
          {byChannel.map((c) => (
            <div className="fchart-bar-row" key={c.channel} title={`${channelLabel(c.channel)} · ${formatReach(c.reach)}`}>
              <span className="fchart-bar-label">{channelLabel(c.channel)}</span>
              <div className="fchart-bar-track">
                <div className="fchart-bar-fill" style={{ width: `${Math.max(2, (c.reach / maxChannel) * 100)}%` }} />
              </div>
              <span className="fchart-bar-val">{formatReach(c.reach)}</span>
            </div>
          ))}
        </div>
      </section>

      {overTime.length >= 2 && <ReachOverTime data={overTime} />}
    </div>
  )
}

/** A single-series area line of reach per month, with a hover crosshair + tooltip. */
function ReachOverTime({ data }: { data: { reach: number; label: string }[] }) {
  const W = 560
  const H = 168
  const padX = 10
  const padTop = 14
  const padBottom = 24
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom
  const max = Math.max(...data.map((d) => d.reach), 1)
  const n = data.length
  const x = (i: number) => padX + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => padTop + plotH - (v / max) * plotH
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.reach).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(n - 1).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`

  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const ux = ((e.clientX - rect.left) / rect.width) * W - padX
    const idx = Math.max(0, Math.min(n - 1, Math.round((ux / plotW) * (n - 1))))
    setHover(idx)
  }

  return (
    <section className="fchart">
      <div className="fchart-head">Reach over time</div>
      <div className="fchart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="fchart-svg"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <path d={area} className="fchart-area" />
          <path d={line} className="fchart-line" fill="none" vectorEffect="non-scaling-stroke" />
          {hover != null && (
            <>
              <line
                x1={x(hover)}
                y1={padTop}
                x2={x(hover)}
                y2={padTop + plotH}
                className="fchart-cross"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={x(hover)} cy={y(data[hover].reach)} r={4} className="fchart-dot" />
            </>
          )}
        </svg>
        {hover != null && (
          <div
            className="fchart-tip"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <strong>{formatReach(data[hover].reach)}</strong>
            <span>{data[hover].label}</span>
          </div>
        )}
        <div className="fchart-x">
          <span>{data[0].label}</span>
          <span>{data[data.length - 1].label}</span>
        </div>
      </div>
    </section>
  )
}
