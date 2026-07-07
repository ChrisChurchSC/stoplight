import { COMPANY_COLUMNS, COMPANY_FIELDS, COMPANY_STATUSES } from '../domain/companies'
import { useTrafficStore } from '../store/useTrafficStore'
import { RecordsTable } from './RecordsTable'

const ICON = (
  <>
    <rect x="4" y="3" width="10" height="18" rx="1.5" />
    <path d="M14 8h6v13H4" />
    <path d="M7.5 7h3M7.5 11h3M7.5 15h3M17 12h0M17 16h0" />
  </>
)

/** Records › Companies — the companies store rendered through the generic RecordsTable. */
export function CompaniesView() {
  const companies = useTrafficStore((s) => s.companies)
  const addCompany = useTrafficStore((s) => s.addCompany)
  const updateCompany = useTrafficStore((s) => s.updateCompany)
  const deleteCompany = useTrafficStore((s) => s.deleteCompany)

  return (
    <RecordsTable
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
    />
  )
}
