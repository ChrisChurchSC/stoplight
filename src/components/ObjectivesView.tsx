import { canvasBrandScope } from '../domain/brand'
import { OBJECTIVE_COLUMNS, OBJECTIVE_FIELDS, OBJECTIVE_STATUSES } from '../domain/objective'
import { useHomeCanvases } from '../lib/useHomeCanvases'
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

  // Scope to the brand in the rail; untagged records show under every brand rather than vanishing.
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  // Scoped by canvasBrandScope, not by "whichever brand is first": with several in the account and
  // none selected, guessing one showed that brand's records here and filed anything added under it.
  const brand = canvasBrandScope(clientFilter, brands.map((b) => b.name))
  const scoped = objectives.filter((o) => !o.brand || o.brand === brand)

  return (
    <RecordsTable
      title="Objectives"
      term="objective"
      icon={ICON}
      columns={OBJECTIVE_COLUMNS}
      fields={OBJECTIVE_FIELDS}
      statuses={OBJECTIVE_STATUSES}
      rows={scoped}
      noun={['objective', 'objectives']}
      onAdd={() => addObjective({ brand })}
      onUpdate={updateObjective}
      onDelete={deleteObjective}
    />
  )
}
