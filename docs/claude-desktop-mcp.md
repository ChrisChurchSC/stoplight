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

## Against the deployed site (no dev server)

There are two ways to connect, and the connector picks by whether `BREADCRUMBS_TOKEN` is set.

| | Local | **Deployed** |
|---|---|---|
| Needs `npm run dev` | yes | **no** |
| Tab open | localhost | **your Breadcrumbs site** |
| Transport | Vite bridge plugin (SSE) | `agent_commands` queue in Supabase |
| Config | nothing | `BREADCRUMBS_TOKEN` |

**The open tab is still the executor in both.** The app's behaviour lives in its Zustand store —
sixty-odd actions with their own rules about what may follow what — so commands run in a real tab
and the UI updates live. What changed is only *how the command gets there*: the local path is a Vite
plugin holding SSE streams and pending commands in module scope, which is stateful by construction
and could never exist on serverless. The queue lives in the database instead, which both ends can
already reach.

### Setting it up

1. **Apply the migration.** Run [`supabase/migrations/0012_agent_connector.sql`](../supabase/migrations/0012_agent_connector.sql)
   in the Supabase SQL editor (see [backend-setup](./backend-setup.md)). It adds `agent_tokens`,
   `agent_commands`, and the two entry-point functions.
2. **Mint a token** in the app: **Settings → Connections → Create a token**. It is shown **once** —
   only a SHA-256 of it is stored, so it cannot be shown again. The panel hands you a ready-made
   config block.
3. **Paste it into your Claude Desktop config** and restart Desktop:

```json
{
  "mcpServers": {
    "breadcrumbs": {
      "command": "node",
      "args": ["/absolute/path/to/stoplight/mcp/breadcrumbs-server.mjs"],
      "env": {
        "BREADCRUMBS_TOKEN": "bc_…",
        "BREADCRUMBS_SUPABASE_URL": "https://<project>.supabase.co",
        "BREADCRUMBS_SUPABASE_ANON_KEY": "<anon key>"
      }
    }
  }
}
```

4. **Open your Breadcrumbs site and sign in.** That tab is what runs the commands. With none open,
   calls time out with a message saying so rather than failing obscurely.

Omit `BREADCRUMBS_TOKEN` and everything works exactly as before, against `localhost:5173`.

### What a token can do, and how to stop it

A token carries **the same authority over that workspace that you do** — every action the connector
exposes, including `delete_asset`, `delete_campaign` and `delete_client`. It is scoped to the one
workspace it was minted in (the workspace is read from the token, never from an argument, so a
command cannot be aimed elsewhere), and it is worth pointing at a scratch campaign first.

Revoke in the same panel; it stops working on its next call. Revoking records a timestamp rather
than deleting the row, so a token that did something can still be accounted for afterwards.

Two tabs open on one workspace do not double-run anything: a command is claimed with a conditional
update and only the tab that wins it executes. A tab that dies mid-command releases its claim after
90 seconds so the next one can pick it up.

## The shape of a session

Sixty-odd tools with no stated order is why a session used to start wherever the first sentence
landed — assets generated for a brand with no audiences, a campaign built before anyone said what it
was for. Every call worked; the order nobody stated is what went wrong. Three things give it a shape.

**1. Server instructions.** Sent once at connect: the order the work happens, the two things to ask
rather than infer, and read-before-write. Nothing to configure.

**2. `whats_next`** — the entry point. It reads the *real* workspace and returns which rung it is on,
a headline about this workspace, why that rung matters, the calls that finish it, and the whole
ladder. The rungs:

> brand → who it sells to and what backs it → **the goal** → a campaign → the direction behind it →
> assets → **channels across the journey** → every component filled → reviewed → approved

The two bold rungs come back as a **question for you**, not an action. Neither the goal (which GTM
motion) nor the channel mix is derivable from the brand, and a wrong guess is invisible: the campaign
comes out coherent, complete and aimed at the wrong thing.

**3. Prompts** — pick one from Claude Desktop's prompt menu instead of starting from a blank box:

| Prompt | What it does |
|---|---|
| `start` | Reads the workspace and says what is worth doing next. Changes nothing. |
| `set-up-a-brand` | Reads a brand off its site, then fills the gaps *by asking* |
| `plan-a-campaign` | Asks the goal, asks the channels, puts direction on the board, *then* generates |
| `review-a-campaign` | Ranked findings, applies the mechanical fixes, flags what needs you |
| `fill-the-gaps` | Finds every half-built asset and object card, and finishes them |

They ask questions and stop. A prompt that provisioned a whole brand from one click would be making
the two decisions this server is careful never to infer.

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

## Gretel is a hand-off, not a chat

Gretel used to be a chat panel docked beside the campaign canvas: its own thread, its own
model call, its own approve-then-apply queue. It is now a dialog
(`src/components/GretelHandoff.tsx`) that does one thing — it writes a good question about
whatever is on screen and opens Claude or ChatGPT with it prefilled. The connector above is
what makes that question answerable.

Two things follow from that, and neither is hidden:

- **The write path went with the chat.** In-app Gretel could add deliverables, wire records,
  set a budget, and build a campaign, through a validated command vocabulary the user
  approved (`domain/flowAgent.ts`). The connector's tools are reads plus additive brand
  records, so an outside agent can *answer about* a campaign but cannot *build* one. Closing
  that gap means adding canvas-write tools to `mcp/breadcrumbs-server.mjs`, deliberately and
  per action, exactly as `GRETEL_ACTIONS` says.
- **`GRETEL_ACTIONS` now narrows nothing that runs.** That allowlist existed to give the
  in-app assistant a smaller surface than the connector, which was always handed the whole
  `handlers` map (`onCommand` in `src/lib/agentBridge.ts`). With the in-app assistant gone,
  `runAppAction` has no caller. Either route `onCommand` through it, or decide the wide map
  is right for something that only ever reaches a dev server on localhost.

`server/flowAgentHandler.ts` and `src/adapters/ask/generateFlowEdit.ts` are still in the tree
and still tested; nothing in the app calls them now.
