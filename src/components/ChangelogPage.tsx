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
