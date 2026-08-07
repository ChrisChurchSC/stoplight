import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SUPPRESSING INPUT IS A DRAG-DURATION ACT, NOT A TOOL-MODE ONE.
 *
 * The canvas carries two classes that look interchangeable and are not:
 *
 *   .connecting  the TOOL MODE — `tool === 'connect' || drawing`. The Link tool is sticky: it is
 *                toggled on by a toolbar button and stays on until you turn it off. Nothing clears
 *                it when a wire lands. It carries the mode's affordances (crosshair, visible ports).
 *   .wiring      the DRAG — `drawing` alone, set on mousedown and cleared at every drop and cancel.
 *
 * A rule that makes the setup checklist click-through was hung on `.connecting`, on the assumption
 * — written into its own comment — that the class lasted "for the length of a wire drag". It does
 * not. So selecting the Link tool made the entire 258px checklist panel inert for as long as the
 * tool was on: every step button, including "Add what you are shipping", which is a route into the
 * channel picker, and the Complete button, so the panel could not even be dismissed. Clicking the
 * arrow tool silently restored it, which made it read as random rather than as a mode.
 *
 * Asserted against the SOURCE because the failure is the pairing of a CSS selector with a class
 * expression in a component, and neither file can see the other. A unit test of either half passes
 * happily while the two disagree, which is exactly what shipped.
 */

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

const css = src('index.css')
const flows = src('components/FlowsView.tsx')

/** The one line that builds the canvas element's class list. */
const classLine =
  flows.split('\n').find((l) => l.includes('className={`flow-canvas')) ?? ''

describe('the canvas wiring class', () => {
  it('exists, and comes from the drag rather than the tool', () => {
    expect(classLine).toContain("drawing ? ' wiring' : ''")
  })

  it('is not switched on by the tool mode', () => {
    // `${tool === 'connect' || drawing ? ' connecting' : ''}` may mention the tool; the wiring
    // segment must not. Isolate the segment that emits ' wiring' and check what gates it.
    const seg = classLine.slice(classLine.indexOf("' wiring'") - 60, classLine.indexOf("' wiring'"))
    expect(seg).not.toContain('tool ===')
  })

  it('still marks the tool mode separately, so the crosshair and ports survive', () => {
    expect(classLine).toContain("tool === 'connect' || drawing ? ' connecting' : ''")
  })

  it('is what suppresses pointer events on the setup checklist', () => {
    expect(css).toContain('.flow-canvas.wiring .setup-steps { pointer-events: none; }')
  })

  it('never lets the tool mode suppress pointer events on anything', () => {
    // The bug in one line: a `.connecting` rule that turns interaction off outlives the gesture.
    const offenders = css
      .split('\n')
      .filter((l) => l.includes('.connecting') && l.includes('pointer-events') && l.includes('none'))
    expect(offenders).toEqual([])
  })

  it('leaves the checklist clickable when no wire is in flight', () => {
    // The drag rule is the ONLY thing allowed to turn the panel off. Any other rule that disables
    // pointer events on it would be inert at times nobody is dragging, which is the bug again.
    const stepRules = css
      .split('\n')
      .filter(
        (l) =>
          l.includes('.setup-step') &&
          l.includes('pointer-events') &&
          l.includes('none') &&
          !l.includes('.wiring'),
      )
    expect(stepRules).toEqual([])
  })
})
