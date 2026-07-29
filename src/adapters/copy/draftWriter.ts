import { clientForCampaign, UNASSIGNED, type ClientProfile } from '../../domain/clients'
import { funnelStageFor, type FunnelStage } from '../../domain/funnel'
import type { MessagingField } from '../../domain/messaging'
import type { BrandGuide } from '../../domain/readiness'
import type { DirectionEntry } from '../../domain/direction'
import type { Rtb } from '../../domain/rtb'
import type { ChannelId } from '../../domain/types'
import type { Icp } from '../icp/types'

/**
 * Drafts copy + proof for a campaign's assets. Each asset is composed from four
 * inputs — its funnel STAGE, its AUDIENCE, the CTA it drives toward, and the
 * PROOF point it leans on — so every unit is written for that combination, not
 * recombined from a shared pool of strings. The real writer calls Claude
 * server-side; the heuristic writer is the offline fallback (still composes per
 * stage/audience/proof, so it stays distinct with no API key). Mirrors the ICP seam.
 */

/** The proof point an asset substantiates. A shared pool, reused across assets by design. */
export interface DraftProof {
  id: string
  label: string
  detail?: string
}
/** Who an asset speaks to — enough context to write to this segment, not a generic buyer. */
/**
 * The segment an asset is written for, as the writer receives it.
 *
 * Everything below `pains` was already recorded on the audience and none of it was being sent, so a
 * user could fill the record in carefully and change nothing about the copy. The type had drifted
 * too: objections and antiMessage were on the wire before they were ever declared here.
 */
export interface DraftAudience {
  name: string
  role?: string
  /** A one-line definition of the sub-segment — sharper than role. */
  definition?: string
  /** The message angle that lands for this segment. */
  angle?: string
  /** This segment's pains: what is wrong today. */
  pains?: string[]
  /** What good looks like to them. Pains without wants read as a complaint. */
  wants?: string[]
  /** What makes them hesitate — the copy has to disarm these. */
  objections?: string
  /** The sentence NOT to write to them. */
  antiMessage?: string
  /** Why now: the buying triggers worth naming. */
  triggers?: string[]
  /** How to sound to them, distinct from the brand voice. */
  tone?: string[]
  seniority?: string
  industry?: string
  companySize?: string
  funnelStage?: string
}
export interface DraftAsset {
  rowId: string
  assetName: string
  channel: ChannelId
  type?: string
  /** The messaging components to write, with their char limits. */
  fields: MessagingField[]
  /** The funnel stage this asset sits in — drives intent and register. */
  stage?: FunnelStage
  /** The segment this asset is written for. */
  audience?: DraftAudience
  /** The action this asset drives toward — the body builds to this CTA. */
  ctaSeed?: string
  /** The proof point this asset substantiates (reused across assets by design). */
  proof?: DraftProof
  /** Personalization context this variant was fanned to (location, time, lifecycle,
   *  …) — the non-structural lineage. Copy is localized to it so variants of one base
   *  asset come out DISTINCT (not duplicate). */
  context?: Record<string, string>
  /**
   * The planner's instructions for THIS asset, from the objects wired to it. Rides inside the
   * assets array (which the server stringifies wholesale) rather than as a top-level field, so it
   * cannot be lost at the destructure the way `hooks` was.
   */
  direction?: DirectionEntry[]
  /** A conditioned lead hook ("if audience = X then lead with …") — the copy opens on it. */
  hook?: string
  /** Stable index in the batch — lets the heuristic vary deterministically. */
  index?: number
}
export interface DraftRequest {
  icp: Icp | null
  campaign: string
  /** The campaign's theme / goal — the throughline every asset in the set should
   *  orient around (the audience/stage/brief set each asset's specific angle). */
  theme?: string
  /** Flight length in weeks — the campaign's timeframe, so copy can pace to it. */
  flightWeeks?: number
  /** The client's brand profile (website / industry / voice), if captured. */
  brand?: ClientProfile
  /** The confirmed brand guide — generation writes in its voice and honors its don'ts. */
  brandGuide?: BrandGuide
  /** The shared proof pool the assets draw from (reused across assets by design). */
  proofPool?: Rtb[]
  /** The brand's hook list (opening lines) — used as openings where they fit. */
  hooks?: string[]
  /**
   * The COMPOSITE personas this campaign is written to: one concrete person standing in for a
   * segment, so the copy sounds written to somebody rather than to an age bracket. Never a real
   * customer, which is what bounds what the writer may do with them.
   */
  personas?: {
    name: string
    age?: string
    occupation?: string
    householdIncome?: string
    hobbies?: string
    saysLike?: string
    usesNow?: string
    expertise?: string
    optimizingFor?: string
    readsWhen?: string
    decidesWith?: string
  }[]
  /**
   * The messages this campaign argues, from the Message cards wired to it. Angle-keyed: a message
   * with no angle is a filing label, not something to argue, and is dropped before it is sent.
   */
  messages?: {
    name?: string
    angle: string
    proof?: string
    audience?: string
    stage?: string
  }[]
  /** The concepts the campaign is built on: the idea behind the claims, and the register to hit. */
  concepts?: {
    name?: string
    idea: string
    insight?: string
    likeThis?: string
  }[]
  /** The register this campaign is written in. Narrows the brand guide; never overrides its don'ts. */
  voices?: {
    name?: string
    tone?: string
    dos?: string
    donts?: string
    sample?: string
  }[]
  /** The moment the campaign is written into, and what it gives the brand permission to say. */
  seasons?: {
    name?: string
    moment?: string
    window?: string
    permission?: string
    mindset?: string
  }[]
  /** Strings already used in this campaign that a (re)generation must not reuse. */
  /**
   * FIGURES the app computed from the data sets wired to this campaign, each traceable to a cell.
   *
   * Not rows, and never a table: the writer quotes these and does no arithmetic. Anything sketched,
   * edited by hand or merely typed contributes nothing, so an empty array here is the normal state
   * for a campaign whose data sets have not earned citation.
   */
  datasets?: {
    id: string
    value: string
    label: string
    basis: 'cell' | 'sum' | 'share' | 'rank'
    period?: string
    source: string
    partial: boolean
    datasetId: string
  }[]
  avoid?: { headlines: string[]; bodies: string[]; ctas: string[] }
  /**
   * The model to write with, as an AI_MODELS id. Omitted (or 'auto') leaves the choice to the
   * server's per-task defaults. Validated server-side against the catalog before it is honoured, so
   * a stale or hand-edited value falls back rather than reaching the provider.
   */
  model?: string
  assets: DraftAsset[]
}
export interface DraftComponent {
  key: string
  value: string
}
export interface AssetDraft {
  rowId: string
  components: DraftComponent[]
  /** The creative execution format this asset was written as (question, how-to,
   *  testimonial, …) — so the set is visibly varied. */
  format?: string
  /** Campaign RTB ids this asset leans on (proof carried into the funnel). */
  rtbIds: string[]
}
/** Which writer produced a result: the real Claude API, or the offline heuristic fallback. */
export type CopySource = 'claude' | 'heuristic'

export interface DraftResult {
  rtbs: Rtb[]
  drafts: AssetDraft[]
  /** Which writer produced this result. Set by the writer; lets the UI show a source badge. */
  source?: CopySource
}

export interface CopyWriter {
  draft(req: DraftRequest): Promise<DraftResult>
}

/**
 * Real writer: POSTs to the server-side /api/draft-copy endpoint (which calls
 * Claude). Falls back to the heuristic writer when the backend is absent, has no
 * API key (501), or errors — so drafting always works, key or not.
 */
/**
 * The SYSTEM prompt tells the model "Do not use em dashes anywhere in the copy", and the model
 * mostly obeys and sometimes does not (observed: "every 10 minutes—so you're reading"). Nothing
 * enforced it: sanitizeToBrand strips them, but it only ever ran inside the heuristic writer, so
 * model output reached the product unchecked. A house style that is only a request is not a rule.
 *
 * Deliberately narrow. This is not a second sanitizer competing with the prompt: it replaces the
 * one typographic mark the brand forbids, and leaves wording alone.
 */
function stripEmDashes(d: AssetDraft): AssetDraft {
  const fix = (t: string) => t.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim()
  return { ...d, components: d.components.map((c) => ({ ...c, value: fix(c.value) })) }
}

export class ClaudeCopyWriter implements CopyWriter {
  constructor(private fallback: CopyWriter) {}

  async draft(req: DraftRequest): Promise<DraftResult> {
    try {
      const res = await fetch('/api/draft-copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!res.ok) throw new Error(`draft-copy ${res.status}`)
      const out = (await res.json()) as DraftResult
      if (!out?.drafts?.length) throw new Error('empty draft')
      return { ...out, drafts: out.drafts.map(stripEmDashes), source: 'claude' }
    } catch {
      const fb = await this.fallback.draft(req)
      return { ...fb, source: 'heuristic' }
    }
  }
}

// ---- Heuristic fallback: deterministic copy composed from the brand's OWN
// inputs (the audience's real angle/pains/role + the brand voice/one-liner) and
// the proof point as evidence. No generic productivity scaffolding, ever. ----

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s)
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 15)
/** The first clause / sentence of a line — lets a long angle or one-liner seed a tight headline. */
const firstClause = (s: string) => (s || '').split(/[.;\n]|, (?=and |so |which |because )/i)[0].trim()
/** Trim to a char limit at a WORD boundary, no ellipsis — never a mangled "condi…". */
const fit = (s: string, max?: number) => {
  if (!max || s.length <= max) return s
  const cut = s.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > Math.floor(max * 0.5) ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '').trim()
}

const HYPE = /\b(best ever|#1|number one|revolutionary|game[- ]?changing|world[- ]?class|unbeatable|guaranteed|the ultimate)\b/gi

/** Enforce the brand don'ts on any generated string: no em dashes, no hype. */
function sanitizeToBrand(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')
    .replace(HYPE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .trim()
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Which component plays which role, so we can dedupe headline + body (CTAs are
 *  verbatim from the brand list, so they're allowed to recur). */
function pickRoles(fields: MessagingField[]): { headlineKey?: string; primaryKey?: string; ctaKey?: string } {
  const headlineKey = fields.find((f) => /headline|subject|title|subhead|^h\d/i.test(f.key))?.key
  const ctaKey = fields.find((f) => /cta/i.test(f.key))?.key
  const primaryKey = (fields.find((f) => /primary|body|caption|intro|post|message/i.test(f.key)) ?? fields[0])?.key
  return { headlineKey, primaryKey, ctaKey }
}

/** A clean, stage-appropriate CTA for when the brand has no CTA of its own.
 *  Never synthesized from a proof-point string. */
const GENERIC_CTA: Record<FunnelStage, string> = {
  awareness: 'Learn more',
  consideration: 'See how it works',
  conversion: 'Get started',
  retention: 'Stay in the loop',
}

interface Ctx {
  stage: FunnelStage
  who: string
  role?: string
  angle?: string
  pains: string[]
  hooks: string[]
  oneLiner?: string
  brandName: string
  proof: DraftProof
  ctaSeed?: string
  asset: DraftAsset
  i: number
  /** The creative execution format this asset is written as. */
  format: Fmt
  /** Personalization context (location, time, lifecycle, …) to localize copy to. */
  context: Record<string, string>
  /** A conditioned lead hook — when set, the headline + body open on it. */
  assetHook?: string
}

export class HeuristicCopyWriter implements CopyWriter {
  async draft(req: DraftRequest): Promise<DraftResult> {
    const { campaign, assets, proofPool, hooks, avoid, brand } = req
    // clientForCampaign maps a campaign NAME to its brand; when the "campaign" is itself a
    // brand name (the preview path) it returns UNASSIGNED, so fall back to the name.
    const resolved = clientForCampaign(campaign)
    const client = (resolved && resolved !== UNASSIGNED ? resolved : campaign.split(/—|-/).pop()?.trim()) || 'We'
    const oneLiner = brand?.oneLiner?.trim() || brand?.mission?.trim() || undefined
    const brandHooks = (hooks ?? []).map((h) => h.trim()).filter(Boolean)

    // Proof is the shared pool, reused across assets by design.
    const rtbs: Rtb[] =
      proofPool && proofPool.length ? proofPool : [{ id: 'proof-1', label: 'Proven results', detail: 'Add a proof point.' }]

    // Headlines + bodies stay distinct across the set; CTAs do NOT (verbatim brand CTAs recur).
    const usedH = new Set((avoid?.headlines ?? []).map(norm))
    const usedB = new Set((avoid?.bodies ?? []).map(norm))
    // No two bodies should share an opening — track the first few words of each.
    const usedOpen = new Set<string>()
    const openKey = (s: string) => norm(s).split(' ').slice(0, 4).join(' ')
    // Vary the EXECUTION format across the set (question, how-to, testimonial, …):
    // each asset gets the least-used format so the set spans many structures.
    const fmtUse = new Map<string, number>()

    const drafts: AssetDraft[] = assets.map((a, idx) => {
      const i = a.index ?? idx
      const stage = a.stage ?? funnelStageFor(a.channel, a.type)
      const proof = a.proof ?? rtbs[i % rtbs.length]
      const who = a.audience?.name?.trim() || `${client} customers`
      // A blueprint framework (AIDA/PAS/…) maps to an execution format so the heuristic
      // body follows the framework; otherwise rotate to the least-used format.
      const bpFormatKey = FRAMEWORK_FORMAT[(a.context?.framework ?? '').toUpperCase()]
      const format =
        (bpFormatKey && FORMATS.find((f) => f.key === bpFormatKey)) ||
        FORMATS.reduce((best, f) => ((fmtUse.get(f.key) ?? 0) < (fmtUse.get(best.key) ?? 0) ? f : best))
      fmtUse.set(format.key, (fmtUse.get(format.key) ?? 0) + 1)
      const ctx: Ctx = {
        stage,
        who,
        role: a.audience?.role?.trim() || undefined,
        angle: a.audience?.angle?.trim() || undefined,
        pains: (a.audience?.pains ?? []).map((p) => p.trim()).filter(Boolean),
        hooks: brandHooks,
        oneLiner,
        brandName: client,
        proof,
        ctaSeed: a.ctaSeed,
        asset: a,
        i,
        format,
        context: a.context ?? {},
        assetHook: a.hook?.trim() || undefined,
      }
      const roles = pickRoles(a.fields)
      // The field's position seeds its variant, so two same-role fields in one asset
      // (e.g. headline + subhead, body + key-takeaway) don't come out identical.
      const build = (fl: MessagingField, fi: number, v: number) => {
        const isCta = fl.key === roles.ctaKey
        const raw = sanitizeToBrand(componentCopy(fl, ctx, fi + v))
        // CTAs are verbatim brand CTAs — never truncate them.
        return isCta ? raw : fit(raw, fl.hardLimit)
      }
      const components: DraftComponent[] = a.fields.map((fl, fi) => {
        const isBody = fl.key === roles.primaryKey
        const used = fl.key === roles.headlineKey ? usedH : isBody ? usedB : null
        let value = build(fl, fi, 0)
        if (used) {
          // Bodies must also lead with a fresh opening, not just be distinct overall.
          for (
            let v = 0;
            v < 24 && norm(value) && (used.has(norm(value)) || (isBody && usedOpen.has(openKey(value))));
            v++
          )
            value = build(fl, fi, v + 1)
          const n = norm(value)
          if (n) used.add(n)
          if (isBody) usedOpen.add(openKey(value))
        }
        return { key: fl.key, value }
      })
      // Proof carried into the funnel, capped at 1-2 per asset (no whole-list dump):
      // the asset's own proof, plus one more on a landing page (the conversion hub).
      const second = rtbs[(i + 1) % rtbs.length]
      const rtbIds =
        a.channel === 'landing-page' && second.id !== proof.id ? [proof.id, second.id] : [proof.id]
      return { rowId: a.rowId, components, format: format.key, rtbIds }
    })
    return { rtbs, drafts, source: 'heuristic' }
  }
}

function componentCopy(fl: MessagingField, ctx: Ctx, v: number): string {
  const k = fl.key.toLowerCase()
  if (/cta/.test(k) || fl.label.toLowerCase() === 'cta') {
    // A CTA is a verbatim brand CTA (already stage-matched + distributed upstream);
    // never synthesized. Fall back to a clean generic, not a proof string.
    return ctx.ctaSeed?.trim() || GENERIC_CTA[ctx.stage]
  }
  if (/^path$/.test(k)) return slug(ctx.asset.assetName)
  if (/business|brand/.test(k)) return ctx.brandName
  if (/when/.test(k)) return 'Live, date TBD'
  if (/subject/.test(k)) return localizeHead(subjectFor(ctx, v), ctx.context)
  if (/subhead|sub-head|subtitle/.test(k)) return localizeHead(descFor(ctx, v), ctx.context)
  if (/preview|desc/.test(k)) return localizeHead(descFor(ctx, v), ctx.context)
  if (/headline|^h\d|title|long-headline/.test(k)) {
    // A blueprint's hero value-prop / title formula leads the headline (pages, blog);
    // else a conditioned hook; else the chosen format's headline.
    const formula = ctx.context?.subjectFormula?.trim()
    const head = formula && formula !== '—' ? fillSubjectFormula(formula, ctx) : ctx.assetHook ? cap(ctx.assetHook) : ctx.format.head(ctx, ctx.i + v)
    return localizeHead(head, ctx.context)
  }
  // Page section fields (proof / stat / FAQ) get section-appropriate content instead of a
  // generic body dup, so a landing page's sections read distinctly.
  if (/social|logo|trust/.test(k)) return localizeHead(`Trusted by ${ctx.who}. ${cap(ctx.proof.label)}.`.trim(), ctx.context)
  if (/proof|stat/.test(k)) return localizeHead((ctx.proof.detail?.trim() || `${cap(ctx.proof.label)}, proven with ${ctx.who}.`), ctx.context)
  if (/faq|objection|question/.test(k)) {
    const pain = painAt(ctx, ctx.i + v)
    return localizeBody(`Worried ${pain || 'it won’t fit'}? ${cap(ctx.proof.detail?.trim() || ctx.proof.label)} — built for ${ctx.who}.`, ctx.context)
  }
  // primary / body / intro / post / caption / message … -> the chosen execution format,
  // opened on the conditioned hook when one is set.
  const body = ctx.format.body(ctx, ctx.i + v)
  return localizeBody(ctx.assetHook ? `${cap(ctx.assetHook)}. ${body}` : body, ctx.context)
}

// ---- localization: weave the personalization context (location, time, lifecycle, …)
// so each fanned variant is DISTINCT and speaks to its context (closes the duplicate-
// on-fan gap). A place/time value leads the headline; all context values appear in the
// body clause, which guarantees variants of one base asset never come out identical.
const lifecyclePhrase = (v: string) => {
  const l = v.toLowerCase()
  if (/laps|win.?back|dormant|churn/.test(l)) return 'good to have you back'
  if (/new|prospect|cold/.test(l)) return 'new here'
  if (/active|engaged|current/.test(l)) return 'keeping it going'
  if (/month|recurring|loyal|vip|major/.test(l)) return `for our ${l} supporters`
  return l
}
/** The place/time-like context value that reads well as a headline lead. */
const headLead = (ctx: Record<string, string>) =>
  ctx.location || ctx.time || ctx.season || ctx.moment || ctx.account || ''
// Context keys that STEER generation (a blueprint's brief / framework / subject formula /
// allowed levers, and blueprint meta) but are never content — they must not be woven into
// the copy. The catch-all below would otherwise dump a whole page brief into the body.
const GUIDANCE_KEYS = new Set(['brief', 'framework', 'subjectformula', 'levers', 'cta', 'bpkey', 'bpstep', 'bptiming', 'audience', 'journey'])
/** A natural clause naming the full context, so every variant differs. */
function contextClause(ctx: Record<string, string>): string {
  const parts: string[] = []
  if (ctx.location) parts.push(`around ${ctx.location}`)
  const when = ctx.time || ctx.season || ctx.moment
  if (when) parts.push(`this ${lower(when)}`)
  if (ctx.lifecycle) parts.push(lifecyclePhrase(ctx.lifecycle))
  for (const [k, val] of Object.entries(ctx)) {
    if (['location', 'time', 'season', 'moment', 'lifecycle', 'account'].includes(k)) continue
    // Skip generation-guidance keys, and any long value (a brief, not a personalizer).
    if (GUIDANCE_KEYS.has(k.toLowerCase()) || val.length > 48) continue
    parts.push(lower(val))
  }
  if (ctx.account) parts.push(`for ${ctx.account}`)
  return parts.join(', ')
}
function localizeHead(text: string, ctx: Record<string, string>): string {
  const lead = headLead(ctx)
  if (!lead) return text
  return text.toLowerCase().includes(lead.toLowerCase()) ? text : `${cap(lead)}: ${text}`
}
function localizeBody(text: string, ctx: Record<string, string>): string {
  const clause = contextClause(ctx)
  if (!clause) return text
  return `${text.replace(/\.$/, '')}. ${cap(clause)}.`
}

const painAt = (ctx: Ctx, r: number) => (ctx.pains.length ? ctx.pains[r % ctx.pains.length] : '')
const pain2At = (ctx: Ctx, r: number) => (ctx.pains.length > 1 ? ctx.pains[(r + 1) % ctx.pains.length] : '')
const asPlural = (ctx: Ctx) => (ctx.role ? `${lower(ctx.role)}s` : ctx.who)
/** The proof, verbatim, as an evidence clause. */
const evidence = (ctx: Ctx) => {
  const d = ctx.proof.detail?.trim()
  return d ? `${cap(ctx.proof.label)}, ${lower(d)}` : cap(ctx.proof.label)
}

const angOf = (ctx: Ctx) => (ctx.angle ? firstClause(ctx.angle) : '')

/**
 * Creative EXECUTION formats. Each writes the asset's headline + body as its own
 * STRUCTURE (a question, a how-to, a testimonial, a myth-bust, a scene, a stat, a
 * PSA, a before/after, a one-liner), grounded in the audience's real pains/angle and
 * the verbatim proof. Generation rotates these so the set reads varied, not molded.
 */
interface Fmt {
  key: string
  head: (c: Ctx, r: number) => string
  body: (c: Ctx, r: number) => string
}
const pick = <T>(arr: T[], r: number): T => arr[r % arr.length]
// What the audience is trying to reach — the positive of their pain, kept brand-neutral
// so no industry's "good day" flavor leaks in. Composes from the brand's own angle/proof.
const upside = (c: Ctx) => firstClause(c.angle || '') || lower(c.proof.label) || 'what good looks like'
const who2 = (c: Ctx) => asPlural(c) || `${c.brandName} people`
/**
 * Creative EXECUTION formats — brand-NEUTRAL structural scaffolds. Each keeps its own
 * shape (question, how-to, testimonial, …) but carries ONLY brand-supplied substance:
 * the audience's real pains/role/angle, the verbatim proof, the one-liner. No industry
 * flavor of any kind (no domain nouns, scenes, or jargon), so a nonprofit and a fishing
 * brand get copy in THEIR own terms, never a borrowed voice. This is the contamination
 * fix at the writer: substance comes from the bound brand, structure from the format.
 */
// Map an email-blueprint copy framework to the closest execution format, so the offline
// heuristic still follows the framework's shape when a blueprint is applied.
const FRAMEWORK_FORMAT: Record<string, string> = {
  AIDA: 'story',
  PAS: 'myth-bust',
  BAB: 'before-after',
  FAB: 'how-to',
  '4PS': 'testimonial',
  SCANNABLE: 'one-liner',
}

const FORMATS: Fmt[] = [
  {
    key: 'question',
    head: (c, r) => (painAt(c, r) ? `${cap(painAt(c, r))}, or a better way?` : `Worth a closer look?`),
    body: (c, r) =>
      `${painAt(c, r) ? `${cap(painAt(c, r))}? ` : ''}${pick(['Not anymore.', 'There is a better way.', 'It does not have to be.'], r)} ${evidence(c)}, so you can decide on the facts.`,
  },
  {
    key: 'how-to',
    head: (_c, r) => pick([`Start here`, `Where to begin`, `The first thing to get right`], r),
    body: (c, r) =>
      `${pick(['Start with', 'First, look at', 'Begin with'], r)} ${lower(c.proof.label)}${angOf(c) ? `, ${lower(angOf(c))}` : ''}, and skip what leads to ${painAt(c, r) || 'wasted effort'}.`,
  },
  {
    key: 'testimonial',
    head: (_c, r) => pick([`"Best decision we made"`, `"It paid off fast"`, `"We don't work without it now"`], r),
    body: (c, r) =>
      `"${pick(["We don't start without", 'Our first move is always', 'We lean on'], r)} ${lower(c.proof.label)}. Haven't lost ground to ${painAt(c, r) || 'the old way'} since."${c.role ? ` — a ${lower(c.role)}` : ''}`,
  },
  {
    key: 'myth-bust',
    head: (_c, r) => pick([`You don't have to settle`, `Forget the old way`, `That's a myth`], r),
    body: (c, r) =>
      `${pick(['Myth:', 'They say', 'Common wisdom:'], r)} ${painAt(c, r) || 'this'} is just the cost of doing it. Reality: ${lower(evidence(c))}, so it isn't.`,
  },
  {
    key: 'story',
    head: (_c, r) => pick([`The moment it changes`, `Here's the shift`, `Picture the difference`], r),
    body: (c, r) =>
      `${pick([`${cap(who2(c))} used to face ${painAt(c, r) || 'the same problem'} every time.`, `It starts the same way for most ${who2(c)}.`, `${cap(painAt(c, r) || 'The hard part')} used to be the price of entry.`], r)} Then ${lower(c.proof.label)} changes it. ${angOf(c) ? `${cap(angOf(c))}.` : `That's how ${who2(c)} get ahead.`}`,
  },
  {
    key: 'stat',
    head: (c) => cap(c.proof.label),
    body: (c, r) =>
      `${evidence(c)}. ${pick(['The line between', 'The difference between', 'What separates'], r)} ${lower(upside(c))} and ${painAt(c, r) || 'standing still'}.`,
  },
  {
    key: 'psa',
    head: (c) => `Heads up, ${who2(c)}`,
    body: (c, r) =>
      `${pick(['Things change fast.', 'The ground keeps shifting.', 'It moves quickly.'], r)} ${evidence(c)} means you're not guessing on ${painAt(c, r) || 'what matters'}.`,
  },
  {
    key: 'before-after',
    head: (_c, r) => pick([`Before and after`, `Old way vs new`, `Then and now`], r),
    body: (c, r) =>
      `${pick(['Before:', 'Old way:', 'Until now:'], r)} ${painAt(c, r) || 'guesswork'}${pain2At(c, r) ? `, ${pain2At(c, r)}` : ''}. ${pick(['After:', 'New way:', 'Now:'], r)} ${lower(evidence(c))}.`,
  },
  {
    key: 'one-liner',
    head: (c, r) => (angOf(c) ? cap(angOf(c)) : pick([`A clearer way`, `Built on proof`, `Facts over guesswork`], r)),
    body: (c, r) =>
      pick(
        [
          `${cap(upside(c))}. Backed by ${lower(c.proof.label)}.`,
          `${cap(angOf(c) || c.oneLiner || 'Clarity over guesswork')}. ${cap(c.proof.label)}.`,
          `Less ${painAt(c, r) || 'guesswork'}. More of what works. ${cap(c.proof.label)}.`,
        ],
        r,
      ),
  },
]

function descFor(ctx: Ctx, v: number): string {
  // Short supporting line (email preview, ad description) — always real, never ".".
  const r = ctx.i + v
  const pain = painAt(ctx, r)
  const pool = [
    ...ctx.hooks.map((h) => h.replace(/[.!?]+$/, '')),
    pain ? `Less ${pain}, more of what works` : '',
    ctx.angle ? firstClause(ctx.angle) : '',
    ctx.proof.detail?.trim() || ctx.proof.label,
  ].filter(Boolean)
  return cap(pool[r % pool.length] || ctx.proof.label)
}

// Fill a blueprint subject formula's {slots} with the best available values; strip any
// slot we can't fill and tidy the result. Keeps the formula's shape without leaving braces.
function fillSubjectFormula(formula: string, ctx: Ctx): string {
  const need = ctx.pains[0] ? firstClause(ctx.pains[0]) : 'get the job done'
  const value = firstClause(ctx.oneLiner || ctx.proof.detail || ctx.proof.label)
  const fills: Record<string, string> = {
    brand: ctx.brandName,
    first_name: '',
    name: '',
    offer: 'welcome offer',
    discount: 'a deal',
    gift: 'gift',
    perk: 'members perk',
    product: 'pick',
    category: 'platform',
    hook: value,
    number: '3',
    points: 'points',
    tier: 'the next tier',
    // page / blog value-prop + title slots
    audience: ctx.who,
    customer: ctx.who,
    need,
    pain: need,
    benefit: value,
    outcome: value,
    mechanism: 'in one place',
    topic: value,
    things: 'ways',
  }
  let s = formula.replace(/\{(\w+)\}/g, (_m, k: string) => fills[k.toLowerCase()] ?? '')
  s = s
    .replace(/\b(\w+)\s+\1\b/gi, '$1') // collapse an accidental repeated word ("your your")
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?:;])/g, '$1')
    .replace(/^[\s,:—-]+/, '')
    .replace(/[\s,]+$/, '')
    .replace(/,\s*,/g, ',')
    .trim()
  return cap(s)
}

function subjectFor(ctx: Ctx, v: number): string {
  const formula = ctx.context?.subjectFormula?.trim()
  if (formula && formula !== '—') return fillSubjectFormula(formula, ctx)
  const r = ctx.i + v
  const pain = painAt(ctx, r)
  const pool = [
    ...ctx.hooks.map((h) => cap(h).replace(/[.!?]+$/, '')),
    pain ? `${cap(pain)}? Here's the fix` : '',
    ctx.angle ? cap(firstClause(ctx.angle)) : '',
    cap(ctx.proof.label),
  ].filter(Boolean)
  return pool[r % pool.length] || cap(ctx.proof.label)
}
