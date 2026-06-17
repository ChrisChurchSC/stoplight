import { mockAttio } from '../adapters/attio/mockAttio'
import { money } from '../domain/budget'
import { useTrafficStore } from '../store/useTrafficStore'

interface Invoice {
  id: string
  date: string
  amount: number
  status: 'paid' | 'due'
}

const INVOICES: Invoice[] = [
  { id: 'INV-0007', date: 'Jun 1, 2026', amount: 1200, status: 'paid' },
  { id: 'INV-0006', date: 'May 1, 2026', amount: 1200, status: 'paid' },
  { id: 'INV-0005', date: 'Apr 1, 2026', amount: 900, status: 'paid' },
]

export function BillingPage() {
  const rows = useTrafficStore((s) => s.rows)

  const trafficked = rows.length
  const posted = rows.filter((r) => r.status === 'posted').length
  const attributed = money(mockAttio.totalWonRevenue())

  return (
    <div className="page">
      <div className="page-head">
        <h1>Billing</h1>
        <span className="page-sub">Plan, usage, and invoices</span>
      </div>
      <div className="page-body">
        <div className="billing-top">
          <div className="billing-plan">
            <div className="billing-plan-label">Current plan</div>
            <div className="billing-plan-name">Agency</div>
            <div className="billing-plan-price">$1,200<span>/mo</span></div>
            <div className="billing-plan-meta">Up to 5 clients · unlimited assets · all connectors</div>
            <button className="btn sm" disabled>Change plan</button>
          </div>

          <div className="billing-usage">
            <div className="billing-usage-row">
              <span className="billing-usage-label">Assets trafficked</span>
              <span className="billing-usage-value">{trafficked} / 1,000</span>
            </div>
            <div className="billing-usage-row">
              <span className="billing-usage-label">Posts published</span>
              <span className="billing-usage-value">{posted}</span>
            </div>
            <div className="billing-usage-row">
              <span className="billing-usage-label">Attributed revenue (this cycle)</span>
              <span className="billing-usage-value">{attributed}</span>
            </div>
            <div className="billing-usage-row">
              <span className="billing-usage-label">Payment method</span>
              <span className="billing-usage-value">Visa ···· 4242</span>
            </div>
          </div>
        </div>

        <div className="billing-invoices">
          <div className="billing-invoices-head">Invoices</div>
          <table className="billing-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.id}</td>
                  <td>{inv.date}</td>
                  <td>{money(inv.amount)}</td>
                  <td>
                    <span className={`billing-status s-${inv.status}`}>
                      {inv.status === 'paid' ? 'Paid' : 'Due'}
                    </span>
                  </td>
                  <td><button className="btn ghost sm" disabled>Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
