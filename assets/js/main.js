/**
 * Shared entry point for the public and admin pages.
 *
 * Previously a 800-line classic script that ran six initialisers on all five
 * pages that loaded it -- so the admin dashboard attached Firestore listeners
 * on index.html and admin-login.html, where the target containers do not exist.
 *
 * It is now an ES module that imports what it needs and initialises only what
 * the current page actually contains. Per-page behaviour lives in ./pages/.
 */

import { initTabs } from './render/tabs.js';
import { initPublicForms } from './pages/public-forms.js';
import { initRoomAvailabilityBadges } from './pages/index-page.js';
import { setRoomAvailability, decrementRoomAvailability } from './room-availability.js';

const byId = (id) => document.getElementById(id);

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
    const button =
      event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;

    const { action, id } = button.dataset;

    switch (action) {
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
      case 'create-tenant': {
        // The payload is a JSON string in a data-* attribute, so no tenant
        // value is ever interpolated into a JS string literal.
        try {
          tenantModal.openCreateTenantModalFromData(JSON.parse(button.dataset.payload || '{}'));
        } catch (error) {
          console.error('Failed to parse tenant prefill payload:', error);
        }
        break;
      }
      default:
        break;
    }
  });
}

/**
 * Firestore connection status line on the admin dashboard.
 */
function initStatusLine() {
  const el = byId('firestoreStatus');
  if (el) el.textContent = 'Connected to Firestore.';
}

document.addEventListener('DOMContentLoaded', () => {
  initSmoothScroll();
  initTabs();
  initPublicForms();

  // index.html only.
  if (byId('tripleAvailabilityBadge') || byId('commercialAvailabilityBadge')) {
    initRoomAvailabilityBadges();
  }

  // admin-dashboard.html only.
  if (byId('reservationRequestsContainer') || byId('messagesContainer')) {
    initStatusLine();
    initAdminRealtime();
    initAdminActions();
  }
});

// Availability helpers are intentionally exposed: the set-room CLI and manual
// console use rely on them, and they were previously global from two different
// files. TODO(maintainability): route the console path through the CLI instead
// and drop these once no page loads two scripts defining the same global.
window.setRoomAvailability = setRoomAvailability;
window.decrementRoomAvailability = decrementRoomAvailability;
