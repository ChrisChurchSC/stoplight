/**
 * Roles and permissions for sharing a client workspace. Three roles, one matrix.
 * The operator is always the owner; a share link grants a narrower role (editor or
 * stakeholder) scoped to a single client. Gating reads `can(role, permission)` at
 * each action chokepoint, so widening or narrowing access is one line here.
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

/** Roles an owner can hand out via a link (everything except owner itself). */
export const SHAREABLE_ROLES: Role[] = ['editor', 'stakeholder']
