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

### If the connector shows no logo

The server sends its icon inline, as a base64 PNG read from `public/favicon.png`, in the
`initialize` response. You can check it is being sent without involving a client at all:

```
node mcp/breadcrumbs-server.mjs
```

then paste one line and read the reply:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}
```

`serverInfo.icons` should hold one `image/png` entry with a `data:` src. If it does, the server has
done its part and the rest is the client.

**Two things to try, in order.** Icons are read once, during `initialize`, so a connection that was
open before the icon existed keeps not having one: quit Desktop entirely (not just the window) and
start a NEW conversation. If that changes nothing, the client may be fetching remote icons while
ignoring inline ones - those two look identical from the server. Set `BREADCRUMBS_ICON_URL` to an
`https` URL and it sends that instead:

```json
"env": {
  "BREADCRUMBS_ICON_URL": "https://your-site/favicon.png"
}
```

Deliberately not derived from `BREADCRUMBS_BRIDGE_URL`: that points at a dev server which is often
not running and is not https, and a checkout should not arrive pointed at somebody's deployment.
Unset, the inline PNG is used, which is the right default for a server that has to work offline.

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

## From Claude Code

The same server, reached from the terminal instead of Desktop. `.mcp.json` in the repo root
configures it, so a Claude Code session started anywhere in this project has the tools without
anyone running a setup command:

```json
{
  "mcpServers": {
    "breadcrumbs": { "command": "node", "args": ["mcp/breadcrumbs-server.mjs"] }
  }
}
```

Claude Code asks once per project before it will connect to a `.mcp.json` server — until you
approve it, `claude mcp list` shows it as ⏸ Pending approval. `claude mcp reset-project-choices`
takes the answer back if you approve it and change your mind.

**No credentials in that file, deliberately.** It is committed, and a token in a committed file is
a token in everyone's clone. With no `BREADCRUMBS_TOKEN` the server takes the local path: it posts
to `http://localhost:5173`, so `npm run dev` has to be running with a tab open, exactly as above.
That is also the honest default for a repo config — the deployed path is *your* workspace, and a
checkout should not arrive pointed at it.

To drive the deployed site from Claude Code, add it for yourself instead of for the repo. `--scope
local` keeps it in your own config rather than in git:

```
claude mcp add breadcrumbs-live \
  -e BREADCRUMBS_TOKEN=… \
  -e BREADCRUMBS_SUPABASE_URL=… \
  -e BREADCRUMBS_SUPABASE_ANON_KEY=… \
  --scope local \
  -- node mcp/breadcrumbs-server.mjs
```

Mint the token in the app the same way (Settings → Connections), and give it a different server
name from the project one so it is obvious which of the two a session is talking to.

**One thing Claude Code gets for free that Desktop does not.** Desktop launches the server from a
working copy that only changes when somebody runs `git pull`, so a merged connector change can sit
unused for hours — its schema, its tools and its instructions all frozen at whatever commit that
checkout is on. Claude Code runs the server from the repo you are working in, so it is whatever you
have checked out. Both still need restarting to pick a change up: Desktop needs a full quit AND a
new conversation, because tool definitions are fixed when a conversation starts.

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
| `schedule_asset` | `assetId` / `assetIds` / `campaign`, `date`, `time?`, `until?`, `everyDays?` | Sets when an asset goes out |
| `set_schedule` | `items: [{ assetId, scheduledAt }]` | Sets a different date per asset, in one call |

`headline` / `primaryText` / `description` / `cta` still work as shorthand for the four commonest
components, and `fields` wins where both name the same key. A shorthand the format has no component
for is **reported back, not stored** — the reply's `notStored` names it, so copy never disappears
quietly. Every write also returns `fields: { filled, missing, complete }`, and `list_assets` returns
the same per asset, so a half-built card is visible instead of reading as finished.

`schedule_asset` moves a batch to one day (optionally spread with `everyDays`); `set_schedule` writes
a different date to each asset. Both keep an asset's existing time of day unless told otherwise, move
both ends of a flighted asset together, and skip posted assets — when something went out is a fact,
not a plan.

### Dates: intent vs fact

`scheduledAt` is when an asset is **meant** to go out; `publishedAt` is when it **actually** did.
Both come back from `list_assets`, and setting one never clears the other — the gap between them is
the slip, and it is worth keeping. Filters and calendar grouping read `publishedAt` and fall back to
`scheduledAt`, so an authored asset is placed by its intended date until it has a real one.

`add_asset` and `edit_asset` both take `scheduledAt`, and `set_schedule` writes a different date to
each of many assets in one call. **Omit it on `add_asset` and the asset is stamped with the moment
it was created** — which is why a month of assets authored in one session used to stack onto a
single day in the calendar.

A date **with** a UTC offset (`2026-09-03T09:00:00Z`) is an absolute moment. A date **without** one
(`2026-09-03T09:00`, or a bare `2026-09-03`) is wall-clock time, resolved in the timezone of the
browser tab running Breadcrumbs — not Desktop's, and there is no workspace timezone setting to
resolve against. Every reply names the zone it used. `null` clears a date. Anything unreadable is an
error, never a silent fall back to now: an asset quietly scheduled for the moment it was created is
indistinguishable from one somebody scheduled on purpose.

`set_asset_status(status: "scheduled")` requires a date to already be set — the status claims a
publisher queued the asset for a moment, and one with no moment reads as handled everywhere it is
counted while the calendar has nothing to place.

### Renaming, and why it is not just a field

Journey links address assets **by name**: `linksTo`, `branchOf` and `variantOf` all hold asset names,
not ids. So `edit_asset`'s `assetName` rewrites every link pointing at the old name in the same
write, and refuses a name another asset already uses rather than silently uniquifying it — two
assets sharing a name makes every line between them ambiguous.

### Writes that cannot store what they were sent now fail

Copy sent under a key the format has no component for used to come back as `notStored` inside a
success reply. It is now an error, and nothing is written: the reply names the keys that would work.
`clampedToLimit` stays a note, because clamped copy **was** stored.

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
