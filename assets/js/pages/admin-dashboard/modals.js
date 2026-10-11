/**
 * Create-tenant / view-tenant modal wiring.
 *
 * The payment and due-date detail modals that used to live here were removed:
 * they were opened by `data-open-modal` triggers on the Tenant Payments tab,
 * and those rows have been replaced by the live ledger in ./payments.js. There
 * is nothing left for them to display.
 */

import { closeCreateTenantModal } from './create-tenant.js';
import { closeViewTenantModal } from './tenants.js';

/**
 * Binds the modal close buttons and backdrop dismissals.
 */
export function initDetailModals() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const closeButton = target.closest('[data-action^="close-"]');
    if (!closeButton) return;

    switch (closeButton.dataset.action) {
      case 'close-create-tenant-modal':
        closeCreateTenantModal();
        break;
      case 'close-view-tenant-modal':
        closeViewTenantModal();
        break;
      default:
        break;
    }
  });

  for (const id of ['createTenantModal', 'viewTenantModal']) {
    const overlay = document.getElementById(id);
    overlay?.addEventListener('click', (event) => {
      // Backdrops: only a direct hit on the overlay closes it.
      if (event.target === overlay) {
        if (id === 'createTenantModal') closeCreateTenantModal();
        else closeViewTenantModal();
      }
    });
  }
}
