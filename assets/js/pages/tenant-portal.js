/**
 * Tenant portal.
 *
 * Lifted out of a ~1200-line inline classic script. Two things changed beyond
 * the move:
 *
 *   - The auth guard no longer reads a `let userEmail` declared in a classic
 *     script and reassigned from a module. That only worked by accident of
 *     execution order. Identity now comes from the verified Firebase user.
 *   - Row/tab/modal actions are delegated from data-* attributes, so module
 *     scope stays private instead of being published wholesale to window.
 *
 * Payment state is server-authoritative: a PayMongo redirect is treated as a
 * claim that must be corroborated by the webhook, never as proof of payment.
 */

import { guardPage } from '../lib/guard.js';
import { getCurrentUser } from '../firebase-service.js';
import { escapeHtml } from '../lib/format.js';
import {
  SCENARIO,
  resolveReturnScenario,
  interpretPaymentIntent,
  interpretCheckoutSession,
  buildReturnRecord,
  shouldExpireSession
} from '../lib/payment-return.js';
import { VERIFICATION, decideVerification, resolveAmountDue } from '../lib/payment-verification.js';
import { Toast } from '../render/toast.js';
import * as PayMongo from '../paymongo-service.js';

// Hide the portal until the session check resolves.
document.documentElement.dataset.authPending = 'true';

let userEmail = sessionStorage.getItem('tenantEmail') || '';
// No placeholder PII in the fallbacks: a receipt that invents a tenant name or
// phone is worse than one that shows the field is missing. These are replaced by
// the Firestore profile snapshot below; until it arrives the fields are blank.
let tenantName = sessionStorage.getItem('tenantName') || '';
let tenantPhone = sessionStorage.getItem('tenantPhone') || '';
let tenantRoom = sessionStorage.getItem('tenantRoom') || '';
let tenantDorm = sessionStorage.getItem('tenantDorm') || '';
let tenantMoveIn = sessionStorage.getItem('tenantMoveInDate') || '';
let tenantRent = parseFloat(sessionStorage.getItem('tenantMonthlyRent')) || 0;
let tenantEmergency = sessionStorage.getItem('tenantEmergencyContact') || '';
let tenantDueDay = parseInt(sessionStorage.getItem('tenantDueDay')) || 5;
let currentTenantDocId = sessionStorage.getItem('tenantDocId') || null;

/**
 * Reconciles the cached session email with the verified Firebase account.
 *
 * sessionStorage is not trusted for identity: the signed-in account is. When
 * they differ, the verified address wins and the UI is repainted so the page
 * never shows the previous session's tenant.
 *
 * @returns {boolean} whether the cached identity was replaced
 */
function syncSessionIdentity() {
  const user = getCurrentUser();
  if (!user || !user.email || user.email === userEmail) return false;

  userEmail = user.email;
  sessionStorage.setItem('tenantEmail', userEmail);
  return true;
}

// Runs only after the guard resolves, and after `userEmail` is initialised --
// this ordering was previously inverted, which left the displayed email able to
// lag the verified account.
guardPage({
  role: 'tenant',
  redirectTo: 'admin-login.html',
  grantedEvent: 'tenant-access-granted'
}).then((allowed) => {
  if (!allowed) return;
  if (syncSessionIdentity()) {
    populateTenantUI();
    watchServerPayments();
    loadTenantPaymentHistory();
  }
});

// Content stays hidden until the Firebase auth guard resolves.

// Global State

/** How long after checkout a webhook payment may still be treated as ours. */
const PAYMENT_MATCH_WINDOW_HOURS = 24;

// `payments` the webhook has written for this tenant (read-only mirror).
let serverPayments = [];

/**
 * Epoch millis for the checkout currently being returned from.
 *
 * Captured while the pending record is still in scope, because the return
 * handlers clear it before saving. Used to anchor the webhook match window so
 * an older payment of the same amount cannot confirm this attempt.
 */
let returnAttemptStartedAtMs = null;

/** `tenants.amountDue` as set by staff, when present. Takes priority. */
let tenantAmountDueFromServer = null;

// Start from the rent; refreshServerBalance() replaces this with the
// server-derived figure as soon as the payments listener resolves. The cached
// value is deliberately NOT trusted -- it is browser state a user can edit.
let currentRemainingDue = tenantRent;

function updateAmountDueUI() {
  const summaryAmountDue = document.getElementById('summaryAmountDue');
  if (summaryAmountDue) {
    if (currentRemainingDue <= 0) {
      summaryAmountDue.textContent = '₱0.00 (Settled)';
      summaryAmountDue.style.color = '#15803d';
    } else {
      summaryAmountDue.textContent =
        '₱' + currentRemainingDue.toLocaleString(undefined, { minimumFractionDigits: 2 });
      summaryAmountDue.style.color = '#059669';
    }
  }

  const summaryDueDate = document.getElementById('summaryDueDate');
  if (summaryDueDate) {
    const now = new Date();
    const dueDay = tenantDueDay || 5;
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ];
    let targetMonth = now.getMonth();
    let targetYear = now.getFullYear();
    if (currentRemainingDue <= 0) {
      targetMonth = (targetMonth + 1) % 12;
      if (targetMonth === 0) targetYear += 1;
    }
    summaryDueDate.textContent = `${monthNames[targetMonth]} ${dueDay}, ${targetYear}`;
  }

  const paymentAmountInput = document.getElementById('paymentAmount');
  if (paymentAmountInput) {
    if (currentRemainingDue <= 0) {
      paymentAmountInput.value = '0';
      paymentAmountInput.placeholder = '0.00 (Rent Settled)';
    } else if (
      !paymentAmountInput.value ||
      paymentAmountInput.value === '5000' ||
      parseFloat(paymentAmountInput.value) > currentRemainingDue
    ) {
      paymentAmountInput.value = currentRemainingDue.toString();
    }
    if (typeof updateSubmitButton === 'function') {
      updateSubmitButton();
    }
  }
}

function populateTenantUI() {
  const userEmailEl = document.getElementById('userEmail');
  if (userEmailEl) userEmailEl.textContent = userEmail;

  const emailInput = document.getElementById('email');
  if (emailInput) emailInput.value = userEmail;

  const nameInput = document.getElementById('fullName');
  if (nameInput) nameInput.value = tenantName;

  const phoneInput = document.getElementById('phone');
  if (phoneInput) phoneInput.value = tenantPhone;

  const emergencyInput = document.getElementById('emergencyContact');
  if (emergencyInput) emergencyInput.value = tenantEmergency;

  const dormInput = document.getElementById('tenantProfileDorm');
  if (dormInput) dormInput.value = tenantDorm;

  const roomInput = document.getElementById('tenantProfileRoom');
  if (roomInput) roomInput.value = tenantRoom;

  const moveInInput = document.getElementById('tenantProfileMoveIn');
  if (moveInInput) moveInInput.value = tenantMoveIn;

  const summaryResidence = document.getElementById('summaryResidence');
  if (summaryResidence) summaryResidence.textContent = `${tenantDorm} (${tenantRoom})`;

  const summaryRent = document.getElementById('summaryRent');
  if (summaryRent) summaryRent.textContent = '₱' + tenantRent.toLocaleString() + '.00';

  updateAmountDueUI();

  const receiptTenantName = document.getElementById('receiptTenantName');
  if (receiptTenantName) receiptTenantName.textContent = tenantName;
}

// Apply immediately from session storage
populateTenantUI();

// Also fetch up-to-date tenant profile from Firestore when ready
async function fetchTenantFirestoreProfile() {
  if (!window.firebaseDb || !window.firebaseFirestore) {
    window.addEventListener('firebase-ready', fetchTenantFirestoreProfile, { once: true });
    return;
  }
  try {
    const tenantsRef = window.firebaseFirestore.collection(window.firebaseDb, 'tenants');
    const q = window.firebaseFirestore.query(
      tenantsRef,
      window.firebaseFirestore.where('email', '==', userEmail)
    );

    window.firebaseFirestore.onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const tenantDoc = snapshot.docs[0];
        currentTenantDocId = tenantDoc.id;
        sessionStorage.setItem('tenantDocId', currentTenantDocId);
        const docData = tenantDoc.data();
        if (docData.name) {
          tenantName = docData.name;
          sessionStorage.setItem('tenantName', docData.name);
        }
        if (docData.phone) {
          tenantPhone = docData.phone;
          sessionStorage.setItem('tenantPhone', docData.phone);
        }
        if (docData.room) {
          tenantRoom = docData.room;
          sessionStorage.setItem('tenantRoom', docData.room);
        }
        if (docData.dormName) {
          tenantDorm = docData.dormName;
          sessionStorage.setItem('tenantDorm', docData.dormName);
        }
        if (docData.moveInDate) {
          tenantMoveIn = docData.moveInDate;
          sessionStorage.setItem('tenantMoveInDate', docData.moveInDate);
        }
        if (docData.dueDay) {
          tenantDueDay = parseInt(docData.dueDay);
          sessionStorage.setItem('tenantDueDay', tenantDueDay);
        }
        if (docData.monthlyRent) {
          tenantRent = parseFloat(docData.monthlyRent);
          sessionStorage.setItem('tenantMonthlyRent', tenantRent);
        }
        if (docData.amountDue !== undefined && docData.amountDue !== null) {
          // Staff-set balance. Authoritative, so it overrides any derived total.
          tenantAmountDueFromServer = parseFloat(docData.amountDue);
        }
        if (docData.emergencyContact) {
          tenantEmergency = docData.emergencyContact;
          sessionStorage.setItem('tenantEmergencyContact', docData.emergencyContact);
        }
        populateTenantUI();
        // The profile may have supplied a staff-set balance after the first
        // paint, so re-derive now that we know it.
        if (tenantAmountDueFromServer !== null) refreshServerBalance();
      }
    });
  } catch (err) {
    console.warn('Could not sync tenant profile from Firestore:', err);
  }
}

fetchTenantFirestoreProfile();

function switchTab(tabName, evt) {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach((tab) => tab.classList.remove('active'));
  const tabButtons = document.querySelectorAll('.tab');
  tabButtons.forEach((btn) => btn.classList.remove('active'));
  const targetContent = document.getElementById(tabName + '-tab');
  if (targetContent) targetContent.classList.add('active');
  // The caller passes the triggering element. `window.event` is a legacy
  // global and is not reliable from module code.
  const target = evt?.target ?? evt;
  if (target && target.classList) {
    target.classList.add('active');
  } else {
    tabButtons.forEach((btn) => {
      if (btn.textContent.toLowerCase().includes(tabName)) btn.classList.add('active');
    });
  }
  if (tabName === 'messages') {
    setTimeout(() => {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
  }
  if (tabName === 'payment') {
    loadTenantPaymentHistory();
  }
}

function logout() {
  sessionStorage.removeItem('tenantLoggedIn');
  sessionStorage.removeItem('tenantEmail');
  window.location.href = 'admin-login.html';
}

/**
 * Persists the tenant's editable profile fields.
 *
 * Only name, phone, and emergency contact are written. firestore.rules scopes
 * a tenant's own update to exactly those keys, so rent, balance, status, and
 * role cannot be touched from here -- staff and the webhook own those.
 */
async function saveProfile() {
  const name = (document.getElementById('fullName')?.value || '').trim();
  const phone = (document.getElementById('phone')?.value || '').trim();
  const emergencyContact = (document.getElementById('emergencyContact')?.value || '').trim();

  if (!name) {
    Toast.error('Please enter your name.');
    return;
  }

  if (!currentTenantDocId || !window.firebaseDb || !window.firebaseFirestore) {
    Toast.error('Your profile is still loading. Please try again in a moment.');
    return;
  }

  const { doc, updateDoc, serverTimestamp } = window.firebaseFirestore;

  try {
    await updateDoc(doc(window.firebaseDb, 'tenants', currentTenantDocId), {
      name,
      phone,
      emergencyContact,
      updatedAt: serverTimestamp()
    });

    // Keep the local mirror in step so the rest of the portal agrees.
    tenantName = name;
    tenantPhone = phone;
    tenantEmergency = emergencyContact;
    sessionStorage.setItem('tenantName', name);
    sessionStorage.setItem('tenantPhone', phone);
    sessionStorage.setItem('tenantEmergencyContact', emergencyContact);

    populateTenantUI();
    Toast.success('Profile updated.');
  } catch (error) {
    console.error('Profile save failed:', error);
    Toast.error(
      error?.code === 'permission-denied'
        ? 'You can only update your own contact details. Contact the admin for other changes.'
        : 'Could not save your profile. Please try again.'
    );
  }
}

// Update Submit Button State and Text
function updateSubmitButton() {
  const submitBtn = document.getElementById('submitPaymentBtn');
  if (!submitBtn) return;
  const amountRaw = (document.getElementById('paymentAmount')?.value || '0')
    .toString()
    .replace(/,/g, '');
  const amountNum = parseFloat(amountRaw) || 0;
  if (amountNum > 0) {
    submitBtn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            <span>Proceed to Pay (₱${amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
        `;
  } else {
    submitBtn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            <span>Proceed to Pay</span>
        `;
  }
  submitBtn.disabled = false;
}

document.getElementById('paymentAmount')?.addEventListener('input', updateSubmitButton);

// Payment Form Submission - Direct to PayMongo Hosted Checkout
document.getElementById('paymentForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const purpose = document.getElementById('paymentPurpose').value;
  const amountRaw = (document.getElementById('paymentAmount').value || '0')
    .toString()
    .replace(/,/g, '');
  const amountVal = parseFloat(amountRaw);
  const notes = (document.getElementById('paymentNotes').value || '').trim();
  const tenantName =
    document.getElementById('fullName')?.value?.trim() ||
    sessionStorage.getItem('tenantName') ||
    '';
  const tenantPhone = document.getElementById('phone')?.value?.trim() || '';

  if (!amountVal || amountVal <= 0) {
    if (currentRemainingDue <= 0) {
      alert(
        'Your rent for this cycle is already settled! If you wish to make an advance payment, please enter the advance amount in the payment amount box.'
      );
    } else {
      alert('Please enter a valid payment amount.');
    }
    return;
  }

  const submitBtn = document.getElementById('submitPaymentBtn');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
        <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10" stroke-width="4" stroke="currentColor" stroke-opacity="0.25"></circle>
            <path d="M4 12a8 8 0 018-8" stroke-width="4" stroke-linecap="round"></path>
        </svg>
        <span>Connecting to PayMongo...</span>
    `;

  try {
    const descWithNotes = notes
      ? `${purpose} (${notes}) - MJP Residences`
      : `${purpose} - MJP Residences`;
    const successUrl = `${window.location.origin}${window.location.pathname}?payment=success&amount=${amountVal}&purpose=${encodeURIComponent(purpose)}`;
    const cancelUrl = `${window.location.origin}${window.location.pathname}?payment=failed&amount=${amountVal}&purpose=${encodeURIComponent(purpose)}`;

    const session = await PayMongo.createCheckoutSession({
      amount: amountVal,
      purpose: purpose,
      notes: notes,
      description: descWithNotes,
      tenantName: tenantName,
      tenantEmail: userEmail,
      tenantPhone: tenantPhone,
      paymentMethodTypes: ['card', 'paymaya', 'grab_pay', 'qrph'],
      successUrl: successUrl,
      cancelUrl: cancelUrl
    });

    if (session && session.checkoutUrl) {
      const pendingPayload = JSON.stringify({
        sessionId: session.sessionId,
        referenceNumber: session.referenceNumber,
        amount: amountVal,
        purpose: purpose,
        notes: notes,
        method: 'PayMongo Checkout',
        tenantName: tenantName,
        tenantEmail: userEmail,
        // Anchors the webhook match window to when the checkout was created,
        // so an older payment of the same amount cannot confirm this one.
        startedAtMs: Date.now()
      });
      // Store in BOTH storages for maximum reliability across cross-origin redirects
      sessionStorage.setItem('pending_paymongo_payment', pendingPayload);
      localStorage.setItem('pending_paymongo_payment', pendingPayload);
      // Mark that we are leaving for PayMongo checkout — used to force fresh load on return
      sessionStorage.setItem('paymongo_checkout_active', '1');

      // Use location.replace() so HomeSpot is NOT in browser history stack.
      // This means pressing Back from PayMongo checkout does a FRESH load of HomeSpot
      // (not a BF-cache restore), ensuring checkUrlPaymentReturn() runs on DOMContentLoaded.
      window.location.replace(session.checkoutUrl);
      return;
    } else {
      throw new Error('Unable to generate PayMongo checkout session.');
    }
  } catch (err) {
    console.error('Payment processing failed:', err);
    alert('Payment processing error: ' + err.message);
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
});

// Save & Finalize Payment Record
//
// The redirect back from PayMongo is only a CLAIM that a payment was made, so
// nothing here marks money as received. The record is cached locally for the
// history table, the attempt is stored as pending verification, and the balance
// is recomputed from the `payments` collection -- which only the PayMongo
// webhook can write (firestore.rules: `allow write: if false`).
//
// Hand-editing ?payment=success therefore shows "Awaiting confirmation"
// forever, and the balance does not move until PayMongo reports the payment.
async function saveAndFinalizePayment(record) {
  const attempt = {
    ...record,
    // The verification window is anchored to when the checkout was created,
    // falling back to now only when we have nothing better (which keeps the
    // attempt matchable but never lets an old payment stand in for it).
    startedAtMs: Number(record.startedAtMs) || returnAttemptStartedAtMs || Date.now()
  };
  returnAttemptStartedAtMs = null;

  // Local cache only. This is display history, never proof of payment.
  if (PayMongo?.savePaymentRecord) {
    try {
      await PayMongo.savePaymentRecord(attempt);
    } catch (e) {
      cacheLocalPayment(attempt);
    }
  } else {
    cacheLocalPayment(attempt);
  }

  // Stash the attempt so the watcher can corroborate it against the webhook.
  persistPendingVerification(attempt);

  // Recompute the balance from server-confirmed payments.
  await refreshServerBalance();

  // Reset form
  document.getElementById('paymentNotes').value = '';
  updateSubmitButton();

  // Refresh history table
  await loadTenantPaymentHistory();

  // Tell the payer it is being verified rather than "Paid".
  showReceiptModal(attempt);
}

/**
 * Mirrors a payment record into localStorage.
 *
 * The portal used to call this "saving to Firestore", but firestore.rules deny
 * every client write to `payments`, so this has only ever been a local cache.
 */
function cacheLocalPayment(record) {
  try {
    const k = `tenant_payments_${record.tenantEmail || 'guest'}`;
    const arr = JSON.parse(localStorage.getItem(k) || '[]');
    arr.unshift({ ...record, timestamp: new Date().toISOString() });
    localStorage.setItem(k, JSON.stringify(arr));
    const all = JSON.parse(localStorage.getItem('all_tenant_payments') || '[]');
    all.unshift({ ...record, timestamp: new Date().toISOString() });
    localStorage.setItem('all_tenant_payments', JSON.stringify(all));
  } catch (_) {}
}

function persistPendingVerification(attempt) {
  try {
    sessionStorage.setItem('pending_payment_verification', JSON.stringify(attempt));
  } catch (_) {}
}

function readPendingVerification() {
  try {
    const raw = sessionStorage.getItem('pending_payment_verification');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearPendingVerification() {
  try {
    sessionStorage.removeItem('pending_payment_verification');
  } catch (_) {}
}

/**
 * Subscribes to the `payments` collection for this tenant and re-derives the
 * balance whenever the webhook writes.
 *
 * firestore.rules already allows this read to the payer and denies them every
 * write, which is exactly the authority split this flow needs.
 */
function watchServerPayments() {
  if (!window.firebaseDb || !window.firebaseFirestore || !userEmail) return null;

  const { collection, query, where, onSnapshot } = window.firebaseFirestore;
  const paymentsRef = collection(window.firebaseDb, 'payments');
  const q = query(paymentsRef, where('tenantEmail', '==', userEmail));

  try {
    return onSnapshot(
      q,
      async (snapshot) => {
        serverPayments = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            ...data,
            // Normalise the Timestamp so the pure matcher can read it.
            timestamp: data.timestamp ?? data.createdAt ?? null,
            firestoreTimestamp: data.createdAt ?? null
          };
        });
        await refreshServerBalance();
        resolvePendingVerification();
        await loadTenantPaymentHistory();
      },
      (error) => {
        // A missing composite index, or the rule denying this read, should not
        // break the portal -- it just means no server-side reconciliation.
        console.warn('Server payment watcher unavailable:', error?.code || error?.message);
      }
    );
  } catch (error) {
    console.warn('Could not subscribe to payments:', error?.message);
    return null;
  }
}

/**
 * Re-derives `currentRemainingDue` from server-confirmed payments and an
 * admin-set `amountDue`, then repaints the summary.
 */
async function refreshServerBalance() {
  const { due } = resolveAmountDue({
    rent: tenantRent,
    serverPayments,
    explicitAmountDue: tenantAmountDueFromServer
  });

  currentRemainingDue = due;
  sessionStorage.setItem('tenantAmountDue', String(due));
  localStorage.setItem('tenant_amount_due_' + userEmail, String(due));
  updateAmountDueUI();
}

/**
 * Once the webhook reports an outcome for the pending attempt, drop the local
 * "verifying" state and let the confirmed payment drive the UI.
 */
function resolvePendingVerification() {
  const attempt = readPendingVerification();
  if (!attempt) return;

  const { state, match } = decideVerification({
    attempt,
    serverPayments,
    windowHours: PAYMENT_MATCH_WINDOW_HOURS
  });

  if (state === VERIFICATION.CONFIRMED || state === VERIFICATION.FAILED) {
    clearPendingVerification();
    Toast[state === VERIFICATION.CONFIRMED ? 'success' : 'error'](
      state === VERIFICATION.CONFIRMED
        ? 'Payment confirmed by PayMongo.'
        : 'PayMongo reported this payment as failed.'
    );
    // The server record is now the source of truth for this attempt.
    showReceiptModal({
      ...attempt,
      status: state === VERIFICATION.CONFIRMED ? 'Paid' : 'Failed',
      payMongoReference: match?.referenceNumber || null,
      dateFormatted: match?.dateFormatted || attempt.dateFormatted
    });
  }
}

// Save Failed Payment Record — local cache only, then refresh and show receipt.
async function saveFailedPayment(record) {
  if (PayMongo?.savePaymentRecord) {
    try {
      await PayMongo.savePaymentRecord(record);
    } catch (e) {
      cacheLocalPayment(record);
    }
  } else {
    cacheLocalPayment(record);
  }

  // The browser does NOT announce its own payment events to the webhook
  // endpoint. That path let any client forge a PayMongo event in the dev log,
  // and it never reached `payments` anyway: firestore.rules denies client
  // writes there, and the authoritative record is written by the Cloud
  // Function webhook (functions/index.js). Real settlement is confirmed by
  // PayMongo calling us, never by the payer.

  // A failure never changes the balance.
  await refreshServerBalance();

  // CRITICAL: For failed payment, do NOT deduct from currentRemainingDue!
  // Refresh history table so the failed record is immediately visible
  await loadTenantPaymentHistory();

  // Display Official Receipt in Failed Payment state
  showReceiptModal(record);
}

// Show Official Receipt Modal (Paid / Failed / Awaiting confirmation)
function showReceiptModal(record) {
  const isFailed =
    (record.status || '').toLowerCase().includes('fail') ||
    (record.status || '').toLowerCase().includes('declined') ||
    (record.status || '').toLowerCase().includes('cancel');

  // A redirect is not proof. Unless the webhook confirmed this attempt, we
  // must not render a green "Payment Successful" receipt -- that claim is what
  // a hand-edited ?payment=success URL used to produce.
  const isConfirmed =
    String(record.status || '')
      .trim()
      .toLowerCase() === 'paid' || isFailed;
  const isVerifying = !isFailed && !isConfirmed;

  const headerEl = document.getElementById('receiptModalHeader');
  const dotEl = document.getElementById('receiptModalDot');
  const headerTitleEl = document.getElementById('receiptModalHeaderTitle');
  const iconContainer = document.getElementById('receiptIconContainer');
  const titleEl = document.getElementById('receiptModalTitle');
  const subtitleEl = document.getElementById('receiptModalSubtitle');
  const statusBadgeEl = document.getElementById('receiptStatusBadge');
  const failureRow = document.getElementById('receiptFailureRow');
  const failureReasonEl = document.getElementById('receiptFailureReason');
  const amountLabelEl = document.getElementById('receiptAmountLabel');
  const amountEl = document.getElementById('receiptAmount');
  const printBtn = document.getElementById('receiptPrintBtn');
  const closeBtn = document.getElementById('receiptCloseBtn');

  document.getElementById('receiptTenantName').textContent =
    record.tenantName || tenantName || 'Tenant';
  const residenceEl = document.getElementById('receiptResidence');
  if (residenceEl) {
    const residence = [tenantDorm, tenantRoom].filter(Boolean).join(' (') + (tenantRoom ? ')' : '');
    residenceEl.textContent = residence || '—';
  }
  document.getElementById('receiptPurpose').textContent = record.purpose || 'Monthly Rent';
  document.getElementById('receiptMethod').textContent = record.method || 'PayMongo Checkout';
  document.getElementById('receiptReference').textContent = record.referenceNumber || 'PM-REF';
  document.getElementById('receiptTokenId').textContent = record.paymentMethodId || '—';
  document.getElementById('receiptDateTime').textContent =
    record.dateFormatted || new Date().toLocaleString();

  const formattedAmount = `₱${parseFloat(record.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  if (isFailed) {
    // Failed Payment Styling
    if (headerEl) headerEl.style.background = '#fef2f2';
    if (dotEl) {
      dotEl.style.background = '#ef4444';
      dotEl.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
    }
    if (headerTitleEl) {
      headerTitleEl.textContent = 'PayMongo Payment Notice - Failed';
      headerTitleEl.style.color = '#991b1b';
    }
    if (iconContainer) {
      iconContainer.innerHTML = '<div class="receipt-fail-icon">✕</div>';
    }
    if (titleEl) {
      titleEl.textContent = 'Payment Failed';
      titleEl.style.color = '#dc2626';
    }
    if (subtitleEl) {
      subtitleEl.textContent =
        'Transaction was not completed or 3DS authentication failed on PayMongo.';
    }
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = '<span class="status-badge-failed">✗ Failed</span>';
    }
    if (failureRow) {
      failureRow.style.display = 'flex';
      if (failureReasonEl) {
        failureReasonEl.textContent =
          record.failureReason || 'Card authentication failed / cancelled in PayMongo test mode';
      }
    }
    if (amountLabelEl) amountLabelEl.textContent = 'Amount (Unpaid)';
    if (amountEl) {
      amountEl.textContent = `${formattedAmount} (Not Charged)`;
      amountEl.style.color = '#dc2626';
    }
    if (printBtn) {
      printBtn.style.borderColor = '#ef4444';
      printBtn.style.color = '#dc2626';
      printBtn.innerHTML = `
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z">
                    </path>
                </svg>
                <span>Print Failure Notice</span>
            `;
    }
    if (closeBtn) {
      closeBtn.style.background = '#dc2626';
      closeBtn.textContent = 'Try Again';
    }
  } else if (isVerifying) {
    // Redirect received, webhook has not reported yet.
    if (headerEl) headerEl.style.background = '#fffbeb';
    if (dotEl) {
      dotEl.style.background = '#f59e0b';
      dotEl.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.2)';
    }
    if (headerTitleEl) {
      headerTitleEl.textContent = 'PayMongo Payment Notice - Verifying';
      headerTitleEl.style.color = '#92400e';
    }
    if (iconContainer) {
      iconContainer.innerHTML = '<div class="receipt-check-icon" style="color:#f59e0b">⏱</div>';
    }
    if (titleEl) {
      titleEl.textContent = 'Awaiting Confirmation';
      titleEl.style.color = '#92400e';
    }
    if (subtitleEl) {
      subtitleEl.textContent =
        'We received your payment submission. Your balance updates once PayMongo confirms the transaction.';
    }
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = '<span class="status-badge-pending">⏱ Verifying</span>';
    }
    if (failureRow) failureRow.style.display = 'none';
    if (amountLabelEl) amountLabelEl.textContent = 'Amount Submitted';
    if (amountEl) {
      amountEl.textContent = formattedAmount;
      amountEl.style.color = '#b45309';
    }
    if (printBtn) {
      printBtn.style.borderColor = '#f59e0b';
      printBtn.style.color = '#b45309';
      printBtn.innerHTML = '<span>Print Confirmation</span>';
    }
    if (closeBtn) {
      closeBtn.style.background = '#f59e0b';
      closeBtn.textContent = 'Close';
    }
  } else {
    // Successful Payment Styling (webhook-confirmed)
    if (headerEl) headerEl.style.background = '#f0fdf4';
    if (dotEl) {
      dotEl.style.background = '#10B981';
      dotEl.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
    }
    if (headerTitleEl) {
      headerTitleEl.textContent = 'PayMongo Payment Receipt';
      headerTitleEl.style.color = '#166534';
    }
    if (iconContainer) {
      iconContainer.innerHTML = '<div class="receipt-check-icon">✓</div>';
    }
    if (titleEl) {
      titleEl.textContent = 'Payment Successful';
      titleEl.style.color = '#0f172a';
    }
    if (subtitleEl) {
      subtitleEl.textContent = 'Your transaction has been processed and verified by PayMongo.';
    }
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = '<span class="status-badge-paid">✓ Paid</span>';
    }
    if (failureRow) failureRow.style.display = 'none';
    if (amountLabelEl) amountLabelEl.textContent = 'Amount Paid';
    if (amountEl) {
      amountEl.textContent = formattedAmount;
      amountEl.style.color = '#059669';
    }
    if (printBtn) {
      printBtn.style.borderColor = '#10B981';
      printBtn.style.color = '#10B981';
      printBtn.innerHTML = `
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z">
                    </path>
                </svg>
                <span>Print / Save Receipt</span>
            `;
    }
    if (closeBtn) {
      closeBtn.style.background = '#10B981';
      closeBtn.textContent = 'Done';
    }
  }

  document.getElementById('paymongoReceiptModal').style.display = 'flex';
}

function closeReceiptModal() {
  document.getElementById('paymongoReceiptModal').style.display = 'none';
}

/**
 * Opens the receipt for the payment record carried on a data-record attribute.
 *
 * Replaces the previous inline `onclick='showReceiptModal(...)'` wiring: the
 * payload is URL-encoded JSON, so quotes, braces, and angle brackets cannot
 * break out of the attribute or into executable JS context.
 *
 * @param {string} raw
 */
function showReceiptModalForRecord(raw) {
  if (!raw) return;
  try {
    showReceiptModal(JSON.parse(decodeURIComponent(raw)));
  } catch (error) {
    console.error('Invalid payment record on receipt button:', error);
  }
}

// Print Receipt
function printReceipt() {
  const printContent = document.getElementById('receiptPrintArea').innerHTML;
  const printWindow = window.open('', '_blank', 'width=600,height=700');
  printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Official Payment Receipt - MJP Residences</title>
            <!-- The print window is about:blank, so it cannot resolve a
                 relative stylesheet path. Print styles live here. -->
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; }
                .receipt-details-list { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
                .receipt-row:last-child { border-bottom: none; font-weight: bold; font-size: 16px; color: #0f172a; }
                .receipt-check-icon { font-size: 40px; color: #16a34a; text-align: center; margin-bottom: 10px; }
                .receipt-fail-icon { font-size: 40px; color: #dc2626; text-align: center; margin-bottom: 10px; }
                .paymongo-tag { background: #10B981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
                .status-badge-paid { background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
                .status-badge-failed { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
                .no-print { display: none !important; }
            </style>
        </head>
        <body>
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="margin: 0 0 4px;">MJP Residences</h2>
                <p style="margin: 0; color: #64748b; font-size: 13px;">Official Electronic Payment Record • Powered by PayMongo</p>
            </div>
            ${printContent}
            <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #94a3b8;">
                This document serves as your verified proof of transaction. For inquiries, contact management.
            </div>
        </body>
        </html>
    `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}

// Load Tenant Payment History
async function loadTenantPaymentHistory() {
  const tableBody = document.getElementById('paymentHistoryTableBody');
  const countBadge = document.getElementById('historyCountBadge');
  if (!tableBody) return;

  let payments = [];
  if (PayMongo) {
    payments = await PayMongo.getTenantPayments(userEmail);
  }

  // The balance is derived from server-confirmed payments (and any staff-set
  // amountDue), NEVER from these local records -- they live in localStorage and
  // a user can edit them. This used to compute the due from local records,
  // which made the whole balance forgeable.
  await refreshServerBalance();

  // Show the webhook's view of the ledger. Until the webhook reports an
  // outcome, an attempt is shown as awaiting confirmation rather than paid.
  const serverRows = serverPayments.map((p) => ({
    ...p,
    __source: 'server',
    status: String(p.status || '').toLowerCase() === 'paid' ? 'Paid' : p.status
  }));
  const serverRefs = new Set(serverRows.map((p) => p.referenceNumber).filter(Boolean));
  const localOnly = (payments || []).filter(
    (p) => !p.referenceNumber || !serverRefs.has(p.referenceNumber)
  );
  const merged = [...serverRows, ...localOnly];

  if (!merged.length) {
    tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #9ca3af; padding: 24px;">
                    No payment records found. Make your first payment above!
                </td>
            </tr>
        `;
    if (countBadge) countBadge.textContent = '0 payments';
    return;
  }

  if (countBadge)
    countBadge.textContent = `${merged.length} payment${merged.length > 1 ? 's' : ''}`;

  tableBody.innerHTML = merged
    .map((p, idx) => {
      const isFailed =
        (p.status || '').toLowerCase().includes('fail') ||
        (p.status || '').toLowerCase().includes('declined') ||
        (p.status || '').toLowerCase().includes('cancel');
      const isPending = (p.status || '').toLowerCase() === 'pending';
      // A local-only record is an attempt the webhook has not confirmed yet.
      // Calling it "Paid" would be the exact lie this flow was built to avoid.
      const isUnconfirmed = p.__source !== 'server';
      const statusBadge = isFailed
        ? `<span class="status-badge-failed">✗ Failed</span>`
        : isUnconfirmed
          ? `<span class="status-badge-pending">⏱ Awaiting confirmation</span>`
          : isPending
            ? `<span class="status-badge-pending">⏱ Pending</span>`
            : `<span class="status-badge-paid">✓ Paid</span>`;
      const amountColor = isFailed ? '#dc2626' : isUnconfirmed || isPending ? '#b45309' : '#059669';

      // The record travels in a URL-encoded data-* attribute and is parsed by
      // the delegated click handler in showReceiptModalForRecord(). Putting it
      // in an inline `onclick` is unsafe: attribute values are HTML-decoded
      // before the JS parser runs, so escaping single quotes is not enough to
      // keep user-controlled payment fields out of executable context.
      const record = encodeURIComponent(JSON.stringify(p));

      return `
        <tr>
            <td>${escapeHtml(p.dateFormatted || new Date(p.timestamp || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</td>
            <td style="font-family: monospace; font-size: 12px; color: #475569;">${escapeHtml(p.referenceNumber || 'PM-' + idx)}</td>
            <td>${escapeHtml(p.purpose || 'Monthly Rent')}</td>
            <td>${escapeHtml(p.method || 'PayMongo')}</td>
            <td style="font-weight: 600; color: ${amountColor};">₱${parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-view-receipt" data-action="view-receipt" data-record="${record}">
                    Receipt
                </button>
            </td>
        </tr>
        `;
    })
    .join('');
}

/**
 * Handles a return from PayMongo.
 *
 * All four return shapes (pending checkout session, card 3DS, hosted success,
 * hosted failure) are resolved by `lib/payment-return.js`, which is unit-tested
 * in tests/payment-return.test.js. This function only performs the I/O the
 * decision asks for -- reading storage, calling PayMongo, repainting -- so the
 * tested logic and the browser cannot drift apart.
 *
 * Note that a resolved outcome still yields a PENDING record: the redirect is a
 * claim, and only the webhook marks money received (see
 * lib/payment-verification.js).
 */
async function checkUrlPaymentReturn() {
  let pending = null;
  try {
    const saved =
      sessionStorage.getItem('pending_paymongo_payment') ||
      localStorage.getItem('pending_paymongo_payment');
    if (saved) pending = JSON.parse(saved);
  } catch (e) {}

  // Capture the checkout start time before the pending record is cleared below.
  if (pending?.startedAtMs) returnAttemptStartedAtMs = Number(pending.startedAtMs);

  const scenario = resolveReturnScenario({
    search: window.location.search,
    href: window.location.href,
    pending,
    fallbackTenantName: sessionStorage.getItem('tenantName') || tenantName
  });

  if (scenario.kind === SCENARIO.NONE) return;

  if (scenario.clearPending) {
    sessionStorage.removeItem('pending_paymongo_payment');
    localStorage.removeItem('pending_paymongo_payment');
  }

  // --- Resolve the gateway's actual outcome -----------------------------------
  let sessionStatus = null;

  if (scenario.kind === SCENARIO.PENDING_SESSION) {
    // No URL params at all: ask PayMongo what really happened to the session.
    const sessionId = scenario.sessionId;
    let sessionData = null;
    try {
      sessionData = await PayMongo.getCheckoutSession(sessionId);
    } catch (e) {
      console.warn('[PayReturn] Could not inspect checkout session:', e);
    }
    sessionStatus = sessionData?.attributes?.status ?? null;
  } else if (scenario.kind === SCENARIO.HOSTED_FAILED && scenario.sessionId) {
    try {
      const sessionData = await PayMongo.getCheckoutSession(scenario.sessionId);
      sessionStatus = sessionData?.attributes?.status ?? null;
    } catch (e) {
      console.warn('[PayReturn] Could not inspect failed checkout session:', e);
    }
  }

  // --- Decide paid vs failed from the gateway's own answer --------------------
  let outcomeStatus;

  if (scenario.kind === SCENARIO.PENDING_SESSION) {
    // Fail closed: only an explicit 'paid' counts.
    outcomeStatus = sessionStatus === 'paid' ? 'Paid' : 'Failed';
  } else if (scenario.kind === SCENARIO.CARD_3DS) {
    let piData = null;
    try {
      piData = await PayMongo.getPaymentIntentStatus(scenario.paymentIntentId);
    } catch (e) {
      console.warn('[PayReturn] Could not inspect payment intent:', e);
    }
    outcomeStatus = interpretPaymentIntent(piData).isSuccess ? 'Paid' : 'Failed';
  } else if (scenario.kind === SCENARIO.HOSTED_SUCCESS) {
    outcomeStatus = 'Paid';
  } else {
    outcomeStatus = 'Failed';
  }

  // A hosted "success" URL is not proof either; if we managed to inspect the
  // session and PayMongo disagrees, trust PayMongo.
  if (outcomeStatus === 'Paid' && sessionStatus && sessionStatus !== 'paid') {
    outcomeStatus = 'Failed';
  }

  // --- Gather the failure detail for the receipt ------------------------------
  let failureReason;
  if (outcomeStatus === 'Failed') {
    failureReason = await resolveFailureReason(scenario);
  }

  const record = buildReturnRecord(scenario, {
    // `status` is the gateway's verdict; `recordStatus` is what we store. Even
    // a gateway-confirmed success is stored as Pending, because the balance may
    // only move once the webhook writes the matching `payments` record.
    status: outcomeStatus === 'Paid' ? 'Paid' : 'Failed',
    recordStatus: outcomeStatus === 'Paid' ? 'Pending' : 'Failed',
    failureReason,
    tenantEmail: userEmail,
    startedAtMs: returnAttemptStartedAtMs
  });

  // Clean the query string so a refresh does not replay the return.
  if (scenario.stripUrl) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  switchTab('payment');

  if (outcomeStatus === 'Paid') {
    await saveAndFinalizePayment(record);
    return;
  }

  await saveFailedPayment(record);

  // Fire-and-forget: expire the session so PayMongo's dashboard reflects it.
  if (
    scenario.sessionId &&
    shouldExpireSession(scenario.kind, sessionStatus) &&
    PayMongo?.expireCheckoutSession
  ) {
    PayMongo.expireCheckoutSession(scenario.sessionId).catch(() => {});
  }
}

/**
 * Best-effort explanation of why a payment failed, from PayMongo.
 * @param {Object} scenario
 * @returns {Promise<string|undefined>}
 */
async function resolveFailureReason(scenario) {
  if (scenario.kind === SCENARIO.CARD_3DS) {
    try {
      const piData = await PayMongo.getPaymentIntentStatus(scenario.paymentIntentId);
      return interpretPaymentIntent(piData).failureDetail;
    } catch (e) {
      return undefined;
    }
  }

  if (scenario.sessionId) {
    try {
      const sessionData = await PayMongo.getCheckoutSession(scenario.sessionId);
      return interpretCheckoutSession(sessionData).failureDetail || undefined;
    } catch (e) {
      return undefined;
    }
  }

  return undefined;
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  updateSubmitButton();
  // Balance comes from the webhook's ledger, not from local state.
  watchServerPayments();
  // Chat renders from Firestore, so admin replies arrive without a refresh.
  watchChatThread();
  loadTenantPaymentHistory();
  checkUrlPaymentReturn();
});

// Handle Back-Forward Cache (BF cache) restores:
// When the user presses the browser Back button from PayMongo's checkout page,
// the browser restores this page from BF cache WITHOUT firing DOMContentLoaded.
// pageshow fires in both fresh load and BF-cache restore cases.
let paymentReturnChecked = false;
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Page restored from BF cache — re-run payment return check
    console.log('[PayReturn] BF-cache restore detected — re-checking payment return');
    paymentReturnChecked = false;
    checkUrlPaymentReturn();
  }
});

// Also handle tab visibility change as a secondary fallback
// (some mobile browsers use this instead of pageshow for back navigation)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !paymentReturnChecked) {
    const pendingRaw =
      sessionStorage.getItem('pending_paymongo_payment') ||
      localStorage.getItem('pending_paymongo_payment');
    if (pendingRaw) {
      console.log('[PayReturn] visibilitychange with pending payment — checking');
      paymentReturnChecked = true;
      checkUrlPaymentReturn();
    }
  }
});

/**
 * Subscribes to this tenant's message thread and renders it.
 *
 * The snapshot -- not a local append -- is the source of truth, so a message
 * that Firestore rejects never appears to have been sent, and an admin reply
 * shows up without a refresh. firestore.rules already scopes this read to the
 * sender's own email, so a tenant only ever sees their own thread.
 *
 * @returns {(() => void)|null} unsubscribe
 */
function watchChatThread() {
  const container = document.getElementById('chatMessages');
  if (!container || !window.firebaseDb || !window.firebaseFirestore || !userEmail) return null;

  const { collection, query, where, orderBy, onSnapshot } = window.firebaseFirestore;

  try {
    const messagesRef = collection(window.firebaseDb, 'messages');
    const q = query(messagesRef, where('email', '==', userEmail), orderBy('createdAt', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        renderChatThread(
          container,
          snapshot.docs.map((doc) => doc.data())
        );
      },
      (error) => {
        // A missing composite index is the likely cause; the chat still sends,
        // it just does not render the history.
        console.warn('Chat subscription unavailable:', error?.code || error?.message);
      }
    );
  } catch (error) {
    console.warn('Could not subscribe to the chat thread:', error?.message);
    return null;
  }
}

/**
 * Renders the thread. Uses textContent throughout -- message bodies are
 * arbitrary user input from both sides of the conversation.
 */
function renderChatThread(container, messages) {
  container.innerHTML = '';

  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = 'No messages yet. Send a message to the building administrator.';
    container.appendChild(empty);
    return;
  }

  for (const message of messages) {
    const fromTenant = message.sender === 'tenant';

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${fromTenant ? 'sent' : 'received'}`;

    const body = document.createElement('div');
    body.textContent = message.message || '';
    bubble.appendChild(body);

    const stamp = document.createElement('div');
    stamp.className = 'message-time-stamp';
    stamp.textContent = formatChatStamp(message.createdAt);
    bubble.appendChild(stamp);

    // An admin reply, shown inline beneath the original question.
    if (message.reply) {
      const reply = document.createElement('div');
      reply.className = 'message-bubble received message-reply';
      const replyBody = document.createElement('div');
      replyBody.textContent = message.reply;
      const replyStamp = document.createElement('div');
      replyStamp.className = 'message-time-stamp';
      replyStamp.textContent = formatChatStamp(message.repliedAt);
      reply.append(replyBody, replyStamp);
      bubble.appendChild(reply);
    }

    container.appendChild(bubble);
  }

  container.scrollTop = container.scrollHeight;
}

/** Formats a Firestore Timestamp (or anything date-like) for the chat. */
function formatChatStamp(value) {
  if (!value) return '';
  const ms = value.toDate ? value.toDate().getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const messageText = input.value.trim();
  if (!messageText) return;

  if (!window.firebaseDb || !window.firebaseFirestore) {
    Toast.error('Chat is unavailable right now. Please try again.');
    return;
  }

  // The onSnapshot above renders this the moment Firestore accepts it, so
  // there is no optimistic append here -- that would double-render the message.
  input.value = '';

  try {
    await window.firebaseFirestore.addDoc(
      window.firebaseFirestore.collection(window.firebaseDb, 'messages'),
      {
        name: tenantName || userEmail.split('@')[0],
        email: userEmail,
        message: messageText,
        status: 'Unread',
        sender: 'tenant',
        createdAt: window.firebaseFirestore.serverTimestamp(),
        reply: null
      }
    );
  } catch (error) {
    // Restore what the tenant typed rather than silently discarding it.
    input.value = messageText;
    console.error('Firestore send message failed:', error);
    Toast.error('Could not send your message. Please try again.');
  }
}

window.addEventListener('load', function () {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

// ---------------------------------------------------------------------------
// Event delegation
//
// These controls were inline onclick/onkeypress attributes calling functions
// declared in a classic script. In a module those functions are not visible
// to inline handlers, so the markup now carries data-* attributes instead.
// ---------------------------------------------------------------------------

document.addEventListener('click', function (event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const tabTrigger = target.closest('[data-tab-target]');
  if (tabTrigger) {
    switchTab(tabTrigger.dataset.tabTarget, event);
    return;
  }

  const button = target.closest('[data-action]');
  if (!button) return;

  switch (button.dataset.action) {
    case 'logout':
      logout();
      break;
    case 'view-receipt':
      showReceiptModalForRecord(button.dataset.record);
      break;
    case 'send-message':
      sendMessage();
      break;
    case 'save-profile':
      saveProfile();
      break;
    case 'close-receipt-modal':
      closeReceiptModal();
      break;
    case 'print-receipt':
      printReceipt();
      break;
    default:
      break;
  }
});

document.addEventListener('keydown', function (event) {
  if (event.key !== 'Enter') return;
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest('[data-action="send-message"], #messageInput')) return;
  event.preventDefault();
  sendMessage();
});
