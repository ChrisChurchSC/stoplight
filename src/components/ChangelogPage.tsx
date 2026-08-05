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
    version: 'v1.26',
    dateLabel: 'August 5, 2026',
    groups: [
      {
        tag: 'Fixed',
        items: [
          'Dragging on the canvas is no longer doing six times the work it can show you. A mouse or trackpad reports its position far faster than a screen can redraw, and the board was rebuilding itself for every one of those reports. Measured on a hundred-card canvas, a second and a half of dragging produced 299 rebuilds to paint 46 frames: six of every seven were computed and thrown away before anything reached the screen. The board now updates once per frame, which is as often as you can actually see.',
          'Panning and marquee selection went the same way, for the same reason. All three gestures still land exactly where you let go: the last position is applied on release rather than left waiting for a frame that never comes.',
          'Cards that move together stopped being counted one at a time. Asking "is this card moving?" walked the whole list of dragged cards, once per member and once per connector, on every frame, so the bigger the group the more it cost to move it. It is a direct lookup now.',
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
