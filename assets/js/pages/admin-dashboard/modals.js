/**
 * Payment and due-date detail modals.
 *
 * These were in a classic inline script and read `window.onclick` for the
 * backdrop handler, which clobbered any other global click handler on the
 * page. Backdrops are now bound per-overlay with addEventListener.
 */

import { initials } from '../../lib/format.js';
import { closeCreateTenantModal } from './create-tenant.js';
import { closeViewTenantModal } from './tenants.js';

const STATUS_CLASSES = {
  Paid: 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800',
  Pending:
    'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800',
  Overdue:
    'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800'
};

/**
 * @param {Object} tenant
 */
export function openPaymentModal(tenant) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('modalAvatar', initials(tenant.name, 3));
  set('modalTenantName', tenant.name);
  set('modalRoom', tenant.room);
  set('modalAmount', `₱${Number(tenant.amount || 0).toLocaleString()}.00`);
  set('modalDueDate', tenant.dueDate ?? '—');

  const badge = document.getElementById('modalStatus');
  if (badge) {
    // statusClass comes from a fixed lookup table, never from user input.
    badge.className = STATUS_CLASSES[tenant.status] ?? '';
    badge.textContent = tenant.status ?? 'Unknown';
  }

  document.getElementById('paymentModal')?.classList.remove('hidden');
}

export function closePaymentModal() {
  document.getElementById('paymentModal')?.classList.add('hidden');
}

/**
 * @param {Object} tenant
 */
export function openDueDateModal(tenant) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('dueDateModalAvatar', initials(tenant.name, 3));
  set('dueDateModalTenantName', tenant.name);
  set('dueDateModalRoom', tenant.room);
  set('dueDateModalDate', tenant.dueDate ?? '—');

  document.getElementById('dueDateModal')?.classList.remove('hidden');
}

export function closeDueDateModal() {
  document.getElementById('dueDateModal')?.classList.add('hidden');
}

/**
 * Binds the modal triggers, close buttons, and backdrop dismissals.
 */
export function initDetailModals() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const closeButton = target.closest('[data-action^="close-"]');
    if (closeButton) {
      switch (closeButton.dataset.action) {
        case 'close-payment-modal':
          closePaymentModal();
          return;
        case 'close-due-date-modal':
          closeDueDateModal();
          return;
        case 'close-create-tenant-modal':
          closeCreateTenantModal();
          return;
        case 'close-view-tenant-modal':
          closeViewTenantModal();
          return;
        default:
          break;
      }
    }

    const trigger = target.closest('[data-open-modal]');
    if (!trigger) return;

    // The Tenant Payments tab currently renders static rows. Until it is
    // Firestore-backed, the handler no-ops rather than showing invented data.
    const raw = trigger.dataset.tenant;
    if (!raw) return;

    let tenant;
    try {
      // The attribute holds URL-encoded JSON, which keeps quotes and braces
      // from breaking out of the HTML attribute.
      tenant = JSON.parse(decodeURIComponent(raw));
    } catch (error) {
      console.error('Invalid tenant payload on modal trigger:', error);
      return;
    }

    if (trigger.dataset.openModal === 'payment') openPaymentModal(tenant);
    else if (trigger.dataset.openModal === 'dueDate') openDueDateModal(tenant);
  });

  // Backdrops: bind to the overlay itself so only a direct hit closes it.
  const backdrops = [
    ['paymentModal', closePaymentModal],
    ['dueDateModal', closeDueDateModal]
  ];

  for (const [id, close] of backdrops) {
    const overlay = document.getElementById(id);
    overlay?.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
  }
}
