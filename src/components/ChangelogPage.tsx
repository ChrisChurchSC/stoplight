import { useEffect } from 'react'
import { Wordmark } from './Wordmark'

/**
 * A public, unauthenticated changelog ("What's new"). Rendered directly from main.tsx when the
 * path is /changelog, BEFORE the AuthGate and store load, so anyone can read it without signing
 * in (same idea as the anonymous ?share= viewer). Self-contained: only the wordmark and the
 * RELEASES data below, styled with the .chlog-* block in index.css. Dark, monospace-labelled,
 * flat entries: date, then a tag chip per kind of change, then the bullets.
 */

type Tag = 'New' | 'Improved' | 'Fixed'
interface Release {
  version: string
  dateLabel: string
  groups: { tag: Tag; items: string[] }[]
}

// Newest first. Each entry is one shipped release, grouped by the kind of change.
const RELEASES: Release[] = [
  {
    version: 'v1.10',
    dateLabel: 'July 28, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Gretel no longer says it did something it has only suggested. It was told to lead with what it did and to tick each item off with a check mark, while nothing it returns is applied until you press Apply, and some of it is refused even then. So a proposal arrived reading "✓ Set campaign length to 6 weeks" above the Apply button that had not been pressed yet. It now says what it will do, and the check marks appear only in the app’s own report of what actually landed.',
          'Gretel can change the length of a campaign that is already built. Asking for it was refused as "not available on a campaign that is already built" while the stepper in the brief two panels away did exactly that. The command was missing from the saved-campaign path rather than withheld from it, the same way the budget was already handled.',
          'The toolbar says what is left to spend. A balance readout sits next to Generate, showing the model account\u2019s remaining credit and turning amber under a dollar, with the exact usage on hover. It reads the provider account rather than an app ledger, because there is no app ledger, so it is shown honestly in dollars. When the balance cannot be read at all \u2014 no key, no connection \u2014 it shows nothing rather than a zero.',
          'A campaign with nothing wired up will not generate. The audience and proof pools fall back to the brand\u2019s whole library when nothing pins them, so an unwired campaign used to generate happily by rotating everything the brand owns: copy written from no stated context, which reads plausible and answers to nothing. It now says so and asks you to draw a line from a card first.',
          'What the writer is told comes from the board. Generation was still reading the campaign\u2019s stored record list to decide which audience each asset speaks to, which proof it cites and which personas it gets, so records with no card behind them were shaping the copy long after the panel had stopped showing them.',
          'A deliverable inherits what the campaign is wired to, not what it has stored. Brand objects are a library you pull onto a campaign, so one counts only once a card on the canvas connects it, and that rule now holds all the way down: a deliverable with no override of its own used to inherit the campaign’s whole stored set, which is how records with no card behind them still reached the assets and still decided who a new deliverable was written to.',
          'A record is linked when a card carrying it is wired to the campaign, and at no other time. An untouched campaign used to link every one of the brand’s audiences by default, the picker and the assistant could pin records with no card behind them, and all of it showed on the brief under "Linked directly" while steering every draft. One campaign had 51 records listed this way, and 377 were spread across eight. What the writer is told now comes from the board, so the panel and the copy agree on one answer.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          'A Message card is edited on the card. It could already name a message and could carry a claim, but it was the one record-linked kind with no form on it: you picked a message, then went to Records to say what it actually was. Angle, the proof behind it, who it lands with, pillar, funnel stage and status now sit on the card, the same way Audience, Person, Company, Trigger, Brand and Product already did. A message is created the moment you first type, scoped to the brand in view.',
          'Dark mode, with a Light / Dark / Auto control in the account menu. Auto follows your system. Channel previews stay light on purpose \u2014 they are simulating Instagram, YouTube and LinkedIn, which are white, and darkening them would misrepresent the platform.',
          'Pick the model on the toolbar, next to the button it governs. The choice lived only on the campaign brief, so changing it meant a trip to another panel and the model you were about to generate with was invisible at the moment you pressed Generate. It now sits beside that button, showing the current pick, with each option naming what it is good for. Same setting either way, so the brief and the toolbar stay in step.',
          'The canvas dots belong to the board, not the screen. They were a fixed backdrop the cards slid over: zoom in and the grid stayed put while everything on it grew. The dots now scale and pan with the board, and thin out as you zoom far enough out that they would compete with the cards.',
          'The left rail is smaller, and inside a campaign it is icons only. Files, Assets and Gretel never change and never grow, so their labels were repeating what the icon already said on the screen you spend the most time on: that rail is now 52px instead of 76px, and the canvas keeps the difference. Hovering still names each one. Everywhere else the rail keeps its labels and just gets tighter, 76px down to 68px with shorter rows.',
          'The campaign brief is edited the same way as everything else. It reads as a record, with the same rows and the same one searchable dropdown as the Brand and Product cards, in place of the four native menus it used to carry. A campaign and the things it is built from no longer ask for their answers in two different shapes.',
          'The brief stops asking for its angle twice. The Message angle picker and the Theme box are gone: between them they restated what the campaign name and the objective already say, and the theme box invited a second summary that then had to be kept in step with the other two. The campaign still has a theme, generation still reads it, and Gretel still writes it.',
        ],
      },
    ],
  },
  {
    version: 'v1.9',
    dateLabel: 'July 26, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'A card carries an instruction, and nothing else. Its two pickers are gone: one offered a smart object, the other a single record, and between them the panel asked the same question twice on the card that is itself the answer. ⌘G is how a card becomes a smart object. The kinds with no smart object of their own (message, voice, trigger, season, data source) keep their picker, because it is the only way to point them at anything.',
          'The writer is told what NOT to say. An audience records the objections its copy has to answer and an antiMessage, the sentence never to write, and neither was ever sent: the model could write the exact line you had written down as the one to avoid and pass every check. Both are sent now, and the prompt treats them as binding.',
          'A proof point reaches the writer with its number. Its metric and its source were dropped, so “lean on this proof” arrived without the figure that makes it proof or the citation that makes it safe to state.',
          'Your campaign objective reaches the copy. It was used only when the campaign had no subject and no message, so it was dropped precisely when the campaign was best specified. It now rides in the throughline with its KPI.',
          'You are told when copy was written offline. If the AI cannot be reached, the app falls back to templates built from your own brand and audience, and until now it did that silently: a dead key, a large campaign timing out, or a rate limit mid-batch all produced copy that looked exactly like the real thing. A notice now says so, and it clears the moment a generation succeeds.',
          'An object card shows what it applies to, and can rewrite it. “Applied to” names every deliverable and post the card feeds, including ones it reaches through other cards, and one button rewrites exactly those assets so you can change an instruction and see its effect without regenerating the campaign.',
          'Instruction fields suggest values from your own records. A blank “Lean on this pain” now offers that audience’s recorded pains, a claim offers your brand’s differentiators, a figure offers your proof pool. Nothing is invented: every suggestion is something you already wrote, so a thin library offers nothing rather than a plausible guess. Typing your own is always there.',
          'Cards have comment threads. Leave a question on a card, reply to it, resolve it when it is settled, and the card shows a count of what is still open. Comments are for your team and never reach the writer, which is what keeps them separate from the note.',
          'Gretel wires them too. “Their objection is that migration eats two quarters, make the nurture emails answer it” puts an objection card on the board and wires it into the nurture emails: those emails are written to answer it and the rest of the campaign is not. One sentence, and it was impossible before, when a single campaign-level objection reached every asset or none.',
          'Gretel puts cards on the board. Tell it “our anglers think switching costs them a whole season, and our claim is that live data beats a forecast” and it proposes an audience card carrying that pain and a message card carrying that claim, linked to your real records, for you to approve. It can also sharpen a card already there, and set the model the campaign writes with.',
          'A wire decides which instruction reaches which deliverable. Draw an audience card into a message card and the message into your nurture emails: the emails are written to that pain and that claim, and the social posts on the same campaign are not. What a card says travels to everything downstream of it, up to four hops.',
          'Every card, deliverable and post shows "What this will be told" — the instructions that actually reach it once the wires are walked, and how many were dropped, since an asset carries one instruction per kind.',
          'Each card carries its own instruction. Two audience cards on one campaign now hold two different pains: direction was stored per campaign and per KIND, so a second audience card showed you the first one’s text and overwrote it the moment you typed. Anything written before this still shows, inherited, until you replace it.',
          'Pick the model a campaign writes with, on the campaign brief. A launch announcement and an always-on blog run do not deserve the same model, and the cost difference between them is the whole reason to choose. Auto keeps the workspace default.',
          'Objectives are a list you choose from. Ten standard ones, each bringing the metric it is measured on. The control used to offer only objectives somebody had already written in Records, and hid itself entirely when there were none, so a new brand could not say what a campaign was for at all.',
          'A wire from a card to a deliverable or a post survives leaving the campaign and coming back. It was being deleted on load, so the records it had written stayed on the assets while the wire that explained them vanished and could never be undrawn.',
          'A card wired straight to a deliverable or a post informs just that one. You could already draw the line and it was already saved; nothing acted on it, so it looked connected and changed nothing.',
          'You can zoom out far enough to see a whole campaign, and "Fit to board" works out the zoom for you. The floor was 25%, which was not far enough: ten deliverables with their posts run past 4,000px, so a real campaign needed about 17% and the only way around it was to pan and remember. It goes to 10% now.',
          'Type the asset count. Getting a deliverable from 4 assets to 16 was twelve clicks on a + and the number was the one thing on the panel you could see but not say. Type it and hit Apply and it changes in one go, rewriting every post from the current brief so the result reads as one deliberate run rather than four originals and twelve clones. The steppers stay for a nudge of one.',
          'Every card in the inspector says what OBJECTS inform it, not which records are linked. A deliverable shows the cards wired to the campaign it inherits from, or exactly what it pins when you override it.',
          'A smart object can be filed into folders in the Assets panel: right-click it, or drag it onto a folder. Drag it onto the canvas instead and it is placed there. Brand folders hold smart objects and nothing else now, rather than doubling as a second list of campaigns to open.',
          'A smart object can be opened as its own tab, beside your campaigns and data sets. It stays open while you move between campaigns, so an object can sit next to the campaign using it. Double-clicking one on the canvas still opens it in place, with a breadcrumb back.',
          'The campaign brief says what is informing the messaging, not which records are linked. It lists the cards wired to the campaign card, each naming what it contributes, and clicking one selects it on the canvas. The record list was a readout of a consequence: it told you a contact was linked but not that it arrived inside a smart object, nor which card to open to change it. A record that reaches the campaign with no card behind it still shows, under its own heading, because it steers every draft either way.',
          'Folders nest, four levels deep. A folder can hold folders, so fifty campaigns organize the way you actually think about them: a quarter, then paid inside it, then the channel. Drag a campaign onto any folder at any depth to file it. Renaming a folder keeps everything inside it; deleting one takes the folders inside it and leaves every campaign, unfiled.',
          'The assistant is called Gretel.',
          'A deliverable starts with one asset instead of a month of them. Dropping an Instagram reel used to put four assets and four briefs on the board before you had decided anything. The cadence is still there as the suggested default, and the count control adds more when you mean to.',
          'The campaign trail reads as two small buttons with a flag, matching the campaign card it points at, and an unnamed campaign no longer offers a dropdown onto a list of campaigns you are not in yet.',
          'Your board survives. The objects you place, the smart objects on the canvas, where you put them and the lines you draw between them are saved per campaign, so they are still there after a reload, after switching campaigns, and on a second device. Before this, closing the tab lost the lot.',
          'An object now changes the copy. Open one and it asks one or two things about this campaign: which pain an audience object leans on and which objection the copy must beat, the claim a message object asserts and the near-miss to avoid, the figure a proof object cites, the line a voice object should sound like. What you write is sent to the writer for every deliverable that object is wired to, and the preview rewrites itself as you type.',
          'An object asks for an instruction, not a definition. What an audience IS still lives on the record, edited in Records, one definition for the brand. What it means for THIS campaign lives on the object. The free-text note stays, moved to the bottom and labelled, because it is for your team and is never sent to the writer.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'A deliverable no longer jumps when you change its asset count. Two causes: the card sat centred in the space reserved for its posts, so adding one slid it half a post down under your cursor; and deliverables were ordered BY ASSET COUNT, so taking one from 3 to 5 made it leap over its neighbours. They read chronologically now, by when their first asset goes out.',
          'A deliverable no longer jumps when you change its asset count. Two causes: the card sat centred in the space reserved for its posts, so adding one slid it half a post down under your cursor; and deliverables were ordered BY ASSET COUNT, so taking one from 3 to 5 made it leap over its neighbours. They read chronologically now, by when their first asset goes out.',
          'Connector endpoint dots no longer draw over the toolbar. The layer they sit on was raised above the cards so a dot would not tuck behind a card edge, and the toolbar had no stacking order of its own, so the dots came through it.',
          'Keyboard shortcuts no longer fire out of a dropdown. Pressing b in the inspector’s audience or smart-object menu to jump to an option also fired the canvas shortcut: the inspector closed and the deliverable picker opened. Backspace in the same menu deleted the selected card. Space now presses a focused button instead of panning, and a keystroke inside an open dialog no longer reaches the canvas behind it.',
          'Cards are no longer greyed out on a canvas with no campaign card. Dimming marks a card as not yet part of the campaign, so with nothing to attach to it greyed out everything at once. Hiding the campaign card also used to leave the cards attached beforehand at full strength, so brightness came to mean “you made this before you deleted the brief”.',
          'A smart object holding no records stops posing as an audience. Bundling a message card and a note produced an object filed as an audience, so it was offered by every Audience picker in the app. An object with no records now belongs to no record picker, and it reports what it holds instead of calling itself empty.',
          'Your copy is written by the model the app intends, not the cheapest one. Every handler asked for a specific model and no provider honoured it: the OpenRouter path threw the request away and ran the tier default, and the direct path forwarded it and ignored the tiers entirely. Copy and planning now sit on Sonnet rather than the bulk-extraction model.',
          'Editing a smart object now actually reaches the campaigns using it. The card showed the change everywhere on sight, but attaching one copies its records onto the campaign, and those copies were left behind: campaign B displayed the new version and still generated from the old one.',
          'Taking one record out of a smart object no longer detaches the rest. Removing a single proof point also dropped that object’s audience and message from the campaign.',
          'Input cards placed before you hit Build survive it. The board was saved under a slot for the not-yet-named campaign and never handed over, so opening the campaign you had just built loaded an empty canvas over the top of your work.',
          'Delete works on a built deliverable. Selecting one and pressing Delete did nothing at all, and there was no ✕ or menu item either. Deleting a deliverable now takes the posts under it, because that is what a deliverable is, and it undoes in one step. A single post can be deleted on its own.',
          'Your brand hooks reach the writer. They were being sent with every draft and dropped by the server, so the opening lines you wrote only ever influenced copy when there was no API key.',
          'An asset told to lean on a specific proof point can now actually cite it. The proof was picked from your whole library while a narrower list was sent to the writer, so it could be pointed at evidence it was not allowed to use.',
          'Copy written to an audience you keep in the audience selector is no longer flagged as drifting off-segment. The coherence check was reading a different audience list than the writer was.',
          'Em dashes no longer slip into generated copy. The instruction was in the prompt and the model mostly obeyed it, but nothing enforced it, so the occasional one reached the page.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          'The campaigns page is campaigns and folders, nothing else. Flights are gone from it. A campaign with more than one scheduled run used to pretend to be a folder and drill into a list of runs, which meant the only way to get a folder was to schedule a second run of something. Real folders replace it, and the length of a campaign is now called its length.',
          'Cards are called objects. One thing on a campaign board is an object: an audience, a message, a proof point, a note. Bundle a few and you get a smart object, which is the same word Photoshop uses for the same idea, and it makes the next part say what it means.',
          'A smart object now says whether it lives in this campaign or in your brand folder, and it is true rather than aspirational. ⌘G makes one local to the campaign you are on: edit it freely, nothing else uses it. When it earns reuse, "Add to the brand library" moves it, and from then on it wears a chain, shows where it was promoted from, and an edit reaches every campaign using it. Your brand folder now lists what is in it. Before this, everything anyone bundled anywhere joined the brand library the moment it existed, so the library filled with one-offs.',
        ],
      },
    ],
  },
  {
    version: 'v1.8',
    dateLabel: 'July 25, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Make a record from the card that needs it. Every card that links a record now offers "+ New ...": name it, and the record is created and linked in one step. Before this, a brand with no audiences dead-ended at "No audiences established yet" with nowhere to go. Creating a name that already exists reuses it rather than making a duplicate.',
          'Connecting a card to the campaign is how you attach it. Draw a line from an audience, a proof point, a company or a contact to the campaign card and it joins the campaign, which means the writer uses it. Delete the line and it is unlinked, but the card stays on the board. Connect a smart object and everything inside attaches at once. A card sitting on its own is a draft thought, and now looks like one.',
          'Drawing a connection now shows you where it will land. The card under the line lights up, everything else steps back, and dragging onto the campaign says "Attach to this campaign" so you know what releasing will do.',
          'The inspector lists every card on the board as layers, grouped by what each card does and using the same three words as the toolbar. Each row carries its own mark: a deliverable shows its channel, a context card its kind. Smart objects nest their contents underneath them, and a context card that is not attached to the campaign says so. Click a row to select that card. It is what the panel shows whenever nothing is selected, in both a new campaign and a built one. It used to list deliverables only, so context cards and smart objects were invisible unless you could see them on the canvas.',
          'Smart objects live in the brand library, so they are reusable across campaigns. A card picks an OBJECT rather than a raw record: a Person card offers your person objects, the ones already on this campaign first, then the rest of the library. Picking one shows what is inside it, and attaching that card to the campaign pulls in everything the object holds, the contact plus the proof and message that go with them.',
          'Smart objects. Press Cmd+G on a card (or right-click, Make a smart object) and it becomes one named card showing what is inside. One card is enough: it is a thing you can name, reuse and add to later. Select several first and they bundle together. Double-click it to open it and work on its members on their own canvas, with a breadcrumb back. It names itself after the record you linked. Ungroup spills the cards back out, and nothing is lost.',
          'The canvas has a right-click menu. It carries the actions that only make sense on a specific card: bundle these, open or ungroup an object, delete.',
          'The canvas toolbar offers what you can add, grouped by what it does: what gets made, what it is made from, and notes. Each button drops the common thing, and its caret opens the rest, so Deliverable holds all eight motions (social, email, content and SEO, web, paid, video, lead magnets, events) and picking one narrows the deliverable list to it. The Add dropdown is gone.',
          'A new campaign starts in one place. The floating "What are you launching?" card is gone and its question now opens Gretel itself, so there is a single front door instead of two that did the same thing. It offers three ways to start a campaign, or a template to drop by hand, and it steps aside the moment the campaign has any shape.',
          'Click any card and you can adjust it in the inspector. Context cards and sticky notes used to fall through to the campaign brief panel; each one now has its own panel with its record picker, its note, and a delete. A Data source card can open its linked data set straight from there.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'New cards land in free space instead of on each other. Every card used to drop at the same point with a step far smaller than the card itself, so they buried one another, ignored where you had panned to, and could land on top of the brief. A new card now takes the first clear spot on screen.',
          'A new card is no longer added to the multi-selection, so dragging one never drags cards you did not mean to move.',
          'Your brand hooks now actually reach the writer. They were being sent with every draft and ignored, so the opening lines you wrote never influenced a single AI-written asset.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          'Deliverable cards no longer carry audience and proof tags either, for the same reason as the campaign card. A deliverable inherits the campaign records, and the per-deliverable override still lives in the inspector, where it reads as the exception it is rather than as two amber "Needs a..." prompts on every card on the board.',
          'The campaign card on the canvas states what the campaign is, and nothing else. Its audience picker, its record tags and the goal card attached underneath are gone: audiences and proof points are cards on the canvas now, and the inspector already held the authoritative Objective and Linked records. Three places to set the same thing meant no clear home for any of them.',
          'Cards are grouped by what a card does rather than by loose topic. What gets made comes first, the context it is made from sits under that in four short groups, and sticky notes come last, with a plain note that nothing downstream reads them.',
          'Cards that get made now look made: a tinted, raised card with a filled label chip, a channel tile and a count. Context cards are flat and recessed with a coloured spine, and one with no record picked yet visibly reads as empty. The campaign brief is the only card with a full-width coloured top edge, so the root of the board is obvious at a glance.',
          'Every individual post on the canvas now carries its own label chip, matching the deliverable above it.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'The Channel asset card is gone. It never linked an asset, only a channel, and a deliverable already names its own channel, so the two overlapped: adding one just picked an arbitrary deliverable for that channel at build. Pick the deliverable you actually want, and tag a channel on the brief for planning.',
          'The Connector tool is called Link, and it left the Add menu, because it is a tool rather than a card. It is still the same button in the canvas toolbar.',
          'Card record pickers no longer read "Link a audience" or "No companys established yet".',
          'Trimmed the campaigns header and the assistant panel: New umbrella and New flight are gone from the header (you can still add a flight from any campaign card), and the Chats row is gone from the assistant panel.',
        ],
      },
    ],
  },
  {
    version: 'v1.7',
    dateLabel: 'July 21, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'The campaign chat now starts with strategy. It asks one thing, what this campaign should do for the brand, then recommends a proven go-to-market motion and sets it on the campaign, so what gets built follows a real plan instead of a default playbook.',
          "The chat can create the pieces you're missing. When a campaign needs an audience or a proof point that isn't in your library yet, it adds a clearly labelled draft for you to fill in, rather than stalling or tagging something unrelated.",
          'Tappable follow-ups under every reply, and when the chat asks you a question, the answers come as chips you can tap.',
          'A proper first run. Breadcrumbs asks two short questions about you, what you work on and how much detail you want, one at a time with nothing else on screen, then takes you straight into setting up your first brand. Draft it from your website, or be walked through it a question at a time. Setup happens on its own quiet surface, so you finish the whole thing in one place and arrive in your workspace once, when there is finally something in it. It only appears for a brand-new workspace.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          'The chat adapts to you. On Simple it proposes a complete campaign in one turn; on Advanced it stays terse and precise. Both lean toward your focus area.',
          'The chat now reads what your brand has already told us (objective, positioning, primary audience), so it stops asking for things the app already knows.',
          'Once a motion is set, the chat moves on instead of asking about strategy again.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          "Deleting a brand now deletes the brand. It used to remove the name and its campaigns while leaving the canvases, timeline flights, library, folders, reports, chats and tasks behind, and because those sync to your workspace they came back on any other device or in a private window. One sweep now, so deleted means deleted everywhere.",
          "The Back button is gone from the sidebar. It only ever restored the page, not the view you were actually looking at, and it pushed every other nav item down a row when it appeared. Use the “Campaigns / <name>” breadcrumb inside a campaign to step back out.",
          'The Brand page no longer shows the first brand’s strategy when the brand you picked has none of its own.',
          "Home looks the same whether or not you have a brand yet. The same actions used to render as two large cards on an empty workspace and as small pills once a brand existed, so the top of the page visibly changed shape the moment you created your first one. One row now, always. It also wraps instead of hiding actions off the edge of the screen.",
          "Home no longer greets a new workspace with six things at once. The focus and detail-level questions moved into the first run, and the walkthrough waits its turn instead of drawing over them.",
          'Picking a focus on a brand-new workspace used to drop you straight onto that role’s working page, which is empty when you have not set anything up. You now land on Home, where the next step is.',
          "Home showed campaigns and tasks on a brand-new workspace. A workspace with no brands yet now always lands on the getting-started view.",
          'Choosing a motion in the chat now sticks, including on an existing campaign and when the motion you picked is Content and SEO.',
        ],
      },
    ],
  },
  {
    version: 'v1.6',
    dateLabel: 'July 21, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Breadcrumbs now fits how you work. Pick a detail level: Simple keeps the surface calm and the fields few, Advanced shows every column, metric, and control. New workspaces start Simple; switch anytime in Settings.',
          'Simple mode condenses the app to the essentials (Home, Campaigns, Timeline, Library), with a "Show everything" reveal so nothing is ever out of reach.',
          'Tell us your focus (email, brand, product, or growth) and Breadcrumbs opens where your work lives, leads with the right strategy, and emphasizes the sections and checklist steps your role cares about.',
          'Quick-start campaign templates, ordered to your focus, so your first campaign is one click away.',
          'A "What\'s new" page (this one), reachable from the sidebar and the sign-in screen.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          "New campaigns follow your brand's own strategy, and your focus, instead of defaulting to a content playbook.",
          'A short first-run prompt asks your focus and how much detail you want, and never nags once you\'ve answered.',
          "The Getting-started checklist now leads with your role's happy path.",
          'If your workspace has a strategy but no focus set, Breadcrumbs suggests one and tells you why.',
          'Your detail level and focus now follow you across devices.',
        ],
      },
      {
        tag: 'Fixed',
        items: [
          'Published items on the timeline can no longer be dragged by accident, so your history stays accurate.',
          'Skipping the focus prompt now dismisses it cleanly.',
        ],
      },
    ],
  },
  {
    version: 'v1.5',
    dateLabel: 'July 17, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'A guided walkthrough points out the essentials the first time you open Breadcrumbs.',
          'Plain-language definitions live throughout the app. Hover any info dot to see what a field means.',
        ],
      },
      {
        tag: 'Improved',
        items: [
          "Brand and Campaign are now cleanly separated. Your brand holds who you are. Each campaign holds what you're running.",
          'Chats moved to the top of the workspace, with a count, so your conversations are easy to find.',
          'A back link appears whenever you open a record from another page, so you never lose your place.',
        ],
      },
    ],
  },
  {
    version: 'v1.4',
    dateLabel: 'July 10, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'Recommend an angle for any audience, drawn from your brand and positioning.',
          'Always-on content lives on the timeline, rotates on a cadence, and nudges you to extend the horizon before a stream runs dry.',
          'A published-content band on the timeline shows what has already gone out, at a glance.',
        ],
      },
    ],
  },
  {
    version: 'v1.3',
    dateLabel: 'July 3, 2026',
    groups: [
      {
        tag: 'New',
        items: [
          'A Gantt-style campaign calendar. Drag a bar to reschedule, resize it to change the window.',
          'Flights: re-run a campaign as a new flight and carry its assets forward.',
        ],
      },
      {
        tag: 'Improved',
        items: ['Expand any campaign to see every asset placed on the timeline.'],
      },
    ],
  },
]

const TAG_CLASS: Record<Tag, string> = {
  New: 'chlog-tag-new',
  Improved: 'chlog-tag-improved',
  Fixed: 'chlog-tag-fixed',
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
        <div className="chlog-nav-side">
          <span className="chlog-nav-active">What&rsquo;s new</span>
        </div>
        <a className="chlog-brand" href="/" aria-label="Breadcrumbs home">
          <Wordmark height={20} />
        </a>
        <div className="chlog-nav-side chlog-nav-right">
          <a className="chlog-open" href="/">
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
          {RELEASES.map((r) => (
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
          ))}
        </div>
      </main>

      <footer className="chlog-foot">
        <Wordmark height={16} />
        <span className="chlog-foot-tag">Leave a trail worth following.</span>
        <a className="chlog-foot-link" href="/">
          Open Breadcrumbs
        </a>
      </footer>
    </div>
  )
}
