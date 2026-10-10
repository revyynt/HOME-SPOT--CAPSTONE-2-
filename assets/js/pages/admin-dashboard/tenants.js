/**
 * Tenant table: rendering, filtering, statistics, and the live Firestore
 * listener.
 *
 * Split out of a 699-line inline script. Every Firestore value is escaped
 * before it reaches innerHTML, and row actions are delegated via data-*
 * attributes rather than inline handlers.
 */

import { db, firebaseFirestore } from '../../firebase-service.js';
import { avatarGradient, escapeHtml, formatPHP, initials } from '../../lib/format.js';
import { attr } from '../../lib/dom.js';

/** @type {Array<Object & {id: string}>} */
let loadedTenants = [];
let currentViewingTenant = null;

export function getTenants() {
  return loadedTenants;
}

export function getViewingTenant() {
  return currentViewingTenant;
}

/**
 * Subscribes to the tenants collection.
 *
 * Ordering falls back to an unordered query when the composite index is
 * missing, so the dashboard still works on a fresh database.
 *
 * @returns {() => void} unsubscribe
 */
export function listenToTenants() {
  const tenantsRef = firebaseFirestore.collection(db, 'tenants');
  const statusEl = document.getElementById('tenantsFirestoreStatus');

  const apply = (snapshot) => {
    loadedTenants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if (statusEl) {
      statusEl.textContent = `Synced with Firestore (${loadedTenants.length} tenants)`;
      statusEl.className = 'text-xs text-emerald-600 hidden sm:inline-block';
    }
    renderFiltered();
    updateTenantStats(loadedTenants);
  };

  try {
    return firebaseFirestore.onSnapshot(
      firebaseFirestore.query(tenantsRef, firebaseFirestore.orderBy('createdAt', 'desc')),
      apply,
      (error) => {
        console.warn('orderBy on tenants failed, falling back:', error);
        firebaseFirestore.onSnapshot(tenantsRef, apply);
      }
    );
  } catch (error) {
    console.error('Firestore tenants listener setup failed:', error);
    return () => {};
  }
}

/** Applies the search + room filters and re-renders. */
export function renderFiltered() {
  const search = (document.getElementById('tenantSearchInput')?.value || '').toLowerCase().trim();
  const roomFilter = (document.getElementById('tenantRoomFilter')?.value || '')
    .toLowerCase()
    .trim();

  const filtered = loadedTenants.filter((t) => {
    const haystack = [t.name, t.email, t.room, t.phone].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesRoom = !roomFilter || (t.room || '').toLowerCase().includes(roomFilter);
    return matchesSearch && matchesRoom;
  });

  renderTenantsTable(filtered);
}

function renderTenantsTable(tenants) {
  const tbody = document.getElementById('tenantsTableBody');
  if (!tbody) return;

  if (!tenants.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-12 text-center text-gray-500">
          <p class="font-medium">No tenants found</p>
          <p class="text-sm mt-1">Adjust the filters, or create a tenant account.</p>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = tenants
    .map((t) => {
      const gradient = avatarGradient(t.name);
      const rent = formatPHP(Number(t.monthlyRent) || 0);

      return `
        <tr class="hover:bg-gray-50/70 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr ${gradient} text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                ${escapeHtml(initials(t.name))}
              </div>
              <div>
                <div class="font-bold text-gray-900">${escapeHtml(t.name || 'Tenant')}</div>
                <div class="text-xs text-gray-500 font-mono">${escapeHtml(t.email || '—')}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              ${escapeHtml(t.room || 'Unassigned')}
            </span>
            <div class="text-xs text-gray-500 mt-0.5">${escapeHtml(t.dormName || '')}</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm text-gray-800">${escapeHtml(t.phone || '—')}</div>
            ${t.emergencyContact ? `<div class="text-xs text-gray-400">Emg: ${escapeHtml(t.emergencyContact)}</div>` : ''}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
            ${escapeHtml(t.moveInDate || '—')}
            <div class="text-xs text-gray-400">${escapeHtml(t.leaseTerm || '1 Year')}</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="font-bold text-gray-900">${escapeHtml(rent)}</div>
            <div class="text-xs text-gray-500">Due every ${escapeHtml(String(t.dueDay || 5))}th</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              ● Active
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
            <div class="flex items-center justify-end gap-2">
              <button data-action="view" data-id="${attr(t.id)}" title="View Profile" class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">view</button>
              <button data-action="copy" data-id="${attr(t.id)}" title="Copy Portal Link" class="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">copy</button>
              <button data-action="delete" data-id="${attr(t.id)}" data-name="${attr(t.name || 'this tenant')}" title="Remove Account" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">x</button>
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

function updateTenantStats(tenants) {
  const active = tenants.filter((t) => (t.status || 'Active') === 'Active').length;
  const totalRent = tenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('tenantsCountBadge', tenants.length);
  set('tenantsStatTotal', tenants.length);
  set('tenantsStatActive', active);
  set('tenantsStatRent', formatPHP(totalRent));
}

/** Populates and reveals the read-only tenant profile modal. */
export function viewTenantDetails(tenantId) {
  const tenant = loadedTenants.find((t) => t.id === tenantId);
  if (!tenant) return;
  currentViewingTenant = tenant;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('viewTenantName', tenant.name || 'Tenant');
  set('viewTenantEmail', tenant.email || '—');
  set('viewTenantRoom', tenant.room || '—');
  set('viewTenantDorm', tenant.dormName || 'Dormitory Unit');
  set('viewTenantRent', formatPHP(Number(tenant.monthlyRent) || 0));
  set('viewTenantDue', `Due every ${tenant.dueDay || 5}th`);
  set('viewTenantMoveIn', tenant.moveInDate || '—');
  set('viewTenantPhone', tenant.phone || '—');
  set('viewTenantLoginEmail', tenant.email || '—');
  // Never stored client-side; Firebase Auth owns the credential.
  set('viewTenantLoginPassword', 'Managed by Firebase Auth');
  set('viewTenantAvatar', initials(tenant.name));

  const notesSection = document.getElementById('viewTenantNotesSection');
  const notesEl = document.getElementById('viewTenantNotes');
  if (tenant.notes) {
    notesEl.textContent = tenant.notes;
    notesSection?.classList.remove('hidden');
  } else {
    notesSection?.classList.add('hidden');
  }

  document.getElementById('viewTenantModal')?.classList.remove('hidden');
}

export function closeViewTenantModal() {
  document.getElementById('viewTenantModal')?.classList.add('hidden');
}

/**
 * Copies portal sign-in details. The password is intentionally omitted -- it
 * lives in Firebase Auth and is shown to the tenant once, at creation.
 */
export function copyTenantLoginInfo(email, name, room) {
  const portalUrl =
    window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'tenant-login.html';

  const text =
    `MJP Residences - Tenant Portal Access\n` +
    `Tenant: ${name}\nRoom: ${room}\nPortal URL: ${portalUrl}\nEmail: ${email}\n\n` +
    `Sign in with the temporary password provided at move-in.`;

  navigator.clipboard
    .writeText(text)
    .then(() => alert('Tenant portal details copied to clipboard!'))
    .catch(() => alert(`Tenant Portal:\nEmail: ${email}\nURL: ${portalUrl}`));
}

export function copyCurrentTenantCredentials() {
  if (!currentViewingTenant) return;
  copyTenantLoginInfo(
    currentViewingTenant.email,
    currentViewingTenant.name,
    currentViewingTenant.room
  );
}

/**
 * Deletes a tenant's Firestore profile.
 *
 * Note this does not disable the Firebase Auth account. Removing the profile
 * means the tenant can no longer read their data (firestore.rules keys off
 * the tenant document), but the Auth user still exists.
 *
 * @param {string} tenantId
 * @param {string} tenantName
 */
export async function deleteTenantAccount(tenantId, tenantName) {
  if (
    !confirm(
      `Remove the tenant account for "${tenantName}"? They will no longer be able to sign in.`
    )
  ) {
    return;
  }

  try {
    await firebaseFirestore.deleteDoc(firebaseFirestore.doc(db, 'tenants', tenantId));
    alert(`Tenant ${tenantName} removed successfully.`);
  } catch (error) {
    console.error('Failed to remove tenant:', error);
    alert('Could not remove tenant. Error: ' + error.message);
  }
}

/**
 * Wires the table row actions and the filter inputs.
 */
export function initTenantTable() {
  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;

    const { action, id, name } = button.dataset;
    if (action === 'view') viewTenantDetails(id);
    else if (action === 'copy') {
      const tenant = loadedTenants.find((t) => t.id === id);
      if (tenant) copyTenantLoginInfo(tenant.email, tenant.name, tenant.room);
    } else if (action === 'delete') deleteTenantAccount(id, name);
  });

  for (const id of ['tenantSearchInput', 'tenantRoomFilter']) {
    document.getElementById(id)?.addEventListener('input', renderFiltered);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-action="copy-credentials"]')) {
      copyCurrentTenantCredentials();
    }
  });
}
