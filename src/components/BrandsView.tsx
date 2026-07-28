import { BRAND_FIELDS, BRAND_STATUSES } from '../domain/brandRecord'
import { clientForCampaign } from '../domain/clients'
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
  const deleteClient = useTrafficStore((s) => s.deleteClient)
  const clientList = useTrafficStore((s) => s.clientList)
  const setClientFilter = useTrafficStore((s) => s.setClientFilter)

  const campaignList = useTrafficStore((s) => s.campaignList)
  const rows = useTrafficStore((s) => s.rows)

  // Scope to the active brand. Only fall back to the first brand when NOTHING is scoped: falling
  // back while scoped showed one brand's strategy under another brand's name, and now that delete
  // removes the brand for real, it would have deleted the wrong one.
  const one = clientFilter === 'all' ? brandRecords[0] : brandRecords.find((b) => b.name === clientFilter)

  // Deleting a brand takes its work with it, so the confirm names what goes rather than implying
  // this is only the strategy sheet.
  // Falls back to the scoped brand so the counts are right even when it has no strategy sheet yet.
  const name = one?.name.trim() || (clientFilter !== 'all' ? clientFilter : '')
  const nCampaigns = name ? campaignList.filter((c) => c.client === name).length : 0
  const nAssets = name ? rows.filter((r) => clientForCampaign(r.campaign) === name).length : 0
  const parts = [
    nCampaigns ? `${nCampaigns} campaign${nCampaigns === 1 ? '' : 's'}` : '',
    nAssets ? `${nAssets} asset${nAssets === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  const deleteNote = parts.length ? `its ${parts.join(' and ')}` : ''

  if (!one) {
    // Scoped to a brand that has no strategy sheet yet: offer to start ITS sheet, named, rather
    // than a generic blank.
    const scoped = clientFilter !== 'all' ? clientFilter : ''
    return (
      <div className="mtx-empty">
        {scoped ? `${scoped} has no strategy yet.` : 'No brand yet.'}{' '}
        <button className="link-btn" onClick={() => addBrandRecord(scoped ? { name: scoped } : undefined)}>
          {scoped ? 'Start it' : 'Add a brand'}
        </button>{' '}
        to {scoped ? 'fill in' : 'start'} its strategy.
        {/* A brand with no strategy sheet still owns campaigns, canvases and tasks, and without this
            there was no way to remove it: the delete lives on the sheet that doesn't exist yet. */}
        {scoped && clientList.includes(scoped) && (
          <>
            {' Or '}
            <button className="link-btn" onClick={() => { setClientFilter('all'); void deleteClient(scoped) }}>
              delete {scoped}
            </button>
            {deleteNote ? ` and ${deleteNote}.` : '.'}
          </>
        )}
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
        // The confirm says "Delete this brand?", so delete the BRAND, not just its strategy sheet.
        // Removing only the record left the brand itself alive (client entry, campaigns, canvases,
        // library, tasks), and those are mirrored to the workspace, so they reappeared on any fresh
        // device. deleteClient sweeps all of it, including this record.
        if (clientList.includes(one.name.trim())) void deleteClient(one.name.trim())
        else deleteBrandRecord(id)
      }}
      deleteNote={deleteNote}
    />
  )
}
