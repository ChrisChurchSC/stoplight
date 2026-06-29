import type { BranchPlanResult } from '../domain/diagnosis'

/**
 * A mini-canvas preview for the Analyze "branch the journeys" recommendation:
 * the shallow audience's funnel laid out like the real canvas — the assets it
 * already has (solid) and the next steps to add (dashed), connected by the green
 * thread, with one fork to show the branch. "Almost on the canvas."
 */

const W = 560
const H = 130
const CW = 122
const CH = 50
const Y = 14
const FORK_Y = 78
const FORK_H = 36
const CENTERS = [70, 210, 350, 490]
const cardLeft = (i: number) => CENTERS[i] - CW / 2

// What to add at each stage — a primary next step and a branch alternative.
const PROPOSED: Record<string, [string, string]> = {
  awareness: ['Social post', 'Short video'],
  consideration: ['Explainer', 'Case study'],
  conversion: ['Landing page', 'Sales email'],
  retention: ['Nurture email', 'SMS / DM'],
}

const clip = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const edge = (x1: number, y1: number, x2: number, y2: number) =>
  `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`

export function BranchPreview({ plan }: { plan: BranchPlanResult }) {
  const { stages } = plan
  const forkIdx = stages.findIndex((s, i) => !s.have && i >= 1)

  return (
    <svg className="bp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="How to branch this audience's journey">
      {/* the connecting thread the journey would gain */}
      {stages.slice(0, -1).map((_, i) => (
        <path
          key={`e${i}`}
          className="bp-edge"
          d={edge(cardLeft(i) + CW, Y + CH / 2, cardLeft(i + 1), Y + CH / 2)}
          fill="none"
        />
      ))}
      {forkIdx >= 1 && (
        <path
          className="bp-edge"
          d={edge(cardLeft(forkIdx - 1) + CW, Y + CH / 2, cardLeft(forkIdx), FORK_Y + FORK_H / 2)}
          fill="none"
        />
      )}

      {/* stage cards: solid = already have, dashed = add */}
      {stages.map((s, i) => {
        const x = cardLeft(i)
        return (
          <g key={s.key}>
            <rect className={`bp-card ${s.have ? 'have' : 'add'}`} x={x} y={Y} width={CW} height={CH} rx={7} />
            <text className="bp-stage" x={x + 9} y={Y + 15}>
              {s.label}
            </text>
            <text className={`bp-title${s.have ? '' : ' add'}`} x={x + 9} y={Y + 34}>
              {s.have ? clip(s.asset ?? '') : `+ ${PROPOSED[s.key]?.[0] ?? 'Add'}`}
            </text>
          </g>
        )
      })}

      {/* the fork — a second next step, the branch itself */}
      {forkIdx >= 1 && (
        <g>
          <rect className="bp-card add" x={cardLeft(forkIdx)} y={FORK_Y} width={CW} height={FORK_H} rx={7} />
          <text className="bp-title add" x={cardLeft(forkIdx) + 9} y={FORK_Y + 22}>
            + {PROPOSED[stages[forkIdx].key]?.[1] ?? 'Alt path'}
          </text>
        </g>
      )}
    </svg>
  )
}
