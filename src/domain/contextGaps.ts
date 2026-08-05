/**
 * WHAT THE CAMPAIGN HAS NOT SAID YET — the soft counterpart to copyBlockerFor.
 *
 * copyBlockerFor answers "can this generate at all", and its two rules are absolutes: a canvas with
 * no brand has no voice to write in, and a canvas with no wires has no stated context at all. Both
 * refuse.
 *
 * This answers the question that sits just past those: it CAN generate, but from how much? A
 * campaign wired to one Note card clears the blocker and then writes from the whole brand library,
 * because that is what the writer's pools do when nothing pins them — `audiencePool` falls back to
 * every audience the brand has and `activeProof` to every proof point. The copy comes out fluent,
 * plausible, and written to nobody in particular, and nothing anywhere says so. That silence is the
 * failure this module exists to break: not by refusing, which would be wrong (a thin campaign is
 * still a campaign), but by naming what is missing at the moment the copy lands.
 *
 * PURE, and separate from the store, for the same reason boardResolve is: this decides what the
 * person is told about their own campaign, which is worth testing against a hand-built ref list
 * rather than by wiring cards up by hand.
 *
 * IT MUST MATCH WHAT THE WRITER ACTUALLY READS, or it is a lie in the corner of the screen. Records
 * reach the copy through the brief (wiredRefsFor(board, 'campaign')) or through a row's own
 * `references` override — a card wired straight to a DELIVERABLE contributes direction and no
 * records at all. So the caller passes the refs the writer will really see, and never the board's
 * cards as a proxy for them.
 */

/** A missing input, named by what the person would go and add. */
export type ContextGapKey = 'audience' | 'proof' | 'angle'

export interface ContextGapInput {
  /**
   * Every record that can actually reach the copy: what is wired into the brief, plus any
   * per-deliverable override. Only `type` is read — this asks whether a kind of input exists at all,
   * never which one.
   */
  refs: readonly { type: string }[]
  /**
   * How many instructions the board resolves in total (campaign-wide plus per-target). An
   * instruction typed on a card states an angle even when the card names no record, so a campaign
   * with direction on it is not angle-less.
   */
  directionCount: number
}

/**
 * The gaps, in the order they cost the copy most.
 *
 * Audience first because it is the one the writer papers over most convincingly: with nothing
 * pinned it rotates the brand's whole audience list, so every asset is addressed to someone and the
 * set as a whole is addressed to no one. Proof second — the same fallback, one step less visible.
 * Angle last, and only when NOTHING states one: a message or concept record, or any instruction
 * typed on any card, all count.
 *
 * A person ref counts as an audience: a named persona is who the asset speaks to, and the writer
 * treats it that way. A dataset counts as proof for the same reason — a table is evidence.
 */
export function contextGaps({ refs, directionCount }: ContextGapInput): ContextGapKey[] {
  const has = (...types: string[]) => refs.some((r) => types.includes(r.type))
  const gaps: ContextGapKey[] = []
  if (!has('segment', 'person')) gaps.push('audience')
  if (!has('proof', 'dataset')) gaps.push('proof')
  if (!has('message', 'concept') && directionCount === 0) gaps.push('angle')
  return gaps
}

/** What the person would add, as it reads inside "No ___ is wired". */
const NOUN: Record<ContextGapKey, string> = {
  audience: 'audience',
  proof: 'proof point',
  angle: 'message or angle',
}

/**
 * WHAT GENERATING ANYWAY PRODUCES, per gap. The half that makes the toast worth reading: "no
 * audience wired" is a fact about the canvas, and a person who just got copy back needs to know
 * what that fact did to the copy.
 *
 * Only the leading gap's consequence is shown. Three of these in one line is a paragraph in the
 * corner of the screen, and the fix for all three is the same button.
 */
const CONSEQUENCE: Record<ContextGapKey, string> = {
  audience: 'the copy rotates every audience the brand has, so it is written to no one in particular',
  proof: 'the copy leans on whatever proof the brand has rather than the point this campaign is making',
  angle: 'nothing states what this campaign argues, so it is written to the brand in general',
}

/**
 * WHAT THE BOARD ALREADY HAS for the leading gap, which is a different question from whether the
 * gap exists and decides what the person is sensibly told to do about it.
 *
 * "No audience is wired" is a statement about what reaches the WRITER, and a card can be sitting in
 * plain sight on the canvas while contributing nothing to that: unwired, or wired but naming no
 * record, or wired to the brief while every asset overrides the brief with records of its own.
 * Telling someone to add an audience when one is already on their board reads as the app not being
 * able to see its own canvas, and the fix it offers (a second card) is the wrong one in all three
 * cases.
 *
 * `none` is the honest default and the only one that means "there is nothing here to fix up".
 */
export type GapStanding = 'none' | 'unwired' | 'unnamed' | 'overridden'

/**
 * The consequence clause when a card IS there. Each replaces CONSEQUENCE, because what generating
 * did is no longer the interesting half: the person can see the card, so the sentence has to
 * account for it rather than describe the fallback again.
 */
const STANDING_CLAUSE: Record<Exclude<GapStanding, 'none'>, string> = {
  unwired: 'there is one on this board with no line to the brief, so nothing it says reaches the copy',
  unnamed: 'the one on this board names no record yet, so nothing it says reaches the copy',
  overridden: 'one is wired to the brief, but every asset here overrides the brief with records of its own',
}

/**
 * The toast sentence, or null when the campaign has said enough.
 *
 * Names at most two gaps. A list of three reads as a scolding, and the third is always the least
 * costly one; the drawer the action opens shows everything that is missing anyway. A standing other
 * than `none` speaks about the leading gap alone: the card on the board is a fact about ONE kind,
 * and pluralising it into "no audience or proof point" would attach it to the wrong one.
 *
 * `campaign` is optional because the two callers stand in different places. Generate names it (the
 * toast can outlive the click that caused it, and a name says which canvas it is about); a build
 * that has just opened the campaign it built does not, because the toast already begins "Built".
 */
export function contextGapMessage(
  gaps: readonly ContextGapKey[],
  campaign?: string,
  standing: GapStanding = 'none',
): string | null {
  if (!gaps.length) return null
  const named = (standing === 'none' ? gaps.slice(0, 2) : gaps.slice(0, 1)).map((g) => NOUN[g])
  const where = campaign ? ` to "${campaign}"` : ''
  const clause = standing === 'none' ? CONSEQUENCE[gaps[0]] : STANDING_CLAUSE[standing]
  return `No ${named.join(' or ')} is wired${where} — ${clause}.`
}
