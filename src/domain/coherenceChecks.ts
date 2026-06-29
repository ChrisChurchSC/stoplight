import type { BreakEvidence, BreakSeverity, CoherenceBreak } from './breaks'
import type { ClientProfile } from './clients'
import { FUNNEL_STAGES, funnelStageFor } from './funnel'
import type { MessagingLibrary } from './library'
import { assetRtbIds } from './rtb'
import type { ChannelId, TrafficRow } from './types'

/**
 * Deterministic coherence detectors — the always-on FLOOR under the Claude check.
 *
 * When Claude is unavailable (no key / no credit), the check must still catch the
 * defects that fan-out would amplify: cross-brand contamination, raw library-field
 * leaks, broken casing/concatenation, duplicate variants, off-audience proof, and
 * journey-handoff drops. These run over the full TrafficRow[] plus the brand's
 * vocabulary, so a real break returns a typed CoherenceBreak (with a verbatim
 * highlight span the UI can mark) and a clean campaign returns nothing. Precision is
 * the priority: every detector is conservative so a clean set never reports a false
 * break (no false non-zeros), while the blatant seeded breaks always fire.
 */

// ---- vocabulary ----------------------------------------------------------------

export interface VocabAudience {
  name: string
  role?: string
  pains: string[]
  /** Distinctive content tokens for this audience (role + pains). */
  terms: Set<string>
}
export interface CoherenceVocab {
  client: string
  campaign: string
  audiences: VocabAudience[]
  /** All content tokens this brand legitimately uses. */
  ownTerms: Set<string>
  /** Another brand's signature term → that brand's name (not used by this brand). */
  foreign: Map<string, string>
  /** Proof points available to this brand, by id (for audience-tagged proof). */
  proofById: Map<string, { label: string; audienceId?: string }>
}

// Stopwords + generic marketing words: excluded from "distinctive" term sets so a
// shared word ("results", "faster") is never mistaken for cross-brand contamination.
const STOP = new Set(
  ('the a an and or but for to of in on at by with from your you our we they this that these those is are was '
    + 'be it as so if then than into over under out up down off not no yes can will get got make made more most '
    + 'less best good great new now today here there what when where who how why all any each every some').split(/\s+/),
)
const GENERIC = new Set(
  ('results faster better easier simple plain proof value team teams work works working time times day days '
    + 'people customer customers buyer buyers brand brands market marketing growth sales revenue data tools tool '
    + 'platform product products service services free trial demo start learn more help guide built build run '
    + 'first every right good full window windows call calls').split(/\s+/),
)

/** Content tokens (lowercased words, length >= 4, not a stopword). */
function tokens(s: string | undefined): string[] {
  if (!s) return []
  return (s.toLowerCase().match(/[a-z][a-z'&-]{2,}/g) ?? []).map((t) => t.replace(/[^a-z]/g, '')).filter((t) => t.length >= 4 && !STOP.has(t))
}
function addTerms(set: Set<string>, strs: (string | undefined)[]): void {
  for (const s of strs) for (const t of tokens(s)) set.add(t)
}

/** Build the vocabulary a deterministic check measures against: this brand's own
 *  terms, other brands' signature terms (for contamination), its audiences, and proof. */
export function buildCoherenceVocab(
  client: string,
  campaign: string,
  brandSystems: Record<string, MessagingLibrary>,
  clientProfiles: Record<string, ClientProfile>,
): CoherenceVocab {
  const sys = brandSystems[client]
  const prof = clientProfiles[client]
  const ownTerms = new Set<string>()
  addTerms(ownTerms, [prof?.oneLiner, prof?.industry, prof?.mission, prof?.voice, ...(prof?.products ?? []), ...(prof?.differentiators ?? []), ...(prof?.values ?? [])])
  for (const a of sys?.audiences ?? []) addTerms(ownTerms, [a.name, a.role, a.messageAngle, ...(a.pains ?? [])])
  for (const r of sys?.rtbs ?? []) addTerms(ownTerms, [r.label, r.detail])
  for (const a of sys?.audiences ?? []) for (const r of a.rtbs ?? []) addTerms(ownTerms, [r.label, r.detail])
  for (const h of sys?.hooks ?? []) addTerms(ownTerms, [h.text])
  for (const s of sys?.subjects ?? []) addTerms(ownTerms, [s.text])

  const audiences: VocabAudience[] = (sys?.audiences ?? []).map((a) => {
    const terms = new Set<string>()
    addTerms(terms, [a.role, ...(a.pains ?? [])])
    return { name: a.name, role: a.role, pains: a.pains ?? [], terms }
  })

  // Foreign signature terms: distinctive words other brands use that THIS brand does
  // not. Drawn from HIGH-SIGNAL fields ONLY (one-liner, industry, products, proof
  // LABELS) — audience pains/hooks are too generic and caused false positives. Length
  // >= 5, generics excluded. Detection also requires >= 2 of these per asset, so a
  // single shared word never fires (a real contamination is a chunk of foreign copy).
  const foreign = new Map<string, string>()
  for (const [b, bsys] of Object.entries(brandSystems)) {
    if (b === client) continue
    const hi = new Set<string>()
    const bprof = clientProfiles[b]
    addTerms(hi, [bprof?.oneLiner, bprof?.industry, ...(bprof?.products ?? []), ...(bprof?.differentiators ?? [])])
    for (const r of bsys.rtbs ?? []) addTerms(hi, [r.label])
    for (const a of bsys.audiences ?? []) for (const r of a.rtbs ?? []) addTerms(hi, [r.label])
    for (const t of hi) if (t.length >= 5 && !GENERIC.has(t) && !ownTerms.has(t) && !foreign.has(t)) foreign.set(t, b)
  }

  const proofById = new Map<string, { label: string; audienceId?: string }>()
  for (const r of sys?.rtbs ?? []) proofById.set(r.id, { label: r.label, audienceId: r.audienceId })
  for (const a of sys?.audiences ?? []) for (const r of a.rtbs ?? []) proofById.set(r.id, { label: r.label, audienceId: r.audienceId ?? a.name })

  return { client, campaign, audiences, ownTerms, foreign, proofById }
}

// ---- helpers -------------------------------------------------------------------

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)
const fieldsOf = (row: TrafficRow): [string, string][] =>
  Object.entries(row.messaging ?? {}).filter(([, v]) => typeof v === 'string' && v.trim().length > 0) as [string, string][]
const humanField = (k: string) => k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
/** Exact (verbatim) substring of `text` matching `needle`, so BreakCard's highlight marks render. */
function span(text: string, needle: string): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase())
  return i >= 0 ? text.slice(i, i + needle.length) : text.slice(0, Math.min(40, text.length))
}
const stageRank = (row: TrafficRow) => FUNNEL_STAGES.findIndex((s) => s.stage === funnelStageFor(row.channel, row.assetType))
/** The asset's headline-ish field, then its primary/body field — for evidence. */
function primaryField(row: TrafficRow): [string, string] {
  const fs = fieldsOf(row)
  const head = fs.find(([k]) => /headline|subject|title|hook/i.test(k))
  return head ?? fs.find(([k]) => /primary|body|caption|intro|post|message/i.test(k)) ?? fs[0] ?? ['copy', '']
}

function mkBreak(opts: {
  axis: CoherenceBreak['axis']
  severity: BreakSeverity
  headline: string
  why: string
  from: BreakEvidence
  to?: BreakEvidence
  after: string
  vocab: CoherenceVocab
  attachRtb?: string
}): CoherenceBreak {
  const { axis, severity, headline, why, from, to, after, vocab, attachRtb } = opts
  return {
    id: `det-${axis}-${slug(from.assetName)}-${slug(from.field)}`,
    axis,
    severity,
    headline,
    campaign: vocab.campaign,
    client: vocab.client,
    from,
    to,
    why,
    suggestedFix: { assetName: from.assetName, channel: from.channel as ChannelId, field: from.field, before: from.text, after, attachRtb },
    status: 'open',
  }
}
const evidence = (row: TrafficRow, field: string, text: string, highlight: string): BreakEvidence => ({
  role: humanField(field),
  assetName: row.assetName,
  channel: row.channel,
  field,
  text,
  highlight: span(text, highlight),
})

// ---- detectors -----------------------------------------------------------------

/** Cross-brand contamination: a CHUNK of another brand's signature language in this
 *  campaign's copy — requires >= 2 distinct foreign terms from the SAME brand in one
 *  asset, so a single shared word never false-positives. */
function detectContamination(rows: TrafficRow[], vocab: CoherenceVocab): CoherenceBreak[] {
  if (vocab.foreign.size === 0) return []
  const out: CoherenceBreak[] = []
  for (const row of rows) {
    // Collect foreign hits per other-brand, with the field/term to cite as evidence.
    const byBrand = new Map<string, { terms: Set<string>; field: string; text: string; term: string }>()
    for (const [field, text] of fieldsOf(row)) {
      for (const t of new Set(tokens(text))) {
        const brand = vocab.foreign.get(t)
        if (!brand) continue
        const e = byBrand.get(brand)
        if (e) e.terms.add(t)
        else byBrand.set(brand, { terms: new Set([t]), field, text, term: t })
      }
    }
    // Flag the brand contributing the MOST signature terms, if 2 or more.
    let worst: { brand: string; e: { terms: Set<string>; field: string; text: string; term: string } } | undefined
    for (const [brand, e] of byBrand) if (e.terms.size >= 2 && (!worst || e.terms.size > worst.e.terms.size)) worst = { brand, e }
    if (!worst) continue
    const { brand, e } = worst
    const terms = [...e.terms]
    out.push(
      mkBreak({
        axis: 'contamination',
        severity: 'high',
        headline: `"${row.assetName}" uses ${brand}'s language, not ${vocab.client}'s`,
        why: `${terms.slice(0, 3).join(', ')} ${terms.length > 1 ? 'are' : 'is'} ${brand}'s vocabulary, not ${vocab.client}'s. This copy was contaminated from another brand.`,
        from: evidence(row, e.field, e.text, e.term),
        after: terms.reduce((s, t) => s.replace(new RegExp(`\\b${t}\\b`, 'ig'), ''), e.text).replace(/\s{2,}/g, ' ').trim(),
        vocab,
      }),
    )
  }
  return out
}

/** Raw field leak: a library field (the audience's pains, or a placeholder) pasted in
 *  raw instead of written into prose. */
function detectLeaks(rows: TrafficRow[], vocab: CoherenceVocab): CoherenceBreak[] {
  const out: CoherenceBreak[] = []
  const placeholder = /\b(undefined|null|NaN|\[object Object\])\b|\{\{|\}\}|\$\{/i
  for (const row of rows) {
    const aud = vocab.audiences.find((a) => a.name === (row.audience ?? '').trim())
    for (const [field, text] of fieldsOf(row)) {
      // 1) template/placeholder leak
      const ph = text.match(placeholder)
      if (ph) {
        out.push(
          mkBreak({
            axis: 'leak',
            severity: 'high',
            headline: `"${row.assetName}" has an unfilled placeholder in its ${humanField(field).toLowerCase()}`,
            why: `"${ph[0]}" is a raw template artifact, not finished copy.`,
            from: evidence(row, field, text, ph[0]),
            after: text.replace(placeholder, '').replace(/\s{2,}/g, ' ').trim(),
            vocab,
          }),
        )
        break
      }
      // 2) the audience's pains dumped as a raw comma/ampersand list. Requires 3+
      // pains adjacent (a real raw dump is the whole array) so a stylistic two-item
      // list ("Before: blown trips, burned fuel") is NOT flagged.
      if (aud && aud.pains.length >= 3) {
        const run = aud.pains.filter((p) => p && text.toLowerCase().includes(p.toLowerCase()))
        if (run.length >= 3) {
          // is it a raw list (pains adjacent, separated only by , / & / ;) rather than prose?
          const joined = new RegExp(run.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*[,&;]\\s*'), 'i')
          const m = text.match(joined)
          if (m) {
            out.push(
              mkBreak({
                axis: 'leak',
                severity: 'medium',
                headline: `"${row.assetName}" pastes the audience's raw pain list into copy`,
                why: `The pains (${run.join(', ')}) were dumped in verbatim instead of written into a sentence.`,
                from: evidence(row, field, text, m[0]),
                after: text.replace(joined, run[0]).replace(/\s{2,}/g, ' ').trim(),
                vocab,
              }),
            )
            break
          }
        }
      }
    }
  }
  return out
}

/** Broken casing / concatenation: cEO, tripled letters, bad doubled joins, lowercase
 *  sentence starts. */
function detectCasing(rows: TrafficRow[], vocab: CoherenceVocab): CoherenceBreak[] {
  const out: CoherenceBreak[] = []
  for (const row of rows) {
    for (const [field, text] of fieldsOf(row)) {
      // a) a lone lowercase letter then an all-caps run: "cEO", "cMO"
      let m = text.match(/\b[a-z][A-Z]{2,}\b/)
      // b) tripled letters: "aaa"
      if (!m) m = text.match(/([A-Za-z])\1\1/)
      // c) a doubled-join artifact: a word like "funderss" whose de-doubled form is a real brand term
      let badDouble: string | undefined
      if (!m) {
        for (const w of text.match(/[A-Za-z]{4,}/g) ?? []) {
          const lw = w.toLowerCase()
          if (/([a-z])\1$/.test(lw) && vocab.ownTerms.has(lw.slice(0, -1)) && !vocab.ownTerms.has(lw)) {
            badDouble = w
            break
          }
        }
      }
      // d) a sentence (after . ! ?) that starts lowercase
      const lcStart = text.match(/[.!?]\s+([a-z]\w+)/)
      const hit = m?.[0] ?? badDouble ?? lcStart?.[1]
      if (!hit) continue
      const fixed = badDouble
        ? text.replace(badDouble, badDouble.slice(0, -1))
        : lcStart && !m
          ? text.replace(lcStart[0], lcStart[0].replace(lcStart[1], lcStart[1][0].toUpperCase() + lcStart[1].slice(1)))
          : text
      out.push(
        mkBreak({
          axis: 'casing',
          severity: 'medium',
          headline: `"${row.assetName}" has a casing or concatenation error`,
          why: `"${hit}" looks like broken casing or a join artifact, not intended copy.`,
          from: evidence(row, field, text, hit),
          after: fixed,
          vocab,
        }),
      )
      break
    }
  }
  return out
}

/** Duplicate variant: two assets whose copy is identical where they should differ. */
function detectDuplicates(rows: TrafficRow[], vocab: CoherenceVocab): CoherenceBreak[] {
  const byCopy = new Map<string, TrafficRow[]>()
  for (const row of rows) {
    const norm = fieldsOf(row)
      .map(([, v]) => v)
      .sort()
      .join(' | ')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (norm.length < 12) continue
    const list = byCopy.get(norm)
    if (list) list.push(row)
    else byCopy.set(norm, [row])
  }
  const out: CoherenceBreak[] = []
  for (const group of byCopy.values()) {
    if (group.length < 2) continue
    const [a, b] = group
    const [field, text] = primaryField(a)
    const [bField, bText] = primaryField(b)
    out.push(
      mkBreak({
        axis: 'duplicate',
        severity: 'high',
        headline: `"${a.assetName}" and "${b.assetName}" are identical (${group.length} copies)`,
        why: `These assets target different slots but carry the exact same copy, so the variant adds nothing.`,
        from: evidence(a, field, text, text.slice(0, 40)),
        to: evidence(b, bField, bText, bText.slice(0, 40)),
        after: text,
        vocab,
      }),
    )
  }
  return out
}

/** Off-audience proof / claim: an asset carries a proof point tagged to a different
 *  audience, or copy that speaks to a different audience than the one it targets. */
function detectOffAudience(rows: TrafficRow[], vocab: CoherenceVocab): CoherenceBreak[] {
  if (vocab.audiences.length < 2) return []
  const out: CoherenceBreak[] = []
  for (const row of rows) {
    const audName = (row.audience ?? '').trim()
    const own = vocab.audiences.find((a) => a.name === audName)
    if (!own) continue
    // a) attached proof tagged to a different audience
    let flagged = false
    for (const id of assetRtbIds(row)) {
      const p = vocab.proofById.get(id)
      if (p?.audienceId && p.audienceId !== audName) {
        const [field, text] = primaryField(row)
        out.push(
          mkBreak({
            axis: 'audience',
            severity: 'high',
            headline: `"${row.assetName}" leans on ${p.audienceId}'s proof, but targets ${audName}`,
            why: `"${p.label}" is proof for ${p.audienceId}. On a ${audName} asset it is off-ICP and will not land.`,
            from: evidence(row, field, text, text.slice(0, 30)),
            after: text,
            vocab,
          }),
        )
        flagged = true
        break
      }
    }
    if (flagged) continue
    // b) copy carries another audience's distinctive term (role/pain) that isn't its own
    const otherTerms = new Map<string, string>()
    for (const a of vocab.audiences) {
      if (a.name === audName) continue
      for (const t of a.terms) if (!own.terms.has(t) && !GENERIC.has(t)) otherTerms.set(t, a.name)
    }
    if (otherTerms.size === 0) continue
    for (const [field, text] of fieldsOf(row)) {
      const hit = tokens(text).find((t) => otherTerms.has(t))
      if (!hit) continue
      const other = otherTerms.get(hit)!
      out.push(
        mkBreak({
          axis: 'audience',
          severity: 'medium',
          headline: `"${row.assetName}" speaks to ${other}, not its ${audName} audience`,
          why: `"${hit}" is ${other} language. This asset targets ${audName}, so the message drifts off its segment.`,
          from: evidence(row, field, text, hit),
          after: text.replace(new RegExp(hit, 'ig'), '').replace(/\s{2,}/g, ' ').trim(),
          vocab,
        }),
      )
      break
    }
  }
  return out
}

/** Journey-handoff drop: a downstream asset (via branchOf / linksTo) that shares no
 *  hook with the upstream asset that hands to it. */
function detectJourneyDrops(rows: TrafficRow[], vocab: CoherenceVocab): CoherenceBreak[] {
  const byName = new Map<string, TrafficRow>()
  for (const r of rows) if (!byName.has(r.assetName)) byName.set(r.assetName, r)
  const out: CoherenceBreak[] = []
  for (const child of rows) {
    // Only a deliberate journey link (branchOf) is a "handoff" whose hook can be
    // dropped. A mechanical ad -> page link (linksTo) is not, so it's excluded to
    // avoid flagging independently generated assets.
    const parentName = (child.branchOf ?? '').trim()
    if (!parentName || parentName === child.assetName) continue
    const parent = byName.get(parentName)
    if (!parent) continue
    if (stageRank(child) <= stageRank(parent)) continue // only a forward handoff can "drop" the hook
    const [pField, pHook] = primaryField(parent)
    const childText = fieldsOf(child)
      .map(([, v]) => v)
      .join(' ')
    const pTerms = new Set(tokens(pHook))
    if (pTerms.size === 0) continue
    const cTerms = new Set(tokens(childText))
    const shared = [...pTerms].some((t) => cTerms.has(t))
    if (shared) continue // the thread carries through — fine
    const [cField, cText] = primaryField(child)
    out.push(
      mkBreak({
        axis: 'journey',
        severity: 'high',
        headline: `"${child.assetName}" drops the hook "${parent.assetName}" opened`,
        why: `The handoff from ${parent.assetName} to ${child.assetName} shares no idea, so the prospect arrives to a different message than the one that brought them.`,
        from: evidence(parent, pField, pHook, pHook.slice(0, 40)),
        to: evidence(child, cField, cText, cText.slice(0, 40)),
        after: cText,
        vocab,
      }),
    )
  }
  return out
}

/** Run every deterministic detector. The always-on floor under the Claude check. */
export function detectStructuralBreaks(rows: TrafficRow[], vocab: CoherenceVocab): CoherenceBreak[] {
  return [
    ...detectContamination(rows, vocab),
    ...detectLeaks(rows, vocab),
    ...detectCasing(rows, vocab),
    ...detectDuplicates(rows, vocab),
    ...detectOffAudience(rows, vocab),
    ...detectJourneyDrops(rows, vocab),
  ]
}
