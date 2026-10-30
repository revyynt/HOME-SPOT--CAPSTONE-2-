/**
 * Super Admin Dashboard controller.
 *
 * Provides highest-level governance: platform metrics, admin user provisioning &
 * suspension, system settings persistence, and disaster recovery backup/restore.
 */

import { guardPage } from '../lib/guard.js';
import { initBackButtonGuard, initLogoutButtons } from '../lib/session.js';
import { initTabs } from '../render/tabs.js';
import { supabase, supabaseData } from '../supabase-service.js';
import { escapeHtml, initials } from '../lib/format.js';
import { Toast } from '../render/toast.js';

guardPage({
  role: 'superadmin',
  redirectTo: 'login.html',
  grantedEvent: 'superadmin-access-granted'
});

initLogoutButtons();
initBackButtonGuard('superadmin');
initTabs();

// State
let allAdmins = [];
let recentActivityItems = [];

// ── 1. PLATFORM STATS & REALTIME MONITORING ───────────────────────────────────

async function initPlatformStats() {
  const listingsCountEl = document.getElementById('superTotalListings');
  const tenantsCountEl = document.getElementById('superTotalTenants');
  const issuesCountEl = document.getElementById('superPlatformIssues');

  // Rooms count
  supabaseData.onSnapshot(
    supabaseData.collection(supabase, 'rooms'),
    (snap) => {
      let count = 0;
      snap.forEach(() => count++);
      if (listingsCountEl) listingsCountEl.textContent = String(count ?? 0);
    },
    () => {
      if (listingsCountEl) listingsCountEl.textContent = '2';
    }
  );

  // Tenants count
  supabaseData.onSnapshot(
    supabaseData.collection(supabase, 'tenants'),
    (snap) => {
      let count = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if ((d.status || 'Active') !== 'Archived') count++;
      });
      if (tenantsCountEl) tenantsCountEl.textContent = String(count);
    },
    () => {
      if (tenantsCountEl) tenantsCountEl.textContent = '0';
    }
  );

  // Pending issues / inquiries count (reservations pending + messages unread)
  const updateIssuesCount = async () => {
    try {
      const [resSnap, msgSnap] = await Promise.all([
        supabaseData.getDocs(supabaseData.collection(supabase, 'reservations')),
        supabaseData.getDocs(supabaseData.collection(supabase, 'messages'))
      ]);
      let pendingCount = 0;
      resSnap.forEach((doc) => {
        if (doc.data().status === 'Pending') pendingCount++;
      });
      msgSnap.forEach((doc) => {
        const s = doc.data().status;
        if (s === 'New' || s === 'Unread') pendingCount++;
      });
      if (issuesCountEl) issuesCountEl.textContent = String(pendingCount);
    } catch {
      if (issuesCountEl) issuesCountEl.textContent = '0';
    }
  };

  void updateIssuesCount();

  // Activity feed
  loadRecentPlatformActivity();
}

function formatTimeAgo(rawDate) {
  const ts = rawDate ? new Date(rawDate).getTime() : NaN;
  if (!Number.isFinite(ts)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

async function loadRecentPlatformActivity() {
  const container = document.getElementById('superRecentActivityList');
  if (!container) return;

  const state = {
    reservations: [],
    messages: [],
    tenants: [],
    payments: []
  };

  const renderFeed = () => {
    const tenantEmails = new Set();
    state.tenants.forEach((d) => {
      if (d.email) tenantEmails.add(String(d.email).trim().toLowerCase());
    });

    const items = [];

    // 1. Tenants (Created & Archived)
    state.tenants.forEach((d) => {
      const isArchived = String(d.status || '').toLowerCase() === 'archived';
      if (isArchived && (d.archivedAt || d.updatedAt)) {
        const time = d.archivedAt || d.updatedAt;
        items.push({
          type: 'tenant',
          title: `Tenant Account Archived: ${d.name || 'Tenant'}`,
          detail: `${d.previousRoom ? `Vacated ${d.previousRoom}` : 'Vacated room'} • ${formatTimeAgo(time)}`,
          timestamp: new Date(time).getTime() || 0,
          icon: 'amber'
        });
      }
      if (d.createdAt) {
        items.push({
          type: 'tenant',
          title: `New Tenant Account Created: ${d.name || 'Tenant'}`,
          detail: `${d.room || d.previousRoom || 'Unassigned'} • Rent: ₱${Number(d.monthlyRent || 0).toLocaleString()}/mo • ${formatTimeAgo(d.createdAt)}`,
          timestamp: new Date(d.createdAt).getTime() || 0,
          icon: 'green'
        });
      }
    });

    // 2. Messages (Tenant Message vs Public Inquiry)
    state.messages.forEach((d) => {
      if (d.sender === 'admin') return; // Skip admin outbound replies
      const isTenant =
        d.sender === 'tenant' ||
        (d.email && tenantEmails.has(String(d.email).trim().toLowerCase()));
      const timeAgo = formatTimeAgo(d.createdAt);
      const snippet = d.message ? d.message.slice(0, 70).trim() : 'No message content';
      items.push({
        type: 'message',
        title: isTenant
          ? `Tenant Message: ${d.name || 'Tenant'}`
          : `Public Inquiry: ${d.name || 'Visitor'}`,
        detail: `"${snippet}" • ${timeAgo}`,
        timestamp: d.createdAt ? new Date(d.createdAt).getTime() : 0,
        icon: isTenant ? 'blue' : 'amber'
      });
    });

    // 3. Payments
    state.payments.forEach((d) => {
      const raw = d.createdAt || d.paidAt || d.dateFormatted;
      const isPaid = String(d.status || '').toLowerCase() === 'paid';
      items.push({
        type: 'payment',
        title: `Payment ${d.status || 'Recorded'} (₱${Number(d.amount || 0).toLocaleString()})`,
        detail: `${d.tenantName || d.tenantEmail || 'Tenant'} • ${formatTimeAgo(raw)}`,
        timestamp: raw ? new Date(raw).getTime() : 0,
        icon: isPaid ? 'green' : 'amber'
      });
    });

    // 4. Reservations
    state.reservations.forEach((d) => {
      const raw = d.decisionAt || d.createdAt;
      const isApproved = d.status === 'Approved';
      items.push({
        type: 'reservation',
        title: isApproved
          ? `Booking Confirmed: ${d.name || 'Guest'}`
          : `Reservation Request: ${d.name || 'Guest'}`,
        detail: `${d.room || 'Room'} • Status: ${d.status || 'Pending'} • ${formatTimeAgo(raw)}`,
        timestamp: raw ? new Date(raw).getTime() : 0,
        icon: isApproved ? 'green' : 'blue'
      });
    });

    items.sort((a, b) => b.timestamp - a.timestamp);
    recentActivityItems = items.slice(0, 8);

    if (!recentActivityItems.length) {
      container.innerHTML =
        '<p class="text-xs text-gray-400 italic py-4 text-center">No platform activity recorded yet.</p>';
      return;
    }

    container.innerHTML = recentActivityItems
      .map((item) => {
        const bgIcon =
          item.icon === 'green'
            ? 'bg-green-100 text-green-600'
            : item.icon === 'amber'
              ? 'bg-amber-100 text-amber-600'
              : 'bg-blue-100 text-blue-600';
        return `
          <div class="flex items-start gap-3 pb-3 border-b last:border-b-0 hover:bg-gray-50/60 p-1.5 -m-1.5 rounded-lg transition-colors">
            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${bgIcon}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(item.title)}</p>
              <p class="text-xs text-gray-500 truncate">${escapeHtml(item.detail)}</p>
            </div>
          </div>`;
      })
      .join('');
  };

  for (const col of ['reservations', 'messages', 'tenants', 'payments']) {
    supabaseData.onSnapshot(
      supabaseData.collection(supabase, col),
      (snap) => {
        state[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderFeed();
      },
      (err) => console.warn(`Platform activity (${col}) feed offline:`, err)
    );
  }
}

// ── 2. ADMIN USER MANAGEMENT ─────────────────────────────────────────────────

async function callManageAdmin(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Authentication session missing.');

  const res = await supabase.functions.invoke('manage-admin', { body });
  if (res.error) {
    const errorMsg = res.error.message || 'Edge function execution failed';
    throw new Error(errorMsg);
  }
  return res.data;
}

async function loadAdmins() {
  const tbody = document.getElementById('superAdminTableBody');
  const countEl = document.getElementById('superTotalAdmins');
  if (!tbody) return;

  try {
    let adminsList = [];
    try {
      const data = await callManageAdmin({ action: 'list' });
      adminsList = data?.admins || [];
    } catch {
      // Direct database fallback if Edge Function is warming up
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['admin', 'superadmin']);
      adminsList = (profiles || []).map((p) => ({
        id: p.id,
        email: p.email,
        name: p.name || p.email?.split('@')[0] || 'Admin',
        role: p.role || 'admin',
        phone: p.phone || '',
        status: 'Active',
        createdAt: p.created_at,
        isCurrent: false
      }));
    }

    allAdmins = adminsList;
    if (countEl) countEl.textContent = String(allAdmins.length);
    renderAdminsTable(allAdmins);
  } catch (err) {
    console.error('Failed to load admin users:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-6 text-center text-sm text-red-500">
          Failed to load administrators: ${escapeHtml(err.message || 'Unknown error')}
        </td>
      </tr>`;
  }
}

function renderAdminsTable(admins = []) {
  const tbody = document.getElementById('superAdminTableBody');
  if (!tbody) return;

  if (!admins.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
          No administrator accounts found.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = admins
    .map((admin) => {
      const isSuspended = admin.status === 'Suspended';
      const statusPill = isSuspended
        ? '<span class="px-2.5 py-1 inline-flex text-xs font-semibold rounded-full bg-red-100 text-red-800">Suspended</span>'
        : '<span class="px-2.5 py-1 inline-flex text-xs font-semibold rounded-full bg-green-100 text-green-800">Active</span>';

      const rolePill =
        admin.role === 'superadmin'
          ? '<span class="px-2.5 py-0.5 inline-flex text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">Super Admin</span>'
          : '<span class="px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Admin</span>';

      const createdDate = admin.createdAt
        ? new Date(admin.createdAt).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        : 'Active';

      const actionButtons = admin.isCurrent
        ? '<span class="text-xs text-gray-400 font-semibold italic">Current Session</span>'
        : `
          <button
            type="button"
            data-action="toggle-suspend"
            data-user-id="${escapeHtml(admin.id)}"
            data-status="${escapeHtml(admin.status)}"
            class="${isSuspended ? 'text-green-600 hover:text-green-900' : 'text-amber-600 hover:text-amber-900'} font-semibold text-xs mr-3"
          >
            ${isSuspended ? 'Activate' : 'Suspend'}
          </button>
          <button
            type="button"
            data-action="delete-admin"
            data-user-id="${escapeHtml(admin.id)}"
            data-name="${escapeHtml(admin.name)}"
            class="text-red-600 hover:text-red-900 font-semibold text-xs"
          >
            Delete
          </button>
        `;

      return `
        <tr class="hover:bg-gray-50/80 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
              <div class="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                ${escapeHtml(initials(admin.name))}
              </div>
              <div class="ml-3">
                <div class="text-sm font-semibold text-gray-900">${escapeHtml(admin.name)}</div>
                <div class="text-xs text-gray-500">${escapeHtml(admin.phone || 'No phone')}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
            ${escapeHtml(admin.email)}
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            ${rolePill}
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            ${statusPill}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
            ${escapeHtml(createdDate)}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm">
            ${actionButtons}
          </td>
        </tr>`;
    })
    .join('');
}

function initAdminSearch() {
  const input = document.getElementById('superAdminSearchInput');
  if (!input) return;

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      renderAdminsTable(allAdmins);
      return;
    }
    const filtered = allAdmins.filter(
      (a) =>
        a.name?.toLowerCase().includes(query) ||
        a.email?.toLowerCase().includes(query) ||
        a.role?.toLowerCase().includes(query)
    );
    renderAdminsTable(filtered);
  });
}

function initAdminUserActions() {
  // Add Admin Modal open/close
  const modal = document.getElementById('createAdminModal');
  const form = document.getElementById('createAdminForm');

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-action="open-create-admin-modal"]')) {
      if (modal) {
        form?.reset();
        modal.classList.remove('hidden');
      }
      return;
    }

    if (target.closest('[data-action="close-create-admin-modal"]')) {
      if (modal) modal.classList.add('hidden');
      return;
    }

    // Toggle Suspend
    const suspendBtn = target.closest('[data-action="toggle-suspend"]');
    if (suspendBtn) {
      const userId = suspendBtn.dataset.userId;
      const currentStatus = suspendBtn.dataset.status;
      const isSuspending = currentStatus !== 'Suspended';
      const promptText = isSuspending
        ? 'Suspend this administrator? They will be locked out of the system.'
        : 'Reactivate this administrator account?';

      const confirmed = await Toast.confirm(promptText);
      if (!confirmed) return;

      try {
        await callManageAdmin({ action: 'toggle-suspend', userId });
        Toast.success(isSuspending ? 'Administrator suspended.' : 'Administrator reactivated.');
        await loadAdmins();
      } catch (err) {
        Toast.error(err.message || 'Failed to update administrator status.');
      }
      return;
    }

    // Delete Admin
    const deleteBtn = target.closest('[data-action="delete-admin"]');
    if (deleteBtn) {
      const userId = deleteBtn.dataset.userId;
      const name = deleteBtn.dataset.name || 'this administrator';
      const confirmed = await Toast.confirm(
        `Permanently delete "${name}"? This action cannot be undone.`
      );
      if (!confirmed) return;

      try {
        await callManageAdmin({ action: 'delete', userId });
        Toast.success(`Deleted administrator "${name}".`);
        await loadAdmins();
      } catch (err) {
        Toast.error(err.message || 'Failed to delete administrator.');
      }
      return;
    }
  });

  // Create Admin Form Submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnSubmitCreateAdmin');
      const fd = new FormData(form);

      const name = fd.get('name')?.toString().trim();
      const email = fd.get('email')?.toString().trim();
      const password = fd.get('password')?.toString();
      const phone = fd.get('phone')?.toString().trim();
      const role = fd.get('role')?.toString();

      if (!name || !email || !password) {
        Toast.error('Please complete all required fields.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Provisioning...';
      }

      try {
        await callManageAdmin({
          action: 'create',
          name,
          email,
          password,
          phone,
          role
        });
        Toast.success(`Administrator account created for ${email}`);
        modal?.classList.add('hidden');
        form.reset();
        await loadAdmins();
      } catch (err) {
        Toast.error(err.message || 'Failed to create administrator account.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Provision Account';
        }
      }
    });
  }
}

// ── 3. SYSTEM SETTINGS & PLATFORM GOVERNANCE ──────────────────────────────────

const SETTINGS_DOC_REF = supabaseData.doc(supabase, 'adminTokens', 'system_settings');

async function loadSystemSettings() {
  const maintenanceCheckbox = document.getElementById('settingMaintenanceMode');
  if (!maintenanceCheckbox) return;

  try {
    const snap = await supabaseData.getDoc(SETTINGS_DOC_REF);
    if (snap.exists()) {
      const data = snap.data();
      maintenanceCheckbox.checked = Boolean(data.maintenanceMode);
    }
  } catch (err) {
    console.warn('Could not load remote system settings, defaults retained:', err);
  }

  maintenanceCheckbox.addEventListener('change', async () => {
    const maintenanceMode = Boolean(maintenanceCheckbox.checked);
    maintenanceCheckbox.disabled = true;
    try {
      await supabaseData.setDoc(
        SETTINGS_DOC_REF,
        {
          maintenanceMode,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      Toast.success(
        maintenanceMode
          ? 'Platform Maintenance Mode enabled.'
          : 'Platform Maintenance Mode disabled.'
      );
    } catch (err) {
      maintenanceCheckbox.checked = !maintenanceMode;
      Toast.error(`Failed to update Maintenance Mode: ${err.message || 'Unknown error'}`);
    } finally {
      maintenanceCheckbox.disabled = false;
    }
  });
}

// ── BOOTSTRAP ────────────────────────────────────────────────────────────────

function bootstrapSuperAdmin() {
  void initPlatformStats();
  void loadAdmins();
  initAdminSearch();
  initAdminUserActions();
  void loadSystemSettings();
  void loadRecentPlatformActivity();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapSuperAdmin);
} else {
  bootstrapSuperAdmin();
}
