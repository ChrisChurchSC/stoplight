/**
 * Regression: saved-view / asset-query filter resolution (the pure layer). CRUD + live
 * resolution is verified end-to-end through the bridge.
 *
 * Run:  npx tsx ./scripts/regression-savedviews.mts
 */
import { assetMatchesFilter, assetDate, groupKeyFor, newSavedView, resolveWindow } from '../src/domain/savedViews'

let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('  ✗ ' + m) } else console.log('  ✓ ' + m) }
const day = 86400000
const iso = (ms: number) => new Date(ms).toISOString()
const now = Date.now()

const row = (p: any) =>
  ({ id: p.id ?? 'r', campaign: p.campaign ?? 'C', channel: p.channel ?? 'instagram', assetType: p.assetType ?? 'post', funnelStage: p.funnelStage, audience: p.audience ?? '', status: p.status ?? 'posted', source: p.source, publishedAt: p.publishedAt, scheduledAt: p.scheduledAt ?? iso(now), archivedAt: p.archivedAt, messaging: p.messaging ?? {} }) as any

console.log('source filter')
ok(assetMatchesFilter(row({ source: 'social-live' }), { source: ['social-live'] }), 'social-live matches source:[social-live]')
ok(!assetMatchesFilter(row({ source: 'generated' }), { source: ['social-live'] }), 'generated excluded by source:[social-live]')
ok(assetMatchesFilter(row({ source: undefined }), { source: ['generated'] }), 'undefined source counts as generated')
ok(assetMatchesFilter(row({ source: 'social-live' }), {}), 'no source clause = matches')

console.log('\ndate window (publishedAfter / publishedBefore)')
const recent = row({ publishedAt: iso(now - 10 * day) })
const old = row({ publishedAt: iso(now - 90 * day) })
const after60 = { publishedAfter: iso(now - 60 * day) }
ok(assetMatchesFilter(recent, after60), 'a 10-day-old post is within the last 60 days')
ok(!assetMatchesFilter(old, after60), 'a 90-day-old post is outside the last 60 days')
ok(assetMatchesFilter(old, { publishedBefore: iso(now - 60 * day) }), 'publishedBefore keeps the older post')
ok(assetDate(row({ publishedAt: iso(now - 10 * day) })) === Date.parse(iso(now - 10 * day)), 'assetDate uses publishedAt')
ok(assetDate(row({ scheduledAt: iso(now - 5 * day) })) === Date.parse(iso(now - 5 * day)), 'assetDate falls back to scheduledAt')

console.log('\nchannel / stage / status / audience / archived')
ok(assetMatchesFilter(row({ channel: 'linkedin' }), { channel: ['linkedin', 'instagram'] }), 'channel in set matches')
ok(!assetMatchesFilter(row({ channel: 'email' }), { channel: ['linkedin'] }), 'channel out of set excluded')
ok(assetMatchesFilter(row({ funnelStage: 'conversion' }), { stage: ['conversion'] }), 'stage matches')
ok(assetMatchesFilter(row({ status: 'approved' }), { status: ['approved'] }), 'status matches')
ok(assetMatchesFilter(row({ audience: 'Founders' }), { audience: ['Founders'] }), 'audience matches')
ok(!assetMatchesFilter(row({ archivedAt: now }), {}), 'archived excluded by default')
ok(assetMatchesFilter(row({ archivedAt: now }), { includeArchived: true }), 'archived included when asked')

console.log('\nAND across clauses')
const post = row({ source: 'social-live', channel: 'instagram', publishedAt: iso(now - 10 * day) })
ok(assetMatchesFilter(post, { source: ['social-live'], channel: ['instagram'], publishedAfter: iso(now - 60 * day) }), 'matches when ALL clauses pass')
ok(!assetMatchesFilter(post, { source: ['social-live'], channel: ['linkedin'] }), 'fails if any clause fails')

console.log('\ngroupBy keys')
ok(groupKeyFor(row({ channel: 'linkedin' }), 'channel') === 'linkedin', 'group by channel')
ok(groupKeyFor(row({ audience: '' }), 'audience') === 'Unsegmented', 'empty audience groups as Unsegmented')
const ka = groupKeyFor(row({ publishedAt: '2026-05-15T00:00:00Z' }), 'date')
ok(/^\d{4}-\d{2}$/.test(ka), `date group is YYYY-MM (${ka})`)

console.log('\nrelative window stays relative (the smart-canvas fix)')
// A view stores withinDays, not a frozen date. The cutoff recomputes per resolve.
const w30 = { source: ['social-live'], withinDays: 30 }
const r1 = resolveWindow(w30, now)
const r2 = resolveWindow(w30, now + 5 * day)
ok(!!r1.publishedAfter && !!r2.publishedAfter, 'withinDays resolves to a publishedAfter')
ok(r1.publishedAfter !== r2.publishedAfter, 'the cutoff slides forward as time passes (stays relative)')
ok(Math.abs(Date.parse(r1.publishedAfter!) - (now - 30 * day)) < 1000, 'withinDays:30 → cutoff ≈ now-30d')
// last week vs last 30: a 10-day-old post is in 30 but not in 7.
const tenOld = row({ publishedAt: iso(now - 10 * day) })
ok(assetMatchesFilter(tenOld, resolveWindow({ withinDays: 30 }, now)), '10-day-old post is within last 30')
ok(!assetMatchesFilter(tenOld, resolveWindow({ withinDays: 7 }, now)), '10-day-old post is NOT within last week')
ok(assetMatchesFilter(row({ publishedAt: iso(now - 80 * day) }), resolveWindow({ withinDays: 90 }, now)), '80-day-old post is within last quarter')
ok(resolveWindow({ source: ['social-live'] }, now).publishedAfter === undefined, 'no window = no cutoff added')

console.log('\nnewSavedView defaults')
const v = newSavedView('Super Conscious', 'Last 60 Days', { filter: { source: ['social-live'] } })
ok(v.layout === 'board' && v.groupBy === 'none' && v.sort === 'newest' && v.brand === 'Super Conscious', 'defaults: board / none / newest')

console.log('\n' + (fails ? `FAILED (${fails})` : 'ALL PASSED — asset filter resolves; views configure correctly'))
process.exit(fails ? 1 : 0)
