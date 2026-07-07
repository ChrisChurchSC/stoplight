import { SEGMENT_COLUMNS, SEGMENT_FIELDS, SEGMENT_STATUSES } from '../domain/segments'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="m2 13 10 5 10-5" />
  </>
)

/** Records › Segments — the segments store rendered through the generic RecordsTable. */
export function SegmentsView() {
  const segments = useTrafficStore((s) => s.segments)
  const addSegment = useTrafficStore((s) => s.addSegment)
  const updateSegment = useTrafficStore((s) => s.updateSegment)
  const deleteSegment = useTrafficStore((s) => s.deleteSegment)

  return (
    <RecordsTable
      title="Segments"
      icon={ICON}
      columns={SEGMENT_COLUMNS}
      fields={SEGMENT_FIELDS}
      statuses={SEGMENT_STATUSES}
      rows={segments}
      noun={['segment', 'segments']}
      onAdd={() => addSegment()}
      onUpdate={updateSegment}
      onDelete={deleteSegment}
    />
  )
}
