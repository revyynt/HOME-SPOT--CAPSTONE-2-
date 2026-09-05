/**
 * PayMongo Payment Service for HomeSpot MJP Residences
 * Configured with Test PayMongo API Credentials
 */

export const PAYMONGO_CONFIG = {
  publicKey: 'pk_test_gsoWoMD6Ww41rrbHmYz1Jm8n',
  secretKey: 'sk_test_W88PSSzUqwSr3hobvsUyaZK5',
  apiBaseUrl: 'https://api.paymongo.com/v1',
  merchantName: 'MJP Residences (GAVIÑO, RENZ ALEX ZANDER ENRIQUEZ)',
  currency: 'PHP',
  supportedMethods: ['card', 'paymaya', 'grab_pay', 'dob', 'qrph', 'billease']
};

/**
 * Basic Auth Header Generator
 * @param {string} key 
 * @returns {string}
 */
function getBasicAuthHeader(key) {
  return 'Basic ' + btoa(key + ':');
}

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
 * Creates a PayMongo Checkout Session
 * Allows tenant to pay via GCash, Maya, Cards, QR Ph, GrabPay, Billease
 * 
 * @param {Object} options
 * @param {number} options.amount - Amount in Pesos
 * @param {string} options.description - Payment description
 * @param {string} options.tenantName - Tenant name
 * @param {string} options.tenantEmail - Tenant email
 * @param {string} options.tenantPhone - Tenant phone
 * @param {string} options.successUrl - Redirect URL after payment
 * @param {string} options.cancelUrl - Redirect URL on cancel
 * @returns {Promise<{checkoutUrl: string, sessionId: string, referenceNumber: string}>}
 */
export async function createCheckoutSession({
  amount,
  description = 'Rent Payment',
  tenantName = '',
  tenantEmail = '',
  tenantPhone = '',
  successUrl,
  cancelUrl
}) {
  const amountCentavos = toCentavos(amount);

  const payload = {
    data: {
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: description,
        line_items: [
          {
            currency: 'PHP',
            amount: amountCentavos,
            name: description,
            quantity: 1
          }
        ],
        payment_method_types: PAYMONGO_CONFIG.supportedMethods,
        billing: {
          name: tenantName || undefined,
          email: tenantEmail || undefined,
          phone: tenantPhone || undefined
        },
        success_url: successUrl || `${window.location.origin}${window.location.pathname}?payment=success&amount=${amount}&purpose=${encodeURIComponent(description)}`,
        cancel_url: cancelUrl || `${window.location.origin}${window.location.pathname}?payment=cancelled`
      }
    }
  };

  const response = await fetch(`${PAYMONGO_CONFIG.apiBaseUrl}/checkout_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getBasicAuthHeader(PAYMONGO_CONFIG.secretKey)
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.errors?.[0]?.detail || `PayMongo API Error (${response.status})`;
    throw new Error(errMsg);
  }

  const result = await response.json();
  const session = result.data;
  return {
    checkoutUrl: session.attributes.checkout_url,
    sessionId: session.id,
    referenceNumber: session.attributes.reference_number || session.id.replace('cs_', 'REF-')
  };
}

/**
 * Creates a PayMongo Payment Link
 * 
 * @param {Object} options
 * @param {number} options.amount - Amount in Pesos
 * @param {string} options.description - Purpose or description
 * @param {string} options.remarks - Additional notes
 * @returns {Promise<{checkoutUrl: string, linkId: string, referenceNumber: string}>}
 */
export async function createPaymentLink({
  amount,
  description = 'Rent Payment',
  remarks = 'HomeSpot MJP Residences'
}) {
  const amountCentavos = toCentavos(amount);

  const payload = {
    data: {
      attributes: {
        amount: amountCentavos,
        description: description,
        remarks: remarks
      }
    }
  };

  const response = await fetch(`${PAYMONGO_CONFIG.apiBaseUrl}/links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getBasicAuthHeader(PAYMONGO_CONFIG.secretKey)
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.errors?.[0]?.detail || `PayMongo Link Error (${response.status})`;
    throw new Error(errMsg);
  }

  const result = await response.json();
  const link = result.data;
  return {
    checkoutUrl: link.attributes.checkout_url,
    linkId: link.id,
    referenceNumber: link.attributes.reference_number
  };
}

/**
 * Creates a PayMongo Payment Method (client-side tokenization with Public Key)
 * Supported for: 'qrph', 'card'
 * 
 * @param {Object} options
 * @param {'qrph'|'card'} options.type
 * @param {Object} [options.details] - Card details if type === 'card'
 * @param {Object} [options.billing] - Billing details (name, email, phone)
 * @returns {Promise<Object>}
 */
export async function createPaymentMethod({ type = 'qrph', details, billing }) {
  const attributes = { type };
  if (details) attributes.details = details;
  if (billing) attributes.billing = billing;

  const response = await fetch(`${PAYMONGO_CONFIG.apiBaseUrl}/payment_methods`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getBasicAuthHeader(PAYMONGO_CONFIG.publicKey)
    },
    body: JSON.stringify({
      data: { attributes }
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.errors?.[0]?.detail || `PayMongo Error: ${response.statusText}`;
    throw new Error(errMsg);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Generates QR image URL for QR Ph / GCash / Maya scan
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.reference
 * @param {string} params.merchant
 * @returns {string}
 */
export function generateQrPhImageUrl({ amount, reference, merchant }) {
  const qrData = `00020101021226480010ph.paymongo0116org_zkkmxbeiEM8u5204000053036085406${amount}5802PH5925${encodeURIComponent(merchant || 'MJP RESIDENCES')}6006MANILA62190515${reference}6304`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(qrData)}`;
}

/**
 * Saves a payment transaction to Firestore and LocalStorage
 * @param {Object} paymentRecord
 * @returns {Promise<{id: string, ...paymentRecord}>}
 */
export async function savePaymentRecord(paymentRecord) {
  const record = {
    ...paymentRecord,
    timestamp: new Date().toISOString(),
    status: paymentRecord.status || 'Paid',
    merchant: PAYMONGO_CONFIG.merchantName,
    organizationId: 'org_zkkmxbeiEM8uRbHWesbNPFrx'
  };

  // 1. Try saving to Firestore if initialized
  try {
    if (window.firebaseDb && window.firebaseFirestore) {
      const { collection, addDoc, serverTimestamp } = window.firebaseFirestore;
      const paymentsRef = collection(window.firebaseDb, 'payments');
      const docRef = await addDoc(paymentsRef, {
        ...record,
        createdAt: serverTimestamp()
      });
      record.firestoreId = docRef.id;
    }
  } catch (err) {
    console.warn('Firestore payment save error (falling back to cache):', err);
  }

  // 2. Always persist to localStorage cache
  try {
    const cacheKey = `tenant_payments_${record.tenantEmail || 'guest'}`;
    const existing = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    existing.unshift(record);
    localStorage.setItem(cacheKey, JSON.stringify(existing));

    // Also update a global payments registry for admin convenience
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
 * Retrieves payment history for a tenant
 * @param {string} tenantEmail
 * @returns {Promise<Array>}
 */
export async function getTenantPayments(tenantEmail) {
  const cacheKey = `tenant_payments_${tenantEmail || 'guest'}`;
  let payments = [];

  // Try localStorage first for instant display
  try {
    const local = localStorage.getItem(cacheKey);
    if (local) {
      payments = JSON.parse(local);
    }
  } catch (e) {
    console.error(e);
  }

  // Then try fetching live from Firestore
  try {
    if (window.firebaseDb && window.firebaseFirestore) {
      const { collection, query, where, getDocs } = window.firebaseFirestore;
      if (getDocs) {
        const paymentsRef = collection(window.firebaseDb, 'payments');
        const q = query(
          paymentsRef,
          where('tenantEmail', '==', tenantEmail)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const firestorePayments = [];
          snapshot.forEach(doc => {
            firestorePayments.push({ id: doc.id, ...doc.data() });
          });
          if (firestorePayments.length > 0) {
            payments = firestorePayments;
            localStorage.setItem(cacheKey, JSON.stringify(payments));
          }
        }
      }
    }
  } catch (err) {
    console.log('Using cached payments:', err.message);
  }

  return payments;
}

// Make globally accessible for scripts that do not use modules
window.PayMongoService = {
  PAYMONGO_CONFIG,
  formatPHP,
  toCentavos,
  createCheckoutSession,
  createPaymentLink,
  createPaymentMethod,
  generateQrPhImageUrl,
  savePaymentRecord,
  getTenantPayments
};
