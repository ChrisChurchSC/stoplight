import { useRef, useState } from 'react'
import type { Competitor } from '../domain/clients'

/**
 * PositioningMap — a 2x2 perceptual map for the Landscape page. Competitors are plotted on
 * two axes you name; the brand's own dot sits where its wedge lives. The emptiest quadrant
 * is shaded and labelled: that's the white space, the ground no competitor holds. Dots are
 * draggable, so arranging the market is the interaction, and each drag persists coordinates.
 */

const KIND_COLOR: Record<string, string> = {
  answer: 'var(--accent-3)',
  attention: 'var(--accent-2)',
  model: 'var(--accent)',
}

// Plot inset inside the 100x100 viewBox: room at top/bottom for the y labels, at the
// sides for the (rotated) x labels.
const PX0 = 8
const PX1 = 92
const PY0 = 10
const PY1 = 90
const sx = (x: number) => PX0 + (clamp(x) / 100) * (PX1 - PX0)
const sy = (y: number) => PY0 + ((100 - clamp(y)) / 100) * (PY1 - PY0)

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/** A short label for a crowded map: the first segment before " & " or " / ", capped. */
function shortLabel(name: string): string {
  const seg = name.split(/\s*[&/]\s*/)[0].trim()
  return seg.length > 20 ? `${seg.slice(0, 19)}…` : seg
}

interface Placed {
  i: number
  name: string
  kind: string
  x: number
  y: number
}

export function PositioningMap({
  competitors,
  self,
  axes,
  onMoveCompetitor,
  onMoveSelf,
}: {
  competitors: Competitor[]
  self: { name: string; x: number; y: number }
  axes: { xLow: string; xHigh: string; yLow: string; yHigh: string }
  onMoveCompetitor: (i: number, x: number, y: number) => void
  onMoveSelf: (x: number, y: number) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{ type: 'self' | 'comp'; i: number } | null>(null)

  // Only named competitors get a dot; default an unplaced one to the centre.
  const placed: Placed[] = competitors
    .map((c, i) => ({ i, name: c.name, kind: c.kind ?? 'answer', x: c.x ?? 50, y: c.y ?? 50 }))
    .filter((p) => p.name.trim())

  // White space = the emptiest quadrant (split at the midlines). Prefer the one the brand
  // itself sits in, so the read is "the open ground is where you already are."
  const quad = (x: number, y: number) => `${x >= 50 ? 'R' : 'L'}${y >= 50 ? 'T' : 'B'}`
  const counts: Record<string, number> = { RT: 0, LT: 0, RB: 0, LB: 0 }
  for (const p of placed) counts[quad(p.x, p.y)]++
  const min = Math.min(...Object.values(counts))
  const selfQuad = quad(self.x, self.y)
  const white = counts[selfQuad] === min ? selfQuad : (Object.keys(counts).find((q) => counts[q] === min) ?? 'RT')
  // The shaded rect for that quadrant (in screen units).
  const wr = {
    x: white[0] === 'R' ? 50 : PX0,
    y: white[1] === 'T' ? PY0 : 50,
    w: PX1 - 50 > 0 ? (white[0] === 'R' ? PX1 - 50 : 50 - PX0) : 0,
    h: white[1] === 'T' ? 50 - PY0 : PY1 - 50,
  }
  const wLabel = `${white[0] === 'R' ? axes.xHigh : axes.xLow} + ${white[1] === 'T' ? axes.yHigh : axes.yLow}`

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    const vbX = ((e.clientX - r.left) / r.width) * 100
    const vbY = ((e.clientY - r.top) / r.height) * 100
    const x = clamp(((vbX - PX0) / (PX1 - PX0)) * 100)
    const y = clamp(100 - ((vbY - PY0) / (PY1 - PY0)) * 100)
    if (drag.type === 'self') onMoveSelf(x, y)
    else onMoveCompetitor(drag.i, x, y)
  }
  // Labels sit to the right of their dot, but flip left near the right edge so they
  // don't run off the plot.
  const labelX = (x: number, off: number) => (x > 66 ? sx(x) - off : sx(x) + off)
  const labelAnchor = (x: number) => (x > 66 ? 'end' : 'start')

  const start = (type: 'self' | 'comp', i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    setDrag({ type, i })
  }
  const end = (e: React.PointerEvent) => {
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    setDrag(null)
  }

  return (
    <div className="pmap-wrap">
      <svg
        ref={svgRef}
        className="pmap"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerLeave={end}
        role="img"
        aria-label="Competitive positioning map"
      >
        {/* white-space quadrant */}
        <rect className="pmap-white" x={wr.x} y={wr.y} width={wr.w} height={wr.h} rx={1} />
        <text className="pmap-white-lab" x={wr.x + wr.w / 2} y={wr.y + wr.h / 2 - 2} textAnchor="middle">
          White space
        </text>
        <text className="pmap-white-sub" x={wr.x + wr.w / 2} y={wr.y + wr.h / 2 + 3} textAnchor="middle">
          {wLabel}
        </text>

        {/* frame + midlines */}
        <rect className="pmap-frame" x={PX0} y={PY0} width={PX1 - PX0} height={PY1 - PY0} rx={1.5} />
        <line className="pmap-mid" x1={50} y1={PY0} x2={50} y2={PY1} />
        <line className="pmap-mid" x1={PX0} y1={50} x2={PX1} y2={50} />

        {/* axis end labels */}
        <text className="pmap-axis" x={50} y={PY0 - 3.5} textAnchor="middle">
          {axes.yHigh}
        </text>
        <text className="pmap-axis" x={50} y={PY1 + 5.5} textAnchor="middle">
          {axes.yLow}
        </text>
        <text className="pmap-axis" x={4} y={50} textAnchor="middle" transform="rotate(-90 4 50)">
          {axes.xLow}
        </text>
        <text className="pmap-axis" x={96} y={50} textAnchor="middle" transform="rotate(-90 96 50)">
          {axes.xHigh}
        </text>

        {/* competitor dots */}
        {placed.map((p) => (
          <g key={p.i} className="pmap-dot" onPointerDown={start('comp', p.i)}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={1.9} fill={KIND_COLOR[p.kind] ?? 'var(--accent-3)'} />
            <text className="pmap-lab" x={labelX(p.x, 3)} y={sy(p.y) + 1.2} textAnchor={labelAnchor(p.x)}>
              {shortLabel(p.name)}
              <title>{p.name}</title>
            </text>
          </g>
        ))}

        {/* the brand itself */}
        <g className="pmap-dot pmap-self" onPointerDown={start('self', 0)}>
          <circle cx={sx(self.x)} cy={sy(self.y)} r={3.2} className="pmap-self-ring" />
          <circle cx={sx(self.x)} cy={sy(self.y)} r={1.9} className="pmap-self-core" />
          <text className="pmap-lab pmap-self-lab" x={labelX(self.x, 4.4)} y={sy(self.y) + 1.2} textAnchor={labelAnchor(self.x)}>
            {self.name}
          </text>
        </g>
      </svg>
      <p className="pmap-hint">Drag any dot to reposition it. The shaded quadrant is the ground no competitor holds.</p>
    </div>
  )
}
