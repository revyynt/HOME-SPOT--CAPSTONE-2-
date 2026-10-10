/**
 * Page-level authentication guards.
 *
 * Each dashboard needs the same three steps: hide the page, verify a live
 * session with the right role, then reveal. Hiding first avoids a flash of
 * content for an anonymous visitor before the redirect fires.
 */

import { authReady, requireRole } from '../firebase-service.js';

/**
 * Blocks rendering until the session and role check passes.
 *
 * On failure `requireRole` has already redirected, so this simply resolves
 * false and the caller should do nothing further.
 *
 * @param {Object} options
 * @param {'admin'|'superadmin'} options.role
 * @param {string} [options.redirectTo]
 * @param {string} [options.grantedEvent] - dispatched on success
 * @returns {Promise<boolean>}
 */
export async function guardPage({ role, redirectTo, grantedEvent }) {
  document.documentElement.dataset.authPending = 'true';

  await authReady;

  const allowed = await requireRole(role, redirectTo);
  if (!allowed) return false;

  delete document.documentElement.dataset.authPending;

  if (grantedEvent) {
    document.dispatchEvent(new CustomEvent(grantedEvent));
  }
  return true;
}
