import { supabase, supabaseData } from '../../supabase-service.js';
import {
  fetchGateLogs,
  fetchTenantsPresence,
  confirmAbandonmentAndReleaseRoom,
  formatGateTimestamp,
  isCurfewViolation
} from '../../lib/gate-service.js';
import { Toast } from '../../render/toast.js';

let currentPresenceList = [];
let currentGateLogs = [];
let activeFilter = 'ALL';

export async function refreshGateMonitor() {
  try {
    currentPresenceList = await fetchTenantsPresence();
    currentGateLogs = await fetchGateLogs(50);

    renderGateKpis();
    renderAwolAlerts();
    renderGateLogsTable();
  } catch (err) {
    console.warn('Error refreshing gate monitor:', err);
  }
}

function renderGateKpis() {
  const totalEl = document.getElementById('gateTotalTenantsCount');
  const insideEl = document.getElementById('gateInsideCount');
  const outsideEl = document.getElementById('gateOutsideCount');
  const awolEl = document.getElementById('gateAwolCount');
  const badgeEl = document.getElementById('gateAwolBadge');

  const total = currentPresenceList.length;
  const inside = currentPresenceList.filter((t) => t.gateStatus === 'INSIDE').length;
  const outside = currentPresenceList.filter((t) => t.gateStatus === 'OUTSIDE').length;
  const awol = currentPresenceList.filter((t) => t.isAwol).length;

  if (totalEl) totalEl.textContent = total;
  if (insideEl) insideEl.textContent = inside;
  if (outsideEl) outsideEl.textContent = outside;
  if (awolEl) awolEl.textContent = awol;

  if (badgeEl) {
    if (awol > 0) {
      badgeEl.textContent = `${awol} AWOL`;
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }
}

function renderAwolAlerts() {
  const container = document.getElementById('gateAwolAlertContainer');
  if (!container) return;

  const awolTenants = currentPresenceList.filter((t) => t.isAwol);

  if (!awolTenants.length) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="bg-red-50 border-l-4 border-red-500 p-4 sm:p-5 rounded-r-xl shadow-xs">
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-2">
          <svg class="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          <h4 class="text-sm font-bold text-red-900">
            Prolonged Absence Alert: ${awolTenants.length} Tenant(s) Outside > 7 Days (Potential Unannounced Move-Out)
          </h4>
        </div>
      </div>
      <p class="text-xs text-red-700 mt-1 mb-3">
        These tenants have tapped OUT at the gate and have not returned for over 7 days. If they have moved out without notice, you can confirm their vacancy to immediately free up the room inventory.
      </p>
      <div class="space-y-2">
        ${awolTenants
          .map(
            (t) => `
          <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white rounded-lg border border-red-200 shadow-2xs gap-2">
            <div>
              <p class="text-sm font-bold text-gray-900">${t.name || 'Tenant'} <span class="text-xs font-normal text-gray-500">(${t.room || 'Assigned Room'})</span></p>
              <p class="text-xs text-red-600 font-medium">Away for <strong>${t.daysAway} days</strong> • Last gate tap: ${formatGateTimestamp(t.lastGateTapAt)}</p>
            </div>
            <div class="flex items-center space-x-2">
              <button
                type="button"
                data-action="confirm-vacate"
                data-tenant-id="${t.id}"
                data-tenant-name="${t.name || 'Tenant'}"
                data-tenant-room="${t.room || ''}"
                class="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold rounded-lg transition shadow-xs"
              >
                Confirm Vacate & Free Room
              </button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderGateLogsTable() {
  const tbody = document.getElementById('gateLogsTableBody');
  if (!tbody) return;

  const isLogLate = (log) =>
    log.direction === 'IN' &&
    (log.timestamp ? isCurfewViolation(new Date(log.timestamp)) : Boolean(log.isLate));

  let filtered = currentGateLogs;
  if (activeFilter === 'IN') {
    filtered = currentGateLogs.filter((l) => l.direction === 'IN');
  } else if (activeFilter === 'OUT') {
    filtered = currentGateLogs.filter((l) => l.direction === 'OUT');
  } else if (activeFilter === 'LATE') {
    filtered = currentGateLogs.filter((l) => isLogLate(l));
  }

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-sm text-gray-500">
          No gate activity logs found for this filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((log) => {
      const isEntry = log.direction === 'IN';
      const pillClass = isEntry
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-gray-100 text-gray-700 border-gray-200';
      const dotClass = isEntry ? 'bg-emerald-500' : 'bg-gray-500';
      const pillLabel = isEntry ? 'IN' : 'OUT';
      const late = isLogLate(log);
      const curfewHtml = late
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">Late (Curfew)</span>'
        : '<span class="text-xs text-gray-500">On Time</span>';

      return `
        <tr class="hover:bg-gray-50/70 transition-colors text-sm">
          <td class="flex items-center justify-between gap-2 py-2 border-b border-gray-100 md:border-none md:table-cell md:py-3 md:px-5 font-semibold text-gray-900">
            <span class="md:hidden text-[11px] font-semibold uppercase text-gray-400">Tenant</span>
            <span>${log.tenantName || 'Tenant'}</span>
          </td>
          <td class="flex items-center justify-between gap-2 py-1.5 md:table-cell md:py-3 md:px-5 text-gray-600">
            <span class="md:hidden text-[11px] font-semibold uppercase text-gray-400">Room</span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">${log.room || 'Assigned Room'}</span>
          </td>
          <td class="flex items-center justify-between gap-2 py-1.5 md:table-cell md:py-3 md:px-5">
            <span class="md:hidden text-[11px] font-semibold uppercase text-gray-400">Status</span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${pillClass}">
              <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
              ${pillLabel}
            </span>
          </td>
          <td class="flex items-center justify-between gap-2 py-1.5 md:table-cell md:py-3 md:px-5 text-gray-600">
            <span class="md:hidden text-[11px] font-semibold uppercase text-gray-400">Date &amp; Time</span>
            <span class="text-xs sm:text-sm text-gray-700">${formatGateTimestamp(log.timestamp)}</span>
          </td>
          <td class="flex items-center justify-between gap-2 py-1.5 md:table-cell md:py-3 md:px-5">
            <span class="md:hidden text-[11px] font-semibold uppercase text-gray-400">Remarks</span>
            <span>${curfewHtml}</span>
          </td>
          <td class="flex items-center justify-between gap-2 py-1.5 md:table-cell md:py-3 md:px-5 font-mono text-xs text-gray-500 md:text-right">
            <span class="md:hidden text-[11px] font-sans font-semibold uppercase text-gray-400">Card UID</span>
            <span>${log.cardUid || 'N/A'}</span>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function initGateMonitor() {
  refreshGateMonitor();

  // Listen to filter buttons
  const filterButtons = document.querySelectorAll('[data-gate-filter]');
  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => {
        b.classList.remove('bg-white', 'text-gray-900', 'shadow-2xs', 'font-semibold');
        b.classList.add('text-gray-600', 'font-medium');
      });

      btn.classList.remove('text-gray-600', 'font-medium');
      btn.classList.add('bg-white', 'text-gray-900', 'shadow-2xs', 'font-semibold');

      activeFilter = btn.dataset.gateFilter;
      renderGateLogsTable();
    });
  });

  // Refresh button
  const refreshBtn = document.getElementById('btnRefreshGatePresence');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await refreshGateMonitor();
      Toast.info('Gate presence logs refreshed.');
    });
  }

  // Handle Confirm Vacate Button clicks (event delegation)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="confirm-vacate"]');
    if (!btn) return;

    const tenantId = btn.dataset.tenantId;
    const tenantName = btn.dataset.tenantName;
    const roomName = btn.dataset.tenantRoom;

    const confirmRelease = window.confirm(
      `Confirm tenant vacancy?\n\nTenant: ${tenantName}\nRoom: ${roomName}\n\nThis will mark the tenant as vacated/archived and immediately increment available room slots by 1.`
    );

    if (!confirmRelease) return;

    btn.disabled = true;
    btn.textContent = 'Releasing...';

    try {
      await confirmAbandonmentAndReleaseRoom(
        tenantId,
        'Unannounced Move-out / Abandoned (NFC Inactivity)'
      );
      Toast.success(`Success! ${tenantName} archived. Room ${roomName} vacancy restored (+1).`);
      await refreshGateMonitor();
    } catch (err) {
      Toast.error(err.message || 'Error releasing room');
      btn.disabled = false;
      btn.textContent = 'Confirm Vacate & Free Room';
    }
  });

  // Realtime updates with live toast notifications
  let lastKnownLogId = null;
  try {
    supabaseData.onSnapshot(supabaseData.collection(supabase, 'messages'), async () => {
      const logs = await fetchGateLogs(1);
      if (logs.length > 0) {
        const latest = logs[0];
        if (lastKnownLogId && latest.id !== lastKnownLogId) {
          const isEntry = latest.direction === 'IN';
          const statusText = isEntry ? 'IN' : 'OUT';
          Toast.info(`Gate Log: ${latest.tenantName} (${latest.room}) - ${statusText}`);
        }
        lastKnownLogId = latest.id;
      }
      refreshGateMonitor();
    });
  } catch {
    // optional realtime
  }
}
