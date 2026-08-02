import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { maybeHydrateShare } from './lib/shareSnapshot'
import { applyTheme, readTheme } from './lib/theme'

// The one public, signed-out page. It is reached from the splash, which is pinned black in literal
// hex precisely so the front door cannot arrive in two different colours depending on the visitor's
// OS — and a light changelog one click behind a black splash is that same bug, one page over. So
// this route is pinned to the dark palette too, and only this route.
const isChangelog = window.location.pathname.replace(/\/+$/, '') === '/changelog'

// Before anything renders, including the public changelog: reading the stored choice after first
// paint is how you get a flash of the wrong theme. Pinning here rather than inside ChangelogPage
// for the same reason — an effect after mount would paint light first, then correct itself.
// applyTheme only sets the attribute, so this never writes over the visitor's stored choice.
applyTheme(isChangelog ? 'dark' : readTheme())

// A ?share= link for an anonymous viewer seeds localStorage from the published brand snapshot
// BEFORE the store module loads (the store reads localStorage at import). App is dynamically
// imported for exactly that reason. No share link / signed-in user → this resolves immediately.
async function boot() {
  // Public, unauthenticated pages that render in front of the app (no store, no AuthGate).
  if (isChangelog) {
    const { ChangelogPage } = await import('./components/ChangelogPage')
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ChangelogPage />
      </StrictMode>,
    )
    return
  }

  await maybeHydrateShare()
  const { App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
