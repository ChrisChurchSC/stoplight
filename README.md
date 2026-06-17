# Stoplight

Drag-and-drop media trafficking, as a spreadsheet. Drop a batch of marketing
assets, Stoplight proposes a per-channel schedule, you review/edit/approve inline,
and rows stage to the sheet for publishing. Nothing posts without explicit
approval.

The whole app is a single Clay-style workspace: a left sidebar of channels, a
toolbar, and a full-page editable grid that is the source of truth.

## How it works

1. **Ingest** — drag assets anywhere (or **+ Add assets**): images, video,
   markdown/text, or a link. A tray appears to assign channel(s) + copy per asset.
2. **Add to sheet** — each (asset × channel) becomes a draft row, scheduled at the
   channel's best-time default.
3. **Edit inline** — every cell is editable: channel, campaign, audience, caption,
   time, status. Columns are drag-resizable; text cells grow to fit.
4. **Approve** — bulk-approve drafts (or set status per row). Approval stages rows;
   it never auto-posts.
5. **Publish** — an explicit per-row action routed to the channel's publisher.

## Channels

24 channels grouped by **kind** (`paid` / `organic` / `owned`) and `platform`,
each with a brand logo, accepted media types, and best-time defaults
(`src/domain/channels.ts`). Paid social + Google search, the organic social set,
and owned lifecycle (email, SMS, push, blog, landing page, lead magnet).

## Architecture (v1 = mock-first, swappable seams)

Designed to **post directly** to platforms, but v1 runs on mock/stub backends so
it works with zero credentials. Two seams, wired in `useTrafficStore.ts`:

- **Sheet** — `SheetAdapter` (`src/adapters/sheet/`). `MockSheetAdapter` persists
  to `localStorage`. Swap for a Clay / Google Sheets / Airtable adapter.
- **Publishers** — `Publisher` per channel (`src/adapters/publishers/`). A
  `registry` routes owned/lifecycle channels to `HubSpotPublisher` (the CRM is the
  send/host engine) and everything else to `MockPublisher`. Swap in Buffer/Sprout
  for organic and the ad-platform clients for paid.

The UI/store don't change when real adapters land — only the registry + adapters.

### CRM hooks

Rows carry `campaign` (attribution: content → campaign → contact → pipeline) and
`audience` (CRM-synced segment for paid targeting). `HubSpotPublisher` maps a row
to the right HubSpot object (marketing email / landing page / form / SMS) with the
real API call as one injectable `transport` seam.

### Layout

```
src/
  domain/        types.ts (schema), channels.ts (24 channels), sampleData.ts
  scheduling/    propose.ts (best-time slot assignment)
  adapters/
    sheet/       SheetAdapter + MockSheetAdapter (localStorage)
    publishers/  Publisher + mock + HubSpotPublisher + registry
  store/         useTrafficStore.ts (Zustand — seam wiring)
  components/    Workbench, Sidebar, Toolbar, IngestTray, SheetGrid,
                 ChannelIcon, Thumb
  lib/           files.ts (ingest), format.ts, csv.ts (export)
```

### Sheet schema (`TrafficRow`)

`id · assetId · assetName · mediaType · channel · caption · campaign · audience ·
scheduledAt · status · mediaRef · error · createdAt · approvedAt · postedAt`

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

Stack: React 19 + Vite + TypeScript, Zustand, simple-icons. No backend in v1
(localStorage mock sheet). Click **Load sample** for a seeded board.

## Not in v1

- Real platform integrations (OAuth, media upload, rate limits) — phase 2.
- Auto-posting on approval — approval only stages; publish is explicit.
- Predictive best-time modeling — sensible per-channel defaults for now.
- Placements/formats (Reels vs Stories) and post-launch optimization — phase 2.
```

