import {
  AUDIT_LABEL,
  SEVERITY_RANK,
  applyBreakStatus,
  detectAcmeBreaks,
} from '../domain/breaks'
import { rowInScope } from '../lib/scope'
import { useTrafficStore } from '../store/useTrafficStore'
import { BreakCard } from './BreakCard'

/** The Breaks queue — a stacked list of Break cards, opened from the header. */
export function BreaksQueue() {
  const open = useTrafficStore((s) => s.breaksOpen)
  const close = useTrafficStore((s) => s.closeBreaks)
  const activeBreakId = useTrafficStore((s) => s.activeBreakId)
  const rows = useTrafficStore((s) => s.rows)
  const clientFilter = useTrafficStore((s) => s.clientFilter)
  const campaignFilter = useTrafficStore((s) => s.campaignFilter)
  const breakStatus = useTrafficStore((s) => s.breakStatus)
  const auditLog = useTrafficStore((s) => s.auditLog)
  const brandGuides = useTrafficStore((s) => s.brandGuides)
  const openReadiness = useTrafficStore((s) => s.openReadiness)

  if (!open) return null

  // The check measures against the client's brand guide — surface which standard,
  // or nudge to confirm one so the check has something to evaluate against.
  const client = clientFilter !== 'all' ? clientFilter : ''
  const brand = client ? brandGuides[client] : undefined
  const brandReady = !!brand?.confirmed

  const scoped = rows.filter((r) =>
    rowInScope(r, { filter: 'all', query: '', clientFilter, campaignFilter }),
  )
  const breaks = applyBreakStatus(detectAcmeBreaks(scoped), breakStatus)
  // Open breaks first, then by severity; dismissed/in-review settle to the bottom.
  const ordered = [...breaks].sort(
    (a, b) =>
      (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )
  const openCount = breaks.filter((b) => b.status === 'open').length
  const recentAudit = auditLog.slice(0, 6)

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer breaks-queue">
        <div className="drawer-head">
          <strong>Connection check</strong>
          <span className={`breaks-count${openCount > 0 ? ' bad' : ' ok'}`}>
            {openCount} break{openCount === 1 ? '' : 's'}
          </span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={close}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {client && (
            brandReady ? (
              <div className="breaks-brand ok" title={brand!.guide.voice}>
                ⊘ Checked against {client}'s brand guide
              </div>
            ) : (
              <button className="breaks-brand warn" onClick={() => { close(); openReadiness() }}>
                ⚠ No confirmed brand guide — the check has no standard to measure against. Confirm one →
              </button>
            )
          )}
          {ordered.length === 0 ? (
            <div className="breaks-empty">
              ✓ Every asset in scope tells one story. No breaks in the thread.
            </div>
          ) : (
            <>
              <p className="breaks-intro">
                Generation is the commodity. This is the contract: every place the thread breaks,
                why it breaks, and the one click that repairs it.
              </p>
              {ordered.map((brk) => (
                <BreakCard key={brk.id} brk={brk} active={brk.id === activeBreakId} />
              ))}
            </>
          )}

          {recentAudit.length > 0 && (
            <div className="audit-log">
              <div className="audit-log-head">Audit trail</div>
              <p className="audit-log-sub">
                Every check and fix is recorded. In a regulated client, this log is your
                disclosure-consistency review.
              </p>
              {recentAudit.map((e) => (
                <div key={e.id} className="audit-entry">
                  <span className="audit-action">{AUDIT_LABEL[e.action]}</span>
                  {e.before != null && e.after != null && (
                    <span className="audit-diff">
                      <span className="audit-before">{e.before}</span> →{' '}
                      <span className="audit-after">{e.after}</span>
                    </span>
                  )}
                  <span className="audit-actor">{e.actor}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
