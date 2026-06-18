import type { DriveFile, DriveSource } from './types'

/**
 * A seeded "Demo Drive" that mimics a real, partly-messy agency Drive: most
 * creative lives in channel folders (so it auto-organizes), but a Downloads
 * folder holds generically-named files (so they land in "needs a look"). This
 * lets the whole Picker + confirm-board flow be demoed with no Google account.
 */
const FILES: DriveFile[] = [
  // Well-organized: channel folders → auto-organized
  { id: 'd1', name: 'spring_carousel_01.jpg', mimeType: 'image/jpeg', folderPath: 'Acme Co/Q2 Launch/Meta Ads', size: 412_000, width: 1080, height: 1080 },
  { id: 'd2', name: 'spring_carousel_02.jpg', mimeType: 'image/jpeg', folderPath: 'Acme Co/Q2 Launch/Meta Ads', size: 408_000, width: 1080, height: 1080 },
  { id: 'd3', name: 'spring_hero_9x16.mp4', mimeType: 'video/mp4', folderPath: 'Acme Co/Q2 Launch/Meta Ads', size: 8_900_000, width: 1080, height: 1920, durationSec: 22 },
  { id: 'd4', name: 'li_thought_leader.png', mimeType: 'image/png', folderPath: 'Acme Co/Q2 Launch/LinkedIn', size: 320_000, width: 1200, height: 627 },
  { id: 'd5', name: 'ops_playbook.pdf', mimeType: 'application/pdf', folderPath: 'Acme Co/Q2 Launch/LinkedIn', size: 2_100_000 },
  { id: 'd6', name: 'demo_walkthrough.mp4', mimeType: 'video/mp4', folderPath: 'Acme Co/Q2 Launch/YouTube', size: 64_000_000, width: 1920, height: 1080, durationSec: 240 },
  { id: 'd7', name: 'tt_spark_hook.mp4', mimeType: 'video/mp4', folderPath: 'Acme Co/Q2 Launch/TikTok', size: 7_400_000, width: 1080, height: 1920, durationSec: 18 },
  { id: 'd8', name: 'april_newsletter.html', mimeType: 'text/html', folderPath: 'Acme Co/Q2 Launch/Email', size: 24_000 },
  { id: 'd9', name: 'pfas-removal-ebook.pdf', mimeType: 'application/pdf', folderPath: 'Acme Co/Lead Magnets', size: 3_300_000 },
  // Messy: a dump folder, generic names → no channel signal → needs a look
  { id: 'd10', name: 'IMG_4821.jpg', mimeType: 'image/jpeg', folderPath: 'Acme Co/Downloads', size: 510_000, width: 1080, height: 1350 },
  { id: 'd11', name: 'Final_v3.mp4', mimeType: 'video/mp4', folderPath: 'Acme Co/Downloads', size: 12_000_000, width: 1920, height: 1080, durationSec: 45 },
]

export const mockDriveSource: DriveSource = {
  label: 'Demo Drive',
  isDemo: true,
  async list() {
    return FILES
  },
}
