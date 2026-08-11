# A data set can say whether a number moved: a plan

_Breadcrumbs. Drafted 2026-08-10, against the Data source card as it stands after PR #161 and the five phases of `data-source-card-plan.md`._

## What this is for

A marketer opens a Data source card holding 90 days of Search Console and the app tells them, truthfully, that the brand got 12,481 clicks and that the top ten pages are 58% of them. The first thing they want to know next is whether 12,481 is more or less than it was, and the app refuses to say, in writing, on the card: "One pull is one snapshot. Nothing here says whether this is going up or down." That refusal is correct today and it is the wrong place to stop, because "is this going up or down" is the question the table was opened to answer and the only one a marketer will act on without being taught anything first.

After this plan, a pull fetches the window you asked for and the equal window immediately before it, counts both at the source rather than by adding up rows, and says so in one clause: "12,481 clicks, up 18% on the 90 days before." That clause is a figure like any other figure. It carries both periods, it is computed by the app and quoted by the writer, it is held back by the same gates that hold back every other number here, and it is refused outright in the several cases where a change would be an artefact of the pipe rather than a fact about the brand. The whole feature is one extra number per metric and about a dozen ways to decline to produce it.

## What is already true, and three things that are not

Worth writing down before anything is built, because two items in Phase 1 exist only because of the gaps.

**True.** `datasetProvenance` decides what a table is worth and six surfaces read it. `citableFigures` decides what may leave it and one path reads that. A pulled table records `coverage` (what the rows say they span) separately from `syncedAt` (when we asked), and staleness is derived from the window the user picked rather than a hardcoded 90. A stale, edited or sketched set stops being citable, so its numbers leave the writer entirely. `readDataset` computes a headline, a concentration finding and rate outliers in plain arithmetic with no model call. The writer's SYSTEM prompt already forbids computing a number and already permits stating a rise only when "a figure you were given says exactly that", which is the sentence this whole plan is built to satisfy. 691 tests pass and `tsc -b` is clean.

**Not true, and load bearing here.**

- **The Google direct route returns no coverage at all.** `aggregatorHandler.ts:312` builds its result as `{columns, rows, truncated}` with no `coverage` key, and `ChannelGrid` (`channelPull.ts:25`) has no field to carry one. Only the Summer warehouse route runs the coverage probe (`aggregatorHandler.ts:349`). So every table pulled straight from Search Console, GA4 or YouTube reads "We asked for 90 days. What came back does not say what it covers", and its staleness falls back to the request date. A comparison cannot be built on top of that, so Phase 1 fixes it as a precondition rather than as a favour.
- **The card face never shows the reading.** `readDataset` has exactly one caller, `DatasetRead.tsx:34`, which renders in the inspector. The card itself still renders `MiniSheet` plus a name plus a provenance badge (`FlowsView.tsx:11003`). The three-line card read specified in the previous plan did not ship. This matters because a change nobody sees on the board is a change nobody acts on, and the board is where these cards are read.
- **`blankDataset` still ships `Column 1` to `Column 4`** (`brandDataset.ts:101`), which the previous plan's Phase 2 said to replace with empty headers and a placeholder. Noted for completeness. It is not in this plan's way and should not ride in on it.

## Principles

- **One word, and it is "change".** The UI says a number went up or down by a change. Trend, delta, movement, baseline, period over period, PoP, prior, benchmark and comparison do not get to be nouns in front of a user. The previous plan's last open question was whether the two-noun discipline would survive contact with a second author; this is that test, and the answer is that this feature adds exactly one noun to "data set" and "figure".
- **Both windows are counted at the source, never by adding up rows.** A sum over the top 500 rows is not a total, which is why `citableFigures` already suppresses the `sum` basis on a truncated table. A change built out of two such sums would be wrong twice. The totals for each window come back from the same warehouse or the same API that returned the rows, computed over everything, which is also what makes a change valid on a table that is itself capped.
- **A change is refused far more often than it is offered.** Every case below where the app cannot tell a real movement from an artefact of the pipe is a case where nothing is shown at all. Not a hedged sentence, not an amber warning: no change. A change that has to be explained before it can be trusted is not worth the pixel.
- **A change names both of its windows or it does not exist.** "Up 18%" alone is not a fact. "Up 18% on the 90 days before" is. The second period is as load bearing as the first, and the figure carries both into the prompt.
- **Direction lives inside the value, not beside it.** This is the one number in the system whose meaning inverts if a single word is wrong, so the word sits inside the string the writer is forbidden to alter.
- **Counts only. No change in a rate, no change in an average.** A clickthrough rate that goes from 2.0% to 2.4% is up 0.4 points and up 20%, both true, and the sentence a marketer reads should not depend on which one the app happened to pick. Ranking and position are worse. Counts have one honest answer.
- **The refusals must be visible where the promise was.** The caveat that currently reads "One pull is one snapshot" is the app's own written statement that it cannot do this. It stops being printed when a change is shown, and it is replaced by a specific sentence naming the actual reason when a change is refused.

## Phase 1: Both windows, counted at the source

**Goal.** Every aggregator pull comes back knowing what its rows cover and what the same metrics totalled over the equal window immediately before, from the same source, computed over every row rather than the fetched ones.

**Why here.** Nothing above this phase can be honest without it. The direct Google route has no coverage today, and coverage is what the completeness gate in Phase 2 reads before it will offer a change at all. Doing the two together is also cheaper than doing them in sequence, because the probe that answers "what does this cover" and the probe that answers "what did it total" are the same request with the same date dimension, run once per window.

### One probe, dimensioned by date, answering coverage and totals together  `M`

**What.** Add a probe alongside every pull that returns, per window, the true totals of the count columns and the first and last date present. For the direct routes this is one extra request per window with the date dimension and no other: Search Console with `dimensions: ['date']`, GA4 with a `date` dimension, YouTube with `dimensions=day`. Each comes back at most 365 rows, so summing those rows IS a true total (the row cap is on the dimensioned pull, not on this), and min and max of the date column is the coverage. For the warehouse it is one SQL per pull returning both windows at once with DuckDB's `FILTER`, modelled on `coverageSql` (`aggregatorHandler.ts:234`) which already does the min/max half:

```sql
SELECT min(date_day)::VARCHAR AS "from", max(date_day)::VARCHAR AS "to",
       round(sum(clicks) FILTER (WHERE date_day >= current_date - INTERVAL 90 DAY))::BIGINT AS "Clicks",
       round(sum(clicks) FILTER (WHERE date_day <  current_date - INTERVAL 90 DAY))::BIGINT AS "Clicks prior"
```

Widen `AggregatorPullResult` (`aggregator.ts:240`) and the aggregator arm of `DatasetSource` (`brandDataset.ts:32`) with one field:

```ts
/** Each window's own dates and its own totals, counted by the source over every row, not by
 *  adding up the rows we fetched. Absent is a real answer and the only honest one when the
 *  source will not say. */
change?: {
  now:   { from: string; to: string; totals: Record<string, string> }
  prior: { from: string; to: string; totals: Record<string, string> }
}
```

**The SQL above has not been run.** `aggregatorHandler.ts` opens by saying every statement in it was run against a real Summer warehouse before it was written down, which is the only reason its table names survive contact: the obvious guess for top pages is `site_report_by_page` and that table has no `page` column. The `FILTER` sketch here has not met a warehouse and is a shape, not a statement. Run it before the item is estimated, and treat a surprise in the column names or in whether the mart carries whole days at the window edge as a finding about this plan rather than a bug in the implementation.

`now.from`/`now.to` supersede the existing `coverage` field for aggregator sets going forward; keep `coverage` reading as it does for every set already stored, and have `periodOf` prefer `change.now` when present. Thread `change` through `onLand` (`FlowsView.tsx:4997` and `:5178`), `importBrandDataset` (`useTrafficStore.ts:3935`) and `refreshBrandDataset` (`:3961`). Every probe is best effort inside its own try, exactly as the coverage probe is: a probe that fails leaves `change` absent and the pull still lands its rows.

**Why.** Coverage and totals are the same question asked of the same rows, and the previous plan already established that reading a probe's answer by position is how you get `coverage {from: 'world with', to: '443'}` rendered as a date. Asking once, validating the same way, and storing both halves together means a table cannot know its totals and not know its dates, which is exactly the state that would let a change be computed against an unknown window.

**Done when.** Unit tests over replayed response shapes for all four transports: a GSC date-dimensioned response of 87 rows spanning day -93 to day -4 yields `now.from` and `now.to` at those dates and `now.totals.Clicks` equal to the sum of all 87 days. A warehouse response yields both windows from one query. A probe that 500s leaves `change` undefined and the pull still returns its rows and its columns. A probe returning columns the query did not ask for leaves `change` undefined rather than reading by position. Integration against a real Summer mart: `change.now.totals` for a 90 day pull is greater than or equal to the sum of the fetched rows' Clicks column, and strictly greater whenever `truncated` is true.

**Copy.** None. Nothing here is rendered; Phase 3 renders all of it.

**Files.** `server/aggregatorHandler.ts`, `server/channelPull.ts`, `src/domain/aggregator.ts`, `src/domain/brandDataset.ts`, `src/store/useTrafficStore.ts`, `src/components/AggregatorConnect.tsx`, `src/components/FlowsView.tsx`

### The prior window, and the three requests that is now worth  `S`

**What.** The prior window is the equal length window ending the day before the current window starts: a 90 day pull compares against days 91 to 180, a 365 day pull against the year before. Derived from `PULL_WINDOWS` (`aggregator.ts:147`) and the parsed query, never stored as its own user choice. This makes a direct-route pull three requests where it was one (rows, current probe, prior probe) and a warehouse pull two SQL statements where it was two. Say so at the call site, and leave the rate limit alone: `/api/aggregator` counts 40 requests a minute in module scope, and one user pull now spends three of them rather than one, which is fine at this volume and is the reason auto refresh stays forbidden.

**Why.** A window the user picks is a second thing to get wrong and a second thing to explain. Equal and adjacent is the only comparison that needs no explanation, and it is what every analytics product means by the default comparison, so it is what a marketer will assume the number is even if nobody tells them.

**Done when.** A `gsc-pages:30d` pull probes 1 to 30 days ago and 31 to 60 days ago and nothing else. A `gsc-pages:365d` pull probes the year and the year before it. Assert the two windows are equal in length and adjacent, and that the prior window's end is exactly one day before the current window's start, as a unit test over the window arithmetic rather than over a response.

**Copy.** None.

**Files.** `src/domain/aggregator.ts`, `server/aggregatorHandler.ts`, `server/channelPull.ts`

## Phase 2: A change is a figure, or it is refused

**Goal.** `datasetRead.ts` turns two windows of totals into at most two change figures per set, or into a specific sentence saying why there is no change to show, with every refusal enforced in code.

**Why here.** The gates are the feature. Building the render first would mean building a surface for a number that has not yet been made safe, and the failure this phase prevents (a broken connector reported to a marketer as a 40% decline in their search traffic) is the most expensive wrong thing this card can say.

### changeFigures, and the completeness gate that makes them safe  `L`

**What.** In `src/domain/datasetRead.ts`, add `'change'` to the `basis` union (`:233`) and export `changeFigures(ds, now?): CitableFigure[]`, called from inside `citableFigures` so a change is subject to every existing gate before any of its own. Refusals, each enforced in code with the reason in a comment beside it:

1. **Not citable, no change.** `changeFigures` runs after the `prov.citable` check at `:285`, so sketched, edited, typed and stale sets produce nothing, for the reasons they already produce nothing.
2. **No `source.change`, no change.** An older set, an upload, a paste, a manual sheet and any pull whose probe failed all fall here. This is the common case and it is silent.
3. **Both windows must be complete.** Each window's covered span, `to` minus `from`, must be at least `FLOORS.windowCompleteness` (0.9) of the window length. This is the gate that matters most. A brand that connected GA4 sixty days ago has no prior 90 day window, and a warehouse whose connector broke forty days ago has a current window that only reaches day 40, which reports a collapse that is a broken pipe. Both are caught here, and both are caught by the same check.
4. **The windows must be adjacent and equal**, re-verified from the stored dates rather than trusted from the request, because the request is not evidence about what came back.
5. **Counts only.** Compare only columns that `PULL_SHAPE` (`:253`) names as measures, and only where both windows' values parse as integers. A percentage or an average column is skipped without comment.
6. **A prior of zero yields nothing.** No "up 100%", no infinity, no "up from nothing". A brand that had no traffic in the prior window has a story that a percentage tells badly.
7. **At most two per set**, taken in `PULL_SHAPE` measure order, inside the existing `MAX_FIGURES_PER_SET` budget of 8.
8. **`li-posts` is excluded outright**, keyed off the pull id. Post metrics accumulate after publishing and the pull groups by the post's own date, so a post published three days before the pull has had three days to gather impressions and one published eighty-five days before has had eighty-five. Comparing two windows of that measures time since publication and reports a decline on a healthy account. This is the same reasoning that rejected a within-table li-posts trend in the previous plan, and it is why the exclusion is a named constant with that sentence next to it rather than an accident of which pulls happen to have a date column.

Truncation deliberately does NOT suppress a change: `prov.partial` is about the fetched rows, and these totals never came from the fetched rows. Say that in a comment, because it is the one place in this file where `partial` does not disqualify something and the next reader will assume it is a bug.

The figure itself:

```ts
{
  id: `${ds.id}:change:${slug(colLabel)}`,   // stable across a re-pull, like every other id here
  value: 'up 18%',                            // direction inside the value: see below
  label: 'Clicks, against the 90 days before',
  basis: 'change',
  period: 'the 90 days to 25 Jul 2026, against the 90 days before it',
  source: prov.badge,
  partial: prov.partial,
  datasetId: ds.id,
}
```

**Why the direction sits inside `value`.** Every other figure in this file survives being quoted with the wrong adjective: 12,481 clicks is 12,481 clicks whether the copy calls it strong or disappointing. A change does not. "18%" quoted as a fall when it was a rise is a false statement built entirely out of true parts, and the only rule the writer is bound by absolutely is that a value is reproduced character for character. Putting the word inside the value puts the direction under that rule. The cost is that `figuresUsedIn` (`:737`) will not match a paraphrase like "an 18% rise", so that asset reads as having used no figure. That is the right way to be wrong: an audit trail that under-claims is recoverable, and this file already says an audit trail that is wrong is worse than none.

Round to whole percent. `Math.round` on the ratio, formatted with no decimal, because 18.4% and 18% lead to the same decision and the extra digit is precision the pipeline has not earned.

**Why.** This is the entire honesty surface of the feature. Everything else is plumbing and rendering.

**Done when.** Unit tests, one per refusal. (1) A set with `change` present but `editedAt` set yields no change figure. (2) A 90 day set whose prior window spans 61 days yields none, and the same set with a prior spanning 87 days yields one. (3) A set whose current window spans 40 of 90 days yields none, and the caveat names the current window rather than the prior one. (4) A `li-posts` set with two complete windows yields none. (5) A set with `prior.totals.Clicks` of `0` yields none. (6) A truncated `gsc-pages` set with two complete windows DOES yield a change, and its `partial` flag is true. (7) A set whose measure columns are `CTR %` and `Avg position` yields none. (8) Every change figure's `value` matches `/^(up|down) \d+%$/` and its `period` names two windows. (9) `changeFigures` over a fixture completes in under 1ms, since it runs inside `citableFigures` inside a card render.

**Copy.** Figure labels and periods as above. No user-facing strings originate here; Phase 3 owns them.

**Files.** `src/domain/datasetRead.ts`, `src/domain/__tests__/datasetChange.test.ts`

### The reading says it, and stops printing the line that says it cannot  `M`

**What.** In `readDataset` (`:556`), extend `DatasetRead` with `change?: string` (the clause, "up 18% on the 90 days before") and add a CHANGE finding carrying the change figures. Then deal with the caveat at `:632`, which is currently pushed unconditionally:

- When a change is shown, do not push "One pull is one snapshot. Nothing here says whether this is going up or down." It is now false.
- When a change is refused, push the specific reason instead of the generic line, one sentence, naming which window was the problem. The generic line survives only for the cases where it is still exactly true: a set with no `change` at all.

Amend the file header's rule list (`:388`), which currently reads "No trend, ever, from a single pull. One pull is one snapshot. 'Up' and 'down' need two." It becomes the narrower and still absolute rule: a change comes from two windows counted at the source, and never from arithmetic over one table's rows.

**Why.** The caveat is the app's own signed statement that it cannot answer this question. Leaving it printed underneath a change would be the product contradicting itself in adjacent lines, and deleting it outright would drop the honest answer for the many sets that still cannot be compared.

**Done when.** A fixture with two complete windows returns a `change` clause and its caveats do not contain the snapshot sentence. A fixture with an incomplete prior window returns no `change` and a caveat naming the prior window. A fixture with no `source.change` returns the original snapshot sentence unchanged. Every new caveat round-trips the suite's existing no-dash assertion.

**Copy.**
Change clause: `up 18% on the 90 days before`
Change finding claim: `Clicks are up 18% on the 90 days before.`
Change finding detail: `Counted by Search Console over both windows, not from the rows in this table.`
Caveat, prior window short: `The 90 days before this one only hold 54 days of data, so there is nothing fair to compare against yet.`
Caveat, current window short: `This window only holds 40 of its 90 days, so it is not comparable to the one before it. The connection may have stopped returning data.`
Caveat, prior window empty: `There is no data at all in the 90 days before this one, so there is nothing to compare against.`
Caveat, li-posts: `Posts keep gathering impressions after they go up, so an older post has had longer to collect them. Comparing two windows of posts would measure their age, not their performance.`
Caveat, unchanged from today when there is no comparison at all: `One pull is one snapshot. Nothing here says whether this is going up or down.`

**Files.** `src/domain/datasetRead.ts`, `src/domain/__tests__/datasetChange.test.ts`

## Phase 3: Where the change is read

**Goal.** The change is the second thing on the card face and the first clause in the panel, and the card face finally shows the reading at all.

**Why here.** A change computed and not rendered is worth nothing, and the card is where these tables are actually read: on a board, at 40% zoom, in a meeting. This phase also closes the card-face gap the previous plan specified and never shipped, which is scoped in deliberately rather than deferred, because putting a change into `MiniSheet`'s grey grid is not possible and adding a fourth surface that shows readings would be worse than fixing the one that should have.

### The card face shows what the table says  `M`

**What.** Replace the `MiniSheet` branch at `FlowsView.tsx:11003` with a three line read when `readDataset` returns ok and a headline: line one the question and window resolved from `source.query`, line two the headline plus the change clause when there is one and the read clause when there is not, line three the provenance badge with its existing amber tone. Keep `MiniSheet` exactly as it is when `readDataset` returns not-ok, because a blank or manual sheet has nothing to read and the fill pattern is the honest picture of it. Memoise on `${ds.id}:${ds.rows.length}:${ds.source?.syncedAt}:${ds.editedAt}` so a drag frame does not re-read 500 rows. At canvas zoom below 55%, drop the headline and keep the question, the badge and a tone dot: enlarging a change while hiding the windows it is between is the staleness failure rendered larger.

**Why.** The card's most informative pixel today is a 50px grid of grey blocks meaning "this has data in it". A marketer scanning a board should be able to see which table moved without opening anything.

**Done when.** Screenshot test at 100%, 55% and 40% zoom. At 40% no bare percentage renders without its badge visible in the same card. A card holding a manual sheet still renders `MiniSheet`. The headline plus change clause is hard clamped to two lines and a fixture with a long change label does not make the card taller than its neighbours. Dragging a board of eight data source cards holds 60fps with 500-row fixtures.

**Copy.**
Line 1: `Landing pages from search, 90 days`
Line 2, with a change: `12,481 clicks, up 18% on the 90 days before.`
Line 2, without: `12,481 clicks. The top 10 pages are 58% of them.`
Line 3: `Search Console, 90 days to 25 Jul 2026`
Sketched card, line 2, unchanged: `Sketched, not measured. Nothing to read from this one.`

**Files.** `src/components/FlowsView.tsx`, `src/index.css`

### The panel leads with it, and says what it is between  `S`

**What.** In `DatasetRead.tsx`, render the change clause in the head block beside the headline (`:51`), styled as a rise or a fall rather than as plain text, and render the two windows underneath in full: not "the 90 days before" but both dates. Add `ds.source.change` to the memo's dependency list at `:34`, which currently keys on `syncedAt` and would not re-read after a refresh that changed only the totals. The CHANGE finding renders through the existing finding row, so "Make this a proof point" works on it with no new wiring, and is correctly disabled on every set where `prov.citable` is false.

**Why.** The card says the change and the panel is where somebody checks it before they use it. Two dates are what a person checks.

**Done when.** With a fixture carrying a change, the head block shows the clause and the two window sentences, and the first source picker row is still visible without scrolling at 900px viewport height. Refresh a set so that only its totals move and assert the panel re-reads. Make a proof point from a change finding and assert the stored Rtb carries the two-window period.

**Copy.**
Beside the headline: `up 18%`
Under it: `The 90 days to 25 July 2026, against the 90 days to 26 April 2026.`
On a fall: `down 12%`

**Files.** `src/components/DatasetRead.tsx`, `src/index.css`

## Phase 4: What the writer may do with a change

**Goal.** A change reaches the copy writer as one more quotable figure under one added rule, and the coherence check stops treating it as a number from nowhere.

**Why here.** Last, because the payload is already built and the gates are already the hard part. This phase is two small things and one bug that only exists once changes travel.

### The coherence check learns the two shapes a change value has  `M`

**What.** `citableValues` is built at `useTrafficStore.ts:8296` as `normalizeFigure(f.value)` for every citable figure, and `normalizeFigure` (`coherenceChecks.ts:554`) strips spaces, so a change figure contributes the string `up18%`. Copy quoting it says `18%`, `MEASURED_SHAPE` matches `18%`, the set does not contain it, and `detectUnsourcedFigures` raises "A number with no table behind it" against a number that came from a table. That is a false positive on the app's own figure, in the check whose whole value is that it does not cry wolf.

Fix it in one place, not two. Export `figureMatchForms(f: CitableFigure): string[]` from `datasetRead.ts`, returning the value plus, for basis `'change'`, the bare percentage. Have BOTH the coherence vocab and `figuresUsedIn` (`:737`) read it, so the set of strings that counts as "this figure appeared" cannot differ between the check that flags a number and the report that says a number landed.

**Why.** Two lists of what a figure looks like is the exact drift this file's header says it exists to prevent, and the failure is asymmetric: the check firing on a real figure teaches people to ignore the check.

**Done when.** Build a campaign wired to a set with a change figure, put `18%` in an asset's body, and assert `detectUnsourcedFigures` returns nothing for that row. Put `19%` in and assert it fires. Assert `figuresUsedIn` reports the change figure as used for copy reading "up 18%" and, through the shared forms, for copy reading "18%". Re-run the existing fifty-asset false positive corpus and assert the rate has not moved.

**Copy.** None. Existing break copy is unchanged.

**Files.** `src/domain/datasetRead.ts`, `src/domain/coherenceChecks.ts`, `src/store/useTrafficStore.ts`

### One paragraph in SYSTEM, and nothing else in the payload  `S`

**What.** No wire change. The sanitizer at `copyDraftHandler.ts:159` already passes `value`, `label`, `period`, `source` and `partial` and drops everything else, so a change figure travels as-is; `period` is clamped at 80 characters and the two-window sentence above is 58. `stripEmDashes` (`draftWriter.ts:287`) rewrites only U+2014 and U+2013 and leaves the ASCII hyphen alone, so nothing here is at risk from it, but no change value may ever contain an en dash and the test below pins that.

Add one paragraph to SYSTEM immediately after A FIGURE CARRIES ITS PERIOD AND ITS SOURCE at `:90`, verbatim:

> A CHANGE IS BETWEEN TWO NAMED WINDOWS. A figure whose value begins "up" or "down" is a change the app computed between the two periods named in its period line, and both of those periods belong in any sentence that uses it. Reproduce the direction word and the number together, exactly as given: never restate a rise as a fall, never drop the direction, and never soften or sharpen it into growing, surging, collapsing or holding steady. A change describes those two windows and nothing else, so never project it forward, never annualise it, never call it a rate of growth, and never present a change in one measured metric as a change in the business, in revenue, in demand or in the market. If a figure carries no direction word it is a level and not a change, and you may not turn one into the other by comparing it to anything.

Leave HOLDING DATA IS NOT A CLAIM at `:92` exactly as written. It already says a rise may be described when "a figure you were given says exactly that", which is now sometimes satisfied and was written to be.

**Why.** The existing three paragraphs cover quoting, dating and attributing a level. None of them covers the two ways a change fails: stated backwards, and stated about something bigger than the metric it measures.

**Done when.** Handler unit test: a body containing a change figure produces `userContent` containing `up 18%` exactly once and the two-window period exactly once. A change figure whose value contains an en dash is rejected by a test over `changeFigures` output, not repaired at the boundary. Integration: build a campaign with one wired set carrying a change and assert the direction word and the number appear together, in that order, in any component that quotes it.

**Copy.** The SYSTEM paragraph above, verbatim.

**Files.** `server/copyDraftHandler.ts`, `server/__tests__/copyDraftFigures.test.ts`

## Deliberately rejected

- **Letting the user pick the comparison window.** A second window is a second thing to get wrong, a second control on an already long panel, and a second sentence in every place a change is explained. Equal and adjacent is what every analytics tool means by comparison and therefore what a marketer will assume the number is regardless of what the app says. If somebody genuinely wants 90 days against the same 90 days last year, that is a different feature with a different honesty problem (seasonality) and it should be argued for on its own.

- **Row level movers: which pages grew, which queries fell.** The obvious next ask and the one to refuse hardest. The dimensioned pull is the top 500 by the CURRENT window's primary metric, so a page that was big before and collapsed is frequently not in the table at all, which means the movers list systematically cannot show the worst declines. Rows also churn: a new page has no prior value and is not a 100% rise. Building this correctly needs the prior window dimensioned too, which is a second 500 row pull, a join, and a whole vocabulary for rows that appear in one side only. It is a feature, not an addition, and it should not ride in on the totals.

- **Storing each pull as a snapshot and computing changes across pulls.** Rejected once already in the previous plan and it is still right. It needs a scheduler that does not exist, it depends on a human remembering to pull the same question at the same window twice weeks apart, it writes 15 to 20KB per set through a save path that had to be taught not to swallow quota failures, and the changes it produces are mostly the rolling window rolling. The two-window probe gets the same answer from one click with nothing stored between sessions.

- **A change on a rate or on average position.** "Clickthrough rate up 20%" and "clickthrough rate up 0.4 points" describe the same movement and lead to different decisions, and there is no way to pick one that is right for every reader. Average position is worse, because it improves by going down, so every direction word is inverted relative to every other figure on the card. Counts have one honest answer, and the plan takes the narrow win.

- **Showing a change with a warning when a window is incomplete.** The tempting version of the completeness gate: show "down 40%" in amber with "the connection may have stopped returning data" underneath. This is the single worst thing in the design space. The number is wrong, it is the most alarming number on the card, and it will be screenshotted into a channel before anybody reads the amber line. A refusal that names the broken pipe is more useful than a false number that hedges about it.

- **Colouring a rise green and a fall red.** A fall in impressions after cutting a paid campaign is a success and a rise in clicks from one viral post is noise. The app knows the direction and does not know whether it is good, and colour asserts the second. Style the change as emphasis, not as a verdict.

- **Asking a model to write the change sentence.** The whole point is that this number is defensible without a key, reproducible on demand, and identical on the card and in the prompt. A model in the middle of that costs money, adds a failure mode, and can only make the sentence worse in exactly the ways Phase 4's paragraph forbids.

- **Auto refreshing a set so its comparison stays current.** `/api/aggregator` has no auth and a rate limit that is a module-scope array of 40 timestamps resetting on every cold start, and one pull now spends three requests. Refresh stays a thing a person clicks.

## Open questions, for you not me

- **The one from last time, still unanswered.** Nobody has used the shipped feature. Five phases and a sixth planned here, and not one line of any of it cites a marketer who tried to answer a question about their own campaign. A change is the most likely thing to make somebody open the card twice, which is either an argument for building it next or an argument for watching one person use what exists first. It is your call and it is genuinely close.
- **Does the completeness gate refuse too often to be worth it?** A brand that connected Google two months ago cannot see a 90 day change, and that is most new brands in a pilot. The gate is right, but if it fires for nine users in ten then the feature ships as a caveat with a rare payoff, and the answer might be to offer the 30 day question first rather than to weaken the gate.
- **Should a refused change say anything at all on the card face?** Phase 3 puts the reason in the panel and shows nothing on the card. The argument for a card line is that a marketer comparing two cards should see why one has a change and one does not. The argument against is that the card would then carry a sentence about an absence, which is how cards get long.
- **Is "up 18%" the right value, or is "12,481, up from 10,577" better?** The second is two real counts and no arithmetic at all, which is more defensible and reads worse. The percentage is one computed number and is what a person would say out loud. This plan picks the percentage and the choice is reversible in one function.
- **What happens to a set pulled before this ships?** It has `coverage` and no `change`, so it never compares, silently, forever, until somebody pulls it again. That is correct and it is invisible. A "pull it again to see whether this moved" line on an old set would fix it and would also be an ad for a button on every card in the workspace on the day this ships.
