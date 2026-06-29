import { clientForCampaign, type ClientProfile } from '../../domain/clients'
import { funnelStageFor, type FunnelStage } from '../../domain/funnel'
import type { MessagingField } from '../../domain/messaging'
import type { BrandGuide } from '../../domain/readiness'
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
export interface DraftAudience {
  name: string
  role?: string
  /** The message angle that lands for this segment. */
  angle?: string
  /** This segment's pains. */
  pains?: string[]
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
  /** Stable index in the batch — lets the heuristic vary deterministically. */
  index?: number
}
export interface DraftRequest {
  icp: Icp | null
  campaign: string
  /** The client's brand profile (website / industry / voice), if captured. */
  brand?: ClientProfile
  /** The confirmed brand guide — generation writes in its voice and honors its don'ts. */
  brandGuide?: BrandGuide
  /** The shared proof pool the assets draw from (reused across assets by design). */
  proofPool?: Rtb[]
  /** The brand's hook list (opening lines) — used as openings where they fit. */
  hooks?: string[]
  /** Strings already used in this campaign that a (re)generation must not reuse. */
  avoid?: { headlines: string[]; bodies: string[]; ctas: string[] }
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
export interface DraftResult {
  rtbs: Rtb[]
  drafts: AssetDraft[]
}

export interface CopyWriter {
  draft(req: DraftRequest): Promise<DraftResult>
}

/**
 * Real writer: POSTs to the server-side /api/draft-copy endpoint (which calls
 * Claude). Falls back to the heuristic writer when the backend is absent, has no
 * API key (501), or errors — so drafting always works, key or not.
 */
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
      return out
    } catch {
      return this.fallback.draft(req)
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
}

export class HeuristicCopyWriter implements CopyWriter {
  async draft(req: DraftRequest): Promise<DraftResult> {
    const { campaign, assets, proofPool, hooks, avoid, brand } = req
    const client = clientForCampaign(campaign) ?? campaign.split(/—|-/).pop()?.trim() ?? 'We'
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
      const format = FORMATS.reduce((best, f) =>
        (fmtUse.get(f.key) ?? 0) < (fmtUse.get(best.key) ?? 0) ? f : best,
      )
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
    return { rtbs, drafts }
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
  if (/subject/.test(k)) return subjectFor(ctx, v)
  if (/subhead|sub-head|subtitle/.test(k)) return descFor(ctx, v) // secondary headline -> short line
  if (/preview|desc/.test(k)) return descFor(ctx, v)
  if (/headline|^h\d|title|long-headline/.test(k)) return ctx.format.head(ctx, ctx.i + v)
  // primary / body / intro / post / caption / message … -> the chosen execution format.
  return ctx.format.body(ctx, ctx.i + v)
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
const FORMATS: Fmt[] = [
  {
    key: 'question',
    head: (c, r) => (painAt(c, r) ? `${cap(painAt(c, r))} or a full day?` : `Know before you go?`),
    body: (c, r) =>
      `${painAt(c, r) ? `${cap(painAt(c, r))}? ` : ''}${pick(['Not this trip.', 'Not on your watch.', 'Skip it.'], r)} ${evidence(c)}, so you read the day before you run it.`,
  },
  {
    key: 'how-to',
    head: (_c, r) => pick([`3 checks before you leave the dock`, `Your pre-run checklist`, `Do this before you cast`], r),
    body: (c, r) =>
      `${pick(['Before you run, check', 'Two minutes before you cast, check', 'First thing each morning, read'], r)} ${lower(c.proof.label)}, watch the window, and skip the day that means ${painAt(c, r) || 'a wasted run'}.`,
  },
  {
    key: 'testimonial',
    head: (_c, r) => pick([`"Best call I make all morning"`, `"It paid for itself in a week"`, `"I don't run without it"`], r),
    body: (c, r) =>
      `"${pick(["I don't leave the ramp without", 'I never run a charter without', 'My first check every morning is'], r)} ${lower(c.proof.label)}. Haven't lost a day to ${painAt(c, r) || 'bad calls'} since."${c.role ? ` — a ${lower(c.role)}` : ''}`,
  },
  {
    key: 'myth-bust',
    head: (_c, r) => pick([`You don't have to guess`, `Forget the old way`, `That's a myth`], r),
    body: (c, r) =>
      `${pick(['Myth:', 'They say', 'Common wisdom:'], r)} ${painAt(c, r) || 'a blown run'} is just part of the job. Reality: ${lower(evidence(c))}, so it isn't.`,
  },
  {
    key: 'story',
    head: (_c, r) => pick([`4am at the ramp`, `Out before sunrise`, `On the water by six`], r),
    body: (c, r) =>
      `${pick(['Dark dock, wind picking up.', 'First light, water like glass.', 'Tide turning, the fleet still asleep.'], r)} One look at ${lower(c.proof.label)} and the call is easy. ${angOf(c) ? `${cap(angOf(c))}.` : `That's how ${asPlural(c)} run a good day.`}`,
  },
  {
    key: 'stat',
    head: (c) => cap(c.proof.label),
    body: (c, r) =>
      `${evidence(c)}. ${pick(['The line between', 'The difference between', 'What separates'], r)} a full day and ${painAt(c, r) || 'a wasted run'}.`,
  },
  {
    key: 'psa',
    head: (c) => `Heads up, ${asPlural(c)}`,
    body: (c, r) =>
      `${pick(['Conditions turn fast.', 'The weather does not wait.', 'It changes by the hour out there.'], r)} ${evidence(c)} means you're not guessing on ${painAt(c, r) || 'the window'}.`,
  },
  {
    key: 'before-after',
    head: (_c, r) => pick([`Before and after`, `Old way vs new`, `Then and now`], r),
    body: (c, r) =>
      `${pick(['Before:', 'Old way:', 'Last season:'], r)} ${painAt(c, r) || 'guesswork'}${pain2At(c, r) ? `, ${pain2At(c, r)}` : ''}. ${pick(['After:', 'New way:', 'This season:'], r)} ${lower(evidence(c))}.`,
  },
  {
    key: 'one-liner',
    head: (c, r) => (angOf(c) ? cap(angOf(c)) : pick([`Read the water`, `Know the window`, `Run on the facts`], r)),
    body: (c, r) =>
      pick(
        [
          `Know the window. Run the day. ${cap(c.proof.label)}.`,
          `${cap(angOf(c) || 'Read the water, not the guesswork')}. ${cap(c.proof.label)}.`,
          `Less ${painAt(c, r) || 'guesswork'}. More time fishing. ${cap(c.proof.label)}.`,
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
    pain ? `Less ${pain}, more good days` : '',
    ctx.angle ? firstClause(ctx.angle) : '',
    ctx.proof.detail?.trim() || ctx.proof.label,
  ].filter(Boolean)
  return cap(pool[r % pool.length] || ctx.proof.label)
}

function subjectFor(ctx: Ctx, v: number): string {
  const r = ctx.i + v
  const pain = painAt(ctx, r)
  const pool = [
    ...ctx.hooks.map((h) => cap(h).replace(/[.!?]+$/, '')),
    pain ? `${cap(pain)}? Here's the read` : '',
    ctx.angle ? cap(firstClause(ctx.angle)) : '',
    cap(ctx.proof.label),
  ].filter(Boolean)
  return pool[r % pool.length] || cap(ctx.proof.label)
}
