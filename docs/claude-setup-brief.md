# Brief: Connect Claude to Rushhour (live API)

**For:** Cowork
**Repo:** `ChrisChurchSC/stoplight` — local at `/Users/chris/Documents/GitHub/stoplight`
**Goal:** Switch the app from mock/heuristic fallbacks to the real Claude API. It's one env var and one restart. No code changes.

## Background (30 seconds)

The Claude integration is already built. Every Claude-powered feature calls a server handler that reads `process.env.ANTHROPIC_API_KEY`. Right now that key is blank, so each feature silently falls back to a heuristic or mock. Add the key and they go live.

The dev server loads `.env` into the handlers' `process.env` at boot (see `vite.config.ts`, `SERVER_SECRETS`). So you only edit a file and restart, no shell `export` needed.

## What you need

- Access to the Anthropic Console (console.anthropic.com) for the org that should be billed.
- Billing or credits enabled on that org. The app uses model `claude-opus-4-8`.
- Edit access to the repo's local `.env` (it already exists and is gitignored).

## Steps

1. **Create an API key.** Console → API Keys → Create Key. Name it something like "Rushhour dev". Copy it (starts with `sk-ant-`).
2. **Paste it into `.env`.** Open `/Users/chris/Documents/GitHub/stoplight/.env` and set the first line:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Keep the name exactly as is. Do **not** add a `VITE_` prefix (that would bundle the secret into the browser). Leave every other var untouched.
3. **Restart the dev server.** Stop it (Ctrl-C) and run `npm run dev`. The key is only read at startup, so a running server won't pick it up.

## Verify (definition of done)

- Open the app, enter a client, and trigger any Claude feature (e.g. "Ask Claude", or "Recheck with Claude" on the canvas).
- In DevTools → Network, the call to `/api/claude-ask` (or `/api/icp-review`, `/api/claude-agent`) returns **200**, not **501**.
- **501** = the key still isn't reaching the handler. Usual cause: server not restarted, or the var was renamed/prefixed.
- **401 / auth error** = the key is invalid or the org has no credits. Flag it; don't keep retrying.

## Constraints

- **Server-side only.** `ANTHROPIC_API_KEY` must never be `VITE_`-prefixed. It lives in the dev server (and any serverless function), never the browser bundle.
- **Never commit the key.** `.env` is gitignored. Deliver the key over a secure channel (1Password / password manager), not chat or Slack.
- **Cost control.** Model is `claude-opus-4-8`. Set a spend limit in the Console if you want a cap.

## Production note

For a deployed build, the `/api/*` handlers run server-side on the host, so set the same `ANTHROPIC_API_KEY` (same name, no `VITE_`) in the hosting platform's environment variables. The local `.env` only covers local dev.

## Out of scope (optional, only if asked)

These connectors are independent; each falls back to its own mock when unset. Wire any of them the same way (paste into `.env`, restart):

- **Supabase** — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — real backend, auth, durable data. See `docs/backend-setup.md`. (Anon key is safe in the browser; RLS protects the data.)
- **Buffer** — `BUFFER_ACCESS_TOKEN` + `BUFFER_PROFILE_IDS` — publish organic social.
- **Resend** — `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` + `RESEND_FROM_EMAIL` — publish email.
- **Google Drive** — `VITE_GOOGLE_CLIENT_ID` + `VITE_GOOGLE_API_KEY` — real Drive import.

The Anthropic key alone is enough to run the whole engine; the publish tools just stay in mock until Buffer/Resend are set.

## Hand back

Confirm the 200 response and name which features you tested. Flag any 401/auth errors.
