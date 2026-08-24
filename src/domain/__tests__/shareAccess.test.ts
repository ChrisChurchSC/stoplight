import { describe, expect, it } from 'vitest'
import { decideShareView } from '../shareAccess'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

describe('decideShareView', () => {
  it('serves the snapshot to a viewer with no account', () => {
    expect(decideShareView({ signedIn: false, ownerWorkspaceId: OWNER, viewerWorkspaceIds: [] })).toBe('snapshot')
  })

  /**
   * The bug this exists to stop: someone follows a share link, makes an account, and the account
   * puts them in a brand-new empty workspace. Having a session is not having access.
   */
  it('still serves the snapshot after the recipient makes an account', () => {
    expect(decideShareView({ signedIn: true, ownerWorkspaceId: OWNER, viewerWorkspaceIds: [OTHER] })).toBe('snapshot')
  })

  it('serves the snapshot to a brand-new account that is in no workspace yet', () => {
    expect(decideShareView({ signedIn: true, ownerWorkspaceId: OWNER, viewerWorkspaceIds: [] })).toBe('snapshot')
  })

  it('gives a member of the owning workspace their live data instead', () => {
    expect(decideShareView({ signedIn: true, ownerWorkspaceId: OWNER, viewerWorkspaceIds: [OTHER, OWNER] })).toBe('live')
  })

  it('falls back to live data when the owner cannot be determined', () => {
    expect(decideShareView({ signedIn: true, ownerWorkspaceId: null, viewerWorkspaceIds: [OTHER] })).toBe('live')
  })

  it('still serves the snapshot to an anonymous viewer when the owner is unknown', () => {
    expect(decideShareView({ signedIn: false, ownerWorkspaceId: null, viewerWorkspaceIds: [] })).toBe('snapshot')
  })
})
