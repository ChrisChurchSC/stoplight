# Deliverable and Asset card inspectors: a plan

_Breadcrumbs. Drafted 2026-07-30, covering the five areas: presets, custom output, connected to, comment, generate outputs._

## What these two panels are for

A marketer opens a Deliverable card to decide what gets made and how much of it, and opens an Asset card to read, fix and ship one post. Both panels answer the same five questions in the same words: what kind of thing is this, what is it made of, what is connected to it, what is my team saying about it, and write it. Nothing in either panel claims something happened that did not, and no button destroys a sentence a person typed without saying so first.

## Principles

- A deliverable is the spec, an asset is one instance of it. A control that changes the shape of every asset under a deliverable lives on the deliverable. A control that changes one asset lives on the asset. Where the two panels differ, this rule is the reason.
- The inspector is where you author, the card is the view of what was chosen. The only new thing on a card face in this whole plan is an unresolved discussion count, because an unanswered question has to be visible from across the board.
- Options are buttons with a check on the active one, never a dropdown. flow-src-opt plus flow-src-tick for short options, flow-bp-pick where an option needs a summary line. The last native select on this surface (build-mode Audience, FlowsView.tsx:8658) goes with this work.
- Order each panel by how often a hand lands on it. Copy first on an asset, count and Generate first on a deliverable, format last. Do not give the two panels the same order for the sake of symmetry: it puts the thing you came for below the fold on the panel you open a hundred times a week.
- Silence is not an empty state, but a sentence is not free either. Every wiring and generation block gets a sentence when empty, because there silence reads as broken. Component lists and readouts stay quiet.
- Refuse before you change anything. A refusal that arrives after the copy has been cleared is a deletion with an explanation attached.
- The panel must agree with the writer, which means sharing its code, not copying its shape. Direction chains through the graph and records do not, and that asymmetry is deliberate (see the header on wiredRefsFor in src/domain/boardResolve.ts). Any readout that claims completeness calls the same function draftCopy calls.
- One sentence per fact. draftCopy only fills empty components and regenerateFlow wipes first. Both are true of different functions, and shipping both sentences makes one of them a lie whichever the user reads first. The button's own sentence governs, because the button is what they press.
- Say what generation costs in work, not in money. It clears copy, including copy a person typed, and undo puts it back until the page reloads. That is a true, checkable statement. A credit delta on a shared account balance is not.
- No em dashes and no en dashes in any string, including the five already on this surface (FlowsView.tsx 2686, 2687, 8331, 8336, 8467).

## The panels, in order

**Deliverable**

1. Title and sub-line: preset tile, deliverable name, unresolved discussion count, close. Sub-line reads real names and a count, for example "Website · Product / feature page · 4 posts"
2. Assets (existing count stepper, typed count, staged Apply)
3. Generate
4. What each post contains
5. Connected to
6. Format and pattern (collapsed disclosure)
7. Discussion

**Asset**

1. Title and sub-line: preset tile toned POST_TONE, asset name, unresolved discussion count, close. Sub-line reads channel label, audience, and a clickable date. Second row is a "Part of {deliverable}" button
2. Copy
3. Generate
4. Ready to ship
5. Schedule and budget
6. Connected to
7. Pattern
8. Swap for a live post (collapsed disclosure)
9. Discussion

## Phase 1: Stop it lying, and stop Generate deleting work

**Goal.** Make every claim the two panels are about to make true, and fix the one live bug on this surface that destroys a user's copy. Nothing here is a new section; it is the foundation the other five phases stand on.

**Why here.** First because every button, badge and readout in phases 2 to 6 is a claim resting on these five items, and shipping a claim before its enforcement is exactly the failure the house rule forbids. It is also the only phase that fixes a bug users hit today with the shipped toolbar button, so it has value even if the rest of the plan never ships. All five items are S or M and touch no new UI surface, so the value per unit of effort is the highest in the plan.

### Refuse before the wipe  `M` · generate-outputs · both

**What.** Extract draftCopy's two hard boundaries into one exported selector on the store, copyBlockerFor(campaign): string | null, built from isBrandless / isDraftBrand and hasWiredContext(boardFor(flowBoards, campaign)) exactly as useTrafficStore.ts:6415-6432 does, returning the identical sentence setBrandNotice already uses so the two cannot drift. In regenerateFlow (FlowsView.tsx:2635-2652), call it AFTER the existing saveFlowBoard(boardSnapshot(boardKey)) flush and BEFORE the messaging wipe, and return early with the reason when it is non-null. Keep the checks inside draftCopy as the backstop, because SheetGrid.tsx:358, CopyReview.tsx:326 and agentBridge.ts:595 all call draftCopy without going through the panel.

**Why.** Today regenerateFlow clears messaging on every target, then draftCopy `continue`s past a brandless or unwired campaign, and at useTrafficStore.ts:6930 sets lastCopySource to null so even the offline banner stays hidden. Pressing Generate on an unwired campaign deletes every asset's copy, writes nothing back, and explains itself only in a notice rendered by Breadcrumb.tsx:196-203, a different component. Every Generate button in phases 2 and 3 makes this worse by putting the trigger closer to the copy.

**Done when.** On a built campaign with 4 assets that have copy and no connector targeting the brief or any deliverable, pressing the toolbar Generate leaves all 4 messaging maps byte-identical and renders the unwired sentence in the panel. A unit test asserts copyBlockerFor returns the unwired string for a board whose connectors all point at cards, and null once one connector targets 'campaign'.

**Copy.** Not bound to a brand: This canvas is not bound to a brand, so there is no voice or proof to write from. Bind it to a brand first.
Nothing wired: Nothing is wired up on "Summer launch" yet. Draw a line from a card to the campaign brief, or to one deliverable, so there is something to write from.
Added under both: Nothing was changed.

**Files.** `src/store/useTrafficStore.ts`, `src/components/FlowsView.tsx`, `src/components/ChangelogPage.tsx`

### Stamp the writer on each row, and stop the dedupe pass laundering a fallback  `M` · generate-outputs · both

**What.** Two changes in one commit. First, add copySource?: 'claude' | 'heuristic' and copyAt?: number to TrafficRow (src/domain/types.ts) and set them in draftCopy's patch (useTrafficStore.ts:6895-6900) from the group's result.source. Second, fix dedupeCampaignDrafts (useTrafficStore.ts:229-272): it re-calls copyWriter.draft per colliding unit and assigns d.components = re.drafts[0].components while discarding re.source, and copySource was already fixed at 6847 before dedupe runs at 6851. ClaudeCopyWriter catches every failure and never throws (draftWriter.ts:239-249), so the catch at 265 is effectively dead. Return the set of rowIds whose components came back from a heuristic re-draft and mark those rows accordingly.

**Why.** A fallback re-draft can replace Claude copy with template copy up to three times per run while the run still reports 'claude'. Separately, lastCopySource is one workspace flag that is never cleared when a run starts and renders on any canvas, so generating campaign A offline puts a banner over campaign B saying its copy came from templates. Phases 2 and 3 put a per-asset badge on this data, which converts a vague false claim into a specific one on a named card unless the stamp is right first.

**Done when.** With the API key unset so every run falls back, generating a deliverable of 4 assets leaves all 4 rows carrying copySource 'heuristic'. A unit test on dedupeCampaignDrafts asserts that when the injected writer returns source 'heuristic' for a re-drafted unit, that unit's rowId is in the returned fallback set. The workspace banner's first sentence changes from a claim about this copy to a claim about the last run.

**Copy.** Banner, corrected until per-row badges land: The last generation fell back to the offline writer. It could not reach the model, so that copy came from templates built out of your own brand and audience. Generate again to retry.

**Files.** `src/domain/types.ts`, `src/store/useTrafficStore.ts`, `src/adapters/copy/draftWriter.ts`, `src/components/FlowsView.tsx`

### A row that was asked for and did not come back  `S` · generate-outputs · both

**What.** draftCopy iterates result.drafts (useTrafficStore.ts:6862) and patches only the rows it finds, so a row the model omitted is skipped in silence after regenerateFlow already wiped it. Track asked minus written inside the existing loop. For each omitted row: raise recheckFlag with reason 'It came back empty', and clear figuresUsed and rtbMap in the same pass. Do not add a lastRun store object and do not name a cause the client cannot observe.

**Why.** Batch generation is one POST per campaign with every asset in one array, so a partial return is the normal failure mode, not an edge case, and vercel.json's 60s maxDuration against maxTokens of assetCount * 1500 makes a large campaign the most likely case. Worse, because the row is never patched, figuresUsed and rtbMap survive from the previous write while messaging is now empty, so the asset panel in phase 2 would render "Figures it uses, 2" listing figures that appear in no text at all. That defeats the stated design of figuresUsed (types.ts:152-157, recomputed on every draft so a number removed by hand stops being claimed).

**Done when.** With a stubbed writer that returns drafts for 3 of 4 requested rows, the omitted row ends the run with empty messaging, recheckFlag set, figuresUsed undefined and rtbMap empty, and the amber dot renders on its card via the existing path at FlowsView.tsx:7590-7592 without any new canvas code.

**Copy.** Card tooltip, reusing the existing recheckFlag shape: Out of date. It came back empty. Generate to bring it up to date.

**Files.** `src/store/useTrafficStore.ts`

### Fix the three website presets that seed as a Homepage, and add the test that stops it recurring  `S` · presets · deliverable

**What.** DELIVERABLE_PRESETS carries website:product, website:solutions and website:comparison (src/domain/flows.ts:101,103,104) while CHANNEL_TYPES.website holds only homepage, page, pricing and about (src/domain/channelAssetTypes.ts:54), so seedCampaignAssets coerces all three to primaryTypeKey('website') at useTrafficStore.ts:5121. Add t('product', 'Product / feature page'), t('solutions', 'Solutions page'), t('comparison', 'Comparison page'). Add a vitest asserting isValidType(p.channel, p.assetType) for every entry in DELIVERABLE_PRESETS. Do not migrate rows already coerced: they are indistinguishable from genuine homepages and guessing would be worse than leaving them.

**Why.** You pick 'Product / feature page' and the card on your board says 'Homepage'. That is a straight lie about what you asked for, and phases 3 and 5 build a components readout and a format readout on top of that label. Their bespoke schemas in messaging.ts and their three matching page blueprints in emailPatterns.ts are also unreachable through this path today. The test is what stops the next added preset repeating it.

**Done when.** Seeding a campaign from the product-page preset produces rows with assetType 'product', the deliverable card reads 'Product / feature page', and messagingFields returns the website:product override (which orders proof-social before body, unlike homepage). The new test fails if any DELIVERABLE_PRESETS entry names an assetType absent from its channel's CHANNEL_TYPES.

**Copy.** Three new options in every Type list: Product / feature page · Solutions page · Comparison page

**Files.** `src/domain/channelAssetTypes.ts`, `src/domain/__tests__`

### Say the real name of the thing  `S` · cross-cutting · both

**What.** Replace the raw ids at FlowsView.tsx:8041 ({selDeliv.channel} · {selDeliv.assetType}, which renders 'linkedin-ads · single-image') and 8704 with CHANNELS[ch]?.label and typeLabel(ch, type), both already imported and already used correctly on the asset panel at 7841. Use POST_TONE in the asset panel head at 7833, which is currently gold or blue while the card is POST_TONE #8a34d6 at 7596, so selecting a post changes its colour. Reference POST_TONE at contextRowsFor:2530 instead of the hardcoded hex. Rewrite the five em dash strings at 2686, 2687, 8331, 8336, 8467.

**Why.** The rest of the plan puts weight on the deliverable's identity: a components readout keyed to it, a format section, a discussion thread. All of that is built on a label currently printed as an internal id. It is the cheapest correctness win on the board and it belongs in the same phase as the coercion fix, since together they are the whole answer to 'does this panel name things correctly'.

**Done when.** A LinkedIn single-image ad deliverable's sub-line reads 'LinkedIn Ads · Single image ad'. A grep for the em dash and en dash characters across src/components/FlowsView.tsx returns nothing. Selecting a post does not change the colour of its tile.

**Copy.** Budget toast: $50,000 budget set, but this campaign has no paid media to spend it on. Add a paid deliverable (Meta, LinkedIn Ads) to allocate it.
Budget line: $12,000 of $50,000 assigned to paid assets. $38,000 left.
Over budget: $62,000 assigned. $12,000 over the $50,000 budget.

**Files.** `src/components/FlowsView.tsx`

## Phase 2: The asset panel becomes where you do the work

**Goal.** Make the Asset card inspector the place a marketer reads, fixes, dates, approves and rewrites one post, without leaving the canvas.

**Why here.** Second, and the largest single jump in value in the plan. Reading and fixing copy is the highest-frequency action on this surface by two orders of magnitude, and it is currently the only thing the panel cannot do: the copy sits at the very bottom as read-only divs with empty fields filtered out entirely. Four of the five product-owner areas land here at their cheapest. It comes after phase 1 because putting a Generate button one scroll below the copy makes the wipe hazard far more likely to be hit.

### Extract CopyFields, one copy editor used by both surfaces  `M` · custom-output · asset

**What.** Extract src/components/CopyFields.tsx from CopyReview.tsx:344-395: one label per field in messagingFields order, a {len}/{hardLimit} counter with the `over` class, a textarea taking the `tall` class when field.multiline, writing through a passed setField. Keep CopyReview's per-field RTB chips and ICP drift flags as optional props so CopyReview loses nothing. Use it in both CopyReview and the asset inspector, where setField is (key, value) => updateRow(selPost.id, { messaging: { ...messagingMap(selPost), [key]: value } }). Render EVERY field in the schema including empty ones. Keep the existing unknown-key pass (FlowsView.tsx:8017-8019) below the schema fields but label it honestly: those keys are not part of the output's components and clampToLimit is a no-op on them, because fieldByKey.get(c.key) resolves to undefined at useTrafficStore.ts:6874.

**Why.** Copy-pasting the editor inline would make this the fourth editable copy surface after CopyReview, CanvasView and SheetGrid, and it would ship the poorest of the four (no proof tagging, no drift flags) into an 8,700-line function where it drifts from CopyReview on the first change. Showing empty components is the point rather than a detail: a missing CTA is currently invisible, so the panel looks finished because the unfinished part is not drawn. And the app is already trimming copy to hardLimit at write-back while never showing the number.

**Done when.** Opening an asset with no copy shows one labelled empty box per component in messagingFields order. Typing 45 characters into a headline with hardLimit 40 shows '45/40' with the over class. The same component renders identically in CopyReview and in the inspector. Every new input calls e.stopPropagation() on keyDown, verified by pressing 'b' inside a copy field and confirming no deliverable picker opens.

**Copy.** Section heading: Copy
Note: This is the copy that ships. It saves as you type.
Empty component placeholder: {Field label}…
Unknown key heading: Not part of this format
Unknown key note: This copy is on the asset but it is not one of this format's components. Nothing checked its length.

**Files.** `src/components/CopyFields.tsx`, `src/components/CopyReview.tsx`, `src/components/FlowsView.tsx`, `src/index.css`

### Reorder the asset panel and give it a spine  `M` · cross-cutting · asset

**What.** Reorder the selPost branch (FlowsView.tsx:7830-8028) to the sequence in the panels field: title and sub-line, Copy, Generate, Ready to ship, Schedule and budget, Connected to, Pattern, Swap, Discussion. Add a 'Part of {deliverable}' button under the sub-line calling setSel(deliverableKeyFor(selPost)). Demote the swap block into a collapsed disclosure. Ship this as its own commit with nothing else in it, because the panel precedence chain at 7796-7800 is load-bearing and was deliberately hoisted above the view/build split. Add a code comment at the build-mode branch head (8489 and 8577) recording that build mode is out of scope: nodes is session-only React state that boardSnapshot (4219-4224) never persists, so a preset, a format or a discussion authored there is gone on reload.

**Why.** The panel currently has no shape, so it changes under you as you click between two assets, and the thing you came for is below a pattern picker and a swap panel you touch twice a year. There is also no way to get from an asset to its deliverable at all today.

**Done when.** On a 900px-tall viewport, the first component's textarea is visible without scrolling on an asset with three components. Clicking 'Part of {deliverable}' selects the deliverable card and opens its panel. The commit touches only JSX order and contains no behaviour change, verified by the diff containing no new store calls.

**Copy.** Breadcrumb button: Part of Instagram reel
Breadcrumb sub-line: 1 of 4 posts
Swap disclosure summary: Swap for a live post

**Files.** `src/components/FlowsView.tsx`

### Schedule, status, duplicate and delete  `M` · cross-cutting · asset

**What.** Make the date in the sub-line a button that reveals a datetime-local input in place, using isoToLocalInput and localInputToIso from src/lib/format exactly as CopyReview.tsx:287-292 does, writing scheduledAt through updateRow. Add a Schedule and budget section holding a RowStatus control as flow-src-opt buttons with a check (draft, in review, approved), the existing paid-only budget input moved here from 7886-7907, a 'Duplicate this post' button calling the existing store duplicateRow (useTrafficStore.ts:5781), and a 'Delete this post' button. Do not expose scheduled, posted or failed as choosable states: those are set by the publish path, and the doc comment at types.ts:45-58 says nothing past approved happens without the user.

**Why.** Pushing a post to Monday is the single most common Friday action on an asset and there is no way to do it in this panel, even though the panel prints the date. Approving is the second. Deleting is currently only in a right-click menu, and the deliverable's minus-one stepper removes the LAST asset rather than the bad one. duplicateRow already exists in the store and is reachable only from an internal count-change path.

**Done when.** Changing the date moves the card on the Calendar tab to the new date without a reload. Setting status to approved persists across a reload. Duplicating a post produces a second row under the same deliverable with the same copy and the deliverable's count goes from 4 to 5. Deleting a post that is not the last one removes exactly that post.

**Copy.** Section heading: Schedule and budget
Status label: Where it is up to
Status options: Draft · In review · Approved
Status note: Approved means you have read it and you are happy. Nothing publishes on its own.
Duplicate: Duplicate this post
Duplicate note: Makes a copy with the same copy and a date one week later.
Delete: Delete this post
Budget note (kept): Its share of the campaign budget. Assign the full budget across your paid assets.

**Files.** `src/components/FlowsView.tsx`, `src/lib/format.ts`, `src/index.css`

### Generate on the asset, with an honest sentence about what it clears  `S` · generate-outputs · asset

**What.** A Generate section directly under Copy calling regenerateFlow([selPost.id]) and nothing else, so it inherits the board flush, the messaging wipe and the phase 1 refusal check. Subscribe the disabled state to store drafting, store regenIds and local regenerating together, because the three disagree today and a draft started in the Grid leaves the canvas toolbar looking idle. Add 'Write another version', which is regenerateFlow([selPost.id]) again: dedupeCampaignDrafts already runs the new draft against every other headline and body in the campaign, so a second press genuinely produces something different without a new store action. Render the phase 1 copySource stamp as a badge here, reusing the flow-built-badge class from 8557.

**Why.** Generation is the verb of this card and it is currently unreachable from the panel: the only path is a toolbar button whose scope comes from an invisible selection. The honest sentence matters more than the button. Rather than building a per-field generatedCopy snapshot to protect hand edits, state plainly what the rewrite does and that undo reverses it, which I verified is true: regenerateFlow calls recordHistory(true) at 2639, which snapshots rows via snapRows and restores them through applyRowsSnapshot.

**Done when.** Pressing 'Write this post again' regenerates exactly one row, and the other assets under the same deliverable have byte-identical messaging afterwards. Cmd+Z immediately after restores the previous copy. The button is disabled while a draft started from SheetGrid is in flight. On a fallback run the badge reads 'Written offline' on that asset.

**Copy.** Section heading: Generate
Button, empty asset: Write this post
Button, filled asset: Write this post again
Secondary: Write another version
Secondary note: Writes it again against everything else in the campaign, so it does not land on the same headline twice.
Under the buttons: This clears the copy on this post and writes it again, including anything you typed by hand. Undo (Cmd+Z) puts the old copy back until you reload the page.
While running: Writing…
While another run is going: Something else is generating right now. This will be available when it finishes.
No cancel: A run cannot be stopped once it has started.
Badge, model: Written by Claude, 2h ago
Badge, fallback: Written offline, 2h ago
Under the fallback badge: The model could not be reached for this one, so it came from templates built out of your brand and audience. The offline writer reads none of the wired cards and none of the figures.

**Files.** `src/components/FlowsView.tsx`, `src/index.css`

### Discussion on the asset, and the badge on its card  `S` · comment · asset

**What.** Call renderCardComments(selPost.id) at the foot of the asset panel and render the openCommentCount badge on the post card next to the Post kind chip (7585), copying the flow-note-cmt markup from 7319-7325. Rename the thread's label from 'Comments' to 'Discussion' inside renderCardComments, which also relabels it on context cards. Where the row has entries in the store's separate platform-comment slice (comments: Record<string, Comment[]> at useTrafficStore.ts:2535, surfaced by CommentDrawer and CommentInbox), add a link to that inbox under a distinct heading. cardComments is already keyed by an opaque cardId scoped by campaign (src/domain/cardComments.ts:15-28) and is already in STATE_SLICES at useTrafficStore.ts:5289, so it genuinely syncs with no schema change and no migration.

**Why.** The whole thread UI is built (resolve, reopen, delete, relative ages, Enter to post, per-card drafts) and called from exactly one place, line 6440. Friday is the day somebody else looks at the work. The rename is not cosmetic: the store already has a second thing called comments on the same object keyed by the same row id, holding ingested platform comments with a 'needs reply' count, and shipping a team thread labelled 'Comments' onto an asset that already has a platform comment inbox labelled 'Comments' would be one word for two features.

**Done when.** Posting on an asset, reloading, and opening the same asset shows the comment with its author and age. The post card shows an unresolved count badge that drops to zero when the comment is resolved. An asset with ingested platform comments shows both blocks with different headings and the platform block links to the existing inbox.

**Copy.** Heading: Discussion · 2
New line under the heading: For your team. None of this is sent to the writer.
Placeholder (kept): Leave a comment for your team…
Badge tooltip: 1 open comment on this post
Platform block heading: Comments from people
Platform block link: 3 comments on the live post. Open the inbox

**Files.** `src/components/FlowsView.tsx`, `src/domain/cardComments.ts`

## Phase 3: The deliverable panel earns its place

**Goal.** Make the Deliverable card inspector answer what this makes, what each one will contain, and write them, with the same words and the same components as the asset panel.

**Why here.** Third because it is the same five ideas at a fraction of the cost: CopyFields, the Generate block, the discussion thread and the refusal selector are all built in phases 1 and 2, so this phase is mostly composition. It comes after the asset panel because a deliverable is only meaningful once you can act on the posts underneath it, and because 'What each post contains' is the readout that phases 5 and 6 will move rather than invent.

### Reorder the deliverable panel and give it the same spine  `M` · cross-cutting · deliverable

**What.** Reorder the selDeliv branch (FlowsView.tsx:8030-8172) to the sequence in the panels field: title and sub-line, Assets, Generate, What each post contains, Connected to, Format and pattern, Discussion. Keep the existing count control, the typed count, the staged Apply and its note exactly as they are: applyDelivCount (1968-1988) is already the correct model for a staged destructive numeric edit and its reason for staging (a half-typed 1 on the way to 16 must not delete fifteen assets) still holds. Fold the phase 1 name fix into the sub-line.

**Why.** The count is the frequent deliverable action so it stays first, which is deliberately different from the asset panel where copy is first. Establishing the section order now means phases 4, 5 and 6 are one insertion at a known index rather than a negotiation.

**Done when.** The deliverable panel's section headings render in exactly the documented order and every heading in the panels field is present, including on a freshly added deliverable with one asset and nothing wired. The commit contains no store calls.

**Copy.** Sub-line: Website · Product / feature page · 4 posts
Assets note (kept): The minus and plus add or remove one, drafting fresh copy for anything new. Type a number and Apply to change it in one go and rewrite every post from the current brief.

**Files.** `src/components/FlowsView.tsx`

### Generate on the deliverable, scoped and counted  `M` · generate-outputs · deliverable

**What.** A Generate section calling regenerateFlow with an explicit id list. Three buttons, only rendered when they apply: write only the rows where messagingAllText(r).trim() is empty; write only the rows carrying recheckFlag; rewrite all of them. The empty-only path is the important one because it never touches copy anybody wrote. Render the phase 1 copySource split as a count rather than a badge. Reuse regenIds for progress, intersected with this deliverable's row ids, since it is cleared one row at a time at useTrafficStore.ts:6903-6910. Say plainly that ingested posts are included, because explicit ids bypass draftCopy's status !== 'posted' filter at 6383-6390 and viewRows filters only archivedAt.

**Why.** Selecting a deliverable and pressing the toolbar button already regenerates exactly its rows and nothing says so. Naming the count turns an irreversible action into a stated one, and the 'only the empty ones' button is what makes the common case safe without building per-field provenance.

**Done when.** On a deliverable with 4 assets of which 2 are empty, 'Write the 2 that are empty' leaves the other 2 messaging maps byte-identical. The buttons disappear when their target set is empty. On a deliverable containing one ingested post, the rewrite button's sentence names it. Progress shows 'Writing 2 of 4' and settles.

**Copy.** Section heading: Generate
Primary when some are empty: Write the 2 that are empty
When some are flagged: Write the 3 that are out of date
Rewrite: Rewrite all 4 posts
Under the rewrite button: This clears the copy on all 4 and writes them again, including anything you typed by hand. Undo (Cmd+Z) puts the old copy back until you reload the page.
With a live post in the set: 1 of these is a live post that has already run. Rewriting replaces its copy too.
While running: Writing 2 of 4…
Mixed sources: 3 written by Claude. 1 written offline.
All offline: All 4 written offline. Generate again to retry.

**Files.** `src/components/FlowsView.tsx`

### What each post contains  `S` · custom-output · deliverable

**What.** A readout of messagingFields(selDeliv.channel, selDeliv.assetType) as flow-send-row pairs, the component label against its limits, built in the exact shape of renderDatasetContribution (FlowsView.tsx:3152-3200) reusing flow-insp-send, flow-send-row, flow-send-val, flow-send-lab and flow-send-foot so it reads as the same object as the Data source card's 'What this table will send'. Build it as a small pure component taking channel and assetType, not a closure, so it is unit testable and so phase 6 can point it at a custom format without touching FlowsView.

**Why.** This is the missing answer to 'what is a deliverable'. The numbers are authoritative: messagingFields is sent verbatim to the model as the fields array on every asset (useTrafficStore.ts:6634) and enforced by clampToLimit at write-back, and neither number appears anywhere in this panel. A marketer adding a LinkedIn poll deliverable has no way to learn from the panel that linkedin's schema is a single Body field and that poll options exist nowhere in the app.

**Done when.** A meta-ads single-image deliverable lists exactly four rows matching its OVERRIDES entry with the correct numbers. A linkedin poll deliverable lists one row, Body. A unit test renders the component for three channels and asserts the row count matches messagingFields' length.

**Copy.** Heading: What each post contains
Row with both numbers: Primary text · up to 2,200 characters, aim for 125
Row with a cap only: Headline · up to 40 characters
Row with a target only: Subject line · aim for 60 characters
Row with neither: Body · no limit
Footer: Every post under this deliverable gets these components. Copy longer than a limit is trimmed when it lands.
Standing caveat, matching the Data source card: If the model cannot be reached, the copy comes from templates built out of your brand and audience, and the offline writer reads none of the cards wired to this.

**Files.** `src/components/OutputComponents.tsx`, `src/components/FlowsView.tsx`

### Discussion on the deliverable, and the caveat about its key  `S` · comment · deliverable

**What.** Call renderCardComments(selDeliv.key) at the foot of the deliverable panel and render the openCommentCount badge on the deliverable card next to the ×N desc at 7538. Write a comment at the call site recording that a view-mode deliverable's cardId is the derived key from deliverableKeyFor (channel|assetType|↳branchOf), so changing its channel or type in the Grid orphans the thread. This is the same fragility its connectors already have, and phase 5 answers it with a refusal rather than a migration.

**Why.** A deliverable is what a team argues about (how many, what kind, is this the right channel) and it has no thread. Two lines of code against a slice that already syncs.

**Done when.** Posting on a deliverable, reloading, and reselecting it shows the comment. The deliverable card shows the unresolved count. Changing that deliverable's type from the Grid orphans the thread, which is asserted in a test so the behaviour is recorded rather than discovered.

**Copy.** Heading: Discussion · 1
Under the heading: For your team. None of this is sent to the writer.
Badge tooltip: 2 open comments on this deliverable

**Files.** `src/components/FlowsView.tsx`

### Feeds these posts  `S` · connected-to · deliverable

**What.** List the deliverable's own assets as clickable flow-pitem rows with a date and a status, reusing the markup the campaign brief already uses for its deliverable list at 8345-8356. This is the outbound half of Connected to and it needs no graph walk: selDeliv.rows is already in scope. Ship it in this phase rather than phase 4 because it is the half that needs no new resolver.

**Why.** Nothing anywhere names the posts a deliverable stands for, so the deliverable reads as an abstraction rather than as the four real posts it is. Paired with phase 2's 'Part of {deliverable}' button it closes the navigation loop between the two cards.

**Done when.** A deliverable with 4 assets lists 4 rows, each showing the asset name and its scheduled date, and clicking one selects that asset and opens its panel. An asset with no date reads 'No date' rather than rendering an empty cell.

**Copy.** Heading: Feeds 4 posts
Row: Launch teaser 1 · 12 Aug · Draft
Row with no date: Launch teaser 4 · No date · Draft
Empty: No posts yet.

**Files.** `src/components/FlowsView.tsx`

## Phase 4: Connected to, told truthfully

**Goal.** Give both panels one Connected to section that names what feeds this card, what it is part of, and what reaches the writer, using the same code the writer uses.

**Why here.** Fourth because it needs the panels from phases 2 and 3 to exist, and because its central item, extracting the row-level direction resolver, is the one piece in the whole plan that cannot be approximated. It sits above the format work because a marketer opens Connected to when the copy said something surprising, which is far more often than they change what a deliverable makes.

### Extract directionForRow so the panel and the writer read one function  `M` · connected-to · both

**What.** draftCopy assembles per-asset direction as [byTarget(deliverableKeyFor(r)), byTarget(r.id), campaign, legacy] (useTrafficStore.ts:6688-6695). renderResolvedDirection assembles [byTarget(target), campaign, legacy] (FlowsView.tsx:2874-2881). buildDirection keeps the FIRST entry per key and caps at six, so calling renderResolvedDirection(selPost.id) would omit the deliverable's instructions entirely and would render the post's own instruction as governing when it is in fact the one that gets dropped. Export directionForRow(resolved, deliverableKey, rowId, legacy) from src/domain/boardResolve.ts and have draftCopy and both panels call it. On the deliverable, keep the existing call but add a sentence: it never includes any post's own wires, so its count is only true of posts carrying no wire of their own.

**Why.** The obvious one-line version of this ('just call renderResolvedDirection on the post too') ships a confident lie about which instruction governs, on the exact readout whose stated purpose is to be the honesty valve. Extracting the array is the only way the panel and the writer can be checked against each other.

**Done when.** A unit test wires a `pain` instruction to a deliverable and a different `pain` to one of its posts, then asserts directionForRow returns the deliverable's value first and that the panel renders the same value the DraftAsset carries. Removing either call site from the shared function fails the test.

**Copy.** Heading (kept): What this will be told · 4
Dropped tail (kept verbatim): 2 more instructions reached here and were dropped: an asset carries one instruction per kind.
On the deliverable, added: Some posts under this carry their own instructions. Those come first for those posts.

**Files.** `src/domain/boardResolve.ts`, `src/store/useTrafficStore.ts`, `src/components/FlowsView.tsx`

### One Connected to section on both panels  `M` · connected-to · both

**What.** One heading on both panels with sub-labels under it. Deliverable: the existing inherited-or-pinned list with its reset link kept exactly as it behaves, then 'Only this deliverable' with its remove, then a separate uneditable line counting cards that reach it through another card, then directionForRow. Asset: 'Only this post' with its remove and a real sentence when empty, then the indirect line, then 'Figures it uses' (kept), then directionForRow. Keep contextRowsFor as the source of the direct removable lists and do NOT swap it for upstreamObjects. The header on wiredRefsFor in src/domain/boardResolve.ts states the rule deliberately: direction chains through the graph and records do not, and that single-hop definition is shared by the panel, deliverable inheritance and the writer so the three cannot drift. Feeding it a transitive walker would list a card two hops back under a records heading when zero of its records reach the asset, and would offer a remove for a wire that does not exist.

**Why.** The wiring rule is the load-bearing idea of the canvas and it is currently explained three different ways with no shared heading, one of which renders literally nothing when empty. The indirect line is genuinely new information and must name its mechanism, because on the first board where it appears it will otherwise read as a bug.

**Done when.** A card wired straight to a post appears in 'Only this post' with a working remove. A card wired to another card which is wired to the deliverable appears only in the indirect count, has no remove, and its records do not appear in the records list. An asset with nothing wired to it renders a sentence rather than nothing.

**Copy.** Heading: Connected to
Deliverable, inheriting: Writing from the campaign's cards · 3. Draw a line straight to this deliverable to give it its own instead.
Deliverable, pinned (kept): Pinned for this deliverable
Deliverable, nothing anywhere (kept): Nothing is wired to the campaign yet, so this deliverable has no context to write from. Draw a line from a card to this deliverable to give it its own.
Asset, empty: Nothing is wired to this post on its own. It writes from whatever informs Instagram reel and the campaign.
Indirect: 2 more cards reach this through another card. Their instructions travel with it. The records on them do not.

**Files.** `src/components/FlowsView.tsx`, `src/domain/boardResolve.ts`

### Count the cards that contribute, not the wires  `S` · connected-to · both

**What.** The heading count must come from cards whose refs are non-empty, not from connectors. A note card carries no record type at all (it is in neither REF_TYPE_FOR_OBJECT_KIND in flowBoard.ts nor DIRECTION_KEYS in direction.ts, and the latter's comment says being the one kind that contributes nothing is what makes the other kinds' claim credible), and an audience card whose record was never picked carries nothing either. Render those cards in the list, dimmed, each with its own reason, and exclude them from the count.

**Why.** Every panel in this plan puts a number in a heading, and wiredRefsFor's own header says a card that names no record contributes nothing, which is what makes 'wired but empty' distinguishable from 'wired and carrying something'. Counting wires instead of contributors makes the panel's central claim false on the first board with a sticky note on it.

**Done when.** A board with three wires into a deliverable, one from a note and one from an audience card with no audience picked, renders 'Writing from the campaign's cards · 1' and lists all three, with the two non-contributors dimmed and each carrying its reason.

**Copy.** Note card row: Note. Nothing on this card reaches the writer.
Empty record card row: Audience card, no audience picked yet. It reaches the writer with nothing.

**Files.** `src/components/FlowsView.tsx`

### Say that wiring a card to a post cuts it off from the campaign  `S` · connected-to · asset

**What.** When selPost.references is set, render the same sentence and the same reset link the deliverable panel already has at 8156-8167, clearing references on this one row only and setting refsDirty. TrafficRow.references is documented at types.ts:177-180 as a per-deliverable override, and rowsForTarget materialises it onto the row whenever a card is wired straight to a post.

**Why.** An asset can be silently pinned away from the campaign's audience and proof with nothing on its panel saying so. The deliverable says exactly this and offers a way back; the post says nothing, so the same wire means two different things depending on which card you drew it to. This is a display change only and no behaviour moves.

**Done when.** Wiring an audience card straight to a post makes the sentence appear on that post's panel and on no other post under the same deliverable. Pressing the reset link clears references on that row alone and the sentence disappears.

**Copy.** Wiring a card straight to this post pins it to those records only. It stops using the campaign's.
Link: Go back to the campaign's

**Files.** `src/components/FlowsView.tsx`, `src/domain/types.ts`

## Phase 5: Presets, meaning format and pattern

**Goal.** Answer what kind of thing this is and how it is written, on both cards, with an honest refusal where the app cannot safely change it.

**Why here.** Fifth because these are the rarest actions on either card, which is exactly why they sit behind a disclosure rather than at the top. It comes after Connected to because a pattern change rewrites copy and should land only once the Generate refusals and the copy editor are proven. The phase deliberately spends a refusal rather than the re-key migration three earlier drafts proposed, which moves the highest-risk item in the whole plan out of the release.

### Pattern on every asset, in all four states  `S` · presets · asset

**What.** The Pattern block returns null today whenever blueprintsFor(channel, assetType) has fewer than two entries or the post is ingested (7929-7952), and blueprints exist for only five channels (email 12, linkedin-ads 5, website 5, blog 4, landing-page 2), so an Instagram, X, TikTok, YouTube or SMS asset sees nothing and nothing says why. Keep the flow-bp-pick list unchanged when two or more exist, and add the three missing states: exactly one blueprint (render it as the checked current), none, and ingested.

**Why.** A block that renders nothing is worse than one that is absent, because a marketer cannot tell a gap from a control they have failed to find. This is the asset half of the Presets bullet and it is three sentences.

**Done when.** An Instagram reel asset shows a Pattern section with the no-patterns sentence. An email asset with one applicable blueprint shows it checked with the only-one sentence. An ingested post shows the ingested sentence and no picker.

**Copy.** Heading: Pattern
Two or more (kept): Change the copy pattern for just this post. This rewrites its copy.
One: {name} is the only pattern for this format. Change the deliverable's pattern to write it a different way.
None: No copy patterns for Instagram yet. This post is written from the campaign brief and from whatever is wired to it.
Ingested: This is a live post that has already run, so its copy is kept as it was published. Replace it with a generated post to pick a pattern.

**Files.** `src/components/FlowsView.tsx`

### Pattern on the deliverable, where changing the arc actually matters  `M` · presets · deliverable

**What.** Lift the blueprint picker into the view-mode deliverable panel inside the 'Format and pattern' disclosure, using blueprintsFor(channel, assetType), the flow-bp-pick three-line option button and the Guardrails details block from the build-mode version at 8598-8655. Applying a pattern to a deliverable is applyPatternToPost (5058-5075) run across its rows, staged behind an Apply that names the count and says it rewrites, and routed through regenerateFlow so it inherits the phase 1 refusal. Rename the UI word Blueprint to Pattern everywhere, keeping the EmailBlueprint type name in code.

**Why.** The one preset-shaped control that already lives inside an inspector exists in build mode as Blueprint and on a single post as Pattern, and is absent from the one altitude where it would matter, which is changing the arc of a whole run. Two names for one idea, and the useful altitude has neither.

**Done when.** An email newsletter deliverable of 4 assets shows its 12 patterns, and applying one rewrites all 4 with lineage stamped on each. The word Blueprint appears in no user-facing string, verified by grep. On a brandless campaign the Apply button is disabled with the phase 1 refusal shown and no copy is cleared.

**Copy.** Sub-heading: Pattern
Note: Apply a proven structure so the copy follows a deliberate arc.
Apply: Apply Welcome sequence and rewrite all 4 posts
Under it: This clears the copy on all 4 and writes them again. Undo (Cmd+Z) puts the old copy back until you reload the page.
None for this channel: No patterns for Instagram yet. The copy follows the brief and whatever is wired to this deliverable.

**Files.** `src/components/FlowsView.tsx`, `src/domain/emailPatterns.ts`

### Name the format, and refuse to change it in words  `S` · presets · both

**What.** In the deliverable's disclosure, render the current format as a checked flow-src-opt row with its component count as a sub-line, and then refuse to change it, saying why and what to do instead. On the asset, a read-only line at the foot of Pattern naming the format and linking to the deliverable. Pair the refusal with a working 'Delete this deliverable' button in the same disclosure, so the stated alternative is actually one click away. Do not build retypeDeliverable: deliverableKeyFor is the deliverable's identity in pos, in every connector endpoint, in pruneBoard's targetIds and in the writer's direction resolution, so re-keying is a three-slice write with no transaction where a partial failure leaves wires pointing at a key no asset answers to.

**Why.** Changing the format is the rarest action on either card and the riskiest to build. An honest refusal that names the alternative costs a sentence and a button. Putting the format picker on the ASSET would be actively harmful: assetType is half of deliverableKeyFor, so changing one asset's type silently pulls it out of its deliverable and leaves a one-asset deliverable beside it, which no user would ever connect to something they did.

**Done when.** The deliverable disclosure shows its format checked with its component count and no other format is selectable. Deleting a deliverable from the panel removes it and its assets and leaves no connector pointing at its key, asserted by a test on pruneBoard. The asset's format line opens the deliverable panel when clicked.

**Copy.** Sub-heading: Format
Current: Product / feature page · 9 components
Refusal: You cannot change what this deliverable makes. Its format decides the components, the schedule and the tracking on all 4 posts, and changing it would leave them on a shape nobody chose. Delete it and add the one you want.
Delete: Delete this deliverable
Delete note: Removes this deliverable and its 4 posts, and the cards wired to it stay on the board.
Asset line: Its format is Reel, set by the deliverable. Open Instagram reel to change it.

**Files.** `src/components/FlowsView.tsx`, `src/domain/flowBoard.ts`

## Phase 6: Make your own format

**Goal.** Let a marketer name an output the 51 presets do not cover, on a channel they already have, and have it survive seeding, grouping, generation, the Grid and a reload.

**Why here.** Last because it is the only one of the five areas with no existing implementation, the one most likely to sprawl, and the one a marketer needs least often. Shipping it last means the release still changes a Friday even if this phase slips. Slice one deliberately inherits the channel's components rather than letting you author your own, which is what already happens with the built-in Other / custom escape hatch, so this is strictly an improvement on today rather than a new surface to get wrong. It wears the Work in progress tag and says exactly what it does not do.

### A per-brand output-type slice that actually syncs  `M` · custom-output · deliverable

**What.** New slice stoplight.outputTypes.v1 holding { id, brand, channel, value, label, createdAt, retiredAt? }, following the brandDatasets pattern at useTrafficStore.ts:671-697: a key constant, a load helper, and a save helper that RETURNS whether the write landed so the caller can roll back. Critically, ALSO add it to the STATE_SLICES map at useTrafficStore.ts:5272-5291. I verified stoplight.brandDatasets.v1 is absent from both STATE_SLICES and STATE_MIGRATIONS, so the pattern being copied is device-local and a brand-scoped format built verbatim from it would be invisible to a teammate, on a second device, and in incognito. Retire with a tombstone rather than a splice so typeLabel can still name a format that is in use; hard delete only when no row carries it. Cross-brand reuse is a copy with a new id, never a shared row.

**Why.** This is the storage decision the rest of the phase hangs off. Putting it on the row breaks the moment a deliverable re-keys, putting it on FlowDeliverable loses it at Build, and a *_records table would need a hand-run Supabase migration when 0005 and 0006 are still unapplied. A workspace slice with a brand tag is the shape the app already uses, needs no SQL, and is one line away from syncing correctly.

**Done when.** Adding a format on one device and opening the workspace in incognito (which shows the true server state, since localStorage is empty and everything comes from hydrateState) shows the format. A test asserts the key is present in STATE_SLICES. Filling localStorage to the quota makes the save helper return false and the panel shows the storage failure sentence rather than appearing to succeed.

**Copy.** Storage failure: That did not save. Your browser is out of room. Clear some space and add it again.
Retire: Retire this format
Retire note: 4 posts use this format. Retiring it takes it out of the lists and leaves those 4 exactly as they are. You can bring it back.
Delete: Delete this format. Nothing is using it, so this is permanent.

**Files.** `src/domain/outputType.ts`, `src/store/useTrafficStore.ts`

### Split isValidType so a custom format is never coerced away and never claimed as known  `M` · custom-output · both

**What.** Six sites run the identical expression isValidType(ch, t) ? t : primaryTypeKey(ch): useTrafficStore.ts 5121, 5183, 5573, 5640, classifyAsset.ts 172-181, propose.ts 66. Give every custom format an assetType of x-<id> and split the accessor in two. isPreservableType(channel, value) returns true for any /^x-[a-z0-9_]+$/i without consulting anything, and is used ONLY by those six sites, so recognition never depends on hydration, sync, or a fresh device. isKnownType(channel, value) keeps today's behaviour and is used by everything that renders a name or a readiness claim, including postSpec.ts:35, SheetGrid.tsx:248 and CopyReview.tsx:83. Teach typesFor and typeLabel to consult the slice. The value must contain no colon (messaging.ts keys OVERRIDES on channel:assetType, and flowBoard.ts:164 treats any endpoint containing a colon as a legal connector target) and no pipe (deliverableKeyFor joins on it).

**Why.** A single accessor answering both 'may I keep this value' and 'can I name what this is' would make postSpec's Format check pass while typeLabel supplies the failure sentence inside a passing row, so an asset whose format the app cannot describe would report as ready to ship. Splitting it fixes all six coercion sites and every Type dropdown at once with no call-site edits, and keeps the readiness claim honest.

**Done when.** Seeding a campaign from a custom format on a device whose outputTypes slice has not hydrated produces rows still carrying the x- assetType rather than being coerced to the channel's primary type. postSpec on a row whose x- format is absent from the workspace returns a FAILING Format check. A test asserts no persisted assetType in the existing vocabulary starts with x-.

**Copy.** typeLabel with no definition: Custom format, missing
postSpec Format check detail: This post's custom format is not in this workspace, so nothing here can say what it should contain.

**Files.** `src/domain/channelAssetTypes.ts`, `src/domain/postSpec.ts`, `src/store/useTrafficStore.ts`, `src/lib/classifyAsset.ts`, `src/scheduling/propose.ts`

### Make postSpec fail rather than pass when there are no components  `S` · custom-output · asset

**What.** postSpec builds its Copy and Call to action checks inside if (mainField), where mainField is fields.find(...) ?? fields[0] (postSpec.ts:54-67). With an empty fields array both checks are skipped, so postReady returns true on an asset with no copy at all. Add an explicit branch at the top: fields.length === 0 returns one failing check. Slice one inherits the channel base so this cannot be reached through the supported path, which is exactly why it should be added now, while it is cheap and provable, rather than after a later slice makes it reachable.

**Why.** Phase 2's Ready to ship block would otherwise certify an empty asset as shippable, printing 'Ready' over a post whose components the app cannot name. The existing undefined-mainField guard is a crash guard, not an honesty guard.

**Done when.** A unit test calls postSpec with a stubbed empty field list and asserts postReady is false and the single returned check names the missing format. The Ready to ship block renders the failure sentence rather than 'Ready'.

**Copy.** Its format is missing, so nothing here can say what this post should contain.

**Files.** `src/domain/postSpec.ts`

### Make your own format, at the bottom of the format list, wearing its tag  `M` · custom-output · deliverable

**What.** In the deliverable's Format and pattern disclosure, and in the add-deliverable picker where the format is first chosen, put 'Make your own format' as the last row, which is where OTHER_TYPE already sits in every Type dropdown. The form is a name and a channel, nothing else. Put flow-panel-wip in the panel head (5265) and the one honest paragraph (5269-5276) naming exactly what works and what does not. Explicitly out of scope and stated in the note: choosing your own components and limits, and custom channels (ChannelId is a closed union used as a Record key in six files).

**Why.** A marketer does not think 'I need a custom output', they think 'there is no format for a booth panel' and look for it in the format list. Putting it at the bottom of the same list is what makes it discoverable at the moment of need. Slice one is real value at a fraction of the cost: the format survives seeding, grouping into its own deliverable, generation, the Grid and a reload, and it ships the storage and the vocabulary hook that a components editor would later need.

**Done when.** Adding a format named 'Conference booth panel' on the Events channel, then adding a deliverable using it, produces a deliverable card labelled 'Conference booth panel' that generates copy, survives a reload, and appears in the Type dropdown in SheetGrid and CopyReview with no edits to either file. The Work in progress tag is present and its paragraph names the components limitation.

**Copy.** Last row of the format list: Make your own format · For something this list does not cover
Heading: Make your own format
Work in progress note: You can name a format the list does not have. It gets its own deliverable, it generates, and it keeps its name everywhere in the app. Choosing its own copy components and their limits is not built yet, so it uses the ones this channel normally uses.
Name field placeholder: Conference booth panel
Channel note: This sets how it gets scheduled, which funnel stage it sits in and how it gets tracked. Pick the closest one.
Button: Add it
After adding: Added. Conference booth panel now sits alongside Events' own formats, here and in the Grid.
Duplicate name: "Conference booth panel" is already a format on Events. Pick another name.

**Files.** `src/components/FlowsView.tsx`, `src/domain/channelAssetTypes.ts`, `src/index.css`

## Deliberately rejected

- **generatedCopy: a per-row snapshot of the last generated copy, so a rewrite can keep fields a person edited by hand**  
  Killed on storage cost for value that is mostly available free. It adds a second copy of every asset's messaging map to every row, and rows persist to stoplight.sheet.v1 in localStorage where the quota is already tight enough that saveBrandDatasets returns a boolean specifically because a few big tables exhaust it and the failure looked exactly like success. It also forces two nearly identical buttons side by side on every generate surface, plus a third 'this row predates the snapshot' state. Most of the protection comes from four cheap things now in the plan instead: the phase 3 'Write only the empty ones' button so the common case never touches written copy, the phase 2 per-asset button so the blast radius is one card, the button's own sentence saying it clears hand-typed copy, and the undo clause. I verified undo is real: regenerateFlow calls recordHistory(true) at FlowsView.tsx:2639, which snapshots rows and restores them through applyRowsSnapshot. Revisit only if users report losing work.

- **A credits-used readout in the Generate block, showing what the last run of this size cost**  
  The number would be false in the ordinary case. api/ai-credits.ts reads the OpenRouter ACCOUNT balance, and roughly fifteen model endpoints on this deployment share one key, so a delta between two reads is everything that happened on the account between two HTTP calls, not this run. refreshAiCredits also fires the moment regenerating flips false, before provider usage has necessarily aggregated, so the likeliest reading is zero, printing 'used 0 credits' next to a real dollar balance. Presenting that as measured rather than estimated is exactly what the house rule forbids. It is also not one of the five areas, and the toolbar chip already answers the only honest question, which is how much is left.

- **retypeDeliverable / rekeyDeliverable: changing a built deliverable's format with its connectors, position and discussion thread migrated in one operation**  
  Highest risk in the plan against the rarest user action. It is a three-slice write with no transaction anywhere in the app (rows through the sheet adapter, connectors through flowBoards, comments through cardComments), and a partial failure leaves wires pointing at a key no asset answers to while the refs stay materialised on the rows, so the copy keeps context whose explanation has vanished. Every version of it also promised the card's position moves, which is one third false: boardSnapshot (FlowsView.tsx:4219-4224) filters pos down to object, placement and campaign ids, so deliverable positions are not persisted at all and that migration step would be dead code. Phase 5 spends an honest refusal and a working delete button instead. If it is ever wanted, it ships alone, with the first flowBoard test, verified on a real board.

- **A five-role component model (headline, body, shortline, cta, proofline) for user-authored components, with the role driving the generated component key**  
  It couples a user-facing data model to internal regexes in the OFFLINE FALLBACK writer (draftWriter.ts:417-447 and pickRoles at 289-294), so a refactor of the degraded path silently breaks the online product's schema, and the offered mitigation (a unit test per role) pins those regexes forever and gives the fallback a veto over the data model. It is also a fifth vocabulary on a card that already carries channel, asset type, preset, pattern and format, and 'Proof line' collides with Proof point, which is already a card you wire to a campaign. No marketer will ever say a component is a proofline. Slice one inherits the channel's components, so the question does not arise.

- **A module-level mutable REGISTRY inside messaging.ts so messagingFields can resolve user-defined component schemas**  
  messagingFields is called from about 39 sites across 12 files including postSpec, breaks, matrixDraft, agentBridge and the store's clamp at write-back. Making a pure function read hidden global state gives all of them a hydration-order dependency they cannot see, and the proposal's own mitigation ('must be set on every path that loads the slice, or a stale schema outlives an edit') describes a bug class rather than a risk. Phase 6 avoids it entirely by having custom formats inherit the channel base, which is what the built-in Other / custom type already does. If user-authored components are ever wanted, store the resolved MessagingField array on the row at seed time so the schema travels with the data it describes and messagingFields stays pure.

- **A per-component 'guide' string and an outputBrief sent to the model, with a SYSTEM paragraph telling it to obey them**  
  It presents a request as a rule. Every other honesty guarantee on this surface is enforced in code: buildDirection fails closed on unknown keys, clampToLimit trims overruns at write-back, figuresUsedIn recomputes provenance from the written text rather than asking the model, and stripEmDashes exists precisely because a house style that is only a request is not a rule. A guide paragraph is a request, and the panel copy proposed for it ('the writer is asked for exactly those') would be a claim of enforcement that does not exist. It also arrives unsanitized: the handler caps personas and hooks and then passes assets through raw at copyDraftHandler.ts:254. Separately it asks a marketer to write a creative brief per slot on top of the campaign brief, the audience card, the message card and the voice card they already wired.

- **A four-way edit differ for a custom format (relabel, add a component, lower a limit, remove a component) wired into the dirtyCards and recheckFlag loop**  
  It is a change-management UI for a data model that does not exist yet and whose meaning the product owner has not defined. Its own risk note admits the affected row set is workspace-wide while the Apply bar renders inside one campaign's inspector, meaning the feature as specified cannot state its own blast radius correctly. Do not build the editor for the thing before the thing.

- **Swapping the Connected to inbound list from contextRowsFor to upstreamObjects so it 'matches what the writer receives'**  
  Backwards, and it would replace an under-report with an over-report. The header on wiredRefsFor in src/domain/boardResolve.ts states the rule deliberately: direction chains through the graph, records do not, and that single-hop definition is the one shared by the panel, deliverable inheritance and the writer so the three cannot drift apart again. contextRowsFor already agrees with it. upstreamObjects also returns a different shape and includes nodes for which there is no single wire to cut, so the remove handlers would be meaningless. Phase 4 keeps the direct list removable and adds the indirect set as a separate uneditable line naming its mechanism.

- **Calling renderResolvedDirection(selPost.id) on the asset panel as a one-line honesty fix**  
  That one line ships a lie. draftCopy assembles direction as [deliverable key, row id, campaign, legacy] and renderResolvedDirection assembles [target, campaign, legacy], while buildDirection keeps the first entry per key. So on a post it would omit the deliverable's instructions entirely and render the post's own instruction as governing when it is in fact the one that gets dropped. Phase 4 extracts directionForRow into boardResolve and has both callers use it, which is the only version of this that is true.

- **Five shared render helpers (renderPresetSection, renderOutputSection, renderConnectedTo, renderGenerate) used by both panels**  
  Extracted as closures inside FlowsView they do not shrink the file, do not make anything testable, and add five more names to a scope that already resolves hundreds. By the plan's own first principle four of the five sections genuinely differ between the two panels, so a shared helper is mostly a kind check: the branch moves rather than disappearing. Consistency is enforced instead by shared section-label constants and by extracting the three pieces that are genuinely shared and genuinely pure: CopyFields (phase 2), the components readout (phase 3) and postSpec's readiness list.

- **Three stacked readouts above the Generate button: 'What this will be told', 'What each post contains' and a wired-records summary**  
  Three lists and a caveat between a marketer and the button they press most, which trains them to scroll past the exact area where the refusals also live. The plan separates them by altitude instead: 'What each post contains' is its own section on the deliverable, 'What this will be told' sits inside Connected to where the question is asked, and only the standing fallback caveat stays adjacent to the button, because that one is a claim about honesty rather than a summary.

- **A format or asset-type picker on the Asset inspector**  
  assetType is half of deliverableKeyFor, so changing one asset's type silently pulls it out of its deliverable and leaves a one-asset deliverable beside it. No user would ever connect that to something they did. The asset gets a read-only line naming its format and a button opening the deliverable where it lives.

- **Putting any of the five sections on the build-mode deliverable node or its brief sub-cards**  
  FlowDeliverable nodes are session-only React state that no code path hydrates: boardSnapshot persists only objects, placements and connectors, so a format, a pattern or a discussion authored there is gone on reload, and a thread left on a build-mode id outlives the node and is orphaned by Build. The plan is scoped to the built campaign and puts a code comment at the build-mode branch head saying so, with one exception taken deliberately: the native select on the build-mode Audience field, which is the last dropdown contradicting the established pattern.

- **A lastRun store object recording asked, written, fallback and empty row ids, rendered as a filtered per-inspector report**  
  The client cannot distinguish a timeout from a rate limit from a malformed response, so the report's proposed wording offered the most likely cause as advice, which is a guess rendered in a panel. Phase 1 keeps the useful three lines inside draftCopy's existing loop instead: raise recheckFlag on omitted rows and clear their stale figuresUsed and rtbMap. The amber dot and the deliverable's out-of-date count already ship and already clear on a successful draft.

- **Labelling the team thread 'Comments' on the asset card**  
  The store already has a second thing called comments on the same object, keyed by the same row id: comments: Record<string, Comment[]> at useTrafficStore.ts:2535, holding ingested platform comments with a needs-reply count, surfaced by CommentDrawer and CommentInbox. One word for two features on one card. The team thread is relabelled Discussion everywhere, including on context cards, and the asset links to the platform inbox under its own heading.

## Open questions, for you not me

- Which of the three preset vocabularies does the bullet 'Presets' mean? The plan reads it as two things a marketer actually distinguishes: the FORMAT (what kind of thing this is, from CHANNEL_TYPES, shown and refused in phase 5) and the PATTERN (how it is written, from the 28 emailPatterns blueprints, made available on the deliverable for the first time in phase 5). If it instead means making the DELIVERABLE_PRESETS creation picker changeable after the fact, that is the re-key operation this plan deliberately rejected, and it should be its own piece of work.
- How far does 'Custom output' go? Phase 6 ships a named format on an existing channel inheriting that channel's components, which is roughly one week. Letting a user author their own components with their own limits is a different and much larger change to messagingFields, the writer request and clampToLimit, and would touch about 39 call sites. The Work in progress note is written to say exactly which of the two shipped, but the answer changes the phase's size by close to an order of magnitude and should be confirmed before outputType.ts is written.
- Should the team thread really be relabelled 'Discussion' everywhere, including on the context cards where it currently reads 'Comments'? The collision with the platform-comment inbox is real and on the same object, but the rename touches a shipped label on a surface outside this work.
- Does anything in the publish path or an integration read TrafficRow.assetType and expect a value from the closed vocabulary? I confirmed Supabase does not constrain it (supabaseSheetAdapter syncs it inside the row jsonb and there is no asset_type column anywhere in supabase/), and agentBridge already writes unvalidated types straight through updateRow. But the Buffer and publishing paths were not audited, and an x- format reaching a platform API is the one failure local testing would never show.
- Should approving an asset from the panel be the same act as the review gate in CopyReview, or a lighter 'I have read this' that does not move RowStatus? Phase 2 assumes the former and exposes draft, in review and approved only, leaving scheduled, posted and failed to the publish path.
- Nothing in the plan gets the copy OUT of the app: there is no copy-to-clipboard on a component, no copy-all, no export and no send, even though the Buffer integration exists. That is arguably the real Friday gap and it is outside the five areas. Worth confirming it is deliberately out of scope rather than missed.
- How does the person being commented at find out? The badge is visible only to someone already on that board. Comments ship in phase 2 and 3 with no notification of any kind, which is the most likely reason the threads rot and the team goes back to Slack.
- Every phase needs a RELEASES entry in the same PR, and three items change the behaviour of the shipped toolbar Generate button, so /changelog needs to say plainly what moved. Confirm the reorder and the panel head colour change go in the changelog too, since a marketer opening Breadcrumbs on a Friday morning will otherwise think something broke.
- None of this has been verified against a running app. The wipe-before-refuse path, the dedupe source laundering and the partial-return skip were all read from source at HEAD and each deserves reproducing by hand against a real /api/draft-copy 200 on the pilot before its fix is written.
