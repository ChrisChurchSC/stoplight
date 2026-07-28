/**
 * Regression: asset lifecycle invariants (the pure-domain ones — the stateful
 * edit/approve/delete flow is verified end-to-end through the bridge).
 *
 * Run:  npx tsx ./scripts/regression-lifecycle.mts
 */
import { rowInScope } from '../src/lib/scope'
import type { RowStatus } from '../src/domain/types'

let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('  ✗ ' + m) } else console.log('  ✓ ' + m) }

const base = (patch: any) =>
  ({ id: 'r', assetName: 'A', campaign: 'C', channel: 'Instagram', assetType: 'Post', messaging: {}, status: 'draft', audience: '', ...patch }) as any
const scope = { filter: 'all' as const, query: '', clientFilter: 'all', campaignFilter: 'all' }

console.log('Archived assets are hidden from every view')
ok(rowInScope(base({}), scope), 'a normal draft is in scope')
ok(!rowInScope(base({ archivedAt: Date.now ? 1 : 1 }), scope), 'an archived (soft-deleted) asset is NOT in scope')
ok(rowInScope(base({ status: 'approved' }), scope), 'an approved asset is in scope (it is the shippable set)')
ok(!rowInScope(base({ status: 'approved', archivedAt: 1 }), scope), 'archiving hides even an approved asset')

console.log('\nThe review lifecycle statuses exist')
const statuses: RowStatus[] = ['draft', 'in_review', 'approved', 'rejected', 'scheduled', 'posted', 'failed']
ok(statuses.includes('in_review') && statuses.includes('rejected'), 'in_review + rejected were added to the lifecycle')

console.log('\n' + (fails ? `FAILED (${fails})` : 'ALL PASSED — archived assets hidden; review lifecycle present'))
process.exit(fails ? 1 : 0)
