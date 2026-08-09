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
    /**
     * SAYS WHAT A CAMPAIGN IS HERE, rather than where it sits in a hierarchy. This used to open on
     * the ladder (Umbrella contains Campaigns, a Campaign runs as Flights, a Flight holds Assets),
     * which answers a question nobody opening a tooltip on the Campaigns page is asking, and leads
     * with the one rung most workspaces never use. A campaign in this app is a board and the work
     * that comes off it; the ladder is still true and still a click away under See also.
     */
    short:
      'The unit of work here. One board where you say what you are shipping and what it should say, plus the assets that come out of it. A campaign belongs to one brand.',
    more:
      'The board is the campaign. The cards you wire into its brief are what every asset it makes gets written from, and the assets are what it ships on its channels. The same campaign reads three ways: the flow, the grid, and the calendar.',
    seeAlso: ['brand', 'flight', 'folder', 'objective'],
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
  recordsAssistant: {
    term: 'Records assistant',
    short:
      "The chat for the record type you are viewing. In Build it adds, edits, and cleans up your records (you approve each change); in Analyze it answers questions without changing anything.",
  },
  wiredContext: {
    term: 'Informing the messaging',
    short: 'The cards wired to the campaign on the board. What they hold is read every time copy is written.',
    more: 'Audiences and Proof shape the wording; Companies, People, and Channels shape who it targets. A record reaches the campaign only through a card wired to it, so this list is everything the writer sees.',
    seeAlso: ['canvasInput', 'object'],
  },
  object: {
    term: 'Object',
    short:
      "One thing on a campaign board: an audience, a message, a proof point, a note. Drop it from the toolbar, and wire it to the campaign card to make it count. Objects point at your records and add instruction on top; they never redefine a record.",
    seeAlso: ['smartObject', 'canvasInput'],
  },
  smartObject: {
    term: 'Smart object',
    short:
      "A named card you can reuse instead of rebuilding it, holding one card or several bundled together. It starts out living inside one campaign; assign it to the brand's folder and every campaign for that brand can reach it.",
    more:
      'Double-click a smart object and it opens in its own tab on a blank canvas holding only its contents. Inside it, being on the canvas is being in the object, so there is nothing to wire. Once it is in a brand folder, editing it changes it everywhere it is used.',
    seeAlso: ['object', 'brand'],
  },
  canvasOutput: {
    term: 'What gets made',
    short:
      "Objects on a campaign canvas that turn into real work: the Brief, its Deliverables, and the individual posts under them. Building the campaign writes real drafts for these. They read as raised, tinted cards with a label chip and a count.",
    seeAlso: ['canvasInput', 'campaign'],
  },
  canvasInput: {
    term: "What it's made from",
    short:
      "Objects that carry the context a campaign is written from: audiences, messages, proof, voice, channels, and your own notes on the idea. They sit flat on the board so they never look like something you ship.",
    more:
      'An object names a record and adds an instruction about this campaign: which pain to lean on, which objection to beat, the claim to assert. That instruction is sent to the writer for every deliverable the object is wired to. The free-text note on an object is for your team and is never sent.',
    seeAlso: ['canvasOutput', 'wiredContext'],
  },
}
