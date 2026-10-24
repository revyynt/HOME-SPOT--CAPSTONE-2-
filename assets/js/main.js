
async function enforceStaffLockOnPublicPages() {
  if (byId('reservationRequestsContainer') || byId('superAdminContainer') || byId('tenantPortalContainer')) {
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

function applyRoomToCard(card, room) {
  const img = card.querySelector('[data-room-image]');
  if (img && room.image) {
    if (img.getAttribute('src') !== room.image) img.setAttribute('src', room.image);
    img.setAttribute('alt', room.name);
  }
  const badge = card.querySelector('[data-room-badge]');
  if (badge) {
    badge.textContent = room.badge || '';
    badge.parentElement?.classList.toggle('hidden', !room.badge);
  }
  const nameEl = card.querySelector('[data-room-name]');
  if (nameEl) nameEl.textContent = room.name;
  const typeEl = card.querySelector('[data-room-type]');
  if (typeEl) typeEl.textContent = room.type;
  const priceEl = card.querySelector('[data-room-price]');
  if (priceEl) priceEl.textContent = formatRoomPrice(room.price, false);
  const featuresEl = card.querySelector('[data-room-features]');
  if (featuresEl && Array.isArray(room.features)) {
    featuresEl.innerHTML = renderFeaturePills(room.features);
  }
}

function initLandingRooms() {
  const grid = document.querySelector('[data-rooms-grid]');
  if (!grid) return;

  for (const base of DEFAULT_ROOMS) {
    const card = grid.querySelector(`[data-room-card="${base.id}"]`);
    if (card) applyRoomToCard(card, base);
  }

  const roomsRef = supabaseData.collection(supabase, 'rooms');
  supabaseData.onSnapshot(
    roomsRef,
    (snapshot) => {
      snapshot.forEach((doc) => {
        const room = mergeRoomData(doc.id, { id: doc.id, ...doc.data() });
        const card = grid.querySelector(`[data-room-card="${doc.id}"]`);
        if (card) applyRoomToCard(card, room);
      });
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
