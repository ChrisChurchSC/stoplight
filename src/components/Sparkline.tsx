import { sparkPath, type MetricTrend } from '../domain/assetTrend'

/**
 * ONE METRIC'S SHAPE, beside the number itself.
 *
 * A stat tile's trend, not a chart: the value is already on screen in the field next to this, so
 * this answers the question the number cannot — did it arrive in a day or is it still climbing.
 *
 * NO AXES, NO GRID, NO LEGEND, and each for a reason rather than for room. One series needs no
 * legend: the label above it names it. Axes on a 92px plot cost more pixels than they inform, and
 * the two numbers worth reading — where it is now, and what it moved — are printed as text beside
 * it, where they are selectable and legible rather than inferred off a tick.
 *
 * The endpoint is emphasized because "now" is the point anybody is actually looking for, and a line
 * that simply stops leaves you hunting for which end is the recent one.
 *
 * COLOUR. `--chart-line` rather than `--green`: the app's green is tuned for UI chrome, and its dark
 * step sits outside the lightness band a 2px data mark needs on a dark ground. This one is validated
 * against both chart surfaces. The fill is the same hue mixed into the surface — a fill is not
 * carrying identity, so it is free to be quiet.
 */

interface Props {
  trend: MetricTrend
  /** What the metric is called, for the accessible description. */
  label: string
  width?: number
  height?: number
}

export function Sparkline({ trend, label, width = 92, height = 24 }: Props) {
  const { points } = trend
  // One reading is a dot, not a line: drawing a line through a single point invents a direction.
  const path = sparkPath(points, width, height)
  const last = points[points.length - 1]
  const lastX = points.length === 1 ? width / 2 : width
  const lastY = (() => {
    const values = points.map((p) => p.value)
    const top = Math.max(...values, 0)
    const floor = Math.min(...values, 0)
    const range = top - floor
    return range > 0 ? height - ((last.value - floor) / range) * height : height / 2
  })()

  const when = new Date(last.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const summary =
    points.length === 1
      ? `${label}: one reading, ${last.value.toLocaleString()} on ${when}.`
      : `${label}: ${points.length} readings, ${trend.first.toLocaleString()} to ${trend.latest.toLocaleString()}, latest ${when}.`

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={summary}
      preserveAspectRatio="none"
    >
      {/* The native tooltip is the hover layer at this size. A crosshair over 92px of plot would
          cover the thing it is reading out. */}
      <title>{summary}</title>
      {points.length > 1 && (
        <path className="spark-fill" d={`${path} L${width} ${height} L0 ${height} Z`} />
      )}
      {points.length > 1 && <path className="spark-line" d={path} />}
      <circle className="spark-end" cx={lastX} cy={lastY} r={points.length === 1 ? 3 : 2.5} />
    </svg>
  )
}
