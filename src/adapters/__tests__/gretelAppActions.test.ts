import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE ALLOWLIST THAT DECIDES WHAT GRETEL CAN DO TO THE APP.
 *
 * `runAppAction` lets the campaign assistant call the same handlers the MCP server drives from
 * outside. That is a deliberate hole in a wall, and three things have to stay true about it or the
 * hole gets wider than anyone decided:
 *
 *   1. Every allowlisted name has a handler. Allowlisting a typo produces a command the model
 *      proposes, the user approves, and the app then refuses — which reads as the app being broken.
 *   2. Nothing destructive is on the list. It is reads plus additive brand records. A delete or a
 *      fan-out arriving by this route would be approved from a suggestion card that says one line
 *      about it.
 *   3. The prompt and the allowlist agree. The model only proposes what the prompt describes, and
 *      the app only runs what the allowlist permits. Drift in either direction is invisible: the
 *      model suggests things that always skip, or the app permits things nobody documented.
 *
 * A text comparison on purpose, like schemaCoverage.test.ts and apiManifest.test.ts beside it: no
 * store, no browser, no model, so it runs in CI on every change.
 */

const root = join(__dirname, '..', '..', '..')
const bridge = readFileSync(join(root, 'src/lib/agentBridge.ts'), 'utf8')
const prompt = readFileSync(join(root, 'server/flowAgentHandler.ts'), 'utf8')

/** The names inside `export const GRETEL_ACTIONS = [ ... ] as const`. */
function allowlist(): string[] {
  const block = bridge.match(/export const GRETEL_ACTIONS = \[([\s\S]*?)\] as const/)
  if (!block) throw new Error('GRETEL_ACTIONS not found in agentBridge.ts')
  return [...block[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])
}

const ACTIONS = allowlist()

describe('Gretel app actions', () => {
  it('allowlists something, and not everything', () => {
    expect(ACTIONS.length).toBeGreaterThan(0)
    // The handler map has ~54 entries. If the allowlist ever approaches that, the decision to keep
    // it narrow has been reversed by accretion rather than on purpose.
    expect(ACTIONS.length).toBeLessThan(25)
  })

  it('every allowlisted action has a handler', () => {
    for (const a of ACTIONS) {
      expect(bridge, `"${a}" is allowlisted but has no handler`).toContain(`async ${a}(`)
    }
  })

  /**
   * The names are the guard here, not a scan of what each handler does. That is the honest limit of
   * a text test: it cannot tell that `addAudience` only appends. What it CAN do is refuse the
   * obvious mistake — the day someone adds `deleteClient` to make one conversation work.
   */
  it('excludes destructive and wide-reaching actions', () => {
    const forbidden = /^(delete|remove|purge|reset|promote|fanOut|generate|import|restore|approve|set(Brand(Share|Draft|Parent))?)/
    for (const a of ACTIONS) {
      expect(forbidden.test(a), `"${a}" looks destructive or wide-reaching for this route`).toBe(false)
    }
  })

  it('is reads plus additive brand records, and says which is which', () => {
    const reads = ACTIONS.filter((a) => /^(list|get|run)/.test(a))
    const adds = ACTIONS.filter((a) => a.startsWith('add'))
    expect(reads.length).toBeGreaterThan(0)
    expect(adds.length).toBeGreaterThan(0)
    // Anything that is neither is a third category nobody decided to have.
    expect(ACTIONS.filter((a) => !reads.includes(a) && !adds.includes(a))).toEqual([])
  })
})

/**
 * The half that actually drifts. The allowlist and the prompt are edited by different impulses —
 * one to permit a capability, one to explain it — and neither edit forces the other.
 */
describe('the prompt and the allowlist agree', () => {
  it('describes the appAction op at all', () => {
    expect(prompt).toContain('appAction {action, args?}')
  })

  it('names every allowlisted action in the prompt', () => {
    for (const a of ACTIONS) {
      expect(prompt, `"${a}" is allowlisted but the model is never told it exists`).toContain(a)
    }
  })

  it('promises no action the app would refuse', () => {
    // The action names the prompt lists, taken from its two labelled lines.
    const listed = new Set<string>()
    for (const line of prompt.split('\n')) {
      if (!/^\s*(Reads|Writes)[: ]/.test(line.trim()) && !line.includes('Reads:') && !line.includes('Writes')) continue
      for (const m of line.matchAll(/\b([a-z][a-zA-Z]{3,})\b(?=\s*[,.{]|\s*$)/g)) {
        if (ACTIONS.includes(m[1])) listed.add(m[1])
      }
    }
    for (const a of listed) {
      expect(ACTIONS, `the prompt offers "${a}" but the app does not allow it`).toContain(a)
    }
  })

  it('routes appAction through the guarded seam, not the handler map', () => {
    const view = readFileSync(join(root, 'src/components/FlowsView.tsx'), 'utf8')
    expect(view).toContain('runAppAction(')
    // Importing the map itself would bypass the allowlist entirely.
    expect(view).not.toContain('handlers[')
  })
})
