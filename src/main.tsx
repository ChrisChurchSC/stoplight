import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { maybeHydrateShare } from './lib/shareSnapshot'
import { applyTheme, readTheme } from './lib/theme'

// Before anything renders, including the public changelog: reading the stored choice after first
// paint is how you get a flash of the wrong theme.
applyTheme(readTheme())

// A ?share= link for an anonymous viewer seeds localStorage from the published brand snapshot
// BEFORE the store module loads (the store reads localStorage at import). App is dynamically
// imported for exactly that reason. No share link / signed-in user → this resolves immediately.
async function boot() {
  // Public, unauthenticated pages that render in front of the app (no store, no AuthGate).
  if (window.location.pathname.replace(/\/+$/, '') === '/changelog') {
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
