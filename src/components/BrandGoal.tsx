import { useEffect, useState } from 'react'
import { kpiMeasurement } from '../domain/analyticsSources'
import { fmtTarget, summarizePortfolioGoals } from '../domain/campaignGoal'
import { useHomeCanvases } from '../lib/useHomeCanvases'
import { useTrafficStore } from '../store/useTrafficStore'

/**
 * Brand goal — the business goal every campaign ladders up to, and the north-star metric
 * it's measured by. Set here at the brand level; the Portfolio and each campaign frame
 * their own goals against it. Shows how the current campaign slate stacks up to the target.
 */
export function BrandGoal({ brand }: { brand: string }) {
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)
  const brandActuals = useTrafficStore((s) => s.brandActuals)
  const { canvases } = useHomeCanvases()

  const [goal, setGoal] = useState('')
  const [kpi, setKpi] = useState('')
  const [target, setTarget] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const p = clientProfiles[brand]
    setGoal(p?.businessGoal ?? '')
    setKpi(p?.businessKpi ?? '')
    setTarget(p?.businessTarget != null ? String(p.businessTarget) : '')
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  const save = () => {
    setClientProfile(brand, {
      businessGoal: goal.trim() || undefined,
      businessKpi: kpi.trim() || undefined,
      businessTarget: target.trim() === '' ? undefined : Math.max(0, Math.round(Number(target) || 0)),
    })
    setDirty(false)
  }

  // Ladder-up from the SAVED north-star (reflects what's committed, not an in-progress edit).
  const saved = clientProfiles[brand]
  const savedGoal = (saved?.businessGoal ?? '').trim() || (saved?.mission ?? '').trim()
  const brandCards = canvases.filter((c) => c.client === brand)
  const summary = summarizePortfolioGoals(
    brandCards.map((c) => ({ goal: c.goal, rows: c.rows })),
    saved?.businessKpi,
    saved?.businessTarget,
  )
  // Can the connected analytics sources actually measure this KPI? If not, which to add.
  const kpiMeas = kpiMeasurement(kpi, brandActuals[brand]?.sources)

  return (
    <div className="brand-info brand-goal">
      <p className="brand-voice-intro">
        The business goal every campaign ladders up to. Set the north-star the brand is working toward and the metric
        it's measured by; the Portfolio and each campaign frame their goals against it.
      </p>

      {savedGoal ? (
        <section className="brand-goal-summary">
          <span className="brand-goal-summary-label">{brand} · business goal</span>
          <span className="brand-goal-summary-goal">{savedGoal}</span>
          {saved?.businessKpi ? (
            <span className="brand-goal-summary-kpi">
              Measured by <strong>{saved.businessKpi}</strong>
              {saved.businessTarget != null ? (
                <>
                  {' '}
                  · goal <strong>{fmtTarget(saved.businessTarget)}</strong>
                </>
              ) : null}
            </span>
          ) : null}
          {summary ? (
            <span className="brand-goal-summary-sentence">
              Toward it, {summary.sentence.charAt(0).toLowerCase() + summary.sentence.slice(1)}
            </span>
          ) : (
            <span className="brand-goal-summary-sentence muted">No campaign goals to roll up yet.</span>
          )}
          {summary && summary.progress != null && saved?.businessTarget != null ? (
            <>
              <div className="brand-goal-bar">
                <span
                  className="brand-goal-bar-fill"
                  style={{ width: `${Math.min(100, Math.round(summary.progress * 100))}%` }}
                />
              </div>
              <span className="brand-goal-bar-cap">
                {fmtTarget(summary.target)} of {fmtTarget(saved.businessTarget)} planned across {summary.count} campaign
                {summary.count === 1 ? '' : 's'}
              </span>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Business goal</h2>
          <span className="voice-section-sub">The outcome campaigns ladder up to.</span>
        </div>
        <textarea
          className="library-input"
          rows={3}
          placeholder="e.g. Grow a movement of people funding and building community-owned businesses."
          value={goal}
          onChange={(e) => {
            setGoal(e.target.value)
            setDirty(true)
          }}
        />
      </section>

      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">North-star metric</h2>
          <span className="voice-section-sub">The KPI and target success is measured by.</span>
        </div>
        <div className="voice-grid voice-grid-tight">
          <label className="library-field">
            <span className="library-field-label">KPI</span>
            <input
              className="library-input"
              placeholder="Subscribers"
              value={kpi}
              onChange={(e) => {
                setKpi(e.target.value)
                setDirty(true)
              }}
            />
          </label>
          <label className="library-field">
            <span className="library-field-label">Target</span>
            <input
              className="library-input"
              type="number"
              min={0}
              placeholder="50000"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value)
                setDirty(true)
              }}
            />
          </label>
        </div>
        {kpi.trim() ? (
          kpiMeas.measured.length ? (
            <div className="bg-measure ok">✓ Measured by {kpiMeas.measured.map((s) => s.label).join(', ')}.</div>
          ) : kpiMeas.gap.length ? (
            <div className="bg-measure gap">
              ⚠ No connected source measures this. Connect {kpiMeas.gap.map((s) => s.label).join(' or ')} in Summer to
              track it.
            </div>
          ) : (
            <div className="bg-measure none">Not a tracked analytics metric, progress here would be manual.</div>
          )
        ) : null}
      </section>

      <div className={`brand-savebar${dirty ? ' dirty' : ''}`}>
        <span className="brand-savebar-status">{dirty ? '● Unsaved changes' : '✓ All changes saved'}</span>
        <button className="btn primary sm" onClick={save} disabled={!dirty}>
          {dirty ? 'Save goal' : 'Saved'}
        </button>
      </div>
    </div>
  )
}
