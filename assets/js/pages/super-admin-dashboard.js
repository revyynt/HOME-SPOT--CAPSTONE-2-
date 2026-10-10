/**
 * Super-admin dashboard page module.
 *
 * Extracted from a 116-line inline script. The dashboard content itself is
 * still hardcoded mock data -- see CONVERSION-SUMMARY.md -- but the auth guard
 * and logout now come from shared modules.
 */

import { guardPage } from '../lib/guard.js';
import { initBackButtonGuard, initLogoutButtons } from '../lib/session.js';

guardPage({
  role: 'superadmin',
  redirectTo: 'admin-login.html',
  grantedEvent: 'superadmin-access-granted'
});

initLogoutButtons();
initBackButtonGuard('superadmin');
