/**
 * The chrome both signed-out screens sit on: the purple field, the changelog link, and the product
 * footer. Extracted when sign-up outgrew the sign-in card and became its own page — two copies of
 * this markup would drift, and the two screens are one flow.
 *
 * `roomy` is for the taller sign-up card. The default field is exactly 100vh with overflow hidden,
 * which is right for a three-field card and wrong for anything that can exceed the viewport: the
 * bottom of the form would simply be unreachable.
 *
 * `footer` is the pitch — kicker, tagline, wordmark. Sign-in is where someone arrives cold and it
 * earns its place; by sign-up they have already decided, so that screen turns it off and lets the
 * card have the whole field.
 */
export function AuthShell({
  roomy = false,
  footer = true,
  children,
}: {
  roomy?: boolean
  footer?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`auth-gate${roomy ? ' roomy' : ''}`}>
      <a className="auth-changelog" href="/changelog">
        What&rsquo;s new
      </a>
      <div className="auth-center">{children}</div>
      {footer && (
        <div className="auth-footer">
          <p className="auth-kicker">
            Marketing infrastructure
            <br />
            and automation platform
          </p>
          <p className="auth-tagline">
            Leave a trail worth following. Breadcrumbs turns one brand strategy into personalized
            campaigns for every audience and channel.
          </p>
          <img src="/login-logo.svg" className="auth-bottomlogo" alt="Breadcrumbs" />
        </div>
      )}
    </div>
  )
}
