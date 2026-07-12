import { BRAND_COLUMNS, BRAND_FIELDS, BRAND_STATUSES } from '../domain/brandRecord'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

// A diamond — the brand mark.
const ICON = <path d="M12 2 22 12 12 22 2 12Z" />

/**
 * Records › Brands — your own brands/clients, the entities you build Flows/Library/Insights FOR
 * (distinct from Audience › Companies, who you target). Same records-table shape as every other
 * sheet; naming a brand registers it as a real workspace client (see updateBrandRecord).
 *
 * Scoped by the sidebar: picking a brand shows just that brand as its own single-row spreadsheet;
 * "All brands" (clientFilter = 'all') shows the full table.
 */
export function BrandsView() {
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const updateBrandRecord = useTrafficStore((s) => s.updateBrandRecord)
  const deleteBrandRecord = useTrafficStore((s) => s.deleteBrandRecord)

  // Scoped to one brand → that brand as its own single-row sheet; "All brands" → the full table.
  const scoped = clientFilter !== 'all' ? brandRecords.find((b) => b.name === clientFilter) : undefined

  return (
    <RecordsTable
      title={scoped ? scoped.name : 'Brands'}
      icon={ICON}
      columns={BRAND_COLUMNS}
      fields={BRAND_FIELDS}
      statuses={BRAND_STATUSES}
      rows={scoped ? [scoped] : brandRecords}
      noun={['brand', 'brands']}
      onAdd={() => {
        if (scoped) setClientFilter('all')
        return addBrandRecord()
      }}
      onUpdate={updateBrandRecord}
      onDelete={deleteBrandRecord}
    />
  )
}
