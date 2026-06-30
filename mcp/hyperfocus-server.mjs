#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

/**
 * Hyperfocus MCP server. Claude Desktop launches this over stdio; each tool posts
 * a command to the running Hyperfocus dev server's agent bridge, which dispatches
 * it into the open browser tab (the executor) and returns the real result. So
 * "add Acme as a client" in Desktop runs the actual app action and shows up live.
 *
 * Requires: Hyperfocus running (npm run dev) with a browser tab open at the bridge
 * URL. Configure in Claude Desktop -> see docs/claude-desktop-mcp.md.
 */

const BRIDGE = process.env.HYPERFOCUS_BRIDGE_URL || 'http://localhost:5173'

async function dispatch(action, args) {
  let res
  try {
    res = await fetch(`${BRIDGE}/api/agent-command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, args }),
    })
  } catch {
    return { ok: false, error: `Cannot reach the Hyperfocus dev server at ${BRIDGE}. Start it with: npm run dev` }
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 503) {
    return { ok: false, error: data.message || 'No Hyperfocus tab is open. Open http://localhost:5173 and retry.' }
  }
  return data
}

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })

const server = new McpServer({ name: 'hyperfocus', version: '0.1.0' })

server.registerTool(
  'list_clients',
  {
    title: 'List clients',
    description: 'List the clients currently in the Hyperfocus workspace.',
    inputSchema: {},
  },
  async () => text(await dispatch('listClients', {})),
)

server.registerTool(
  'add_client',
  {
    title: 'Add client',
    description: 'Add a new client by name to the Hyperfocus clients dashboard.',
    inputSchema: { name: z.string().describe('The client / company name') },
  },
  async ({ name }) => text(await dispatch('addClient', { name })),
)

server.registerTool(
  'setup_client',
  {
    title: 'Set up client with Claude',
    description:
      "Onboard a client from their website URL. Claude crawls their site (and any connected accounts) and proposes brand, ICP, proof points, channel mix, and a first campaign. It INFERS the best-fit GTM motion (PLG / demand-gen / sales-led / ABM / community) from business-model signals and returns it as recommendedStrategy with a rationale, confidence, and signalsUsed. The motion is stored on the brand and pre-selected for generation (override with set_strategy). Use this to set up a new client end to end.",
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
      'Run the Claude coherence check on a client (optionally one campaign) and return the breaks found in the campaign thread.',
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
      "Read back everything connected for a brand in Hyperfocus: its About profile, its messaging system (audiences, proof points, subjects, hooks, CTAs), its campaigns, and asset count. Call this FIRST so you can see what already exists before you populate or write more.",
    inputSchema: { brand: z.string().describe('The brand / client name') },
  },
  async ({ brand }) => text(await dispatch('getBrand', { brand })),
)

server.registerTool(
  'set_brand_info',
  {
    title: 'Populate brand About info',
    description:
      "Populate (or update) a brand's About profile — the standing context its canvases and messaging draw from. Creates the brand if it does not exist. Only the fields you pass are written; omit the rest. List fields accept an array or a comma/newline-separated string.",
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
      "Override the brand's GTM motion. The value persists on the brand and is honored by generate_assets (which seeds the deliverable set for the chosen motion). Pick a key from: plg, demand-gen, sales-led, lifecycle, aarrr, bowtie, abm, content-seo, outbound, community, local-takeover (names also accepted).",
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
      "Clear a brand's authored messaging components (audiences, proof points, subjects, hooks, CTAs) so you can rebuild them clean. Keeps the standard GTM strategies. Use this if the messaging list got polluted with stray or duplicate entries.",
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
    description: 'Create an empty campaign for a brand. Creates the brand if it does not exist.',
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
      "Generate draft assets for a campaign from everything connected — the brand's About profile, audiences, and proof points. Each asset is composed uniquely from its funnel stage, audience, CTA, and proof point (no two share a headline / primary text / CTA). Seeds the deliverable set for the chosen GTM strategy, then writes the copy. Creates the brand and campaign if needed. Drafts land for a human to review.",
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
      sort: z.string().optional().describe('Rank descending by "engagement" (likes+comments or rate) or any metric key (e.g. "impressions","reach","saves") — top posts first.'),
      includeArchived: z.boolean().optional().describe('Include soft-deleted assets (default false).'),
    },
  },
  async (a) => text(await dispatch('listAssets', a)),
)

server.registerTool(
  'edit_asset',
  {
    title: 'Edit an asset',
    description:
      'Edit an asset’s copy and targeting: headline, primaryText, description, cta, proofPoints (rtb ids or labels), audience, stage, channel, format. Editing changes the content, so re-run run_coherence_check to see the result. This is how a flagged break gets fixed by hand.',
    inputSchema: {
      assetId: z.string().describe('The asset id (from list_assets)'),
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
  'add_asset',
  {
    title: 'Hand-author an asset',
    description:
      'Create a bespoke asset by hand (no generation): set channel, stage, audience, format, headline, primaryText, description, cta, proofPoints. It is first-class (appears in list_assets, tagged authored, coherence-checked). Use for 1:1 ABM emails and one-off pieces.',
    inputSchema: {
      brand: z.string().describe('The brand'),
      campaign: z.string().describe('The campaign to author into'),
      channel: z.string().optional().describe('Channel (default Instagram)'),
      assetType: z.string().optional(),
      stage: z.enum(['awareness', 'consideration', 'conversion', 'retention']).optional(),
      audience: z.string().optional(),
      format: z.string().optional(),
      assetName: z.string().optional(),
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
    description: 'Permanently delete a client/brand and all its assets. HARD delete (not recoverable) — use it to clear setup-failure junk brands like "Just a moment...".',
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
      "Count-before-commit for a personalization card: how many variants fanning a campaign across a dimension would create, without committing. Values come from the brand's library (audience -> library audiences, location -> library locations, journey -> funnel stages) or pass them explicitly. Stacking multiplies over existing variants.",
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
      "Fan a campaign's base assets into one variant per value of a dimension, each tagged with its lineage (the composition, for attribution), then generate copy per variant. Stacks over existing variants (Audience × Location × Journey). Always preview the count first. Use `values` for selective fan-out and `exclude` for matrix pruning.",
    inputSchema: {
      campaign: z.string().describe('The campaign to fan out'),
      dimension: z.string().describe('The personalization dimension (audience, location, journey, …)'),
      values: z.array(z.string()).optional().describe('A subset of values (selective fan-out). Omit for all library values.'),
      exclude: z.array(z.record(z.string())).optional().describe('Combinations to prune.'),
      generate: z.boolean().optional().describe('Generate copy per variant after fanning (default true).'),
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
