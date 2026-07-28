import type { ContentBatch, ContentProvider } from './types'

/**
 * Last-known content backfill per brand, pulled from the connected channels
 * (Summer / Forward + the platform APIs). Stands in until a proxy is deployed
 * (see httpContentProvider), so "Ingest everything to date" works end to end and
 * survives a localStorage reset. These are the real World Within posts: the top
 * YouTube videos (exact video ids → watch URLs) and the LinkedIn company posts
 * (real commentary + impressions). Each item is loosely shaped on purpose —
 * normalizeImportItem maps caption/title/url/date/metrics to row fields.
 *
 * YouTube carries exact watch URLs (video_id is stable), so those dedup by URL and
 * re-ingesting refreshes their metrics in place. LinkedIn's post ids exceed JS's
 * safe-integer range (they'd round to a wrong activity), so those items ship without
 * a URL and dedup by their (distinct) copy instead — no broken links.
 */

const YT = (video_id: string, title: string, views: number, likes: number, subscribers: number, date: string) => ({
  platform: 'youtube',
  title,
  url: `https://www.youtube.com/watch?v=${video_id}`,
  date,
  metrics: { views, likes, subscribers },
})

const LI = (copy: string, impressions: number, engagement: number, date: string) => ({
  platform: 'linkedin',
  copy,
  date,
  metrics: { impressions, engagement },
})

// Sent email campaigns, read from Neon's Sent Emails list (no email API, so this is
// the last-known pull). Real World Within sends to the All Emails audience.
const EM = (title: string, opens: number, clicks: number, date: string) => ({
  platform: 'email',
  title,
  copy: 'Sent to All Emails',
  date,
  metrics: { opens, clicks },
})

const BATCHES: Record<string, ContentBatch[]> = {
  'World Within': [
    {
      source: 'social-live',
      sourceLabel: 'YouTube',
      items: [
        YT('C1SZgQ0fWY8', "How You Influence 100s of People You'll Never Meet", 36425, 37, 2, '2026-06-05'),
        YT('T_4JA0qj8aE', 'Do Rich People Wear Jackets?', 32349, 405, 0, '2026-06-05'),
        YT('VT45S4We4L0', 'How Moral Ambition Transforms Ordinary People Into Heroes', 24689, 58, 9, '2026-06-05'),
        YT('2QUwF0WEZA0', 'Talented People Are Wasting Their Lives', 24659, 17, 4, '2026-06-04'),
        YT('xMEwHfcAtBQ', "Proof You're On The Right Path", 24584, 175, 1, '2026-06-15'),
        YT('fgLv--sE8Ms', 'Take Your Work Seriously', 24140, 90, 0, '2026-06-15'),
        YT('1mo0wDowk4g', 'How To Find A Better Bank', 22800, 132, 0, '2026-06-01'),
        YT('5mpWY52LzZA', 'Building Your Audience', 22595, 76, 0, '2026-06-04'),
      ],
    },
    {
      source: 'social-live',
      sourceLabel: 'LinkedIn',
      items: [
        LI('Most "third places" that people rely on for socializing, work, or simply getting out of the house are unfortunately chain locations. ReVillage is changing that.', 393, 13, '2026-05-27'),
        LI('This is the future.', 153, 1, '2026-05-15'),
        LI('An important example of why the shift towards locally and community owned is about more than the economic benefits.', 126, 3, '2026-05-11'),
        LI('Thrilled to see momentum building around this. In the United States as well we need to get serious about how to enable thriving local and regional economies through policy and financing.', 171, 13, '2026-05-08'),
        LI('Most people don’t know this but over $2 trillion sits in private foundations and DAFs invested in Wall Street. These are dollars that have been donated and for which people have received a tax deduction.', 259, 14, '2026-05-01'),
        LI("If you were as blown away as we were by Alex Honnold's climb of the Taipei 101 skyscraper, you may also be blown away by the work of the Honnold Foundation.", 148, 6, '2026-01-28'),
        LI('Join us on January 12th at the Delancey in San Francisco for a screening and panel discussion of the Old Salt Co-op episode from our upcoming series How To Change The World.', 102, 8, '2026-01-06'),
      ],
    },
    {
      source: 'social-live',
      sourceLabel: 'Neon email',
      items: [
        EM('Newsletter 3', 2344, 126, '2026-07-02'),
        EM('HTCTW Ep 19 - Kristen Sonday', 2341, 144, '2026-06-25'),
        EM('HTCTW Ep 18 - Matt Jorgenson', 2663, 141, '2026-06-12'),
        EM('Newsletter 2', 3074, 142, '2026-06-04'),
        EM('HTCTW Ep 17 - Rutger Bregman', 3338, 267, '2026-05-28'),
        EM('Newsletter 1', 3335, 243, '2026-05-21'),
        EM('Resend to Non-Openers: SOCAP Voting', 776, 117, '2026-04-24'),
        EM('SOCAP Voting', 3034, 393, '2026-04-22'),
      ],
    },
  ],
}

export const mockContentProvider: ContentProvider = {
  source: 'Summer · Forward API',
  async fetch(brand) {
    // Simulate the round trip so the UI's loading state is honest.
    await new Promise((r) => setTimeout(r, 600))
    return BATCHES[brand.trim()] ?? null
  },
}
