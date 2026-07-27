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
  // Create a NEW placeholder audience (only when the needed one is not already in the records)
  // and tag the flow to it. Reuses an existing audience of the same name instead of duplicating.
  | { op: 'createAudience'; name: string }
  // Add a NEW proof point (reason to believe) as an unvetted draft and tag the flow to it. Reuses
  // an existing same-text proof instead of duplicating. `text` is the claim (kept short).
  | { op: 'createProof'; text: string }
  // Set the campaign's GTM strategy / motion (a strategyMenu key). This is the campaign's purpose
  // made concrete: it drives the funnel, KPIs, and deliverable set. Confirm it with the user first.
  | { op: 'setStrategy'; value: string }
  /**
   * Put a CARD on the board. One op for all eleven kinds rather than eleven ops.
   *
   * `ref` is a handle the model invents for this batch ('a1', 'msg'), never a real board id: the
   * model has never seen a co_… id and would hallucinate them, and a later connect in the same batch
   * needs a way to name what it just made. `record` is a NAME, routed through the same
   * create-or-reuse path a card's own picker uses, so the model can name an audience without
   * inventing a record around it. `direction` is the instruction the card carries, validated by
   * buildDirection's closed vocabulary like every other source of direction.
   */
  | {
      op: 'createObject'
      ref: string
      kind: string
      record?: string
      text?: string
      direction?: { key: string; value: string }[]
    }
  /** Sharpen a card already on the board (or one this batch created), by ref or by label. */
  | { op: 'setDirection'; ref: string; entries: { key: string; value: string }[] }
  /** Choose the model this campaign generates with (an AI_MODELS id, or 'auto'). */
  | { op: 'setModel'; value: string }
  /**
   * Wire one thing to another. An arrow from A to B means "A helps write B", so everything A
   * instructs travels with B to every output B is wired to.
   *
   * Both ends resolve the same way: a ref handle from this batch, then a card already on the board
   * by its label, then the literal 'campaign' for the brief, then a deliverable by PRESET KEY. The
   * composite board key for a deliverable is never exposed to the model — it would have to be
   * guessed, and a guess points at nothing.
   */
  | { op: 'connect'; from: string; to: string }
  | { op: 'disconnect'; from: string; to: string }
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
  /** The GTM motion already set on this flow, if any. When present the agent must NOT re-ask for a
   *  strategy: it is already decided (keep it unless the user asks to change it). */
  strategy?: string | null
}

export interface FlowAgentContext {
  brand: string
  /** 'build' allows edit commands; 'analyze' is read-only Q&A (no commands). */
  intent: 'build' | 'analyze'
  flow: FlowSnapshot
  /** Deliverable presets the agent may add, by key. */
  presets: { key: string; label: string; channel: string; group: string }[]
  /** Records available to tag, by label. */
  records: { companies: string[]; people: string[]; segments: string[]; mediaMixes: string[]; proof: string[] }
  message: string
  /** Prior turns for continuity (most recent last). */
  history: { role: 'user' | 'assistant'; text: string }[]
  // Per-user prefs so ONE chat adapts to the person (all optional; absent/null = today's balance).
  /** How much autonomy + how terse: 'simple' does more of the work and asks less; 'advanced' is terse + precise. */
  skillLevel?: 'simple' | 'advanced' | null
  /** Biases vocabulary, default channels, and what the chat proposes toward this discipline. */
  marketerRole?: 'email' | 'brand' | 'product' | 'growth' | null
  /** The role's default GTM motion (e.g. lifecycle, content-seo, plg, demand-gen). */
  roleStrategy?: string | null
  // Strategy-first discovery: the motions to choose from, and what the app already knows about the
  // brand, so the chat asks PURPOSE, recommends a motion, and never re-asks what it already knows.
  /** The GTM strategy menu the chat may pick from (setStrategy.value must be one of these keys). */
  strategyMenu?: { key: string; name: string; bestFor: string; coreMetrics: string }[]
  /** What the app already knows about the brand (any field may be absent). */
  brandFacts?: {
    businessObjective?: string
    positioning?: string
    primaryAudience?: string
    /** The brand's already-resolved motion key, if set — lean on it, do not re-derive. */
    strategy?: string
    businessModel?: string
    oneLiner?: string
  }
}

export interface FlowAgentResult {
  reply: string
  commands: FlowCommand[]
  /** Optional tappable follow-ups the user might do next (short prompts), shown as chips. When the
   *  assistant asks an intake question, these can be the answer options. */
  nextSteps?: string[]
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
  /** Tappable follow-up prompts shown as chips under the message. */
  nextSteps?: string[]
  /** Resolution of the pending suggestions, once acted on. */
  resolved?: 'applied' | 'discarded'
  /**
   * What Apply ACTUALLY did, straight from applyFlowCommands. Without these the UI stamped a
   * check mark on the whole batch regardless, so an op the client silently ignored looked exactly
   * like one that worked. Kept separate from `suggestions`, which is only what was proposed.
   */
  applied?: string[]
  skipped?: string[]
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
