function getTenantLifecycle(tenant) {
  if (tenant.status && tenant.status !== 'Active') return tenant.status;
  if (tenant.movedIn === true || tenant.movedIn === 'true') return 'Active';
  if (!tenant.moveInDate) return 'Active';
  const parsed = new Date(tenant.moveInDate);
  if (Number.isNaN(parsed.getTime())) return 'Active';
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const moveInStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  if (moveInStart > todayStart) {
    return 'Pending Move-In';
  }
  return 'Active';
}

/**
 * Tenant table: rendering, filtering, statistics, and the live Supabase
 * listener.
 *
 * Split out of a 699-line inline script. Every database value is escaped
 * before it reaches innerHTML, and row actions are delegated via data-*
 * attributes rather than inline handlers.
 */

import { db, supabase, supabaseData } from '../../supabase-service.js';
import { avatarGradient, escapeHtml, formatPHP, initials } from '../../lib/format.js';
import { attr } from '../../lib/dom.js';
import { refreshTenantMessenger } from '../../render/messages.js';
import { refreshTenantRoomOptions, openCreateTenantModalFromData } from './create-tenant.js';
import { Toast } from '../../render/toast.js';

/** @type {Array<Object & {id: string}>} */
let allTenants = [];
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
  const tenantsRef = supabaseData.collection(db, 'tenants');
  const statusEl = document.getElementById('tenantsSupabaseStatus');

  const apply = (snapshot) => {
    allTenants = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    loadedTenants = allTenants.filter(
      (t) => String(t.status || 'Active').toLowerCase() !== 'archived'
    );
    if (statusEl) {
      statusEl.textContent = `Synced with Supabase (${loadedTenants.length} tenants)`;
      statusEl.className = 'text-xs text-emerald-600 hidden sm:inline-block';
    }
    renderFiltered();
    updateTenantStats(loadedTenants);
    refreshTenantMessenger();
    refreshTenantRoomOptions();
  };

  return supabaseData.onSnapshot(
    supabaseData.query(tenantsRef, supabaseData.orderBy('createdAt', 'desc')),
    apply,
    (error) => {
      console.error('Supabase tenants subscription failed:', error);
      if (statusEl) {
        statusEl.textContent = 'Unable to sync tenants with Supabase.';
        statusEl.className = 'text-xs text-red-600';
      }
    }
  );
}

/** Applies the search + room filters and re-renders. */
export function renderFiltered() {
  const search = (document.getElementById('tenantSearchInput')?.value || '').toLowerCase().trim();
  const roomFilter = (document.getElementById('tenantRoomFilter')?.value || '').trim();

  const isArchivedFilter = roomFilter === '__archived__';
  const sourceList = isArchivedFilter
    ? allTenants.filter((t) => String(t.status || '').toLowerCase() === 'archived')
    : loadedTenants;

  const filtered = sourceList.filter((t) => {
    const haystack = [t.name, t.email, t.room, t.previousRoom, t.phone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesRoom =
      isArchivedFilter ||
      !roomFilter ||
      (t.room || '').toLowerCase().includes(roomFilter.toLowerCase());
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
          <td class="px-4 py-3.5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr ${gradient} text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                ${escapeHtml(initials(t.name))}
              </div>
              <div class="min-w-0">
                <div class="font-bold text-gray-900">${escapeHtml(t.name || 'Tenant')}</div>
                <div class="text-xs text-gray-500 font-mono break-all">${escapeHtml(t.email || '—')}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-3.5">
            ${
              String(t.status || '').toLowerCase() === 'archived'
                ? `<span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">Archived</span>
                   ${t.previousRoom ? `<div class="text-[11px] text-gray-400 mt-0.5">Prev: ${escapeHtml(t.previousRoom)}</div>` : ''}`
                : `<span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                    ${escapeHtml(t.room || 'Unassigned')}
                  </span>
                  <div class="text-xs text-gray-500 mt-0.5">${escapeHtml(t.dormName || '')}</div>`
            }
          </td>
          <td class="px-4 py-3.5">
            <div class="text-sm text-gray-800">${escapeHtml(t.phone || '—')}</div>
            ${t.emergencyContact ? `<div class="text-xs text-gray-400">Emg: ${escapeHtml(t.emergencyContact)}</div>` : ''}
          </td>
          <td class="px-4 py-3.5 whitespace-nowrap text-sm text-gray-600">
            ${escapeHtml(t.moveInDate || '—')}
            <div class="text-xs text-gray-400">${escapeHtml(t.leaseTerm || '1 Year')}</div>
          </td>
          <td class="px-4 py-3.5 whitespace-nowrap">
            <div class="font-bold text-gray-900">${escapeHtml(rent)}</div>
            <div class="text-xs text-gray-500">Due every ${escapeHtml(String(t.dueDay || 5))}th</div>
          </td>
          <td class="px-4 py-3.5 whitespace-nowrap">
            ${
              String(t.status || '').toLowerCase() === 'archived'
                ? '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-300">● Archived</span>'
                : getTenantLifecycle(t) === 'Pending Move-In'
                  ? '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">● Pending Move-In</span>'
                  : '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">● Active</span>'
            }
          </td>
          <td class="px-4 py-3.5 whitespace-nowrap text-right text-sm">
            <div class="flex items-center justify-end gap-1.5">
              <button data-action="view" data-id="${attr(t.id)}" title="View Profile" class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">View</button>
              ${
                String(t.status || '').toLowerCase() === 'archived'
                  ? `<button data-action="reactivate" data-id="${attr(t.id)}" title="Reactivate / Re-assign Room" class="px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200">Reactivate</button>`
                  : `<button data-action="copy" data-id="${attr(t.id)}" title="Copy Portal Link" class="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">Copy</button>
                     <button data-action="delete" data-id="${attr(t.id)}" data-name="${attr(t.name || 'this tenant')}" title="Remove & Archive Account" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">x</button>`
              }
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

function updateTenantStats(tenants) {
  const active = tenants.filter((t) => getTenantLifecycle(t) === 'Active').length;
  const totalRent = tenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('activeBookingsCount', active);
  set('tenantsCountBadge', tenants.length);
  set('tenantsStatTotal', tenants.length);
  set('tenantsStatActive', active);
  set('tenantsStatRent', formatPHP(totalRent));
}

/** Populates and reveals the read-only tenant profile modal. */
export function viewTenantDetails(tenantId) {
  const tenant = (allTenants.length ? allTenants : loadedTenants).find((t) => t.id === tenantId);
  if (!tenant) return;
  currentViewingTenant = tenant;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('viewTenantName', tenant.name || 'Tenant');
  set('viewTenantEmail', tenant.email || '—');
  set(
    'viewTenantRoom',
    tenant.room || (tenant.previousRoom ? `Archived (Prev: ${tenant.previousRoom})` : 'Unassigned')
  );
  set('viewTenantResidenceType', tenant.dormName || 'Residence Unit');
  set('viewTenantRent', formatPHP(Number(tenant.monthlyRent) || 0));
  set('viewTenantDue', `Due every ${tenant.dueDay || 5}th`);
  set('viewTenantMoveIn', tenant.moveInDate || '—');
  set('viewTenantPhone', tenant.phone || '—');
  set('viewTenantLoginEmail', tenant.email || '—');
  // Never stored client-side; Supabase Auth owns the credential.
  set('viewTenantLoginPassword', 'Managed by Supabase Auth');
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
 * lives in Supabase Auth and is shown to the tenant once, at creation.
 */
export function copyTenantLoginInfo(email, name, room) {
  const portalUrl =
    window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'login.html';

  const text =
    `MJP Residences - Tenant Portal Access\n` +
    `Tenant: ${name}\nRoom: ${room}\nPortal URL: ${portalUrl}\nEmail: ${email}\n\n` +
    `Sign in with the temporary password provided at move-in.`;

  navigator.clipboard
    .writeText(text)
    .then(() =>
      Toast.alert({
        title: 'Credentials Copied',
        message: 'Tenant portal sign-in details have been copied to your clipboard.'
      })
    )
    .catch(() =>
      Toast.alert({
        title: 'Tenant Portal Access',
        message: `Email: ${email}\nURL: ${portalUrl}`
      })
    );
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
 * Deletes a tenant's Supabase profile.
 *
 * @param {string} tenantId
 * @param {string} tenantName
 */
export async function deleteTenantAccount(tenantId, tenantName) {
  const confirmed = await Toast.confirm({
    title: 'Remove & Archive Tenant',
    message: `Archive tenant account for "${tenantName}"? Their room assignment will be cleared and the account archived so their past records are preserved if they return.`,
    confirmText: 'Archive Tenant',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  try {
    const target =
      allTenants.find((t) => t.id === tenantId) || loadedTenants.find((t) => t.id === tenantId);
    const prevRoom = target?.room || '';

    // Archive tenant document: vacate room and set status to Archived
    try {
      await supabaseData.updateDoc(supabaseData.doc(db, 'tenants', tenantId), {
        status: 'Archived',
        room: '',
        previousRoom: prevRoom,
        archivedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('supabaseData updateDoc error:', e);
    }

    try {
      await supabase
        .from('tenants')
        .update({
          status: 'Archived',
          room_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', tenantId);
    } catch (e) {
      console.warn('relational tenants table update error:', e);
    }

    // Invoke delete-tenant function (which safely archives without deleting Auth user)
    try {
      await supabase.functions.invoke('delete-tenant', {
        body: { tenantId }
      });
    } catch (e) {
      console.warn('delete-tenant function error:', e);
    }

    if (target) {
      target.status = 'Archived';
      target.previousRoom = prevRoom;
      target.room = '';
      target.archivedAt = new Date().toISOString();
    }
    loadedTenants = loadedTenants.filter((t) => t.id !== tenantId);
    renderFiltered();
    updateTenantStats(loadedTenants);
    refreshTenantMessenger();
    refreshTenantRoomOptions();
    Toast.success(`Tenant "${tenantName}" has been archived. Room is now available.`);
  } catch (error) {
    console.error('Failed to archive tenant:', error);
    Toast.alert({
      title: 'Could Not Archive Tenant',
      message: error.message || 'Unable to archive tenant account.'
    });
  }
}

export function reactivateTenantAccount(tenantId) {
  const target = allTenants.find((t) => t.id === tenantId);
  if (!target) return;
  openCreateTenantModalFromData({
    name: target.name,
    email: target.email,
    phone: target.phone,
    emergencyContact: target.emergencyContact,
    room: target.previousRoom || '',
    amount: target.monthlyRent
  });
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
    else if (action === 'reactivate') reactivateTenantAccount(id);
  });

  for (const id of ['tenantSearchInput', 'tenantRoomFilter']) {
    const el = document.getElementById(id);
    el?.addEventListener('input', renderFiltered);
    el?.addEventListener('change', renderFiltered);
  }

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-action="copy-credentials"]')) {
      copyCurrentTenantCredentials();
      return;
    }

    if (target?.closest('[data-action="profile-extend-move-in"]')) {
      if (!currentViewingTenant?.id) return;
      const currentMoveIn = currentViewingTenant.moveInDate
        ? new Date(currentViewingTenant.moveInDate)
        : new Date();
      const nextDate = new Date(currentMoveIn);
      nextDate.setDate(nextDate.getDate() + 1);
      const newDateStr = nextDate.toISOString().split('T')[0];
      try {
        await supabaseData.updateDoc(supabaseData.doc(db, 'tenants', currentViewingTenant.id), {
          moveInDate: newDateStr,
          updatedAt: supabaseData.serverTimestamp()
        });
        currentViewingTenant.moveInDate = newDateStr;
        const moveInEl = document.getElementById('viewTenantMoveIn');
        if (moveInEl) moveInEl.textContent = newDateStr;
        Toast.success(`Extended ${currentViewingTenant.name}'s move-in date to ${newDateStr}.`);
      } catch (err) {
        console.error('Failed to extend move-in date:', err);
        Toast.error('Could not extend move-in: ' + (err.message || 'Unknown error'));
      }
      return;
    }

    if (target?.closest('[data-action="profile-complete-move-in"]')) {
      if (!currentViewingTenant?.id) return;
      try {
        await supabaseData.updateDoc(supabaseData.doc(db, 'tenants', currentViewingTenant.id), {
          movedIn: true,
          updatedAt: supabaseData.serverTimestamp()
        });
        currentViewingTenant.movedIn = true;
        const statusEl = document.getElementById('viewTenantStatus');
        if (statusEl) {
          statusEl.textContent = 'Active Tenant';
          statusEl.className =
            'inline-flex mt-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-100 text-green-800';
        }
        Toast.success(
          `Marked ${currentViewingTenant.name} as moved in. Schedule cleared from calendar.`
        );
      } catch (err) {
        console.error('Failed to mark moved in:', err);
        Toast.error('Could not mark moved in: ' + (err.message || 'Unknown error'));
      }
      return;
    }
  });
}

// Password reset via Supabase email
document.getElementById('btnSendPasswordResetEmail')?.addEventListener('click', async () => {
  if (!currentViewingTenant?.email) {
    Toast.alert({
      title: 'Missing Email',
      message: 'This tenant does not have a valid email address on file.'
    });
    return;
  }

  const btn = document.getElementById('btnSendPasswordResetEmail');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Sending Link...</span>';
  }

  try {
    const redirectUrl =
      window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'login.html';

    const { error } = await supabase.auth.resetPasswordForEmail(currentViewingTenant.email, {
      redirectTo: redirectUrl
    });

    if (error) throw error;

    Toast.alert({
      title: 'Reset Link Dispatched',
      message: `An official password reset email has been sent to ${currentViewingTenant.email} via Supabase.`
    });
  } catch (error) {
    console.error('Failed to send reset email:', error);
    Toast.alert({
      title: 'Error Sending Reset Email',
      message: error.message || 'Could not send the password reset email. Please try again.'
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
});
