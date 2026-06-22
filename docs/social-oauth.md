# Organic social: YouTube, Instagram, LinkedIn

Onboarding maps a client's website + live Meta ads by default. Organic social needs
more, and the three platforms are very different. This is the build's state + the road.

## Where each one stands

| Platform | How | Status |
|---|---|---|
| **YouTube** | Public Data API v3 (a free Google API key, no OAuth) | **Built.** Set `YOUTUBE_API_KEY`. Channel auto-discovered from the site. |
| **Instagram** | Meta Graph API, the client's IG Business account connected via OAuth | **Reader built, gated.** Needs a Meta app + token. |
| **LinkedIn** | Community Management Posts API, the page admin connected via OAuth | **Reader built, gated.** Needs a LinkedIn app + token. |

There is no free, no-login way to read someone else's Instagram or LinkedIn. The
legitimate path is the client connecting their **own** account. That requires
registering an app with each platform, which is the first step and is yours to do.

## YouTube (do this now)

1. Google Cloud Console → new/existing project → enable **YouTube Data API v3**.
2. Create an **API key**.
3. `YOUTUBE_API_KEY=...` in `.env`, restart. Done. Re-onboard a client and their
   videos flow into the map (channel found from links on their site).

## Instagram (Meta Graph API)

**Register the app (yours to do):**
1. developers.facebook.com → create an app (Business type).
2. Add the **Instagram Graph API** product and **Facebook Login**.
3. Scopes you'll request at connect time: `instagram_basic`, `pages_show_list`
   (and `pages_read_engagement`). The client's IG account must be **Business or
   Creator** and **linked to a Facebook Page** they admin.
4. In dev mode the app works for accounts with a role on the app; **App Review**
   (Meta) is required to connect arbitrary clients in production.

**Dev/manual test path (before the OAuth flow lands):** generate a token in the
Graph API Explorer for a Page you admin, then set `INSTAGRAM_ACCESS_TOKEN` (and
optionally `INSTAGRAM_BUSINESS_ID`) in `.env`. The reader (`server/instagram.ts`)
will pull that account's recent captions. This is a single-account scaffold to
verify the reader, not multi-client.

## LinkedIn (Community Management Posts API)

**Register the app (yours to do):**
1. linkedin.com/developers → create an app, link it to the company Page.
2. Request the **Community Management API** product (a review process).
3. Scope at connect time: `r_organization_social`. The connecting member must have
   an ADMIN / CONTENT_ADMIN / DIRECT_SPONSORED_CONTENT_POSTER role on the page.

**Dev/manual test path:** get a token with `r_organization_social`, then set
`LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_ORG_ID` (numeric page id or full
`urn:li:organization:ID`) and `LINKEDIN_VERSION` (a current `YYYYMM`) in `.env`.
The reader (`server/linkedin.ts`) pulls recent post `commentary`.
Endpoint shape: `GET /rest/posts?author={org-urn}&q=author` (confirmed against the
Microsoft Learn Posts API docs); the `LinkedIn-Version` header rotates, so keep it
current.

## The OAuth flow (the remaining build)

The dev/manual env tokens above are scaffolding. The real product needs **per-client
OAuth** so each client connects their own account:

1. **Connect UI** on the Connectors page (and from the onboarding review's "connect
   to pull" link): "Connect Instagram", "Connect LinkedIn".
2. **OAuth endpoints** (dev server / serverless): `/api/oauth/{meta,linkedin}/start`
   (redirect to the platform consent screen with the scopes above) and
   `/callback` (exchange the code for an access token).
3. **Per-client token store** (server-side, keyed by the client + discovered
   handle), so the right token is used for the right client. The map reader picks
   the token for the client being onboarded instead of the global env var.
4. Long-lived token refresh (Meta 60-day tokens; LinkedIn refresh tokens).

Blocked on: the registered apps above (client IDs/secrets + a registered redirect
URI), and Meta/LinkedIn app review for connecting clients in production. Once the
apps exist and their credentials are in `.env`, the flow can be built and tested.
