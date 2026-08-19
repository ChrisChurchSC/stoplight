# Control Breadcrumbs from Claude Desktop (single-user, local)

Drive the running Breadcrumbs app from Claude Desktop by chat: "add Acme as a client",
"set up a client from acme.com", "run a coherence check on Deep Dive". The Desktop
tools run the REAL app actions in your open browser tab, and the UI updates live.

## How it works

```
Claude Desktop ──MCP(stdio)──▶ mcp/breadcrumbs-server.mjs ──HTTP──▶ dev-server bridge ──SSE──▶ Browser tab
                                                                                              │
                                                              runs the real store action (add client, set up, coherence)
                                                                                              │
                                                                                      localStorage + live UI
```

The **browser tab is the executor** (it holds the real Zustand store), so there is no
backend to stand up. Everything is local and single-user. None of this ships to the
production build: the bridge mounts only under `vite dev`, and the executor is gated on
`import.meta.env.DEV`.

Pieces:
- `server/agentBridge.ts` — dev-server endpoints (`/api/agent-bridge` SSE, `/api/agent-command`, `/api/agent-result`).
- `src/lib/agentBridge.ts` — the browser executor (whitelist of store actions).
- `mcp/breadcrumbs-server.mjs` — the MCP server Claude Desktop launches.

## One-time setup

1. **Claude Desktop config** (already added to `~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "breadcrumbs": {
         "command": "/usr/local/bin/node",
         "args": ["/Users/chris/Documents/GitHub/stoplight/mcp/breadcrumbs-server.mjs"]
       }
     }
   }
   ```
   If `node` lives elsewhere, use `which node` for the `command` path. The script path
   must be absolute so Node resolves the repo's `node_modules` (the MCP SDK).

2. **Restart Claude Desktop** so it picks up the new server. The four tools appear under
   the `breadcrumbs` connector.

## Using it

1. Start Breadcrumbs: `npm run dev`.
2. Open **one** tab at `http://localhost:5173` and leave it open. (If several Breadcrumbs
   tabs are open, the most-recently-loaded one is the executor. Keep one tab to avoid
   confusion.)
3. In Claude Desktop, just ask. Examples:
   - "List my Breadcrumbs clients."
   - "Add Acme Co as a client."
   - "Set up a client in Breadcrumbs from deep-dive.studio."
   - "Run a coherence check on Deep Dive."
   - "Fill in Acme's About info in Breadcrumbs: it's a Series-A devtools company, mission is X, voice is plain and technical."
   - "Pull Acme's live assets into Breadcrumbs from acme.com."
   - "Write Acme's messaging in Breadcrumbs: two audiences, three proof points, and a few hooks."
   - "Generate a demand-gen campaign's assets for Acme in Breadcrumbs from everything connected."

## Tools

| Tool | Args | What it does |
|---|---|---|
| `list_clients` | - | Lists workspace clients |
| `add_client` | `name` | Adds a client to the dashboard |
| `setup_client` | `url`, `notes?` | Crawls the site (multi-page) + any connected accounts, proposes brand/ICP/proof/channels/strategy/first campaign, and provisions the whole workspace |
| `run_coherence_check` | `client`, `campaign?` | Runs the Claude coherence check and returns the breaks |

### Set up a brand from your Claude

These let your own Claude drive the four jobs directly. Everything lands as a draft / unapproved for you to confirm in the app — Claude proposes, you finish.

| Tool | Args | What it does |
|---|---|---|
| `get_brand` | `brand` | Reads back what's connected (About profile, messaging system, campaigns, asset count). Call first. |
| `set_brand_info` | `brand`, `oneLiner?`, `website?`, `industry?`, `mission?`, `voice?`, `products?`, `differentiators?`, `values?`, … | **1) Populates the About info.** Only the fields you pass are written. |
| `pull_live_assets` | `url`, `notes?` | **2) Pulls a brand's live assets/messaging** from its site + ads into the connected map (same engine as `map_client`). |
| `add_audience` | `brand`, `name`, `role?`, `angle?`, `pains?`, `voice?` | **3) Writes an audience** into the messaging system |
| `add_proof_point` | `brand`, `claim`, `evidence?`, `metric?`, `source?` | **3) Writes a proof point (RTB)** |
| `add_subject` | `brand`, `text`, `angle?`, `outcome?` | **3) Writes a subject / theme** |
| `add_hook` | `brand`, `text`, `kind?`, `note?` | **3) Writes a hook** |
| `add_cta` | `brand`, `label`, `stage?`, `destination?`, `outcome?` | **3) Writes a CTA** |
| `new_campaign` | `brand`, `name`, `strategy?` | Creates an empty campaign |
| `generate_assets` | `brand`, `campaign`, `strategy?` | **4) Generates draft assets** for a campaign from everything connected (seeds the strategy's deliverables, then drafts the copy) |
| `map_client` | `url`, `notes?` | Maps a client's current live messaging (alias target of `pull_live_assets`) |

### Filling every field on a card

An asset card renders every copy component its FORMAT defines, and the set differs per channel: a
website has nine (hero headline, subhead, hero CTA, body, social proof, proof stat, mid CTA, FAQ,
footer CTA), an email has five, an Instagram post has one. Anything you don't write renders blank.

`add_asset` / `edit_asset` take `fields`: a map of the format's REAL keys to copy. That is the only
way to reach a component no alias names.

| Tool | Args | What it does |
|---|---|---|
| `get_asset_fields` | `channel`, `assetType?` | The exact components that card renders — key, label, recommended + hard char limits. **Call before authoring.** |
| `add_asset` | `brand`, `campaign`, `fields`, `channel?`, `assetType?`, `stage?`, `audience?`, `proofPoints?`, … | Hand-authors a first-class asset |
| `edit_asset` | `assetId`, `fields`, … | Edits any component of an existing asset |

`headline` / `primaryText` / `description` / `cta` still work as shorthand for the four commonest
components, and `fields` wins where both name the same key. A shorthand the format has no component
for is **reported back, not stored** — the reply's `notStored` names it, so copy never disappears
quietly. Every write also returns `fields: { filled, missing, complete }`, and `list_assets` returns
the same per asset, so a half-built card is visible instead of reading as finished.

### Object cards — the other kind of card

An asset is what the writer produces. An **object card** is what instructs it: an Audience card
carrying the pain to argue from, a Trigger carrying what the reader just did and the ask. That
instruction is called **direction**, its vocabulary is closed and differs per kind, and it is what
the card contributes — a card with none adds a name and nothing else.

| Tool | Args | What it does |
|---|---|---|
| `get_object_fields` | `kind` | What a card of this kind asks: key, label, hint, cap. **Call before writing one.** |
| `add_object_card` | `campaign`, `kind`, `fields`, `name?`, `note?`, `refId?` | Puts a card on the campaign's board |
| `edit_object_card` | `objectId`, `fields`, `name?`, `note?` | Answers a card's questions; empty string clears one |
| `list_object_cards` | `campaign` | Every card on the board and what each still owes |

Some kinds (`voice`, `concept`, `note`, `brand`, `product`, `pattern`) ask for no direction — they
contribute through the record they name, and are reported complete rather than permanently unfinished.

### Reviewing a campaign

| Tool | Args | What it does |
|---|---|---|
| `review_campaign` | `campaign`, `includeCopyCheck?` | One ranked list of everything worth doing, each finding carrying the call that fixes it |
| `run_coherence_check` | `client`, `campaign?` | The copy breaks alone (the slower, sharper half) |

`review_campaign` runs the coherence check **and** the passes it cannot make. The check reads the
copy — a claim with no proof, a weak CTA, two assets repeating each other. What it has never been
able to see is whether the campaign is *finished*: an asset with six of nine components blank is
perfectly coherent, because every word it does contain is fine. So the review also reports asset
cards with blank components, object cards carrying no direction, CTAs pointed at assets that are
gone, and handoffs no button covers — ranked worst-first, in a stable order.

Pass `includeCopyCheck: false` for a fast structural-only pass.

## What "set up a client" scrapes

- **Website: full multi-page crawl.** Homepage plus the highest-signal internal pages
  (product, pricing, features, about, blog, etc.), server-side so there are no CORS
  limits. Brand voice is inferred from how their copy actually reads.
- **Connected accounts (organic posts): gated.** If `BUFFER_ACCESS_TOKEN` is set, it
  pulls the client's recent published posts from Buffer and feeds them in (so the
  channel mix and voice reflect what they actually post). Without a token it runs
  website-only. Supermetrics (metrics) and per-platform APIs plug in the same way.
- **Not scrapable:** social posts behind logins (Instagram/LinkedIn/TikTok/X) without a
  connected account, and email. Those need the account connected, not a scrape.

## Notes

- **Browser tab must be open.** The tab is the executor; if it is closed, a tool returns
  "No Breadcrumbs tab is open." Open the app and retry.
- **Anthropic key required** for `setup_client` and `run_coherence_check` (they call
  Claude server-side). Set `ANTHROPIC_API_KEY` in `.env`. Without it they fall back to
  the heuristic (`setup_client` still works, just without the site-grounded proposal).
- **Bridge URL** defaults to `http://localhost:5173`. Override with `BREADCRUMBS_BRIDGE_URL`
  in the MCP server's env if you run the dev server on another port.
