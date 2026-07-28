/**
 * Regression: ABM target accounts — per-account personalization context + the
 * compliance break types (unsubstantiated financial claims, implied endorsements).
 *
 * Run:  npx tsx ./scripts/regression-abm.mts
 */
import { accountContext, newAccount } from '../src/domain/accounts'
import { buildCoherenceVocab, detectStructuralBreaks } from '../src/domain/coherenceChecks'

let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('  ✗ ' + m) } else console.log('  ✓ ' + m) }

console.log('Per-account context — a BlackRock variant and a Robinhood variant differ on substance')
const blackrock = newAccount('Arbitrum', {
  name: 'BlackRock', segment: 'Asset management', tier: '1:1',
  notes: 'Building tokenized funds; wants institutional-grade settlement. Recent BUIDL launch.',
  committee: [{ role: 'Head of Digital Assets', concern: 'settlement finality' }, { role: 'Compliance', concern: 'regulatory exposure' }],
})
const robinhood = newAccount('Arbitrum', {
  name: 'Robinhood', segment: 'Retail brokerage', tier: '1:1',
  notes: 'Expanding crypto trading to retail; needs low fees at scale.',
  committee: [{ role: 'VP Crypto', concern: 'cost per trade' }],
})
const cbr = accountContext(blackrock)
const crh = accountContext(robinhood)
ok(cbr.account === 'BlackRock' && crh.account === 'Robinhood', 'each context names its account')
ok(cbr.segment === 'Asset management' && crh.segment === 'Retail brokerage', 'segment differs per account')
ok(cbr.situation !== crh.situation && !!cbr.situation, 'the account situation differs (material divergence, not a name swap)')
ok(cbr.concern === 'settlement finality' && crh.concern === 'cost per trade', 'the lead committee concern differs per account')

// --- Compliance detectors --------------------------------------------------------
const systems: Record<string, any> = { Arbitrum: { ctas: [], rtbs: [], audiences: [], strategies: [], subjects: [], hooks: [] } }
const profiles: Record<string, any> = { Arbitrum: { oneLiner: 'Ethereum L2 for institutions', industry: 'Blockchain', notableClients: ['Robinhood'] } }
// Robinhood is a real (public) partner; BlackRock and Fidelity are prospects.
const vocab = buildCoherenceVocab('Arbitrum', 'Institutional push', systems, profiles, {}, {
  targetAccounts: ['BlackRock', 'Fidelity', 'Robinhood'],
  partners: ['Robinhood'],
})

const row = (id: string, messaging: Record<string, string>, rtbMap?: Record<string, string[]>) =>
  ({ id, assetName: id, campaign: 'Institutional push', channel: 'LinkedIn post', assetType: 'Post', messaging, rtbMap, status: 'draft' }) as any

console.log('\nUnsubstantiated financial claim — flagged only when no proof is attached')
const claimRow = row('claim-1', { headline: 'We secured $4 billion in institutional volume', primary: 'Move assets onchain.' })
let breaks = detectStructuralBreaks([claimRow], vocab)
ok(breaks.some((b) => b.axis === 'claim'), 'a bare "$4 billion" claim with no proof is flagged')

const sourcedRow = row('claim-2', { headline: 'We secured $4 billion in institutional volume' }, { headline: ['rtb-tvl'] })
breaks = detectStructuralBreaks([sourcedRow], vocab)
ok(!breaks.some((b) => b.axis === 'claim'), 'the same claim WITH a proof point attached is NOT flagged')

const returnsRow = row('claim-3', { headline: 'Guaranteed returns, risk-free yield for your treasury' })
ok(detectStructuralBreaks([returnsRow], vocab).some((b) => b.axis === 'claim'), '"guaranteed returns / risk-free" is flagged')

console.log('\nImplied endorsement — a target account named as a partner (but a real partner is fine)')
const endorseRow = row('end-1', { headline: 'Trusted by BlackRock', primary: 'Join the institutions building on Arbitrum.' })
const eb = detectStructuralBreaks([endorseRow], vocab)
ok(eb.some((b) => b.axis === 'endorsement'), 'naming target account BlackRock as "Trusted by" is flagged as an implied endorsement')

const partnerRow = row('end-2', { headline: 'Trusted by Robinhood', primary: 'See the public case study.' })
ok(!detectStructuralBreaks([partnerRow], vocab).some((b) => b.axis === 'endorsement'), 'naming the real partner Robinhood is NOT flagged')

const mentionRow = row('end-3', { headline: 'Built for firms like BlackRock and Fidelity', primary: 'Institutional-grade settlement.' })
ok(!detectStructuralBreaks([mentionRow], vocab).some((b) => b.axis === 'endorsement'), 'merely naming prospects (no endorsement language) is NOT flagged')

console.log('\nClean institutional asset — no compliance breaks')
const cleanRow = row('clean-1', { headline: 'Institutional-grade settlement on Ethereum', primary: 'Bring tokenized assets onchain with finality your compliance team can sign off on.' }, { headline: ['rtb-1'] })
const cleanBreaks = detectStructuralBreaks([cleanRow], vocab)
ok(!cleanBreaks.some((b) => b.axis === 'claim' || b.axis === 'endorsement'), 'a clean, sourced institutional asset has zero compliance breaks')

console.log('\n' + (fails ? `FAILED (${fails})` : 'ALL PASSED — ABM context diverges; compliance breaks fire precisely'))
process.exit(fails ? 1 : 0)
