import { PEOPLE_COLUMNS, PEOPLE_FIELDS, PEOPLE_STATUSES } from '../domain/people'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M4 20a5 5 0 0 1 10 0" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6" />
    <path d="M17 14.5a5 5 0 0 1 3 5.5" />
  </>
)

/** Records › People — the people store rendered through the generic RecordsTable. */
export function PeopleView() {
  const people = useTrafficStore((s) => s.people)
  const addPerson = useTrafficStore((s) => s.addPerson)
  const updatePerson = useTrafficStore((s) => s.updatePerson)
  const deletePerson = useTrafficStore((s) => s.deletePerson)

  return (
    <RecordsTable
      title="People"
      icon={ICON}
      columns={PEOPLE_COLUMNS}
      fields={PEOPLE_FIELDS}
      statuses={PEOPLE_STATUSES}
      rows={people}
      noun={['person', 'people']}
      onAdd={() => addPerson()}
      onUpdate={updatePerson}
      onDelete={deletePerson}
    />
  )
}
