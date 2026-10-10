/**
 * PayMongo client service for HomeSpot.
 *
 * The PayMongo secret key is NEVER referenced here. Every gateway call is
 * proxied through paymongo-api-server.js, which holds the key server-side and
 * verifies the caller's Firebase ID token.
 */

export const PAYMONGO_CONFIG = {
  merchantName: 'MJP Residences',
  currency: 'PHP',
  supportedMethods: ['card', 'paymaya', 'grab_pay', 'qrph']
};

/**
 * Formats PHP currency
 * @param {number} amount in Pesos
 * @returns {string}
 */
export function formatPHP(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Converts Pesos to Centavos (PayMongo amount unit)
 * @param {number|string} amountInPesos
 * @returns {number}
 */
export function toCentavos(amountInPesos) {
  return Math.round(parseFloat(amountInPesos) * 100);
}

/**
 * Candidate hosts for the HomeSpot payment bridge.
 * Only the same-origin page host and the known local dev ports.
 */
function apiCandidates() {
  const candidates = [
    'http://localhost:5050',
    'http://127.0.0.1:5050',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin && !origin.startsWith('file:') && !candidates.includes(origin)) {
    candidates.push(origin);
  }
  return candidates;
}

/**
 * Reads a Firebase ID token for the signed-in user.
 * The bridge rejects any /api/* request without one.
 */
async function getAuthHeaders() {
  const token = await window.firebaseService?.getIdToken?.();
  if (!token) {
    throw new Error('You must be signed in to make a payment.');
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

class PaymentApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PaymentApiError';
    this.status = status;
  }
}

/**
 * POSTs to the payment bridge, trying each candidate host in turn.
 * A 401/403 is a real auth decision and is surfaced immediately rather than
 * being retried against the next host.
 */
async function callBridge(endpoint, payload, method = 'POST') {
  const headers = await getAuthHeaders();
  const candidates = apiCandidates();
  let lastNetworkError = null;

  for (const base of candidates) {
    let res;
    try {
      res = await fetch(`${base}${endpoint}`, {
        method,
        headers,
        body: method === 'GET' ? undefined : JSON.stringify(payload)
      });
    } catch (e) {
      // Connection refused / host unreachable -> try the next candidate.
      lastNetworkError = e;
      continue;
    }

    // Static dev servers without this route.
    if (res.status === 404 || res.status === 405) continue;

    const json = await res.json().catch(() => ({}));

    if (res.ok) return json;

    if (res.status === 401 || res.status === 403) {
      throw new PaymentApiError(
        json.error || 'Payment request was rejected. Please sign in again.',
        res.status
      );
    }

    throw new PaymentApiError(
      json.errors?.[0]?.detail || json.error || `Payment gateway error (${res.status})`,
      res.status
    );
  }

  if (lastNetworkError) {
    throw new Error(
      'Cannot reach the HomeSpot payment server. Start it with: node paymongo-api-server.js'
    );
  }
  throw new Error('Payment server is unavailable.');
}

/**
 * GETs from the payment bridge.
 */
async function getFromBridge(endpoint) {
  const headers = await getAuthHeaders();

  for (const base of apiCandidates()) {
    let res;
    try {
      res = await fetch(`${base}${endpoint}`, { method: 'GET', headers });
    } catch (e) {
      continue;
    }
    if (res.status === 404 || res.status === 405) continue;
    if (res.status === 401 || res.status === 403) {
      throw new PaymentApiError(
        (await res.json().catch(() => ({}))).error || 'Not authorized.',
        res.status
      );
    }
    if (!res.ok) continue;
    const json = await res.json();
    return json.data;
  }

  return null;
}

/**
 * Queries Checkout Session status via the bridge.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function getCheckoutSession(sessionId) {
  if (!sessionId) return null;
  return getFromBridge(`/api/checkout-status?id=${encodeURIComponent(sessionId)}`);
}

/**
 * Expires a Checkout Session.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function expireCheckoutSession(sessionId) {
  if (!sessionId) return null;
  return callBridge(`/api/expire-checkout?id=${encodeURIComponent(sessionId)}`, null);
}

/**
 * Retrieves Payment Intent status via the bridge.
 * @param {string} paymentIntentId
 * @returns {Promise<Object|null>}
 */
export async function getPaymentIntentStatus(paymentIntentId) {
  if (!paymentIntentId) return null;
  return getFromBridge(`/api/payment-intent-status?id=${encodeURIComponent(paymentIntentId)}`);
}

/**
 * Creates a PayMongo Checkout Session.
 *
 * @param {Object} options
 * @param {number} options.amount - Amount in Pesos
 * @param {string} options.description - Payment description
 * @param {string} options.tenantName - Tenant name
 * @param {string} options.tenantEmail - Tenant email
 * @param {string} options.tenantPhone - Tenant phone
 * @param {Array<string>} [options.paymentMethodTypes]
 * @param {string} [options.successUrl]
 * @param {string} [options.cancelUrl]
 * @returns {Promise<{checkoutUrl: string, sessionId: string, referenceNumber: string}>}
 */
export async function createCheckoutSession({
  amount,
  purpose = 'Monthly Rent',
  notes = '',
  description,
  tenantName = '',
  tenantEmail = '',
  tenantPhone = '',
  paymentMethodTypes = PAYMONGO_CONFIG.supportedMethods,
  successUrl,
  cancelUrl
}) {
  const finalPurpose = purpose || description || 'Monthly Rent';
  const finalNotes = (notes || '').trim();
  const finalDescription =
    description ||
    (finalNotes
      ? `${finalPurpose} (${finalNotes}) - ${PAYMONGO_CONFIG.merchantName}`
      : `${finalPurpose} - ${PAYMONGO_CONFIG.merchantName}`);

  const currentOrigin =
    typeof window !== 'undefined' && window.location && !window.location.origin.startsWith('file:')
      ? window.location.origin
      : 'http://localhost:5050';
  const currentPath =
    typeof window !== 'undefined' && window.location
      ? window.location.pathname
      : '/tenant-portal.html';

  const requestBody = {
    amount,
    purpose: finalPurpose,
    notes: finalNotes,
    description: finalDescription,
    tenantName,
    tenantEmail,
    tenantPhone,
    payment_method_types: (paymentMethodTypes || PAYMONGO_CONFIG.supportedMethods).filter(
      (m) => m !== 'dob' && m !== 'billease'
    ),
    successUrl:
      successUrl ||
      `${currentOrigin}${currentPath}?payment=success&amount=${amount}&purpose=${encodeURIComponent(finalPurpose)}`,
    cancelUrl:
      cancelUrl ||
      `${currentOrigin}${currentPath}?payment=failed&amount=${amount}&purpose=${encodeURIComponent(finalPurpose)}`
  };

  const res = await callBridge('/api/create-checkout', requestBody);

  if (!res || !res.data) {
    throw new Error(res?.error || 'Payment gateway did not return a checkout session.');
  }

  const session = res.data;
  if (!session.attributes?.checkout_url) {
    throw new Error('Payment gateway did not return a checkout URL.');
  }

  return {
    checkoutUrl: session.attributes.checkout_url,
    sessionId: session.id,
    referenceNumber: session.attributes.reference_number || session.id.replace('cs_', 'REF-')
  };
}

/**
 * Settles a QR Ph payment.
 *
 * This is only available when the bridge is explicitly started with
 * ALLOW_TEST_AUTO_CHARGE=true. In every other configuration QR payments settle
 * through the PayMongo redirect or webhook and this call surfaces the error --
 * it never invents a successful payment.
 *
 * @returns {Promise<{success: boolean, paymentId: string, referenceNumber: string, amount: number}>}
 */
export async function completeQrTestPayment({ amount, description = 'Rent Payment' }) {
  const res = await callBridge('/api/complete-qr-payment', { amount, description });

  if (res && res.success && typeof res.paymentId === 'string' && res.paymentId.startsWith('pay_')) {
    return res;
  }

  throw new Error(res?.error || 'QR payment could not be settled.');
}

/**
 * Generates QR image URL for QR Ph / GCash / Maya scan.
 * @param {Object} params
 * @returns {string}
 */
export function generateQrPhImageUrl({ amount, reference, merchant }) {
  const qrData = `00020101021226480010ph.paymongo5204000053036085406${amount}5802PH5925${encodeURIComponent(merchant || PAYMONGO_CONFIG.merchantName.toUpperCase())}6006MANILA62190515${reference}6304`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(qrData)}`;
}

/**
 * Saves a payment transaction to Firestore and LocalStorage.
 *
 * Note: this is a local convenience cache only. Firestore rules reject writes
 * here from the browser, so the localStorage mirror is what the portal reads.
 * Authoritative payment state comes from the PayMongo webhook.
 *
 * @param {Object} paymentRecord
 * @returns {Promise<{id: string, ...paymentRecord}>}
 */
export async function savePaymentRecord(paymentRecord) {
  const record = {
    ...paymentRecord,
    timestamp: new Date().toISOString(),
    status: paymentRecord.status || 'Paid',
    merchant: PAYMONGO_CONFIG.merchantName
  };

  try {
    const cacheKey = `tenant_payments_${record.tenantEmail || 'guest'}`;
    const existing = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    existing.unshift(record);
    localStorage.setItem(cacheKey, JSON.stringify(existing));

    const allKey = 'all_tenant_payments';
    const all = JSON.parse(localStorage.getItem(allKey) || '[]');
    all.unshift(record);
    localStorage.setItem(allKey, JSON.stringify(all));
  } catch (err) {
    console.error('LocalStorage save error:', err);
  }

  return record;
}

/**
 * Retrieves payment history for a tenant from the local cache.
 * @param {string} tenantEmail
 * @returns {Promise<Array>}
 */
export async function getTenantPayments(tenantEmail) {
  const cacheKey = `tenant_payments_${tenantEmail || 'guest'}`;
  try {
    const local = localStorage.getItem(cacheKey);
    return local ? JSON.parse(local) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

// Make globally accessible for scripts that do not use modules
if (typeof window !== 'undefined') {
  window.PayMongoService = {
    PAYMONGO_CONFIG,
    formatPHP,
    toCentavos,
    createCheckoutSession,
    getCheckoutSession,
    expireCheckoutSession,
    getPaymentIntentStatus,
    completeQrTestPayment,
    generateQrPhImageUrl,
    savePaymentRecord,
    getTenantPayments
  };
}