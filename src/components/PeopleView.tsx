import { canvasBrandScope } from '../domain/brand'
import { type Person, PEOPLE_COLUMNS, PEOPLE_FIELDS, PEOPLE_STATUSES } from '../domain/people'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'
import { RelatedList } from './RelatedList'

const ICON = (
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M4 20a5 5 0 0 1 10 0" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6" />
    <path d="M17 14.5a5 5 0 0 1 3 5.5" />
  </>
)

/** Records › People — the people store rendered through the generic RecordsTable. The drawer links
 *  the person's company (opens that Companies record) and lists their colleagues there. */
export function PeopleView() {
  const people = useTrafficStore((s) => s.people)
  const companies = useTrafficStore((s) => s.companies)
  const focusRecord = useTrafficStore((s) => s.focusRecord)
  const jumpToRecord = useTrafficStore((s) => s.jumpToRecord)
  const addPerson = useTrafficStore((s) => s.addPerson)
  const updatePerson = useTrafficStore((s) => s.updatePerson)
  const deletePerson = useTrafficStore((s) => s.deletePerson)

  // Scope to the brand in the rail; untagged records show under every brand rather than vanishing.
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  // Scoped by canvasBrandScope, not by "whichever brand is first": with several in the account and
  // none selected, guessing one showed that brand's records here and filed anything added under it.
  const brand = canvasBrandScope(clientFilter, brands.map((b) => b.name))
  const scoped = people.filter((p) => !p.brand || p.brand === brand)

  return (
    <RecordsTable<Person>
      title="People"
      term="person"
      icon={ICON}
      columns={PEOPLE_COLUMNS}
      fields={PEOPLE_FIELDS}
      statuses={PEOPLE_STATUSES}
      rows={scoped}
      noun={['person', 'people']}
      onAdd={() => addPerson({ brand })}
      onUpdate={updatePerson}
      onDelete={deletePerson}
      fieldOptions={{ company: companies.map((c) => c.name).filter(Boolean) }}
      relatedSlot={(person) => {
        const co = (person.company ?? '').trim()
        const norm = co.toLowerCase()
        const company = co ? companies.find((c) => c.name.trim().toLowerCase() === norm) : undefined
        const colleagues = norm
          ? people.filter((p) => p.id !== person.id && (p.company ?? '').trim().toLowerCase() === norm)
          : []
        return (
          <>
            {co && (
              <RelatedList
                title="Company"
                empty={`"${co}" isn't in Companies yet.`}
                items={
                  company
                    ? [
                        {
                          id: company.id,
                          name: company.name,
                          sub: company.segment,
                          onOpen: () => {
                            jumpToRecord(company.id, 'records')
                          },
                        },
                      ]
                    : []
                }
              />
            )}
            {colleagues.length > 0 && (
              <RelatedList
                title="Colleagues"
                items={colleagues.map((p) => ({
                  id: p.id,
                  name: p.name,
                  sub: p.title,
                  onOpen: () => focusRecord(p.id),
                }))}
              />
            )}
          </>
        )
      }}
    />
  )
}
