import { OBJECTIVE_COLUMNS, OBJECTIVE_FIELDS, OBJECTIVE_STATUSES } from '../domain/objective'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </>
)

/** Records › Message › Objectives — measurable goals as a spreadsheet. */
export function ObjectivesView() {
  const objectives = useTrafficStore((s) => s.objectives)
  const addObjective = useTrafficStore((s) => s.addObjective)
  const updateObjective = useTrafficStore((s) => s.updateObjective)
  const deleteObjective = useTrafficStore((s) => s.deleteObjective)

  return (
    <RecordsTable
      title="Objectives"
      icon={ICON}
      columns={OBJECTIVE_COLUMNS}
      fields={OBJECTIVE_FIELDS}
      statuses={OBJECTIVE_STATUSES}
      rows={objectives}
      noun={['objective', 'objectives']}
      onAdd={() => addObjective()}
      onUpdate={updateObjective}
      onDelete={deleteObjective}
    />
  )
}
