/**
 * THE OBJECT REGISTRY: every kind of card a board can hold, and what each one is.
 *
 * Lifted out of FlowsView so a second surface can render an object without importing the canvas.
 * It carries JSX icons, so this is a .tsx domain file rather than a .ts one; that is the only
 * reason it did not move with the board types.
 *
 * The Add menu, the toolbar palette and the Layers panel all derive their rows from here rather
 * than hand-listing kinds, so a new kind lands in the right group by declaring its family, and the
 * menu cannot drift from the registry.
 */
import type { CanvasObjectKind, ObjectFamily, ObjectRole } from './flowBoard'

export interface ObjectMeta {
  label: string
  tone: string
  placeholder: string
  role: ObjectRole
  family: ObjectFamily
  menuDesc: string
  icon: React.ReactNode
}

export const OBJECT_META: Record<CanvasObjectKind, ObjectMeta> = {
  /**
   * THE BRAND this canvas writes as. Its record is the same brand profile the Brand page edits, so a
   * change here is a change there; the card exists so the context that shapes every other card on the
   * board is visible where the work happens, rather than a global you have to remember you set.
   */
  brand: {
    label: 'Brand', tone: '#e2564a', placeholder: 'Which brand?', role: 'input', family: 'says',
    menuDesc: 'Who this canvas writes as',
    icon: <><path d="M12 2.5 3.5 6v6c0 5 3.6 8.7 8.5 9.6 4.9-.9 8.5-4.6 8.5-9.6V6z" /></>,
  },
  /**
   * WHAT THE BRAND SELLS. Its own kind rather than a Company: a Company record is an ACCOUNT, someone
   * you sell to or compete with, and folding the catalogue in with the customers is how both end up
   * behind a type filter.
   */
  product: {
    label: 'Product', tone: '#0f8c6c', placeholder: 'Which product or offer?', role: 'input', family: 'says',
    menuDesc: 'A thing the brand sells',
    icon: <><path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z" /><path d="M3 8.5 12 13l9-4.5M12 13v7" /></>,
  },
  audience: {
    label: 'Audience', tone: '#4c86f0', placeholder: 'Which audience or segment?', role: 'input', family: 'who',
    menuDesc: 'The people it is written for',
    icon: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M17 8a3 3 0 0 1 0 6M20.5 20a5.5 5.5 0 0 0-4-5.3" /></>,
  },
  'data-source': {
    label: 'Data source', tone: '#12a594', placeholder: 'Which input or data source?', role: 'input', family: 'draws',
    menuDesc: 'A data set or connector to pull from',
    icon: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>,
  },
  message: {
    label: 'Message', tone: '#9b2dff', placeholder: 'Which message or angle?', role: 'input', family: 'says',
    menuDesc: 'The angle the copy argues',
    icon: <path d="M21 11.5a7.5 7.5 0 0 1-11 6.7L4 20l1.8-4.9A7.5 7.5 0 1 1 21 11.5z" />,
  },
  'proof-point': {
    label: 'Proof point', tone: '#30a46c', placeholder: 'Which proof point?', role: 'input', family: 'says',
    menuDesc: 'Evidence the copy leans on',
    icon: <><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  },
  trigger: {
    label: 'Trigger', tone: '#e5484d', placeholder: 'Which trigger?', role: 'input', family: 'when',
    menuDesc: 'The signal that starts it',
    icon: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  },
  voice: {
    label: 'Voice', tone: '#0ea5a5', placeholder: 'Which brand voice?', role: 'input', family: 'says',
    menuDesc: 'How it should sound',
    icon: <path d="M4 10v4M8 6.5v11M12 3v18M16 6.5v11M20 10v4" />,
  },
  company: {
    label: 'Company', tone: '#4c86f0', placeholder: 'Which company?', role: 'input', family: 'who',
    menuDesc: 'A named account you are writing to',
    icon: <><rect x="4" y="3" width="10" height="18" rx="1.2" /><path d="M14 8.5h6V21h-6" /><path d="M7 7h4M7 11h4M7 15h4M17 12h1M17 16h1" /></>,
  },
  person: {
    label: 'Person', tone: '#6d5cff', placeholder: 'Which person?', role: 'input', family: 'who',
    menuDesc: 'A named contact you are writing to',
    icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  },
  concept: {
    label: 'Concept', tone: '#ff8c42', placeholder: 'Describe the concept…', role: 'input', family: 'says',
    menuDesc: 'The big idea, in your words',
    icon: <><path d="M9.5 18h5M10.5 21h3" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2v.2h5v-.2c0-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" /></>,
  },
  season: {
    label: 'Season', tone: '#db6aa0', placeholder: 'A moment or season…', role: 'input', family: 'when',
    menuDesc: 'A moment to hit',
    icon: <><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" /><path d="M5 19c4-2 7-5 9.5-9.5" /></>,
  },
  note: {
    label: 'Note', tone: '#9aa1ac', placeholder: 'Type a note…', role: 'markup', family: 'markup',
    menuDesc: 'A sticky note on the board',
    icon: <><path d="M5 4h14v10l-5 5H5z" /><path d="M14 19v-5h5" /></>,
  },
}
