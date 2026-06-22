#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

/**
 * Rushhour MCP server. Claude Desktop launches this over stdio; each tool posts
 * a command to the running Rushhour dev server's agent bridge, which dispatches
 * it into the open browser tab (the executor) and returns the real result. So
 * "add Acme as a client" in Desktop runs the actual app action and shows up live.
 *
 * Requires: Rushhour running (npm run dev) with a browser tab open at the bridge
 * URL. Configure in Claude Desktop -> see docs/claude-desktop-mcp.md.
 */

const BRIDGE = process.env.RUSHHOUR_BRIDGE_URL || 'http://localhost:5173'

async function dispatch(action, args) {
  let res
  try {
    res = await fetch(`${BRIDGE}/api/agent-command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, args }),
    })
  } catch {
    return { ok: false, error: `Cannot reach the Rushhour dev server at ${BRIDGE}. Start it with: npm run dev` }
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 503) {
    return { ok: false, error: data.message || 'No Rushhour tab is open. Open http://localhost:5173 and retry.' }
  }
  return data
}

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })

const server = new McpServer({ name: 'rushhour', version: '0.1.0' })

server.registerTool(
  'list_clients',
  {
    title: 'List clients',
    description: 'List the clients currently in the Rushhour workspace.',
    inputSchema: {},
  },
  async () => text(await dispatch('listClients', {})),
)

server.registerTool(
  'add_client',
  {
    title: 'Add client',
    description: 'Add a new client by name to the Rushhour clients dashboard.',
    inputSchema: { name: z.string().describe('The client / company name') },
  },
  async ({ name }) => text(await dispatch('addClient', { name })),
)

server.registerTool(
  'setup_client',
  {
    title: 'Set up client with Claude',
    description:
      "Onboard a client from their website URL. Claude crawls their site (and any connected accounts) and proposes brand, ICP, proof points, channel mix, GTM strategy, and a first campaign, then provisions the whole workspace. Use this to set up a new client end to end.",
    inputSchema: {
      url: z.string().describe("The client's website URL or domain, e.g. acme.com"),
      notes: z.string().optional().describe('Optional notes to steer the setup'),
    },
  },
  async ({ url, notes }) => text(await dispatch('setupClient', { url, notes })),
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

await server.connect(new StdioServerTransport())
