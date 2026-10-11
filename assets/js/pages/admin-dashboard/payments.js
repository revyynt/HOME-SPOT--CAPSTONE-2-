/**
 * Admin view of the payment ledger.
 *
 * Staff need this to reconcile anything the portal cannot see for itself: if a
 * PayMongo webhook is lost, the tenant's balance stays at its last confirmed
 * value and only a human can correct it.
 *
 * Both tables are live (onSnapshot), so a payment that lands while the tab is
 * open appears without a refresh.
 */

import { db, firebaseFirestore } from '../../firebase-service.js';
import { escapeHtml, formatPHP, initials, avatarGradient } from '../../lib/format.js';
import { settledTotal } from '../../../../lib/ledger.js';

/** @type {Array<Object>} tenant profiles, mirrored from tenants.js */
let tenants = [];

const STATUS_CLASSES = {
  Paid: 'bg-emerald-100 text-emerald-800',
  Pending: 'bg-amber-100 text-amber-800',
  Failed: 'bg-red-100 text-red-800'
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function statusBadge(status) {
  const key = String(status || 'Pending');
  return `<span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_CLASSES[key] ?? STATUS_CLASSES.Pending}">${escapeHtml(key)}</span>`;
}

function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="px-6 py-12 text-center text-gray-500">${escapeHtml(message)}</td></tr>`;
}

/**
 * Renders per-tenant balances from `tenants.amountDue`.
 * @param {Array<Object>} tenantList
 */
export function renderBalances(tenantList) {
  tenants = Array.isArray(tenantList) ? tenantList : [];
  const body = document.getElementById('paymentsBalancesBody');
  if (!body) return;

  if (!tenants.length) {
    body.innerHTML = emptyRow(5, 'No tenants yet.');
    return;
  }

  body.innerHTML = tenants
    .map((t) => {
      const rent = Number(t.monthlyRent) || 0;
      // Fall back to the full rent when the webhook has not written a balance
      // yet -- never to a local cache the browser could have edited.
      const due =
        t.amountDue === null || t.amountDue === undefined ? rent : Number(t.amountDue) || 0;
      const gradient = avatarGradient(t.name);

      return `
        <tr class="hover:bg-gray-50/70 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-tr ${gradient} text-white flex items-center justify-center font-semibold text-xs">${escapeHtml(initials(t.name))}</div>
              <div>
                <div class="text-sm font-medium text-gray-900">${escapeHtml(t.name || 'Tenant')}</div>
                <div class="text-xs text-gray-500">${escapeHtml(t.email || '')}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${escapeHtml(t.room || '—')}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">${escapeHtml(formatPHP(rent))}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${due > 0 ? 'text-red-600' : 'text-emerald-600'}">${escapeHtml(formatPHP(due))}</td>
          <td class="px-6 py-4 whitespace-nowrap">${statusBadge(due > 0 ? 'Pending' : 'Paid')}</td>
        </tr>`;
    })
    .join('');

  updateStats();
}

/**
 * Renders the webhook's raw payment events, newest first.
 * @param {Array<Object>} payments
 */
export function renderLedger(payments) {
  const body = document.getElementById('paymentsLedgerBody');
  if (!body) return;

  const rows = Array.isArray(payments) ? payments : [];

  if (!rows.length) {
    body.innerHTML = emptyRow(5, 'No payments recorded yet.');
    updateStats();
    return;
  }

  const sorted = [...rows].sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));

  body.innerHTML = sorted
    .map((p) => {
      const when = toMillis(p.timestamp);
      const date = when
        ? new Date(when).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : '—';

      return `
        <tr class="hover:bg-gray-50/70 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${escapeHtml(date)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">${escapeHtml(p.referenceNumber || '—')}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            ${escapeHtml(p.tenantName || p.tenantEmail || 'Unknown')}
            ${p.tenantEmail ? `<div class="text-xs text-gray-500">${escapeHtml(p.tenantEmail)}</div>` : ''}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">${escapeHtml(formatPHP(Number(p.amount) || 0))}</td>
          <td class="px-6 py-4 whitespace-nowrap">${statusBadge(p.status)}</td>
        </tr>`;
    })
    .join('');

  updateStats(rows);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function updateStats(payments) {
  const expected = tenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);
  const outstanding = tenants.reduce((sum, t) => {
    const rent = Number(t.monthlyRent) || 0;
    const due = t.amountDue === null || t.amountDue === undefined ? rent : Number(t.amountDue) || 0;
    return sum + due;
  }, 0);

  setText('paymentsStatExpected', formatPHP(expected));
  setText('paymentsStatOutstanding', formatPHP(outstanding));

  // Confirmed total is only meaningful once a snapshot has arrived; until then
  // show the confirmed figure from whatever ledger we last rendered.
  const ledger = payments || [];
  setText('paymentsStatConfirmed', formatPHP(settledTotal(ledger)));
}

/**
 * Subscribes to the `payments` collection written by the webhook.
 * Staff read access is granted by firestore.rules.
 * @returns {(() => void)|null}
 */
export function listenToPayments() {
  if (!window.firebaseDb || !window.firebaseFirestore) return null;

  const { collection, query, orderBy, onSnapshot } = window.firebaseFirestore;

  try {
    return onSnapshot(
      query(collection(window.firebaseDb, 'payments'), orderBy('timestamp', 'desc')),
      (snapshot) => {
        renderLedger(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        console.warn('Payments ledger unavailable:', error?.code || error?.message);
        const body = document.getElementById('paymentsLedgerBody');
        if (body) {
          body.innerHTML = emptyRow(5, 'Payment ledger unavailable (missing index?).');
        }
      }
    );
  } catch (error) {
    console.warn('Could not subscribe to payments:', error?.message);
    return null;
  }
}

/** Exposed for the tenant module, which owns the tenant snapshot. */
export { db, firebaseFirestore };
