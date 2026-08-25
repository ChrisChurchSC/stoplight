/**
 * Who a share link is FOR, decided from access rather than from having an account.
 *
 * A ?share= link publishes a point-in-time snapshot of one brand (or one flow) so a recipient can
 * view it with no account at all. The recipient's app has to choose between two data sources: that
 * published snapshot, or the workspace backend it is signed into.
 *
 * The tempting question — "is this viewer signed in?" — gets that choice wrong, and wrong in the
 * one direction that looks like the feature is broken. Someone who follows a share link and then
 * makes an account HAS a session, so "signed in" sends them to live data; but the workspace they
 * are signed into is the brand-new empty one that sign-up just created for them. They land on the
 * share banner naming a brand, over a workspace with nothing in it. Blank. The same link worked
 * five minutes earlier, before they had an account.
 *
 * The question that survives sign-up is whether the viewer can actually READ the shared workspace —
 * that is, whether they are a member of the workspace that published the snapshot. A colleague who
 * already belongs there should see live data, snapshot or no snapshot. Everyone else — anonymous,
 * or signed into a workspace of their own — should be served the snapshot the link exists to show.
 *
 * Kept pure and separate from the fetching so the rule can be read and tested on its own; the
 * lookups it depends on are the caller's problem.
 */

export type ShareViewSource =
  /** Read the viewer's own workspace backend. They can see the shared work there already. */
  | 'live'
  /** Read the published snapshot. The viewer has no other way to see this work. */
  | 'snapshot'

export interface ShareViewInput {
  /** Does the viewer have any session at all? */
  signedIn: boolean
  /**
   * The workspace that published the snapshot, or null when it could not be determined — an
   * unpublished or revoked link, or a lookup that failed.
   */
  ownerWorkspaceId: string | null
  /** Every workspace the viewer is a member of. Only meaningful when signed in. */
  viewerWorkspaceIds: string[]
}

export function decideShareView(input: ShareViewInput): ShareViewSource {
  // No account is the case the whole feature exists for: the snapshot is the only data there is.
  if (!input.signedIn) return 'snapshot'

  /**
   * An unknown owner resolves to live, deliberately, and this is the safer of the two ways to be
   * wrong. A member whose lookup hiccuped gets their own real workspace — correct anyway. Sending
   * them to 'snapshot' instead would drop a full member into a read-only local copy where their
   * edits stop reaching the backend, which is a worse failure than the one being fixed.
   */
  if (!input.ownerWorkspaceId) return 'live'

  return input.viewerWorkspaceIds.includes(input.ownerWorkspaceId) ? 'live' : 'snapshot'
}

/**
 * IS THIS TAB SHOWING SOMEBODY ELSE'S SHARED WORK?
 *
 * Asked by the auth gate, which lets a share viewer past sign-in — the whole point of a ?share=
 * link is that it needs no account. The obvious answer is "is there a ?share= token in the address
 * bar", and that answer is wrong after the first render.
 *
 * The app mirrors the open campaign into the URL so a campaign can be linked to, and that rewrite
 * drops the token deliberately (a spent token should not trail through every later URL). The gate
 * re-read the live URL on every render, so the sequence was: token seeds the snapshot, gate admits
 * the viewer, the mirror fires, the gate re-renders and now sees no token — sign-in wall, over the
 * top of a fully hydrated campaign. The recipient signs up to get past it, lands in the empty
 * workspace that creates, and reports a blank page. See maybeHydrateShare and Workbench's mirror.
 *
 * So the boot flag answers too. It is set before the store loads and only for a viewer actually
 * being served a snapshot, and forgetSeededSnapshot clears it on any load without a token — so it
 * cannot outlive the view it describes and wave a stranger past the gate.
 */
export function shareViewActive(input: { hasToken: boolean; flagged: boolean }): boolean {
  return input.hasToken || input.flagged
}
