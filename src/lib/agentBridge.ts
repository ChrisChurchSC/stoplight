import { useTrafficStore } from '../store/useTrafficStore'
import { mapSite } from '../adapters/setup/siteMap'

/**
 * Browser side of the agent bridge: this tab is the executor. It listens for
 * commands from the dev-server bridge (which the Rushhour MCP server, and so
 * Claude Desktop, posts to) and runs the REAL store actions, so a command typed
 * in Desktop adds a client / sets one up / runs a check in this tab, with the UI
 * updating live. Dev only. See server/agentBridge.ts and mcp/rushhour-server.mjs.
 */

type Args = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// The whitelist of actions the bridge may run. Each maps to a real store action.
const handlers: Record<string, (a: Args) => Promise<unknown>> = {
  async listClients() {
    return { clients: useTrafficStore.getState().clientList }
  },

  async addClient(a) {
    const name = str(a.name).trim()
    if (!name) throw new Error('name is required')
    useTrafficStore.getState().addClient(name)
    return { added: name, clients: useTrafficStore.getState().clientList }
  },

  async setupClient(a) {
    const url = str(a.url).trim()
    if (!url) throw new Error('url is required')
    const store = useTrafficStore.getState()
    const setup = await store.generateSetup({ url, notes: str(a.notes) || undefined })
    await useTrafficStore.getState().provisionWorkspace(setup)
    return {
      client: setup.brand.name,
      website: setup.brand.website,
      industry: setup.brand.industry,
      voice: setup.brand.voice,
      icp: setup.icp?.name,
      channels: setup.channelMix,
      strategy: setup.strategy,
      campaign: setup.campaign?.name,
      proofPoints: setup.rtbs?.length ?? 0,
    }
  },

  async mapClient(a) {
    const url = str(a.url).trim()
    if (!url) throw new Error('url is required')
    const map = await mapSite({ url, notes: str(a.notes) || undefined })
    await useTrafficStore.getState().provisionCurrentState(map)
    return {
      client: map.brand.name,
      audiences: map.audiences.map((x) => x.name),
      proofPoints: map.proofPoints.length,
      messages: map.messages.length,
      channels: [...new Set(map.messages.map((m) => m.channel))],
    }
  },

  async runCoherenceCheck(a) {
    const client = str(a.client).trim()
    const campaign = str(a.campaign).trim()
    const store = useTrafficStore.getState()
    if (client) store.setClientFilter(client)
    store.setCampaignFilter(campaign || 'all')
    await useTrafficStore.getState().runCoherenceCheck()
    const st = useTrafficStore.getState()
    const breaks = st.claudeBreaks ?? []
    return {
      client: st.clientFilter,
      campaign: campaign || 'All campaigns',
      live: st.coherenceLive,
      breakCount: breaks.length,
      breaks: breaks.map((b) => ({ axis: b.axis, severity: b.severity, headline: b.headline })),
    }
  },
}

let started = false

/** Open the bridge stream and execute commands as they arrive. Idempotent. */
export function startAgentBridge(): void {
  if (started || typeof EventSource === 'undefined') return
  started = true
  const es = new EventSource('/api/agent-bridge')
  es.addEventListener('command', (e) => {
    void (async () => {
      const cmd = JSON.parse((e as MessageEvent).data) as { id: string; action: string; args?: Args }
      let payload: Record<string, unknown>
      try {
        const h = handlers[cmd.action]
        if (!h) throw new Error(`unknown action: ${cmd.action}`)
        payload = { id: cmd.id, result: await h(cmd.args ?? {}) }
      } catch (err) {
        payload = { id: cmd.id, error: String((err as Error)?.message ?? err) }
      }
      void fetch('/api/agent-result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    })()
  })
}
