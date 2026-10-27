/**
 * PayMongo client service for HomeSpot.
 *
 * The PayMongo secret key is NEVER referenced here. Every gateway call is
 * proxied through Supabase Edge Functions, which hold the key server-side and
 * verify the caller's Supabase session.
 */

import { supabase } from './supabase-service.js';
import {
  deduplicatePayments,
  isValidPhilippinePhone,
  normalizePhilippinePhone
} from './lib/format.js';

export const PAYMONGO_CONFIG = {
  merchantName: 'MJP Residences',
  currency: 'PHP',
  supportedMethods: ['card', 'paymaya', 'grab_pay', 'gcash', 'qrph']
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
 * Calls the Supabase payment Edge Function using the current signed-in session.
 */
async function callBridge(endpoint, payload) {
  const parsedUrl = new URL(endpoint, 'https://homespot.invalid');
  const routes = {
    '/api/create-checkout': 'create-checkout',
    '/api/create-link': 'create-link',
    '/api/checkout-status': 'checkout-status',
    '/api/expire-checkout': 'expire-checkout',
    '/api/payment-intent-status': 'payment-intent-status',
    '/api/complete-qr-payment': 'complete-qr-payment'
  };
  const action = routes[parsedUrl.pathname];
  if (!action) throw new Error('Unsupported payment operation.');

  const id = parsedUrl.searchParams.get('id');
  const { data, error } = await supabase.functions.invoke('paymongo-api', {
    body: { action, ...(id ? { id } : {}), ...(payload || {}) }
  });
  if (error) {
    const detail =
      error.context instanceof Response ? await error.context.json().catch(() => ({})) : {};
    throw new Error(detail.error || error.message || 'Supabase payment request failed.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Reads a payment resource through the Supabase Edge Function.
 */
async function getFromBridge(endpoint) {
  return (await callBridge(endpoint, null))?.data || null;
}

/**
 * Queries Checkout Session status.
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
 * Retrieves Payment Intent status.
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

  const cleanPhone = isValidPhilippinePhone(tenantPhone)
    ? normalizePhilippinePhone(tenantPhone).replace(/^0/, '')
    : '';

  const requestBody = {
    amount,
    purpose: finalPurpose,
    notes: finalNotes,
    description: finalDescription,
    tenantName,
    tenantEmail,
    tenantPhone: cleanPhone,
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
    referenceNumber: session.attributes.reference_number || `PM-${session.id.slice(-6).toUpperCase()}`
  };
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
 * Retrieves only payment records visible to the current user's RLS policies.
 * @returns {Promise<Array>}
 */
export async function getTenantPayments() {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return [];

  const results = [];
  const seenRefs = new Set();

  // 1. Query relational payments table
  try {
    const { data: relPayments, error: relError } = await supabase
      .from('payments')
      .select('*')
      .or(`tenant_email.ilike.${session.user.email},tenant_uid.eq.${session.user.id}`)
      .order('created_at', { ascending: false });

    if (!relError && Array.isArray(relPayments)) {
      for (const p of relPayments) {
        const ref = p.reference_number || p.id;
        if (ref && !seenRefs.has(ref)) {
          seenRefs.add(ref);
          results.push({
            referenceNumber: ref,
            paymentMethodId: p.session_id || p.payment_intent_id || p.id,
            amount: parseFloat(p.amount) || 0,
            purpose: p.purpose || 'Monthly Rent',
            notes: p.notes || '',
            method: p.payment_method || 'PayMongo',
            status: p.status || 'Paid',
            tenantEmail: p.tenant_email,
            tenantName: p.tenant_name,
            createdAt: p.created_at,
            dateFormatted: new Date(p.created_at).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short'
            })
          });
        }
      }
    }
  } catch (err) {
    console.warn('Could not query payments table:', err);
  }

  // 2. Query app_documents for backward compatibility
  try {
    const { data: docPayments, error: docError } = await supabase
      .from('app_documents')
      .select('data')
      .eq('collection', 'payments')
      .order('created_at', { ascending: false });

    if (!docError && Array.isArray(docPayments)) {
      for (const row of docPayments) {
        const item = row.data;
        if (!item) continue;
        const ref = item.referenceNumber || item.reference_number || item.id;
        if (ref && !seenRefs.has(ref)) {
          seenRefs.add(ref);
          results.push(item);
        }
      }
    }
  } catch (err) {
    console.warn('Could not query app_documents payments:', err);
  }

  return deduplicatePayments(results);
}
