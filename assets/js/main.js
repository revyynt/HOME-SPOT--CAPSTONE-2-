
async function enforceStaffLockOnPublicPages() {
  const path = window.location.pathname.toLowerCase();
  if (
    path.includes('admin-dashboard') ||
    path.includes('super-admin-dashboard') ||
    path.includes('tenant-portal') ||
    path.includes('login') ||
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
import { escapeHtml } from './lib/format.js';

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
      class="bg-gradient-to-br from-blue-50/40 via-white to-green-50/40 rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 group transform hover:-translate-y-2 border-2 border-transparent hover:border-blue-200 flex flex-col justify-between">
      <div>
        <div class="relative overflow-hidden">
          <a href="${detailUrl}">
            <img data-room-image src="${escapeHtml(room.image)}" alt="${escapeHtml(room.name)}"
              class="w-full h-64 object-cover group-hover:scale-110 transition-transform duration-500" />
          </a>
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-blue-900/20 to-transparent pointer-events-none"></div>
          ${badgeHtml}
          <div class="absolute top-3 right-3" data-availability-room="${escapeHtml(room.name)}" data-default-available="${escapeHtml(room.available)}">
            <span class="pulse-badge ${availClass} text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5">
              <span class="w-2 h-2 bg-white rounded-full ${room.available > 0 ? 'animate-ping' : ''} absolute"></span>
              <span class="w-2 h-2 bg-white rounded-full relative"></span>
              ${escapeHtml(availText)}
            </span>
          </div>
          <div class="absolute bottom-4 left-4 right-4 pointer-events-none">
            <h4 data-room-name class="text-2xl font-bold text-white mb-1 drop-shadow-lg">${escapeHtml(room.name)}</h4>
            <p data-room-type class="text-sm text-green-200 font-medium">${escapeHtml(room.type)}</p>
          </div>
        </div>
        <div class="p-5">
          <div data-room-features class="flex flex-wrap gap-2 mb-4">
            ${renderFeaturePills(room.features || [])}
          </div>
        </div>
      </div>
      <div class="px-5 pb-5">
        <div class="flex items-end justify-between bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-3 border border-blue-100">
          <div>
            <div class="text-xs text-gray-500">Starting at</div>
            <div class="flex items-baseline gap-1">
              <span data-room-price class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">${escapeHtml(formatRoomPrice(room.price, false))}</span>
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

function initLandingRooms() {
  const grid = document.querySelector('[data-rooms-grid]');
  if (!grid) return;

  const roomsRef = supabaseData.collection(supabase, 'rooms');
  supabaseData.onSnapshot(
    roomsRef,
    (snapshot) => {
      const rooms = [];
      snapshot.forEach((doc) => {
        rooms.push(mergeRoomData(doc.id, { id: doc.id, ...doc.data() }));
      });
      if (rooms.length > 0) {
        grid.innerHTML = rooms.map(renderLandingRoomCard).join('');
      } else {
        grid.innerHTML = DEFAULT_ROOMS.map(renderLandingRoomCard).join('');
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
      if (href === '#' || !href || href.length < 2) return;
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
      })
    ),
    import('./render/messages.js').then((m) =>
      m.watchMessages((unread) => {
        const el = byId('unreadMessagesCount');
        if (el) el.textContent = unread;
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
    const trigger =
      event.target instanceof Element ? event.target.closest('[data-action]') : null;
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
      case 'reply':
        messages.replyToMessage(id);
        break;
      case 'delete-message':
        messages.deleteMessage(id);
        break;
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

document.addEventListener('DOMContentLoaded', () => {
  enforceStaffLockOnPublicPages();
  initSmoothScroll();
  initTabs();
  initPublicForms();
  initLandingRooms();

  // admin-dashboard.html only.
  if (byId('reservationRequestsContainer') || byId('messagesContainer')) {
    initStatusLine();
    initAdminRealtime();
    initAdminActions();
  }
});

// Availability helpers remain available for the browser console.
window.setRoomAvailability = setRoomAvailability;
window.decrementRoomAvailability = decrementRoomAvailability;
