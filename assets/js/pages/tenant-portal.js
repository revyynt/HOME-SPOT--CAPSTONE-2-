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
 */

import { guardPage } from '../lib/guard.js';
import { getCurrentUser } from '../firebase-service.js';
import { interpretPaymentIntent } from '../lib/payment-return.js';
import * as PayMongo from '../paymongo-service.js';

// TODO(refactor): checkUrlPaymentReturn still carries its own parameter
// parsing and scenario cascade. The tested decision logic already exists in
// ../lib/payment-return.js (resolveReturnScenario / interpretCheckoutSession /
// buildReturnRecord / shouldExpireSession) and should replace it -- the pure
// function is covered by tests/payment-return.test.js. Only
// interpretPaymentIntent has been swapped in so far. Do this as one change,
// with a manual walkthrough of all four return paths.

// Hide the portal until the session check resolves.
document.documentElement.dataset.authPending = 'true';

guardPage({
  role: 'tenant',
  redirectTo: 'tenant-login.html',
  grantedEvent: 'tenant-access-granted'
}).then((allowed) => {
  if (!allowed) return;
  // The session email must belong to the verified account.
  const user = getCurrentUser();
  if (user && userEmail !== user.email) {
    userEmail = user.email || '';
    sessionStorage.setItem('tenantEmail', userEmail);
  }
});

// Content stays hidden until the Firebase auth guard resolves.

let userEmail = sessionStorage.getItem('tenantEmail') || '';
let tenantName = sessionStorage.getItem('tenantName') || 'Juan Dela Cruz';
let tenantPhone = sessionStorage.getItem('tenantPhone') || '+63 912 345 6789';
let tenantRoom = sessionStorage.getItem('tenantRoom') || 'Room 201';
let tenantDorm = sessionStorage.getItem('tenantDorm') || 'Triple Occupancy Room';
let tenantMoveIn = sessionStorage.getItem('tenantMoveInDate') || 'January 10, 2026';
let tenantRent = parseFloat(sessionStorage.getItem('tenantMonthlyRent')) || 5000;
let tenantEmergency = sessionStorage.getItem('tenantEmergencyContact') || '+63 923 456 7890';
let tenantDueDay = parseInt(sessionStorage.getItem('tenantDueDay')) || 5;
let currentTenantDocId = sessionStorage.getItem('tenantDocId') || null;

// Global State
let activeQrPaymentData = null;
let qrTimerInterval = null;
let qrStatusPollInterval = null;
let tenantExplicitAmountDueSet = false;

// Restore initial remaining due from session or local storage
let initialDue =
  sessionStorage.getItem('tenantAmountDue') ??
  localStorage.getItem('tenant_amount_due_' + userEmail);
let currentRemainingDue =
  initialDue !== null && !isNaN(parseFloat(initialDue)) ? parseFloat(initialDue) : tenantRent;
if (initialDue !== null && !isNaN(parseFloat(initialDue))) {
  tenantExplicitAmountDueSet = true;
}

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
          currentRemainingDue = parseFloat(docData.amountDue);
          tenantExplicitAmountDueSet = true;
          sessionStorage.setItem('tenantAmountDue', currentRemainingDue);
          localStorage.setItem('tenant_amount_due_' + userEmail, currentRemainingDue);
        }
        if (docData.emergencyContact) {
          tenantEmergency = docData.emergencyContact;
          sessionStorage.setItem('tenantEmergencyContact', docData.emergencyContact);
        }
        populateTenantUI();
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
  window.location.href = 'tenant-login.html';
}

function saveProfile() {
  alert('Profile updated successfully!');
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
    document.getElementById('fullName')?.value ||
    sessionStorage.getItem('tenantName') ||
    'Juan Dela Cruz';
  const tenantPhone = document.getElementById('phone')?.value || '+63 912 345 6789';

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
        tenantEmail: userEmail
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

// Initiate QR Ph flow with PayMongo.
//
// UNREACHABLE: nothing calls this, and it is the only thing that opens the QR
// modal -- so showQrModal/confirmQrPayment and the "I Have Completed Payment"
// button below are dead too. Left in place pending a decision: wire the QR
// method up, or delete the whole flow. See CONVERSION-SUMMARY.md.
// eslint-disable-next-line no-unused-vars
async function initiateQrPhFlow(amountVal, purpose, tenantName, tenantPhone) {
  // Always set activeQrPaymentData first so "I Have Completed Payment" always works
  const refNumber = 'PM-QR-' + Date.now().toString().slice(-6);
  activeQrPaymentData = {
    referenceNumber: refNumber,
    sessionId: '',
    checkoutUrl: '',
    paymentMethodId: 'pm_qr_' + Date.now().toString(36),
    method: 'QR Ph (GCash/Maya)',
    amount: amountVal,
    purpose: purpose,
    tenantName: tenantName,
    tenantEmail: userEmail,
    dateFormatted: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    status: 'Paid'
  };

  // Try to get a real PayMongo session (optional — QR works without it)
  try {
    // Ensure PayMongoService is ready
    const session = await PayMongo.createCheckoutSession({
      amount: amountVal,
      description: `${purpose} - MJP Residences (QR Ph)`,
      tenantName: tenantName,
      tenantEmail: userEmail,
      tenantPhone: tenantPhone,
      paymentMethodTypes: ['qrph'],
      successUrl: `${window.location.origin}${window.location.pathname}?payment=success&method=qrph&amount=${amountVal}&purpose=${encodeURIComponent(purpose)}`,
      cancelUrl: `${window.location.origin}${window.location.pathname}?payment=cancelled`
    });
    if (session && session.sessionId) {
      activeQrPaymentData.sessionId = session.sessionId;
      activeQrPaymentData.referenceNumber =
        session.referenceNumber || activeQrPaymentData.referenceNumber;
      activeQrPaymentData.paymentMethodId = session.sessionId;
    }
  } catch (e) {
    console.warn('PayMongo QR session (non-critical):', e.message);
  }

  showQrModal(activeQrPaymentData);
}

// Show PayMongo QR Ph Modal
function showQrModal(data) {
  document.getElementById('qrModalAmount').textContent =
    `₱${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  document.getElementById('qrModalRef').textContent = data.referenceNumber;

  // Always generate a proper QR Ph code using payment reference data
  const qrContent = PayMongo
    ? PayMongo.generateQrPhImageUrl({
        amount: data.amount,
        reference: data.referenceNumber,
        merchant: 'MJP Residences'
      })
    : `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent('PAYMONGO-QRPH-' + data.referenceNumber + '-' + data.amount)}`;
  document.getElementById('qrModalImage').src = qrContent;

  // Start 15 minute countdown timer
  let timeLeft = 15 * 60;
  const timerEl = document.getElementById('qrTimer');
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  qrTimerInterval = setInterval(() => {
    timeLeft--;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (timeLeft <= 0) {
      clearInterval(qrTimerInterval);
      closeQrModal();
      alert('Payment session expired. Please generate a new QR code.');
    }
  }, 1000);

  // Auto-poll PayMongo session status every 3 seconds to detect when paid in test mode
  if (qrStatusPollInterval) clearInterval(qrStatusPollInterval);
  if (data.sessionId && PayMongo?.getCheckoutSession) {
    qrStatusPollInterval = setInterval(async () => {
      try {
        const session = await PayMongo.getCheckoutSession(data.sessionId);
        if (session) {
          const payments = session.attributes?.payments || [];
          const isPaid = session.attributes?.status === 'paid' || payments.length > 0;
          if (isPaid) {
            clearInterval(qrStatusPollInterval);
            closeQrModal();
            if (payments.length > 0 && payments[0].id) {
              activeQrPaymentData.paymentMethodId = payments[0].id;
            }
            await saveAndFinalizePayment(activeQrPaymentData);
            activeQrPaymentData = null;
          }
        }
      } catch (err) {
        // ignore poll errors
      }
    }, 3000);
  }

  document.getElementById('paymongoQrModal').style.display = 'flex';
}

function closeQrModal() {
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  if (qrStatusPollInterval) clearInterval(qrStatusPollInterval);
  document.getElementById('paymongoQrModal').style.display = 'none';
}

// Confirm QR Payment — executes live PayMongo test charge, saves record and shows receipt
async function confirmQrPayment() {
  if (!activeQrPaymentData) return;
  if (qrStatusPollInterval) clearInterval(qrStatusPollInterval);

  const confirmBtn = document.getElementById('confirmQrBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = 'Processing in PayMongo...';
  }

  // Ensure PayMongo service is ready

  // Execute live test payment in PayMongo (creates real test payment visible in PayMongo Dashboard)
  let pmResult = null;
  try {
    if (PayMongo?.completeQrTestPayment) {
      pmResult = await PayMongo.completeQrTestPayment({
        amount: activeQrPaymentData.amount,
        description: `${activeQrPaymentData.purpose || 'Rent Payment'} - MJP Residences`,
        tenantName: activeQrPaymentData.tenantName,
        tenantEmail: activeQrPaymentData.tenantEmail
      });
    }
  } catch (err) {
    console.warn('PayMongo test payment warning:', err.message);
  }

  if (pmResult && pmResult.paymentId) {
    activeQrPaymentData.paymentMethodId = pmResult.paymentId;
    activeQrPaymentData.referenceNumber =
      pmResult.referenceNumber || 'PM-QR-' + pmResult.paymentId.slice(-6).toUpperCase();
    activeQrPaymentData.status = 'Paid';
  }

  closeQrModal();

  // Save to Firestore & localStorage, update balance, and show official receipt
  const recordToSave = { ...activeQrPaymentData };
  activeQrPaymentData = null;
  await saveAndFinalizePayment(recordToSave);
}

// Save & Finalize Payment Record — always saves to Firestore & localStorage
async function saveAndFinalizePayment(record) {
  // Ensure PayMongoService is available

  if (PayMongo?.savePaymentRecord) {
    try {
      await PayMongo.savePaymentRecord(record);
    } catch (e) {
      // Fallback: save directly to localStorage
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
  } else {
    // Direct localStorage save if service never loaded
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

  // Deduct from Amount Due & Persist
  currentRemainingDue = Math.max(0, currentRemainingDue - record.amount);
  tenantExplicitAmountDueSet = true;
  sessionStorage.setItem('tenantAmountDue', currentRemainingDue);
  localStorage.setItem('tenant_amount_due_' + userEmail, currentRemainingDue);

  // Update Firestore tenant document with current remaining due & payment status.
  // firestore.rules deliberately denies tenant writes here: a browser must
  // not be able to zero out its own balance. The authoritative balance is
  // reconciled server-side from the PayMongo webhook / by an admin, so a
  // permission error below is expected for tenants.
  if (currentTenantDocId && window.firebaseDb && window.firebaseFirestore) {
    try {
      const { doc, updateDoc, serverTimestamp } = window.firebaseFirestore;
      const tenantDocRef = doc(window.firebaseDb, 'tenants', currentTenantDocId);
      await updateDoc(tenantDocRef, {
        amountDue: currentRemainingDue,
        paymentStatus: currentRemainingDue <= 0 ? 'Paid' : 'Pending',
        lastPaymentDate: new Date().toISOString(),
        lastPaymentAmount: record.amount,
        lastPaymentReference: record.referenceNumber,
        updatedAt: serverTimestamp()
      });
    } catch (fsErr) {
      console.info('Balance left for server reconciliation:', fsErr.code || fsErr.message);
    }
  }

  // Update UI
  updateAmountDueUI();

  // Reset Form
  document.getElementById('paymentNotes').value = '';
  updateSubmitButton();

  // Refresh history table
  await loadTenantPaymentHistory();

  // Display Receipt
  showReceiptModal(record);
}

// Save Failed Payment Record — logs in Firestore & localStorage, refreshes history, shows Failed Receipt
async function saveFailedPayment(record) {
  if (PayMongo?.savePaymentRecord) {
    try {
      await PayMongo.savePaymentRecord(record);
    } catch (e) {
      // Fallback: save to localStorage
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
  }

  // Fire a synthetic payment.failed webhook event to our local server
  // so it appears in the admin webhook events log
  try {
    const webhookPayload = {
      data: {
        id: 'evt_homespot_' + Date.now(),
        attributes: {
          type: 'payment.failed',
          data: {
            id: record.paymentMethodId || 'pay_fail_' + Date.now(),
            attributes: {
              amount: Math.round(parseFloat(record.amount || 0) * 100),
              currency: 'PHP',
              description: record.purpose || 'Monthly Rent',
              failed_code: 'card_declined',
              failed_message:
                record.failureReason || 'Payment declined or 3DS authentication failed.',
              billing: {
                name: record.tenantName || 'Tenant',
                email: record.tenantEmail || ''
              }
            }
          }
        }
      }
    };
    const apiBase = window.location.origin.startsWith('file:')
      ? 'http://localhost:5050'
      : window.location.origin;
    fetch(`${apiBase}/api/paymongo-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    }).catch(() => {});
  } catch (_) {}

  // CRITICAL: For failed payment, do NOT deduct from currentRemainingDue!
  // Refresh history table so the failed record is immediately visible
  await loadTenantPaymentHistory();

  // Display Official Receipt in Failed Payment state
  showReceiptModal(record);
}

// Show Official Receipt Modal (Supports Paid & Failed states)
function showReceiptModal(record) {
  const isFailed =
    (record.status || '').toLowerCase().includes('fail') ||
    (record.status || '').toLowerCase().includes('declined') ||
    (record.status || '').toLowerCase().includes('cancel');

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

  document.getElementById('receiptTenantName').textContent = record.tenantName || 'Juan Dela Cruz';
  const residenceEl = document.getElementById('receiptResidence');
  if (residenceEl)
    residenceEl.textContent = `${tenantDorm || 'Triple Occupancy Room'} (${tenantRoom || 'Room 201'})`;
  document.getElementById('receiptPurpose').textContent = record.purpose || 'Monthly Rent';
  document.getElementById('receiptMethod').textContent = record.method || 'PayMongo Checkout';
  document.getElementById('receiptReference').textContent = record.referenceNumber || 'PM-REF';
  document.getElementById('receiptTokenId').textContent = record.paymentMethodId || 'pm_verified';
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
  } else {
    // Successful Payment Styling
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

  // If tenant document did not have an explicit amountDue set in Firestore,
  // calculate remaining amount due from existing payment records
  if (!tenantExplicitAmountDueSet && payments && payments.length > 0) {
    const totalPaid = payments
      .filter((p) => p.status === 'Paid')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    if (totalPaid >= tenantRent) {
      currentRemainingDue = 0;
    } else if (totalPaid > 0) {
      currentRemainingDue = Math.max(0, tenantRent - totalPaid);
    }
    sessionStorage.setItem('tenantAmountDue', currentRemainingDue);
    localStorage.setItem('tenant_amount_due_' + userEmail, currentRemainingDue);
    updateAmountDueUI();
  } else {
    updateAmountDueUI();
  }

  if (!payments || payments.length === 0) {
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
    countBadge.textContent = `${payments.length} payment${payments.length > 1 ? 's' : ''}`;

  tableBody.innerHTML = payments
    .map((p, idx) => {
      const isFailed =
        (p.status || '').toLowerCase().includes('fail') ||
        (p.status || '').toLowerCase().includes('declined') ||
        (p.status || '').toLowerCase().includes('cancel');
      const isPending = (p.status || '').toLowerCase() === 'pending';
      const statusBadge = isFailed
        ? `<span class="status-badge-failed">✗ Failed</span>`
        : isPending
          ? `<span class="status-badge-pending">⏱ Pending</span>`
          : `<span class="status-badge-paid">✓ Paid</span>`;
      const amountColor = isFailed ? '#dc2626' : isPending ? '#b45309' : '#059669';

      return `
        <tr>
            <td>${p.dateFormatted || new Date(p.timestamp || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
            <td style="font-family: monospace; font-size: 12px; color: #475569;">${p.referenceNumber || 'PM-' + idx}</td>
            <td>${p.purpose || 'Monthly Rent'}</td>
            <td>${p.method || 'PayMongo'}</td>
            <td style="font-weight: 600; color: ${amountColor};">₱${parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-view-receipt" onclick='showReceiptModal(${JSON.stringify(p).replace(/'/g, '&apos;')})'>
                    Receipt
                </button>
            </td>
        </tr>
        `;
    })
    .join('');
}

// Check for return from PayMongo (Direct 3DS Card Intent OR Hosted Checkout Session)
async function checkUrlPaymentReturn() {
  // Ensure PayMongoService is ready

  const urlParams = new URLSearchParams(window.location.search);
  let paymentIntentId = urlParams.get('payment_intent_id');
  if (!paymentIntentId) {
    const match = window.location.href.match(/[?&]payment_intent_id=([^&#]+)/);
    if (match) {
      paymentIntentId = decodeURIComponent(match[1]);
    }
  }

  let paymentStatus = urlParams.get('payment');
  if (!paymentStatus) {
    const matchStatus = window.location.href.match(/[?&]payment=([^&#]+)/);
    if (matchStatus) {
      paymentStatus = decodeURIComponent(matchStatus[1]);
    }
  }

  // Read pending payment from BOTH storages (localStorage survives more edge cases)
  let pending = null;
  try {
    const saved =
      sessionStorage.getItem('pending_paymongo_payment') ||
      localStorage.getItem('pending_paymongo_payment');
    if (saved) pending = JSON.parse(saved);
  } catch (e) {}

  console.log(
    '[PayReturn] URL params - paymentIntentId:',
    paymentIntentId,
    '| paymentStatus:',
    paymentStatus,
    '| pending:',
    pending
  );

  // If neither param found in URL, but we have pending direct 3DS payment and we just returned to tenant portal
  if (!paymentIntentId && !paymentStatus && pending?.paymentIntentId) {
    paymentIntentId = pending.paymentIntentId;
  }

  // SCENARIO: Returned from PayMongo hosted checkout with no URL params
  // This happens when card is declined or 3DS fails — PayMongo doesn't always redirect to cancel_url.
  // Detect via pending checkout sessionId and fetch the actual session status from PayMongo.
  if (!paymentIntentId && !paymentStatus && pending?.sessionId) {
    console.log('[PayReturn] Checking pending checkout session:', pending.sessionId);
    const sessionId = pending.sessionId;
    sessionStorage.removeItem('pending_paymongo_payment');
    localStorage.removeItem('pending_paymongo_payment');

    let sessionStatus = null;
    let failureDetail = 'Card declined or 3DS authentication failed.';
    try {
      if (PayMongo?.getCheckoutSession) {
        const sessionData = await PayMongo.getCheckoutSession(sessionId);
        console.log('[PayReturn] Session data:', sessionData);
        if (sessionData) {
          sessionStatus = sessionData.attributes?.status;
          const lastErr = sessionData.attributes?.payment_intent?.attributes?.last_payment_error;
          if (lastErr && (lastErr.failed_message || lastErr.detail)) {
            failureDetail = lastErr.failed_message || lastErr.detail;
          }
        }
      }
    } catch (e) {
      console.warn('[PayReturn] Could not inspect checkout session:', e);
    }

    console.log('[PayReturn] Session status:', sessionStatus, '| failureDetail:', failureDetail);

    if (sessionStatus === 'paid') {
      const amountParam2 = parseFloat(pending?.amount) || 5000;
      const purposeParam2 = pending?.purpose || 'Monthly Rent';
      const tenantNameVal2 =
        pending?.tenantName || sessionStorage.getItem('tenantName') || 'Tenant';
      const refNumber2 = pending?.referenceNumber || 'PM-RET-' + Date.now().toString().slice(-6);
      const record2 = {
        referenceNumber: refNumber2,
        paymentMethodId: sessionId,
        method: pending?.method || 'PayMongo Checkout',
        amount: amountParam2,
        purpose: purposeParam2,
        notes: pending?.notes || 'Completed via PayMongo Checkout',
        tenantName: tenantNameVal2,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Paid'
      };
      window.history.replaceState({}, document.title, window.location.pathname);
      switchTab('payment');
      await saveAndFinalizePayment(record2);
    } else {
      // Session not paid — card was declined or 3DS failed
      const amountParam2 = parseFloat(pending?.amount) || 5000;
      const purposeParam2 = pending?.purpose || 'Monthly Rent';
      const tenantNameVal2 =
        pending?.tenantName || sessionStorage.getItem('tenantName') || 'Tenant';
      const refNumber2 = pending?.referenceNumber || 'PM-FAIL-' + Date.now().toString().slice(-6);
      const record2 = {
        referenceNumber: refNumber2,
        paymentMethodId: sessionId,
        method: pending?.method || 'Credit/Debit Card (PayMongo Checkout)',
        amount: amountParam2,
        purpose: purposeParam2,
        notes: pending?.notes || 'Card declined / 3DS authentication failed',
        failureReason: failureDetail,
        tenantName: tenantNameVal2,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Failed'
      };
      window.history.replaceState({}, document.title, window.location.pathname);
      switchTab('payment');
      // Save receipt first, then expire session in background (non-blocking)
      await saveFailedPayment(record2);
      // Fire-and-forget: expire session in PayMongo dashboard
      if (PayMongo?.expireCheckoutSession && sessionStatus !== 'expired') {
        PayMongo.expireCheckoutSession(sessionId).catch(() => {});
      }
    }
    return;
  }

  // If neither parameter is present and no pending, nothing to do
  if (!paymentIntentId && !paymentStatus) return;

  sessionStorage.removeItem('pending_paymongo_payment');
  localStorage.removeItem('pending_paymongo_payment');

  const amountParam = parseFloat(urlParams.get('amount')) || pending?.amount || 5000;
  const purposeParam = urlParams.get('purpose') || pending?.purpose || 'Monthly Rent';
  const tenantNameVal =
    pending?.tenantName ||
    document.getElementById('fullName')?.value ||
    sessionStorage.getItem('tenantName') ||
    'Juan Dela Cruz';

  // SCENARIO 1: RETURN FROM DIRECT CARD 3DS TEST
  if (paymentIntentId) {
    let piData = null;
    try {
      piData = await PayMongo.getPaymentIntentStatus(paymentIntentId);
    } catch (err) {
      console.warn('Could not inspect payment intent:', err);
    }

    // Fails closed: only an explicit "succeeded" counts as paid.
    const { isSuccess, failureDetail } = interpretPaymentIntent(piData);

    const refNumber =
      pending?.referenceNumber || 'PM-CARD-' + paymentIntentId.slice(-6).toUpperCase();

    // Remove query parameters from URL without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
    switchTab('payment');

    if (isSuccess) {
      const record = {
        referenceNumber: refNumber,
        paymentMethodId: paymentIntentId,
        method: 'Credit/Debit Card (PayMongo Test 3DS)',
        amount: amountParam,
        purpose: purposeParam,
        notes: pending?.notes || 'Paid via PayMongo 3DS Card Payment',
        tenantName: tenantNameVal,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Paid'
      };
      await saveAndFinalizePayment(record);
    } else {
      const record = {
        referenceNumber: refNumber,
        paymentMethodId: paymentIntentId,
        method: 'Credit/Debit Card (PayMongo Test 3DS)',
        amount: amountParam,
        purpose: purposeParam,
        notes: pending?.notes || 'PayMongo 3DS Test Failed / Declined',
        failureReason: failureDetail,
        tenantName: tenantNameVal,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Failed'
      };
      await saveFailedPayment(record);
    }
    return;
  }

  // SCENARIO 2: RETURN FROM PAYMONGO HOSTED CHECKOUT (SUCCESS)
  if (paymentStatus === 'success') {
    const methodParam = urlParams.get('method') || pending?.method || 'PayMongo Checkout';
    const refNumber = pending?.referenceNumber || 'PM-RET-' + Date.now().toString().slice(-6);
    const record = {
      referenceNumber: refNumber,
      paymentMethodId: pending?.sessionId || 'pm_success_' + Date.now().toString(36),
      method: methodParam,
      amount: amountParam,
      purpose: purposeParam,
      notes: pending?.notes || 'Completed via PayMongo Official Checkout',
      tenantName: tenantNameVal,
      tenantEmail: userEmail,
      dateFormatted: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
      status: 'Paid'
    };

    window.history.replaceState({}, document.title, window.location.pathname);
    switchTab('payment');
    await saveAndFinalizePayment(record);
  }
  // SCENARIO 3: RETURN FROM PAYMONGO HOSTED CHECKOUT (FAILED OR CANCELLED via cancel_url)
  else if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
    const sessionId = pending?.sessionId || urlParams.get('sessionId') || '';
    let failureDetail = 'Payment declined / 3DS authentication failed on PayMongo';

    console.log('[PayReturn] Scenario 3 - failed/cancelled. sessionId:', sessionId);

    if (sessionId && PayMongo) {
      try {
        const sessionData = await PayMongo.getCheckoutSession(sessionId);
        console.log('[PayReturn] Scenario 3 session data:', sessionData);
        if (sessionData) {
          const lastErr = sessionData.attributes?.payment_intent?.attributes?.last_payment_error;
          if (lastErr && (lastErr.failed_message || lastErr.detail)) {
            failureDetail = lastErr.failed_message || lastErr.detail;
          }
        }
      } catch (err) {
        console.warn('[PayReturn] Scenario 3 getCheckoutSession error:', err);
      }
    }

    const refNumber = pending?.referenceNumber || 'PM-FAIL-' + Date.now().toString().slice(-6);
    const record = {
      referenceNumber: refNumber,
      paymentMethodId: sessionId || 'pm_failed_' + Date.now().toString(36),
      method: pending?.method || 'Credit/Debit Card (PayMongo Checkout)',
      amount: amountParam,
      purpose: purposeParam,
      notes: pending?.notes || 'PayMongo Checkout: 3DS Test Failed / Cancelled',
      failureReason: failureDetail,
      tenantName: tenantNameVal,
      tenantEmail: userEmail,
      dateFormatted: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
      status: 'Failed'
    };

    window.history.replaceState({}, document.title, window.location.pathname);
    switchTab('payment');
    // Save receipt FIRST — non-blocking expire after
    await saveFailedPayment(record);
    // Fire-and-forget: expire session so PayMongo dashboard shows it as expired
    if (sessionId && PayMongo?.expireCheckoutSession) {
      PayMongo.expireCheckoutSession(sessionId).catch(() => {});
    }
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  updateSubmitButton();
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

function sendMessage() {
  const input = document.getElementById('messageInput');
  const messageText = input.value.trim();
  if (!messageText) return;

  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message-bubble sent';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  messageDiv.innerHTML = `
        <div>${messageText}</div>
        <div class="message-time-stamp">Today, ${timeStr}</div>
    `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  input.value = '';

  const tenantName = sessionStorage.getItem('tenantName') || userEmail.split('@')[0] || 'Tenant';

  if (window.firebaseDb && window.firebaseFirestore) {
    try {
      const messagesRef = window.firebaseFirestore.collection(window.firebaseDb, 'messages');
      window.firebaseFirestore.addDoc(messagesRef, {
        name: tenantName,
        email: userEmail,
        message: messageText,
        status: 'Unread',
        sender: 'tenant',
        createdAt: window.firebaseFirestore.serverTimestamp(),
        reply: null
      });
    } catch (error) {
      console.error('Firestore send message failed:', error);
    }
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
    case 'send-message':
      sendMessage();
      break;
    case 'save-profile':
      saveProfile();
      break;
    case 'close-qr-modal':
      closeQrModal();
      break;
    case 'confirm-qr-payment':
      confirmQrPayment();
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
