import { BRAND_FIELDS, BRAND_STATUSES } from '../domain/brandRecord'
import { useTrafficStore } from '../store/useTrafficStore'
import { BrandTable } from './BrandTable'

/**
 * Brand — this brand's communications strategy in one place: its attributes as Field | Value rows,
 * grouped into the section bands (Overview / Strategic Foundation / Message Architecture / Execution /
 * Measurement). Always scoped to a SINGLE brand — the rail picks which one. There is deliberately no
 * cross-brand "all brands" table: a workspace works one brand at a time, so an every-brand roster
 * would leak the whole portfolio. When nothing is scoped we fall back to the first brand.
 */
export function BrandsView() {
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const updateBrandRecord = useTrafficStore((s) => s.updateBrandRecord)
  const deleteBrandRecord = useTrafficStore((s) => s.deleteBrandRecord)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  // Scope to the active brand; fall back to the first brand if nothing is selected ('all').
  const one = brandRecords.find((b) => b.name === clientFilter) ?? brandRecords[0]

  if (!one) {
    return (
      <div className="mtx-empty">
        No brand yet.{' '}
        <button className="link-btn" onClick={() => addBrandRecord()}>
          Add a brand
        </button>{' '}
        to start its strategy.
      </div>
    )
  }

  return (
    <BrandTable
      brand={one}
      fields={BRAND_FIELDS}
      statuses={BRAND_STATUSES}
      onUpdate={updateBrandRecord}
      onDelete={(id) => {
        // Drop the scope before removing so we're not pinned to a deleted brand.
        setClientFilter('all')
        deleteBrandRecord(id)
      }}
    />
  )
}
