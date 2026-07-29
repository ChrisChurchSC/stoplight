import Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL_IDS } from '../src/domain/aiModels.js'
import { makeModelClient } from './modelClient.js'

/**
 * Server-side starter-copy drafting. Runs ONLY on the dev server / a serverless
 * function — never in the browser — so the model key stays private. Routes through
 * the shared model client (OpenRouter's 'copy' tier, or Anthropic direct); throws
 * NO_KEY when neither key is set, so the client falls back to the heuristic writer.
 */

// JSON Schema for the structured output — mirrors DraftResult in adapters/copy/draftWriter.ts.
const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rtbs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['id', 'label', 'detail'],
      },
    },
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rowId: { type: 'string' },
          components: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { key: { type: 'string' }, value: { type: 'string' } },
              required: ['key', 'value'],
            },
          },
          rtbIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['rowId', 'components', 'rtbIds'],
      },
    },
  },
  required: ['rtbs', 'drafts'],
} as const

const SYSTEM = `You are a senior B2B copywriter composing copy for an entire campaign at once. Each asset is a DISTINCT unit: write net-new copy for it, never a template with the audience label swapped.

A campaign-level THEME and TIMEFRAME may be provided. When a theme is given it is the throughline for the WHOLE set: every asset must clearly be part of that campaign and orient around it. The theme sets what the campaign is about; each asset's stage/audience/brief sets its specific angle within that theme. Each asset must make a CONCRETE connection back to the theme — carry its central idea, language, or promise so a reader seeing any single asset can tell it belongs to this campaign, and someone seeing several recognizes them as one story from different angles. The connection has to be real and specific, not a tacked-on mention of the theme's words. Never ignore the theme, and never let it flatten the assets into the same copy: same throughline, genuinely different execution per asset. When a timeframe (flight length in weeks) is given, pace the set to it: a short flight reads more urgent and time-bound, a long flight reads more evergreen.

Each asset arrives with four inputs that MUST shape its copy:
- stage: the funnel stage (awareness | consideration | conversion | retention). Match its intent and register. Awareness frames the problem and earns attention. Consideration educates and builds the case. Conversion is decisive and proof-forward. Retention drives adoption and expansion. An awareness unit and a conversion unit must NOT read the same.
- audience: who this asset speaks to (name, role, angle, pains). Write to THIS segment's pains and language, not a generic buyer. Different audiences must get genuinely different copy, not the same line with the name changed.
- ctaSeed: the action this asset drives toward. Build the body toward this specific action and write a CTA that names it (you may sharpen the wording).
- proof: the proof point (RTB) this asset substantiates. Name or lean on it. Proof is a SHARED pool reused across many assets by design.
- context (optional): personalization the variant was fanned to (location, time/season, lifecycle, …). When present, LOCALIZE the copy to it so each variant is distinct and speaks to that context (a Belmar variant must not read identically to an Asbury one).

Some assets carry an EMAIL BLUEPRINT in their context, which MUST shape the copy:
- context.brief: the focus for this specific email (its step in the sequence). Write the email to this focus.
- context.framework: the copy framework to structure the body — AIDA (Attention→Interest→Desire→Action), PAS (Problem→Agitate→Solution), BAB (Before→After→Bridge), FAB (Features→Advantages→Benefits), 4Ps (Picture→Promise→Proof→Push), or Scannable (a short skimmable block: heading + a sentence + a link). Build the body along this framework.
- context.subjectFormula: a fill-in-the-blank subject template with {slots}. Write the subject to this formula, replacing every {slot} with a real, specific value from the brand/campaign (never leave a literal {slot} in the output). Keep it under ~50 characters and front-load the offer.
- context.levers: the ONLY persuasion levers allowed for this email (time-scarcity, quantity-scarcity, social-proof, exclusivity). Use only these, and only if the campaign genuinely supports them. If absent or "none", use no urgency/scarcity at all.
Keep one dominant CTA per email.

Write copy for EVERY component of EVERY asset. Each component's hardLimit is an ABSOLUTE maximum: never exceed it — a value over the limit gets trimmed and reads as truncated, so write to fit. Aim at the recommended length when one is given, not the max. Headlines and titles are TIGHT: a headline or SEO title must be a short, punchy line, not a full sentence or a subtitle-laden description (a long-form or pillar guide still gets a short title, not a paragraph). Primary text can breathe; CTAs are short action labels, not sentences.

PERSONAS ARE COMPOSITE. When the campaign carries one, it is a representative person built to stand in for a segment, not a real customer. Write TO them: use their vocabulary (saysLike is how they actually talk, and it should shape your word choice more than any other field), pitch the explanation at their expertise, aim at what they are optimizing for, and displace what they use today. You may extrapolate colour that is consistent with them. You must NEVER present them as a real customer, quote them as a testimonial, attribute a claim or a result to them, or use their name in a way that implies they exist. If the copy names anybody, it names nobody.

THE AUDIENCE'S PAINS AND WANTS ARE A PAIR. pains are what is wrong today; wants are what good looks like to them. Copy written from pains alone lands as a complaint, and copy written from wants alone floats free of any reason to act, so move between them: name the pain to earn attention, and aim at the want to earn the click. Where the audience carries triggers, they are why NOW rather than eventually, and a trigger is the strongest opening this record offers. definition is sharper than role and outranks it when both are present. tone is how to SOUND to this audience and is subordinate to the brand guide: it chooses the register inside the voice, it never overrides a don't. seniority, industry, companySize and funnelStage set vocabulary and how much you have to explain, not subject matter: do not write ABOUT them.

THE AUDIENCE CARRIES TWO NEGATIVES and both are binding. Its antiMessage is the sentence this audience must never be told: do not write it, and do not write a paraphrase of it. Its objections are what they already believe against you: answer them rather than pretend they are not there. A draft that trips either is wrong even if everything else about it is good.

PROOF CARRIES ITS NUMBERS. When a proof point has a metric, state it: a quantified claim is the reason that proof was chosen. When it has a source, do not contradict it, and never invent a figure or an attribution that is not in the proof you were given.

UNIQUENESS is a hard requirement. Across the whole campaign: no two assets may share the same headline, no two may share the same primary text, and CTAs must not repeat. Vary the opening, structure, and angle, not just the noun that names the audience. If an AVOID list is provided, do not reuse any string in it.

Proof handling: a shared proof pool is provided. Reuse its ids; do NOT invent new proof ids when the pool is non-empty. For each asset set rtbIds to the 1 to 2 pool ids it leans on (a landing page may carry all), chosen so an asset and the page it drives to share at least one. Echo the provided pool back in rtbs (same ids and labels). Only if the pool is empty, author 3 to 4 RTBs grounded in the ICP.

Hold ONE brand voice across the whole set so it still tells a single story to one buyer. If a brand profile is provided, reflect its industry and voice. If a BRAND GUIDE is provided, treat it as the contract: follow every "do", never break a "don't"; the copy must already pass a brand-coherence check.

DIRECTION. An asset may carry a "direction" array: the planner's instructions for that specific asset, each with a label saying what to do with the value. Honor every entry. It is MORE specific than the campaign theme and is to be expressed within it, never instead of it. It never overrides the brand guide: on any conflict with a do or a don't, the guide wins. On conflict with the theme, keep the theme and express the direction inside it. The entries are instructions, not copy: never quote a label and never paste a value in verbatim.

Use the exact component "key" values given for each asset. Do not use em dashes anywhere in the copy. Return ONLY the structured object.`

export class NoKeyError extends Error {
  code = 'NO_KEY'
}

export async function runCopyDraft(body: unknown): Promise<unknown> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY)
    throw new NoKeyError('No model key set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)')

  const { icp, campaign, theme, flightWeeks, brand, brandGuide, proofPool, hooks, avoid, assets, model, personas, messages } = (body ?? {}) as {
    icp?: unknown
    campaign?: unknown
    theme?: unknown
    flightWeeks?: unknown
    brand?: unknown
    brandGuide?: unknown
    proofPool?: unknown
    hooks?: unknown
    avoid?: unknown
    assets?: unknown
    model?: unknown
    personas?: unknown
    messages?: unknown
  }
  // The campaign's model pick. Validated against the catalog rather than forwarded: this is a
  // client-supplied string heading for a provider, and an id the app does not offer is a stale
  // saved value or a hand-edited one, which should fall back to the tier default rather than 404.
  const pick = typeof model === 'string' && AI_MODEL_IDS.has(model) && model !== 'auto' ? model : undefined
  const themeStr = typeof theme === 'string' && theme.trim() ? theme.trim() : ''
  // Sanitized rather than trusted: user-authored free text going into a prompt, and a persona with
  // no name is not a persona.
  const personaList = Array.isArray(personas)
    ? (personas as Record<string, unknown>[])
        .filter((p) => p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim())
        .slice(0, 6)
    : []
  /**
   * The messages this campaign argues, from the Message cards wired to it.
   *
   * Keyed on ANGLE, not name: the angle is the sentence to argue and the name is just what the
   * record is filed under, so a message with no angle is dropped rather than sent as a title for
   * the model to interpret. Sanitized like everything else here, being user-authored free text
   * heading into a prompt.
   */
  const messageList = Array.isArray(messages)
    ? (messages as Record<string, unknown>[])
        .filter((m) => m && typeof m === 'object' && typeof m.angle === 'string' && m.angle.trim())
        .slice(0, 8)
        .map((m) => ({
          name: typeof m.name === 'string' ? m.name.slice(0, 120) : undefined,
          angle: (m.angle as string).trim().slice(0, 400),
          proof: typeof m.proof === 'string' && m.proof.trim() ? m.proof.trim().slice(0, 300) : undefined,
          audience: typeof m.audience === 'string' && m.audience.trim() ? m.audience.trim().slice(0, 160) : undefined,
          stage: typeof m.stage === 'string' && m.stage.trim() ? m.stage.trim().slice(0, 40) : undefined,
        }))
    : []
  // The brand's hook library. Every request has carried it since the field was added and this
  // handler silently dropped it: only the offline heuristic writer ever read it, so on the live
  // AI path not one hook the user wrote has ever reached the model. Sanitized here rather than
  // trusted, since it is user-authored free text going into a prompt.
  const hookList = Array.isArray(hooks)
    ? hooks.filter((h): h is string => typeof h === 'string' && !!h.trim()).map((h) => h.trim().slice(0, 240)).slice(0, 40)
    : []
  const flightStr = typeof flightWeeks === 'number' && flightWeeks > 0 ? `${flightWeeks} weeks` : 'ongoing'

  // Scale the output budget to the batch size: a whole campaign (many assets) plus
  // adaptive thinking easily overruns a small cap, and a truncated response breaks the
  // JSON and silently drops the run to the heuristic writer. ~1.5k tokens per asset,
  // floored at 8k, capped at Opus's ceiling.
  const assetCount = Array.isArray(assets) ? assets.length : 1
  const maxTokens = Math.min(60000, Math.max(8000, assetCount * 1500))
  const userContent = `ICP:\n${JSON.stringify(icp, null, 2)}\n\nBrand profile:\n${JSON.stringify(brand ?? {}, null, 2)}\n\nBrand guide (the contract, write in this voice, never break a don't):\n${JSON.stringify(brandGuide ?? {}, null, 2)}\n\nCampaign: ${String(campaign)}\n\nCampaign theme (the throughline every asset must orient around): ${themeStr || '(none given — write to the brand and each asset\'s own audience/brief)'}\n\nCampaign timeframe: ${flightStr}\n\nShared proof pool (reuse these ids; do not invent new proof when this is non-empty):\n${JSON.stringify(proofPool ?? [], null, 2)}${hookList.length ? `\n\nBrand hooks (the brand's own opening lines; use one where it genuinely fits an asset, adapt freely, and never at the cost of the brand guide or the campaign theme. Ignore them all if none fit):\n${JSON.stringify(hookList, null, 2)}` : ''}${personaList.length ? `\n\nPersonas this campaign is written to (COMPOSITE, never real people, see the rules):\n${JSON.stringify(personaList, null, 2)}` : ''}${messageList.length ? `\n\nThe messages this campaign argues (from the Message cards wired to it). Each asset should advance ONE of these rather than restating all of them; the angle is the line to make, the proof is what backs it. Where a message names an audience or a stage, prefer it for assets that match:\n${JSON.stringify(messageList, null, 2)}` : ''}\n\nAVOID (strings already used in this campaign, do not reuse any of them):\n${JSON.stringify(avoid ?? {}, null, 2)}\n\nAssets to write (each carries its stage, audience — its pains and wants, its triggers, its tone, its objections to answer and its antiMessage never to write; ctaSeed, proof with any metric/source, its components + char limits, and any 'direction': the planner's instructions for that asset):\n${JSON.stringify(assets, null, 2)}\n\nWrite distinct copy for every asset and return it with the proof pool as rtbs.`

  const client = makeModelClient('copy', pick)
  const message = await client.messages.create({
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : '{}'
  return JSON.parse(text)
}
