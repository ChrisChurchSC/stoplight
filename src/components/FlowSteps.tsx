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

/**
 * CLICKING A STEP GOES TO IT. A finished step takes you back to the card you filled in, so the list
 * is a way around the board and not only a progress bar. The current one does whatever it is asking
 * for, which is the same thing its hint's button does. Steps ahead of the current one are not
 * clickable: they depend on work that has not happened, and offering them would be offering to skip.
 */
export function FlowSteps({
  steps,
  current,
  onPick,
  onComplete,
}: {
  steps: FlowStep[]
  current: string | null
  onPick?: (id: string) => void
  /** Done with the whole thing. Takes the list and its cards away for good. */
  onComplete?: () => void
}) {
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
          const go = state !== 'todo' && onPick ? () => onPick(s.id) : undefined
          return (
            <li key={s.id} className={`setup-step ${state}${go ? ' go' : ''}`}>
              {go ? (
                <button className="setup-step-btn" onClick={go}>
                  <span className="setup-step-n" aria-hidden="true">
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <span className="setup-step-label">{s.label}</span>
                </button>
              ) : (
                <>
                  <span className="setup-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="setup-step-label">{s.label}</span>
                </>
              )}
            </li>
          )
        })}
      </ol>
      {onComplete && (
        <button className="setup-steps-done" onClick={onComplete}>
          Complete
        </button>
      )}
    </div>
  )
}
