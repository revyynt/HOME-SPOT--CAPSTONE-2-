/**
 * Payment and due-date detail modals.
 *
 * Populates live tenant contact info, payment history, and due-date settings
 * from Supabase, and dispatches reminders via Portal Chat and Gmail Compose.
 */

import { deduplicatePayments, escapeHtml, formatPHP, initials } from '../../lib/format.js';
import { parsePaymentDate } from '../../lib/payment-calendar.js';
import { db, supabaseData } from '../../supabase-service.js';
import { Toast } from '../../render/toast.js';
import { closeCreateTenantModal } from './create-tenant.js';
import { closeViewTenantModal, getTenants } from './tenants.js';

const STATUS_CLASSES = {
  Paid: 'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800',
  Pending:
    'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800',
  Scheduled:
    'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800',
  Overdue:
    'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800'
};

let activeModalTenant = null;

function resolveFullTenant(partial = {}) {
  const list = getTenants() || [];
  const pEmail = String(partial.email || '')
    .trim()
    .toLowerCase();
  const pName = String(partial.name || '')
    .trim()
    .toLowerCase();
  const found = list.find(
    (t) =>
      (partial.id && t.id === partial.id) ||
      (pEmail &&
        String(t.email || '')
          .trim()
          .toLowerCase() === pEmail) ||
      (pName &&
        String(t.name || '')
          .trim()
          .toLowerCase() === pName)
  );
  return {
    ...(found || {}),
    ...partial,
    id: found?.id || partial.id || null,
    name: partial.name || found?.name || 'Tenant',
    email: partial.email || found?.email || '',
    phone: partial.phone || found?.phone || '',
    room: partial.room || found?.room || 'Unassigned',
    amount: Number(partial.amount ?? found?.monthlyRent ?? 0),
    dueDay: Number(partial.dueDay ?? found?.dueDay ?? 5),
    dueDate: partial.dueDate || '—',
    status: partial.status || 'Pending'
  };
}

function buildReminderText(tenant) {
  const amt = formatPHP(tenant.amount || 0);
  return `Hi ${tenant.name}, friendly reminder from MJP Residences: your rent payment of ${amt} for ${tenant.room} is due on ${tenant.dueDate}. You can pay anytime via your HomeSpot Tenant Portal. Thank you!`;
}

function openGmailCompose(tenant) {
  const to = encodeURIComponent(tenant.email || '');
  const subject = encodeURIComponent(
    `Payment Reminder: ${formatPHP(tenant.amount || 0)} Due on ${tenant.dueDate} - MJP Residences`
  );
  const body = encodeURIComponent(buildReminderText(tenant));
  window.open(
    `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`,
    '_blank',
    'noopener,noreferrer'
  );
}

/**
 * @param {Object} rawTenant
 */
export async function openPaymentModal(rawTenant) {
  const tenant = resolveFullTenant(rawTenant);
  activeModalTenant = tenant;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('modalAvatar', initials(tenant.name, 3));
  set('modalTenantName', tenant.name);
  set('modalRoom', tenant.room);
  set('modalAmount', `₱${Number(tenant.amount || 0).toLocaleString()}.00`);
  set('modalDueDate', tenant.dueDate ?? '—');
  set('modalTenantEmail', `Email: ${tenant.email || 'Not provided'}`);
  set('modalTenantPhone', `Phone: ${tenant.phone || 'Not provided'}`);
  set('modalPaymentMethod', 'PayMongo Checkout');

  const statusBox = document.getElementById('modalReminderStatus');
  if (statusBox) {
    statusBox.classList.add('hidden');
    statusBox.textContent = '';
  }

  const badge = document.getElementById('modalStatus');
  if (badge) {
    badge.className = STATUS_CLASSES[tenant.status] ?? '';
    badge.textContent = tenant.status ?? 'Unknown';
  }

  const historyList = document.getElementById('modalPaymentHistoryList');
  if (historyList) {
    historyList.innerHTML = '<div class="text-xs text-gray-400">Loading payment history...</div>';
  }

  document.getElementById('paymentModal')?.classList.remove('hidden');

  try {
    const snap = await supabaseData.getDocs(supabaseData.collection(db, 'payments'));
    const allPayments = deduplicatePayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    const tEmail = String(tenant.email || '').toLowerCase();
    const tName = String(tenant.name || '').toLowerCase();
    const matching = allPayments
      .filter((p) => {
        const pe = String(p.tenantEmail || '').toLowerCase();
        const pn = String(p.tenantName || '').toLowerCase();
        return (tEmail && pe === tEmail) || (tName && pn === tName);
      })
      .sort((a, b) => {
        const da = parsePaymentDate(a)?.getTime() || 0;
        const dbTime = parsePaymentDate(b)?.getTime() || 0;
        return dbTime - da;
      });

    if (matching[0]?.method || matching[0]?.paymentMethod) {
      set('modalPaymentMethod', matching[0].method || matching[0].paymentMethod);
    }

    if (historyList) {
      if (!matching.length) {
        historyList.innerHTML =
          '<div class="text-xs text-gray-400 italic">No recorded payments for this tenant yet.</div>';
      } else {
        historyList.innerHTML = matching
          .slice(0, 5)
          .map((p) => {
            const dt = parsePaymentDate(p);
            const dateStr = dt
              ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : p.dateFormatted || 'Recorded';
            const isPaid = String(p.status || '').toLowerCase() === 'paid';
            return `
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">${escapeHtml(p.purpose || 'Monthly Rent')} (${escapeHtml(dateStr)})</span>
                <span class="${isPaid ? 'text-green-600' : 'text-red-600'} font-medium">
                  ${isPaid ? '✓ Paid' : escapeHtml(p.status || 'Pending')} • ${escapeHtml(formatPHP(Number(p.amount) || 0))}
                </span>
              </div>`;
          })
          .join('');
      }
    }
  } catch (err) {
    console.warn('Could not load modal payment history:', err);
  }
}

export function closePaymentModal() {
  document.getElementById('paymentModal')?.classList.add('hidden');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function computeNextDueDateLabel(dueDay) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  const clamped = Math.min(Math.max(1, Number(dueDay) || 5), maxDay);
  return new Date(next.getFullYear(), next.getMonth(), clamped).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * @param {Object} rawTenant
 */
export function openDueDateModal(rawTenant) {
  const tenant = resolveFullTenant(rawTenant);
  activeModalTenant = tenant;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const dueDay = Number(tenant.dueDay) || 5;
  set('dueDateModalAvatar', initials(tenant.name, 3));
  set('dueDateModalTenantName', tenant.name);
  set('dueDateModalRoom', tenant.room);
  set('dueDateModalDate', tenant.dueDate ?? '—');
  set('dueDateModalRent', `₱${Number(tenant.amount || 0).toLocaleString()}.00`);
  set('dueDateModalCycle', `Monthly (${ordinal(dueDay)} of each month)`);
  set('dueDateModalNextDate', computeNextDueDateLabel(dueDay));

  const dayInput = document.getElementById('dueDateModalDayInput');
  if (dayInput) dayInput.value = String(dueDay);

  document.getElementById('dueDateModal')?.classList.remove('hidden');
}

export function closeDueDateModal() {
  document.getElementById('dueDateModal')?.classList.add('hidden');
}

async function handleSendReminder() {
  if (!activeModalTenant) return;
  const tenant = resolveFullTenant(activeModalTenant);
  const btn = document.getElementById('sendPaymentReminderBtn');
  const statusBox = document.getElementById('modalReminderStatus');
  const originalText = btn?.textContent || 'Send Reminder';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending Reminder...';
  }

  const reminderMessage = buildReminderText(tenant);

  try {
    if (!tenant.email) {
      Toast.error('This tenant does not have an email address on file.');
      return;
    }

    await supabaseData.addDoc(supabaseData.collection(db, 'messages'), {
      name: tenant.name,
      email: tenant.email,
      room: tenant.room,
      message: reminderMessage,
      sender: 'admin',
      status: 'Unread',
      reply: null,
      createdAt: supabaseData.serverTimestamp()
    });

    if (statusBox) {
      statusBox.classList.remove('hidden');
      statusBox.textContent = `✓ Reminder sent to ${tenant.name} in Tenant Messages.`;
    }
    Toast.success(`Payment reminder sent to ${tenant.name} in Tenant Messages`);
  } catch (err) {
    console.error('Failed to send reminder:', err);
    Toast.error(`Could not send reminder: ${err.message || 'Unknown error'}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function handleSaveDueDate() {
  if (!activeModalTenant) return;
  const tenant = resolveFullTenant(activeModalTenant);
  const dayInput = document.getElementById('dueDateModalDayInput');
  const newDueDay = Math.max(1, Math.min(31, parseInt(dayInput?.value, 10) || 5));

  if (!tenant.id) {
    Toast.error('Cannot update due date: tenant record was not found in Supabase.');
    return;
  }

  const btn = document.getElementById('saveDueDateBtn');
  const originalText = btn?.textContent || 'Update Due Date';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    await supabaseData.updateDoc(supabaseData.doc(db, 'tenants', tenant.id), {
      dueDay: newDueDay,
      updatedAt: supabaseData.serverTimestamp()
    });
    activeModalTenant.dueDay = newDueDay;
    openDueDateModal(activeModalTenant);
    Toast.success(`Updated ${tenant.name}'s monthly due day to the ${ordinal(newDueDay)}!`);
  } catch (err) {
    console.error('Failed to update due date:', err);
    Toast.error(`Failed to update due date: ${err.message || 'Unknown error'}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

/**
 * Binds the modal triggers, action buttons, close buttons, and backdrop dismissals.
 */
export function initDetailModals() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const actionButton = target.closest('[data-action]');
    if (actionButton) {
      switch (actionButton.dataset.action) {
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
        case 'send-payment-reminder':
          handleSendReminder();
          return;
        case 'send-reminder-gmail':
          if (activeModalTenant) openGmailCompose(resolveFullTenant(activeModalTenant));
          return;
        case 'save-due-date':
          handleSaveDueDate();
          return;
        default:
          break;
      }
    }

    const trigger = target.closest('[data-open-modal]');
    if (!trigger) return;

    const raw = trigger.dataset.tenant;
    if (!raw) return;

    let tenant;
    try {
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
