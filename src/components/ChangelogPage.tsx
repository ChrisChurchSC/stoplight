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
    version: 'v1.39',
    dateLabel: 'August 5, 2026',
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
    version: 'v1.38',
    dateLabel: 'August 5, 2026',
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
