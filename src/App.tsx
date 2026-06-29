import { useEffect } from 'react'
import { AuthGate } from './components/AuthGate'
import { Workbench } from './components/Workbench'
import { useTrafficStore } from './store/useTrafficStore'

export function App() {
  // Dev only: connect the agent bridge so Claude Desktop (via the MCP server)
  // can drive this tab. No-op in production builds.
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import('./lib/agentBridge').then((m) => m.startAgentBridge())
      // Dev only: expose the store for local data tooling (e.g. one-off content
      // ingestion). Gated on DEV, so it never ships.
      ;(window as typeof window & { __rh?: typeof useTrafficStore }).__rh = useTrafficStore
    }
  }, [])

  return (
    <AuthGate>
      <Workbench />
    </AuthGate>
  )
}
