import { Component, type ReactNode } from 'react'

/**
 * WHAT HAPPENS WHEN A LAZY CHUNK FAILS TO ARRIVE.
 *
 * Since the views became React.lazy, opening a screen fetches a hashed chunk over the network. That
 * fetch can fail, and the ordinary case is not a flaky connection: it is a redeploy. A tab left open
 * across a deploy still holds the old index, whose chunk names no longer exist on the server, so the
 * next click asks for a file that is now a 404.
 *
 * Without a boundary, React treats the rejected import as an unhandled render error and unmounts the
 * entire tree. Measured against a real production build, with one chunk routed to a 404: #root is
 * emptied and document.body ends up 31 bytes. The whole workspace disappears, with no message, from
 * a click on a tab. That is much worse than the blank panel the lazy loading was trading for.
 *
 * So the boundary catches it and offers the only fix that actually works: a reload, which fetches
 * the new index and with it the new chunk names. It deliberately does NOT reload automatically. A
 * genuine render bug inside a view would otherwise become a reload loop, and a person who is midway
 * through writing something should be the one who decides when the page goes away.
 */

interface Props {
  children: ReactNode
  /** Shown instead of the default message, for boundaries around a small region. */
  fallback?: ReactNode
}

interface State {
  failed: boolean
}

export class ChunkBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    // Left visible on purpose: a failed chunk is invisible in the UI once the message below renders,
    // and this is the only record of which module it was.
    console.error('[ChunkBoundary] a lazily loaded view failed to render', error)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div className="chunk-fail">
        <p className="chunk-fail-title">This part of the app could not load.</p>
        <p className="chunk-fail-body">
          That usually means a new version shipped while this tab was open. Reloading picks it up.
        </p>
        <button type="button" className="chunk-fail-btn" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
