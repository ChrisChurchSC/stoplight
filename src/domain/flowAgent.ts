/**
 * The flow-canvas AI agent. The chat panel sends a snapshot of the open flow plus the
 * user's message; the model replies AND returns a list of structured commands that the
 * client applies to the flow (add deliverables, set record tags, set budget/flight, build).
 * The command layer is deterministic and validated, so the model only decides intent — it
 * never touches the store directly. The offline heuristic answers with advice and no edits.
 */

export type FlowCommand =
  | { op: 'setName'; value: string }
  | { op: 'setSubject'; value: string }
  | { op: 'setBudget'; value: number }
  | { op: 'setFlight'; weeks: number }
  | { op: 'addDeliverable'; preset: string; perMonth?: number }
  | { op: 'removeDeliverable'; preset: string }
  | { op: 'setRecordTags'; labels: string[] }
  | { op: 'build' }
  | { op: 'regenerate' }

export interface FlowSnapshot {
  mode: 'build' | 'view'
  name: string
  subject: string
  budget: number | null
  flightWeeks: number
  deliverables: { preset: string; label: string; perMonth: number }[]
  recordTags: string[]
}

export interface FlowAgentContext {
  brand: string
  /** 'build' allows edit commands; 'analyze' is read-only Q&A (no commands). */
  intent: 'build' | 'analyze'
  flow: FlowSnapshot
  /** Deliverable presets the agent may add, by key. */
  presets: { key: string; label: string; channel: string; group: string }[]
  /** Records available to tag, by label. */
  records: { companies: string[]; people: string[]; segments: string[]; mediaMixes: string[] }
  message: string
  /** Prior turns for continuity (most recent last). */
  history: { role: 'user' | 'assistant'; text: string }[]
}

export interface FlowAgentResult {
  reply: string
  commands: FlowCommand[]
}

/** One message in a flow chat. Assistant messages may carry pending suggestions (edit
 *  commands the user approves before they apply). */
export interface FlowChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  live?: boolean
  /** Pending edit commands proposed by the AI (build intent), awaiting Apply / Discard. */
  commands?: FlowCommand[]
  /** Human-readable descriptions of `commands`, parallel array. */
  suggestions?: string[]
  /** Resolution of the pending suggestions, once acted on. */
  resolved?: 'applied' | 'discarded'
}

/** A saved flow chat, kept in history per flow. */
export interface SavedFlowChat {
  id: string
  /** The flow this chat belongs to (campaign name, or a marker for a fresh builder). */
  flowKey: string
  title: string
  messages: FlowChatMsg[]
  createdAt: number
}

/**
 * Offline answer: no edits, just guidance grounded in the flow snapshot. Runs when the
 * server has no API key, so the panel still responds (just can't act).
 */
export function heuristicFlowAgent(ctx: FlowAgentContext): FlowAgentResult {
  const f = ctx.flow
  const bits: string[] = []
  bits.push(`**${f.name || 'This flow'}** has ${f.deliverables.length} deliverable${f.deliverables.length === 1 ? '' : 's'}${f.recordTags.length ? `, tagged to ${f.recordTags.length} record${f.recordTags.length === 1 ? '' : 's'}` : ''}.`)
  if (f.mode === 'build') {
    bits.push('I can act on this flow once Claude is connected (set an API key). Then ask me to add deliverables, tag records, set a budget or flight, and build it.')
  } else {
    bits.push('Connect Claude (set an API key) and I can add deliverables, retag records, and regenerate the copy from here.')
  }
  return { reply: bits.join('\n\n'), commands: [] }
}
