import { useEffect } from 'react'
import { AuthGate } from './components/AuthGate'
import { Workbench } from './components/Workbench'

export function App() {
  // Dev only: connect the agent bridge so Claude Desktop (via the MCP server)
  // can drive this tab. No-op in production builds.
  useEffect(() => {
    if (import.meta.env.DEV) void import('./lib/agentBridge').then((m) => m.startAgentBridge())
  }, [])

  return (
    <AuthGate>
      <Workbench />
    </AuthGate>
  )
}
