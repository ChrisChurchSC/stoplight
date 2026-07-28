/**
 * Regression: importing real content into a canvas (the pure mapping). The stateful
 * dedup/import flow is verified end-to-end through the bridge.
 *
 * Run:  npx tsx ./scripts/regression-import.mts
 */
import {
  platformToChannel,
  defaultChannelFor,
  normalizeImportItem,
  engagementFromMetrics,
  looksLikeBlockedPage,
} from '../src/domain/importAssets'

let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.error('  ✗ ' + m) } else console.log('  ✓ ' + m) }

console.log('platform → channel')
ok(platformToChannel('Instagram') === 'instagram', 'Instagram → instagram')
ok(platformToChannel('LinkedIn') === 'linkedin', 'LinkedIn → linkedin')
ok(platformToChannel('X (Twitter)') === 'x', 'X (Twitter) → x')
ok(platformToChannel('tiktok') === 'tiktok', 'tiktok → tiktok')
ok(platformToChannel('something else') === undefined, 'unknown platform → undefined')
ok(defaultChannelFor('site') === 'website', 'site defaults to website')
ok(defaultChannelFor('social-live') === 'instagram', 'social-live defaults to a feed post')

console.log('\nBuffer post → asset (the REAL caption is preserved, not templated filler)')
const realCaption = "Most brands don't have a content problem. They have a coherence problem."
const post = normalizeImportItem(
  { caption: realCaption, url: 'https://instagram.com/p/abc', platform: 'Instagram', publishedAt: '2026-05-01T10:00:00Z', metrics: { likes: 220, comments: 14, impressions: 5400, saves: 31 }, media: ['https://cdn/img.jpg'] },
  'social-live',
)
ok(post.primaryText === realCaption, 'the caption maps verbatim to primaryText (no rewrite)')
ok(post.channel === 'instagram', 'platform Instagram → channel instagram')
ok(post.sourceUrl === 'https://instagram.com/p/abc', 'url → sourceUrl (the dedup key)')
ok(post.publishedAt === '2026-05-01T10:00:00Z', 'publishedAt carried')
ok(post.metrics?.impressions === 5400 && post.metrics?.saves === 31, 'platform metrics carried')
ok((post.mediaRefs ?? []).length === 1, 'media carried')
const eng = engagementFromMetrics(post.metrics)
ok(eng?.likes === 220 && eng?.comments === 14, 'likes/comments extracted into engagement')

console.log('\nMetrics freshness stamp (metricsUpdatedAt)')
const stamped = normalizeImportItem({ caption: 'x', url: 'u', platform: 'Instagram', metrics: { likes: 1 }, metricsUpdatedAt: '2026-05-01T10:00:00Z' }, 'social-live')
ok(stamped.metricsUpdatedAt === Date.parse('2026-05-01T10:00:00Z'), 'an ISO metricsUpdatedAt parses to ms epoch')
const numStamp = normalizeImportItem({ caption: 'x', url: 'u', platform: 'Instagram', metrics: { likes: 1 }, metricsUpdatedAt: 1700000000000 }, 'social-live')
ok(numStamp.metricsUpdatedAt === 1700000000000, 'a numeric metricsUpdatedAt is kept')
ok(normalizeImportItem({ caption: 'x', url: 'u', platform: 'Instagram' }, 'social-live').metricsUpdatedAt === undefined, 'no stamp when no metrics')

console.log('\nSite / case study → asset')
const cs = normalizeImportItem({ title: 'Google: edutainment that converts', copy: 'How we turned a launch into 2M views.', url: 'https://x.com/work/google' }, 'site')
ok(cs.channel === 'website', 'a site item with no platform → website channel')
ok(cs.headline === 'Google: edutainment that converts', 'title → headline')
ok(cs.primaryText === 'How we turned a launch into 2M views.', 'copy → primaryText')

console.log('\nPasted audit row → asset (alternate field names)')
const audit = normalizeImportItem({ headline: 'Spring teaser', body: 'A 15s cut.', channel: 'TikTok', stage: 'awareness', segment: 'Founders' }, 'imported')
ok(audit.channel === 'tiktok', 'channel name on the row is honored')
ok(audit.primaryText === 'A 15s cut.', 'body → primaryText')
ok(audit.stage === 'awareness', 'stage parsed when valid')
ok(audit.audience === 'Founders', 'segment → audience')

console.log('\nBlocked / login pages are never stored as content')
ok(looksLikeBlockedPage('Just a moment... Checking your browser'), 'a Cloudflare interstitial is flagged')
ok(looksLikeBlockedPage('Log in to see this post'), 'a login wall is flagged')
ok(!looksLikeBlockedPage(realCaption), 'a real caption is NOT flagged')
ok(!looksLikeBlockedPage('Sign in to your account to manage settings and explore the full dashboard of features we built for teams of every size who care about doing great work together every day'), 'long copy that merely mentions sign in is NOT flagged')

console.log('\n' + (fails ? `FAILED (${fails})` : 'ALL PASSED — real content maps to assets verbatim; junk pages dropped'))
process.exit(fails ? 1 : 0)
