import { useEffect } from 'react'
import { Wordmark } from './Wordmark'

/**
 * A public, unauthenticated changelog ("What's new"). Rendered directly from main.tsx when the
 * path is /changelog, BEFORE the AuthGate and store load, so anyone can read it without signing
 * in (same idea as the anonymous ?share= viewer). Self-contained: only the wordmark and the
 * RELEASES data below, styled with the .chlog-* block in index.css. Dark, monospace-labelled,
 * flat entries: date, then a tag chip per kind of change, then the bullets.
 *
 * The dark is pinned by main.tsx (data-theme, before mount) rather than chosen here, because the
 * only way in is the black splash and the page must not arrive white for a light-OS visitor.
 */

type Tag = 'New' | 'Improved' | 'Fixed'
interface Release {
  version: string
  dateLabel: string
  groups: { tag: Tag; items: string[] }[]
}

// Newest first. Each entry is one shipped release, grouped by the kind of change.
// Reset to empty on 2 August 2026; every release up to v1.15 is in git history.
const RELEASES: Release[] = [
  {
    version: 'v1.65',
    dateLabel: 'August 9, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'A card’s inspector has a Save button. The board has always saved itself, and the panel said so by having no Save at all, which answers the question by never mentioning it. The button does the work the autosave was going to do six hundred milliseconds later: it writes the board now and pushes every record still waiting out its own delay, then says Saved. The line beside it still tells you edits save on their own, so it reads as “now” rather than as “or else”.',
          'And “Save as a smart object” moved to where it can be seen. It went in under Applied to, which on a card with a document attached is below the name, the record, the whole document panel and the list of everything the card feeds: most of a screen down a narrow column, which is the same as not being there. It sits under the card’s name now.',
        ],
      },
    ],
  },
  {
    version: 'v1.64',
    dateLabel: 'August 8, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'A Voice card stops asking for a sample line and a banned-words list. “Sounds like this” and “Never say” were the card asking, per campaign, for the two things the voice record it names already holds for every campaign that uses it. Two vocabularies for one question, and only one of them comparable. Anything already typed into those fields stays stored and stops reaching the writer, so what the panel shows and what the copy is written from agree again.',
          'And the inspector says you can save a card. Keeping a card as a smart object, to place on another campaign, was a keyboard chord and a right-click item: it existed for people who already knew. The panel that describes a card now offers it, in the same words and through the same action as the menu, and says what happens next — kept on this campaign until you add it to the brand library from its own panel.',
        ],
      },
    ],
  },
  {
    version: 'v1.63',
    dateLabel: 'August 8, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'The document panel on a card stops explaining itself over the document. Three things sat above the file: a heading offering to take a document, a paragraph saying what that would do, and — under the file — a line saying the same thing again about the actual file. The pitch is empty-state copy, so it now goes when the state does: with a document attached you see whose it is, what it is called, how long it is, and what you can do about it.',
          'And the document’s full text is one click away rather than always underfoot. A brand strategy runs to twenty thousand characters, so the panel’s own controls sat below a scroll box of prose and every visit to the card began by scrolling past the document to reach anything that acts on it — shown by default, the source had stopped being a source and become the panel. “Read the document” opens it, unchanged and character-for-character as the writer receives it. Replacing the document and overriding it for one campaign are now one row of choices under the file, instead of a button above it and a link below it with the whole text in between.',
        ],
      },
    ],
  },
  {
    version: 'v1.62',
    dateLabel: 'August 8, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'The caret on a Made from chip slides out a drawer instead of dropping a menu. A native menu could list record names and nothing else; the drawer is the same surface the ＋ already uses, scoped to the one kind the chip is — searchable, with each record’s own line under its name, ticking the one that is picked. And it carries the library edits that used to mean a trip to the Records page: rename a record in place, or delete it — with the same powers those pages grant, no more (products have no delete anywhere; a brand and a proof point stay pick-only). Deleting the record an asset had picked unpins it there too, so the row never claims a record that no longer exists.',
        ],
      },
    ],
  },
  {
    version: 'v1.61',
    dateLabel: 'August 8, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'The Audiences page can sweep the records nobody uses. Every campaign build mints audience records for the segments it writes to — deliberately, so generation has something to resolve against — and over months a brand’s shelf fills with names nobody typed. They were invisible while the pickers read the wrong shelf, and a wall of strangers the moment that was fixed. “Clean up unused” shows exactly which audiences nothing points at — no asset, no board, no smart object, no campaign, checked by id, by name and by alias, archived work included — and removes only those, after you have read the list. Anything your work references is never offered.',
          'Messages get the same sweep. The builder names a message record per campaign, so that shelf fills the same way, and “unused” means the same thing on both pages because it is the same rule underneath — one boundary, not two promises.',
          'The dead do not get a vote. The sweep’s first cut counted references from everything ever stored — archived campaigns, and boards that outlive the campaigns they belonged to — and between them the ghosts reference nearly every record ever minted, so the sweep kept nearly everything and “tons of old messages” stayed exactly where they were. References now count only from living work: unarchived assets and campaigns, and the boards of campaigns that still exist. A record only the dead ever pointed at can finally go; restoring archived work later shows its pins by name with the record gone, which is the same state the app has always allowed by deleting a record from its page.',
          'And starting fresh is allowed. The sweep protects everything living work references, which is the right default and no help to someone who has decided the whole shelf is noise. “Start fresh…” on the Audiences and Messages pages deletes the brand’s entire shelf, used and unused alike — after a confirm that says how many of them live campaigns still point at, and lists every name. Cards and pins that pointed at a deleted record keep their stored name and offer nothing; the next generation mints fresh records for whatever it writes.',
          'The grid’s pickers stop offering every brand’s records at once. The canvas has always scoped its dropdowns to the brand in view; the grid’s Made from carets read the raw library, so a Message caret on one brand’s campaign opened onto every brand’s angles mixed together — which is why a shelf could be swept clean and the dropdown still read as a wall of strangers: those were other brands’ records, never this one’s to sweep. Every record kind in the grid now scopes exactly as the canvas does — this brand’s plus the untagged shared ones — and grids spanning every brand keep the whole list, as they always have.',
        ],
      },
    ],
  },
  {
    version: 'v1.60',
    dateLabel: 'August 8, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Made from stops saying "No audience picked" about assets that plainly have one. An Audience card wired to the campaign brief with no record in it reached every asset in the campaign, and the column stopped there instead of falling through to the audience the asset itself names. That name is the one the copy writer resolves the segment by, so the copy went out written to it while this column, alone among every surface, said the asset was written to nobody. It now says the audience, keeps the card as the thing the chip opens, and still marks the card as holding no record of its own.',
          'A segment kept in the brand’s system library is named in the grid like any other. Audiences live in two places and generation reads both; the grid read only one, so a card pointing squarely at a library segment resolved to no name at all and its own picker could not offer the segment back. Both now read the same merged set the writer does.',
          'A card you have named but not filled in is shown by name rather than as an absence. Naming a card is not filling it, so the missing record is still marked, and both halves can now be said at once.',
          'A card handed a .md is full, and reads that way everywhere. Uploading a document onto a card is the other way of filling it — the document travels to the copy writer on the same terms as a record — and the grid was still dashing those cards as holding nothing, because it looked only for a picked record. The chip is now solid, wears the card’s name (or the file’s, if the card was never named), and says which document it is reading from; the card face on the canvas says the same instead of “Contributes nothing yet”.',
        ],
      },
    ],
  },
  {
    version: 'v1.59',
    dateLabel: 'August 8, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Share stops asking for a brand on a campaign that plainly has one. It read the workspace filter and nothing else, and that filter is a browsing scope: it resets to every brand on each load, and opening a campaign from the Campaigns index deliberately leaves it that way, because an index that hid the other brands’ work would be no use for picking one. So a campaign you opened from there sat on a board naming its brand everywhere — the rail, every record picker, the Brand card wired into the brief — while Share alone answered “Pick a brand first, then share.” Nothing was unset. The dialog was asking a different question from the rest of the app and reporting the answer as a missing brand.',
          'It now takes the campaign’s own brand: the one it is filed under, or failing that the Brand card on its board — the same ladder the Made from column climbs. A campaign gets its brand from the card being wired into the brief, so anything built before that wiring, imported, or holding a card nobody has attached yet carries its brand on the board and nowhere else, and reading the record alone called those campaigns brandless. When neither names one it falls back to the rule every record picker on the board uses.',
          'That also settles which brand a link carries: the page behind a shared link is built per brand — voice, proof, audiences, profile — so a campaign handed out while the rail sat on another client used to travel with that client’s library attached. The dialog is titled with the campaign’s short name now too, rather than repeating the brand in front of it.',
          'A shared board now arrives with the records its cards point at. The board travelled, but four of the collections its cards name did not: brand objects, products, concepts and seasons — and data sets. So the Brand card wired into the brief, the card naming the campaign’s whole brand, landed on the other side pointing at a record that was not in the snapshot. It still showed a name, because a card falls back to what it was called, and it read as nothing picked, with its own record missing from the list you would pick it back from. Every Product, Concept, Season and Data source card was in the same state. They are packed now, scoped to the shared brand exactly as the board scopes them.',
          'Audience tags travel between the flow and the grid now. Both surfaces file and look up audiences on a per-brand shelf, and the shelf was chosen by the workspace rail rather than by the campaign — so the same campaign read from a different shelf depending on how you had opened it. Opened from a tab, a campaign filed under nobody pointed the rail at a phantom brand called “Unassigned”, and every audience authored on that canvas was filed under it; opened from the campaigns list, the rail stayed wherever you had been browsing. A tag made on the canvas one day was unresolvable on the grid the next — dashed, and missing from the very dropdown you would pick it back from — not because it was lost but because the two surfaces were reading different shelves. A campaign now answers for its own brand, on every open: the record catches up with the Brand card wired into the brief (a board wired before binding existed carries its brand on the card and nowhere else), the audiences the campaign references follow it out of the catch-all shelf onto the brand’s, and the canvas and the grid scope by the campaign first and the rail second. Nothing moves that the campaign does not reference, and no other brand’s shelf is touched.',
          'A shared campaign arrives with its own campaign record, so it is not blank. The record was picked out by the brand it is filed under and only then narrowed to the campaign being shared — and a campaign whose brand lives on its Brand card is filed under nobody, so a link scoped to that brand matched no record and shipped an empty list. Its assets still travelled, because assets are attributed by campaign name, which is what made the result blank rather than empty: the work arrived with no campaign behind it, so no goal, no status, no folder, no timing. The campaign a link is about now travels because it is what the link is about. Brand links read the board the same way, so a campaign is never left out of the link it belongs in — while a campaign whose card names another brand still stays out of that brand’s link.',
          'A Brand card offers every brand, not just the one the campaign is already on. Each brand object carries the workspace it was authored in, and that tag was being used to filter the card’s own picker — but the tag says where a record was written, not which brand it IS. So a card whose record was authored under a different rail dropped out of its own dropdown: the brand’s name on the card, no tick in the list, and no way to pick it back. It also made swapping a campaign’s brand impossible from the one control meant to do it, since the brand you are moving TO is by definition tagged to itself. A brand is what a scope is chosen from, so it is never filtered by the scope it establishes — which was already true for a campaign with no brand yet, and is now true for the rest.',
        ],
      },
    ],
  },
  {
    version: 'v1.58',
    dateLabel: 'August 7, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'The setting-up checklist works again while the Link tool is on. Yesterday the checklist was told to get out of the way while you draw a line, so that a line dropped on the campaign brief underneath it would land. That was right, but it was hung on the Link tool rather than on the drawing itself, and the Link tool stays on until you turn it off. So from the moment you picked it the whole checklist stopped responding: every step, including Add what you are shipping, which is how you add a channel from there, and the Complete button, so the panel could not even be dismissed. Clicking the arrow tool brought it all back, which made it look random rather than like a mode.',
          'It now steps aside only while a line is actually in flight, and comes back the moment you let go. Adding a channel from the toolbar was unaffected throughout.',
        ],
      },
    ],
  },
  {
    version: 'v1.57',
    dateLabel: 'August 7, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Pasting a smart object into another brand no longer lands its cards attached to nothing. A smart object cannot be cloned into a library that has no such object, so the paste keeps the cards and drops the wrapper, which is the right trade. But the wrapper was carrying the connection, so the cards arrived loose on the far board and the campaign they landed in read as having nothing behind it. The cards now inherit the connection the object was carrying, in whichever direction it ran.',
          'Stopping a channel from following the asset it was added from keeps the cards wired into it. A channel is identified by what it is, and following another asset is part of that, so releasing it renames it. Every card wired to it still pointed at the old name, and the next time the campaign opened those lines were dropped as pointing at nothing. The lines move with it now, and where the release merges the channel into one the campaign already has, two lines onto the same card become one instead of a duplicate. Its position and its disconnected state come along too, so it no longer jumps back to a default slot or quietly reattaches.',
        ],
      },
    ],
  },
  {
    version: 'v1.56',
    dateLabel: 'August 7, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'The grid shows the audience an asset gets from a smart object. Made from is built from the cards wired into an asset, and it could not see inside a smart object at all: you wire the object rather than the cards in it, so the walk stopped at the object and everything inside it was skipped. An asset written to an audience that arrived that way had a blank where the audience should be, while the copy writer was being handed that very audience. The cards inside the object are now listed like any others, with their record on them, so the chip is a real entry you can open and change.',
          'This was the same disagreement in a third place. The board had already been taught to show those cards as part of the campaign, and to keep their connections when the object they came from is deleted. The grid was still answering the old way, which is why an audience could look connected on the board and unset on the grid at the same time.',
        ],
      },
    ],
  },
  {
    version: 'v1.55',
    dateLabel: 'August 7, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Deleting a smart object no longer quietly unwires the cards it leaves behind. Deleting one from the library left every campaign it was placed on holding a reference to something that was gone. The next time you opened one of those campaigns, the cards inside the object were kept, correctly, but the line joining them to the campaign was thrown away, and the board saved itself in that state. So the cards came back loose and marked as not attached, on every campaign the object had been used on, and drawing each line again by hand was the only way back.',
          'The cards inherit the line instead. A line drawn to a smart object meant everything inside it feeds this campaign, and once the object is gone those cards are the everything, so each of them keeps the connection the object had, whether it ran to the campaign brief or to a single channel. Lines drawn into the object are carried across the same way. Nothing is duplicated, and an object that held nothing still loses its line, because there is no longer anything for it to join.',
        ],
      },
    ],
  },
  {
    version: 'v1.54',
    dateLabel: 'August 7, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'The setup checklist no longer swallows the line you are drawing to the campaign brief. The checklist sits in the top left of the board, which is where the brief card starts, so on most boards it covers part of it. Releasing a wire over the covered part hit the checklist instead of the brief: no line was drawn, nothing was said, and the brief never lit up as somewhere you could drop, so the board looked like it was refusing to let you wire there. Drawing it again did the same thing, because the drag had never reached the brief at all. The checklist now steps out of the way for as long as you are drawing a line, and goes back to normal the moment you let go.',
          'A card more than three steps from the brief now reads as part of the campaign, because it is. The check that decides whether a card looks attached gave up after three links in a chain, while the code that actually collects records follows a chain of any length. So a card at the head of a longer chain had its record handed to every asset in the campaign and was greyed out and labelled unattached at the same time. Rewiring it changed nothing, because the wire was never the problem.',
        ],
      },
    ],
  },
  {
    version: 'v1.53',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'A card drawn inside a smart object now reads as part of the campaign when the object is wired into it. You wire the object, not the cards inside it, so those cards carry no line of their own, and the board was reading that as reaching nothing: it dimmed them and the layers list tagged them unattached. Their records were going to the copy writer the whole time, through the object. The report was an Audience card that said it was not attached while the campaign was plainly written to that audience.',
          'It inherits whatever the object actually reaches, not just the brief, so an object wired to a single channel marks its cards as attached to that channel rather than leaving them looking loose. An object dropped on the board and left unwired still shows its cards as unattached, which is what the tag is for.',
        ],
      },
    ],
  },
  {
    version: 'v1.52',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'The tooltips inside a campaign are shorter, and they say what the app is called now. Several still called the campaign board a canvas or a sheet, one called it the Flow tab, and one credited Claude for work Gretel does, so hovering told you about a version of the app that no longer exists. The share button also still promised a view-only link, which stopped being true when sharing gained a Can view and Can edit switch.',
          'The long ones are cut to what you actually needed. The worst ran to a full paragraph in a small grey box, which is longer than most people hold a hover, so the sentence that mattered was the one you never reached.',
        ],
      },
    ],
  },
  {
    version: 'v1.51',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'The grid shows the audience an asset is written to, even when no card on the canvas names it. Made from was built from the cards wired into an asset, and an audience set any other way is not a card: picking one in an asset\'s inspector on the campaign canvas writes a name, and so does seeding a campaign and ingesting an asset. So the canvas showed the asset under an audience while the grid showed nothing under Made from, and the disagreement read as a wire that had come loose.',
          'The audience it shows is the one you can change from there. Where the name matches a segment in the brand\'s library the chip works like any other, with the picker on it, and setting it from the grid writes the name and the record together so the two surfaces stay level. An audience whose name matches no record still shows, named, rather than leaving the cell blank on an asset that plainly has one.',
        ],
      },
    ],
  },
  {
    version: 'v1.50',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Opening a campaign from the tab strip no longer hides your other campaigns’ tabs. Opening a campaign scopes the workspace to that campaign’s brand, which is right for the board, and the strip was reading it as though you had switched brand: every tab belonging to another brand disappeared the moment you clicked one. Nothing had closed, and they came back when you left, but the row that exists to tell you what you have open was the one thing that stopped saying it.',
          'The tab you have just come back from works again. Going back to Campaigns leaves that campaign marked as the last one opened, and clicking its tab was being treated as a click on the campaign already in front of you, so it did nothing. The one tab you are most likely to want was the only dead one on the strip.',
        ],
      },
    ],
  },
  {
    version: 'v1.49',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Press release is now an Events format. You can start one from the Events palette, or retype an asset into it, the same as a screening or a premiere.',
          'It is briefed as a release rather than as an invitation. The fields are a headline, a dateline, the lead, a quote with its attribution, supporting detail, boilerplate and a media contact, in place of the event name and RSVP copy every other Events format asks for. It sits in awareness, because the audience a release reaches belongs to whoever runs it, and its handoff is the newsroom rather than a registration form.',
        ],
      },
    ],
  },
  {
    version: 'v1.48',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Cards and channels can be copied from one campaign into another. Select an object card, a channel or a post on a campaign canvas, press ⌘C, open a different campaign and press ⌘V. Copy and paste are also in the right-click menu. Until now the only way to carry anything across was to build it again from the picker: the audience card with the direction typed into it, the brand card, the line from each of them into the brief, the channel and its posts, all of it, per campaign, by hand.',
          'A paste keeps the shape, not just the pieces. The cards land in the arrangement they were copied in, the lines drawn between them come too, and a group stays a group. A card that was wired into its old campaign brief arrives wired into the new one, which is the difference between a pasted card that the copy writer can read and one that sits there connected to nothing.',
          'A pasted channel brings its assets and their copy, as fresh drafts. It keeps the cadence it was written on: the gaps between posts and the hour each was scheduled for survive, moved forward to start from today, so a run laid out over one campaign’s flight does not arrive as a set of dates from another campaign’s calendar with half of them in the past.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          'A pasted asset never claims anything that happened to the original. Spend, engagement, platform metrics, the approved and posted stamps, the URL it was published at: none of it travels. What arrives is the plan, as a draft that has not run, with its tracking link rebuilt for the campaign it landed in.',
          'Pasting into a different brand drops the records the cards pointed at, and says so. Audiences, proof points and products belong to a brand’s own library, so carrying the links across would put one client’s segment on another client’s board and hand it to the copy writer as that campaign’s audience. The name, the note and the direction you typed still come with the card; only the link to pick again is missing.',
          'Assets are linked to each other by name, so a paste that would collide renames the copy rather than leaving two assets in one campaign answering to the same thing. A journey link whose other end did not come along is dropped instead of quietly attaching to whatever else happens to share the name.',
        ],
      },
    ],
  },
  {
    version: 'v1.47',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'Sharing a campaign is now one click. Open Share and the link is already there, ready to copy. It used to ask you to choose a role from two cards, press Create, and then press Copy, which is three decisions and two clicks to reach the one thing you opened the dialog for.',
          'A campaign keeps one link, not a growing pile of them. Every press of Create used to mint another, and they were listed as bare ids like m2x9k1_4b7q, so nobody could tell which link had gone to whom, and revoking the right one was a guess. Reopening the dialog, switching access and switching back all hand you back the same link now.',
          'Choosing what the link can do is a two-option switch under it: Can view, or Can edit. It sits after the link rather than in front of it, and it starts on Can view, so handing out editing rights is something you do on purpose.',
          'Viewers see the campaign as it stands, without you having to think about it. A shared link shows a snapshot taken when you shared, which used to mean noticing a Refresh button and knowing why it was there. Opening the dialog now brings the snapshot up to date on its own.',
          'Stop sharing replaces Revoke, and it only stops the link you are looking at. If you handed out a Can view link and a Can edit link, stopping one leaves the other working. Any extra links from before are still listed so you can revoke them.',
        ],
      },
    ],
  },
  {
    version: 'v1.46',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Leaving a campaign puts you back on the Campaigns page you left, with every campaign still on it. Opening a campaign narrows the workspace to that campaign\'s brand, which is right while you are on the board and wrong the moment you are not, and nothing widened it again on the way out. So the back arrow returned you to a Campaigns page quietly scoped to one brand: other brands\' campaigns were missing, the folders they were filed in either vanished or sat there reading 0, and a campaign whose folder had gone with them appeared under Drafts as though nobody had ever filed it. Four campaigns in three folders came back as three campaigns and a draft. Nothing had been moved, unfiled or deleted, which is a hard thing to believe while looking at it.',
          'The back arrow in the campaign rail and the Campaigns breadcrumb above the board now do exactly the same thing. They were separate paths out of a campaign and only one of them went through the app\'s own navigation, so the two could not help but drift.',
          'A brand you picked yourself is still the brand you picked. Leaving a campaign undoes the scoping the campaign did on its own; it does not reach past that and widen a choice you made.',
        ],
      },
    ],
  },
  {
    version: 'v1.45',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Generate now says why, when it will not run. It refuses a campaign with nothing wired into its brief, because there is nothing to write from, and that refusal was real and correct. What was wrong is where it was written: the explanation went to a notice that lives in the breadcrumb bar, and the breadcrumb bar is not on screen while you are on a campaign canvas. So the button did nothing, said nothing, and left every field empty. It reads exactly like a broken model connection, and it never was one: the request had not failed, it had never been sent.',
          'The reason now appears on the canvas, where the button is. It names what is missing and what to do about it: draw a line from a card to the campaign brief, or to one channel. Connect one card and Generate writes.',
        ],
      },
    ],
  },
  {
    version: 'v1.44',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Removing a channel now asks first, and names what it is about to take. Deleting a channel deletes the assets under it, which was true before and is still true: a channel card is not a thing in its own right, it is made of its assets and keyed by them, so it cannot be removed while they are still on the board. What was wrong was doing it in silence. A keystroke on a channel card took four written posts with no dialog, no count, and nothing naming what had gone.',
          'It archives them rather than destroying them, so the answer to "that was not what I meant" is a restore instead of a rewrite. That is already what deleting a campaign does, one level up. Deleting a single asset is unchanged: it goes immediately, and undo covers it.',
          'A menu that runs out of items no longer scrolls the thing behind it. Reaching the end of a list used to hand the rest of the gesture to whatever it was covering, so the board or the page underneath moved while you were reading, and closing the menu revealed somewhere you had not meant to go. The channel picker was the worst of them: every asset type in one list is roughly seven screens inside a one screen window, so running off the end is the normal way to use it rather than an edge case.',
          'This covers the canvas side panels, the channel and record pickers, the audience and flight menus, the chat history menu, the tag picker, the library menus and the modals. Lists that sit in the page rather than over it are deliberately left alone, because a reader scrolling past one of those expects the page to carry on once the list is done.',
        ],
      },
    ],
  },
  {
    version: 'v1.43',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'A group on the campaign canvas can be moved by its frame. Grab the dashed border anywhere along its edge and the whole group comes with you. Dragging a card inside a group already moved all of it, but the frame was the one part that looked like a handle and was not one: the box is drawn behind its cards and passes clicks through, so taking hold of the edge fell to the canvas and started a selection rectangle. The only real handle was the name at the top left, which is as wide as the name and shrinks as you zoom out. The same change landed on the other canvas in v1.39; this is the board most of the work happens on.',
          'Hovering the edge lights the border and the cursor becomes a hand. The band scales with the zoom, so it stays on the border it is drawing rather than drifting inside the frame at 50% or hanging outside it at 200%.',
          'The inside of a frame still belongs to what is under it: a click in the middle of a group reaches the card you clicked, and a drag through the space between its cards still draws a selection rectangle.',
        ],
      },
    ],
  },
  {
    version: 'v1.42',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'The ✕ on a connector deletes it. It never has. The ✕ is drawn on top of the line it belongs to, but it was not taking the mouse: every press on it fell through to the line underneath, and clicking a line toggles it, so the line deselected itself and the ✕ vanished. It looked like a button that shrugged. The connection was still there every time. Deleting from the keyboard, with the line selected, always worked, which is why this was survivable rather than obvious.',
          'Connector lines can be clicked where they run between cards. The card layer sat over the line layer, gaps and padding included, so a line crossing it could not be pointed at anywhere along its length, and a line you cannot select is a line you cannot delete. The line from the campaign to a channel was the worst of it: it runs between two cards for its whole length, and it is the one line that has always offered a ✕. Empty space between cards now falls through to whatever is under it, and a drag across it still draws a selection rectangle.',
          'A channel that follows an asset can be cut loose from it. Adding a channel from an asset\'s "+" makes that channel come after it, and the line says so. That line was the one thing on the board recording a decision you could not change: it offered no ✕, and Delete said there was nothing to cut. The only way out was to delete the channel and add it again. Cutting it now leaves the channel, its assets and their copy exactly as they are, and it hangs off the campaign like every other channel.',
          'Where cutting one loose would merge it into a channel of the same kind the campaign already has, the message says so before you go looking for the card. Cmd+Z puts it back.',
          'A line with nothing behind it says so when you hover it, instead of only after you select it, find no ✕ and press Delete to be told. A post sits under its channel because it is one of that channel\'s assets, so there is no line there to cut, only a card to move or delete.',
        ],
      },
    ],
  },
  {
    version: 'v1.41',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'A Pattern card now wears a band in its own colour, with a row of zigzag teeth cut along the band\'s lower edge, so it is the card you can find in a scan. A pattern is the shape the copy takes, and it is the one input meant to be pinned to a single asset, so it is the card you go looking for rather than one you read in a set.',
          'Two lighter treatments came first, a wave across the head and then a thin zigzag around the whole card, and both dissolved into a faintly noisy border at board zoom while every other cue stayed identical to the neighbouring cards. A block of colour is the thing that carries across a board.',
          'A Pattern card with nothing picked yet keeps the teeth and drops the band, so a card you have not filled in still reads as empty rather than as done.',
        ],
      },
    ],
  },
  {
    version: 'v1.40',
    dateLabel: 'August 6, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Drag from a card\'s connection dot and the line now reaches wherever you take it. The board tracked a drag only while the cursor stayed over the canvas, and two things float above the canvas without being part of it: the toolbar, and the setup hint in the middle of the board. Crossing either one ended the gesture where you crossed it, so the line vanished and the cards never joined. The same drag along a clear route worked, which is why the dot read as unreliable rather than the route.',
          'The same fix applies to moving a card. A card dragged over the toolbar used to drop where it crossed instead of where you let go.',
          'Escape now cancels a drag in progress, and a cancelled card drag puts the cards back where you picked them up.',
          'The connection dots no longer take clicks while they are invisible. Every card was ringed by four handles you could not see but could still hit, so pressing the canvas a few pixels off a card started a connection from it instead of a selection box, and the bottom handle of a stacked card sat underneath the top handle of the card below it.',
          'While a line is in flight, every card shows its handles, so where it can land is visible for the whole gesture rather than only on the card you are already over.',
        ],
      },
    ],
  },
  {
    version: 'v1.39',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'A group can be moved by its frame. Grab the dashed border anywhere along its edge and the whole group comes with you. Dragging a card inside a group already moved all of it, but the frame itself was the one part of a group that looked like a handle and was not one: the box is drawn behind its cards and passes clicks through, so taking hold of the edge fell straight through to the canvas and started a selection rectangle instead. The only real handle was the name at the top left, which is only as wide as the name and gets smaller the further you zoom out.',
          'Hovering the edge lights the border and the cursor becomes a hand, so the handle says it is one rather than having to be found.',
          'The inside of a frame still belongs to what is under it. A click in the middle of a group reaches the card you clicked, and a drag through the empty space between its cards still draws a selection rectangle, because only the ring around the edge takes the mouse. A card that happens to overlap the frame keeps its own clicks too.',
        ],
      },
    ],
  },
  {
    version: 'v1.38',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'The Events channel now covers the events you do not host. A trade show booth, a conference talk, a premiere or launch night, a roundtable dinner and a meetup join screenings, panels, pop-ups and workshops in the Type dropdown and the Events palette. Every event type until now assumed you were the one running it, so standing at somebody else\'s trade show could only be filed as a workshop, or as a generic Other with the difference written in a note.',
          'The events where somebody else assembled the room are briefed to reach rather than to persuade. A premiere, a booth and a conference talk all put you in front of people who were never on your list, so they sit in awareness. A private dinner sits in conversion instead: eight people who came to decide are not there to be educated.',
          'A booth, a talk and a dinner ask for the copy they actually need. A booth wants a stand headline, what you are demoing, the offer and the badge-scan follow-up. A talk wants a title, an abstract, the audience takeaways and a speaker bio. Neither carries RSVP copy, because neither is something anyone can RSVP to. A dinner asks who else is at the table.',
          'A meetup runs as a series rather than a single night, so a monthly community night is planned and costed as the standing commitment it is instead of as one evening\'s work.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          '"Pop-up / activation" can be started from the Events palette. It was the one event type you could choose from the Type dropdown on an asset that already existed but could never create, because it was the only one of the four with no entry in the palette it belonged to. Nothing said so: the type simply was not there to pick.',
        ],
      },
    ],
  },
  {
    version: 'v1.37',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'Handing a card a .md now creates the thing the document describes. Upload a persona onto an Audience card and an audience appears in Records, named from the document\'s own heading, with the file attached to it. Until now the two boxes on a card behaved as opposites while sitting under one word: describing a card in a sentence created a record, and uploading the document that already said all of it created nothing. The file sat on the card alone, so the card named no object, read as unlinked in the grid, and appeared nowhere in your library.',
          'The document belongs to the object, not to the campaign you happened to upload it on. Every campaign that uses that audience reads the same brief, and the card now says so above the file rather than leaving you to guess why a document you did not attach is showing.',
          'A pasted brief takes the same route as an uploaded one, so it also mints and names the object instead of quietly living on one card.',
          'Where one campaign needs to read an object differently, "Use a different document for this campaign" attaches one that applies to that board only and leaves the object untouched everywhere else. Removing it puts the object\'s own document back.',
          'A Company card can be filled in at last. An account\'s facts are never generated, because a generated account is a page of confident guesses about somebody real, which left nothing a Company card could be built from. Its document is now that answer, and it creates the account.',
          'Records show the document a record holds, where you can read it, replace it or take it off.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'The bar under a card no longer opens by saying "Saved" next to a button reading "Save updates". The card was already saved and that button never saved it: it rewrites assets that were drafted before your change. It now says which assets are behind and offers to rewrite them.',
        ],
      },
    ],
  },
  {
    version: 'v1.36',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'A new channel arrives unconnected, and you draw the line to the brief yourself. The line from the campaign to a channel is drawn for you rather than by you, so it appeared the instant the channel did and the shape of the flow was decided before you had a say in it. Adding a channel now gives you the channel and its assets, and connecting it to the brief is your move.',
          'Connecting it is the ordinary gesture: drag from the campaign brief to the channel, or open the channel and use "Connect it to the brief". Until you do, it takes nothing from the brief, which is what not being connected has always meant here.',
          'Two things still connect themselves, because the click that made them already said where they belong: a channel added from an asset\'s ＋ hangs off that asset, and assets added to a channel you already have join the channel they are part of.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'Dragging a line from the campaign brief to a disconnected channel now reconnects it. It used to store a backwards connection instead and leave the channel cut off, so the one gesture for putting the line back was the one that did not work, and the board came away carrying a stray line that said nothing the original had not. It reads the same either way round now, and stores nothing, because restoring the line is the whole of what it does.',
        ],
      },
    ],
  },
  {
    version: 'v1.35',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'The grid said "No brand picked" on assets that plainly had one. Made from worked out the brand by matching each asset\'s client against your brand records by name, and never looked at the Brand card itself, so an asset whose client was never set, or whose brand had been renamed since, read as having no brand at all. The Brand card was on the canvas, wired to the brief, and shaping every word of the copy. It even showed up further down the same cell under "also reaching this asset", which is how you could tell the column had seen it and refused to count it. It now falls back to the card, the way every other kind already did.',
          'Two more places where one asset\'s records could be written to all of its siblings: naming a card that was already wired to a channel, and editing a channel\'s records. Both now apply the change to each asset from its own set, and a channel reports the records every one of its assets shares rather than whichever asset happened to be first.',
        ],
      },
    ],
  },
  {
    version: 'v1.34',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'A campaign you have started but not generated yet now exists. It appears on the Campaigns page under Drafts the moment you start it, reading "0 channels · 0 assets" until you build it, and it opens again exactly as you left it. Until now a campaign only became real when it was generated: everything before that was held in one shared slot and recorded nowhere, so going back to the Campaigns page showed nothing and the work looked like it had never happened.',
          'Worse, starting another new campaign blanked that shared slot, so the cards on the previous unbuilt campaign were destroyed rather than merely hidden. Every campaign now has its own board from the start, so there is nothing shared left to overwrite.',
          'Cards also survive being built. They used to be handed from the builder\'s slot to the campaign\'s own, and anything that did not make the trip was gone; there is no handover any more, because the board was the campaign\'s all along.',
          'Naming a campaign in the brief renames the campaign itself, rather than a name held to one side and applied at generation. Starting a campaign and backing out of it leaves an "Untitled campaign" you can delete, which is the trade for never losing work you can see.',
        ],
      },
    ],
  },
  {
    version: 'v1.32',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'A Pattern card can be wired to a single asset, and the board now says so. Dropping a connection on one post has always applied to just that post, but an asset card was the only card on the canvas that never lit up under a line, and everything that is not a target dims while you drag, so the board actively said you could not land there. Asset cards now highlight like every other target.',
          'Each target says what landing on it would do: attach to this campaign, apply to every asset in this channel, or apply to this asset only. The ring could say "this one" but not that a channel feeds everything under it while a post feeds only itself, which is the whole reason to drop on one asset.',
          'Pattern has its own button in the toolbar instead of sitting behind the Message caret. Every other card in that group answers what the copy says; a Pattern answers how it is built, and it is the one you reach for while looking at a single post.',
          'The Pattern card looks like what it is. It carries a wave across its head, and it shows the kind of pattern (hook, format, trend) and its example line, because "Teardown" and "Objection-first" are names for structures and the structure is the thing you are choosing between.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'Wiring a card to a channel no longer copies one asset\'s records onto its siblings. Every asset in the channel was given the same set, built from whichever asset in the group happened to have its own records already, so pinning a pattern to a single post and then wiring anything to that post\'s channel handed that pattern to every other post too. The grid then listed assets as made from records the canvas showed no connection for, which is where the two surfaces stopped agreeing. Each asset now keeps its own.',
          'Unwiring has the same fix, and it was the more costly direction: removing a card from a channel rebuilt every asset in it from one asset\'s records, so records that a single asset alone carried a connection for disappeared from it. A record is now only dropped from an asset when nothing else still reaches that asset with it, including its own connections and the campaign brief.',
          'A card naming a pattern that has since been archived no longer reads as empty. The picker hides archived patterns so it cannot offer a shape that generation drops, which meant such a card showed nothing selected while it was still wired and still feeding the copy. It now shows the pattern it names, marked archived. A card that names nothing is still never offered one.',
        ],
      },
    ],
  },
  {
    version: 'v1.31',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Dragging on the canvas is no longer doing several times the work it can show you. A mouse or trackpad reports its position far faster than a screen can redraw, and the board was rebuilding itself for every one of those reports: on a 180-card canvas each report cost a full rebuild, and a fast pointer sends two or three of them between one frame and the next. A report now costs nothing at all, and the board rebuilds once per frame, which is as often as you can actually see. The heavier the board and the faster your pointer, the more of that work was being thrown away.',
          'Panning and marquee selection went the same way, for the same reason. All three gestures still land exactly where you let go: the last position is applied on release rather than left waiting for a frame that never comes.',
          'Cards that move together stopped being counted one at a time. Asking "is this card moving?" walked the whole list of dragged cards, once per member and once per connector, on every frame, so the bigger the group the more it cost to move it. It is a direct lookup now.',
        ],
      },
    ],
  },
  {
    version: 'v1.30',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'A card on the canvas now shows what it is pointing at, not just a dropdown of names. Pick a concept, an audience, a pattern or a proof point and the card reads as that record: its name, and the one line underneath saying what it is. A card with nothing behind it says so plainly, so an empty card is visible from the board instead of turning up missing in the copy.',
          'The picker itself shows those lines too. Choosing between "Ladder", "Open loop" and "Third rail" used to mean already knowing what all three were, because a dropdown could only offer their names. Every record now comes with its own description, and a library big enough to scroll comes with a search box.',
          'The name field is gone from the card, because the record already carries the name. It was a second place to write the same word, and the two drifted apart the moment either changed. Naming a card something the library should not be called is still there, in the inspector, where it is a deliberate act rather than the first thing a blank card asks you for. A sticky note keeps its name field, having no record to inherit one from.',
          'Making a record you do not have yet is still one gesture from the card, and unlinking one is now an option on the list rather than a blank row at the top of it.',
        ],
      },
    ],
  },
  {
    version: 'v1.29',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Every asset has a CTAs field: the buttons, forms, inputs and functionality that have to be built into it. Open any asset from the canvas, the grid or the calendar and it is there under the copy. Each entry carries what kind of thing it is, the words on it, where it takes you, a note on what has to be built, and a tick for whether it exists yet, so a spec turns into a checklist without leaving the asset.',
          'The journey says what it costs. Every line out of an asset is a promise that somebody builds a control at this end of it, and the board has always drawn the line without naming the price. Now an asset with a link nothing accounts for lists the gap and proposes the entry, read off where the line goes: a page you can link to needs a button, an email or an SMS needs a capture and a consent because there is no link to an inbox, a person needs a booking, a file needs the download and the gate you trade it for, and a webinar or an event needs a registration.',
          'It suggests, it never fills anything in. Nothing is written to an asset until you press Add, because the campaign cannot know the capture already lives in your site header. Point a CTA somewhere else and the old gap reopens; point one at an asset that has left the campaign and it says so, rather than leaving a button that leads nowhere.',
          'The CTA field and the CTA copy are separate on purpose. The copy is the words; this is the mechanism they sit on. An asset can carry three buttons and one line of CTA copy, and a form with no fields decided is a build task whether or not anybody has written its label yet.',
        ],
      },
    ],
  },
  {
    version: 'v1.28',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'A card wired to a deliverable while you are still building the campaign now reaches the copy. A deliverable has one identity while you are configuring it and another once it is a group of real assets, and nothing translated between the two, so every line drawn in the builder pointed at something the finished campaign had never heard of. Two things followed and each hid the other: the records never reached the writer, and the line itself was deleted the next time the campaign was opened. What was left was an Audience card sitting on the canvas with no line and no effect on a word of the copy.',
          'Naming a card after you have wired it works in that order now. Drop a card, wire it into an email, then say which audience it is: the record reaches that email. Before this, the wire was checked for records once, at the moment it was drawn, and a card that was still blank at that moment was never asked again.',
          'The context toast stops asking for a card that is already on the board. When something is missing it now says which of the three things is actually wrong: the card has no line to the brief, or it names no record yet, or the brief is fine and every asset is overriding it. The button matches, so it wires or opens the card you have instead of adding a second one beside it.',
        ],
      },
    ],
  },
  {
    version: 'v1.27',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Closing a campaign tab closes the tab, and does nothing else. With several campaigns open, tidying one away could throw you off the Campaigns page and into a different campaign\'s board. The strip was moving you whenever the tab you closed happened to be the campaign you had opened most recently, and that is remembered long after you have gone back to the index, so a close that should have been housekeeping read as being sent somewhere.',
          'It could also change which brand you were looking at. The campaign it jumped to was simply the next tab along, and opening a campaign scopes the workspace to its brand, so a close could quietly narrow the Campaigns page to one brand and take every other brand\'s campaigns off it. Nothing had been deleted, but the page had emptied. A close now stays within the brand you are in, and leaves an "all brands" view showing all brands.',
          'Closing the campaign you are actually looking at still moves you, because what you were reading has gone: to another tab of the same brand, or back to the Campaigns index when that was the last one. Previously the last tab left you standing on the board of the campaign whose tab you had just closed, with nothing in the strip pointing at it.',
          'A campaign only ever leaves the Campaigns page when it is deleted.',
        ],
      },
    ],
  },
  {
    version: 'v1.26',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'The pattern picker is gone from the asset panel. Opening a single email used to offer a list of alternative copy patterns, which let one asset step out of the arc its siblings were written to and quietly rewrote its copy the moment you clicked. Choosing a pattern is a decision about the channel, so it now happens in one place: the channel card, where it sets the arc for everything in it.',
          'The asset panel still tells you where the asset sits. The step block stays, so you can see which pattern this one is part of, which step it is, its subject formula, framework and CTA, without a control next to it that rewrites the copy when read as a label.',
        ],
      },
    ],
  },
  {
    version: 'v1.25',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'The website channel has a Login page type. It sits alongside the homepage, pricing, solutions, comparison and about pages, and it can be picked from the Type dropdown or dropped straight onto a canvas from the Web palette. Until now the only honest way to plan the page every returning customer actually uses was to file it under the generic "Web page" and write the difference in a note.',
          'A login page is briefed as a door rather than a pitch. It asks for a page title, a supporting line, the sign-in button, the forgot-password link, the prompt for someone who does not have an account yet, the message shown when a sign-in fails, and a line pointing at help. The website default would have asked for social proof, a mid-page CTA and objection handling, which is a lot of persuasion aimed at somebody who has already bought.',
          'It also sits in the right part of the funnel. Website pages default to consideration because that is what they are doing, but a login page is talking to existing customers, so it resolves to retention and stops being counted as a page that has to win the argument.',
        ],
      },
    ],
  },
  {
    version: 'v1.24',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Campaigns can be taken all the way to the close. There is a new Sales & commerce group of channels: sales outreach (cold emails, follow-ups, sequences, call scripts), sales collateral (decks, one-pagers, battlecards, ROI calculators), proposals and quotes, checkout (cart, checkout, plan selector, order bumps) and post-purchase (confirmation pages, onboarding, review requests, referral offers). Until now the last thing a flow could contain was a landing page, so every campaign stopped one step short of the thing it was for.',
          'The conversion stage has somewhere to land. Three channels used to resolve to conversion, all of them media or a page, which is why the stage looked thin on a campaign that was converting perfectly well offline. A proposal, a checkout and the collateral worked in a live deal now sit there as first-class assets, and a pricing or comparison page is read as a decision surface rather than as education.',
          'The Opp band is no longer empty. The demand-gen and sales-led playbooks drew that band with nothing in it because no channel existed that could honestly land there. Proposals and sales collateral now fill it, and outbound campaigns start where they really start, with the rep\'s first email in Contact rather than folded in with the follow-ups.',
          'Each new channel arrives with the rest of what a channel needs: its own copy fields (the ask on an outreach email, the terms on a proposal, the guarantee on a checkout), its own UTM convention, and its own tracking checklist, which for these is the CRM and the store rather than an ad pixel.',
        ],
      },
    ],
  },
  {
    version: 'v1.23',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Campaigns opens with your campaigns in it. The page used to paint once before your work had loaded, so for a moment it said "0 campaigns" and offered to start your first one, and then the cards and their channel counts appeared underneath that. Nothing was ever wrong with the data; the page was simply answering a question it could not yet answer, and the correction is what read as a glitch.',
          'The workspace is now read before the first frame rather than just after it, so there is no empty state to correct. Where the work genuinely does have to be fetched, the page stays quiet until it arrives instead of claiming you have nothing.',
        ],
      },
    ],
  },
  {
    version: 'v1.22',
    dateLabel: 'August 4, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Patterns are a card on the canvas. The Patterns library has been in Records all along, holding the hooks, formats and structures your content leans on, and nothing could reach for one. There is now a Pattern card in the palette: drop it, pick a pattern or write a new one, and wire it to the work it shapes.',
          'A pattern applies to a single asset, which is the point of it. Every other input on the board is true of the whole campaign: one brand, one audience, one message argued across twenty posts. A shape is not. Wire a Pattern card straight to a post, or add one from that asset’s "Made from" cell in the grid, and that one asset is written to it while the rest of the campaign is not.',
          'Wire a pattern to the campaign instead and it rotates. Three patterns on the brief means the set spans three shapes rather than twenty posts built the same way, so choosing patterns is how you choose how much the work varies.',
          'A pattern governs how an asset is built, never what it claims. The audience, the proof and the goal are unchanged by it, and a pattern is overruled where following it would write a line your brand guide forbids or the sentence an audience must never be told. Where a pattern carries an example, it is read as a demonstration of the form, not as copy to reuse.',
          'Archiving a pattern retires it properly. It stops being offered on cards and in the grid, and it stops reaching the writer even where a card wired to it is still on the board. A pattern marked "testing" keeps working, because testing one is what using it means.',
        ],
      },
    ],
  },
  {
    version: 'v1.21',
    dateLabel: 'August 4, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Select a card on the canvas and the board shows its trail. Everything that led to that card stays lit, everything it leads on to stays lit, and the rest of the board fades back. On a campaign with six channels and thirty posts, the chain that produced the asset under your cursor used to be buried in the thirty that did not, because every line on the board looked like every other line.',
          'The two directions are told apart. The route back to the asset is drawn in the accent colour: the channel it hangs off, the brief above that, and the brand, audience and message cards wired into the brief, however many steps back it goes. The route forward is drawn in blue, so a follow-up that branches off an asset reads as what comes next rather than as more of what came before.',
          'It works from any card, not just an asset. Pick a brand or an audience card and the board lights every piece of work it reaches, which is the quickest way to see what one piece of context is actually shaping. Click the background to put the whole board back.',
        ],
      },
    ],
  },
  {
    version: 'v1.20',
    dateLabel: 'August 4, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Concept and Season cards can make the record they need. Every other card on the canvas could already pick an existing one or add a new one from the same dropdown; these two could only pick, so on a brand with no concepts written yet the card read "No concepts yet" and there was nowhere to go from it. Both now offer "+ New concept…" and "+ New season…", the same one-step move.',
          'Naming a new record from a card selects that card, so the panel that gives it the rest of its context is already open beside you rather than one more thing to go and find.',
          'You type the name once. The card takes the name of the record it points at, so a card you have not separately named still reads "The quiet upgrade" on the board, in Layers, in the grid and in the list of what is informing the campaign. Name the card itself only when you want it to say something different there.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'A Concept card wired into a campaign no longer has to sit there reading "Nothing picked yet" with no way out of it. That row under "Informing the messaging" was telling the truth: the card was contributing nothing, because the only thing it could do was pick from a list that was empty.',
        ],
      },
    ],
  },
  {
    version: 'v1.19',
    dateLabel: 'August 4, 2026',
    groups: [
      {
        tag: 'Improved',
        items: [
          'Cards on the canvas are the colour of the work they are. The toolbar has offered eight motions for a while, each with its own colour: social blue, email teal, content violet, web orange, paid red, video purple, lead magnet gold, events teal. The cards those buttons made ignored all of it and came out the same blue, with the same purple under them, so a board of thirty cards was one colour and told you nothing until you read every label. A channel card now wears its motion, and its posts wear a lighter wash of the same one, which means a board sorts itself into paid, email and web at a glance. Selecting a card rings it in its own colour too.',
        ],
      },
    ],
  },
  {
    version: 'v1.18',
    dateLabel: 'August 4, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Group cards on the canvas. Select two or more, then Group (⌘G, or right-click) and they hold together: click one and you get them all, drag one and they all move, keeping the arrangement you built.',
          'A group is framed and named on the board, so a launch set or a test cell reads as one thing. Double-click the name to rename it, and drag the frame label to move the whole group.',
          'Groups are saved with the campaign, along with where their cards sit, so the arrangement is still there when you come back. Ungroup with ⌘⇧G; the cards stay exactly where they are.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          'A selection box now takes whole groups: catch one card of a group and you have the group, so a drag can never pull half of one out of shape.',
        ],
      },
    ],
  },
  {
    version: 'v1.17',
    dateLabel: 'August 4, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Clicking a connector dot on a card opens the channel picker. The dot says "draw a connection", and until now the only thing it did was start a drag: press it, let go, and nothing happened at all. It was the one control on the board that answered a click with silence. A click now asks the question the dot implies, which is what comes next from this card, and answers it with the full list of channels, anchored to the dot you pressed. Dragging is unchanged: drop on another card to connect the two, drop on empty canvas to think better of it.',
          'Picking a channel this way inside an open campaign makes real assets, branched off the card you started from, the same as the card\'s + button already did. The picker and the + now go to the same place.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'Six channels are pickable that never were. X Ads, Pinterest Ads, Snapchat Ads, Reddit Ads, Google Demand Gen and Push were defined everywhere the app counts channels, carried their own ad formats, and reported in the channel mix, but no picker ever listed them, so there was no way to plan anything on them. All 27 channels now appear in the picker, and a test fails if a new one is ever added without one.',
        ],
      },
    ],
  },
]

const TAG_CLASS: Record<Tag, string> = {
  New: 'chlog-tag-new',
  Improved: 'chlog-tag-improved',
  Fixed: 'chlog-tag-fixed',
}

/**
 * Every way out of this page goes to "/", and each one used to PUSH a history entry — which left
 * the changelog sitting directly behind the app. The app is one document with no routing of its
 * own, so that made the changelog the target of any stray back gesture: a two-finger scroll with a
 * little sideways drift on the Grid or a flow would blow the whole session away and hard-load this
 * page. Replacing the entry instead means leaving here is a return, not a step deeper, and nothing
 * in the app has the changelog behind it.
 *
 * Modified clicks (cmd/ctrl/shift/alt, middle button) are left alone so "open in a new tab" still
 * works, and the href stays real so the links remain links to the browser and to assistive tech.
 */
function leaveToApp(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  window.location.replace('/')
}

export function ChangelogPage() {
  useEffect(() => {
    const prev = document.title
    document.title = "What's new · Breadcrumbs"
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <div className="chlog">
      <header className="chlog-nav">
        {/* The left slot used to hold a "What's new" pill, which named the page you were already
            looking at — the <h1> below says that, and says it louder. A way back to the sign-in
            field is the thing this page actually lacked. */}
        <div className="chlog-nav-side">
          <a className="chlog-back" href="/" aria-label="Back to login" onClick={leaveToApp}>
            <span className="chlog-back-arrow" aria-hidden="true">
              &larr;
            </span>
            <span className="chlog-back-label">Back to login</span>
          </a>
        </div>
        {/* The splash wordmark, not the flat one — this page is the first thing a logged-out
            visitor sees after the sign-in field, so it should be wearing the same face. */}
        <a className="chlog-brand" href="/" aria-label="Breadcrumbs home" onClick={leaveToApp}>
          <img className="chlog-brand-logo" src="/login-logo.svg" alt="Breadcrumbs" />
        </a>
        <div className="chlog-nav-side chlog-nav-right">
          <a className="chlog-open" href="/" onClick={leaveToApp}>
            Open app
          </a>
        </div>
      </header>

      <main className="chlog-main">
        <div className="chlog-head">
          <h1 className="chlog-eyebrow">What&rsquo;s new</h1>
          <p className="chlog-sub">Updates, new features, and fixes.</p>
        </div>

        <div className="chlog-feed">
          {RELEASES.length === 0 ? (
            <p className="chlog-empty">
              Nothing here yet &mdash; the next release will show up here.
            </p>
          ) : (
            RELEASES.map((r) => (
              <section className="chlog-entry" key={r.version}>
                <time className="chlog-date">{r.dateLabel}</time>
                {r.groups.map((g) => (
                  <div className="chlog-group" key={g.tag}>
                    <span className={`chlog-tag ${TAG_CLASS[g.tag]}`}>{g.tag}</span>
                    <ul className="chlog-items">
                      {g.items.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </main>

      <footer className="chlog-foot">
        <Wordmark height={16} />
        <span className="chlog-foot-tag">Leave a trail worth following.</span>
        <a className="chlog-foot-link" href="/" onClick={leaveToApp}>
          Open Breadcrumbs
        </a>
      </footer>
    </div>
  )
}
