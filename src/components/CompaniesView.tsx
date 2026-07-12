import { type Company, COMPANY_COLUMNS, COMPANY_FIELDS, COMPANY_STATUSES } from '../domain/companies'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'
import { RelatedList } from './RelatedList'

const ICON = (
  <>
    <rect x="4" y="3" width="10" height="18" rx="1.5" />
    <path d="M14 8h6v13H4" />
    <path d="M7.5 7h3M7.5 11h3M7.5 15h3M17 12h0M17 16h0" />
  </>
)

/** Records › Companies — the companies store rendered through the generic RecordsTable. The drawer
 *  surfaces the people who work at each company (Person.company → Company.name). */
export function CompaniesView() {
  const companies = useTrafficStore((s) => s.companies)
  const people = useTrafficStore((s) => s.people)
  const setPage = useTrafficStore((s) => s.setPage)
  const focusRecord = useTrafficStore((s) => s.focusRecord)
  const addCompany = useTrafficStore((s) => s.addCompany)
  const updateCompany = useTrafficStore((s) => s.updateCompany)
  const deleteCompany = useTrafficStore((s) => s.deleteCompany)

  // The "Audience segment" field picks from the active brand's Segments (personas), so a company
  // can be tagged to the persona it belongs to. Scoped to the brand in view since audiences differ.
  const { brands } = useHomeCanvases()
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const brand = clientFilter !== 'all' ? clientFilter : brands[0]?.name ?? ''
  const segmentNames = (clientAudiences[brand] ?? []).map((a) => a.name).filter(Boolean)

  return (
    <RecordsTable<Company>
      title="Companies"
      icon={ICON}
      columns={COMPANY_COLUMNS}
      fields={COMPANY_FIELDS}
      statuses={COMPANY_STATUSES}
      rows={companies}
      noun={['company', 'companies']}
      onAdd={() => addCompany()}
      onUpdate={updateCompany}
      onDelete={deleteCompany}
      fieldOptions={{ audienceSegment: segmentNames }}
      relatedSlot={(company) => {
        const norm = company.name.trim().toLowerCase()
        const atCompany = people.filter((p) => (p.company ?? '').trim().toLowerCase() === norm)
        return (
          <RelatedList
            title="People"
            empty="No people at this company yet — set a person's Company to this name."
            items={atCompany.map((p) => ({
              id: p.id,
              name: p.name,
              sub: p.title,
              onOpen: () => {
                focusRecord(p.id)
                setPage('people')
              },
            }))}
          />
        )
      }}
    />
  )
}
