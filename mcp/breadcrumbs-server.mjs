#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

/**
 * Breadcrumbs MCP server. Claude Desktop launches this over stdio; each tool posts
 * a command to the running Breadcrumbs dev server's agent bridge, which dispatches
 * it into the open browser tab (the executor) and returns the real result. So
 * "add Acme as a client" in Desktop runs the actual app action and shows up live.
 *
 * Requires: Breadcrumbs running (npm run dev) with a browser tab open at the bridge
 * URL. Configure in Claude Desktop -> see docs/claude-desktop-mcp.md.
 */

const BRIDGE = process.env.BREADCRUMBS_BRIDGE_URL || 'http://localhost:5173'

/**
 * TWO WAYS TO REACH THE APP, chosen by whether a token is configured.
 *
 * With BREADCRUMBS_TOKEN set, commands go through the WORKSPACE — a queue table in Supabase that
 * the deployed app watches — so Desktop drives the real site with no dev server involved. Without
 * one, the original local path: POST to the Vite plugin's endpoint.
 *
 * The local path could not be made to work against the deployment. It is an SSE hub holding open
 * streams and the pending commands in module scope, and a serverless function gets a fresh instance
 * per invocation, so the tab's stream and the command awaiting its reply would land in different
 * ones. The database is the one thing both ends can already reach.
 */
const TOKEN = process.env.BREADCRUMBS_TOKEN || ''
const SUPABASE_URL = process.env.BREADCRUMBS_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.BREADCRUMBS_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
/** How long to wait for a tab to pick a command up and answer it. */
const COMMAND_TIMEOUT_MS = Number(process.env.BREADCRUMBS_TIMEOUT_MS || 120_000)
const POLL_MS = 400

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Call one of the two security-definer functions. The token authenticates the call itself. */
async function rpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!res.ok) {
    const message = (parsed && (parsed.message || parsed.error || parsed.hint)) || String(parsed ?? res.status)
    throw new Error(message)
  }
  return parsed
}

/** Enqueue against the workspace, then wait for the tab to answer. */
async function dispatchViaWorkspace(action, args) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      error:
        'BREADCRUMBS_TOKEN is set but the Supabase project is not. Add BREADCRUMBS_SUPABASE_URL and BREADCRUMBS_SUPABASE_ANON_KEY to the connector config.',
    }
  }
  let id
  try {
    id = await rpc('agent_enqueue', { p_token: TOKEN, p_action: action, p_args: args ?? {} })
  } catch (e) {
    const message = String(e?.message ?? e)
    // The one failure worth naming precisely: everything else reads as a connection problem, this
    // one is a credential the person has to go and re-mint.
    if (/invalid or revoked token/i.test(message)) {
      return { ok: false, error: 'This connector token is invalid or has been revoked. Mint a new one in Breadcrumbs under Connect Claude Desktop.' }
    }
    return { ok: false, error: `Cannot reach the Breadcrumbs workspace: ${message}` }
  }

  const deadline = Date.now() + COMMAND_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    let rows
    try {
      rows = await rpc('agent_result', { p_token: TOKEN, p_id: id })
    } catch (e) {
      return { ok: false, error: `Lost the workspace connection: ${String(e?.message ?? e)}` }
    }
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row || row.status === 'pending') continue
    if (row.status === 'error') return { ok: false, error: row.error || 'The command failed.' }
    return row.result
  }
  return {
    ok: false,
    error:
      'No Breadcrumbs tab picked this up. Open your Breadcrumbs site and sign in — the open tab is what runs commands — then retry.',
  }
}

/** The original local path: the dev server's bridge plugin, dispatching into an open tab. */
async function dispatchViaDevServer(action, args) {
  let res
  try {
    res = await fetch(`${BRIDGE}/api/agent-command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, args }),
    })
  } catch {
    return { ok: false, error: `Cannot reach the Breadcrumbs dev server at ${BRIDGE}. Start it with: npm run dev` }
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 503) {
    return { ok: false, error: data.message || 'No Breadcrumbs tab is open. Open http://localhost:5173 and retry.' }
  }
  return data
}

async function dispatch(action, args) {
  return TOKEN ? dispatchViaWorkspace(action, args) : dispatchViaDevServer(action, args)
}

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })

/**
 * HOW TO USE THIS SERVER, sent once at connect.
 *
 * Sixty-odd tools with no stated order is why a session used to start wherever the person's first
 * sentence landed: assets generated for a brand with no audiences, a campaign built before anyone
 * said what it was for. Every tool worked. The order nobody stated is what went wrong.
 *
 * Short on purpose. It states the order, the two questions that must be ASKED rather than inferred,
 * and the one call that answers "where am I" against the real workspace — everything else the tool
 * descriptions already say, and a long preamble is one the model stops reading.
 */
const INSTRUCTIONS = `Breadcrumbs is a campaign workspace: brands, the messaging behind them, and the assets written from it.

START HERE. Call whats_next at the beginning of a session, and again whenever you finish something
or are unsure what to do. It reads the real workspace and returns where it is, the single next thing
worth doing, and the exact calls that would do it. Prefer it over guessing an order.

THE ORDER THE WORK HAPPENS: a brand -> who it sells to and what backs its claims -> the goal ->
a campaign -> the direction behind it (object cards) -> assets -> the gaps -> a review -> approval.
Skipping a rung does not fail, it just produces confident work aimed at nothing.

ASK, DO NOT INFER, on two things. The GOAL (which GTM motion this campaign is for) and WHICH
CHANNELS it should live on. Neither is derivable from the brand, and a wrong guess is invisible:
the campaign comes out coherent, complete and aimed at the wrong thing. whats_next will tell you
when one of these is outstanding, and phrase the question. A motion setup_client INFERRED counts as
outstanding — it is a guess sitting in the field an answer goes in. Put it to the person and record
what they say with set_strategy, even if they pick the same one.

NAMES CREATE. set_brand_info, new_campaign and generate_assets all create the brand when the name
matches nothing, so a misspelling makes a second brand instead of an error. Call list_clients once
and use the name it returns.

TWO CALLS DO NOT UNDO: delete_client deletes a brand and its assets permanently, and
reset_brand_messaging clears authored audiences, proof, hooks and CTAs. Ask first. Everything else
soft-deletes and can be restored.

READ BEFORE YOU WRITE. get_brand before writing to a brand, get_asset_fields before authoring an
asset, get_object_fields before adding an object card. The field sets are per format and per kind
and are not guessable; anything you do not write renders blank.

FILL EVERY FIELD. An asset card renders every component its format defines (a website has nine) and
an object card contributes only the direction it carries. Every write returns which components are
still empty — act on that rather than treating a successful write as a finished card.

REVIEW BEFORE YOU CALL IT DONE. review_campaign returns everything worth doing on a campaign,
ranked, each finding carrying the call that fixes it.

Drafts land for a human to confirm. Say what you changed and what is still outstanding.`

const server = new McpServer({ name: 'breadcrumbs', version: '0.1.0' }, { instructions: INSTRUCTIONS })

/**
 * GUIDED WAYS IN, as prompts rather than more tools.
 *
 * A tool list is a menu you have to already know how to order from. These are the four things
 * people actually arrive wanting to do, and each one states the ORDER for that job — ask first,
 * read before writing, fill every field, review at the end — so the structure survives being
 * started from a blank message box.
 *
 * They ask questions and stop. A prompt that provisioned a whole brand from one click would be
 * making the two decisions this server is careful never to infer.
 */
const prompt = (text) => ({ messages: [{ role: 'user', content: { type: 'text', text } }] })

server.registerPrompt(
  'start',
  {
    title: 'Where am I?',
    description: 'Read the workspace and say what is worth doing next. The safe way to begin.',
    argsSchema: { campaign: z.string().optional().describe('A campaign to focus on (optional)') },
  },
  ({ campaign }) =>
    prompt(
      `Call whats_next${campaign ? ` for the campaign "${campaign}"` : ''} and tell me where this workspace is.\n\n` +
        `Give me: the one thing worth doing next and why, then the whole ladder so I can see what is done and what is not. ` +
        `If the next rung needs a decision from me — the goal, which channels — ask me the question rather than choosing. ` +
        `Do not change anything yet.`,
    ),
)

server.registerPrompt(
  'set-up-a-brand',
  {
    title: 'Set up a brand',
    description: 'Read a brand off its website, then fill the gaps by asking — audiences, proof, voice.',
    argsSchema: { url: z.string().optional().describe('The brand’s website'), brand: z.string().optional().describe('An existing brand to continue') },
  },
  ({ url, brand }) =>
    prompt(
      (brand
        ? `Continue setting up the brand "${brand}" in Breadcrumbs.\n\nStart by calling get_brand to see what is already connected.`
        : `Set up a brand in Breadcrumbs from ${url ? `its website: ${url}` : 'a website I will give you — ask me for it first'}.\n\nUse setup_client (or pull_live_assets on an existing brand) to read what it already has live.`) +
        `\n\nThen show me what came back and what is still thin, and fill the gaps WITH me: ` +
        `add_audience for who it sells to, add_proof_point for what backs the claims. ` +
        `Ask me before inventing an audience or a claim — a plausible invented proof point is worse than a missing one. ` +
        `If setup inferred a GTM motion, tell me which one and what it read to get there, and ask whether that is actually the goal — ` +
        `then call set_strategy with my answer. Do not leave a guess standing as the decision. ` +
        `Finish by calling whats_next so I can see what is left.`,
    ),
)

server.registerPrompt(
  'plan-a-campaign',
  {
    title: 'Plan a campaign',
    description: 'Ask the goal, put the direction on the board, then generate — in that order.',
    argsSchema: { brand: z.string().optional(), campaign: z.string().optional().describe('What to call it') },
  },
  ({ brand, campaign }) =>
    prompt(
      `Plan a campaign in Breadcrumbs${brand ? ` for "${brand}"` : ''}${campaign ? `, called "${campaign}"` : ''}.\n\n` +
        `Work in this order and do not skip ahead:\n` +
        `1. Ask me what the goal is — what success looks like — and set the GTM motion from my answer. Do not pick one for me.\n` +
        `2. Ask me which channels this should live on.\n` +
        `3. Put the DIRECTION on the board before generating anything: call get_object_fields, then add_object_card for the audience, the message and the proof — a campaign generated with no direction is written from the brief alone.\n` +
        `4. Only then generate_assets.\n` +
        `5. Finish with review_campaign and tell me what it found.`,
    ),
)

server.registerPrompt(
  'review-a-campaign',
  {
    title: 'Review a campaign',
    description: 'Everything worth doing on a campaign, ranked — then work through it with me.',
    argsSchema: { campaign: z.string().optional().describe('The campaign to review') },
  },
  ({ campaign }) =>
    prompt(
      `Review ${campaign ? `the campaign "${campaign}"` : 'a campaign in Breadcrumbs — ask me which one'} with review_campaign.\n\n` +
        `Show me the findings worst-first, grouped by what kind of problem they are, and for each one tell me what it costs. ` +
        `Then apply the mechanical fixes (apply_fix) and tell me which findings need a real decision from me instead. ` +
        `Do not approve anything without asking.`,
    ),
)

server.registerPrompt(
  'fill-the-gaps',
  {
    title: 'Fill in what is blank',
    description: 'Find every half-built asset and object card on a campaign, and finish them.',
    argsSchema: { campaign: z.string().optional() },
  },
  ({ campaign }) =>
    prompt(
      `Find everything half-built on ${campaign ? `"${campaign}"` : 'a campaign in Breadcrumbs — ask me which one'} and finish it.\n\n` +
        `Call review_campaign with includeCopyCheck: false for the fast structural pass. ` +
        `For each asset with blank components, call get_asset_fields for its channel and type, then edit_asset with EVERY key it lists — ` +
        `a component you leave out renders blank on the card. Do the same for object cards carrying no direction. ` +
        `Write in the brand's voice using what get_brand returns, and show me what you wrote before moving on.`,
    ),
)

server.registerTool(
  'whats_next',
  {
    title: 'Where this workspace is, and what to do next',
    description:
      "THE ENTRY POINT — call this first in a session, and again whenever you finish something or are unsure what to do. Reads the real workspace and returns: which rung of the work it is on (brand -> audiences and proof -> goal -> campaign -> direction -> assets -> channels -> filled components -> review -> approval), a one-line headline about THIS workspace, why that rung matters, the exact calls that would finish it, and the whole ladder with each rung's state. When the rung needs an answer only the person can give — what the goal is, which channels to run, a motion setup only guessed — it returns the question to ask them rather than an action to take. WITHOUT a campaign the answer is about the brand as a whole and stops at 'which campaign'; pass one to get the rungs below it (direction, assets, review, approval), which are all per-campaign.",
    inputSchema: {
      brand: z.string().optional().describe('The brand to ask about (defaults to the one the app is scoped to)'),
      campaign: z.string().optional().describe('The campaign to ask about. Without it, the answer is about the brand as a whole.'),
    },
  },
  async (a) => text(await dispatch('getNextStep', a)),
)

server.registerTool(
  'list_clients',
  {
    title: 'List clients',
    description:
      'List the clients (brands) currently in the Breadcrumbs workspace. Every tool that takes a `brand` matches on this exact name, and the write tools CREATE a brand when the name matches nothing — so read this once before writing, rather than typing a name from memory.',
    inputSchema: {},
  },
  async () => text(await dispatch('listClients', {})),
)

server.registerTool(
  'add_client',
  {
    title: 'Add client',
    description: 'Add a new client by name to the Breadcrumbs clients dashboard.',
    inputSchema: { name: z.string().describe('The client / company name') },
  },
  async ({ name }) => text(await dispatch('addClient', { name })),
)

server.registerTool(
  'setup_client',
  {
    title: 'Set up client with Claude',
    description:
      "Onboard a client from their website URL. Claude crawls their site (and any connected accounts) and proposes brand, ICP, proof points, channel mix, and a first campaign. It INFERS the best-fit GTM motion (PLG / demand-gen / sales-led / ABM / community) from business-model signals and returns it as recommendedStrategy with a rationale, confidence, and signalsUsed. The motion is stored on the brand and pre-selected for generation, but it is a PROPOSAL, not an answer: show the person what it inferred and why, and call set_strategy to record what they say (the same motion still counts — confirming is what marks it decided). Until then whats_next keeps the goal rung open. Use this to set up a new client end to end.",
    inputSchema: {
      url: z.string().describe("The client's website URL or domain, e.g. acme.com"),
      notes: z.string().optional().describe('Optional notes to steer the setup (e.g. "free consumer app")'),
    },
  },
  async ({ url, notes }) => text(await dispatch('setupClient', { url, notes })),
)

server.registerTool(
  'map_client',
  {
    title: 'Map a client from their site',
    description:
      "Map a client's CURRENT live messaging from their website URL. Claude renders their site and reads their live ads, extracts their real headlines, value props, claims, CTAs, audiences, and proof, and stores it as the connected map you can see. Use this to onboard a client by mapping what they already have live (the front door to diagnosis).",
    inputSchema: {
      url: z.string().describe("The client's website URL or domain, e.g. ridge.com"),
      notes: z.string().optional().describe('Optional notes to steer the mapping'),
    },
  },
  async ({ url, notes }) => text(await dispatch('mapClient', { url, notes })),
)

server.registerTool(
  'run_coherence_check',
  {
    title: 'Run coherence check',
    description:
      "Run the Claude coherence check on a client (optionally one campaign) and return the breaks found in the campaign thread. This reads the COPY only. review_campaign is the standing 'how is this campaign doing' call — it runs this check AND the passes it cannot see (blank components, cards carrying no direction, dead CTAs); reach for this one when you only want the copy breaks. A check is recorded against the exact scope you pass, so a brand-wide run does not count as having reviewed one campaign.",
    inputSchema: {
      client: z.string().describe('The client name to check'),
      campaign: z.string().optional().describe('A specific campaign name, or omit for all campaigns'),
    },
  },
  async ({ client, campaign }) => text(await dispatch('runCoherenceCheck', { client, campaign })),
)

// ---- Set up a brand from your Claude ----

server.registerTool(
  'get_brand',
  {
    title: 'Read what is connected for a brand',
    description:
      "Read back everything connected for a brand in Breadcrumbs: its About profile, its messaging system (audiences, proof points, subjects, hooks, CTAs), its campaigns, and asset count. Call this FIRST so you can see what already exists before you populate or write more.",
    inputSchema: { brand: z.string().describe('The brand / client name') },
  },
  async ({ brand }) => text(await dispatch('getBrand', { brand })),
)

server.registerTool(
  'set_brand_info',
  {
    title: 'Populate brand About info',
    description:
      "Populate (or update) a brand's About profile — the standing context its canvases and messaging draw from. Creates the brand if the name matches nothing, so pass one from list_clients: a misspelling makes a second brand rather than an error. Only the fields you pass are written; omit the rest. List fields accept an array or a comma/newline-separated string.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      oneLiner: z.string().optional().describe('What the brand does, in one line'),
      website: z.string().optional(),
      industry: z.string().optional(),
      founded: z.string().optional(),
      headquarters: z.string().optional(),
      traction: z.string().optional().describe('e.g. 2M downloads, $4M ARR'),
      mission: z.string().optional(),
      voice: z.string().optional().describe('How the brand sounds, e.g. plain, technical, no hype'),
      products: z.array(z.string()).optional().describe('Products / offerings'),
      differentiators: z.array(z.string()).optional(),
      values: z.array(z.string()).optional(),
      locations: z.array(z.string()).optional().describe('Cities / regions the Location fan-out card personalizes across'),
      strategy: z.string().optional().describe('GTM motion key/name to set (e.g. plg, demand-gen, sales-led, abm, community). Overrides the inferred one.'),
    },
  },
  async (a) => text(await dispatch('setBrandInfo', a)),
)

server.registerTool(
  'get_strategy',
  {
    title: 'Read a brand’s GTM motion',
    description:
      "Read the brand's active GTM motion (strategy) and the reasoning behind it: the strategy key + name, an optional secondary motion, the rationale, confidence, the signals it was grounded in, and the inferred business model.",
    inputSchema: { brand: z.string().describe('The brand / client name') },
  },
  async ({ brand }) => text(await dispatch('getStrategy', { brand })),
)

server.registerTool(
  'set_strategy',
  {
    title: 'Override a brand’s GTM motion',
    description:
      "Record the brand's GTM motion — the call that turns a guess into a decision. Use it to override an inferred motion AND to confirm one (passing the motion setup already inferred is not a no-op: it marks the question answered, which is what closes the goal rung). The value persists on the brand and is honored by generate_assets (which seeds the deliverable set for the chosen motion). Only call it once the person has actually said what the goal is. Pick a key from: plg, demand-gen, sales-led, lifecycle, aarrr, bowtie, abm, content-seo, outbound, community, local-takeover (names also accepted).",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      strategy: z.string().describe('The motion key or name, e.g. plg or "PLG Flywheel"'),
      secondaryStrategy: z.string().optional().describe('An optional secondary motion'),
      rationale: z.string().optional().describe('Why (recorded with the override)'),
    },
  },
  async (a) => text(await dispatch('setStrategy', a)),
)

server.registerTool(
  'pull_live_assets',
  {
    title: 'Pull a brand’s live assets',
    description:
      "Pull a brand's CURRENT live messaging and assets from its website (and live ads): real headlines, value props, claims, CTAs, audiences, and proof, stored as the connected map. Use this to populate a brand from what it already has live. (Same engine as map_client.)",
    inputSchema: {
      url: z.string().describe("The brand's website URL or domain, e.g. ridge.com"),
      notes: z.string().optional().describe('Optional notes to steer the pull'),
    },
  },
  async ({ url, notes }) => text(await dispatch('pullLiveAssets', { url, notes })),
)

server.registerTool(
  'reset_brand_messaging',
  {
    title: 'Reset a brand’s messaging system',
    description:
      "Clear a brand's authored messaging components (audiences, proof points, subjects, hooks, CTAs) so you can rebuild them clean. Keeps the standard GTM strategies. Use this if the messaging list got polluted with stray or duplicate entries. IT DOES NOT UNDO, and it discards work a person may have written by hand — ask before calling it, and say what get_brand shows is about to go.",
    inputSchema: { brand: z.string().describe('The brand / client name') },
  },
  async ({ brand }) => text(await dispatch('resetBrandMessaging', { brand })),
)

server.registerTool(
  'add_audience',
  {
    title: 'Write an audience',
    description:
      "Write an audience into a brand's messaging system. Audiences shape who each asset speaks to. Lands unapproved for a human to confirm.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      name: z.string().describe('Audience name, e.g. Series-A founders'),
      role: z.string().optional().describe('Their role / title'),
      angle: z.string().optional().describe('The message angle that lands for them'),
      pains: z.array(z.string()).optional().describe('Their pains / jobs-to-be-done'),
      voice: z.array(z.string()).optional().describe('Voice / tone descriptors for speaking to them'),
    },
  },
  async (a) => text(await dispatch('addAudience', a)),
)

server.registerTool(
  'add_proof_point',
  {
    title: 'Write a proof point (RTB)',
    description:
      "Write a reason-to-believe / proof point into a brand's messaging system. Proof points back up the claims assets make. Lands unapproved for a human to confirm.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      claim: z.string().describe('The claim, e.g. Cuts onboarding time in half'),
      evidence: z.string().optional().describe('Why it is true / the supporting detail'),
      metric: z.string().optional().describe('A hard number, e.g. 52% faster'),
      source: z.string().optional().describe('Where the proof comes from'),
    },
  },
  async (a) => text(await dispatch('addProofPoint', a)),
)

server.registerTool(
  'add_subject',
  {
    title: 'Write a subject / theme',
    description:
      "Write a subject (campaign theme / message territory) into a brand's messaging system. Lands unapproved for a human to confirm.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      text: z.string().describe('The subject line / theme'),
      angle: z.string().optional().describe('The angle it takes'),
      outcome: z.string().optional().describe('The outcome it promises'),
    },
  },
  async (a) => text(await dispatch('addSubject', a)),
)

server.registerTool(
  'add_hook',
  {
    title: 'Write a hook',
    description:
      "Write a hook (an opening line / scroll-stopper) into a brand's messaging system. Lands unapproved for a human to confirm.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      text: z.string().describe('The hook copy'),
      kind: z.string().optional().describe('Hook kind, e.g. Pain, Curiosity, Bold claim'),
      note: z.string().optional().describe('When / how to use it'),
    },
  },
  async (a) => text(await dispatch('addHook', a)),
)

server.registerTool(
  'add_cta',
  {
    title: 'Write a CTA',
    description:
      "Write a call-to-action into a brand's messaging system. Lands unapproved for a human to confirm.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      label: z.string().describe('The CTA copy, e.g. Start free trial'),
      stage: z.string().optional().describe('Funnel stage: awareness, consideration, or conversion'),
      destination: z.string().optional().describe('Where it sends, e.g. /signup'),
      outcome: z.string().optional().describe('The action it drives'),
    },
  },
  async (a) => text(await dispatch('addCta', a)),
)

server.registerTool(
  'new_campaign',
  {
    title: 'Create a campaign',
    description:
      'Create an empty campaign for a brand. Creates the brand too if the name matches nothing — so a misspelled brand yields a second brand rather than an error. Use a name from list_clients.',
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      name: z.string().describe('The campaign name'),
      strategy: z.string().optional().describe('GTM strategy name or key, e.g. Demand Gen'),
    },
  },
  async (a) => text(await dispatch('newCampaign', a)),
)

server.registerTool(
  'generate_assets',
  {
    title: 'Generate assets from everything connected',
    description:
      "Generate draft assets for a campaign from everything connected — the brand's About profile, audiences, and proof points. Each asset is composed uniquely from its funnel stage, audience, CTA, and proof point (no two share a headline / primary text / CTA). Seeds the deliverable set for the chosen GTM strategy, then writes the copy. PUT THE DIRECTION ON THE BOARD FIRST — add_object_card for the audience, the message and the proof — because generation reads the board, and a campaign with an empty board is written from the brief alone while the board still looks like context. Creates the brand and campaign if the names match nothing, so pass a name from list_clients rather than a guess. Drafts land for a human to review.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      campaign: z.string().describe('The campaign to generate into'),
      strategy: z
        .string()
        .optional()
        .describe("GTM strategy name or key. Omit to use the brand's stored (inferred/overridden) motion; falls back to Demand Gen."),
      audiences: z
        .array(z.string())
        .optional()
        .describe('Scope the campaign to these audience names (e.g. ["Charter captains & guides"]). Omit to span all of the brand\'s audiences.'),
      accounts: z
        .array(z.string())
        .optional()
        .describe('ABM: target account names (e.g. ["BlackRock","Robinhood"]). When set, the seeded set is fanned into per-account 1:1 variants, each keyed to the account\'s real situation. Creates accounts + a target list if needed.'),
    },
  },
  async (a) => text(await dispatch('generateAssets', a)),
)

server.registerTool(
  'add_account',
  {
    title: 'Add a target account (ABM)',
    description:
      'Add a named target account under a brand: tier (1:1 / 1:few / 1:many), status (target → engaged → meeting → pipeline → won/lost), segment, the account\'s real situation (notes), and a buying committee (roles + concerns). Accounts are the core of ABM.',
    inputSchema: {
      brand: z.string().describe('The brand the account belongs to'),
      name: z.string().describe('The account name (e.g. "BlackRock")'),
      domain: z.string().optional().describe('The account domain'),
      segment: z.string().optional().describe('Industry / segment (e.g. "Asset management")'),
      tier: z.enum(['1:1', '1:few', '1:many']).optional().describe('How tightly to personalize (default 1:few)'),
      status: z.enum(['target', 'engaged', 'meeting', 'pipeline', 'won', 'lost']).optional().describe('ABM pipeline status (default target)'),
      notes: z.string().optional().describe('The account\'s real, public situation — what makes a 1:1 variant differ'),
      committee: z
        .array(z.object({ role: z.string(), concern: z.string().optional() }))
        .optional()
        .describe('Buying committee: roles + the concern each weighs (e.g. { role: "Compliance", concern: "regulatory exposure" })'),
    },
  },
  async (a) => text(await dispatch('addAccount', a)),
)

server.registerTool(
  'create_target_list',
  {
    title: 'Create an ABM target list',
    description:
      'Create a named target list under a brand from account names (creating any that don\'t exist yet), and optionally attach it to a campaign. The list a program targets — fan_out / generate_assets fan per-account variants across it.',
    inputSchema: {
      brand: z.string().describe('The brand'),
      name: z.string().describe('The list name (e.g. "Financial Institutions")'),
      accounts: z.array(z.string()).describe('Account names to include (e.g. ["BlackRock","Fidelity","Robinhood"])'),
      campaign: z.string().optional().describe('A campaign to attach the list to immediately'),
    },
  },
  async (a) => text(await dispatch('createTargetList', a)),
)

server.registerTool(
  'attach_target_list',
  {
    title: 'Attach a target list to a campaign',
    description: 'Set (or clear with an empty listId) the target list a campaign targets, so account fan-out resolves to it.',
    inputSchema: {
      campaign: z.string().describe('The campaign'),
      listId: z.string().describe('The target list id (empty string to clear)'),
    },
  },
  async (a) => text(await dispatch('attachTargetList', a)),
)

server.registerTool(
  'list_accounts',
  {
    title: 'List a brand’s target accounts',
    description: 'Read a brand\'s accounts (name, segment, tier, status) and its target lists, so you can see ABM state before generating.',
    inputSchema: {
      brand: z.string().describe('The brand'),
    },
  },
  async (a) => text(await dispatch('listAccounts', a)),
)

server.registerTool(
  'remove_account',
  {
    title: 'Remove a target account',
    description: 'Delete a target account from a brand (also drops it from any target list). Use the id from list_accounts.',
    inputSchema: {
      brand: z.string().describe('The brand'),
      id: z.string().describe('The account id'),
    },
  },
  async (a) => text(await dispatch('removeAccount', a)),
)

server.registerTool(
  'remove_target_list',
  {
    title: 'Delete an ABM target list',
    description: 'Delete a target list and detach it from any campaign that targeted it. Use the id from list_accounts.',
    inputSchema: {
      listId: z.string().describe('The target list id'),
    },
  },
  async (a) => text(await dispatch('removeTargetList', a)),
)

server.registerTool(
  'list_assets',
  {
    title: 'List a campaign’s assets (with copy + status)',
    description:
      "Read back each asset for a brand (optionally one campaign): id, status, source, sourceUrl, publishedAt, metrics, funnel stage, audience, channel, type, headline, primaryText, description, cta, proof points. Verify generation AND lifecycle AND real-content imports. Filter status:[\"approved\"] for the shippable set, or source:[\"social-live\"] / [\"site\"] for imported real content (the actual captions/copy). Archived hidden unless includeArchived.",
    inputSchema: {
      brand: z.string().describe('The brand / client name'),
      campaign: z.string().optional().describe('A specific campaign name, or omit for all of the brand'),
      status: z.array(z.string()).optional().describe('Filter to these statuses, e.g. ["approved"] for the shippable set, or ["draft","in_review"].'),
      source: z.array(z.string()).optional().describe('Filter by provenance: ["social-live"] (real posts), ["site"] (scraped pages), ["imported"], ["authored"], ["generated"].'),
      channel: z.array(z.string()).optional().describe('Filter to channels, e.g. ["instagram","linkedin"].'),
      audience: z.array(z.string()).optional().describe('Filter to audience names.'),
      stage: z.array(z.string()).optional().describe('Filter to funnel stages: awareness / consideration / conversion / retention.'),
      publishedAfter: z.string().optional().describe('ISO date-time; keep assets published on/after (absolute). Filters by publishedAt, else scheduledAt.'),
      publishedBefore: z.string().optional().describe('ISO date-time; keep assets published on/before.'),
      window: z.string().optional().describe('RELATIVE trailing window — "last week", "30d", "month", "quarter", "year". Recomputed each call (stays relative). Prefer this over publishedAfter for "last N".'),
      withinDays: z.number().optional().describe('Trailing window in days (7 = last week, 30, 60, 90 = quarter). Same as window, as a number.'),
      sort: z.string().optional().describe('"newest" / "oldest" / "engagement" / a metric key (e.g. "impressions").'),
      limit: z.number().optional().describe('Max assets to return (paging — keeps payloads small).'),
      cursor: z.number().optional().describe('Offset to start from (paging). The response returns nextCursor when more remain.'),
      includeArchived: z.boolean().optional().describe('Include soft-deleted assets (default false).'),
    },
  },
  async (a) => text(await dispatch('listAssets', a)),
)

server.registerTool(
  'create_canvas',
  {
    title: 'Create a saved view (smart canvas)',
    description:
      "Create a named, persisted, re-resolving filtered view of a brand's assets — a smart canvas (like a smart playlist). It stores a FILTER, not a copy: open it any time and it resolves live, so new matching assets appear and aged-out ones drop. Real imported posts + generated drafts show together. e.g. \"Last 60 Days\" = filter { source:[\"social-live\"], publishedAfter:<now-60d> }, layout board, groupBy date.",
    inputSchema: {
      brand: z.string().describe('The brand the view lives under'),
      name: z.string().describe('The view name, e.g. "Last 60 Days"'),
      filter: z
        .object({
          source: z.array(z.string()).optional(),
          campaign: z.string().optional(),
          channel: z.array(z.string()).optional(),
          audience: z.array(z.string()).optional(),
          stage: z.array(z.string()).optional(),
          status: z.array(z.string()).optional(),
          publishedAfter: z.string().optional(),
          publishedBefore: z.string().optional(),
          withinDays: z.number().optional().describe('RELATIVE trailing window in days (7/30/60/90). Stored so the canvas stays relative — "last 30 days" is always the trailing 30.'),
          window: z.string().optional().describe('Friendly relative window — "last week", "30d", "month", "quarter" — converted to withinDays.'),
          includeArchived: z.boolean().optional(),
        })
        .describe('The query the canvas resolves (AND-ed clauses). For "last N", use withinDays/window (relative), not publishedAfter (frozen).'),
      layout: z.enum(['board', 'calendar', 'grid', 'list']).optional().describe('default board'),
      groupBy: z.enum(['date', 'channel', 'audience', 'stage', 'none']).optional().describe('default none'),
      sort: z.string().optional().describe('"newest" (default) / "oldest" / "engagement" / a metric key'),
    },
  },
  async (a) => text(await dispatch('createCanvas', a)),
)

server.registerTool(
  'get_canvas',
  {
    title: 'Open a saved view (resolve it live)',
    description: 'Open a smart canvas by id: re-resolves its filter NOW and returns the matched assets, grouped + sorted per its config (groups[] when grouped). Pass limit/cursor to page.',
    inputSchema: {
      id: z.string().describe('The canvas id (from create_canvas / list_canvases)'),
      limit: z.number().optional(),
      cursor: z.number().optional(),
    },
  },
  async (a) => text(await dispatch('getCanvas', a)),
)

server.registerTool(
  'list_canvases',
  {
    title: 'List saved views',
    description: 'List the saved views (smart canvases) under a brand (or all brands), with their filters + layout.',
    inputSchema: { brand: z.string().optional().describe('Limit to one brand, or omit for all') },
  },
  async (a) => text(await dispatch('listCanvases', a)),
)

server.registerTool(
  'update_canvas',
  {
    title: 'Update a saved view',
    description: 'Edit a smart canvas: name, filter, layout, groupBy, or sort. The next get_canvas re-resolves with the new config.',
    inputSchema: {
      id: z.string().describe('The canvas id'),
      name: z.string().optional(),
      filter: z.record(z.any()).optional().describe('Replace the filter (same shape as create_canvas)'),
      layout: z.enum(['board', 'calendar', 'grid', 'list']).optional(),
      groupBy: z.enum(['date', 'channel', 'audience', 'stage', 'none']).optional(),
      sort: z.string().optional(),
    },
  },
  async (a) => text(await dispatch('updateCanvas', a)),
)

server.registerTool(
  'delete_canvas',
  {
    title: 'Delete a saved view',
    description: 'Delete a smart canvas. The underlying assets are untouched (a canvas is just a saved query).',
    inputSchema: { id: z.string().describe('The canvas id') },
  },
  async (a) => text(await dispatch('deleteCanvas', a)),
)

server.registerTool(
  'edit_asset',
  {
    title: 'Edit an asset',
    description:
      'Edit an asset’s copy and targeting. Pass `fields` (key → copy, from get_asset_fields) to set ANY component the card renders — that is the only way to reach a subhead, proof stat, FAQ or footer CTA. headline/primaryText/description/cta still work as shorthand for the four commonest. The reply reports which components are still empty. Editing changes the content, so re-run run_coherence_check to see the result. This is how a flagged break gets fixed by hand.',
    inputSchema: {
      assetId: z.string().describe('The asset id (from list_assets)'),
      mediaType: z.enum(['image', 'video', 'text', 'link']).optional().describe('What the asset is made of (default image). image/video/link cards render an in-creative copy row; a text asset does not.'),
      fields: z
        .record(z.string())
        .optional()
        .describe(
          'The card’s components by their REAL key → copy, e.g. { subhead, "proof-stat", faq, "cta-footer", "in-creative-copy" }. Call get_asset_fields first and pass EVERY key it lists: a key you leave out renders blank on the card. `in-creative-copy` is the copy written INSIDE the artwork (overlays, voiceover, page text), not the post copy around it. Beats the four aliases below, which only reach four components and cannot name the rest.',
        ),
      headline: z.string().optional(),
      primaryText: z.string().optional(),
      description: z.string().optional(),
      cta: z.string().optional(),
      proofPoints: z.array(z.string()).optional().describe('Proof point ids or labels to attach'),
      audience: z.string().optional(),
      stage: z.enum(['awareness', 'consideration', 'conversion', 'retention']).optional(),
      channel: z.string().optional(),
      format: z.string().optional(),
    },
  },
  async (a) => text(await dispatch('editAsset', a)),
)

server.registerTool(
  'apply_fix',
  {
    title: 'Apply a coherence check’s suggested fix',
    description: 'Apply the suggested fix for a break (from run_coherence_check’s `fixable[]`) to the flagged asset. Re-run run_coherence_check and the break is gone, count lower. The repair-loop payoff.',
    inputSchema: { breakId: z.string().describe('The break id from run_coherence_check fixable[].id') },
  },
  async (a) => text(await dispatch('applyFix', a)),
)

server.registerTool(
  'reassign_proof',
  {
    title: 'Reassign an asset’s proof (proof-gap fix)',
    description: 'Attach the proof point the check suggests for a proof-gap break, without rewriting copy.',
    inputSchema: { breakId: z.string().describe('The break id from run_coherence_check fixable[].id') },
  },
  async (a) => text(await dispatch('reassignProof', a)),
)

server.registerTool(
  'review_campaign',
  {
    title: 'Review a whole campaign and say what to do',
    description:
      "One read of an entire campaign — its copy, its completeness and its wiring — returned as a ranked list of findings, each carrying the exact call that fixes it. Runs the Claude coherence check (claims with no proof, weak CTAs, assets repeating each other) AND the passes it cannot see: asset cards with components still blank, object cards carrying no direction, CTAs pointed at assets that are gone, handoffs no button covers. Use this as the standing 'how is this campaign doing' call; use run_coherence_check when you only want the copy breaks.",
    inputSchema: {
      campaign: z.string().describe('The campaign to review'),
      includeCopyCheck: z
        .boolean()
        .optional()
        .describe('Run the Claude coherence check too (default true). Pass false for a fast structural-only pass — it is the slow half.'),
    },
  },
  async (a) => text(await dispatch('runCampaignReview', a)),
)

server.registerTool(
  'get_object_fields',
  {
    title: 'What an object card asks for',
    description:
      'The direction a flow-board object card of this kind asks for — key, label, hint, character cap — plus the record type it names. Direction is the INSTRUCTION the card gives the copy writer (an Audience asks for a pain and an objection; a Trigger for what the reader just did and the ask), and it is what the card contributes: one with none adds a name and nothing else. Call before add_object_card / edit_object_card. Some kinds (voice, concept, note, brand, product, pattern) ask for no direction and contribute through their record.',
    inputSchema: { kind: z.string().describe('Card kind: audience, proof-point, company, person, message, voice, trigger, brand, product, concept, season, pattern') },
  },
  async (a) => text(await dispatch('getObjectFields', a)),
)

server.registerTool(
  'list_object_cards',
  {
    title: 'The object cards on a campaign’s board',
    description:
      'Every object card on a campaign’s flow board: id, kind, name, the record it points at, its direction, and which of its questions are still unanswered. Use it to see what is instructing the copy on this campaign, and which cards are contributing nothing yet.',
    inputSchema: { campaign: z.string().describe('The campaign whose board to read') },
  },
  async (a) => text(await dispatch('listObjectCards', a)),
)

server.registerTool(
  'add_object_card',
  {
    title: 'Put an object card on a campaign’s board',
    description:
      'Add an object card to a campaign’s flow board — the cards that instruct the copy writer, as opposed to the assets it writes. Call get_object_fields first and pass every key it lists in `fields`: a card with no direction contributes a name and nothing else. The reply names whatever is still unanswered.',
    inputSchema: {
      campaign: z.string().describe('The campaign whose board to add to'),
      kind: z.string().describe('Card kind: audience, proof-point, company, person, message, voice, trigger, brand, product, concept, season, pattern'),
      name: z.string().optional().describe('What to call this card, in your own words (survives changing the record under it)'),
      note: z.string().optional().describe('A team note on the card. Never sent to the copy writer — direction is what reaches it.'),
      fields: z
        .record(z.string())
        .optional()
        .describe('The card’s direction by key → answer, from get_object_fields. e.g. { pain, objection } on an audience card.'),
      refId: z.string().optional().describe('Id of the record this card points at, when you have one'),
    },
  },
  async (a) => text(await dispatch('addObjectCard', a)),
)

server.registerTool(
  'edit_object_card',
  {
    title: 'Sharpen an object card',
    description:
      'Edit an object card already on a board: its name, its note, the record it points at, and its direction. Keys you do not mention keep their answers; an empty string clears one. This is how a card that contributes nothing gets given something to say.',
    inputSchema: {
      objectId: z.string().describe('The card id (from list_object_cards)'),
      name: z.string().optional(),
      note: z.string().optional(),
      fields: z.record(z.string()).optional().describe('Direction by key → answer. Empty string clears a key.'),
      refId: z.string().optional(),
    },
  },
  async (a) => text(await dispatch('editObjectCard', a)),
)

server.registerTool(
  'get_asset_fields',
  {
    title: 'The components an asset card renders',
    description:
      'The exact copy components a card of this channel + asset type renders — key, label, recommended and hard character limits. Call this BEFORE add_asset / edit_asset: the component set is per format (a website has nine, an email five, an Instagram post one), the keys are not guessable, and every one you do not write renders blank on the card. Includes `in-creative-copy` (the words inside the artwork — overlays, voiceover, page text) for image/video/link assets.',
    inputSchema: {
      channel: z.string().describe('Channel id, display label or short tag — e.g. website, email, meta-ads, instagram, "Meta Ads". An unrecognized name is an error, not a silent fallback.'),
      assetType: z.string().optional().describe('Asset type, when the format overrides the channel default (e.g. video, short)'),
      mediaType: z.enum(['image', 'video', 'text', 'link']).optional().describe('What the asset is made of (default image). image/video/link cards render an in-creative copy row; a text asset does not.'),
    },
  },
  async (a) => text(await dispatch('getAssetFields', a)),
)

server.registerTool(
  'add_asset',
  {
    title: 'Hand-author an asset',
    description:
      'Create a bespoke asset by hand (no generation): set channel, stage, audience, format, proofPoints and the copy. CALL get_asset_fields FIRST for this channel + assetType, then pass every key it lists in `fields` — an asset card renders each component it defines (a website has nine) and anything you omit shows up blank. The reply names whatever is still empty. It is first-class (appears in list_assets, tagged authored, coherence-checked). Use for 1:1 ABM emails and one-off pieces.',
    inputSchema: {
      brand: z.string().describe('The brand'),
      campaign: z.string().describe('The campaign to author into'),
      channel: z.string().optional().describe('Channel (default Instagram)'),
      assetType: z.string().optional(),
      stage: z.enum(['awareness', 'consideration', 'conversion', 'retention']).optional(),
      audience: z.string().optional(),
      format: z.string().optional(),
      assetName: z.string().optional(),
      mediaType: z.enum(['image', 'video', 'text', 'link']).optional().describe('What the asset is made of (default image). image/video/link cards render an in-creative copy row; a text asset does not.'),
      fields: z
        .record(z.string())
        .optional()
        .describe(
          'The card’s components by their REAL key → copy, e.g. { subhead, "proof-stat", faq, "cta-footer", "in-creative-copy" }. Call get_asset_fields first and pass EVERY key it lists: a key you leave out renders blank on the card. `in-creative-copy` is the copy written INSIDE the artwork (overlays, voiceover, page text), not the post copy around it. Beats the four aliases below, which only reach four components and cannot name the rest.',
        ),
      headline: z.string().optional(),
      primaryText: z.string().optional(),
      description: z.string().optional(),
      cta: z.string().optional(),
      proofPoints: z.array(z.string()).optional(),
      source: z.enum(['authored', 'imported', 'social-live', 'site']).optional().describe('Provenance (default authored). Use for a single imported real asset.'),
      sourceUrl: z.string().optional().describe('The external post/page URL (imported assets)'),
      mediaRefs: z.array(z.string()).optional().describe('Media urls (image/video)'),
    },
  },
  async (a) => text(await dispatch('addAsset', a)),
)

server.registerTool(
  'import_assets',
  {
    title: 'Import real content into a canvas',
    description:
      "Bulk-import a brand's REAL content into a campaign as first-class assets, so the canvas reflects the actual brand (not just generated drafts). Pass the items you've pulled: Buffer posts (source:\"social-live\"), scraped site pages / case studies (source:\"site\"), or a pasted content audit (source:\"imported\"). Each item is loosely shaped — caption/copy/headline/title, url, platform/channel, publishedAt, mediaRefs, metrics — and mapped to an asset. Re-import dedups by URL/copy (only new added), and login/challenge pages are dropped. Imported assets are live: list_assets(source:...) returns the real captions, and run_coherence_check evaluates them.",
    inputSchema: {
      brand: z.string().describe('The brand'),
      campaign: z.string().describe('The canvas/campaign to import into'),
      source: z.enum(['social-live', 'buffer', 'site', 'site-map', 'imported']).describe('social-live/buffer = real posts; site/site-map = scraped pages & case studies; imported = a pasted audit'),
      items: z
        .array(z.record(z.any()))
        .describe('The items to import. Flexible per source — e.g. Buffer: { caption, url, platform, publishedAt, mediaRefs, metrics }; site: { title, copy, url }; audit: { headline, primaryText, channel, stage }.'),
    },
  },
  async (a) => text(await dispatch('importAssets', a)),
)

server.registerTool(
  'set_asset_status',
  {
    title: 'Approve / reject / review an asset',
    description: 'Move an asset through the review lifecycle: draft → in_review → approved / rejected (also scheduled/posted/failed). Only approved assets are the shippable set. Optional note.',
    inputSchema: {
      assetId: z.string().describe('The asset id'),
      status: z.enum(['draft', 'in_review', 'approved', 'rejected', 'scheduled', 'posted', 'failed']).describe('The new status'),
      note: z.string().optional().describe('Why (e.g. a rejection reason)'),
    },
  },
  async (a) => text(await dispatch('setAssetStatus', a)),
)

server.registerTool(
  'approve_assets',
  {
    title: 'Bulk-approve assets',
    description: 'Approve every in-scope draft / in_review asset (optionally one campaign), or an explicit assetIds list. The shippable set in one call.',
    inputSchema: {
      campaign: z.string().optional().describe('Limit to one campaign'),
      assetIds: z.array(z.string()).optional().describe('Explicit ids to approve (overrides campaign)'),
    },
  },
  async (a) => text(await dispatch('approveAssets', a)),
)

server.registerTool(
  'delete_asset',
  {
    title: 'Delete an asset (soft)',
    description: 'Soft-delete an asset (archived, hidden, recoverable via restore_asset). Pass purge: true for a permanent hard delete.',
    inputSchema: {
      assetId: z.string().describe('The asset id'),
      purge: z.boolean().optional().describe('Hard-delete permanently (default false = soft)'),
    },
  },
  async (a) => text(await dispatch('deleteAsset', a)),
)

server.registerTool(
  'restore_asset',
  {
    title: 'Restore a soft-deleted asset',
    description: 'Recover an archived asset.',
    inputSchema: { assetId: z.string().describe('The asset id (find via list_assets includeArchived: true)') },
  },
  async (a) => text(await dispatch('restoreAsset', a)),
)

server.registerTool(
  'delete_assets',
  {
    title: 'Bulk-delete assets (soft)',
    description: 'Soft-delete many assets — an explicit assetIds list, or every variant of a fan set via variantOf (the master asset name). Recoverable.',
    inputSchema: {
      assetIds: z.array(z.string()).optional(),
      variantOf: z.string().optional().describe('Archive every variant fanned from this master asset name'),
    },
  },
  async (a) => text(await dispatch('deleteAssets', a)),
)

server.registerTool(
  'delete_campaign',
  {
    title: 'Delete a campaign (soft)',
    description: 'Soft-delete a campaign and its assets (recoverable via restore_campaign).',
    inputSchema: { campaign: z.string().describe('The campaign name') },
  },
  async (a) => text(await dispatch('deleteCampaign', a)),
)

server.registerTool(
  'restore_campaign',
  {
    title: 'Restore a soft-deleted campaign',
    description: 'Recover an archived campaign and its assets.',
    inputSchema: { campaign: z.string().describe('The campaign name') },
  },
  async (a) => text(await dispatch('restoreCampaign', a)),
)

server.registerTool(
  'delete_client',
  {
    title: 'Delete a client / brand (permanent)',
    description:
      'Permanently delete a client/brand and all its assets. HARD delete — there is no restore_client, and delete_campaign / delete_asset are the recoverable ones. It exists to clear setup-failure junk brands like "Just a moment...". ASK BEFORE CALLING IT on anything else, and confirm the exact name against list_clients first: a near-miss here deletes a real brand.',
    inputSchema: { name: z.string().describe('The client / brand name') },
  },
  async (a) => text(await dispatch('deleteClient', a)),
)

server.registerTool(
  'set_library_item_status',
  {
    title: 'Approve / reject a library item',
    description: 'Approve (vet) or reject (remove) a library item that landed unapproved — an audience / proof / hook / cta / subject. kind is the library bucket.',
    inputSchema: {
      brand: z.string().describe('The brand'),
      kind: z.enum(['ctas', 'rtbs', 'audiences', 'strategies', 'subjects', 'hooks']).describe('The library bucket'),
      id: z.string().describe('The item id'),
      status: z.enum(['approved', 'rejected']).describe('approved vets it; rejected removes the draft'),
    },
  },
  async (a) => text(await dispatch('setLibraryItemStatus', a)),
)

server.registerTool(
  'fan_out_preview',
  {
    title: 'Preview a personalization fan-out',
    description:
      "Count-before-commit for a personalization card: how many variants fanning a campaign across a dimension would create, without committing. Values come from the brand's library (audience -> library audiences, location -> library locations, journey -> funnel stages) or pass them explicitly. Stacking multiplies over existing variants. Also returns a channel-aware cap + verdict (ok/warn/over/ceiling) + recommendedDimension — the number you can realistically DEPLOY on these channels (SEO/landing earns thousands; organic social should stay near posting cadence). Prefer the recommended dimension and stay within the cap.",
    inputSchema: {
      campaign: z.string().describe('The campaign to fan out'),
      dimension: z.string().describe('The personalization dimension: audience, location, journey, channel, time, lifecycle, intent, tier, …'),
      values: z.array(z.string()).optional().describe('A subset of values to fan across (selective fan-out). Omit to use all library values.'),
      exclude: z.array(z.record(z.string())).optional().describe('Combinations to prune, e.g. [{ "audience": "Beach season", "time": "Winter" }].'),
    },
  },
  async (a) => text(await dispatch('fanOutPreview', a)),
)

server.registerTool(
  'fan_out',
  {
    title: 'Fan a campaign across a dimension',
    description:
      "Fan a campaign's base assets into one variant per value of a dimension, each tagged with its lineage (the composition, for attribution), then generate copy per variant. Stacks over existing variants (Audience × Location × Journey). Always preview the count first. Use `values` for selective fan-out and `exclude` for matrix pruning. By default the fan is HELD to the channel-aware cap (the count you can realistically deploy) — the result reports `capped` when that happens. Pass `force: true` to fan past the cap, up to the hard ceiling.",
    inputSchema: {
      campaign: z.string().describe('The campaign to fan out'),
      dimension: z.string().describe('The personalization dimension (audience, location, journey, …)'),
      values: z.array(z.string()).optional().describe('A subset of values (selective fan-out). Omit for all library values.'),
      exclude: z.array(z.record(z.string())).optional().describe('Combinations to prune.'),
      generate: z.boolean().optional().describe('Generate copy per variant after fanning (default true).'),
      force: z.boolean().optional().describe('Fan past the channel-aware cap (up to the hard ceiling). Default false — the fan is held to the sensible cap for these channels.'),
    },
  },
  async (a) => text(await dispatch('fanOut', a)),
)

server.registerTool(
  'propose_conditions',
  {
    title: 'Propose conditional fan-out logic',
    description:
      "Infer if/then conditions for a campaign's fan-out from the brand's library associations: 'if audience = X then use proof Y', 'if journey = lapsed then win-back CTA', etc. Everything lands proposed — nothing shapes copy until a human approves it with set_condition_status. This is the intended way to add conditional logic: propose, then approve. Never hand-build rules.",
    inputSchema: {
      campaign: z.string().describe('The campaign to propose conditions for'),
    },
  },
  async (a) => text(await dispatch('proposeConditions', a)),
)

server.registerTool(
  'list_conditions',
  {
    title: 'List a campaign’s fan-out conditions',
    description: 'Read the proposed / approved / rejected conditions on a campaign, as plain-language sentences, before approving or fanning out.',
    inputSchema: {
      campaign: z.string().describe('The campaign whose conditions to list'),
    },
  },
  async (a) => text(await dispatch('listConditions', a)),
)

server.registerTool(
  'set_condition_status',
  {
    title: 'Approve or reject a fan-out condition',
    description:
      'Approve, reject, or reset a proposed condition. Only approved conditions repoint a variant’s proof/hook/CTA or prune the combination during the next fan-out / generation.',
    inputSchema: {
      campaign: z.string().describe('The campaign the condition belongs to'),
      id: z.string().describe('The condition id (from propose_conditions / list_conditions)'),
      status: z.enum(['approved', 'rejected', 'proposed']).describe('approved = it shapes copy; rejected = ignored; proposed = back to pending'),
    },
  },
  async (a) => text(await dispatch('setConditionStatus', a)),
)

server.registerTool(
  'get_brand_baseline',
  {
    title: 'Read a brand’s coherence baseline',
    description:
      'The brand a canvas measures against: the voice and proof set in force and where they come from (the brand itself, an inherited parent, an explicitly shared library). Generation and the coherence check read ONLY this scope — nothing else can cross the brand boundary.',
    inputSchema: {
      brand: z.string().describe('The brand (client) to inspect'),
    },
  },
  async (a) => text(await dispatch('getBrandBaseline', a)),
)

server.registerTool(
  'set_brand_parent',
  {
    title: 'Set a brand’s parent (inherit up the tree)',
    description:
      'Bind a sub-brand to a parent so it inherits the parent’s proof / values / audiences, overriding voice and its own assets locally. Pass an empty parent to detach. Cycles and self-parenting are rejected.',
    inputSchema: {
      brand: z.string().describe('The sub-brand'),
      parent: z.string().describe('The parent brand (empty string to clear)'),
    },
  },
  async (a) => text(await dispatch('setBrandParent', a)),
)

server.registerTool(
  'set_brand_share',
  {
    title: 'Explicitly share a library between brands',
    description:
      'Attach (on=true) or detach (on=false) another brand’s library as a shared source for this brand — the only deliberate way assets cross between unrelated brands. Default isolation otherwise.',
    inputSchema: {
      brand: z.string().describe('The brand that pulls the shared library in'),
      share: z.string().describe('The brand whose library is shared in'),
      on: z.boolean().optional().describe('true to attach (default), false to detach'),
    },
  },
  async (a) => text(await dispatch('setBrandShare', a)),
)

server.registerTool(
  'set_brand_draft',
  {
    title: 'Mark a brand a draft (sketch)',
    description:
      'Flag a brand as a lightweight draft so users can experiment before committing, or clear the flag. A draft brand is a real, isolated binding (it can generate) — not a brand-less canvas.',
    inputSchema: {
      brand: z.string().describe('The brand'),
      draft: z.boolean().optional().describe('true to mark draft (default), false to clear'),
    },
  },
  async (a) => text(await dispatch('setBrandDraft', a)),
)

server.registerTool(
  'promote_brand',
  {
    title: 'Promote a draft brand to a real brand',
    description: 'Promote a draft brand into a real brand, optionally renaming it, carrying its library, profile, and campaigns onto the new name.',
    inputSchema: {
      brand: z.string().describe('The draft brand to promote'),
      realName: z.string().optional().describe('The real brand name (omit to keep the same name and just clear the draft flag)'),
    },
  },
  async (a) => text(await dispatch('promoteBrand', a)),
)

await server.connect(new StdioServerTransport())
