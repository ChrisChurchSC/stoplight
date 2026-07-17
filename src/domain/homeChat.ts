/**
 * Home chat message + saved-conversation types. Kept in the domain (not the component) so the store
 * can persist conversations and the sidebar can list them. Mirrors the SavedFlowChat pattern, but the
 * Home chat isn't scoped to a flow — it's one global list of conversations.
 */
export type HomeChatStepKind = 'assets' | 'records' | 'segments'

export interface HomeChatStep {
  kind: HomeChatStepKind
  label: string
}

export interface HomeChatMsg {
  id: string
  role: 'user' | 'assistant'
  text?: string
  /** Transient "thinking" rows — not persisted. */
  steps?: HomeChatStep[]
  source?: string
  /** Transient in-flight flag — not persisted. */
  busy?: boolean
  reportId?: string
  reportBrand?: string
  setupDone?: boolean
  offerSetup?: boolean
  /** Set on the message that announces just-drafted proof points, to render a "View proof points" link. */
  proofDone?: boolean
  /** Set on the message that announces just-added audiences, to render a "View audiences" link. */
  audienceDone?: boolean
  /** Set on the message that announces just-drafted messages, to render a "View messages" link. */
  messageDone?: boolean
  /** Set on the message that announces just-added voices, to render a "View voices" link. */
  voiceDone?: boolean
  /** Set on the message that announces just-drafted objectives, to render a "View objectives" link. */
  objectiveDone?: boolean
  /** Set on the message that announces just-set channels, to render a "View channels" link. */
  channelDone?: boolean
  /** When set, this message is a step in the guided foundation flow; renders Draft/Skip buttons. */
  flowStep?: string
  /** When set, renders the brand's objectives as goal buttons during the flow-build (plus Skip). */
  goalPick?: { id: string; label: string; metric?: string }[]
  /** Set on the message that announces ingested site content, to render a "View Library" link. */
  ingestDone?: boolean
  /** When set, offer to build the go-to-market (renders "Build go-to-market" / "Not now"). */
  gtmOffer?: boolean
  /** When set, offer to build a flow (renders "Build a flow" / "Not now"). */
  flowOffer?: boolean
  /** Set to the built campaign name, to render an "Open flow" link. */
  flowBuiltName?: string
  /** When set, offer to set up measurement after a flow is built (renders "Set up measurement" / "Not now"). */
  measureOffer?: boolean
  /** When set, renders reporting-cadence buttons (Weekly / Monthly / Quarterly). */
  cadencePick?: boolean
  /** Set on the message that closes out measurement setup, to render a "View Insights" link. */
  measureDone?: boolean
}

/** A saved Home chat conversation — listed in the sidebar and reopenable. */
export interface SavedHomeChat {
  id: string
  title: string
  messages: HomeChatMsg[]
  createdAt: number
  updatedAt: number
}
