/**
 * Roles and permissions for sharing a client workspace. Three roles, one matrix.
 * The operator is always the owner; a share link grants a narrower role (editor or
 * stakeholder) scoped to a single client.
 *
 * Enforcement note: in this mock (no backend), gating is applied in the VIEWS —
 * components read `can(role, permission)` to hide/disable mutating controls. The
 * store actions themselves are not role-gated, so this is presentation-level only.
 * A real deployment must enforce these on the server; `can()` is the single source
 * of truth either way.
 */

export type Role = 'owner' | 'editor' | 'stakeholder'

export interface RoleMeta {
  label: string
  blurb: string
}

export const ROLE_META: Record<Role, RoleMeta> = {
  owner: { label: 'Owner', blurb: 'Full control: edit, publish, share, and billing.' },
  editor: { label: 'Editor', blurb: 'Edit assets and publish. No sharing or billing.' },
  stakeholder: { label: 'Stakeholder', blurb: 'View and comment. No edits or publishing.' },
}

export type Permission = 'edit' | 'publish' | 'comment' | 'share' | 'billing'

const MATRIX: Record<Role, Permission[]> = {
  owner: ['edit', 'publish', 'comment', 'share', 'billing'],
  editor: ['edit', 'publish', 'comment'],
  stakeholder: ['comment'],
}

export const can = (role: Role, perm: Permission): boolean => MATRIX[role].includes(perm)

export type ShareableRole = Exclude<Role, 'owner'>

/**
 * Roles an owner can hand out via a link (everything except owner itself).
 * Least privilege first, which is the order the share dialog offers them in and the
 * default it lands on. Order is otherwise immaterial: the only other reader is
 * `isShareableRole`, which tests membership.
 */
export const SHAREABLE_ROLES: ShareableRole[] = ['stakeholder', 'editor']

/** A link can only ever grant a shareable role, so a forged token asking for owner is not one. */
export const isShareableRole = (r: unknown): r is ShareableRole =>
  typeof r === 'string' && (SHAREABLE_ROLES as string[]).includes(r)

/**
 * How a link's access reads in the share dialog. ROLE_META names the seat a person
 * holds ("Stakeholder"), which is the right word in the shared-view banner but the
 * wrong one when you are handing out a link: there the question is what the recipient
 * will be able to do, so it gets its own plain wording.
 */
export const SHARE_ACCESS: Record<ShareableRole, { label: string; can: string }> = {
  stakeholder: { label: 'Can view', can: 'view and comment on' },
  editor: { label: 'Can edit', can: 'open and edit' },
}
