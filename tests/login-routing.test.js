import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DESTINATION,
  STAFF_ROLES,
  resolveDestination,
  noDestinationMessage
} from '../assets/js/lib/login-routing.js';

test('a superadmin lands on the platform dashboard', () => {
  assert.equal(resolveDestination({ role: 'superadmin' }), DESTINATION.SUPERADMIN);
});

test('an admin lands on the admin dashboard', () => {
  assert.equal(resolveDestination({ role: 'admin' }), './admin-dashboard.html');
});

test('a tenant role lands on the tenant portal', () => {
  assert.equal(resolveDestination({ role: 'tenant' }), DESTINATION.TENANT);
});

test('a tenant with no profile still reaches the portal', () => {
  // The role is enough; the portal handles a missing profile gracefully and the
  // account can still be fixed up later.
  assert.equal(resolveDestination({ role: 'tenant', hasTenantProfile: false }), DESTINATION.TENANT);
});

test('a profile with no role still reaches the portal', () => {
  // Legacy tenants: created before the users document existed, so they have a
  // tenants profile but no role.
  assert.equal(resolveDestination({ role: null, hasTenantProfile: true }), DESTINATION.TENANT);
  assert.equal(resolveDestination({ role: undefined, hasTenantProfile: true }), DESTINATION.TENANT);
  assert.equal(resolveDestination({ hasTenantProfile: true }), DESTINATION.TENANT);
});

test('an account with neither role nor profile resolves to nowhere', () => {
  assert.equal(resolveDestination({ role: null, hasTenantProfile: false }), null);
  assert.equal(resolveDestination({}), null);
  assert.equal(resolveDestination(), null);
});

test('a staff role wins over a tenant profile', () => {
  // Someone with both must reach the dashboard, not the portal.
  assert.equal(
    resolveDestination({ role: 'superadmin', hasTenantProfile: true }),
    DESTINATION.SUPERADMIN
  );
  assert.equal(
    resolveDestination({ role: 'admin', hasTenantProfile: true }),
    './admin-dashboard.html'
  );
});

test('surrounding whitespace in the role does not break routing', () => {
  assert.equal(resolveDestination({ role: ' superadmin ' }), DESTINATION.SUPERADMIN);
});

test('an unknown role is not silently treated as a tenant', () => {
  // A typo'd or privileged-sounding role must not fall through to the portal.
  assert.equal(resolveDestination({ role: 'SuperAdmin', hasTenantProfile: false }), null);
  assert.equal(resolveDestination({ role: 'adminstrator' }), null);
  assert.equal(resolveDestination({ role: 'owner' }), null);
});

test('destinations are distinct', () => {
  const all = Object.values(DESTINATION);
  assert.equal(new Set(all).size, all.length);
});

test('STAFF_ROLES matches the roles the dashboard guards accept', () => {
  assert.deepEqual(STAFF_ROLES, ['admin', 'superadmin']);
});

test('the no-destination message distinguishes unknown role from no role', () => {
  assert.match(noDestinationMessage('wizard'), /unrecognised role/);
  assert.match(noDestinationMessage(null), /does not have a role assigned/);
});
