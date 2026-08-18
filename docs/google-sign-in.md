# Sign in with Google

Adds "Continue with Google" to the sign-in and sign-up screens. Like the rest of the
backend it is additive: with no Supabase project configured the app never renders an
auth screen at all, and with Supabase configured but the Google provider switched off
the button is still there but the redirect fails. **The button appears as soon as
Supabase is configured**, so do the provider setup below before pointing anyone at it.

The code side is done. Everything here is console work, and it is yours to do — the
credentials are not something that can live in the repo.

## What you are wiring

Three parties, and the shape of it is the thing worth holding onto:

```
Breadcrumbs  ──1──▶  Google  ──2──▶  Supabase  ──3──▶  Breadcrumbs
             sends you        signs the        hands back
             to sign in       user in          a session
```

The consequence, and the single most common mistake: **Google redirects to Supabase,
not to the app.** The redirect URI you register with Google is a `supabase.co` URL you
will never type into a browser yourself. The app's own URL is registered separately,
with Supabase, in step 3.

## 1. Create the Google OAuth client

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → OAuth consent screen**. Choose **External**. Fill in the app
   name, a support email, and a developer contact. The default scopes (`email`,
   `profile`, `openid`) are all this needs — do not add more, since anything beyond
   them turns a one-screen consent into a Google verification review.
3. While the consent screen is in **Testing**, only addresses you add under **Test
   users** can sign in, and refresh tokens expire after 7 days. That is fine for now.
   **Publish** it before anyone outside the test list needs an account.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   Application type: **Web application**.
5. Under **Authorised redirect URIs**, add exactly this, with your project's ref:

   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

   The ref is the subdomain of your Supabase project URL (Project settings → API →
   Project URL). No trailing slash. This is the step that goes wrong; see the errors
   at the bottom.
6. Copy the **Client ID** and **Client secret**.

## 2. Turn the provider on in Supabase

**Authentication → Providers → Google** → enable → paste the client ID and secret → save.

Nothing else on that screen needs changing. Leave "Skip nonce check" off.

## 3. Allow the app's own URLs

**Authentication → URL Configuration**. This is what decides where a completed sign-in
is allowed to land, and it is separate from step 1.

- **Site URL** — the production URL. This is the fallback when a redirect is not on the
  list below, which is precisely why an unlisted localhost bounces to production
  instead of erroring.
- **Redirect URLs** — add every origin the app runs on:

  ```
  http://localhost:5173/**
  https://your-production-domain.com/**
  https://*-your-team.vercel.app/**
  ```

The code sends `window.location.origin` as `redirectTo` rather than a fixed URL, so
localhost, previews and production each come back to themselves — but only if the
origin is on this list. The password-reset link has the identical requirement and the
identical failure mode.

## 4. Try it

```bash
npm run dev
```

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`, the sign-in screen
appears. Click **Continue with Google**. A first-time account is asked one question —
what the company or team is called — and then lands in the app.

## Checking it really worked

Do this rather than trusting the dashboard, because the dashboard will lie to you by
omission. Supabase saves the provider row as soon as the toggle is on, so a config with
a client ID and **no secret** reports itself as enabled everywhere you would think to
look — the provider list shows a green Enabled badge, and `/auth/v1/settings` answers
`"google": true`. Both are telling you a config exists, not that it works.

The endpoint that knows is the one the button actually hits:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  'https://YOUR-REF.supabase.co/auth/v1/authorize?provider=google&redirect_to=http://localhost:5173/'
```

- **302** to `accounts.google.com` — working.
- **400** `{"msg":"Unsupported provider: missing OAuth secret"}` — the secret did not save.
  Paste it again and save. Note that Google only shows a client secret once, at
  creation; if it is gone, Google Cloud → Clients → your client → **Add secret** makes
  a new one, and the old one keeps working until you delete it.

A useful habit while pasting: the client ID and the secret both live on the clipboard at
different moments, and copying one overwrites the other. Paste the secret first — it is
the one you cannot go back for.

## What happens on a first Google sign-in

Google returns a name, an email and an avatar. It never returns an employer, and the
sign-up form's company field is what names the workspace — so a Google account would
otherwise fall through to `"chris's workspace"` off the email's local part. Nothing in
the app can rename a workspace (`workspaces` is written in one file, `lib/session.ts`),
so that name would be permanent.

Hence the extra screen: `AuthGate` asks for the company once, before the workspace is
created, prefilled with a guess from the email's domain
(`chris@super-conscious.studio` → "Super Conscious Studio", and nothing at all for a
gmail.com address, because a personal mailbox says nothing about where somebody works).
The rules are in `src/domain/workspaceNaming.ts` and tested in full.

Only accounts with no company and no workspace see it, so existing users and invited
teammates go straight in — and the check costs no request for anyone who signed up
through the form, since their company is already on the account.

## An address that already has a password account

**The identities link. It stays one account** — verified on this project on
18 August 2026, against an address that had signed up with a password five weeks
earlier:

```
user_id:    1352127c…   created 2026-07-13
providers:  ["email", "google"]
identities: email   created 2026-07-13
            google  created 2026-08-18   ← added by the Google sign-in
```

So somebody who signed up with a password and later clicks Continue with Google keeps
their workspace, their data and their user id, and gains a second way in. No duplicate
account is created and nothing is refused.

Two things follow from that. The account keeps its password — linking adds an identity,
it does not replace one — so both routes work afterwards. And because the account
already existed, it already had a workspace, which means the naming step below is
correctly skipped for it.

Worth knowing that this rests on Google returning a **verified** email that matches an
existing confirmed address. It is not a promise about every provider or every project
setting; it is what this project does today.

## When it goes wrong

| What you see | What it is |
|---|---|
| `redirect_uri_mismatch` from Google | Step 1.5. The URI registered with Google is not `https://YOUR-REF.supabase.co/auth/v1/callback` — usually the app's own URL was entered instead, or the project ref is wrong, or there is a trailing slash. |
| Sign-in completes but lands on production while you are on localhost | Step 3. `http://localhost:5173/**` is not in the Redirect URLs list, so Supabase used the Site URL. |
| `Unsupported provider: provider is not enabled` | Step 2. The provider is off. |
| `Unsupported provider: missing OAuth secret` | Step 2, and the one to expect. The provider was saved with the client ID but no secret, so it reads as enabled while being unusable — see "Checking it really worked" below. |
| Google says the app is blocked / unverified | The consent screen is in Testing and the address is not a test user. Add it, or publish. |
| The button does nothing and no error appears | Supabase is not configured at all — check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are in `.env` and the dev server was restarted. |
