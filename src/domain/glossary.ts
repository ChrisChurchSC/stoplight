/**
 * In-product glossary: the single source of truth for what each Breadcrumbs term means, surfaced
 * inline through the <InfoTip term="…" /> primitive (never a second `hint` mechanism). Copy is
 * written from the domain doc-comments so a definition always matches behaviour. Plain language,
 * no em dashes. Keys are stable ids; `seeAlso` cross-links to other keys.
 */
export interface GlossaryEntry {
  /** The human term, as shown as the popover heading. */
  term: string
  /** One or two sentences: what it is, in plain language. */
  short: string
  /** Optional second paragraph for a distinction worth stating. */
  more?: string
  /** Related glossary keys, rendered as a "See also" line. */
  seeAlso?: string[]
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  brand: {
    term: 'Brand',
    short:
      "A brand you plan for. Holds the evergreen identity: voice, positioning, differentiators, and proof. Everything else (campaigns, audiences, assets) hangs off the brand selected in the rail.",
    seeAlso: ['campaign', 'voice', 'positioning'],
  },
  campaign: {
    term: 'Campaign',
    short:
      "A durable marketing effort with a goal and a theme. It runs as one or more flights over time and produces the assets you see on the timeline.",
    seeAlso: ['flight', 'umbrella', 'objective'],
  },
  flight: {
    term: 'Flight',
    short:
      "One scheduled run of a campaign over a window: a launch, a sustain, a seasonal re-run. A campaign can have several flights, each holding its own assets.",
    seeAlso: ['campaign'],
  },
  umbrella: {
    term: 'Umbrella campaign',
    short:
      "A container that groups audience-specific child campaigns under one theme. It carries no assets itself; the children do the work.",
    more: 'Created automatically when you draft one campaign for several audiences (one child per audience), or by hand with "New umbrella".',
    seeAlso: ['campaign'],
  },
  folder: {
    term: 'Folder',
    short:
      "A simple way to group a brand's campaigns, like a folder of files. Purely for tidiness; it does not change how campaigns run.",
    seeAlso: ['campaign'],
  },
  message: {
    term: 'Message',
    short:
      "What you say: a reusable angle or claim, tied to the audience it lands with and the proof behind it.",
    more: 'Distinct from Voice, which is HOW you say it.',
    seeAlso: ['voice', 'proofPoint'],
  },
  voice: {
    term: 'Voice',
    short:
      "How you say it: a tone-of-voice profile (tone, do's and don'ts, a sample) the copy is written in. The AI draws on these to stay on-brand.",
    more: 'The brand has one canonical voice in Brand settings; the Voices records hold reusable named variants for specific audiences or campaigns.',
    seeAlso: ['message'],
  },
  proofPoint: {
    term: 'Proof point',
    short:
      "A Reason to Believe (RTB): a specific, sourced proof that backs a claim, like a metric, case study, or benchmark.",
    more: 'Owned by the audience it persuades, so it travels into any campaign that targets them.',
    seeAlso: ['audience', 'message'],
  },
  pattern: {
    term: 'Pattern',
    short:
      "A reusable hook, format, structure, or trend worth riding: the recurring shapes your content leans on. A library the generator and team can reach for.",
  },
  audience: {
    term: 'Audience',
    short:
      "A named persona you message to (the brand's segments): their role, pains, goals, objections, the channels to reach them, and the proof that resonates.",
    more: 'An Audience is a person you persuade. A Company is an account; a Person is a contact in your CRM.',
    seeAlso: ['company', 'person', 'proofPoint'],
  },
  company: {
    term: 'Company',
    short: "A CRM account: one of the businesses you sell to or prospect. A lightweight, hand-edited record.",
    seeAlso: ['person', 'audience'],
  },
  person: {
    term: 'Person',
    short: "A CRM contact: an individual at a company. The contacts side of the lightweight CRM.",
    seeAlso: ['company'],
  },
  objective: {
    term: 'Objective',
    short:
      "A measurable goal a campaign drives toward, such as new users, pipeline, or awareness. Campaigns link to an objective to set their KPI and target.",
    seeAlso: ['campaign'],
  },
  trigger: {
    term: 'Trigger',
    short:
      "An event or signal that should kick off outreach, such as a sign-up, a renewal window, or a website visit.",
  },
  channel: {
    term: 'Channel',
    short:
      "A place you reach an audience, grouped by how it is funded: paid, organic, or owned. Carries its accepted media and default send times.",
  },
  foundation: {
    term: 'Foundation',
    short:
      "The standing library of how and what you say: Messages, Voices, Proof points, and Patterns. Build these once and every campaign draws on them.",
    seeAlso: ['prospects', 'gtm'],
  },
  prospects: {
    term: 'Prospects',
    short: "Who you sell to: Audiences (personas), Companies (accounts), and People (contacts).",
    seeAlso: ['foundation', 'gtm'],
  },
  gtm: {
    term: 'Go-to-market',
    short:
      "How and when you reach and measure: Channels, Triggers, and Objectives. The three sections read as build (Foundation), reach (Go-to-market), measure.",
    seeAlso: ['foundation', 'prospects'],
  },
  differentiator: {
    term: 'Differentiator',
    short:
      "A specific, proof-backed reason your brand wins. You can list several.",
    more: 'Not the same as a positioning statement (the one-sentence category claim), nor the positioning map.',
    seeAlso: ['positioning'],
  },
  positioning: {
    term: 'Positioning',
    short:
      "The positioning map: two axes plus where your brand sits on them, to reveal the white space no competitor holds.",
    more: 'This is the map, not a one-line positioning statement and not a differentiator.',
    seeAlso: ['differentiator'],
  },
  linkedRecords: {
    term: 'Linked records',
    short:
      "The Companies, People, Audiences, Channels, and Proof records this campaign draws on. The AI reads these when it writes copy, so the more you link, the more grounded the drafts.",
  },
}
