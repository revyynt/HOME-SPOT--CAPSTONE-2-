// If an auth recovery link or error lands on index.html, forward immediately to login.html
if (typeof window !== 'undefined' && window.location.hash) {
  const hash = window.location.hash;
  if (hash.includes('type=recovery') || hash.includes('access_token') || hash.includes('error=')) {
    window.location.replace('./login.html' + hash);
  }
}

async function enforceStaffLockOnPublicPages() {
  const path = window.location.pathname.toLowerCase();
  if (
    path.includes('admin-dashboard') ||
    path.includes('super-admin-dashboard') ||
    path.includes('tenant-portal') ||
    path.includes('login') ||
    path.includes('property-detail') ||
    byId('reservationRequestsContainer') ||
    byId('superAdminTableBody')
  ) {
    return;
  }
  try {
    const { authReady, getCurrentUser } = await import('./supabase-service.js');
    await authReady;
    const user = await getCurrentUser();
    if (!user) return;
    const role = user.app_metadata?.role;
    if (role === 'admin') {
      window.location.replace('./admin-dashboard.html');
    } else if (role === 'superadmin') {
      window.location.replace('./super-admin-dashboard.html');
    }
  } catch (err) {
    console.warn('[auth] Staff lock check failed:', err);
  }
}

/**
 * Shared entry point for the public and admin pages.
 *
 * Previously a 800-line classic script that ran six initialisers on all five
 * pages that loaded it -- so the admin dashboard attached data listeners
 * on index.html and admin-login.html, where the target containers do not exist.
 *
 * It is now an ES module that imports what it needs and initialises only what
 * the current page actually contains. Per-page behaviour lives in ./pages/.
 */

import { initTabs } from './render/tabs.js';
import { initPublicForms } from './pages/public-forms.js';
import { setRoomAvailability, decrementRoomAvailability } from './room-availability.js';
import { supabase, supabaseData } from './supabase-service.js';
import { DEFAULT_ROOMS, formatRoomPrice, mergeRoomData } from './lib/rooms.js';
import { escapeHtml, formatPHP } from './lib/format.js';
import {
  BUILDING_UNITS,
  initBuilding3DViewer,
  syncBuildingUnitsWithRooms
} from './lib/building-3d.js';

const byId = (id) => document.getElementById(id);

function renderFeaturePills(features = []) {
  return features
    .map((feature, index) => {
      const tone =
        index % 2 === 0
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-blue-50 text-blue-700 border-blue-200';
      return `<span class="inline-flex items-center gap-1.5 ${tone} px-3 py-1.5 rounded-full text-xs font-medium border">${escapeHtml(feature)}</span>`;
    })
    .join('');
}

function renderLandingRoomCard(room) {
  const badgeHtml = room.badge
    ? `<div class="absolute top-3 left-3">
        <span data-room-badge
          class="bg-gradient-to-r from-blue-100 to-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold shadow-sm border border-green-200">
          ${escapeHtml(room.badge)}
        </span>
      </div>`
    : '';

  const availClass =
    room.available > 0
      ? 'bg-gradient-to-r from-green-500 to-green-600'
      : 'bg-gradient-to-r from-red-500 to-red-600';
  const availText = room.available > 0 ? `${room.available} Available` : 'Fully Booked';
  const detailUrl = `property-detail.html?id=${encodeURIComponent(room.id)}`;

  return `
    <div data-room-card="${escapeHtml(room.id)}"
      class="bg-gradient-to-br from-blue-50/40 via-white to-green-50/40 rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 group transform hover:-translate-y-2 border-2 border-transparent hover:border-blue-200 flex flex-col justify-between h-full">
      <div>
        <div class="relative overflow-hidden">
          <a href="${detailUrl}">
            <img data-room-image src="${escapeHtml(room.image)}" alt="${escapeHtml(room.name)}"
              class="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-500" />
          </a>
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-blue-900/20 to-transparent pointer-events-none"></div>
          ${badgeHtml}
          <div class="absolute top-3 right-3" data-availability-room="${escapeHtml(room.name)}" data-default-available="${escapeHtml(room.available)}">
            <span class="pulse-badge ${availClass} text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5">
              <span class="w-2 h-2 bg-white rounded-full"></span>
              ${escapeHtml(availText)}
            </span>
          </div>
          <div class="absolute bottom-4 left-4 right-4 pointer-events-none">
            <h4 data-room-name class="text-2xl font-bold text-white mb-1 drop-shadow-lg">${escapeHtml(room.name)}</h4>
            <p data-room-type class="text-sm text-green-200 font-medium">${escapeHtml(room.type)}</p>
          </div>${room.panorama ? `<div class="absolute bottom-3 right-3 pointer-events-none"><span class="bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-semibold px-2 py-0.5 rounded-md border border-white/20 shadow-sm">360° Tour</span></div>` : ''}
        </div>
        <div class="p-5">
          <div data-room-features class="flex flex-wrap gap-2 mb-4">
            ${renderFeaturePills(room.features || [])}
          </div>
        </div>
      </div>
      <div class="px-5 pb-5">
        <div class="flex items-end justify-between pt-3 border-t border-slate-100">
          <div>
            <div class="text-xs text-gray-500">Starting at</div>
            <div class="flex items-baseline gap-1">
              <span data-room-price class="text-2xl font-bold text-slate-900 tabular-nums">${escapeHtml(formatRoomPrice(room.price, false))}</span>
              <span class="text-gray-500 text-sm">/month</span>
            </div>
          </div>
          <a href="${detailUrl}"
            class="bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 inline-block text-center">
            View Details
          </a>
        </div>
      </div>
    </div>
  `;
}

let activeLanding3DUnitId = 'Room 201';
let landingHero3DViewer = null;

function renderLandingHero3DUnitInfo(unitOverride = null) {
  const unit =
    unitOverride ||
    BUILDING_UNITS.find((u) => u.id === activeLanding3DUnitId) ||
    BUILDING_UNITS[4] ||
    BUILDING_UNITS[0];
  if (!unit) return;
  activeLanding3DUnitId = unit.id;

  const occCount =
    Array.isArray(unit._occupants) && unit._occupants.length > 0
      ? unit._occupants.length
      : Number(unit.publicOccupiedCount) || 0;

  const isOccupied = occCount > 0;

  const statusBadge = document.getElementById('landing3DUnitStatusBadge');
  if (statusBadge) {
    if (!isOccupied) {
      statusBadge.textContent =
        unit.type === 'Commercial Space'
          ? '○ Vacant — Available for Lease'
          : '○ Truly Vacant — Available • 0/1 User';
      statusBadge.className =
        'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-300';
    } else {
      statusBadge.textContent =
        unit.type === 'Commercial Space'
          ? '● Occupied — Currently Leased'
          : '● Occupied by Tenant — 1/1 User';
      statusBadge.className =
        'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300';
    }
  }

  const titleEl = document.getElementById('landing3DUnitTitle');
  if (titleEl) titleEl.textContent = unit.id;

  const floorEl = document.getElementById('landing3DUnitFloor');
  if (floorEl) floorEl.textContent = `${unit.floorLabel} • ${unit.wing}`;

  const specsEl = document.getElementById('landing3DUnitSpecs');
  if (specsEl) {
    const capLabel = unit.type === 'Commercial Space' ? 'Commercial Utility' : '1 User';
    specsEl.textContent = `${unit.type} • ${unit.size} • ${capLabel}`;
  }

  const priceEl = document.getElementById('landing3DUnitPrice');
  if (priceEl) priceEl.textContent = `${formatPHP(unit.price)}/mo`;

  const linkEl = document.getElementById('landing3DUnitLink');
  if (linkEl) {
    if (isOccupied) {
      linkEl.removeAttribute('href');
      linkEl.setAttribute('aria-disabled', 'true');
      linkEl.className =
        'inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-xs font-semibold border border-gray-300 cursor-not-allowed select-none';
      linkEl.innerHTML = `
        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
        </svg>
        ${unit.type === 'Commercial Space' ? 'Currently Leased — Inquiries Closed' : 'Occupied by Tenant — Inquiries Closed'}
      `;
    } else {
      const listingId = unit.listingDocId || unit.listingId || 'triple-occupancy-room';
      linkEl.href = `property-detail.html?id=${encodeURIComponent(listingId)}`;
      linkEl.removeAttribute('aria-disabled');
      linkEl.className =
        'inline-flex items-center gap-1 mt-1 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer';
      linkEl.textContent = 'View Unit & Inquire';
    }
  }

  const featsEl = document.getElementById('landing3DUnitFeatures');
  if (featsEl) {
    const feats = Array.isArray(unit.listingFeatures) ? unit.listingFeatures : unit.features || [];
    featsEl.innerHTML = feats
      .map(
        (f) =>
          `<span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(f)}</span>`
      )
      .join('');
  }
}

function initLandingHero3D() {
  const viewport = document.getElementById('landingHero3DViewport');
  if (!viewport) return;

  let fireEnabled = true;
  landingHero3DViewer = initBuilding3DViewer(viewport, {
    mode: 'public',
    onSelectUnit: (unit) => {
      renderLandingHero3DUnitInfo(unit);
    }
  });

  renderLandingHero3DUnitInfo();

  // Also fetch privacy-safe room occupancy via RPC or tenants snapshot if available
  supabase
    .rpc('get_public_room_occupancy')
    .then(({ data, error }) => {
      if (!error && Array.isArray(data) && landingHero3DViewer) {
        landingHero3DViewer.setTenants(data);
        renderLandingHero3DUnitInfo();
      }
    })
    .catch(() => {});

  const floorSelect = document.getElementById('landing3DFloorSelect');
  floorSelect?.addEventListener('change', () => {
    const floor = floorSelect.value || 'all';
    if (landingHero3DViewer) landingHero3DViewer.setFloorFilter(floor);
  });

  const fireBtn = document.getElementById('landing3DFireBtn');
  fireBtn?.addEventListener('click', () => {
    fireEnabled = !fireEnabled;
    if (landingHero3DViewer) landingHero3DViewer.setFireSafetyMode(fireEnabled);
    fireBtn.textContent = fireEnabled ? 'Fire Safety: ON' : 'Fire Safety: OFF';
    fireBtn.className = fireEnabled
      ? 'px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 text-white border border-red-500 hover:bg-red-700 transition-colors cursor-pointer'
      : 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-colors cursor-pointer';
  });
}

function initLandingRooms() {
  const grid = document.querySelector('[data-rooms-grid]');
  if (!grid) return;

  const roomsRef = supabaseData.collection(supabase, 'rooms');
  supabaseData.onSnapshot(
    roomsRef,
    (snapshot) => {
      const rooms = [];
      snapshot.forEach((doc) => {
        const raw = doc.data() || {};
        rooms.push(
          mergeRoomData(doc.id, {
            id: doc.id,
            ...raw,
            unitOccupancy: raw.unitOccupancy || null
          })
        );
      });
      const activeRooms = rooms.length > 0 ? rooms : DEFAULT_ROOMS;
      syncBuildingUnitsWithRooms(activeRooms);
      if (landingHero3DViewer) {
        landingHero3DViewer.refreshStates();
      }
      renderLandingHero3DUnitInfo();

      const countBadge = document.getElementById('landingUnitsCountBadge');
      grid.innerHTML = activeRooms.map(renderLandingRoomCard).join('');
      if (countBadge) {
        countBadge.textContent = `${activeRooms.length} ${activeRooms.length === 1 ? 'Unit' : 'Units'} Available`;
        countBadge.classList.remove('hidden');
      }
    },
    (error) => console.error('Failed to sync landing room cards:', error)
  );
}

/** Smooth-scroll for in-page anchors. */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('#') || href.length < 2) return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/**
 * The admin dashboard's Reservations and Inquiries tabs.
 * Only runs when both containers are present.
 */
function initAdminRealtime() {
  if (!byId('reservationRequestsContainer') || !byId('messagesContainer')) return null;

  // Imported lazily so the admin-only code is not pulled into public pages.
  return Promise.all([
    import('./render/reservations.js').then((m) =>
      m.watchPendingReservations((count) => {
        const el = byId('pendingRequestsCount');
        if (el) el.textContent = count;
        const tabBadge = byId('reservationsTabBadge');
        if (tabBadge) tabBadge.textContent = count;
      })
    ),
    import('./render/messages.js').then((m) =>
      m.watchMessages((unread) => {
        const total = typeof unread === 'object' ? unread.total : unread;
        const tenant = typeof unread === 'object' ? unread.tenantUnread : 0;
        const inquiry = typeof unread === 'object' ? unread.inquiryUnread : total;
        const elTotal = byId('unreadMessagesCount');
        if (elTotal) elTotal.textContent = total;
        const elTenant = byId('unreadTenantMessagesStatCount');
        if (elTenant) elTenant.textContent = tenant;
        const elInquiry = byId('unreadInquiriesStatCount');
        if (elInquiry) elInquiry.textContent = inquiry;
      })
    )
  ]);
}

/**
 * Delegates the reservation / message row actions.
 *
 * The approve / decline / reply / delete buttons are rendered by
 * renderReservationRequests() and renderMessages() as data-* attributes.
 */
async function initAdminActions() {
  if (!byId('reservationRequestsContainer') && !byId('messagesContainer')) return;

  const reservations = await import('./render/reservations.js');
  const messages = await import('./render/messages.js');
  const tenantModal = await import('./pages/admin-dashboard/create-tenant.js');

  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!trigger) return;

    const { action, id, src, title } = trigger.dataset;

    switch (action) {
      case 'view-id':
        if (src) reservations.openImageModal(src, title);
        break;
      case 'approve':
        reservations.approveReservation(id);
        break;
      case 'decline':
        reservations.declineReservation(id);
        break;
      case 'delete-reservation':
        reservations.deleteReservation(id);
        break;
      case 'reply':
        messages.replyToMessage(id);
        break;
      case 'delete-message':
        messages.deleteMessage(id);
        break;
      case 'gcompose': {
        const { email, name, subject, message, room } = trigger.dataset;
        messages.openGCompose({ email, name, subject, message, id, room });
        break;
      }
      case 'select-chat':
        messages.selectTenantChat(trigger.dataset.email);
        break;
      case 'create-tenant': {
        // The payload is a JSON string in a data-* attribute, so no tenant
        // value is ever interpolated into a JS string literal.
        try {
          tenantModal.openCreateTenantModalFromData(JSON.parse(trigger.dataset.payload || '{}'));
        } catch (error) {
          console.error('Failed to parse tenant prefill payload:', error);
        }
        break;
      }
      default:
        break;
    }
  });

  document.addEventListener('submit', (event) => {
    const form =
      event.target instanceof Element ? event.target.closest('form#adminChatForm') : null;
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector('input[name="message"]');
    const text = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    messages.sendAdminChatMessage(form.dataset.email, form.dataset.name, text);
  });
}

/**
 * Supabase connection status line on the admin dashboard.
 */
async function initStatusLine() {
  const el = byId('supabaseStatus');
  if (!el) return;

  el.textContent = 'Connecting to Supabase...';
  try {
    const { error } = await supabase
      .from('app_documents')
      .select('id')
      .eq('collection', 'rooms')
      .limit(1);
    if (error) throw error;
    el.textContent = 'Connected to Supabase.';
    el.className = 'text-sm text-emerald-600 mb-4';
  } catch (error) {
    console.error('Supabase health check failed:', error);
    el.textContent = 'Supabase is unavailable. Check the project configuration.';
    el.className = 'text-sm text-red-600 mb-4';
  }
}

let mainPageInitialized = false;
function initMainPage() {
  if (mainPageInitialized) return;
  mainPageInitialized = true;
  enforceStaffLockOnPublicPages();
  initSmoothScroll();
  initTabs();
  initPublicForms();
  initLandingRooms();
  initLandingHero3D();

  // admin-dashboard.html only.
  if (byId('reservationRequestsContainer') || byId('messagesContainer')) {
    initStatusLine();
    initAdminRealtime();
    initAdminActions();
  }
}

if (document.readyState !== 'loading') {
  initMainPage();
}
document.addEventListener('DOMContentLoaded', () => {
  if (!mainPageInitialized) {
    initMainPage();
  }
});

// Availability helpers remain available for the browser console.
window.setRoomAvailability = setRoomAvailability;
window.decrementRoomAvailability = decrementRoomAvailability;

// Password Recovery Handler on landing page
const updatePassModal = document.getElementById('updatePasswordModal');
const updatePassForm = document.getElementById('updatePasswordForm');
const newPassInput = document.getElementById('newPassword');
const confirmPassInput = document.getElementById('confirmNewPassword');
const submitUpdateBtn = document.getElementById('submitUpdatePassBtn');
const updatePassAlert = document.getElementById('updatePassAlert');

if (typeof window !== 'undefined') {
  // Check hash on landing
  if (
    window.location.hash &&
    (window.location.hash.includes('type=recovery') ||
      window.location.hash.includes('access_token'))
  ) {
    if (updatePassModal) updatePassModal.classList.remove('hidden');
  }

  // Supabase Auth listener
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      if (updatePassModal) updatePassModal.classList.remove('hidden');
    }
  });

  updatePassForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = newPassInput?.value || '';
    const confirmPass = confirmPassInput?.value || '';

    if (newPass.length < 6) {
      if (updatePassAlert) {
        updatePassAlert.className =
          'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
        updatePassAlert.textContent = 'Password must be at least 6 characters.';
        updatePassAlert.classList.remove('hidden');
      }
      return;
    }

    if (newPass !== confirmPass) {
      if (updatePassAlert) {
        updatePassAlert.className =
          'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
        updatePassAlert.textContent = 'Passwords do not match.';
        updatePassAlert.classList.remove('hidden');
      }
      return;
    }

    if (submitUpdateBtn) {
      submitUpdateBtn.disabled = true;
      submitUpdateBtn.textContent = 'Updating...';
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;

      if (updatePassModal) updatePassModal.classList.add('hidden');
      try {
        history.replaceState(null, '', window.location.pathname);
      } catch {}

      alert('Password updated successfully! Redirecting to login...');
      window.location.href = './login.html';
    } catch (err) {
      console.error('Update password error on landing:', err);
      if (updatePassAlert) {
        updatePassAlert.className =
          'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
        updatePassAlert.textContent =
          err.message || 'Failed to update password. Link may be expired.';
        updatePassAlert.classList.remove('hidden');
      }
    } finally {
      if (submitUpdateBtn) {
        submitUpdateBtn.disabled = false;
        submitUpdateBtn.textContent = 'Update Password & Sign In';
      }
    }
  });
}
