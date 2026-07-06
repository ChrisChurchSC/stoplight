/**
 * Granola mark: a rounded olive-green square with a black spiral, shown on meeting-note
 * assets ingested from Granola. The spiral is an Archimedean path (outer top, curling
 * clockwise into the center), computed once.
 */
const SPIRAL = (() => {
  const cx = 12
  const cy = 12
  const turns = 2.5
  const maxR = 8.6
  const steps = 170
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const th = -Math.PI / 2 + t * turns * 2 * Math.PI // start at top, go clockwise
    const r = maxR * (1 - t) // spiral inward to the center
    const x = cx + r * Math.cos(th)
    const y = cy + r * Math.sin(th)
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `
  }
  return d.trim()
})()

export function GranolaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Granola">
      <rect width="24" height="24" rx="5.5" fill="#AFC84A" />
      <path d={SPIRAL} fill="none" stroke="#141414" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
