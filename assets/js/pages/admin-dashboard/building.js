/**
 * Admin Building tab: the 3D viewer plus a live occupancy table.
 *
 * Staff see full detail -- unit number, state, and who occupies it. The public
 * page (building.html) shows the same model with occupancy suppressed, so which
 * specific flats are empty is never public.
 *
 * Occupancy is derived from `tenants` and `reservations` rather than stored on
 * the unit, because `units` is world-readable and an "is this empty" flag there
 * would leak the building's vacancy to anyone who opens the app.
 */

import { createBuildingViewer } from '../../lib/building-viewer.js';
import { normalizeUnit, groupByFloor, UNIT_STATE } from '../../lib/units.js';
import { escapeHtml } from '../../lib/format.js';
import { Toast } from '../../render/toast.js';

let viewer = null;
let units = [];
let occupancy = { tenantUnitIds: new Set(), pendingUnitIds: new Set(), tenantByUnit: new Map() };
let unsubscribes = [];

/** Reservation states that mean the room is spoken for but not yet onboarded. */
const BLOCKING_RESERVATION_STATUSES = ['Approved'];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function statusChip(state) {
  const cls =
    state === UNIT_STATE.BOOKED
      ? 'bg-red-100 text-red-800'
      : state === UNIT_STATE.PENDING
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-100 text-emerald-800';
  return `<span class="px-2 py-1 rounded text-xs font-semibold ${cls}">${escapeHtml(state)}</span>`;
}

/**
 * Recomputes occupancy from the raw tenant and reservation docs.
 * Exported for testing.
 *
 * @param {Array<Object>} tenants
 * @param {Array<Object>} reservations
 */
export function computeOccupancy(tenants, reservations) {
  const tenantUnitIds = new Set();
  const tenantByUnit = new Map();

  for (const tenant of tenants) {
    const unitId = String(tenant?.unitId ?? '').trim();
    if (!unitId) continue;
    tenantUnitIds.add(unitId);
    if (!tenantByUnit.has(unitId)) {
      tenantByUnit.set(unitId, {
        name: tenant.name || 'Tenant',
        email: tenant.email || '',
        room: tenant.room || ''
      });
    }
  }

  // A reservation only blocks a specific unit once it carries a unitId, which
  // the admin assigns when converting it.
  const pendingUnitIds = new Set();
  for (const reservation of reservations) {
    const unitId = String(reservation?.unitId ?? '').trim();
    if (!unitId) continue;
    if (!BLOCKING_RESERVATION_STATUSES.includes(reservation.status)) continue;
    if (tenantUnitIds.has(unitId)) continue; // already onboarded -> Booked wins
    pendingUnitIds.add(unitId);
  }

  return { tenantUnitIds, pendingUnitIds, tenantByUnit };
}

function renderTable() {
  const body = document.getElementById('buildingUnitsBody');
  if (!body) return;

  const rows = [];
  for (const { floor, units: floorUnits } of groupByFloor(units)) {
    for (const unit of floorUnits) {
      const state = occupancy.tenantUnitIds.has(unit.id)
        ? UNIT_STATE.BOOKED
        : occupancy.pendingUnitIds.has(unit.id)
          ? UNIT_STATE.PENDING
          : UNIT_STATE.AVAILABLE;
      const tenant = occupancy.tenantByUnit.get(unit.id);

      rows.push(`
        <tr class="hover:bg-gray-50/70 transition-colors">
          <td class="px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-900">${escapeHtml(unit.number)}</td>
          <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-600">${floor}</td>
          <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-600">${escapeHtml(unit.type || '—')}</td>
          <td class="px-6 py-3 whitespace-nowrap">${statusChip(state)}</td>
          <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-800">
            ${tenant ? escapeHtml(tenant.name) : '<span class="text-gray-400">—</span>'}
            ${tenant?.email ? `<div class="text-xs text-gray-500">${escapeHtml(tenant.email)}</div>` : ''}
          </td>
        </tr>`);
    }
  }

  body.innerHTML = rows.length
    ? rows.join('')
    : '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">' +
      'No units yet. Run <code class="font-mono">npm run seed-units</code> or add them in Firestore.</td></tr>';
}

function renderStats() {
  const total = units.length;
  const booked = units.filter((u) => occupancy.tenantUnitIds.has(u.id)).length;
  const pending = units.filter(
    (u) => occupancy.pendingUnitIds.has(u.id) && !occupancy.tenantUnitIds.has(u.id)
  ).length;
  const free = total - booked - pending;

  setText('buildingTotalUnits', total);
  setText('buildingAvailableUnits', free);
  setText('buildingBookedUnits', booked);
  setText('buildingPendingUnits', pending);
}

function applyAll() {
  viewer?.setUnits(units, occupancy);
  renderTable();
  renderStats();
}

/**
 * Subscribes to units, tenants, and reservations, then paints everything.
 * @returns {(() => void)|null}
 */
export function listenToBuilding() {
  if (!window.firebaseDb || !window.firebaseFirestore) return null;

  const { collection, onSnapshot } = window.firebaseFirestore;
  const unitsRef = collection(window.firebaseDb, 'units');
  const tenantsRef = collection(window.firebaseDb, 'tenants');
  const reservationsRef = collection(window.firebaseDb, 'reservations');

  // Cached so computeOccupancy can join them without a second round trip.
  let tenantDocs = [];
  let reservationDocs = [];
  let unitsReady = false;

  function recompute() {
    if (!unitsReady) return;
    occupancy = computeOccupancy(tenantDocs, reservationDocs);
    applyAll();
  }

  try {
    unsubscribes.push(
      onSnapshot(
        unitsRef,
        (snapshot) => {
          units = snapshot.docs.map((doc) => normalizeUnit(doc.data(), doc.id));
          unitsReady = true;
          recompute();
        },
        (error) => console.warn('Units watcher unavailable:', error?.code || error?.message)
      )
    );

    unsubscribes.push(
      onSnapshot(
        tenantsRef,
        (snapshot) => {
          tenantDocs = snapshot.docs.map((doc) => doc.data());
          recompute();
        },
        (error) => console.warn('Tenants watcher unavailable:', error?.code || error?.message)
      )
    );

    unsubscribes.push(
      onSnapshot(
        reservationsRef,
        (snapshot) => {
          reservationDocs = snapshot.docs.map((doc) => doc.data());
          recompute();
        },
        (error) => console.warn('Reservations watcher unavailable:', error?.code || error?.message)
      )
    );
  } catch (error) {
    console.warn('Could not subscribe to the building:', error?.message);
    return null;
  }

  return () => unsubscribes.forEach((fn) => fn?.());
}

/**
 * Boots the viewer and wires the toolbar.
 */
export async function initBuildingTab() {
  const canvasHost = document.getElementById('buildingViewer');
  if (!canvasHost) return;

  try {
    viewer = await createBuildingViewer(canvasHost, {
      showOccupancy: true,
      onHover: (unitId, point) => {
        const tip = document.getElementById('buildingTooltip');
        if (!tip) return;
        if (!unitId || !point) {
          tip.classList.add('hidden');
          return;
        }
        const unit = units.find((u) => u.id === unitId);
        const tenant = occupancy.tenantByUnit.get(unitId);
        const state = occupancy.tenantUnitIds.has(unitId)
          ? UNIT_STATE.BOOKED
          : occupancy.pendingUnitIds.has(unitId)
            ? UNIT_STATE.PENDING
            : UNIT_STATE.AVAILABLE;
        tip.textContent = `Unit ${unit?.number ?? '?'} — ${state}${tenant ? ` · ${tenant.name}` : ''}`;
        tip.style.left = `${point.x + 12}px`;
        tip.style.top = `${point.y + 12}px`;
        tip.classList.remove('hidden');
      }
    });
  } catch (error) {
    console.error('Building viewer failed to start:', error);
    const host = document.getElementById('buildingViewer');
    if (host) {
      host.innerHTML =
        '<p class="text-sm text-gray-500 p-6">The 3D view could not load (needs WebGL + internet for the Three.js CDN).</p>';
    }
    return;
  }

  // Toolbar
  document.getElementById('buildingXrayToggle')?.addEventListener('change', (event) => {
    viewer?.setXray(event.target.checked);
  });

  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;
    if (button.dataset.action === 'building-refresh') {
      Toast.success('Building view refreshed from Firestore.');
      applyAll();
    }
  });

  // Populate the unit id suggestions for the create-tenant form, if present.
  const datalist = document.getElementById('unitSuggestionList');
  if (datalist && !datalist.childElementCount) {
    datalist.innerHTML = units
      .map((u) => `<option value="${escapeHtml(u.number)}"></option>`)
      .join('');
  }

  applyAll();
}
