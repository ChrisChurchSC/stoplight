/**
 * Granola mark, shown on meeting-note assets ingested from Granola. This is a clean
 * stand-in badge; drop in the official Granola SVG here to replace it everywhere.
 */
export function GranolaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label="Granola">
      <rect width="24" height="24" rx="6" fill="#111113" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="15"
        fontStyle="italic"
        fill="#EFE6D2"
      >
        g
      </text>
    </svg>
  )
}
