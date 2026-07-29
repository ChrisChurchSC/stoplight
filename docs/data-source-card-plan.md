# Data source cards: a plan to make them simple and decision-useful

_Breadcrumbs. Drafted 2026-07-29, after the four acquisition routes shipped on PR #161._

## What a Data source card is for

A Data source card is the place a marketer puts a real number into a campaign, and the only thing on the canvas that can make the copy cite something that was actually measured. After this plan, dropping the card and tapping once gets you a table from a channel you have connected. The card then says, in one line, what that table is about and how old it is, and the panel next to it says what the table shows, what it deliberately does not show, and exactly which figures will be handed to the writer, character for character. When you build the campaign, those figures appear in the copy with their period and their source intact, and nothing else from the table ever does. A sketched table produces no figures at all, a table you edited by hand stops counting as measured, and a table that has gone past its own window holds its figures back until you pull it again. The unit that crosses the wire is never a grid of rows. It is a small set of figures the app computed, each one traceable back to a cell somebody can point at.

## Principles

- The app computes every number, the writer only quotes it. No model does arithmetic over a table. Every value that reaches /api/draft-copy is a string the app produced from a real cell, which is the same trade mediaMixHandler and askClaude already made.
- Provenance is a tier, not a label. DatasetSource records how a table arrived; datasetProvenance() decides what it is worth, from the source plus the edit history plus the window. Six surfaces read that one function, so a table cannot look measured on the card and be typed in the payload.
- Citable is the exception. A table earns automatic citation by being measured or uploaded, unedited, and inside its own window. Everything else is still useful for planning and still wireable, and its numbers reach copy only when a human types one into The figure and owns it.
- A figure with no period is not a fact. Every citable figure carries the stretch of time it covers, anchored to the data's own coverage, never to today.
- Withholding must be visible. Every rule here refuses something, and a refusal the user cannot see is indistinguishable from the feature being broken. The inspector says what will be sent and what will not, in the same voice.
- Silence beats a hedge for anything invented. A sketched table is not sent with a warning, it is not sent at all, including its name and its columns. Naming a table in order to forbid it puts the name in the prompt for no benefit.
- Two words, not ten. The thing on the brand is a DATA SET. The thing that reaches the writer is a FIGURE. Reading, digest, citable figure, finding, table and sheet do not all get to be nouns in the UI.
- Never compare an organic number to a paid benchmark. The only benchmark constants in the repo (channelMix.BENCH, channelRecords.BENCH) are paid CPM, CTR and CVR. Comparisons come from the table itself or the brand's own history, or they do not happen.
- Prefer plain computed code to a model call. Every comparison in this plan that can be computed exactly is computed exactly, in a pure module with tests, so it still works with no API key.

## Phase 1: A table can change what gets written

**Goal.** A wired data set reaches the copy writer as a short list of verbatim, dated, sourced figures the app computed, and no invented or hand edited number can ever get through.

**Why here.** Mandated first, and correctly so: today wiring a Data source card draws the edge, flips the .attached styling and lists the card under "Applied to" while writing nothing to Campaign.references, so the board asserts a link the data model does not have. Every other item in this plan is decoration until that is fixed. The honesty half rides in the same phase rather than after it, because the moment figures start travelling, the live setDatasetCell bug (type 99% into a pulled CTR cell and the card still reads "Summer, 7/29/2026") stops being a display bug and becomes a false claim in published copy.

### Data sets become wired records, exactly like Seasons  `M`

**What.** Add 'dataset' to FlowRefType (src/domain/clients.ts:199). Add `'data-source': 'dataset'` to REF_TYPE_FOR_OBJECT_KIND (src/domain/flowBoard.ts:31) and widen the value union. Fix the three non-Partial Record maps that will now fail the build: RECORD_TYPE_ICON (FlowsView.tsx:102, the database cylinder from canvasObjectMeta), RECORD_TYPE_LABEL (:149, `dataset: 'Data set'`) and LABEL inside describeSmartObject (src/domain/smartObject.ts:225, 'data set'). Add `dataset: 'data-source'` to KIND_FOR_REF_TYPE so a bundled set rehydrates to the right card kind; leave KIND_PRIORITY alone. In poolsFrom (useTrafficStore.ts around :6356) add the standard id-Set plus label-Set block over get().brandDatasets AND a `d.brand === client` filter (client is in scope from clientForCampaign at :6288), with no library fallback. Add `if (isAttached(nt.id)) attachToCampaign(nt.id)` after all three setObjectRef calls in renderDataSourcePicker (FlowsView.tsx:3021, :3063, :3083), matching the pattern at :2735 and :7008. Make deleteBrandDataset (useTrafficStore.ts:3548) sweep every flowBoard and clear refIds pointing at the deleted id.

**Why.** One map entry turns on refForObject, refsBehind, attachToCampaign, attachToTarget, wiredRefsFor and the smart-object propagation at once. The brand filter is not optional and is not true of any other pool: BrandDataset carries a required `brand`, and a stale refId crossing brands would breach the exact boundary the check at useTrafficStore.ts:6292 exists to defend.

**Done when.** Wire a Data source card holding set X to the campaign hub, then call wiredRefsFor(boardFor(flowBoards, campaign), smartObjects, 'campaign') and assert it contains {type:'dataset', id:X}. Hand-edit a card's refId to a set belonging to brand B while the canvas is bound to brand A, run draftCopy, and assert campaignPools.datasets is empty. Delete set X from DatasetPage and assert every card that pointed at it now has refId cleared and renders the empty state rather than a dangling teal spine.

**Copy.** Delete confirm, when cards point at it: "Delete this data set? It is on 3 cards. Those cards will go back to empty." Buttons: "Delete it" and "Keep it". When nothing points at it: "Delete this data set? Nothing is using it."

**Files.** `src/domain/clients.ts`, `src/domain/flowBoard.ts`, `src/domain/smartObject.ts`, `src/store/useTrafficStore.ts`, `src/components/FlowsView.tsx`, `src/components/DatasetPage.tsx`

### A test runner, because from here on the figures are arithmetic  `S`

**What.** Add vitest and an `npm test` script to package.json (the repo currently has dev, build, preview, typecheck and changelog:check, and zero test files outside node_modules). No jsdom needed for this phase: every module under test is pure. First suites cover datasetProvenance and citableFigures.

**Why.** The entire justification for this feature is that a figure the app computed can be defended. A pure statistics module with denominator floors, truncation guards and provenance precedence, shipped with nothing that verifies it, is a claim without evidence. Adding the runner is part of the first arithmetic module, not a follow-up.

**Done when.** `npm test` runs from a clean checkout and exits non-zero when a deliberately broken citableFigures case is introduced. `npm run typecheck && npm test` are both green on the branch before it is opened as a PR.

**Copy.** None. Developer surface only.

**Files.** `package.json`, `src/domain/__tests__/datasetRead.test.ts`

### Provenance tiers, and the Edited state that does not exist yet  `M`

**What.** Create src/domain/datasetRead.ts exporting `datasetProvenance(ds: BrandDataset, now = Date.now()): DatasetProvenance` where DatasetProvenance is {tier: 'measured'|'uploaded'|'typed'|'sketched'|'edited'|'stale', badge, detail, tone: 'plain'|'amber', citable: boolean, why, partial, periodLabel?}. Precedence: sketched beats everything, then edited, then stale (Phase 4 fills this in; until then it never fires), then measured / uploaded / typed. citable is true only for measured and uploaded. Add `editedAt?: number` and `editedCells?: number` to BrandDataset (src/domain/brandDataset.ts) and stamp them in setDatasetCell, setDatasetColumn, addDatasetRow and addDatasetColumn (useTrafficStore.ts:3554 onward), incrementing editedCells only when the new value differs from the old. Widen the aggregator arm of DatasetSource with `truncated?: boolean` and `rowCount?: number`, and pass r.truncated through AggregatorConnect.runPull (AggregatorConnect.tsx:154, which already has it in hand and drops it) into importBrandDataset. Replace every ad hoc provenance string with a call to datasetProvenance: the four inline branches on the canvas card (FlowsView.tsx:6941 to 6975), the four-way sub-line ternary in the picker (:3009 to :3018), the DatasetPage eyebrow and the BrandDataSets gallery meta line. Add a title attribute to .flow-src-sub, which is a single-line ellipsis today with no way to recover the truncated text.

**Why.** DatasetSource records how a table ARRIVED and nothing records how it has been treated since, so a user can open a Search Console pull, type 99% into a CTR cell, and the product keeps presenting it as measured. That is an invented figure presented as measured inside the feature whose defining rule forbids it, and it defeats every other safeguard in this plan with one keystroke. Persisting truncated is what lets the next item refuse to emit a total.

**Done when.** Unit test: a set with source.kind 'aggregator' and editedAt greater than syncedAt returns tier 'edited' and citable false; the same set with editedAt absent returns 'measured' and citable true. Integration: type into one cell of a pulled table and assert the card's provenance line changes on the next render and a rebuild of that campaign sends zero figures from that set. A set landed before this ships (no editedAt) still reads as measured, and the field's doc comment says the guarantee only holds going forward.

**Copy.** measured: "Search Console, 90 days to 14 Mar 2026"
uploaded: "From queries.csv, 14 Mar 2026"
typed: "Typed by hand"
sketched: "Sketched, not measured"
edited: "Edited after it came in. 3 cells changed since Search Console returned this."
Appended to any partial table: " Top 500 rows."
Inspector line under a typed set: "Typed by hand. Numbers you typed into a sheet are not sent to the writer on their own. Write the one you want cited into The figure below, so the claim belongs to somebody."

**Files.** `src/domain/datasetRead.ts`, `src/domain/brandDataset.ts`, `src/store/useTrafficStore.ts`, `src/components/AggregatorConnect.tsx`, `src/components/FlowsView.tsx`, `src/components/DatasetPage.tsx`, `src/components/BrandDataSets.tsx`, `src/index.css`

### citableFigures: the app computes the number, the payload carries no rows  `M`

**What.** In the same module, `citableFigures(ds: BrandDataset, now?: number): CitableFigure[]` where CitableFigure is {id, value, label, basis: 'cell'|'sum'|'share'|'rank', period?, source, partial, datasetId}. `id` is derived from datasetId plus column plus row key so it survives a re-pull. Rules enforced in code with the reason in a comment, not in a prompt: return [] unless datasetProvenance(ds).citable; return [] for source.kind 'composite' independently of the tier check, so the exclusion survives a second caller; never emit basis 'sum' or 'share' when source.truncated is true, because a sum over the top 500 rows is not a total; emit 'rank' only with a label that names the population; cap at 8 per set; `value` is always either a cell taken verbatim or a string this function formatted from exactly one cell. Column typing keys off the pull id parsed out of source.query ('gsc-pages:90d'), never off header text, because the warehouse and direct routes return different headers for the same question. Uploads get a numeric-column sniff and no period at all, because the app does not know what stretch of time somebody's CSV covers.

**Why.** This is what makes the writer's honesty rule checkable rather than aspirational. "Never state a figure that is not in the list you were given" can be enforced against a closed set of exact strings; "never misread the table" cannot. It also removes the whole class of arithmetic errors by removing arithmetic.

**Done when.** Unit tests. (1) A gsc-pages set with source.truncated true yields no figure whose basis is 'sum' or 'share', and at least one whose basis is 'cell'. (2) A composite set yields []. (3) An upload yields figures whose `period` is undefined. (4) For every figure returned by a fixture set, `value` either appears verbatim in ds.rows or is reproducible from exactly one cell by the documented formatter. (5) A set with editedAt set yields [].

**Copy.** Figure labels are read aloud in the panel and in the coherence break, so they are written for a person: "Clicks on the query marine survey", "Impressions on /guides/hull-survey", "The highest clicks of the 500 rows we fetched". Never "clicks_max".

**Files.** `src/domain/datasetRead.ts`, `src/domain/aggregator.ts`, `src/domain/__tests__/datasetRead.test.ts`

### The payload, the destructure, and the rule the writer is bound by  `M`

**What.** Add `datasets?: CitableFigure[]` to DraftRequest in src/adapters/copy/draftWriter.ts, next to seasons. Build it before baseReq (useTrafficStore.ts around :6671) as campaignPools.datasets.flatMap(d => citableFigures(d)).slice(0, 12), and mirror the same field into previewFlowCopy's baseReq (around :6820) so the canvas preview does not show copy the build would not write. Server: add `datasets` to the destructure at copyDraftHandler.ts:101 (a field not named there vanishes with no error, no log and no test failure, which is the documented hooks bug), add a sanitizer block modelled on seasonList at :135 that drops any figure missing value, label or source and clamps every string, append the FIGURES block to userContent after the messages block at :217, and add the three SYSTEM paragraphs immediately after PROOF CARRIES ITS NUMBERS at :81. The no-dash pass must skip `value`, for the same reason fillCardHandler skips AGE_RANGES: rewriting a dash inside 2026-03-14 corrupts the figure. Cap constants (8 per set, 12 per campaign) live next to MAX_ENTRIES_PER_ASSET in src/domain/direction.ts.

**Why.** maxTokens scales at assetCount * 1500, so a table would compete for budget with the copy it is meant to improve while handing the model unchecked figures to quote. Twelve strings cost almost nothing and are the only thing a detector can later verify.

**Done when.** Unit test on the handler: given a body with three figures, the sanitized list has length three and the returned userContent contains each `value` exactly once. Given a body whose datasets came from a composite set (so the array is empty), assert the string 'FIGURES' does not appear in userContent and the sketched set's name appears nowhere in it. Integration: build a campaign with one wired measured set and assert at least one figure value appears character for character in a generated component.

**Copy.** None directly. The SYSTEM and userContent language is in writerPrompt below and is the exact copy to paste.

**Files.** `src/adapters/copy/draftWriter.ts`, `src/store/useTrafficStore.ts`, `server/copyDraftHandler.ts`, `src/domain/direction.ts`

### What this table will send  `M`

**What.** Add `renderDatasetContribution(nt)` to FlowsView, rendered under renderDataSourcePicker (:5979) and above the direction field, modelled line for line on renderResolvedDirection (:2749) which already does this job for direction under "What this will be told". It lists each CitableFigure exactly as the writer will receive it: the value, then the label and the period sentence. When anything is withheld it renders ONE line with a count that expands, not a permanent wall of amber. When the card is wired to nothing it renders the not-wired sentence, which the panel says nothing about today because the whole "Applied to" block returns null. It also names the heuristic fallback, because ClaudeCopyWriter.draft drops to a heuristic writer on any non-200 and that writer reads neither direction nor datasets.

**Why.** Every rule in this phase refuses something. A product that quietly refuses is worse than one that never tried, because the marketer forms a false model of what generation knows: they wire a table, see the card go teal, and get copy that never mentions it. Showing the exact strings before Build is also the cheapest review there is, because a wrong period is obvious on sight and invisible in a finished headline.

**Done when.** For each of the ten combinations of tier (measured, uploaded, typed, edited, sketched) by wiring state (wired to the campaign, wired to nothing), the panel renders a non-empty sentence. Snapshot test: the figure rows the panel lists are byte-identical to the `datasets` array the next draftCopy call sends for that campaign.

**Copy.** Heading: "What this table will send, 3"
Rows: "1,240" then "Clicks on the query marine survey, in the 90 days to 14 March 2026"
Footer under the group: "Search Console, via Summer"
Withheld, one line: "2 things held back. Open" expanding to lines like:
"Totals and shares. The pull stopped at 500 rows, so adding these up would not give you a total."
"Everything. This is a sketch, so the writer is told nothing about it, not even its name."
"Everything. 3 cells were changed by hand after Search Console returned this, so it is no longer what Google said."
"Everything. A table you typed is not evidence on its own. Pick a number below and it becomes yours."
Not wired: "Not wired to anything yet. Draw a line from this card to the campaign brief, or to one piece of content, and the figures above will reach the copy for it."
Fallback note, always present under the list: "If the model cannot be reached, the campaign gets written by the built in writer, which uses none of these. The draft says which one wrote it."

**Files.** `src/components/FlowsView.tsx`, `src/index.css`

## Phase 2: Getting a table onto a card should cost one tap and never dead end

**Goal.** A marketer with nothing connected and thirty seconds can land a real table, understand what went wrong when it does not, and always has a visible way out of every state the card can reach.

**Why here.** Highest value per hour in the whole plan and almost entirely S and M work: a rename that changes the first thing every user reads, an error body that is already on the wire and thrown away, a list sort whose own comment lies about the behaviour, and five silent dead ends. It sits after Phase 1 only because Phase 1 is mandated, and it has no dependency on Phase 1, so it can be built on a parallel branch and merged first if Phase 1 is still in review.

### Name the six questions the way a marketer would ask them  `S`

**What.** Add three fields to AggregatorPull in src/domain/aggregator.ts: `question` (the button label), `decides` (the line under it) and `shortName` (used to mint the data set name). Keep `label` and `detail`; `detail` moves to a title attribute on the row so the column list stays recoverable but stops being the headline. AggregatorConnect renders `question` as .flow-agg-name and `decides` as .flow-agg-why. runPull mints the name from `shortName` plus the brand plus the window (AggregatorConnect.tsx:152), not from `label`, so existing names stay stable and two pulls of the same question stop colliding.

**Why.** The current labels are report names and the line under each is a column list, which is the worst possible headline because nobody wants columns. Verified that `label` is read in exactly two places, both inside AggregatorConnect, so adding fields beside it is safe and touches two files. Cheapest comprehension change available.

**Done when.** Every AGGREGATOR_PULLS entry has a non-empty question, decides and shortName, enforced by a unit test that also asserts none of the eighteen strings contains an em dash or an en dash. Two pulls of gsc-pages at different windows produce two data sets with different names.

**Copy.** gsc-queries: "What do people search for before they find you?" / "The words to write with, and the pages to write next." / shortName "Search queries"
gsc-pages: "Which pages bring people in from search?" / "Which pages deserve more work, and which ones nobody sees." / "Landing pages from search"
ga4-channels: "Where is your traffic coming from?" / "Which channel is getting you the visits." / "Traffic by channel"
ga4-pages: "Which pages do people actually read?" / "What to make more of, and what to retire." / "Top pages"
yt-videos: "Which videos are working?" / "The topic and the length to make more of." / "Video performance"
li-posts: "Which posts got a reaction?" / "What to say again, and in what format." / "Post performance"

**Files.** `src/domain/aggregator.ts`, `src/components/AggregatorConnect.tsx`

### Paste a table, and stop sending people back to Excel  `S`

**What.** Add a paste target to the source list: a row that focuses a hidden textarea, and an onPaste handler on the card's inspector that runs clipboard text through the existing parseTable (src/lib/parseTable.ts), which already sniffs comma, tab and semicolon and reports how many blank rows it dropped. Lands through the same importBrandDataset path as a file, with source kind 'upload' and filename 'Pasted'. Keep the .xlsx refusal, but rewrite it to point at the paste route rather than at Excel's File menu.

**Why.** The most likely first action of a small-brand marketer is that they have a spreadsheet open in another tab, they select cells and they hit paste. None of the four lenses proposed it, and every one of them kept a refusal message that tells the user to go to another application and come back. The parser is already written; this is a split on tabs and newlines.

**Done when.** Copy a range out of Google Sheets, click the card, hit paste: a data set lands with the right column count, the right row count, and a note naming the separator. Paste a single cell: refused with the sentence below rather than landing a one-by-one table. Drop an .xlsx: the refusal names paste, not Excel.

**Copy.** Row: "Paste a table" / "Copy some cells and press paste"
On success: "14 rows and 5 columns, tab separated. 2 blank rows skipped."
Single cell: "That is one cell. Copy the whole range, headers included, and paste again."
xlsx: "Excel files are not readable yet. Open it, select the cells you want, copy, and paste them here instead."

**Files.** `src/components/FlowsView.tsx`, `src/lib/parseTable.ts`

### Nothing connected is a state with a fix, not an empty list  `M`

**What.** Change the channelOptions effect (FlowsView.tsx:1000 to 1044) from swallowing every failure into `[]` to holding {state: 'checking'|'ready'|'none'|'no-brand'|'error', options}. Render one sentence per state. When Google is not connected AND getActiveWorkspaceId() returns an id, render a real Connect Google row pointing at /api/google-connect?workspace=<id>, the same call ConnectorsPage.tsx:154 already makes. When getActiveWorkspaceId() returns null (the localStorage-only pilot) suppress the row and say who can connect it rather than leaving a dead sentence. Fix the silent brand hole in the same pass: with brand === '' the sources call posts brand '' and the Google branch throws BAD_REQUEST, so the rows never appear; show the no-brand sentence instead, and stop "New data set" minting orphan sets with brand ''.

**Why.** On first run the card shows three buttons and nothing says a channel could ever exist, so the feature looks like it was never built. The connect flow is already shipped and reachable from Connectors; this plumbs an existing action into the moment the user actually wants it.

**Done when.** With the status endpoint stubbed to fail, the picker shows the could-not-check sentence and still offers upload, paste and blank sheet. With no brand bound, the picker shows the no-brand sentence and "New data set" is disabled rather than creating a set with brand ''. With Supabase unconfigured, the Connect Google row is absent and the who-can-connect sentence is present. The OAuth return path is explicitly out of scope for this item and tracked separately.

**Copy.** checking: "Checking what is connected"
no brand: "Pick a brand for this canvas first. A data set belongs to a brand."
Connect row: "Connect Google" / "Analytics, Search Console and YouTube. About a minute."
Under it: "Until something is connected there is nothing to pull. You can still paste a table, upload a CSV, or start a blank sheet."
No workspace: "Nothing is connected on this account. Whoever set up this workspace can connect Google from the Connectors page."
Connected but nothing queryable: "Google is connected, but that account cannot see Analytics, Search Console or YouTube for {brand}."
could not check: "Could not check what is connected. Paste a table or start a blank sheet in the meantime."

**Files.** `src/components/FlowsView.tsx`, `src/components/ConnectorsPage.tsx`, `src/index.css`

### Errors that name the fix, on one line instead of two surfaces  `S`

**What.** In AggregatorConnect.post, read the response body (`const body = await res.json().catch(() => ({}))`) and throw an error carrying body.error. apiRoute.ts:71 already writes {error: code ?? message} into every failure body and the client throws it away. Map a small allow list of known codes to sentences and fall through to the generic sentence for anything else, so an internal string like 'summer query 403' never reaches a marketer. Then collapse the two error surfaces (.flow-agg-err inside AggregatorConnect and the shared .flow-note-mini-note below it, which have different tones and different lifetimes) into one status line owned by the card, cleared when the source changes rather than lingering under a cancelled pull. Also add a running state and a cancel: a 365-day Summer query is slow, and staring at "Pulling" with no idea whether it is stuck is where people give up on a tool.

**Why.** "Could not pull that" is unrecoverable by construction: it does not distinguish a problem the user fixes in ten seconds from one they cannot fix at all. The information is already on the wire.

**Done when.** Stub the endpoint to return each of NO_KEY, NOT_CONNECTED, BAD_REQUEST and rate_limited and assert four distinct sentences render. Stub it to return an unmapped string and assert the generic sentence renders and the raw string appears nowhere in the DOM. Start a pull, click Cancel, and assert no note is written and the card's existing table is untouched.

**Copy.** NO_KEY or NOT_CONNECTED: "That channel is not connected yet." shown next to the Connect Google row
rate_limited: "Too many pulls in the last minute. Try again in a moment."
BAD_REQUEST with no website on the brand: "Add this brand's website on its brand page, then pull again."
UNKNOWN_PULL or UNKNOWN_PROVIDER: "That question is not available yet. Pick another one."
anything else: "Could not pull that. Nothing on the card changed."
running: "Pulling. This can take a minute on a year of data." with a "Stop" button
after stopping: "Stopped. Nothing on the card changed."

**Files.** `src/components/AggregatorConnect.tsx`, `src/components/FlowsView.tsx`, `src/index.css`

### No dead ends: five states you currently cannot get out of  `M`

**What.** (a) Key the .linked className on the RESOLVED data set rather than `nt.refId ?` (FlowsView.tsx:6902), so a card whose set was deleted stops wearing a teal spine while its mini reads "No data set linked yet", and make openDataCard say something instead of returning silently at :4756. Preserve the original guard's intent (it was protecting a connector id) by treating the ref as dangling only when it resolves in neither allBrandDatasets nor the connector id shape. (b) Add an unlink row, rendered only when linked, calling setObjectRef(nt.id, '') plus the matching detach. (c) Move the `!brand` check in composeDataset after the state update (currently `if (!said || !brand) return` at :919 fires before anything, so "Sketch it" with no brand does nothing at all, while the upload path handles the identical case with a sentence). (d) "New data set" opens the sheet, matching what openDataCard already does for an empty card, and blankDataset (brandDataset.ts:53) ships empty column headers with a placeholder rather than four columns literally named Column 1 to Column 4. (e) Render a card's linked set at the top of the list even when it belongs to another brand, checked, with a sub-line saying so, because the card resolves from allBrandDatasets while the list renders brandDatasets and the panel currently reads as nothing-selected on a plainly linked card.

**Why.** Every one of these is a state the app reaches on its own, and in each of them the next action is invisible. Three are literally silent. A marketer who hits any of them concludes the card is broken, and they are not wrong.

**Done when.** Five scripted runs, each ending with a visible next action on screen and not in a tooltip: delete a linked set and recover; unlink and relink; press Sketch it with no brand bound and read a sentence; create a blank sheet and land in it with an empty first header focused; select a card holding another brand's set and see it checked at the top of the list.

**Copy.** dangling, card label: "That data set was deleted"
dangling, above the list: "The data set this card pointed at is gone. Pick another one below."
unlink row: "Unlink" / "The data set stays in your data sets. The card goes empty."
compose with no brand: "Pick a brand for this canvas first. Then I can sketch a table for it."
blank sheet column placeholder: "Name this column"
cross-brand sub-line: "Belongs to {otherBrand}"

**Files.** `src/components/FlowsView.tsx`, `src/domain/brandDataset.ts`, `src/components/DatasetGrid.tsx`, `src/index.css`

### A source list that fits on a screen, and one honest recommended tap  `S`

**What.** Sort the brandDatasets memo (FlowsView.tsx:985) newest first by syncedAt ?? importedAt ?? generatedAt, falling back to insertion order, which is what the comment at :3006 already claims and the code does not do. Show the three most recent plus an expander, always including the currently linked set even when it falls outside the three. Add the date to every sub-line so two pulls of one question are distinguishable. Order the panel as: recommended tap, your recent data sets, paste / upload / describe / blank, then the channel rows under "Something else". The recommended tap is ONE button that runs the first question of the first connected channel at 90 days through the existing pull op, with a label that says only what it will do. It does NOT derive the channel from the campaign goal.

**Why.** The four things you can do are below every set the brand has ever made, in the wrong order, with two identically named rows in it. On the recommendation: the goal join does not survive contact with the code. sourcesForKpi is a substring stem match over ANALYTICS_SOURCES in array order, so 'organic sessions' matches GA4 on 'session' and Search Console on 'organic' and GA4 wins on position, and nine of the eleven GTM strategies map to a CRM KPI that is not pullable at all. A recommendation that explains itself wrongly is worse than one that says nothing.

**Done when.** With fourteen data sets on a brand, the picker renders at most three plus the linked one plus the expander, and the four action rows are visible without scrolling at 900px viewport height. Two pulls of gsc-pages made a week apart render two rows whose sub-lines differ by date. The recommended button's label names the same channel and window that the request it fires actually uses, asserted by a test that reads both from the same source.

**Copy.** Recommended button: "Pull your last 90 days from Search Console"
Sub: "It is what you have connected. You can pick something else below."
Running: "Pulling"
Below it: "Something else"
Sub-lines: "Search Console, 412 rows, 29 Jul" / "queries.csv, 412 rows, 29 Jul" / "Sketched, not measured, 29 Jul" / "412 rows"
Expander: "Show all 14 data sets" and "Show fewer"

**Files.** `src/components/FlowsView.tsx`, `src/index.css`

## Phase 3: What the table says

**Goal.** A landed table produces a headline and two or three findings computed in plain TypeScript, shown on the card and in the panel, so a marketer never has to open 500 rows to know what to do.

**Why here.** This is the actual product gap and it is the largest single piece of work, which is why it sits third rather than first: it depends on the figure machinery from Phase 1 (a finding is a sentence wrapped around citable figures, not a separate vocabulary) and it is unusable without the Phase 2 fixes that get a table onto the card in the first place. Building it earlier would mean building a reader for tables nobody could land.

### readDataset: findings, computed, keyed off the pull id  `L`

**What.** Extend src/domain/datasetRead.ts with `readDataset(ds): DatasetRead` where DatasetRead is {ok, headline?, read?, period?, findings: Finding[], caveats: string[]} and Finding is {id, claim, detail?, figures: CitableFigure[], columnsUsed, rows}. Critically, a Finding carries BOTH the sentence and the citable figures it rests on, so the sentence is for humans and the figures are what travel and what a detector can match. Ids are content-derived so a dismissed finding stays dismissed. Claim families, all plain code, all keyed off the pull id parsed from source.query and never off header text: CONCENTRATION (top-10 share of the primary count column, suppressed below 10 rows and suppressed entirely when truncated, because a share of a capped table is not a share); RATE OUTLIER for gsc-queries, gsc-pages and li-posts (rate column against the denominator-weighted table average, excluding every row below floor = max(50, median(denominator)), at most three above and three below); PER-1000 for yt-videos (subs gained per 1000 views, floored at 500 views). Hard refusals in code with the reason in a comment: composite returns {ok:false, findings:[], caveats:[the sketched line]}, not findings with a warning; an upload or manual sheet returns ok true with a headline and totals only and NO findings, because the app does not know what population or period somebody's CSV covers; no trend claim from a single pull, ever; no comparison to channelMix.BENCH or channelRecords.BENCH. Floor constants live in one exported FLOORS object with a comment naming what each protects against.

**Why.** A table of 500 rows is not a decision and the app currently has nothing between the row cap and a 200 character free-text sentence. Computing it rather than asking a model is what makes the number defensible, keeps it working with no API key, and means the figure quoted on a canvas card and the figure quoted in an ad come from the same call.

**Done when.** Unit tests per family. (1) A gsc-queries fixture with a 3-impression row at 33% CTR produces no rate outlier finding. (2) The same fixture with truncated true produces no concentration finding at all. (3) A composite set returns ok false with zero findings and exactly one caveat. (4) An uploaded CSV returns ok true, a headline, and zero findings. (5) Every Finding's `claim` string contains no number that is not also the `value` of one of its own `figures`. (6) readDataset over a 500 row by 6 column fixture completes in under 20ms, since it runs inside the card render.

**Copy.** Headlines: "12,481 clicks" / "38,204 sessions"
Read clauses: "The top 10 pages are 58% of them" / "9 queries get a lot of views and few clicks"
Caveats: "This is the top 500 rows, so anything about the long tail is not in here."
"One pull is one snapshot. Nothing here says whether this is going up or down."
"Rates are only shown for rows above 50 impressions. Below that a percentage is noise."
"Every figure in this table was invented to show the shape. Nothing here can be read as a result."
"This is a file you uploaded, so we can add it up but we cannot tell you what period it covers."

**Files.** `src/domain/datasetRead.ts`, `src/domain/aggregator.ts`, `src/domain/__tests__/datasetRead.test.ts`

### The card face: what it is about, what it says, how old it is  `M`

**What.** In the data-source branch of the node render (FlowsView.tsx:6928 to 6975), replace MiniSheet with a three-line read when readDataset returns ok and a headline: line 1 the question and window resolved from source.query ("Landing pages from search, 90 days"), line 2 the headline plus the read clause, line 3 the provenance badge from datasetProvenance with an age tone (under 14 days plain, 14 to 45 muted, over 45 amber). Keep MiniSheet exactly as it is when readDataset returns not-ok, because a blank or manual sheet has nothing to read and the fill pattern is the honest picture of it. Memoise readDataset on `${ds.id}:${ds.rows.length}:${ds.source?.syncedAt}:${ds.editedAt}` so a drag frame does not recompute over 500 rows. At canvas zoom below 55%, do NOT enlarge the headline: hide the headline and keep the question, the badge and a tone dot, because the headline is a computed figure and its qualifiers live in the lines that would be hidden. Add the missing right-click items, which today offer a Data source card nothing but bundle and delete while the smart-object menu advertises "Open in its own tab".

**Why.** The card's most informative pixel today is a 50px grid of grey blocks meaning "this has data in it", and it is read on a wall of twenty cards at 40% zoom in a meeting. On the zoom rule: enlarging a top-500 figure while hiding its truncation caveat, its window and its age is the exact staleness failure this feature exists to prevent, rendered larger.

**Done when.** Screenshot test at 100%, 55% and 40% zoom. At 40% no bare number renders without its badge visible in the same card. The headline is hard clamped to two lines and a fixture with a very long finding does not make the card taller than its neighbours. A card holding a manual sheet still renders MiniSheet. Profiling: dragging a board of eight data source cards holds 60fps with 500-row fixtures.

**Copy.** Line 1: "Landing pages from search, 90 days"
Line 2: "12,481 clicks. The top 10 pages are 58% of them."
Line 3, fresh: "Search Console, pulled today"
Line 3, old: "Search Console, pulled 94 days ago"
Sketched card, line 2: "Sketched, not measured. Nothing to read from this one."
Deleted: "That data set was deleted"
Empty, unchanged: "No data set linked yet"
Right-click items: "Open the sheet", "Pull it again", "Unlink"

**Files.** `src/components/FlowsView.tsx`, `src/index.css`, `src/components/MiniSheet.tsx`

### The read panel: what this says, and what it does not say  `M`

**What.** One component src/components/DatasetRead.tsx rendered in two places: in the inspector ABOVE renderDataSourcePicker (FlowsView.tsx:5979), because the answer belongs above the question, and on DatasetPage above DatasetGrid so opening a table shows the reading first. Sections: headline block (headline, read clause, period, provenance, age); "What this says" using the existing .flow-src-opt row grid so it matches the panel below it, each finding with a muted line naming exactly which columns and how many rows it rests on; "What it does not say", capped at one visible line with a count that expands. Actions row: "Pull it again" (Phase 4), "Use this as the figure" (next item), "Open the sheet". Findings cap at four with a show-the-rest toggle so the source picker does not fall below the fold.

**Why.** This is where a table becomes a decision, and it is the only place a marketer sees both what was computed and what was deliberately not claimed. The caveats are capped rather than permanently open because a standing wall of amber trains people to skim past the one caveat that mattered, which the lens that proposed the wall said itself in its own anti-pattern list.

**Done when.** With a fixture set producing five findings, exactly four render plus a toggle, and the source picker's first action row is visible without scrolling at 900px viewport height. With a composite set, the findings section is absent entirely and the sketched caveat is the only content. Every caveat string round-trips through a no-dash assertion in the test suite.

**Copy.** Headings: "What this says" and "What it does not say"
Finding footnote: "From Clicks and Impressions, across 412 rows."
Caveat collapsed: "2 things this does not tell you. Open"
Empty read: "Nothing to read yet. There are no numbers in this sheet."
Upload: "We can add this up, but we do not know what period it covers, so nothing here is dated."
Composite: "Every figure in this table was invented to show the shape. Replace them with real data before anyone quotes them."

**Files.** `src/components/DatasetRead.tsx`, `src/components/FlowsView.tsx`, `src/components/DatasetPage.tsx`, `src/index.css`

### The figure field finally offers figures from the table the card is holding  `S`

**What.** Extend DirectionPresetSources in src/domain/directionPresets.ts with `datasetFigures?: {value: string; from: string}[]` and have `case 'figure'` (:101) push those FIRST, before the proof pool, under the group heading below. FlowsView passes citableFigures(linkedDs) mapped to {value: `${f.value} ${f.label}`, from: the period and source}. push() already dedupes case-insensitively. Exclude composite and edited sets from the dropdown, and say why in the group heading rather than silently offering fewer options. Add a "Use this as the figure" action on each finding in the read panel that writes the same string, clamped by buildDirection at capFor('figure') = 200 at a word boundary, so pass the short form of the claim and never the detail line.

**Why.** DIRECTION_KEYS['data-source'] = ['figure'] is the one field on this card that already reaches the writer, and its dropdown is populated from the brand's PROOF POOL, never from the table the card is literally holding. It is also the fastest fully honest path from a card to a cited number, because a value the user picked is a value the user asserted, which is the rule suggestOptionsHandler's docstring already states.

**Done when.** Select a Data source card holding a measured gsc-pages set: the figure dropdown's first group is the card's own table and its entries' values are a subset of citableFigures for that set. Swap the card to a composite set: the group is absent and the heading explains it. Pick an entry longer than 200 characters and assert the stored direction value is clamped at a word boundary and still contains the number.

**Copy.** Group heading: "From the table on this card"
Sketched heading, in place of the group: "Nothing from a sketched table can be offered here."
Action on a finding: "Use this as the figure"
After: "This card will now tell the writer to cite that number."

**Files.** `src/domain/directionPresets.ts`, `src/components/FlowsView.tsx`, `src/components/DatasetRead.tsx`

### Does this table measure the thing you said you would move  `S`

**What.** In the read panel, call kpiMeasurement(clientProfiles[brand]?.businessKpi, connectedServiceIds) from src/domain/analyticsSources.ts and render at most one sentence. Three outcomes and nothing at all when the KPI maps to no source. The copy must claim only what the function actually does, which is a word match, never a measurement relationship: sourcesForKpi is a substring stem match, so 'Paid clicks', 'Email clicks' and 'Ad clicks' all contain 'click' and all resolve to Search Console.

**Why.** Three lines calling machinery that has shipped since the Brand goal panel and has exactly one caller, answering the most useful framing question there is. The narrow wording is what makes it safe: a stem match can honestly say a word matched, and cannot honestly say a channel measures a goal.

**Done when.** Set businessKpi to 'Paid clicks' with Search Console connected and assert the rendered sentence says the word matched and does not claim the goal is measured. Set it to 'Leads' with nothing CRM connected and assert the gap sentence names the CRM connector. Set it to a string matching no stem and assert nothing renders.

**Copy.** match: "Your brand goal mentions clicks, and this table counts clicks."
gap: "Your brand goal is set on Leads. Nothing here counts those. A CRM connection would."
nothing: renders nothing at all

**Files.** `src/components/DatasetRead.tsx`, `src/domain/analyticsSources.ts`

## Phase 4: How old is this number, really

**Goal.** A pulled table knows what period it actually covers, says how old that is, holds its figures back once its own window has closed, and can be pulled again in one click without losing what was there.

**Why here.** Staleness is the failure mode that produces the most convincing wrong copy, because a stale figure is a real figure that passes every check except the one about time. It sits fourth rather than earlier because it only becomes dangerous once figures travel (Phase 1) and once the card presents them confidently (Phase 3). The coverage probe leads the phase because every other item in it keys off a date, and syncedAt is the wrong date.

### Coverage, not sync time  `M`

**What.** syncedAt records when we asked, not what we got, and three mechanisms break the assumption that they are the same: Search Console lags two to three days while the direct route requests endDate today (server/channelPull.ts:89), GA4 direct requests endDate 'today' which is a partial day (:126), and the warehouse runs `date_day >= current_date - INTERVAL ${days} DAY` against a Fivetran mart with no freshness check anywhere in the handler, so a connector that broke in May still returns rows and gets stamped now. Add a coverage read to every pull: for the warehouse, select max(date_day) alongside each pull; for GA4 and GSC direct, read back the response's own date range; for li-posts, take the max of the Posted column. Persist `coverage?: {from: string; to: string}` on the aggregator arm of DatasetSource. Build every period sentence from coverage when present and say coverage is unknown when it is not. Never say "the last 90 days" when what was returned ends four days ago.

**Why.** This is the plan's flagship honesty claim and the one most likely to be false. A broken warehouse sync currently reads as this morning's data, at every surface, in every lens's design.

**Done when.** Unit test: given a pull response whose rows end 5 days before syncedAt, datasetProvenance().periodLabel names the coverage end date, not today. Given a response with no date column and no probe result, periodLabel is undefined and the panel says coverage is unknown rather than assuming the requested window. Integration against a real Summer mart: run one pull, assert the stored coverage.to matches max(date_day) from the same query.

**Copy.** With coverage: "Search Console, the 90 days to 25 July 2026"
Without: "Search Console, we asked for 90 days. What came back does not say what it covers."
On the card: "Search Console, to 25 Jul"

**Files.** `server/aggregatorHandler.ts`, `server/channelPull.ts`, `src/domain/brandDataset.ts`, `src/domain/datasetRead.ts`, `src/components/AggregatorConnect.tsx`

### Pull it again, in place, with an undo  `M`

**What.** Add `parsePullQuery(q)` to src/domain/aggregator.ts returning {pullId, days} from 'gsc-pages:90d'. Add a store action `refreshBrandDataset(id, columns, rows, source)` next to importBrandDataset (useTrafficStore.ts:3533) that REPLACES the grid on the SAME dataset id, so the card's refId, every other card pointing at it, and every stored figure id stay valid. Add a Refresh row at the top of the picker and on the read panel when the linked set is an aggregator set with a query, mounting AggregatorConnect pre-narrowed to the stored provider, service, pull and window (add initialPull, initialDays and runOnMount props). Before landing any new pull, look for an existing set on this brand with the same source.query and offer to refresh it rather than making a second copy. Keep the replaced rows in component memory for the session and render an Undo, because a click that destroys the table somebody was reading with no way back is how a marketer loses an afternoon. Never auto-refresh on open or on a timer: /api/aggregator has no auth and a 40-per-minute counter that lives in module scope and resets on every cold start.

**Why.** source.query and syncedAt are both written on every pull and read by nothing. Refreshing in place rather than duplicating is also what makes a data set safe to reuse: a set bundled into a smart object and placed on four campaigns gets refreshed once instead of spreading one stale number to four places.

**Done when.** Refresh a set held by three cards and assert all three cards render the new row count and none has a changed refId. Click Undo and assert the grid returns to the previous rows and the previous coverage. Trigger a pull whose source.query matches an existing set and assert the collision prompt renders and no second set is created unless the user picks the second option.

**Copy.** Row: "Pull it again" / "Same question, same window, fresh numbers"
Running: "Pulling"
After: "Updated. 431 rows, was 412." with "Undo"
Nothing came back: "Nothing came back. The table on the card is unchanged."
Shared: "This data set is on 3 campaigns. Pulling it again updates all of them."
Collision: "You already have this one, pulled 6 days ago. Refresh that instead of making a second copy?" with "Refresh it" and "Make a new one"

**Files.** `src/domain/aggregator.ts`, `src/store/useTrafficStore.ts`, `src/components/AggregatorConnect.tsx`, `src/components/FlowsView.tsx`, `src/components/DatasetRead.tsx`

### Staleness derived from the window the user picked, and the citability gate  `S`

**What.** In datasetProvenance, treat a set as stale once now minus coverage.to (falling back to syncedAt) exceeds the window in source.query, so a 30-day pull expires in 30 days and a 365-day pull in a year. A magic 90 is a number nobody can defend to a user. A stale set drops to citable false, so citableFigures returns [] and its numbers stop reaching the writer until it is refreshed. The card's age line goes amber and the panel says which window closed and when.

**Why.** A number that was true in March being quoted in July, with no signal, on a card whose entire claim is that it was measured, is the single most convincing wrong thing this feature can produce. Deriving expiry from the window the user chose is principled and costs nothing, because both values are already stored.

**Done when.** Unit tests: a gsc-pages:30d set with coverage.to 40 days ago returns tier 'stale' and citable false; the same set at 20 days returns 'measured' and citable true; a gsc-pages:365d set at 40 days returns 'measured'. Integration: build a campaign wired to a stale set and assert the request's datasets array is empty and the contribution panel names the reason.

**Copy.** Card, amber: "Search Console, 90 days to 14 Mar. Old now."
Panel: "This covers the 90 days to 14 March 2026, and that window closed 137 days ago. Its numbers are held back until you pull it again."

**Files.** `src/domain/datasetRead.ts`, `src/components/FlowsView.tsx`, `src/index.css`

### Persistence failures stop being silent  `S`

**What.** saveBrandDatasets (useTrafficStore.ts:678) swallows quota failures with an empty catch. Make it return a boolean, and have importBrandDataset, refreshBrandDataset, setDatasetCell and deleteBrandDataset roll the in-memory state back and call setBrandNotice when the write fails. Also measure the ceiling first: pull ten real 500-row tables and record the serialized size of stoplight.brandDatasets.v1, and if a single brand's sets can plausibly exceed the quota, cap stored rows per aggregator set at the point where the read still works and say so on the card.

**Why.** Once refresh-in-place ships, a failed write means memory reports "Updated. 431 rows, was 412" while disk still holds the old table, so the next reload quotes the OLD numbers under the NEW pulled-today label. The refresh feature manufactures a stale-as-current case that does not exist today.

**Done when.** Stub localStorage.setItem to throw QuotaExceededError, run a refresh, and assert (a) a brand notice renders, (b) the in-memory rows are the pre-refresh rows, and (c) a page reload shows the same table the UI showed. A written note in the PR records the measured serialized size of ten real 500-row tables.

**Copy.** "Could not save that table. There is no room left in this browser's storage. Delete a data set you no longer need and pull it again."

**Files.** `src/store/useTrafficStore.ts`

## Phase 5: Check it, and let it travel

**Goal.** A number in finished copy can be traced to a table or it gets flagged, and a figure worth reusing can become a proof point without laundering away everything that made it trustworthy.

**Why here.** Enforcement goes last on purpose. detectUnsourcedFigures cannot be tuned against real output until figures actually travel, and a check that cries wolf on 24/7 support gets ignored and then the real one is ignored too. The proof point path goes last because it is the single largest laundering route in the whole design and it is blocked on a product decision (the proof pool is sent unfiltered today) that is not this feature's to make unilaterally.

### A coherence check for a figure with no table behind it  `M`

**What.** Add detectUnsourcedFigures(rows, vocab) to src/domain/coherenceChecks.ts and register it in detectStructuralBreaks (:555). Extend CoherenceVocab (:32) with `citableValues: Set<string>` (every normalized CitableFigure.value for every data set wired to this campaign, plus every Rtb.metric in the proof pool) and `datasetsWired: boolean`, populated in buildCoherenceVocab (:79). Scan fieldsOf(row) for percentages and multiples only to start, normalize by stripping commas, spaces, currency symbols and trailing zeros, and raise a break on the EXISTING axis 'claim' (AXIS_META.claim already reads "A financial or performance claim with no proof to back it"; adding a new BreakAxis white-screens BreakCard). Skip prices, dates and version strings, skip any number that appears verbatim in the campaign subject or a wired Message card's angle, and ship it under the same one-break-per-asset rule the other detectors use. Do NOT copy detectFinancialClaims's `if (assetRtbIds(row).length > 0) continue` skip: an attached proof point is not evidence that a number was measured.

**Why.** The payload constrains what the model can quote and the prompt tells it what it may do; this is the only thing that catches it doing otherwise, deterministically, with no key and no model cost. It also catches the case the payload cannot: a human typing a made-up number into the copy grid.

**Done when.** Run over a corpus of at least fifty real drafted assets from existing campaigns and record the false positive rate; ship only if it is under one in twenty. Assert it fires on an asset containing 4.1% when no data set is wired, does not fire when 4.1% is a citable value, and does not fire on 24/7 or on a price.

**Copy.** headline: "A number with no table behind it"
why: "4.1% does not appear in any data set wired to this campaign, and no proof point carries it either. A number in copy has to be one somebody can point at. Wire the table it came from, or take the figure out."
variant when nothing is wired: "4.1% appears in this copy and this campaign has no data set wired to it, so this number came from nowhere."
suggestedFix.after: the field text with the number replaced by "[figure, wire the table it came from or remove]"

**Files.** `src/domain/coherenceChecks.ts`, `src/store/useTrafficStore.ts`, `src/domain/datasetRead.ts`

### Which figures actually landed, per asset, computed not self reported  `M`

**What.** After a build, for each drafted row, compare its component strings against the campaign's citableValues and record `figuresUsed?: string[]` on TrafficRow (the ids of the citable figures whose values appear verbatim). Render a small line on the asset inspector naming the table each one came from. Do NOT ask the model to return figureIds: a model can cite a figure it did not use and use one it did not cite, so a self-report rendered as provenance is a guess laundered into an audit trail.

**Why.** The marketer's actual question after wiring a card is "did that do anything", and today there is no answer anywhere. Computing the match rather than trusting a schema field means the answer is true by construction and costs one string search per component.

**Done when.** Build a campaign with one wired measured set. Assert that every asset whose copy contains a citable value has that figure's id in figuresUsed, and every asset whose copy contains none has an empty array. Hand-edit a figure out of an asset's copy and assert the line disappears on the next reconcile.

**Copy.** "Uses 1,240 clicks, from Landing pages from search, Search Console, the 90 days to 25 July 2026."
When none: "None of the figures from the wired tables made it into this one."

**Files.** `src/domain/types.ts`, `src/store/useTrafficStore.ts`, `src/components/FlowsView.tsx`

### A figure becomes a proof point, after the approval gate is made real  `M`

**What.** Two changes, strictly in this order. FIRST: filter the proof pool on approval. draftCopy builds `const proofPool: Rtb[] = sys.rtbs` (useTrafficStore.ts:6323) and previewFlowCopy does the same, with no isApprovedProof filter anywhere, and SYSTEM tells the model "When a proof point has a metric, state it". So approved:false does nothing on the path that matters, and any "make this a proof point" action shipped before this is a one-click route from an app-computed number to a stated claim in published copy that no human read. SECOND, only once that lands: add "Make this a proof point" to each finding, routing through the same ensureProofRef path the chat's createProof uses (FlowsView.tsx:4084), with label from the claim, metric from the figure value, source from the provenance sentence including the period, approved false, and new Rtb fields `fromDatasetId` and `figurePeriod` so the guardrails are not stripped on the way in. The card is created and wired by emitting the existing createObject plus connect commands through applyBoardCommand, so the wiring rule has one enforcement path. Disabled for composite, edited and stale sets.

**Why.** A real figure from a real table is the best proof point a brand can have, and there is currently no route from one to the other. But Rtb carries only label, detail, metric and source: no period, no partial flag, no dataset id. Without the pool filter and the two new fields, one click permanently strips truncation, window, staleness and edit state from a number that is then reusable on every future campaign for that brand.

**Done when.** Part one: assert draftCopy's sentProof excludes every Rtb where isApprovedProof is false, verified by a unit test over a fixture library containing both. Part two: create a proof point from a finding and assert the stored Rtb carries fromDatasetId, figurePeriod and approved false; assert the action is disabled with a stated reason on a composite, edited or stale set; assert the new card appears on the board wired to the same target as the Data source card and the applied report names both.

**Copy.** Action: "Make this a proof point"
After, wired: "Added a proof point with the number and where it came from, wired the same way this card is. Approve it before anyone quotes it."
After, unwired: "Added a proof point. It is not wired to anything yet, so nothing reads it."
Disabled reason: "Only a measured, current table can become proof. Pull this one again first."

**Files.** `src/store/useTrafficStore.ts`, `src/domain/rtb.ts`, `src/components/FlowsView.tsx`, `src/components/DatasetRead.tsx`

### Gretel can link an existing data set, and stops making empty cards  `S`

**What.** Give createRecordForKind (FlowsView.tsx:2700) a 'data-source' case that resolves an EXISTING brand data set by name and never creates one, and add 'data-source' to CREATABLE_KINDS with that semantics recorded in the comment. Add a `datasets` array to FlowAgentContext (src/domain/flowAgent.ts), brand-scoped, one entry per set as {name, question, window, rows, measured, coverage}, taken straight from datasetProvenance and the parsed query. Add a linkData {ref, dataset} op to COMMAND_SCHEMA and applyBoardCommand, resolving by name among this brand's sets and following with attachToCampaign when the card is attached, with a real skipped reason when it misses. Adding the board snapshot to FlowAgentContext is deliberately OUT of scope here: it is the single biggest correctness win available in the chat and it deserves its own PR reviewed by people who care about the chat.

**Why.** Gretel can already create a Data source card and can never fill it, because createRecordForKind falls to default and returns null, so an agent-built card always lands empty while the applied report says "Added a data source card". Letting her mint a blank four-column spreadsheet would be worse than an empty card, so linking is the only correct semantics.

**Done when.** Ask Gretel to add a data source card for an existing set by name and assert the card lands with refId set to that set. Ask for a set that does not exist and assert the command lands in `skipped` with the sentence below, and no empty card is created. Assert context.datasets never contains a set from another brand and never contains the rows.

**Copy.** Skipped: "No data set called Top landing pages on this brand. Pull or upload one, then link it."
Skipped: "That card is not a Data source card."

**Files.** `src/domain/flowAgent.ts`, `server/flowAgentHandler.ts`, `src/components/FlowsView.tsx`

## The writer's rule for tables

```
Add these three paragraphs to SYSTEM in server/copyDraftHandler.ts, immediately after the "PROOF CARRIES ITS NUMBERS" paragraph at line 81, verbatim:

A TABLE IS EVIDENCE, NOT A CALCULATOR. A campaign may carry data sets. You never receive the table. You receive a short list of FIGURES the app has already computed from it, and each figure carries the exact string to use, what it counts, the period it covers, and where it came from. State a figure only by using its value exactly as given, character for character. Do not add, subtract, total, average, rank, convert, annualize or round anything, because a number you worked out yourself was not measured, however simple the arithmetic looked. If the number you want is not in the list then you do not have it, so write the asset without it rather than reaching for one that sounds right. A figure marked partial was taken from part of the table and not from all of it, so never call it a total, a share of everything, or a first place overall.

EVERY FIGURE IS DATED AND ATTRIBUTED. Each figure carries the period it describes, for example the 90 days to 14 March 2026, and that is the only period it describes. Never write currently, today, right now, this month, so far this year, we are seeing, or any other present tense frame around a figure. Never project one forward, never turn a count for a period into a rate, and never compare it to a period you were not given. A figure with no period, which is what an uploaded file gives you, may be stated but must never be dated. Each figure also carries a source. If the copy attributes the number at all, attribute it to that and to nothing else: never dress an internal figure as an industry benchmark, a market statistic, a study, a survey or somebody else's research, and never name a platform, a research house, an analyst or a customer that the source line does not name.

HOLDING A DATA SET IS NOT A CLAIM. Do not write that the brand tracks, monitors, measures, tests, has studied or has proven anything on the strength of a table existing. Do not describe a trend, a rise, a fall, a pattern or a leader unless a figure you were given says exactly that. Do not write the data shows, our research found, analysis reveals, or their equivalents. A row label is a label: a search query, a page title or a video name inside a figure is not a customer, not a quote and not an endorsement.

And append this block to userContent (server/copyDraftHandler.ts:217), after the messages block:

${datasetList.length ? `\n\nFIGURES from the data sets wired to this campaign. The app computed every one of these from real cells, you did not, and you may not compute another. Use each value verbatim, honour its period and its source, and treat any figure marked partial as drawn from part of the table rather than all of it:\n${JSON.stringify(datasetList, null, 2)}` : ''}

Three notes on the implementation, all load bearing. First, `datasets` must be named in the destructure at copyDraftHandler.ts:101 or the whole field vanishes with no error, no log and no test failure, which is the documented hooks bug. Second, the no-dash pass must skip every figure's `value`: rewriting a dash inside 2026-03-14 or 35-44 corrupts the figure, which is the same exception fillCardHandler already makes for AGE_RANGES. Third, a sketched data set is never mentioned in this prompt at all, in any framing. It is excluded at poolsFrom and again inside citableFigures, and it gets no measured:false flag and no forbidding sentence, because naming a model-authored table in order to forbid it puts its name and its topic in the context window for no benefit.
```

## Deliberately rejected

- **Four separate analysis modules: datasetRead.ts, datasetFigures.ts, datasetDigest.ts and datasetStats.ts**  
  Four lenses proposed four differently named, mutually incompatible modules for one job and none acknowledged the other three. They disagree on whether the writer gets findings, figures or rows, and on whether an upload can be read at all. Shipping any two produces two definitions of what a table says, which is the exact drift boardResolve.ts was written to end. Collapsed into ONE file, src/domain/datasetRead.ts, where a Finding carries both its human sentence and the CitableFigures it rests on, so the sentence is for people and the figures are what travel and what a detector can match.

- **A recommended pull derived from the campaign's goal KPI (Lens 1 proposal 1)**  
  Verified broken. sourcesForKpi is a substring stem match over ANALYTICS_SOURCES in array order, so 'organic sessions' matches GA4 on 'session' and Search Console on 'organic' and GA4 wins on position. The proposal's own flagship copy names Search Console while its own algorithm picks GA4. Nine of the eleven GTM strategies map through defaultKpiForStrategy to a CRM KPI that is not pullable at all, so the recommendation falls to 'it is what you have connected' most of the time. A reason-shaped sentence with no reason in it, under a primary button, reads as the app having thought about it. Kept the one-tap default, dropped the goal join and the causal sub-line.

- **POST /api/read-dataset, a model layer that narrates the table**  
  A new handler, a new json_schema, a client adapter, a NO_KEY fallback, a content-hash cache and an outbound validator that checks every digit run against the findings text, for a feature that shipped days ago and that no user has touched. The deterministic reader has to exist and be trusted first. It also sits behind a rate limit that is a module-scope array of 40 timestamps resetting on every cold start, with AI on in production. Revisit when users say the arithmetic is not enough.

- **Supersede chains, persisted baseline maps, per-key mover findings and MetricSnapshot writes on every pull**  
  A time series product bolted onto a canvas card, requiring infrastructure that does not exist (no scheduler, no cron, migration 0005 still unapplied) and depending on a human remembering to pull the same question at the same window weeks apart, twice. It writes 15 to 20KB per set through a save path that swallows quota failures, and the per-key movers are mostly the rolling window rolling rather than anything the marketer did. Writing totals from a truncated pull into a snapshot series would also put a capped number into a chart as a measurement with no caveat travelling alongside it.

- **A within-table trend for li-posts, split at the window midpoint**  
  It measures time since publication, not performance. LinkedIn post metrics accumulate after publishing and the pull groups by created_at day, so a post published 3 days before the pull has had 3 days of exposure and one published 85 days before has had 85. The midpoint split systematically depresses the recent half and reports a decline on a healthy account. Separately, li-posts is warehouse only (linkedin is implemented:false and channelPull has no branch), so it is the least reachable of the six questions.

- **The position band finding (rows at average position 4 to 20) and the ga4-channels split gap framed as which channel deserves next month's effort**  
  Average position is a term the marketer has to be taught before the finding can be read, which makes it a lesson rather than a finding. The split gap arithmetic is defensible but the framing converts GA4 last-click session credit into causal contribution, which is the classic way analytics defunds the channel that created the demand. Compounding it, GA4 Conversions is whatever that property marks as a key event and is frequently a pageview.

- **figureIds returned by the model, figureMap on TrafficRow, dataset tombstones and reconcileDatasetCitations**  
  An entire citation-audit subsystem built on the model's self-report about its own behaviour, which the proposing lens conceded is not a fact. An audit trail that is wrong is worse than none because somebody will trust it. Replaced with a computed check: after a build, search each asset's components for the citable values verbatim and record what actually landed.

- **Confidence tiers of low, medium and high on every finding**  
  Marketers do not calibrate, they either use a number or they do not. A medium confidence finding is one you are not willing to stand behind, so it should not be shown. If 41 rows is not enough to say something, the floor should suppress the finding rather than label it.

- **Rebuilding DatasetGrid with click-to-sort, column totals, thousands separators and virtualization**  
  Google Sheets is better at this and took a team years. Sorting an index-keyed editable grid is a correctness trap whose own proposed mitigation is to disable editing while sorted, which makes the grid worse for the manual sheets that are its actual users. The reading panel on that page is the valuable half. Add a CSV export instead if people want to sort.

- **A permanently open, uncapped 'What it does not say' / 'Held back' list**  
  The lens that proposed it also wrote the anti-pattern that a standing hedge trains users to skim past the warning. Five amber lines standing beside three findings gets ignored in about two sessions, and then the one caveat that mattered goes past too. Kept the heading and the honesty, capped the visible surface at one line with a count. Also dropped the label 'Held back', which sounds like the tool is withholding something on purpose.

- **Sending a composite table's name, columns and row count with a measured:false flag and a SYSTEM rule forbidding its use**  
  The row count is an artefact of a prompt asking for eight to twelve rows, the columns are frequently the claim in schema form (Revenue lift after switching), and the name is deliberately styled to look like a real export because composeDatasetHandler forbids the words sample and mock. Given all three, a copywriter writes 'we track open rate by segment and the pattern is clear' having quoted nothing. Excluded at poolsFrom and again inside citableFigures, with silence in the prompt.

- **Explaining the single-hop record rule in the UI ('Instructions travel along a chain, records do not')**  
  That is an engineer explaining a graph traversal to a marketer, who will read it, not understand it, and conclude the tool is broken. If a data set wired into a Message card contributes nothing, the UI says where to draw the line instead and stops there.

- **Rewriting the warehouse SQL aliases to pin the column contract**  
  It changes three working Summer queries to serve a reader that does not exist yet, admits it needs a real query run to confirm the column even exists as a count, and creates two column vocabularies in the wild since old sets keep old headers. The proposal's own mitigation, keying every reader off the pull id parsed from source.query and never off header text, is the correct fix and makes the SQL change unnecessary. Took the mitigation, skipped the migration.

- **'Keep this reading' writing a BrandReport, and building the missing addReport action**  
  BrandReport has a type, a loader, a saver, a state field, a viewer and a nav tab, and no producer anywhere in src, because its producer was the deleted HomeChat. Building a producer for a viewer nobody feeds is how you get two dead surfaces instead of one. The reading is deterministic, so it is reproducible on demand, which is the actual need behind 'let me see it again next week'.

- **An .xlsx decoder**  
  A decoder is a dependency and a maintenance surface for a problem that clipboard paste solves in about thirty lines against a parser that is already written. The refusal message was rewritten to point at paste instead of sending people to Excel's File menu.

- **Adding the board snapshot to FlowAgentContext as part of this workstream**  
  Real and probably the single biggest correctness win available in the chat, which is exactly why it should not ride in on a data source change reviewed by nobody who cares about the chat. Kept the narrow half (createRecordForKind links an existing set, a datasets array, a linkData op) and moved the objects snapshot to its own PR.

- **A canvas-wide data-lod zoom system, and enlarging the card headline at far zoom**  
  Level of detail applies to all eleven card kinds or none; scoping it to Data source cards means the board reads at 40% for one kind and not the others. And the specific proposal was backwards: enlarging a top-500 figure to 22px while hiding the truncation caveat, the period and the age renders the staleness problem larger. At far zoom the card keeps the question, the badge and a tone dot, and drops the headline.

## Open questions, for you not me

- Nobody has used this. All four routes shipped days ago on PR #161 and not one of the thirty-one source proposals cites an observed user problem, a support question or a real pull anyone ran. Before Phase 3 starts, put the shipped feature in front of one marketer, watch them try to answer one question about their own campaign, and let that reorder the phases.
- Email and CRM are the real coverage gap and every lens deferred them. ANALYTICS_SOURCES already lists both, and the crm stems (lead, donat, revenue, member, purchase, meeting) are where the decisions actually are for these campaigns. Six questions that cannot answer 'where do leads come from' is a product problem no reading layer fixes. Is this a seventh and eighth question, or is it the next feature?
- Should the 500 row cap be 25? Every proposal accepts 500 and then builds machinery to summarize it. Pulling the top 25 by the primary metric would make the card readable, make the payload trivial, remove the truncation honesty problem for most questions, and cost one number in the SQL. It also removes the long tail entirely, which matters for gsc-queries specifically.
- Should 'Describe one instead' exist at all? It is the one route that can put an invented figure in front of a client, and this plan spends five separate rules containing it. Nobody asked whether the containment is worth more than the route.
- Should an unapproved proof point ever reach the copy writer? draftCopy sends sys.rtbs whole today and isApprovedProof is decorative. Fixing that changes behaviour for every existing campaign, not just data source work, so it is a product call rather than a refactor.
- What is the localStorage ceiling in practice? stoplight.brandDatasets.v1 holds every set for every brand in one key and the save path swallows quota failures. Somebody should pull ten real tables and look at the serialized number before Phase 4 adds coverage and rowCount to every set.
- The OAuth return path is not plumbing. api/[...path].ts:120 hardcodes the callback redirect to the pilot URL, so connecting Google in local dev throws you off localhost. Threading a return param means encoding it into the OAuth state, which currently carries the workspace id. It needs its own change and its own dev story, and Phase 2 deliberately does not include it.
- Which two nouns survive? This plan uses 'data set' and 'figure' in the UI and keeps reading, digest, finding, table and sheet out of it. If the read panel and the contribution panel end up owned by different people, that discipline is the first thing to slip.
