/**
 * WHERE YOU ARE IN SETTING A CAMPAIGN UP, in the corner, while you are still setting it up.
 *
 * The hint cards say what to do next. This says how much of it there is and how far along you are,
 * which a single popup cannot: read one card and you know the step, not whether it is the first of
 * two or the third of five.
 *
 * ONE LIST DRIVES BOTH. The caller computes the current step from the board and passes the same
 * array it uses to decide which hint to show, so the corner and the popup can never disagree about
 * what step you are on. Steps before the current one are done by definition, because the chain that
 * produced it requires each condition to be satisfied before the next can be current.
 *
 * Gone entirely once the last step is done, which is the normal state of every campaign after the
 * first. It is scaffolding for the first one, not a permanent fixture.
 */

export interface FlowStep {
  id: string
  label: string
}

export function FlowSteps({ steps, current }: { steps: FlowStep[]; current: string | null }) {
  if (!current) return null
  const at = steps.findIndex((s) => s.id === current)
  return (
    <div className="setup-steps" role="group" aria-label="Setting up this campaign">
      <div className="setup-steps-head">
        Setting up
        <span className="setup-steps-count">
          {at + 1} of {steps.length}
        </span>
      </div>
      <ol className="setup-steps-list">
        {steps.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'now' : 'todo'
          return (
            <li key={s.id} className={`setup-step ${state}`}>
              <span className="setup-step-n" aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="setup-step-label">{s.label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
