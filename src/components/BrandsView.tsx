import { BRAND_COLUMNS, BRAND_FIELDS, BRAND_STATUSES } from '../domain/brandRecord'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

// A diamond — the brand mark.
const ICON = <path d="M12 2 22 12 12 22 2 12Z" />

/**
 * Records › Brands — your own brands/clients, the entities you build Flows/Library/Insights FOR
 * (distinct from Audience › Companies, who you target). Same records-table shape as every other
 * sheet; naming a brand registers it as a real workspace client (see updateBrandRecord).
 */
export function BrandsView() {
  const brandRecords = useTrafficStore((s) => s.brandRecords)
  const addBrandRecord = useTrafficStore((s) => s.addBrandRecord)
  const updateBrandRecord = useTrafficStore((s) => s.updateBrandRecord)
  const deleteBrandRecord = useTrafficStore((s) => s.deleteBrandRecord)

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
