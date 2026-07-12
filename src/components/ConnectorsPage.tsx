import { useState } from 'react'

/**
 * Connect ItsyBitsy to Claude — the MCP connect card, in the shape every MCP server
 * uses: the server reference to copy, a tab per client (Claude Code / Desktop / Claude.ai),
 * and the exact command/config to paste. ItsyBitsy runs locally over stdio (the browser
 * tab is the executor), so the commands are node-over-stdio, not a hosted HTTP URL.
 */

const SERVER = 'mcp/hyperfocus-server.mjs'
const CODE_CMD = 'claude mcp add hyperfocus -- node "$(pwd)/mcp/hyperfocus-server.mjs"'
const DESKTOP_JSON = `{
  "mcpServers": {
    "hyperfocus": {
      "command": "node",
      "args": ["/absolute/path/to/stoplight/mcp/hyperfocus-server.mjs"]
    }
  }
}`

const TABS = [
  { key: 'code', label: 'Claude Code' },
  { key: 'desktop', label: 'Desktop' },
  { key: 'web', label: 'Claude.ai' },
] as const
type TabKey = (typeof TABS)[number]['key']

export function ConnectorsPage() {
  const [tab, setTab] = useState<TabKey>('code')
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(id)
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
  }

  return (
    <div className="page">
      <div className="page-body mcpc-body">
        <div className="mcpc">
          <h1 className="mcpc-title">Connect ItsyBitsy to Claude</h1>
          <p className="mcpc-sub">Bring your brands into Claude to set them up and run campaigns with AI.</p>

          <div className="mcpc-label">MCP Server</div>
          <div className="mcpc-url">
            <code>{SERVER}</code>
            <button className="mcpc-copy" onClick={() => copy('server', SERVER)}>
              {copied === 'server' ? '✓ Copied' : '⧉ Copy'}
            </button>
          </div>

          <div className="mcpc-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`mcpc-tab${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'code' ? (
            <>
              <p className="mcpc-run">Run this command in your terminal (from the stoplight repo):</p>
              <div className="mcpc-cmd">
                <code>{CODE_CMD}</code>
                <button className="mcpc-cmd-copy" onClick={() => copy('code', CODE_CMD)} aria-label="Copy command">
                  {copied === 'code' ? '✓' : '⧉'}
                </button>
              </div>
              <p className="mcpc-then">
                Then keep a tab open at <code>localhost:5173</code> and ask Claude to set up a brand.
              </p>
            </>
          ) : tab === 'desktop' ? (
            <>
              <p className="mcpc-run">
                Add this to <code>claude_desktop_config.json</code>:
              </p>
              <div className="mcpc-cmd mcpc-cmd-block">
                <pre>{DESKTOP_JSON}</pre>
                <button className="mcpc-cmd-copy" onClick={() => copy('desktop', DESKTOP_JSON)} aria-label="Copy config">
                  {copied === 'desktop' ? '✓' : '⧉'}
                </button>
              </div>
              <p className="mcpc-then">
                Use the absolute path to the server, then restart Claude Desktop. The <strong>hyperfocus</strong> tools
                appear; keep a tab open at <code>localhost:5173</code>.
              </p>
            </>
          ) : (
            <p className="mcpc-note">
              Claude.ai connects to hosted (HTTP) servers. ItsyBitsy runs locally over stdio, so connect it through{' '}
              <strong>Claude Code</strong> or <strong>Desktop</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
