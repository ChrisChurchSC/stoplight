import { BRAND_COLUMNS, BRAND_FIELDS, BRAND_STATUSES } from '../domain/brandRecord'
import { useTrafficStore } from '../store/useTrafficStore'
import { BrandTable } from './BrandTable'
import { RecordsTable } from './RecordsTable'

// A diamond — the brand mark.
const ICON = <path d="M12 2 22 12 12 22 2 12Z" />

/**
 * Records › Brands — your own brands/clients, the entities you build Flows/Library/Insights FOR
 * (distinct from Audience › Companies, who you target). The rail scopes the page to a single brand,
 * so that case shows a table ABOUT that one brand (its strategy attributes as rows, grouped into the
 * section bands). "All brands" shows the standard multi-row record table across every brand.
 */
export function BrandsView() {
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const updateBrandRecord = useTrafficStore((s) => s.updateBrandRecord)
  const deleteBrandRecord = useTrafficStore((s) => s.deleteBrandRecord)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  // Scoped to one brand (the common case): a single-brand strategy table.
  const one = clientFilter !== 'all' ? brandRecords.find((b) => b.name === clientFilter) : undefined
  if (one) {
    return (
      <BrandTable
        brand={one}
        fields={BRAND_FIELDS}
        statuses={BRAND_STATUSES}
        onUpdate={updateBrandRecord}
        onDelete={(id) => {
          // Drop back to the portfolio view before removing, so we're not scoped to a deleted brand.
          setClientFilter('all')
          deleteBrandRecord(id)
        }}
      />
    )
  }

  return (
    <RecordsTable
      title="Brands"
      icon={ICON}
      columns={BRAND_COLUMNS}
      fields={BRAND_FIELDS}
      statuses={BRAND_STATUSES}
      rows={brandRecords}
      noun={['brand', 'brands']}
      onAdd={() => addBrandRecord()}
      onUpdate={updateBrandRecord}
      onDelete={deleteBrandRecord}
    />
  )
}
