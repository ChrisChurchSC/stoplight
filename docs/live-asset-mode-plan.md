# Planner and Active: a mode switch on the asset inspector

_Breadcrumbs. Drafted 2026-08-09. Covering the switch, going live, ingesting the copy, and storing the performance._

## What this is for

An asset card is a plan until the post goes out, and then it is a fact. Today the tool only holds the plan well. The moment something is published the card stops being the truth about it: the copy on the card is what we intended to write, the numbers are nowhere, and the real post lives at a URL nobody recorded. So the campaign that was carefully composed on the canvas and the campaign that actually ran are two different bodies of work, and only one of them is in here.

This is the seam between them. One switch at the top of the asset inspector, two faces of the same card: **Planner**, which is what it is now, and **Active**, which is the same asset once it exists in the world — its link, the words it actually went out with, and what it did.

The point is not to replace the plan. It is to keep both, side by side, on one card. A plan you can no longer see is a plan you cannot learn from.

## What already exists

Most of this is already modelled. The work is smaller than it looks, and the plan below leans on all of it rather than inventing a second version of any of it.

**On the row** (`src/domain/types.ts`):

| Field | Line | What it already holds |
|---|---|---|
| `source` | 261 | `'generated' \| 'authored' \| 'imported' \| 'social-live' \| 'site'` |
| `sourceUrl` | 264 | "The external URL this asset was imported from (the post / page). Also the dedup key on re-import" |
| `publishedAt` | 266 | When the real content was published externally |
| `mediaRefs` | 268 | Image / video / carousel urls for an imported post |
| `socialMetrics` | 231 | Open-ended platform metrics for an imported live post |
| `metricsUpdatedAt` | 233 | Freshness stamp, because platform metrics lag ~24h |
| `engagement`, `spend` | 226-228 | Likes / comments, and actual spend pulled back |
| `reconciledAt` | 237 | "When a planned card was reconciled to its real published post: the point its projection was replaced by measured metrics inherited via sourceUrl/copy" |

`reconciledAt` is this feature, written down a while ago and never wired up.

**In the domain:**

- `isPlannedCard` (`src/domain/contentSignals.ts:734`) and `reconciliationStat` below it. The planned/live split already exists and is already reported on: how many planned cards have been reconciled to a real post.
- `isLibraryItem` (`src/components/PrioritiesView.tsx:26`) is the same question asked a second time, in different words. Both go through one predicate as part of this work.
- `importAssets.ts` — the pure normalize of "whatever a source handed us" into row fields, plus `platformToChannel`.
- `metricSnapshot.ts` — an append-only time series that already supports `scope: 'asset'` with `scopeId` as the asset id, campaign and audience denormalized onto it. This is where performance history goes. It needs no schema change.

**On the server:**

- `ingestChannelHandler.ts` — per-channel ingest, including a vision pass that lifts copy baked into the creative and returns it verbatim as `extractedCopy`. The words on an image are already readable by this codebase.
- `instagram.ts`, `linkedin.ts`, `youtube.ts` — per-platform readers, account-level, token-gated.
- `siteCrawler.ts` / `scanSiteHandler.ts` — for web surfaces.

**Seams to follow:**

- `actualsProvider` (`src/adapters/actuals/index.ts:7`) — mock by default, HTTP when `VITE_ACTUALS_URL` is set. Per-post metrics get the same shape.
- `metricSnapshots.ts` — Supabase when configured, a capped localStorage ring otherwise.

## The constraint, stated first

**A pasted URL does not give you metrics.** `docs/social-oauth.md` says it plainly: there is no free, no-login way to read someone else's Instagram or LinkedIn, and the legitimate path is the client connecting their own account. Insights for a post are only ever available to the account that owns it.

So the two halves of "ingest from the link" are not equally available:

| From a pasted URL | Copy | Media | Metrics |
|---|---|---|---|
| YouTube | Yes, today (`YOUTUBE_API_KEY`, no OAuth) | Yes | Public counts only; full analytics needs the channel connected |
| Website / blog / landing page | Yes, today (`siteCrawler`) | Yes | No — that is GA4's job, not the page's |
| Instagram | Only via the connected account | Same | Only via the connected account |
| LinkedIn | Only via the connected account | Same | Only via the connected account |

This is why the build order below puts the switch, the link and the manual paths first. **Phase one is useful with no platform work at all**, and nothing in it is thrown away when the connections land.

Do not ship a panel that implies it will fetch numbers it cannot fetch. A field that stays empty forever is worse than a field that asks you to fill it.

## Principles

- **The mode is a view, going live is an act.** The switch changes which face of the card you are looking at. It does not invent a state. What makes an asset active is that it has a link to a real post; the panel opens on whichever face the asset actually is.
- **No second source of truth.** There is no `mode` field on the row. A stored mode can disagree with `sourceUrl` and `status`, and then two surfaces answer the same question differently — the exact fault this codebase has spent months removing (see the Made from column, the campaign brand, the card name). Mode is derived, every time, from one predicate.
- **The plan is never overwritten.** Ingesting the live copy must not replace `messaging`. The plan and the actual are the two things being compared; destroying one to store the other throws away the reason for doing this at all.
- **Everything downstream keeps reading `messaging`.** Generation, exports, the grid, coherence, content signals — all of them read the planned copy today. The live copy arrives beside it, not through it, so nothing downstream changes on day one.
- **Say what is measured and when.** Platform metrics lag by up to a day, which is why `metricsUpdatedAt` exists. Every number on the Active face carries its freshness. A number with no timestamp gets trusted as live and is not.
- **A refusal before a fetch, not after.** Attaching a link to a platform we cannot read says so at the moment you paste it, naming the connection that would fix it. It does not accept the link, spin, and fail.

## The switch

**Where.** `renderPostInspector` (`src/components/FlowsView.tsx:9345`), above `.flow-panel-head` — the row in the screenshot carrying the channel tile and the asset name. It is the first thing in the panel because it governs everything under it.

**What it is.** Two segmented buttons, the active one checked. Options are buttons with a check, never a dropdown — the rule from `docs/deliverable-card-plan.md` and the reason the last native selects came off this surface.

```
┌─────────────────────────────────┐
│  [ Planner ]  [ Active ]        │
│  ▣  Instagram reel          ⊐   │
└─────────────────────────────────┘
```

**What each face holds:**

| Planner | Active |
|---|---|
| Copy fields (the plan) | The link, and when it went out |
| Generate | The copy it actually ran with, against the plan |
| Ready to ship | Performance, with its freshness stamp |
| Schedule and budget | Spend against budget |
| CTAs | The media as published |

**Which one opens.** Whichever the asset is. An asset with a link opens Active; everything else opens Planner. Flipping to Active on a card with no link is how you attach one — the face asks for it, because attaching the link is the act that makes the card live.

**Flipping back is free.** Planner shows the plan again and deletes nothing. The two faces are both permanently true of a shipped asset.

## Colour

The request was red for planning, green for active. Green for active is right and unambiguous. **Red for planning is a collision worth avoiding**: red is this app's danger tone — `--danger`, a failed row, the out-of-credits state — and planning is the ordinary state of nearly every card on the board. A canvas that is mostly red reads as a canvas that is mostly broken, and the one card that genuinely has failed stops standing out.

Recommended pairing:

| State | Tone | Why |
|---|---|---|
| Planner | `--text-muted` / slate | The neutral state. It is not a warning, it is most of the work. |
| Active | `--green` | Live, measured, real. |
| Failed | `--danger` | Keeps red meaning what it already means. |

If the red is wanted anyway it is one token on one class, and this doc is not the place to be precious about it. The recommendation stands, the decision does not.

Where the tone shows: the switch itself, a thin stripe on the card face on the canvas (so a board reads planned-vs-live from across the room, which is most of the value), and the asset chip in the grid.

## Going live: the link

One field on the Active face: **paste the link to the published post.**

On paste, in order:

1. **Normalize and dedup.** `sourceUrl` is already the dedup key on re-import. If another row in this brand already carries this URL, say so and offer to open it instead of quietly creating a second record of one post.
2. **Resolve the platform** through `platformToChannel` (`importAssets.ts`). If it disagrees with the card's channel — an Instagram URL on a card whose channel is LinkedIn — ask rather than assume. One of the two is wrong and only the person knows which.
3. **Stamp the row.** `sourceUrl`, `source: 'social-live'` (or `'site'` for a web surface), `publishedAt`, `status: 'posted'`, `postedAt`, and `reconciledAt` at the moment the projection is replaced by the actual.
4. **Fetch what the platform allows** (below). Where it allows nothing, the fields are editable and the panel says why they are empty and what would fill them.

## Ingesting the messaging

The live copy lands in a **new field beside the plan**, not on top of it:

```ts
/** The asset as it actually went out, read back from the published post. Distinct from
 *  `messaging`, which stays the plan: the two are what this card exists to compare. */
live?: {
  /** Same component keys as `messaging`, so the two can be diffed field by field. */
  copy?: Record<string, string>
  /** Words baked into the creative, from the vision pass. Not in `copy` because nobody
   *  typed them into a field — they were read off the image. */
  extractedCopy?: string
  /** When the copy was last read back, distinct from metricsUpdatedAt. */
  fetchedAt?: number
}
```

Keyed the same as `messaging` so the panel can show them field by field: the headline as planned, the headline as it ran, and the difference marked. That diff is the feature. "We planned to lead with the guarantee and shipped the discount" is a sentence this tool cannot currently produce about any campaign.

`extractedCopy` reuses what `ingestChannelHandler` already returns — the copy inside the creative, which for a reel or a carousel is most of the words a person actually reads.

**Three ways in, in descending order of automation:**

1. **Connected account.** The platform reader finds the post within the account's recent media by URL or id and returns its caption and media. Instagram and LinkedIn readers are built and gated on tokens; YouTube works today.
2. **Public read.** YouTube and any web surface, now, with no OAuth.
3. **Paste it.** A text box on the Active face. Unglamorous, available for every platform on day one, and the only option that never breaks. Ships in phase one and stays forever.

## Performance

**Latest values on the row**, which is what the panel and the card read: `socialMetrics`, `engagement`, `spend`, stamped with `metricsUpdatedAt`. All four already exist.

**History in snapshots**, which is what the preview reads: `MetricSnapshot` with `scope: 'asset'`, `scopeId: row.id`, campaign and audience denormalized on. Append-only, already persisted, already supports exactly this. No schema change.

Because it is a time series and not a single number, the preview is a sparkline with an emphasized endpoint rather than a figure that appears from nowhere — the shape of the first week is the thing you actually want to see, and the store has held it all along.

**Where it comes from:** a per-post provider on the same seam as `actualsProvider` — mock first, real behind an env var, so the panel can be built and reviewed before any platform app is registered.

**When it refreshes:** on opening the Active face if the stamp is stale, and on demand. Not on a timer. The numbers lag a day; polling them faster only spends quota to display the same value.

## Data model, in full

Additions:

- `live?: { copy?, extractedCopy?, fetchedAt? }` on `TrafficRow` — the only genuinely new field.

Existing fields that start being written for the first time:

- `reconciledAt` — at the moment a planned card is attached to its post.
- `socialMetrics`, `metricsUpdatedAt`, `mediaRefs`, `publishedAt` — currently only written by the bulk content ingest.

Consolidation, as part of the work rather than after it:

- `isPlannedCard` (contentSignals) and `isLibraryItem` (PrioritiesView) become one exported predicate with one definition. The switch is a third caller and three copies of a rule is how they start to disagree.

## Build order

**Phase 1 — the switch and the link. No platform work. BUILT.**
The segmented control, the derived mode, both faces, the colour, the link field with dedup and platform check, paste-in copy, manual metrics, the plan-vs-actual diff, snapshots written from whatever is entered. Useful on its own: a campaign can be reconciled by hand and the board finally shows what ran.

Where it landed: `domain/assetMode.ts` (the one predicate and the diff), `domain/liveLink.ts` (normalize, dedup, the two questions), `attachLiveAsset` / `detachLiveAsset` / `setLiveCopy` / `setLiveMetrics` in the store, and `renderActiveFace` beside `renderPostInspector`. `isPlannedCard` and `isLibraryItem` are now one rule, as the consolidation below asks. Not yet done from this phase: the tone on the card face on the canvas and on the grid chip — the switch carries it, the board does not.

**Phase 2 — read the copy back.**
YouTube and web surfaces automatically, since both work today with no OAuth. Instagram and LinkedIn behind their existing gates.

**Phase 3 — pull the numbers.**
Per-post metrics provider, mock then real. Matching a URL to a post id within a connected account. Refresh on stale.

**Phase 4 — what it is all for.**
The diff and the numbers become a signal: which planned angle survived contact, which proof point actually carried, per audience, over time. `contentSignals.ts` already computes most of this shape against planned copy; pointing it at measured copy is the payoff and is the reason not to overwrite the plan in phase 1.

## What could go wrong

- **Two records of one post.** The bulk ingest already lands published content as its own rows in `Published content` (`CONTENT_LIBRARY_CAMPAIGN`). Attaching the same post to a planned card must reconcile with that row rather than duplicate it. `sourceUrl` is the key both paths already share; phase 1 must handle the collision or the library grows a twin of every reconciled asset.
- **A link that is not the post.** A profile URL, a shortlink, a story that expires. Normalize what can be normalized, refuse what cannot, and never silently attach something that will read as empty forever.
- **The diff reading as an error.** Copy changes between plan and post for good reasons. The diff states the difference; it does not mark it wrong.
- **Mode drifting from truth.** The reason mode is derived. If a stored flag is ever added, this is the failure it will produce.

## Open questions

1. **Which copy do exports and the writer read once an asset is live?** This plan keeps `messaging` as the plan so nothing downstream changes. The other reading — that a live asset's real copy is the truth and should be what everything reads — is defensible and is a bigger change.
2. **Does a live asset stay editable?** Editing the plan after the fact rewrites history; refusing it makes a typo permanent. Suggested: Planner stays editable and says the asset has already run.
3. **Does the mode belong on the deliverable too?** "Show me this whole channel as it ran" is the obvious next ask.
4. **Is red wanted anyway?** See Colour.
