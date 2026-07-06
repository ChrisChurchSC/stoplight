/**
 * TrendChart / Sparkline — compact SVG time-series for the Library reads.
 *
 * TrendChart plots one or more series across a shared month axis. Each series is scaled to
 * its OWN peak, so the shape of every metric reads even when magnitudes differ wildly (reach
 * in the thousands next to subscribers in the tens). The first series can fill as an area;
 * the rest draw as lines. Endpoints are dotted and each series' peak shows in the legend.
 *
 * Sparkline is the same idea shrunk to a single inline cell — no axes, no legend — for
 * per-row trends (a keyword's reach month over month).
 */

export interface TrendSeries {
  name: string
  values: number[]
  color: string
  area?: boolean
  format?: (n: number) => string
}

export function TrendChart({
  labels,
  series,
  height = 150,
  sharedMax = false,
}: {
  labels: string[]
  series: TrendSeries[]
  height?: number
  /** Plot every series against the global peak instead of its own. Use when the point is
   *  the GAP between series (impressions soaring, clicks flatlined at the bottom), not the
   *  shape of each. Default false: each series scaled to its own peak so all shapes read. */
  sharedMax?: boolean
}) {
  const n = labels.length
  if (n < 2 || !series.length) return null
  const globalMax = Math.max(1, ...series.flatMap((s) => s.values))

  const W = 720
  const H = height
  const padL = 8
  const padR = 8
  const padT = 12
  const padB = 20
  const iw = W - padL - padR
  const ih = H - padT - padB
  const x = (i: number) => padL + (i / (n - 1)) * iw
  const y = (v: number, max: number) => padT + ih - (max > 0 ? (v / max) * ih : 0)

  // ~6 evenly spaced x tick labels, always including the last month.
  const step = Math.max(1, Math.ceil(n / 6))
  const ticks = labels.map((l, i) => ({ l, i })).filter(({ i }) => i % step === 0 || i === n - 1)

  return (
    <div className="trend">
      <div className="trend-legend">
        {series.map((s) => {
          const peak = Math.max(...s.values, 0)
          const fmt = s.format ?? ((v: number) => v.toLocaleString())
          return (
            <span className="trend-leg" key={s.name}>
              <span className="trend-leg-dot" style={{ background: s.color }} />
              {s.name}
              <b>{fmt(peak)}</b>
              <em>peak</em>
            </span>
          )
        })}
      </div>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-hidden="true">
        <line className="trend-axis" x1={padL} y1={padT + ih} x2={W - padR} y2={padT + ih} vectorEffect="non-scaling-stroke" />
        {series.map((s) => {
          const max = sharedMax ? globalMax : Math.max(...s.values, 1)
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v, max).toFixed(1)}`)
          const line = `M${pts.join('L')}`
          const area = `M${x(0).toFixed(1)},${(padT + ih).toFixed(1)}L${pts.join('L')}L${x(n - 1).toFixed(1)},${(padT + ih).toFixed(1)}Z`
          const li = n - 1
          return (
            <g key={s.name}>
              {s.area && <path className="trend-area" d={area} fill={s.color} />}
              <path className="trend-line" d={line} fill="none" stroke={s.color} vectorEffect="non-scaling-stroke" />
              <circle cx={x(li)} cy={y(s.values[li], max)} r={2.6} fill={s.color} vectorEffect="non-scaling-stroke" />
            </g>
          )
        })}
      </svg>
      <div className="trend-x">
        {ticks.map(({ l, i }) => (
          <span key={i} style={{ left: `${(x(i) / W) * 100}%` }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Sparkline({
  values,
  color = 'var(--accent-3)',
  width = 132,
  height = 30,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return <svg className="spark" width={width} height={height} aria-hidden="true" />
  const n = values.length
  const max = Math.max(...values, 1)
  const x = (i: number) => (i / (n - 1)) * width
  const y = (v: number) => height - 1 - (v / max) * (height - 3)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${pts.join('L')}`
  const area = `M0,${height}L${pts.join('L')}L${width},${height}Z`
  const li = n - 1
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      <path d={area} fill={color} opacity={0.14} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={x(li)} cy={y(values[li])} r={1.9} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
