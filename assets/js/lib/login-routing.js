/**
 * Where a successful sign-in should land.
 *
 * There is one login form for the whole app, so this decision is the only thing
 * that differs between a staff member and a tenant. Kept pure so every branch is
 * unit-testable -- the login page only performs the I/O.
 */

export const DESTINATION = {
  SUPERADMIN: './super-admin-dashboard.html',
  ADMIN: './admin-dashboard.html',
  TENANT: './tenant-portal.html'
};

/** Roles that are staff. Mirrors firestore.rules: isAdmin() */
export const STAFF_ROLES = ['admin', 'superadmin'];

/**
 * Resolves the page to open after a successful credential check.
 *
 * Staff are identified by `users/{uid}.role`. Everyone else is routed to the
 * tenant portal if a tenant profile exists -- which is also how legacy tenants
 * (created before the `users` document existed) still get in, since they have a
 * `tenants` document but no role.
 *
 * @param {Object} params
 * @param {string|null} [params.role] - the role on users/{uid}, if any
 * @param {boolean} [params.hasTenantProfile] - a tenants document exists
 * @returns {string|null} a destination path, or null when the account has no home
 */
export function resolveDestination({ role, hasTenantProfile = false } = {}) {
  const normalized = String(role ?? '').trim();

  if (normalized === 'superadmin') return DESTINATION.SUPERADMIN;
  if (normalized === 'admin') return DESTINATION.ADMIN;
  if (normalized === 'tenant') return DESTINATION.TENANT;

  // No role on the account, but a tenant profile: a tenant provisioned before
  // the users document existed.
  if (hasTenantProfile) return DESTINATION.TENANT;

  return null;
}

/**
 * The message shown when an account resolves to nowhere.
 * @param {string|null} [role]
 */
export function noDestinationMessage(role) {
  const normalized = String(role ?? '').trim();
  if (normalized) {
    return `Your account has an unrecognised role ("${normalized}"). Please contact support.`;
  }
  return 'Your account does not have a role assigned. Please contact support.';
}
