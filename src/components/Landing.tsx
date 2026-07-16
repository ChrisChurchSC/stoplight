import { Wordmark } from './Wordmark'

/**
 * The public landing page shown in front of the app (before sign-in). A single no-scroll viewport
 * on a bright-orange field: the pitch up top, and the big Breadcrumbs wordmark at the bottom which
 * IS the sign-up button. "Sign in" (top-right) is the way back for returning users. Both hand off
 * to AuthGate, which reveals the sign-in / sign-up card.
 */
export function Landing({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  return (
    <div className="landing landing-orange">
      <header className="landing-top">
        <span aria-hidden="true" />
        <button className="landing-signin" onClick={onSignIn}>Sign in</button>
      </header>

      <main className="landing-hero">
        <span className="landing-eyebrow">Marketing command center</span>
        <h1 className="landing-h1">Your brand strategy, turned into campaigns.</h1>
        <p className="landing-sub">
          Breadcrumbs writes, schedules, and measures on-brand marketing in one place, so strategy,
          production, and reporting stop living in five different tools.
        </p>
      </main>

      <button className="landing-bigbrand" onClick={onGetStarted} aria-label="Sign up">
        <span className="landing-bigbrand-hint">Tap to sign up</span>
        <Wordmark className="landing-biglogo" />
      </button>
    </div>
  )
}
