/**
 * The signed-in person's profile, stored on the device.
 *
 * There is no server-side profile: supabase/schema.sql models workspaces and membership, and
 * identity is `auth.users`, which has no name column of its own. So a person's details live in two
 * places — `user_metadata` on the account (durable, cross-device, written at sign-up) and this
 * localStorage record (what Settings → Profile reads and rewrites).
 *
 * This module exists so sign-up and Settings share one key instead of each spelling it out. They
 * write the same shape, which is what lets a new account arrive at Settings already filled in.
 */

export const ACCOUNT_KEY = 'stoplight.account.v1'

export interface Account {
  firstName: string
  lastName: string
  email: string
}

export const EMPTY_ACCOUNT: Account = { firstName: '', lastName: '', email: '' }

/** Whether this person has ever saved their profile, as opposed to simply having blank fields. */
export function hasSavedAccount(): boolean {
  try {
    return localStorage.getItem(ACCOUNT_KEY) !== null
  } catch {
    return false
  }
}

export function loadAccount(): Account {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}')
    return { firstName: raw.firstName ?? '', lastName: raw.lastName ?? '', email: raw.email ?? '' }
  } catch {
    return { ...EMPTY_ACCOUNT }
  }
}

export function saveAccount(account: Account): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  } catch {
    /* private mode / quota — the account still exists on the server, so this is not fatal */
  }
}
