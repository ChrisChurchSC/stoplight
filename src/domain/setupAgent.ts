import { GUIDED_SETUP_STEPS } from './guidedSetup'

/**
 * The first-run intake, run by the model instead of by a script.
 *
 * The scripted version (GUIDED_SETUP_STEPS, still the fallback below) asks three fixed questions in
 * a fixed order and never reads a word of the answers: type "we sell warehouse software to
 * mid-market distributors" and it replies with the same sentence it would have shown for "asdf".
 * In a chat bubble that reads as an assistant that is not listening, which is worse than a form,
 * because the form never claimed to be listening.
 *
 * So the model drives: it reacts to what was actually said, asks only for what it still needs, takes
 * several facts out of one sentence when they are there, and stops asking the moment it can start
 * building. The client decides what any of that is ALLOWED to do: every command below is validated
 * and applied by us, never by the model.
 *
 * Mirrors the flow agent (domain/flowAgent.ts) deliberately: same shape, same fallback contract, so
 * there is one way an agent talks to this app rather than two.
 */

export type SetupCommand =
  /** The discipline the person works in. Must be a MarketerRole value. */
  | { op: 'setRole'; value: string }
  /** How much surface to show. Must be 'simple' or 'advanced'. */
  | { op: 'setDetail'; value: string }
  /** Name the brand. Creates the client and its record the first time; renames after. */
  | { op: 'setBrandName'; value: string }
  /** One line on what the brand does, in the USER's words. Never the model's paraphrase. */
  | { op: 'setOneLiner'; value: string }
  /** The brand's site. Stored, then read, so later drafting is grounded in real content. */
  | { op: 'setWebsite'; value: string }
  /** Go and read the site now. Only valid once a website is set. */
  | { op: 'readSite' }
  /** Draft the whole brand page from what we now know. Only valid once the brand exists. */
  | { op: 'buildFoundation' }

/** What the agent knows before this turn. Absent fields are genuinely not yet known. */
export interface SetupAgentContext {
  known: {
    role?: string | null
    detail?: string | null
    brandName?: string | null
    oneLiner?: string | null
    website?: string | null
    /** True once the site has actually been read, so it stops offering to read it again. */
    siteRead?: boolean
  }
  /** The roles it may choose from, so setRole can be validated against a closed set. */
  roleOptions: { value: string; label: string }[]
  message: string
  history: { role: 'user' | 'assistant'; text: string }[]
}

export interface SetupAgentResult {
  reply: string
  commands: SetupCommand[]
  /** Tappable answers for the question just asked. Short, in the user's voice. */
  nextSteps?: string[]
}

/**
 * The offline intake: today's fixed script, kept verbatim so a workspace with no model key still
 * gets set up. It cannot react to an answer, which is precisely the limitation the live path exists
 * to remove, so the UI should say which one answered.
 */
export function scriptedSetupTurn(ctx: SetupAgentContext): SetupAgentResult {
  const k = ctx.known
  const val = ctx.message.trim()
  const skipped = val.toLowerCase() === 'skip'

  // Which question is outstanding, in the scripted order.
  if (k.role == null) {
    return {
      reply: GUIDED_SETUP_STEPS[1].prompt(''),
      commands: skipped || !val ? [] : [{ op: 'setRole', value: val }],
      nextSteps: GUIDED_SETUP_STEPS[1].options?.map((o) => o.label),
    }
  }
  if (k.detail == null) {
    return {
      reply: GUIDED_SETUP_STEPS[2].prompt(''),
      commands: skipped || !val ? [] : [{ op: 'setDetail', value: val }],
    }
  }
  if (!k.brandName) {
    return { reply: GUIDED_SETUP_STEPS[3].prompt(val), commands: val ? [{ op: 'setBrandName', value: val }] : [] }
  }
  if (!k.oneLiner) {
    return { reply: GUIDED_SETUP_STEPS[4].prompt(k.brandName), commands: val ? [{ op: 'setOneLiner', value: val }] : [] }
  }
  if (!k.website && !skipped) {
    return { reply: 'Building your brand page now.', commands: [{ op: 'setWebsite', value: val }, { op: 'buildFoundation' }] }
  }
  return { reply: 'Building your brand page now.', commands: [{ op: 'buildFoundation' }] }
}
