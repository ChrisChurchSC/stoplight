/**
 * WHILE THE WORKSPACE IS BEING READ.
 *
 * The app used to render its full shell against empty slices for as long as the read took: no
 * brands in the rail, no campaigns in the gallery, an empty canvas. Which is indistinguishable from
 * a workspace that has lost everything — and that is not a hypothetical reading. A connector
 * session looked at a brand mid-load, found nothing, and concluded the app and its data were on
 * different databases; a person doing the same thing has no tools to check with and just sees their
 * work gone.
 *
 * So the empty state is not shown until we know it is true. This says which of the two it is.
 *
 * NOT A SPINNER ALONE. A spinner says "wait"; it does not say what is being waited for, and the
 * thing worth saying here is that the work exists and is on its way.
 */
export function WorkspaceLoading() {
  return (
    <div className="ws-loading" role="status" aria-live="polite">
      <div className="ws-loading-inner">
        <div className="ws-loading-mark" aria-hidden="true">
          <span className="ws-loading-dot" />
          <span className="ws-loading-dot" />
          <span className="ws-loading-dot" />
        </div>
        <p className="ws-loading-title">Loading your workspace</p>
        <p className="ws-loading-sub">Fetching your brands, campaigns and assets.</p>
      </div>
    </div>
  )
}
