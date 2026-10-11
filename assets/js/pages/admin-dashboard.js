/**
 * Admin dashboard bootstrap.
 *
 * Replaces a ~699-line inline script. Nothing that reads tenant data runs until
 * the auth guard has confirmed a staff session.
 */

import { guardPage } from '../lib/guard.js';
import { initBackButtonGuard, initLogoutButtons } from '../lib/session.js';
import { initTenantTable, listenToTenants } from './admin-dashboard/tenants.js';
import { initCreateTenant } from './admin-dashboard/create-tenant.js';
import { initDetailModals } from './admin-dashboard/modals.js';
import { listenToPayments } from './admin-dashboard/payments.js';
import { initRoomControls, listenToRooms } from './admin-dashboard/rooms.js';
import { initBuildingTab, listenToBuilding } from './admin-dashboard/building.js';
import { initUnitsEditor } from './admin-dashboard/units-editor.js';

guardPage({
  role: 'admin',
  redirectTo: 'admin-login.html',
  grantedEvent: 'admin-access-granted'
});

initLogoutButtons();
initBackButtonGuard('admin');
initDetailModals();
initRoomControls();

// Firestore listeners are bound only once the guard passes -- binding them for
// an anonymous visitor would attempt to read tenant PII.
document.addEventListener(
  'admin-access-granted',
  () => {
    initTenantTable();
    initCreateTenant();
    listenToTenants();

    // The webhook's ledger, so staff can reconcile a missed payment.
    listenToPayments();

    // Live room availability (replaces the former hardcoded Listings tab).
    listenToRooms();

    // 3D building with per-unit occupancy.
    listenToBuilding();
    initBuildingTab();

    // Creating units here uses the signed-in session -- no token required.
    initUnitsEditor();
  },
  { once: true }
);
