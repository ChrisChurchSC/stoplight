import { CAMPAIGN_COLUMNS, CAMPAIGN_FIELDS, CAMPAIGN_STATUSES } from '../domain/campaignRecord'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <path d="M3 11l18-7-4 16-5-5-4 3z" />
    <path d="M12 15l5 5" />
  </>
)

/** Records › Activation › Campaigns — lightweight campaign planning rows as a spreadsheet. */
export function CampaignRecordsView() {
  const campaignRecords = useTrafficStore((s) => s.campaignRecords)
  const addCampaignRecord = useTrafficStore((s) => s.addCampaignRecord)
  const updateCampaignRecord = useTrafficStore((s) => s.updateCampaignRecord)
  const deleteCampaignRecord = useTrafficStore((s) => s.deleteCampaignRecord)

  return (
    <RecordsTable
      title="Campaigns"
      icon={ICON}
      columns={CAMPAIGN_COLUMNS}
      fields={CAMPAIGN_FIELDS}
      statuses={CAMPAIGN_STATUSES}
      rows={campaignRecords}
      noun={['campaign', 'campaigns']}
      onAdd={() => addCampaignRecord()}
      onUpdate={updateCampaignRecord}
      onDelete={deleteCampaignRecord}
    />
  )
}
