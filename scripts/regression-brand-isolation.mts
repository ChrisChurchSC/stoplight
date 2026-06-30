/**
 * Regression: the brand boundary (brand = the coherence baseline).
 *
 * Guards the Big Buoy → World Within contamination — one brand's assets/voice must
 * never reach another brand's generation or coherence check. Covers hard isolation, the
 * Unassigned-merge refusal, hierarchy inheritance, voice override, explicit sharing,
 * merge precedence, cycles, and draft brands.
 *
 * Run:  npx tsx ./scripts/regression-brand-isolation.mts
 * (Pairs with the de-fished heuristic writer; together they close both contamination
 *  vectors — cross-brand asset bleed AND hardcoded industry copy.)
 */
import {
  resolveBrandScope,
  scopeBrands,
  ancestorsOf,
  isBrandless,
  isDraftBrand,
  resolveBrandVoice,
  brandBaseline,
  type BrandMetaMap,
} from '../src/domain/brand'
import { buildCoherenceVocab } from '../src/domain/coherenceChecks'
import { emptyLibrary } from '../src/domain/library'

let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('  ✗ ' + m) } else console.log('  ✓ ' + m) }

// ---- Two unrelated brands in one workspace -------------------------------------
const bigBuoy = {
  ...emptyLibrary(),
  rtbs: [{ id: 'bb1', label: 'Live buoy data from 1,800 NOAA stations', detail: 'updated every ten minutes' } as any],
  audiences: [{ name: 'Charter captains', role: 'Captain', messageAngle: 'Fish the tide', pains: ['empty trips'] } as any],
  hooks: [{ id: 'bbh', text: 'Know the dock conditions before you leave' } as any],
}
const worldWithin = {
  ...emptyLibrary(),
  rtbs: [{ id: 'ww1', label: 'Trauma-informed curriculum used in 40 schools', detail: 'co-designed with educators' } as any],
  audiences: [{ name: 'School counselors', role: 'Counselor', messageAngle: 'A way in to the inner world', pains: ['burnout'] } as any],
  hooks: [{ id: 'wwh', text: 'Every student has an inner world worth knowing' } as any],
}
const systems: Record<string, any> = { 'Big Buoy': bigBuoy, 'World Within': worldWithin }
const profiles: Record<string, any> = {
  'Big Buoy': { oneLiner: 'Marine forecasts for anglers', industry: 'Fishing', products: ['buoy', 'tides'], voice: 'Salty, direct' },
  'World Within': { oneLiner: 'Social-emotional learning for schools', industry: 'Education', products: ['curriculum'], voice: 'Warm, grounded' },
}

console.log('VECTOR 1 — hard isolation (no Unassigned merge, no cross-brand read)')
const wwScope = resolveBrandScope('World Within', systems, {})
const wwProofLabels = wwScope.library.rtbs.map((r: any) => r.label).join(' | ')
ok(wwScope.library.rtbs.every((r: any) => r.id === 'ww1'), 'World Within scope contains ONLY its own proof')
ok(!/buoy|NOAA|tide|dock/i.test(wwProofLabels), 'no Big Buoy fishing proof leaks into World Within scope')
ok(wwScope.library.audiences.every((a: any) => a.name === 'School counselors'), 'no Big Buoy audience leaks in')
ok(wwScope.sources.length === 1 && wwScope.sources[0].brand === 'World Within', 'baseline source is World Within alone')

console.log('\nVECTOR 1 — coherence baseline knows its referent + flags the other brand as foreign')
const vocab = buildCoherenceVocab('World Within', 'Spring', systems, profiles, {})
ok(vocab.client === 'World Within', 'vocab records the brand it measured against')
ok([...vocab.ownTerms].some((t) => /curriculum|counselor|inner/i.test(t)), 'ownTerms are World Within terms')
ok(![...vocab.ownTerms].some((t) => /buoy|noaa|charter/i.test(t)), 'ownTerms carry NO Big Buoy terms')
const foreignTerms = [...vocab.foreign.keys()].join(' ')
ok(/buoy|noaa|charter|fishing|anglers/i.test(foreignTerms), 'Big Buoy signature terms are flagged FOREIGN (contamination would fire)')
ok([...vocab.foreign.values()].every((b) => b === 'Big Buoy'), 'foreign terms attribute to Big Buoy')

console.log('\nbrand-less canvas is refused (Unassigned / empty is not a place to generate)')
ok(isBrandless('Unassigned'), 'Unassigned is brand-less')
ok(isBrandless(''), 'empty is brand-less')
ok(!isBrandless('World Within'), 'a real brand is not brand-less')

console.log('\nHIERARCHY — sub-brand inherits parent proof; parent terms are own, not foreign')
const wwFoundation = {
  ...emptyLibrary(),
  rtbs: [{ id: 'wf1', label: 'Free for Title I schools', detail: 'no cost to qualifying districts' } as any],
  audiences: [{ name: 'District administrators', role: 'Administrator', messageAngle: 'Equity at scale', pains: ['tight budgets'] } as any],
}
const sysTree: Record<string, any> = { ...systems, 'WW Foundation': wwFoundation }
const meta: BrandMetaMap = { 'WW Foundation': { parent: 'World Within' } }
const fScope = resolveBrandScope('WW Foundation', sysTree, meta)
const fProof = fScope.library.rtbs.map((r: any) => r.id)
ok(fProof.includes('wf1') && fProof.includes('ww1'), 'sub-brand inherits parent proof + keeps its own')
ok(!fProof.includes('bb1'), 'sub-brand does NOT inherit an unrelated brand')
ok(ancestorsOf('WW Foundation', meta).includes('World Within'), 'parent is an ancestor')
ok(fScope.sources.some((s) => s.relation === 'ancestor' && s.brand === 'World Within'), 'baseline lists the parent as an ancestor source')
const fVocab = buildCoherenceVocab('WW Foundation', 'Spring', sysTree, profiles, meta)
ok([...fVocab.ownTerms].some((t) => /curriculum/i.test(t)), 'inherited parent proof is treated as OWN vocabulary')
ok(![...fVocab.foreign.keys()].some((t) => /curriculum|school/i.test(t)), 'parent terms are NOT flagged foreign in the child')
ok([...fVocab.foreign.keys()].some((t) => /fishing|anglers|forecasts|marine/i.test(t)), 'unrelated brand is still foreign in the child')

console.log('\nVoice override — child wins, falls back up the tree when unset')
const voiceOf = (b: string) => profiles[b]?.voice
ok(resolveBrandVoice('WW Foundation', voiceOf, meta) === 'Warm, grounded', 'child with no voice inherits parent voice')
profiles['WW Foundation'] = { voice: 'Formal, civic' }
ok(resolveBrandVoice('WW Foundation', voiceOf, meta) === 'Formal, civic', 'child voice overrides parent locally')

console.log('\nEXPLICIT SHARING — assets cross only via an opt-in attachment')
const shareMeta: BrandMetaMap = { 'World Within': { shares: ['Big Buoy'] } }
const shared = resolveBrandScope('World Within', systems, shareMeta)
ok(shared.library.rtbs.some((r: any) => r.id === 'bb1'), 'an EXPLICIT share pulls the other brand in')
ok(scopeBrands('World Within', shareMeta).some((s) => s.relation === 'shared' && s.brand === 'Big Buoy'), 'the share is a visible, named source')
ok(!resolveBrandScope('World Within', systems, {}).library.rtbs.some((r: any) => r.id === 'bb1'), 'without the share, nothing crosses (default isolation)')

console.log('\nMERGE PRECEDENCE — nearer brand wins on id collision; cycles are safe')
const collide: Record<string, any> = {
  Child: { ...emptyLibrary(), rtbs: [{ id: 'x', label: 'CHILD version' } as any] },
  Parent: { ...emptyLibrary(), rtbs: [{ id: 'x', label: 'PARENT version' } as any] },
}
const cMeta: BrandMetaMap = { Child: { parent: 'Parent' } }
const merged = resolveBrandScope('Child', collide, cMeta)
ok(merged.library.rtbs.filter((r: any) => r.id === 'x').length === 1, 'collision deduped to one')
ok(merged.library.rtbs.find((r: any) => r.id === 'x')?.label === 'CHILD version', 'the child (self) wins the collision')
const cycle: BrandMetaMap = { A: { parent: 'B' }, B: { parent: 'A' } }
ok(ancestorsOf('A', cycle).length <= 1, 'a parent cycle terminates (no infinite loop)')

console.log('\ndraft brand + baseline report')
ok(isDraftBrand('Sketch', { Sketch: { draft: true } }), 'draft flag read')
const bl = brandBaseline(wwScope, 'Warm, grounded', {})
ok(bl.brand === 'World Within' && bl.proofCount === 1 && bl.voice === 'Warm, grounded', 'baseline reports brand/voice/proof count')

console.log('\n' + (fails ? `FAILED (${fails})` : 'ALL PASSED — brand boundary holds; contamination cannot cross'))
process.exit(fails ? 1 : 0)
