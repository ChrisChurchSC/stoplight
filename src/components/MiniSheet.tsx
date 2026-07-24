/**
 * A tiny non-interactive spreadsheet — a header band over a few body rows, with filled cells
 * reflecting where the real data set actually has content, so anything backed by a data set reads
 * as "data". Shared by the brand-page data-set cards and the canvas Data source cards.
 */
export function MiniSheet({ columns, rows, bodyRows = 4 }: { columns: string[]; rows: string[][]; bodyRows?: number }) {
  const cols = Math.min(Math.max(columns.length, 1), 5)
  return (
    <div className="bds-mini" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols }, (_, c) => (
        <div key={`h${c}`} className="bds-mini-cell head" />
      ))}
      {Array.from({ length: bodyRows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const filled = !!rows[r]?.[c]?.trim()
          return <div key={`${r}-${c}`} className={`bds-mini-cell${filled ? ' filled' : ''}`} />
        }),
      )}
    </div>
  )
}
