import { CHANNEL_RECORD_COLUMNS, CHANNEL_RECORD_FIELDS, CHANNEL_RECORD_STATUSES } from '../domain/channelRecords'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

// Matches the Channels sidebar-nav icon (linked nodes).
const ICON = (
  <>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="18" cy="6" r="2.4" />
    <circle cx="12" cy="18" r="2.4" />
    <path d="M6 8.4v3a2 2 0 0 0 2 2h2.4M18 8.4v3a2 2 0 0 1-2 2h-2.4" />
  </>
)

/** Records › Channels — the channel taxonomy rendered through the generic RecordsTable. */
export function ChannelRecordsView() {
  const channelRecords = useTrafficStore((s) => s.channelRecords)
  const addChannelRecord = useTrafficStore((s) => s.addChannelRecord)
  const updateChannelRecord = useTrafficStore((s) => s.updateChannelRecord)
  const deleteChannelRecord = useTrafficStore((s) => s.deleteChannelRecord)

  return (
    <RecordsTable
      title="Channels"
      icon={ICON}
      columns={CHANNEL_RECORD_COLUMNS}
      fields={CHANNEL_RECORD_FIELDS}
      statuses={CHANNEL_RECORD_STATUSES}
      rows={channelRecords}
      noun={['channel', 'channels']}
      onAdd={() => addChannelRecord()}
      onUpdate={updateChannelRecord}
      onDelete={deleteChannelRecord}
    />
  )
}
