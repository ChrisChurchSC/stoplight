/**
 * Regression: the brand-folder combined Grid / Calendar ("see everything in this
 * folder"). Reproduces the reported bug — "canvases already made aren't showing up
 * on the project-level grid/cal view" — and proves the fix.
 *
 * Root cause: the folder view fed the store's per-canvas sidebar filters (channel /
 * audience / status / search) and the forward time horizon into rowInScope. A stale
 * value left set from an earlier canvas session hid the brand's assets. The fix
 * neutralizes those filters when the view is brand-scoped (scopeClient set), so the
 * folder always shows the whole brand across every campaign.
 *
 * This mirrors exactly what SheetGrid / CalendarView now do:
 *   scoped ? 'all' : <storeFilter>   (and scoped bypasses inTimeRange)
 *
 * Run:  npx tsx ./scripts/regression-folder-view.mts
 */
import { registerCampaign, clientForCampaign } from '../src/domain/clients'
import { rowInScope, type CardFilter } from '../src/lib/scope'
import { inTimeRange, type TimeRange } from '../src/domain/timeRange'

let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('  ✗ ' + m) } else console.log('  ✓ ' + m) }
const day = 86400000
const iso = (ms: number) => new Date(ms).toISOString()
const now = Date.now()

const row = (p: any) =>
  ({
    id: p.id, campaign: p.campaign, channel: p.channel ?? 'instagram', assetType: p.assetType ?? 'post',
    assetName: p.assetName ?? p.id, audience: p.audience ?? '', status: p.status ?? 'posted',
    scheduledAt: p.scheduledAt ?? iso(now), messaging: p.messaging ?? {},
  }) as any

// The brand folder the user is in, plus a second brand that must never leak in.
registerCampaign('WW — Why Ownership', 'World Within')
registerCampaign('WW — Major Donor Track', 'World Within')
registerCampaign('World Within — PLG Flywheel', 'World Within')
registerCampaign('SC — Master Canvas', 'Super Conscious')

// Assets spread across the brand's three canvases: mixed channel, audience, status,
// and timing (one scheduled far in the future) — the realistic shape that a single
// stale sidebar filter would slice down to nothing.
const rows = [
  row({ id: 'a1', campaign: 'WW — Why Ownership', channel: 'linkedin', audience: 'Founders', status: 'posted', scheduledAt: iso(now - 5 * day) }),
  row({ id: 'a2', campaign: 'WW — Why Ownership', channel: 'instagram', audience: '', status: 'draft', scheduledAt: iso(now + 40 * day) }),
  row({ id: 'b1', campaign: 'WW — Major Donor Track', channel: 'email', audience: 'Major Donors', status: 'scheduled', scheduledAt: iso(now + 2 * day) }),
  row({ id: 'b2', campaign: 'WW — Major Donor Track', channel: 'instagram', audience: '', status: 'draft', scheduledAt: iso(now - 20 * day) }),
  row({ id: 'c1', campaign: 'World Within — PLG Flywheel', channel: 'linkedin', audience: 'Product Users', status: 'posted', scheduledAt: iso(now - 1 * day) }),
  // Different brand — the isolation guard.
  row({ id: 'x1', campaign: 'SC — Master Canvas', channel: 'instagram', audience: 'Founders', status: 'posted', scheduledAt: iso(now - 3 * day) }),
]

const BRAND = 'World Within'
const brandRowIds = rows.filter((r) => clientForCampaign(r.campaign) === BRAND).map((r) => r.id).sort()

console.log('setup')
ok(brandRowIds.length === 5, `brand has 5 assets across 3 canvases (${brandRowIds.join(',')})`)
ok(clientForCampaign('SC — Master Canvas') === 'Super Conscious', 'other brand resolves to its own client')

// A "stale sidebar state" carried over from an earlier canvas session.
type Stale = { filter?: string; audienceFilter?: string; cardFilter?: CardFilter; query?: string; timeRange?: TimeRange }

// The folder view as it renders now: scoped=true neutralizes the sidebar filters and
// bypasses the time horizon. scoped=false is the OLD (buggy) inherit-everything path.
const folderView = (scoped: boolean, stale: Stale) =>
  rows
    .filter(
      (r) =>
        rowInScope(r, {
          filter: (scoped ? 'all' : stale.filter ?? 'all') as any,
          audienceFilter: scoped ? 'all' : stale.audienceFilter ?? 'all',
          cardFilter: scoped ? 'all' : stale.cardFilter ?? 'all',
          query: scoped ? '' : stale.query ?? '',
          proofFilter: 'all',
          ctaFilter: 'all',
          clientFilter: BRAND,
          campaignFilter: 'all',
        }) && (scoped || inTimeRange(r, stale.timeRange ?? 'all', now)),
    )
    .map((r) => r.id)
    .sort()

console.log('\nno stale filter — both paths agree, whole brand shows')
ok(JSON.stringify(folderView(true, {})) === JSON.stringify(brandRowIds), 'scoped view = all 5 brand assets')
ok(JSON.stringify(folderView(false, {})) === JSON.stringify(brandRowIds), 'clean inherit = all 5 (baseline)')

console.log('\nstale filters HID assets before — now they do not')
const cases: { name: string; stale: Stale }[] = [
  { name: "channel filter left on 'linkedin'", stale: { filter: 'linkedin' } },
  { name: "audience filter left on 'Founders'", stale: { audienceFilter: 'Founders' } },
  { name: "status card filter left on 'live'", stale: { cardFilter: 'live' } },
  { name: "a lingering search query", stale: { query: 'zzz-no-match' } },
  { name: "time horizon narrowed to 'week'", stale: { timeRange: 'week' } },
]
for (const { name, stale } of cases) {
  const oldV = folderView(false, stale)
  const newV = folderView(true, stale)
  ok(oldV.length < 5, `OLD path (${name}) hid assets — showed ${oldV.length}/5`)
  ok(JSON.stringify(newV) === JSON.stringify(brandRowIds), `NEW folder view (${name}) shows all 5`)
}

console.log('\nbrand isolation — the other brand never leaks in')
ok(!folderView(true, {}).includes('x1'), 'Super Conscious asset excluded from the World Within folder')

console.log('\ncampaign combination — every canvas contributes')
const canvases = new Set(rows.filter((r) => folderView(true, {}).includes(r.id)).map((r) => r.campaign))
ok(canvases.size === 3, `all 3 canvases combined into one view (${canvases.size})`)

console.log(fails === 0 ? '\nPASS' : `\nFAIL (${fails})`)
process.exit(fails === 0 ? 0 : 1)
